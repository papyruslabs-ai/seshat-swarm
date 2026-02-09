/**
 * Seshat Swarm — Fiber Bundle Dependencies
 *
 * The catalog isn't a flat cross-product. At each base point (ρ, τ),
 * only certain fibers (σ, χ, λ) are valid. These dependencies encode
 * the physical constraints that make ~99.99% of theoretical combinations
 * invalid.
 *
 * Dependency chain:
 *   τ depends on ρ       (what decks attach to what platform)
 *   Valid σ depends on τ  (solar drone can't do acrobatics)
 *   Valid χ depends on τ  (only UWB-capable drones can be relays)
 *   λ depends on χ        (leaders own exclusive volumes)
 */

import type {
  BehavioralMode,
  FormationRole,
  HardwareTarget,
  PhysicalTraits,
  ResourceOwnership,
} from './dimensions.js';

// ---------------------------------------------------------------------------
// ρ → τ: Which physical traits are valid for each hardware target
// ---------------------------------------------------------------------------

/**
 * Given a hardware target (ρ), which physical trait configurations (τ) are possible?
 * Determined by physical deck compatibility.
 */
export const VALID_TRAITS: Record<HardwareTarget, readonly PhysicalTraits[]> = {
  'crazyflie-2.1': ['bare', 'solar-equipped', 'battery-carrier', 'camera-equipped', 'sensor-extended', 'dual-deck'],
  'crazyflie-bl':  ['bare', 'camera-equipped', 'sensor-extended'],
  'esp-drone':     ['bare', 'camera-equipped'],
  'sim-gazebo':    ['bare', 'solar-equipped', 'battery-carrier', 'camera-equipped', 'sensor-extended', 'dual-deck'],
  'sim-simple':    ['bare', 'solar-equipped', 'battery-carrier', 'camera-equipped', 'sensor-extended', 'dual-deck'],
};

// ---------------------------------------------------------------------------
// (ρ, τ) → σ: Which behavioral modes are valid for each hardware × trait combo
// ---------------------------------------------------------------------------

/**
 * Modes that are EXCLUDED for a given τ.
 * Everything not in this list is valid.
 *
 * This is expressed as exclusions because most modes are valid for most traits.
 * The exclusions encode physical safety constraints.
 */
export const EXCLUDED_MODES: Record<PhysicalTraits, readonly BehavioralMode[]> = {
  'bare':             [],  // Full agility — no restrictions
  'solar-equipped':   ['orbit'],  // Reduced agility, high drag — no aggressive maneuvers
  'battery-carrier':  ['orbit'],  // Extra weight — no aggressive maneuvers
  'camera-equipped':  [],  // Slight weight increase, no meaningful restriction
  'sensor-extended':  [],  // Weight varies, no blanket restriction
  'dual-deck':        ['orbit'],  // Reduced agility — no aggressive maneuvers
};

/**
 * Additional mode exclusions per hardware target.
 * Applied on top of trait-based exclusions.
 */
export const EXCLUDED_MODES_BY_HARDWARE: Record<HardwareTarget, readonly BehavioralMode[]> = {
  'crazyflie-2.1': [],
  'crazyflie-bl':  [],
  'esp-drone':     ['dock', 'undock', 'docked'],  // No docking hardware
  'sim-gazebo':    [],  // Simulator supports everything
  'sim-simple':    ['dock', 'undock', 'docked'],   // Simplified sim, no docking
};

/**
 * All behavioral modes (imported for completeness checks).
 */
import { BEHAVIORAL_MODES } from './dimensions.js';

/**
 * Get valid behavioral modes for a (ρ, τ) combination.
 */
export function getValidModes(rho: HardwareTarget, tau: PhysicalTraits): BehavioralMode[] {
  const traitExclusions = new Set(EXCLUDED_MODES[tau]);
  const hwExclusions = new Set(EXCLUDED_MODES_BY_HARDWARE[rho]);
  return BEHAVIORAL_MODES.filter(
    (mode) => !traitExclusions.has(mode) && !hwExclusions.has(mode),
  );
}

// ---------------------------------------------------------------------------
// τ → χ: Which formation roles are valid for each trait configuration
// ---------------------------------------------------------------------------

/**
 * Roles that require specific hardware capabilities.
 * If a trait doesn't appear as a key here, all roles are valid for it.
 */
