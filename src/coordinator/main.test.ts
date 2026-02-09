import { describe, it, expect, vi, afterEach } from 'vitest';
import { Coordinator } from './main.js';
import { SimComms, type SimDrone } from './comms.js';
import type { BehavioralCatalog } from '../catalog/types.js';
import type { BehavioralPattern, CompatibilityRule } from '../catalog/types.js';
import type { SensorState, Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeSensorState(pos: Vec3, battery = 0.8): SensorState {
  return {
    position: pos,
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0 },
    angular_velocity: { x: 0, y: 0, z: 0 },
    battery: { voltage: 3.7, percentage: battery, discharge_rate: 2.5, estimated_remaining: 300 },
    position_quality: 0.95,
    wind_estimate: { x: 0, y: 0, z: 0 },
  };
}

function makeSimDrone(id: string, x = 0, y = 0, z = 1, battery = 0.8): SimDrone {
  return {
    id,
    state: makeSensorState({ x, y, z }, battery),
    currentPatternId: 0,
    statusFlags: 0,
    batteryDrainRate: 0.0, // No drain for tests unless specified
  };
}

function makePattern(
  id: string,
  sigma: string,
  kappa: string,
  chi: string,
  rho = 'sim-gazebo',
  tau = 'bare',
  batteryFloor = 0.1,
  overrides: Partial<BehavioralPattern> = {},
): BehavioralPattern {
  return {
    id,
    core: {
      sigma: sigma as any,
      kappa: kappa as any,
      chi: chi as any,
      lambda: 'shared-corridor' as any,
      tau: tau as any,
      rho: rho as any,
    },
    description: `Test pattern ${id}`,
    preconditions: {
      battery_floor: batteryFloor,
      position_quality_floor: 0.3,
      min_references: 0,
      valid_from: [],
      hardware_requirements: [],
    },
    postconditions: {
      valid_to: [],
      forced_exits: [],
    },
    generator: {
      type: 'position-hold' as any,
      defaults: { altitude: 1.0 },
      bounds: { altitude: { min: 0.2, max: 2.5 } },
    },
    verification: {
      status: 'unverified',
      collision_clearance_m: 0.3,
      max_velocity_ms: 1.0,
      max_acceleration_ms2: 2.0,
      energy_rate_js: 5.0,
      max_duration_s: 420,
      verified_transitions: [],
    },
    ...overrides,
  };
}

function makeTestCatalog(): BehavioralCatalog {
  const patterns = new Map<string, BehavioralPattern>();

  // Hover patterns
  const hoverPerf = makePattern('hover-autonomous-performer-bare.sim-gazebo', 'hover', 'autonomous', 'performer');
  hoverPerf.preconditions.valid_from = [
    'grounded-autonomous-reserve-bare.sim-gazebo',
    'takeoff-autonomous-performer-bare.sim-gazebo',
    'hover-autonomous-performer-bare.sim-gazebo',
    'translate-autonomous-performer-bare.sim-gazebo',
  ];
  hoverPerf.postconditions.valid_to = [
    'translate-autonomous-performer-bare.sim-gazebo',
    'land-autonomous-performer-bare.sim-gazebo',
    'hover-autonomous-performer-bare.sim-gazebo',
  ];
  patterns.set(hoverPerf.id, hoverPerf);

  // Translate
  const translatePerf = makePattern('translate-autonomous-performer-bare.sim-gazebo', 'translate', 'autonomous', 'performer');
  translatePerf.preconditions.valid_from = ['hover-autonomous-performer-bare.sim-gazebo', 'translate-autonomous-performer-bare.sim-gazebo'];
  translatePerf.postconditions.valid_to = ['hover-autonomous-performer-bare.sim-gazebo', 'translate-autonomous-performer-bare.sim-gazebo'];
  patterns.set(translatePerf.id, translatePerf);

  // Takeoff
  const takeoff = makePattern('takeoff-autonomous-performer-bare.sim-gazebo', 'takeoff', 'autonomous', 'performer');
  takeoff.preconditions.valid_from = ['grounded-autonomous-reserve-bare.sim-gazebo'];
  takeoff.postconditions.valid_to = ['hover-autonomous-performer-bare.sim-gazebo'];
  patterns.set(takeoff.id, takeoff);

  // Land
  const land = makePattern('land-autonomous-performer-bare.sim-gazebo', 'land', 'autonomous', 'performer');
  land.preconditions.valid_from = ['hover-autonomous-performer-bare.sim-gazebo'];
  land.postconditions.valid_to = ['grounded-autonomous-reserve-bare.sim-gazebo'];
  patterns.set(land.id, land);

  // Grounded
  const grounded = makePattern('grounded-autonomous-reserve-bare.sim-gazebo', 'grounded', 'autonomous', 'reserve', 'sim-gazebo', 'bare', 0);
  grounded.preconditions.valid_from = ['land-autonomous-performer-bare.sim-gazebo', 'grounded-autonomous-reserve-bare.sim-gazebo'];
  grounded.postconditions.valid_to = ['takeoff-autonomous-performer-bare.sim-gazebo', 'grounded-autonomous-reserve-bare.sim-gazebo'];
  grounded.generator.type = 'idle' as any;
  patterns.set(grounded.id, grounded);

  // Emergency land
  const emergLand = makePattern('land-emergency-performer-bare.sim-gazebo', 'land', 'emergency', 'performer', 'sim-gazebo', 'bare', 0);
  emergLand.preconditions.valid_from = []; // Emergency — always available
  emergLand.postconditions.valid_to = ['grounded-autonomous-reserve-bare.sim-gazebo'];
  patterns.set(emergLand.id, emergLand);

  const compatibility: CompatibilityRule[] = [
    { pattern_a: '*', pattern_b: '*', compatible: true, min_separation_m: 0.3 },
  ];

  return { patterns, compatibility };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Coordinator — initialization', () => {
  it('creates with config and catalog', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog, { tickIntervalMs: 100 });

    expect(coord.isRunning).toBe(false);
    expect(coord.currentTick).toBe(0);
  });

  it('registers drones into world model', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog);

    coord.registerDrone('d1', 'sim-gazebo', 'bare', 'grounded-autonomous-reserve-bare.sim-gazebo', makeSensorState({ x: 0, y: 0, z: 0 }));
    expect(coord.world.size).toBe(1);
    expect(coord.world.getDrone('d1')).toBeDefined();
  });
});

