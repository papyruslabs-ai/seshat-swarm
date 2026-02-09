/**
 * Seshat Swarm — World Model
 *
 * Maintains the current state of all drones in the swarm.
 * Computes neighbor graphs (ε), detects structural changes (Δ),
 * and provides the shared state that the constraint engine,
 * blast radius engine, and role assignment all operate on.
 */

import type {
  DroneCoordinate,
  SensorState,
  NeighborGraph,
  Vec3,
  CorePattern,
  BehavioralMode,
  AutonomyLevel,
  FormationRole,
  ResourceOwnership,
  PhysicalTraits,
  HardwareTarget,
} from '../types/dimensions.js';
import { extractCore } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WorldModelConfig {
  /** Communication range in meters. Drones within this range are neighbors. */
  commRange: number;
  /** Stale threshold in ms. Drones not heard from in this time are marked stale. */
  staleThresholdMs: number;
}

export const DEFAULT_CONFIG: WorldModelConfig = {
  commRange: 5.0,
  staleThresholdMs: 500,
};

// ---------------------------------------------------------------------------
// Drone State
// ---------------------------------------------------------------------------

export interface DroneState {
  /** Unique drone identifier */
  id: string;
  /** Full 9D coordinate */
  coordinate: DroneCoordinate;
  /** Currently executing pattern ID */
  currentPattern: string;
  /** Most recent sensor data (δ) */
  lastTelemetry: SensorState;
  /** Timestamp of last telemetry update (Date.now()) */
  lastUpdate: number;
  /** Whether this drone is considered stale (no recent telemetry) */
  stale: boolean;
}

// ---------------------------------------------------------------------------
// Delta Detection
// ---------------------------------------------------------------------------

/** Result of comparing two drone states. */
export interface DeltaResult {
  /** Whether any change was detected */
  changed: boolean;
  /** Whether the change is structural (Δ ≠ 0) — requires blast radius propagation */
  structural: boolean;
  /** Which structural dimensions changed */
  changedDimensions: string[];
}

/** No change detected. */
const NO_CHANGE: DeltaResult = { changed: false, structural: false, changedDimensions: [] };

// ---------------------------------------------------------------------------
// World Model
// ---------------------------------------------------------------------------

export class WorldModel {
  readonly config: WorldModelConfig;
  readonly drones: Map<string, DroneState> = new Map();

