/**
 * Seshat Swarm — Communication Interface
 *
 * Abstraction layer between the coordinator and drone radio.
 * The same interface is used for simulation (SimComms) and real
 * hardware (CflibBridge). The coordinator doesn't care which.
 *
 * Packet sizes:
 *   Command (ground → drone): 20 bytes
 *   Telemetry (drone → ground): 18 bytes
 *   10 drones × 38 bytes × 100Hz = 38KB/s (well within radio capacity)
 */

import type { SensorState, Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Command & Telemetry Types
// ---------------------------------------------------------------------------

/** Ground station → drone command. Matches GroundCommand in firmware/types.h. */
export interface DroneCommand {
  /** Pattern index in the onboard catalog */
  patternId: number;
  /** Target position (meters) */
  targetPos: Vec3;
  /** Target velocity (m/s) */
  targetVel: Vec3;
  /** Command flags */
  flags: number;
}

/** Drone → ground station telemetry. Matches TelemetryPacket in firmware/types.h. */
export interface DroneTelemetry {
  /** Drone identifier (from radio address) */
  droneId: string;
  /** Sensor state (decoded from packet) */
  state: SensorState;
  /** Currently executing pattern ID */
  currentPatternId: number;
  /** Status flags */
  statusFlags: number;
}

/** Command flag bits (matching CMD_FLAG_* in types.h). */
export const CmdFlags = {
  EMERGENCY: 1 << 0,
  STYLE_UPDATE: 1 << 1,
  FORCE_PATTERN: 1 << 2,
} as const;

/** Telemetry status flag bits (matching TELEM_FLAG_* in types.h). */
export const TelemFlags = {
  AIRBORNE: 1 << 0,
  PATTERN_ACTIVE: 1 << 1,
  EMERGENCY: 1 << 2,
  LOW_BATTERY: 1 << 3,
  COMM_LOST: 1 << 4,
} as const;

// ---------------------------------------------------------------------------
// DroneComms Interface
// ---------------------------------------------------------------------------

/** Callback for receiving telemetry from a drone. */
export type TelemetryCallback = (telemetry: DroneTelemetry) => void;

/**
 * Abstract communication interface.
 * Implemented by SimComms (simulation) and CflibBridge (real hardware).
 */
export interface DroneComms {
  /** Send a command to a specific drone. */
  sendCommand(droneId: string, cmd: DroneCommand): Promise<void>;

  /** Register a callback for incoming telemetry. */
  onTelemetry(callback: TelemetryCallback): void;

  /** Connect to a set of drones. */
  connect(droneIds: string[]): Promise<void>;

  /** Disconnect from all drones. */
  disconnect(): Promise<void>;

  /** Whether the comms layer is currently connected. */
  readonly connected: boolean;
}

// ---------------------------------------------------------------------------
// SimComms — In-process simulation adapter
// ---------------------------------------------------------------------------

/** Simulated drone state for SimComms. */
export interface SimDrone {
  id: string;
  state: SensorState;
  currentPatternId: number;
  statusFlags: number;
  /** Battery drain rate (percentage per second). */
  batteryDrainRate: number;
}

/**
 * In-process simulation communication adapter.
 * No external simulator needed — drones are simple state objects.
 * Useful for unit testing and early integration testing.
 */
export class SimComms implements DroneComms {
  private _connected = false;
  private _drones: Map<string, SimDrone> = new Map();
  private _callbacks: TelemetryCallback[] = [];
  private _telemetryInterval: ReturnType<typeof setInterval> | null = null;

  /** Telemetry broadcast rate in ms. */
  readonly telemetryRateMs: number;

  constructor(telemetryRateMs: number = 10) {
    this.telemetryRateMs = telemetryRateMs;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** Access simulated drones for test manipulation. */
  get simDrones(): ReadonlyMap<string, SimDrone> {
    return this._drones;
  }

  /**
   * Add a simulated drone with initial state.
   */
  addSimDrone(drone: SimDrone): void {
    this._drones.set(drone.id, drone);
  }

  /**
   * Update a simulated drone's position (for test scenarios).
   */
  updateSimDronePosition(droneId: string, position: Vec3): void {
    const drone = this._drones.get(droneId);
    if (drone) {
      drone.state.position = position;
    }
  }

  async connect(droneIds: string[]): Promise<void> {
    // In sim mode, drones should already be added via addSimDrone.
    // Just verify they exist.
    for (const id of droneIds) {
      if (!this._drones.has(id)) {
        throw new Error(`Simulated drone "${id}" not found. Call addSimDrone() first.`);
      }
    }
    this._connected = true;

    // Start periodic telemetry broadcast
    this._telemetryInterval = setInterval(() => {
      this.broadcastTelemetry();
    }, this.telemetryRateMs);
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    if (this._telemetryInterval) {
      clearInterval(this._telemetryInterval);
      this._telemetryInterval = null;
    }
  }

  async sendCommand(droneId: string, cmd: DroneCommand): Promise<void> {
    if (!this._connected) throw new Error('Not connected');

    const drone = this._drones.get(droneId);
    if (!drone) return;

    // Simulate receiving the command: update pattern ID
    drone.currentPatternId = cmd.patternId;

    // Simulate basic position tracking toward target
    if (cmd.flags & CmdFlags.EMERGENCY) {
      drone.statusFlags |= TelemFlags.EMERGENCY;
    }
  }

  onTelemetry(callback: TelemetryCallback): void {
    this._callbacks.push(callback);
  }

  /**
   * Broadcast telemetry from all simulated drones.
   * Called automatically at telemetryRateMs intervals, or manually for tests.
   */
  broadcastTelemetry(): void {
    for (const drone of this._drones.values()) {
      // Simulate battery drain
      drone.state.battery.percentage = Math.max(
        0,
        drone.state.battery.percentage - drone.batteryDrainRate * (this.telemetryRateMs / 1000),
      );

      const telemetry: DroneTelemetry = {
        droneId: drone.id,
        state: { ...drone.state },
        currentPatternId: drone.currentPatternId,
        statusFlags: drone.statusFlags,
      };

      for (const cb of this._callbacks) {
        cb(telemetry);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CflibBridge — Stub for real hardware (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Bridge to cflib Python process for real Crazyradio communication.
 * The TS coordinator spawns a thin Python process that does only
 * send/recv bytes via cflib. Intelligence stays in TypeScript.
 *
 * NOT IMPLEMENTED YET — stub for interface compliance.
 * Will be implemented in Phase 6 (Hardware Integration).
 */
export class CflibBridge implements DroneComms {
  get connected(): boolean {
    return false;
  }

  async connect(_droneIds: string[]): Promise<void> {
    throw new Error('CflibBridge not implemented. Use SimComms for pre-hardware phases.');
  }

  async disconnect(): Promise<void> {
    throw new Error('CflibBridge not implemented.');
  }

  async sendCommand(_droneId: string, _cmd: DroneCommand): Promise<void> {
    throw new Error('CflibBridge not implemented.');
  }

  onTelemetry(_callback: TelemetryCallback): void {
    throw new Error('CflibBridge not implemented.');
  }
}