describe('Coordinator — tick', () => {
  it('runs a tick without crashing on empty swarm', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog);

    const assignments = coord.tick();
    expect(assignments).toEqual([]);
    expect(coord.currentTick).toBe(1);
  });

  it('runs multiple ticks', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog);

    coord.registerDrone('d1', 'sim-gazebo', 'bare', 'hover-autonomous-performer-bare.sim-gazebo', makeSensorState({ x: 0, y: 0, z: 1 }));

    for (let i = 0; i < 10; i++) {
      coord.tick();
    }
    expect(coord.currentTick).toBe(10);
  });

  it('invokes onTick callback', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog);

    const ticks: number[] = [];
    coord.onTick = (tick) => ticks.push(tick);

    coord.tick();
    coord.tick();
    coord.tick();

    expect(ticks).toEqual([1, 2, 3]);
  });
});

describe('Coordinator — role reassignment', () => {
  it('runs role reassignment at configured interval', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog, {
      roleReassignmentInterval: 5, // Every 5 ticks for testing
    });

    coord.registerDrone('d1', 'sim-gazebo', 'bare', 'hover-autonomous-performer-bare.sim-gazebo', makeSensorState({ x: 0, y: 0, z: 1 }));

    // Run 5 ticks — role reassignment should happen on tick 5
    for (let i = 0; i < 5; i++) {
      coord.tick();
    }
    expect(coord.currentTick).toBe(5);
  });
});

describe('Coordinator — start/stop lifecycle', () => {
  it('starts and stops cleanly', async () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1'));
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog, { tickIntervalMs: 50 });

    coord.registerDrone('d1', 'sim-gazebo', 'bare', 'grounded-autonomous-reserve-bare.sim-gazebo', makeSensorState({ x: 0, y: 0, z: 0 }));

    let shutdownCalled = false;
    coord.onShutdown = () => { shutdownCalled = true; };

    await coord.start(['d1']);
    expect(coord.isRunning).toBe(true);

    // Let it run a couple ticks
    await new Promise((r) => setTimeout(r, 120));

    await coord.stop();
    expect(coord.isRunning).toBe(false);
    expect(shutdownCalled).toBe(true);
    expect(coord.currentTick).toBeGreaterThan(0);
  });
});

describe('Coordinator — telemetry handling', () => {
  it('updates world model from telemetry', async () => {
    const sim = new SimComms(50);
    sim.addSimDrone(makeSimDrone('d1', 0, 0, 1, 0.9));
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog, { tickIntervalMs: 50 });

    coord.registerDrone('d1', 'sim-gazebo', 'bare', 'hover-autonomous-performer-bare.sim-gazebo', makeSensorState({ x: 0, y: 0, z: 1 }, 0.9));

    await coord.start(['d1']);

    // Move the sim drone
    sim.updateSimDronePosition('d1', { x: 2, y: 3, z: 1.5 });

    // Wait for telemetry cycle
    await new Promise((r) => setTimeout(r, 120));

    await coord.stop();

    // World model should have updated position
    const drone = coord.world.getDrone('d1');
    expect(drone).toBeDefined();
    expect(drone!.lastTelemetry.position.x).toBe(2);
    expect(drone!.lastTelemetry.position.y).toBe(3);
  });
});

describe('Coordinator — 3-drone integration', () => {
  it('manages a 3-drone swarm through ticks', () => {
    const sim = new SimComms(1000);
    const catalog = makeTestCatalog();
    const coord = new Coordinator(sim, catalog, {
      tickIntervalMs: 100,
      roleReassignmentInterval: 5,
    });

    // Register 3 drones in triangle
    coord.registerDrone('d1', 'sim-gazebo', 'bare', 'hover-autonomous-performer-bare.sim-gazebo', makeSensorState({ x: 0, y: 0, z: 1 }));
    coord.registerDrone('d2', 'sim-gazebo', 'bare', 'hover-autonomous-performer-bare.sim-gazebo', makeSensorState({ x: 1, y: 0, z: 1 }));
    coord.registerDrone('d3', 'sim-gazebo', 'bare', 'hover-autonomous-performer-bare.sim-gazebo', makeSensorState({ x: 0.5, y: 0.87, z: 1 }));

    coord.formation = {
      minPerformers: 2,
      needsLeader: true,
      center: { x: 0.5, y: 0.29, z: 1 },
    };

    expect(coord.world.size).toBe(3);

    // Run 10 ticks — including 2 role reassignments
    for (let i = 0; i < 10; i++) {
      coord.tick();
    }

    // All drones should still be tracked
    expect(coord.world.size).toBe(3);
    expect(coord.currentTick).toBe(10);
  });
});
