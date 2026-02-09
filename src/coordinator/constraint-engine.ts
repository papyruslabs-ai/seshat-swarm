/**
 * Seshat Swarm -- Constraint Satisfaction Engine
 *
 * Selects compatible pattern assignments for affected drones by filtering
 * the finite behavioral catalog through a cascade of constraints:
 *   1. Hardware match (rho, tau)
 *   2. Precondition satisfaction (battery, position quality)
 *   3. Valid transitions from current pattern
 *   4. Pairwise compatibility with neighbor assignments
 *   5. Scoring heuristic (stability, objective match, role continuity)
 *
 * This is the runtime "selection" step in the "selection, not generation"
 * architecture. Drones never generate novel behavior -- they select from
 * a pre-verified catalog and parameterize with real-time sensor data.
 *
 * Complexity: O(|affected| x |catalog| x |neighbors|) per solve call.
 * With a 1,500-pattern catalog and 3 neighbors, this is microseconds.
 */

import type { Vec3 } from '../types/dimensions.js';
import type {
  BehavioralPattern,
  BehavioralCatalog,
} from '../catalog/types.js';
import {
  filterByCore,
  isPatternTransitionValid,
  isCompatible,
  lookupPattern,
} from '../catalog/lookup.js';
import type { WorldModel, DroneState } from './world-model.js';
import { vec3Distance } from './world-model.js';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** A pattern assignment for a single drone. */
export interface Assignment {
  droneId: string;
  patternId: string;
  targetPos?: Vec3;
  targetVel?: Vec3;
}

