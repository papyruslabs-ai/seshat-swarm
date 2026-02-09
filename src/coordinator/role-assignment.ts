/**
 * Seshat Swarm — Role Assignment Module
 *
 * Dynamic assignment of chi (formation role) values based on swarm needs.
 *
 * Roles are coordinates, not chassis (Principle #3). Any drone can play any
 * role. This module implements priority-ordered rules that assign roles based
 * on battery, position, formation requirements, and coverage needs.
 *
 * Priority order (highest first):
 *   1. Safety: low battery -> charger-inbound (non-negotiable)
 *   2. Charging complete: battery >= return threshold -> charger-outbound
 *   3. Charger outbound: airborne -> performer or reserve
 *   4. Relay assignment: coverage needs
 *   5. Leader assignment: formation needs
 *   6. Performer filling: promote reserves
 *   7. Excess performers: demote to reserve (fairness)
 *   8. Hysteresis: suppress oscillation (except safety overrides)
 */

import type { WorldModel, DroneState } from './world-model.js';
import { vec3Distance } from './world-model.js';
import type { FormationRole, Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Formation specification -- what shape and how many drones. */
export interface FormationSpec {
  /** Minimum number of performers needed */
  minPerformers: number;
  /** Whether a leader is required */
  needsLeader: boolean;
  /** Formation center position */
  center: Vec3;
}

/** Coverage specification -- relay and positioning needs. */
export interface CoverageSpec {
  /** Boundary of Lighthouse coverage (simplified as radius from origin) */
  coverageRadius: number;
  /** Whether relay drones are needed at the boundary */
  needsRelay: boolean;
}

/** Role assignment configuration. */
export interface RoleAssignmentConfig {
  /** Battery threshold to force charger-inbound (0-1). Default: 0.15 */
  batteryChargeThreshold: number;
  /** Battery threshold to allow returning from charging (0-1). Default: 0.90 */
  batteryReturnThreshold: number;
  /** How many ticks a role must be held before it can change (anti-oscillation). Default: 10 */
  roleHysteresisTickCount: number;
}

export const DEFAULT_ROLE_CONFIG: RoleAssignmentConfig = {
  batteryChargeThreshold: 0.15,
  batteryReturnThreshold: 0.90,
  roleHysteresisTickCount: 10,
};

// ---------------------------------------------------------------------------
// Charging-related role set
// ---------------------------------------------------------------------------

/** Roles that are part of the charging lifecycle. Safety rule 1 does not apply. */
const CHARGING_ROLES: ReadonlySet<FormationRole> = new Set<FormationRole>([
  'charging',
  'charger-inbound',
  'charger-outbound',
]);

/** Sigma values indicating the drone is on the ground or docked (not airborne). */
const GROUNDED_SIGMA = new Set(['grounded', 'docked']);

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Assign roles to all active drones based on current state and requirements.
 * Returns a map of droneId -> new FormationRole.
 *
 * Only returns entries for drones whose role should CHANGE.
 * Drones keeping their current role are not included.
 */
export function assignRoles(
  world: WorldModel,
  formation: FormationSpec,
  coverage: CoverageSpec,
  config?: Partial<RoleAssignmentConfig>,
  /** Per-drone tick counters for hysteresis. Caller maintains this. */
  roleTickCounts?: Map<string, number>,
): Map<string, FormationRole> {
  const cfg: RoleAssignmentConfig = { ...DEFAULT_ROLE_CONFIG, ...config };
  const changes = new Map<string, FormationRole>();

  const activeIds = world.getActiveDroneIds();
  const drones: DroneState[] = [];
  for (const id of activeIds) {
    const d = world.getDrone(id);
    if (d) drones.push(d);
  }

  // Build a working snapshot of roles: start with current roles, then overlay changes
  // as we go through the priority rules. This lets later rules see earlier decisions.
  const effectiveRole = new Map<string, FormationRole>();
  for (const d of drones) {
    effectiveRole.set(d.id, d.coordinate.chi);
  }

  // Helper to record a role change
  const setRole = (id: string, role: FormationRole): void => {
    effectiveRole.set(id, role);
    changes.set(id, role);
  };

  // -------------------------------------------------------------------------
  // Rule 1: Safety -- low battery -> charger-inbound
  // -------------------------------------------------------------------------
  for (const drone of drones) {
    const battery = drone.lastTelemetry.battery.percentage;
    const currentRole = effectiveRole.get(drone.id)!;
    if (battery < cfg.batteryChargeThreshold && !CHARGING_ROLES.has(currentRole)) {
      setRole(drone.id, 'charger-inbound');
    }
  }

  // -------------------------------------------------------------------------
  // Rule 2: Charging complete -> charger-outbound
  // -------------------------------------------------------------------------
  for (const drone of drones) {
    const battery = drone.lastTelemetry.battery.percentage;
    const currentRole = effectiveRole.get(drone.id)!;
    if (currentRole === 'charging' && battery >= cfg.batteryReturnThreshold) {
      setRole(drone.id, 'charger-outbound');
    }
  }

  // -------------------------------------------------------------------------
  // Rule 3: Charger outbound + airborne -> performer or reserve
  // -------------------------------------------------------------------------
  for (const drone of drones) {
    const currentRole = effectiveRole.get(drone.id)!;
    if (currentRole === 'charger-outbound' && !GROUNDED_SIGMA.has(drone.coordinate.sigma)) {
      const performerCount = countRole(effectiveRole, 'performer');
      if (performerCount < formation.minPerformers) {
        setRole(drone.id, 'performer');
      } else {
        setRole(drone.id, 'reserve');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 4: Relay assignment
  // -------------------------------------------------------------------------
  if (coverage.needsRelay) {
    const hasRelay = countRole(effectiveRole, 'relay') > 0;
    if (!hasRelay) {
      const candidate = pickRelayCandidate(drones, effectiveRole, coverage, cfg);
      if (candidate) {
        setRole(candidate.id, 'relay');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 5: Leader assignment
  // -------------------------------------------------------------------------
  if (formation.needsLeader) {
    const hasLeader = countRole(effectiveRole, 'leader') > 0;
    if (!hasLeader) {
      const candidate = pickLeaderCandidate(drones, effectiveRole, cfg);
      if (candidate) {
        setRole(candidate.id, 'leader');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 6: Performer filling -- promote reserves
  // -------------------------------------------------------------------------
  const performerCount = countRole(effectiveRole, 'performer');
  if (performerCount < formation.minPerformers) {
    const needed = formation.minPerformers - performerCount;
    const reserves = drones
      .filter((d) => effectiveRole.get(d.id) === 'reserve')
      .sort((a, b) => b.lastTelemetry.battery.percentage - a.lastTelemetry.battery.percentage);

    for (let i = 0; i < needed && i < reserves.length; i++) {
      setRole(reserves[i].id, 'performer');
    }
  }

  // -------------------------------------------------------------------------
  // Rule 7: Excess performers -> reserve (fairness: demote lowest battery)
  // -------------------------------------------------------------------------
  const currentPerformers = drones
    .filter((d) => effectiveRole.get(d.id) === 'performer')
    .sort((a, b) => a.lastTelemetry.battery.percentage - b.lastTelemetry.battery.percentage);

  const totalPerformersNow = currentPerformers.length;
  // Only demote if we have strictly more than needed
  if (totalPerformersNow > formation.minPerformers) {
    const excess = totalPerformersNow - formation.minPerformers;
    for (let i = 0; i < excess; i++) {
      const drone = currentPerformers[i];
      // Only demote if battery is below 50% (low-ish but above charge threshold)
      if (drone.lastTelemetry.battery.percentage < 0.50) {
        setRole(drone.id, 'reserve');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 8: Hysteresis -- suppress non-safety changes if role is too new
  // -------------------------------------------------------------------------
  if (roleTickCounts) {
    const suppressions: string[] = [];
    for (const [droneId, newRole] of changes) {
      // Safety (charger-inbound from rule 1) always overrides hysteresis
      if (newRole === 'charger-inbound') continue;

      const ticks = roleTickCounts.get(droneId) ?? Infinity;
      if (ticks < cfg.roleHysteresisTickCount) {
        suppressions.push(droneId);
      }
    }
    for (const id of suppressions) {
      changes.delete(id);
    }
  }

  // -------------------------------------------------------------------------
  // Final cleanup: remove no-op changes (new role === current role)
  // -------------------------------------------------------------------------
  for (const [droneId, newRole] of changes) {
    const drone = world.getDrone(droneId);
    if (drone && drone.coordinate.chi === newRole) {
      changes.delete(droneId);
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Candidate Selection Helpers
// ---------------------------------------------------------------------------

/** Count how many drones currently hold a given role in the effective map. */
function countRole(effectiveRole: Map<string, FormationRole>, role: FormationRole): number {
  let count = 0;
  for (const r of effectiveRole.values()) {
    if (r === role) count++;
  }
  return count;
}

/**
 * Pick the best relay candidate: closest to coverage boundary with best battery.
 * Only considers drones that are currently performer or reserve (not in charging
 * lifecycle, not leader, not already relay).
 */
function pickRelayCandidate(
  drones: DroneState[],
  effectiveRole: Map<string, FormationRole>,
  coverage: CoverageSpec,
  cfg: RoleAssignmentConfig,
): DroneState | null {
  const origin: Vec3 = { x: 0, y: 0, z: 0 };
  const eligible = drones.filter((d) => {
    const role = effectiveRole.get(d.id)!;
    return (role === 'performer' || role === 'reserve')
      && d.lastTelemetry.battery.percentage >= cfg.batteryChargeThreshold;
  });

  if (eligible.length === 0) return null;

  // Score: lower is better. Primary: distance to boundary. Secondary: prefer higher battery.
  let best: DroneState | null = null;
  let bestScore = Infinity;

  for (const drone of eligible) {
    const distFromOrigin = vec3Distance(drone.lastTelemetry.position, origin);
    const distToBoundary = Math.abs(distFromOrigin - coverage.coverageRadius);
    // Normalize battery as a small tiebreaker (lower score = better)
    const score = distToBoundary - drone.lastTelemetry.battery.percentage * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = drone;
    }
  }

  return best;
}

/**
 * Pick the best leader candidate: highest battery and position quality among
 * performers and reserves. Does not pick drones in charging lifecycle.
 */
function pickLeaderCandidate(
  drones: DroneState[],
  effectiveRole: Map<string, FormationRole>,
  cfg: RoleAssignmentConfig,
): DroneState | null {
  const eligible = drones.filter((d) => {
    const role = effectiveRole.get(d.id)!;
    return (role === 'performer' || role === 'reserve')
      && d.lastTelemetry.battery.percentage >= cfg.batteryChargeThreshold;
  });

  if (eligible.length === 0) return null;

  // Sort by: battery desc, then position_quality desc
  eligible.sort((a, b) => {
    const battDiff = b.lastTelemetry.battery.percentage - a.lastTelemetry.battery.percentage;
    if (Math.abs(battDiff) > 0.001) return battDiff;
    return b.lastTelemetry.position_quality - a.lastTelemetry.position_quality;
  });

  return eligible[0];
}
