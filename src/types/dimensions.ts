/**
 * Seshat Swarm — 9D Semantic Space Type Definitions
 *
 * The 9 dimensions factor into:
 *   J_structural = (σ, κ, χ, λ, τ, ρ)  → finite catalog
 *   J_semantic   = (ε, δ, Σ)            → continuous parameterization
 */

// ---------------------------------------------------------------------------
// Structural Dimensions (Finite — The Catalog)
// ---------------------------------------------------------------------------

/**
 * σ (Sigma) — Behavioral Mode
 * What the drone is physically doing right now.
 */
export type BehavioralMode =
  | 'hover'
  | 'translate'
  | 'orbit'
  | 'avoid'
  | 'climb'
  | 'descend'
  | 'land'
  | 'takeoff'
  | 'dock'
  | 'undock'
  | 'grounded'
  | 'docked'
  | 'formation-hold'
  | 'formation-transition'
  | 'relay-hold';

/** All σ values as a runtime array for validation/iteration. */
export const BEHAVIORAL_MODES: readonly BehavioralMode[] = [
  'hover',
  'translate',
  'orbit',
  'avoid',
  'climb',
  'descend',
  'land',
  'takeoff',
  'dock',
  'undock',
  'grounded',
  'docked',
  'formation-hold',
  'formation-transition',
  'relay-hold',
] as const;

/**
 * κ (Kappa) — Autonomy Level
 * How much operator control the drone is under.
 * Emergency κ overrides all other dimensions.
 */
export type AutonomyLevel =
  | 'autonomous'
  | 'operator-guided'
  | 'emergency'
  | 'manual';

export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = [
  'autonomous',
  'operator-guided',
  'emergency',
  'manual',
] as const;

/**
 * χ (Chi) — Formation Role
 * The drone's current job within the swarm.
 * Dynamically assigned — any drone can play any role.
 */
export type FormationRole =
  | 'leader'
  | 'follower'
  | 'relay'
  | 'performer'
  | 'charger-inbound'
  | 'charging'
  | 'charger-outbound'
  | 'scout'
  | 'anchor'
  | 'reserve';

export const FORMATION_ROLES: readonly FormationRole[] = [
  'leader',
  'follower',
  'relay',
  'performer',
  'charger-inbound',
  'charging',
  'charger-outbound',
  'scout',
  'anchor',
  'reserve',
] as const;

/**
 * λ (Lambda) — Resource Ownership
 * What resources the drone currently owns or is responsible for.
 * This dimension was near-zero for JS/TS code; it activates for drones
 * because airspace and energy are explicitly owned resources.
 */
export type ResourceOwnership =
  | 'exclusive-volume'
  | 'shared-corridor'
  | 'yielding'
  | 'energy-source'
  | 'energy-store'
  | 'energy-consumer'
  | 'comm-bridge';

export const RESOURCE_OWNERSHIPS: readonly ResourceOwnership[] = [
  'exclusive-volume',
  'shared-corridor',
  'yielding',
  'energy-source',
  'energy-store',
  'energy-consumer',
  'comm-bridge',
] as const;

/**
 * τ (Tau) — Physical Traits
 * Payload configuration that affects which behavioral patterns are valid.
 * A 27g bare Crazyflie and a 35g solar-equipped Crazyflie need different
 * motor commands for the same maneuver.
 */
export type PhysicalTraits =
  | 'bare'
  | 'solar-equipped'
  | 'battery-carrier'
  | 'camera-equipped'
  | 'sensor-extended'
  | 'dual-deck';

export const PHYSICAL_TRAITS: readonly PhysicalTraits[] = [
  'bare',
  'solar-equipped',
  'battery-carrier',
  'camera-equipped',
  'sensor-extended',
  'dual-deck',
] as const;

/**
 * ρ (Rho) — Hardware Target
 * The specific hardware platform. Determines which generator γ uses.
 * γ(J, S, crazyflie-2.1) → STM32 motor commands
 * γ(J, S, sim-gazebo)     → Gazebo actuator commands
 */
export type HardwareTarget =
  | 'crazyflie-2.1'
  | 'crazyflie-bl'
  | 'esp-drone'
  | 'sim-gazebo'
  | 'sim-simple';

export const HARDWARE_TARGETS: readonly HardwareTarget[] = [
  'crazyflie-2.1',
  'crazyflie-bl',
  'esp-drone',
  'sim-gazebo',
  'sim-simple',
] as const;

// ---------------------------------------------------------------------------
// Semantic Dimensions (Continuous — The Parameterization)
// ---------------------------------------------------------------------------

/** 3D vector used throughout the system. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * ε (Epsilon) — Neighbor Graph
 * The drone's relationship to other drones and infrastructure.
 * Types of relationships are finite; specific instances are combinatorial.
 * Defines the propagation graph for blast radius computation.
 */