/** Swarm-level objective (what the swarm should be doing). */
export interface SwarmObjective {
  type: 'formation' | 'orbit' | 'translate' | 'hover' | 'land-all';
  /** Target position for the formation center */
  targetPos?: Vec3;
  /** Formation shape parameters */
  params?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Forced Exit Detection
// ---------------------------------------------------------------------------

/**
 * Check if a forced exit condition is met for a drone.
 * Returns the target pattern if a forced exit triggers, null otherwise.
 *
 * Parses simple condition strings:
 *   - "battery < 0.10"        -> checks drone.lastTelemetry.battery.percentage
 *   - "battery < 0.15"        -> same
 *   - "position_quality < 0.3" -> checks drone.lastTelemetry.position_quality
 */
export function checkForcedExits(
  drone: DroneState,
  pattern: BehavioralPattern,
): string | null {
  for (const exit of pattern.postconditions.forced_exits) {
    if (evaluateCondition(exit.condition, drone)) {
      return exit.target_pattern;
    }
  }
  return null;
}

/**
 * Evaluate a simple condition string against drone state.
 *
 * Supported conditions:
 *   "battery < {threshold}"          -> battery.percentage < threshold
 *   "position_quality < {threshold}" -> position_quality < threshold
 */
function evaluateCondition(condition: string, drone: DroneState): boolean {
  const match = condition.match(/^(\w+)\s*<\s*([\d.]+)$/);
  if (!match) return false;

  const [, field, thresholdStr] = match;
  const threshold = parseFloat(thresholdStr);
  if (isNaN(threshold)) return false;

  switch (field) {
    case 'battery':
      return drone.lastTelemetry.battery.percentage < threshold;
    case 'position_quality':
      return drone.lastTelemetry.position_quality < threshold;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Map from objective type to the sigma value it prefers. */
const OBJECTIVE_SIGMA_MAP: Record<SwarmObjective['type'], string> = {
  'formation': 'formation-hold',
  'orbit': 'orbit',
  'translate': 'translate',
  'hover': 'hover',
  'land-all': 'land',
};

/**
 * Score a candidate pattern for a drone given objectives and current state.
 *
 * Heuristic:
 *   +10  if pattern matches current pattern (stability -- don't change unnecessarily)
 *   +5   if pattern's sigma matches objective type
 *   +2   if pattern's chi matches drone's current chi (role stability)
 *   -5   if pattern requires high battery (battery_floor > 0.3) but drone is below 50%
 */
function scoreCandidate(
  candidate: BehavioralPattern,
  drone: DroneState,
  objectives: SwarmObjective[],
): number {
  let score = 0;

  // Stability: prefer current pattern
  if (candidate.id === drone.currentPattern) {
    score += 10;
  }

  // Objective match: prefer patterns whose sigma matches what the swarm wants
  for (const obj of objectives) {
    const preferredSigma = OBJECTIVE_SIGMA_MAP[obj.type];
    if (preferredSigma && candidate.core.sigma === preferredSigma) {
      score += 5;
    }
  }

  // Role continuity: prefer keeping current role
  if (candidate.core.chi === drone.coordinate.chi) {
    score += 2;
  }

  // Battery penalty: penalize high-demand patterns when battery is low
  if (
    candidate.preconditions.battery_floor > 0.3 &&
    drone.lastTelemetry.battery.percentage < 0.5
  ) {
    score -= 5;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Constraint Solver
// ---------------------------------------------------------------------------

/**
 * Solve pattern assignments for a set of affected drones.
 *
 * Algorithm: greedy constraint propagation over the finite catalog.
 * For each affected drone:
 *   1. Check forced exits first (battery critical -> emergency land)
 *   2. Filter catalog to patterns valid for this drone's (rho, tau)
 *   3. Filter by preconditions (battery, position_quality)
 *   4. Filter by valid transitions from current pattern
 *   5. Apply pairwise compatibility with neighbor assignments
 *   6. Score candidates and select the best
 *   7. Fall back to hover, then emergency patterns if nothing else works
 *
 * @param world       - Current world model with all drone states
 * @param catalog     - The pre-verified behavioral catalog
 * @param affectedDrones - Set of drone IDs that need new assignments
 * @param objectives  - Swarm-level objectives to influence pattern selection
 * @returns Array of assignments for all affected drones
 */
export function solveAssignment(
  world: WorldModel,
  catalog: BehavioralCatalog,
  affectedDrones: Set<string>,
  objectives: SwarmObjective[],
): Assignment[] {
  const assignments: Assignment[] = [];
  // Track what's been assigned so far for compatibility checking
  const assignedPatterns: Map<string, string> = new Map();

  for (const droneId of affectedDrones) {
    const drone = world.getDrone(droneId);
    if (!drone) continue;

    const assignment = solveForDrone(
      drone,
      world,
      catalog,
      objectives,
      assignedPatterns,
    );

    assignments.push(assignment);
    assignedPatterns.set(droneId, assignment.patternId);
  }

  return assignments;
}

/**
 * Solve for a single drone's pattern assignment.
 * Internal workhorse called by solveAssignment.
 */
function solveForDrone(
  drone: DroneState,
  world: WorldModel,
  catalog: BehavioralCatalog,
  objectives: SwarmObjective[],
  assignedPatterns: Map<string, string>,
): Assignment {
  // Step 1: Check forced exits from current pattern
  const currentPattern = lookupPattern(catalog, drone.currentPattern);
  if (currentPattern) {
    const forcedTarget = checkForcedExits(drone, currentPattern);
    if (forcedTarget !== null) {
      const targetPattern = lookupPattern(catalog, forcedTarget);
      if (targetPattern) {
        return { droneId: drone.id, patternId: forcedTarget };
      }
    }
  }

  // Step 2: Filter catalog by hardware (rho, tau)
  const hardwareMatches = filterByCore(catalog, {
    rho: drone.coordinate.rho,
    tau: drone.coordinate.tau,
  });

  // Step 3: Filter by preconditions
  const preconditionMatches = hardwareMatches.filter((p) =>
    meetsPreconditions(p, drone),
  );

  // Step 4: Filter by valid transitions from current pattern
  const transitionMatches = preconditionMatches.filter((p) => {
    // If drone has no current pattern (initial state), allow all
    if (!drone.currentPattern) return true;
    // Same pattern is always a valid "transition" (staying put)
    if (p.id === drone.currentPattern) return true;
    // Check transition validity
    return isPatternTransitionValid(catalog, drone.currentPattern, p.id);
  });

  // Step 5: Filter by pairwise compatibility with neighbor assignments
  const compatibleCandidates = transitionMatches.filter((p) =>
    isCompatibleWithNeighbors(p, drone, world, catalog, assignedPatterns),
  );

  // Step 6: Score and select
  if (compatibleCandidates.length > 0) {
    const scored = compatibleCandidates
      .map((p) => ({ pattern: p, score: scoreCandidate(p, drone, objectives) }))
      .sort((a, b) => b.score - a.score);

    return {
      droneId: drone.id,
      patternId: scored[0].pattern.id,
    };
  }

  // Step 7: Fallback -- try hover patterns for this hardware
  const hoverFallback = findFallbackHover(drone, catalog);
  if (hoverFallback) {
    return { droneId: drone.id, patternId: hoverFallback.id };
  }

  // Step 8: Emergency fallback -- any pattern with battery_floor=0
  const emergencyFallback = findEmergencyFallback(drone, catalog);
  if (emergencyFallback) {
    return { droneId: drone.id, patternId: emergencyFallback.id };
  }

  // Last resort: keep current pattern (should never reach here with a
  // well-populated catalog, but safety demands we always return something)
  return { droneId: drone.id, patternId: drone.currentPattern };
}

// ---------------------------------------------------------------------------
// Constraint Checks
// ---------------------------------------------------------------------------

/**
 * Check if a pattern's preconditions are met by the drone's current state.
 */
function meetsPreconditions(
  pattern: BehavioralPattern,
  drone: DroneState,
): boolean {
  const { battery_floor, position_quality_floor, min_references } =
    pattern.preconditions;

  if (drone.lastTelemetry.battery.percentage < battery_floor) {
    return false;
  }

  if (drone.lastTelemetry.position_quality < position_quality_floor) {
    return false;
  }

  // Count references: neighbors + base stations
  const refCount =
    drone.coordinate.epsilon.neighbors.length +
    drone.coordinate.epsilon.base_stations.length;
  if (refCount < min_references) {
    return false;
  }

  return true;
}

/**
 * Check if a candidate pattern is compatible with all already-assigned neighbors.
 */
function isCompatibleWithNeighbors(
  candidate: BehavioralPattern,
  drone: DroneState,
  world: WorldModel,
  catalog: BehavioralCatalog,
  assignedPatterns: Map<string, string>,
): boolean {
  const neighbors = drone.coordinate.epsilon.neighbors;

  for (const neighborId of neighbors) {
    // Determine the neighbor's pattern: either already assigned or current
    const neighborPattern =
      assignedPatterns.get(neighborId) ??
      world.getDrone(neighborId)?.currentPattern;

    if (!neighborPattern) continue;

    // Compute separation distance
    const neighborDrone = world.getDrone(neighborId);
    if (!neighborDrone) continue;

    const separation = vec3Distance(
      drone.lastTelemetry.position,
      neighborDrone.lastTelemetry.position,
    );

    if (!isCompatible(catalog, candidate.id, neighborPattern, separation)) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

/**
 * Find a hover pattern valid for this drone's hardware.
 * Used as a safe fallback when no other pattern is viable.
 */
function findFallbackHover(
  drone: DroneState,
  catalog: BehavioralCatalog,
): BehavioralPattern | null {
  const hovers = filterByCore(catalog, {
    sigma: 'hover',
    rho: drone.coordinate.rho,
    tau: drone.coordinate.tau,
  });

  // Pick the one with the lowest battery floor (most permissive)
  if (hovers.length === 0) return null;

  return hovers.reduce((best, p) =>
    p.preconditions.battery_floor < best.preconditions.battery_floor ? p : best,
  );
}

/**
 * Find an emergency pattern (battery_floor = 0) for this drone's hardware.
 * The absolute last resort before giving up.
 */
function findEmergencyFallback(
  drone: DroneState,
  catalog: BehavioralCatalog,
): BehavioralPattern | null {
  const hwPatterns = filterByCore(catalog, {
    rho: drone.coordinate.rho,
    tau: drone.coordinate.tau,
  });

  const emergency = hwPatterns.filter(
    (p) => p.preconditions.battery_floor === 0,
  );

  if (emergency.length === 0) return null;

  // Prefer landing/grounded patterns in emergency
  const landPattern = emergency.find(
    (p) => p.core.sigma === 'land' || p.core.sigma === 'grounded',
  );
  return landPattern ?? emergency[0];
}