export const EXCLUDED_ROLES: Record<PhysicalTraits, readonly FormationRole[]> = {
  'bare':             [],  // Can play any role
  'solar-equipped':   ['scout'],  // Too heavy/slow for scouting
  'battery-carrier':  ['scout'],  // Too heavy for scouting
  'camera-equipped':  [],
  'sensor-extended':  [],
  'dual-deck':        ['scout'],  // Too heavy for scouting
};

/**
 * Roles that require specific capabilities not tied to τ alone.
 * The relay role requires UWB ranging capability.
 *
 * For the Crazyflie 2.1, UWB is available via the Loco Positioning deck.
 * If a drone has τ = 'bare' (no deck), it cannot be a relay.
 * However, in the current Lighthouse-based architecture, relay uses
 * the existing radio for position broadcast — so we allow it for now
 * and will tighten this when UWB-specific relaying is implemented.
 */
export const CAPABILITY_ROLE_REQUIREMENTS: Array<{
  role: FormationRole;
  requires_tau: PhysicalTraits[];
  reason: string;
}> = [
  // Placeholder: when UWB relay is implemented, add:
  // { role: 'relay', requires_tau: ['sensor-extended', 'dual-deck'], reason: 'Relay requires UWB deck' }
];

import { FORMATION_ROLES } from './dimensions.js';

/**
 * Get valid formation roles for a given τ.
 */
export function getValidRoles(tau: PhysicalTraits): FormationRole[] {
  const traitExclusions = new Set(EXCLUDED_ROLES[tau]);
  const capabilityExclusions = new Set(
    CAPABILITY_ROLE_REQUIREMENTS
      .filter((req) => !req.requires_tau.includes(tau))
      .map((req) => req.role),
  );
  return FORMATION_ROLES.filter(
    (role) => !traitExclusions.has(role) && !capabilityExclusions.has(role),
  );
}

// ---------------------------------------------------------------------------
// χ → λ: Which resource ownerships apply for each formation role
// ---------------------------------------------------------------------------

/**
 * Given a formation role (χ), which resource ownerships (λ) are valid?
 * This encodes what the role "owns."
 *
 * Key rule: leader implies exclusive-volume.
 */
export const ROLE_OWNERSHIP: Record<FormationRole, readonly ResourceOwnership[]> = {
  'leader':           ['exclusive-volume'],
  'follower':         ['shared-corridor'],
  'relay':            ['exclusive-volume', 'comm-bridge'],
  'performer':        ['shared-corridor', 'exclusive-volume'],
  'charger-inbound':  ['shared-corridor', 'yielding'],
  'charging':         ['energy-consumer'],
  'charger-outbound': ['shared-corridor'],
  'scout':            ['exclusive-volume'],
  'anchor':           ['exclusive-volume'],
  'reserve':          ['shared-corridor', 'yielding'],
};

/**
 * Get valid resource ownerships for a given χ.
 */
export function getValidOwnerships(chi: FormationRole): readonly ResourceOwnership[] {
  return ROLE_OWNERSHIP[chi];
}

// ---------------------------------------------------------------------------
// Composite Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a (ρ, τ, σ, χ, λ) combination is consistent with
 * the fiber bundle dependencies.
 *
 * Returns null if valid, or a string describing the first violation found.
 */
export function validateDependencies(
  rho: HardwareTarget,
  tau: PhysicalTraits,
  sigma: BehavioralMode,
  chi: FormationRole,
  lambda: ResourceOwnership,
): string | null {
  // τ valid for ρ?
  if (!VALID_TRAITS[rho].includes(tau)) {
    return `Physical trait '${tau}' is not valid for hardware '${rho}'`;
  }

  // σ valid for (ρ, τ)?
  const validModes = getValidModes(rho, tau);
  if (!validModes.includes(sigma)) {
    return `Behavioral mode '${sigma}' is not valid for hardware '${rho}' with trait '${tau}'`;
  }

  // χ valid for τ?
  const validRoles = getValidRoles(tau);
  if (!validRoles.includes(chi)) {
    return `Formation role '${chi}' is not valid for trait '${tau}'`;
  }

  // λ valid for χ?
  const validOwn = getValidOwnerships(chi);
  if (!validOwn.includes(lambda)) {
    return `Resource ownership '${lambda}' is not valid for role '${chi}'`;
  }

  return null;
}