export interface NeighborGraph {
  /** Spatial neighbors within communication range */
  neighbors: string[];
  /** Who this drone follows (if follower) */
  leader: string | null;
  /** Who follows this drone (if leader) */
  followers: string[];
  /** Who this drone relays for (if relay) */
  relay_target: string | null;
  /** Who relays for this drone */
  relay_source: string | null;
  /** Charging target pad ID (if charger-inbound) */
  dock_target: string | null;
  /** Visible Lighthouse base stations */
  base_stations: string[];
}

/** Battery state within SensorState. */
export interface BatteryState {
  /** Volts */
  voltage: number;
  /** 0–1 */
  percentage: number;
  /** Watts */
  discharge_rate: number;
  /** Seconds remaining at current draw */
  estimated_remaining: number;
}

/**
 * δ (Delta) — Sensor State
 * The drone's current physical state from sensors.
 * Updated at IMU rate (500–1000Hz). This is the parameterization that makes
 * each drone's execution of a behavioral pattern unique.
 */
export interface SensorState {
  /** Position in Lighthouse frame (meters) */
  position: Vec3;
  /** Velocity (m/s) */
  velocity: Vec3;
  /** Orientation: roll, pitch, yaw (radians) */
  orientation: Vec3;
  /** Angular velocity: p, q, r (rad/s) */
  angular_velocity: Vec3;
  /** Battery state */
  battery: BatteryState;
  /** Confidence in position estimate, 0–1 */
  position_quality: number;
  /** Estimated wind vector (m/s), if available */
  wind_estimate: Vec3;
}

/**
 * Σ (Sigma Upper) — Intent Hash
 * Compact summary of the drone's current behavioral objective.
 * Derived from other dimensions. Used for quick swarm-level comparison.
 */
export type IntentHash = string;

// ---------------------------------------------------------------------------
// Composite Types
// ---------------------------------------------------------------------------

/**
 * CorePattern — the 6 structural dimensions only.
 * This is the finite key into the behavioral catalog.
 * Equivalent to Seshat's `core_pattern` for code entities.
 */
export interface CorePattern {
  sigma: BehavioralMode;
  kappa: AutonomyLevel;
  chi: FormationRole;
  lambda: ResourceOwnership;
  tau: PhysicalTraits;
  rho: HardwareTarget;
}

/**
 * DroneCoordinate — the full 9D state of a drone.
 * J = J_structural × J_semantic
 */
export interface DroneCoordinate {
  // Structural (finite)
  sigma: BehavioralMode;
  kappa: AutonomyLevel;
  chi: FormationRole;
  lambda: ResourceOwnership;
  tau: PhysicalTraits;
  rho: HardwareTarget;

  // Semantic (continuous)
  epsilon: NeighborGraph;
  delta: SensorState;
  sigma_upper: IntentHash;
}

/**
 * Extract the CorePattern (structural dimensions) from a full DroneCoordinate.
 */
export function extractCore(coord: DroneCoordinate): CorePattern {
  return {
    sigma: coord.sigma,
    kappa: coord.kappa,
    chi: coord.chi,
    lambda: coord.lambda,
    tau: coord.tau,
    rho: coord.rho,
  };
}

/**
 * Produce the canonical string key for a CorePattern.
 * Format: {sigma}-{kappa}-{chi}-{tau}.{rho}
 * λ is omitted from the key because it's derived from χ (see dependencies.ts).
 *
 * This matches the catalog filename convention in BEHAVIORAL-CATALOG-SPEC.md:
 *   hover-autonomous-performer-bare.crazyflie-2.1
 */
export function corePatternKey(core: CorePattern): string {
  return `${core.sigma}-${core.kappa}-${core.chi}-${core.tau}.${core.rho}`;
}

// ---------------------------------------------------------------------------
// Generator Types (used by catalog patterns and firmware)
// ---------------------------------------------------------------------------

/**
 * The control modes a behavioral pattern's generator can use.
 * Maps to the firmware's generator dispatch in pattern_executor.c.
 */
export type GeneratorType =
  | 'position-hold'
  | 'velocity-track'
  | 'waypoint-sequence'
  | 'relative-offset'
  | 'orbit-center'
  | 'trajectory-spline'
  | 'emergency-stop'
  | 'idle';

export const GENERATOR_TYPES: readonly GeneratorType[] = [
  'position-hold',
  'velocity-track',
  'waypoint-sequence',
  'relative-offset',
  'orbit-center',
  'trajectory-spline',
  'emergency-stop',
  'idle',
] as const;

// ---------------------------------------------------------------------------
// Communication Protocol Types
// ---------------------------------------------------------------------------

/**
 * Ground station → drone command packet.
 * Target size: 20 bytes over radio.
 */
export interface GroundCommand {
  /** Index into the onboard catalog (uint16) */
  pattern_id: number;
  /** Target position for position-tracking patterns */
  target_pos: Vec3;
  /** Target velocity for velocity-tracking patterns */
  target_vel: Vec3;
  /** Flags: emergency, style update, etc. (uint8 bitmask) */
  flags: number;
}

/** Command flag bits. */
export const CommandFlags = {
  EMERGENCY: 1 << 0,
  STYLE_UPDATE: 1 << 1,
  FORCE_PATTERN: 1 << 2,
} as const;
