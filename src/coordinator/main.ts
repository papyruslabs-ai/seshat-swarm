/**
 * Seshat Swarm — Coordinator Main Loop
 *
 * The ground station brain. Receives telemetry from all drones,
 * runs constraint satisfaction, sends pattern assignments.
 *
 * Loop at 100Hz:
 *   1. Receive telemetry → update world model
 *   2. Detect Δ changes
 *   3. If Δ ≠ 0: compute blast radius → re-solve assignments → send commands
 *   4. Process operator intent (if any)
 *   5. Periodic role reassignment (1Hz, not every tick)
 *
 * Graceful shutdown on SIGINT (land all drones).
 */

import { WorldModel, type DroneState } from './world-model.js';
import { computeCascadingBlastRadius } from './blast-radius.js';
import { solveAssignment, checkForcedExits, type SwarmObjective, type Assignment } from './constraint-engine.js';
import { assignRoles, type FormationSpec, type CoverageSpec, type RoleAssignmentConfig, DEFAULT_ROLE_CONFIG } from './role-assignment.js';
import type { DroneComms, DroneTelemetry, DroneCommand } from './comms.js';
import type { BehavioralCatalog } from '../catalog/types.js';
import { lookupPattern } from '../catalog/lookup.js';
import type { Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CoordinatorConfig {
  /** Main loop interval in ms. 10 = 100Hz. */
  tickIntervalMs: number;
  /** Role reassignment interval in ticks. 100 = 1Hz at 100Hz tick rate. */
  roleReassignmentInterval: number;
  /** Communication range for neighbor detection (meters). */
  commRange: number;
  /** Stale drone threshold (ms). */
  staleThresholdMs: number;
  /** Role assignment configuration. */
  roleConfig: RoleAssignmentConfig;
}

export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  tickIntervalMs: 10,
  roleReassignmentInterval: 100,
  commRange: 5.0,
  staleThresholdMs: 500,
  roleConfig: DEFAULT_ROLE_CONFIG,
};

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

export class Coordinator {
  readonly config: CoordinatorConfig;
  readonly world: WorldModel;
  readonly catalog: BehavioralCatalog;
  private comms: DroneComms;

  /** Current swarm objectives. */
  objectives: SwarmObjective[] = [];

  /** Formation specification for role assignment. */
  formation: FormationSpec = {
    minPerformers: 1,
    needsLeader: true,
    center: { x: 0, y: 0, z: 1 },
  };

  /** Coverage specification for role assignment. */
  coverage: CoverageSpec = {
    coverageRadius: 3.0,
    needsRelay: false,
  };

  /** Per-drone role hold tick counters for hysteresis. */
  private roleTickCounts: Map<string, number> = new Map();

  /** Pattern ID mapping: pattern string ID → numeric ID for radio. */
  private patternIdMap: Map<string, number> = new Map();

  /** Tick counter for the main loop. */
  private tickCount = 0;

  /** Whether the coordinator is running. */
  private running = false;

  /** Main loop interval handle. */
  private loopInterval: ReturnType<typeof setInterval> | null = null;

  /** Callback invoked each tick (for testing/monitoring). */
  onTick?: (tick: number, assignments: Assignment[]) => void;

  /** Callback invoked on shutdown. */
  onShutdown?: () => void;

  constructor(
    comms: DroneComms,
    catalog: BehavioralCatalog,
    config: Partial<CoordinatorConfig> = {},
  ) {
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config };
    this.comms = comms;
    this.catalog = catalog;
    this.world = new WorldModel({
      commRange: this.config.commRange,
      staleThresholdMs: this.config.staleThresholdMs,
    });

    // Build pattern ID map (string → sequential uint16)
    let nextId = 0;
    for (const patternId of catalog.patterns.keys()) {
      this.patternIdMap.set(patternId, nextId++);
    }

    // Register telemetry handler
    this.comms.onTelemetry((telemetry) => this.handleTelemetry(telemetry));
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the coordinator loop.
   */
  async start(droneIds: string[]): Promise<void> {
    await this.comms.connect(droneIds);
    this.running = true;

    this.loopInterval = setInterval(() => {
      this.tick();
    }, this.config.tickIntervalMs);
  }