  constructor(config: Partial<WorldModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Drone Management
  // -----------------------------------------------------------------------

  /**
   * Add a new drone to the world model.
   * Typically called when a drone powers on and sends its first telemetry.
   */
  addDrone(
    id: string,
    rho: HardwareTarget,
    tau: PhysicalTraits,
    initialPattern: string,
    telemetry: SensorState,
  ): DroneState {
    const coordinate: DroneCoordinate = {
      sigma: 'grounded',
      kappa: 'autonomous',
      chi: 'reserve',
      lambda: 'shared-corridor',
      tau,
      rho,
      epsilon: this.computeNeighborGraph(id, telemetry.position),
      delta: telemetry,
      sigma_upper: '',
    };

    const state: DroneState = {
      id,
      coordinate,
      currentPattern: initialPattern,
      lastTelemetry: telemetry,
      lastUpdate: Date.now(),
      stale: false,
    };

    this.drones.set(id, state);
    return state;
  }

  /**
   * Remove a drone from the world model.
   * Called when a drone is powered off or lost.
   */
  removeDrone(id: string): boolean {
    return this.drones.delete(id);
  }

  /**
   * Get a drone's current state.
   */
  getDrone(id: string): DroneState | undefined {
    return this.drones.get(id);
  }

  /**
   * Get all active (non-stale) drone IDs.
   */
  getActiveDroneIds(): string[] {
    return Array.from(this.drones.values())
      .filter((d) => !d.stale)
      .map((d) => d.id);
  }

  /** Total number of tracked drones. */
  get size(): number {
    return this.drones.size;
  }

  // -----------------------------------------------------------------------
  // Telemetry Updates
  // -----------------------------------------------------------------------

  /**
   * Update a drone's sensor state from incoming telemetry.
   * Recomputes the neighbor graph (ε) for the updated drone.
   */
  updateTelemetry(droneId: string, telemetry: SensorState): void {
    const drone = this.drones.get(droneId);
    if (!drone) return;

    drone.lastTelemetry = telemetry;
    drone.coordinate.delta = telemetry;
    drone.lastUpdate = Date.now();
    drone.stale = false;

    // Recompute neighbor graph based on new position
    drone.coordinate.epsilon = this.computeNeighborGraph(droneId, telemetry.position);
  }

  /**
   * Update a drone's structural coordinates (pattern assignment).
   * Called by the constraint engine when a new pattern is assigned.
   * Returns the delta result for blast radius computation.
   */
  updatePattern(
    droneId: string,
    patternId: string,
    sigma: BehavioralMode,
    kappa: AutonomyLevel,
    chi: FormationRole,
    lambda: ResourceOwnership,
  ): DeltaResult {
    const drone = this.drones.get(droneId);
    if (!drone) return NO_CHANGE;

    const oldCore = extractCore(drone.coordinate);

    drone.currentPattern = patternId;
    drone.coordinate.sigma = sigma;
    drone.coordinate.kappa = kappa;
    drone.coordinate.chi = chi;
    drone.coordinate.lambda = lambda;

    return this.detectDelta(oldCore, extractCore(drone.coordinate));
  }

  /**
   * Mark drones as stale if their last telemetry is too old.
   */
  markStaleDrones(now: number = Date.now()): string[] {
    const staleIds: string[] = [];
    for (const drone of this.drones.values()) {
      const wasStale = drone.stale;
      drone.stale = (now - drone.lastUpdate) > this.config.staleThresholdMs;
      if (drone.stale && !wasStale) {
        staleIds.push(drone.id);
      }
    }
    return staleIds;
  }

  // -----------------------------------------------------------------------
  // Neighbor Graph (ε)
  // -----------------------------------------------------------------------

  /**
   * Compute the neighbor graph for a drone at a given position.
   * Neighbors are all other drones within communication range.
   */
  computeNeighborGraph(droneId: string, position: Vec3): NeighborGraph {
    const neighbors: string[] = [];
    let leader: string | null = null;
    const followers: string[] = [];
    let relayTarget: string | null = null;
    let relaySource: string | null = null;
    let dockTarget: string | null = null;

    for (const [otherId, other] of this.drones) {
      if (otherId === droneId) continue;

      const dist = vec3Distance(position, other.lastTelemetry.position);
      if (dist <= this.config.commRange) {
        neighbors.push(otherId);

        // Derive role relationships from structural coordinates
        const myDrone = this.drones.get(droneId);
        if (myDrone) {
          // If I'm a follower and the other is a leader, they're my leader
          if (myDrone.coordinate.chi === 'follower' && other.coordinate.chi === 'leader') {
            leader = otherId;
          }
          // If I'm a leader and the other is a follower, they're my follower
          if (myDrone.coordinate.chi === 'leader' && other.coordinate.chi === 'follower') {
            followers.push(otherId);
          }
          // Relay relationships
          if (myDrone.coordinate.chi === 'relay') {
            relayTarget = otherId; // Simplified: relay targets nearest neighbor
          }
          if (other.coordinate.chi === 'relay') {
            relaySource = otherId;
          }
        }
      }
    }

    return {
      neighbors,
      leader,
      followers,
      relay_target: relayTarget,
      relay_source: relaySource,
      dock_target: dockTarget,
      base_stations: [], // Populated from positioning system, not world model
    };
  }

  /**
   * Get the neighbor graph for a specific drone.
   */
  getNeighborGraph(droneId: string): NeighborGraph | undefined {
    return this.drones.get(droneId)?.coordinate.epsilon;
  }

  // -----------------------------------------------------------------------
  // Delta Detection (Δ Classifier)
  // -----------------------------------------------------------------------

  /**
   * Compare two core patterns and determine if the change is structural.
   *
   * Δ = 0 (style change): no structural dimensions changed.
   *   → Update S only, no propagation.
   *
   * Δ ≠ 0 (behavioral change): at least one structural dimension changed.
   *   → Update J, propagate via blast radius.
   */
  detectDelta(oldCore: CorePattern, newCore: CorePattern): DeltaResult {
    const changed: string[] = [];

    if (oldCore.sigma !== newCore.sigma) changed.push('sigma');
    if (oldCore.kappa !== newCore.kappa) changed.push('kappa');
    if (oldCore.chi !== newCore.chi) changed.push('chi');
    if (oldCore.lambda !== newCore.lambda) changed.push('lambda');
    if (oldCore.tau !== newCore.tau) changed.push('tau');
    if (oldCore.rho !== newCore.rho) changed.push('rho');

    return {
      changed: changed.length > 0,
      structural: changed.length > 0,
      changedDimensions: changed,
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Euclidean distance between two Vec3 points. */
export function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