  /**
   * Stop the coordinator and land all drones.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    // Land all drones on shutdown
    await this.landAll();
    await this.comms.disconnect();

    this.onShutdown?.();
  }

  /**
   * Run a single tick of the coordinator loop.
   * Exposed for testing — in production, called by the interval.
   */
  tick(): Assignment[] {
    this.tickCount++;

    // 1. Mark stale drones
    this.world.markStaleDrones();

    // 2. Check forced exits for all drones
    const forcedChanges: string[] = [];
    for (const drone of this.world.drones.values()) {
      if (drone.stale) continue;
      const pattern = lookupPattern(this.catalog, drone.currentPattern);
      if (pattern) {
        const forcedTarget = checkForcedExits(drone, pattern);
        if (forcedTarget) {
          forcedChanges.push(drone.id);
        }
      }
    }

    // 3. Detect structural changes (Δ ≠ 0)
    // In a full implementation, we'd compare the stored state with incoming
    // telemetry-derived state. For now, forced exits are the primary trigger.
    const changedDrones = new Set(forcedChanges);

    // 4. If any changes, compute blast radius and re-solve
    let assignments: Assignment[] = [];
    if (changedDrones.size > 0) {
      const affected = computeCascadingBlastRadius(
        Array.from(changedDrones),
        this.world,
      );
      assignments = solveAssignment(this.world, this.catalog, affected, this.objectives);
      this.applyAssignments(assignments);
    }

    // 5. Periodic role reassignment (1Hz)
    if (this.tickCount % this.config.roleReassignmentInterval === 0) {
      const roleChanges = assignRoles(
        this.world,
        this.formation,
        this.coverage,
        this.config.roleConfig,
        this.roleTickCounts,
      );

      if (roleChanges.size > 0) {
        // Role changes are structural (Δ ≠ 0) — re-solve for affected drones
        const affected = computeCascadingBlastRadius(
          Array.from(roleChanges.keys()),
          this.world,
        );

        // Apply role changes to world model first
        for (const [droneId, newRole] of roleChanges) {
          const drone = this.world.getDrone(droneId);
          if (drone) {
            this.world.updatePattern(
              droneId,
              drone.currentPattern,
              drone.coordinate.sigma,
              drone.coordinate.kappa,
              newRole,
              drone.coordinate.lambda,
            );
          }
        }

        // Then re-solve assignments
        const roleAssignments = solveAssignment(this.world, this.catalog, affected, this.objectives);
        this.applyAssignments(roleAssignments);
        assignments = assignments.concat(roleAssignments);
      }

      // Increment role tick counters
      for (const droneId of this.world.getActiveDroneIds()) {
        this.roleTickCounts.set(droneId, (this.roleTickCounts.get(droneId) ?? 0) + 1);
      }

      // Reset counters for drones that changed role
      for (const droneId of roleChanges.keys()) {
        this.roleTickCounts.set(droneId, 0);
      }
    }

    this.onTick?.(this.tickCount, assignments);
    return assignments;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private handleTelemetry(telemetry: DroneTelemetry): void {
    // Update world model with new sensor data
    const drone = this.world.getDrone(telemetry.droneId);
    if (drone) {
      this.world.updateTelemetry(telemetry.droneId, telemetry.state);
    }
    // Note: if drone is unknown, it should be added via addDrone first
    // during the initialization/connect phase.
  }

  private applyAssignments(assignments: Assignment[]): void {
    for (const assignment of assignments) {
      const pattern = lookupPattern(this.catalog, assignment.patternId);
      if (!pattern) continue;

      // Update world model
      this.world.updatePattern(
        assignment.droneId,
        assignment.patternId,
        pattern.core.sigma,
        pattern.core.kappa,
        pattern.core.chi,
        pattern.core.lambda,
      );

      // Send command to drone
      const numericId = this.patternIdMap.get(assignment.patternId) ?? 0;
      const cmd: DroneCommand = {
        patternId: numericId,
        targetPos: assignment.targetPos ?? { x: 0, y: 0, z: 0 },
        targetVel: assignment.targetVel ?? { x: 0, y: 0, z: 0 },
        flags: 0,
      };

      // Fire-and-forget — don't await in the hot loop
      this.comms.sendCommand(assignment.droneId, cmd).catch(() => {
        // Packet loss is expected; drone continues last pattern
      });
    }
  }

  private async landAll(): Promise<void> {
    // Find land or emergency-land patterns for each drone's hardware
    for (const drone of this.world.drones.values()) {
      const landPatterns = Array.from(this.catalog.patterns.values()).filter(
        (p) => p.core.rho === drone.coordinate.rho
          && p.core.tau === drone.coordinate.tau
          && (p.core.sigma === 'land' || p.core.sigma === 'grounded'),
      );

      if (landPatterns.length > 0) {
        const landPattern = landPatterns[0]!;
        const numericId = this.patternIdMap.get(landPattern.id) ?? 0;
        await this.comms.sendCommand(drone.id, {
          patternId: numericId,
          targetPos: drone.lastTelemetry.position,
          targetVel: { x: 0, y: 0, z: 0 },
          flags: 0,
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register a drone with the coordinator.
   * Called during initialization after connecting.
   */
  registerDrone(
    id: string,
    rho: 'crazyflie-2.1' | 'crazyflie-bl' | 'esp-drone' | 'sim-gazebo' | 'sim-simple',
    tau: 'bare' | 'solar-equipped' | 'battery-carrier' | 'camera-equipped' | 'sensor-extended' | 'dual-deck',
    initialPattern: string,
    telemetry: SensorState,
  ): void {
    this.world.addDrone(id, rho, tau, initialPattern, telemetry);
  }

  /** Get the current tick count. */
  get currentTick(): number {
    return this.tickCount;
  }

  /** Whether the coordinator is running. */
  get isRunning(): boolean {
    return this.running;
  }
}

// Re-import for registerDrone parameter types
import type { SensorState } from '../types/dimensions.js';
