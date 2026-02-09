import { describe, it, expect, vi, afterEach } from 'vitest';
import { SimComms, CmdFlags, TelemFlags, type SimDrone, type DroneTelemetry } from './comms.js';
import type { SensorState } from '../types/dimensions.js';

function makeSimDrone(id: string, x = 0, y = 0, z = 1, battery = 0.8): SimDrone {
  return {
    id,
    state: {
      position: { x, y, z },
      velocity: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0 },
      angular_velocity: { x: 0, y: 0, z: 0 },
      battery: { voltage: 3.7, percentage: battery, discharge_rate: 2.5, estimated_remaining: 300 },
      position_quality: 0.95,
      wind_estimate: { x: 0, y: 0, z: 0 },
    },
    currentPatternId: 0,
    statusFlags: 0,
    batteryDrainRate: 0.001,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SimComms — connection', () => {
  it('connects to pre-added simulated drones', async () => {
    const sim = new SimComms(1000); // Slow rate for tests
    sim.addSimDrone(makeSimDrone('d1'));
    sim.addSimDrone(makeSimDrone('d2'));

    await sim.connect(['d1', 'd2']);
    expect(sim.connected).toBe(true);
    await sim.disconnect();
  });

  it('throws on connect if drone not added', async () => {
    const sim = new SimComms(1000);
    await expect(sim.connect(['d1'])).rejects.toThrow('not found');
  });

  it('disconnects cleanly', async () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1'));
    await sim.connect(['d1']);
    await sim.disconnect();
    expect(sim.connected).toBe(false);
  });
});

describe('SimComms — commands', () => {
  it('updates drone pattern on command', async () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1'));
    await sim.connect(['d1']);

    await sim.sendCommand('d1', {
      patternId: 42,
      targetPos: { x: 1, y: 0, z: 1 },
      targetVel: { x: 0, y: 0, z: 0 },
      flags: 0,
    });

    expect(sim.simDrones.get('d1')!.currentPatternId).toBe(42);
    await sim.disconnect();
  });

  it('sets emergency flag on drone', async () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1'));
    await sim.connect(['d1']);

    await sim.sendCommand('d1', {
      patternId: 0,
      targetPos: { x: 0, y: 0, z: 0 },
      targetVel: { x: 0, y: 0, z: 0 },
      flags: CmdFlags.EMERGENCY,
    });

    expect(sim.simDrones.get('d1')!.statusFlags & TelemFlags.EMERGENCY).toBeTruthy();
    await sim.disconnect();
  });

  it('throws if not connected', async () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1'));

    await expect(
      sim.sendCommand('d1', { patternId: 0, targetPos: { x: 0, y: 0, z: 0 }, targetVel: { x: 0, y: 0, z: 0 }, flags: 0 }),
    ).rejects.toThrow('Not connected');
  });
});

describe('SimComms — telemetry', () => {
  it('broadcasts telemetry to registered callbacks', async () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1'));
    sim.addSimDrone(makeSimDrone('d2'));

    const received: DroneTelemetry[] = [];
    sim.onTelemetry((t) => received.push(t));

    await sim.connect(['d1', 'd2']);
    sim.broadcastTelemetry(); // Manual trigger

    expect(received).toHaveLength(2);
    expect(received.map((t) => t.droneId).sort()).toEqual(['d1', 'd2']);
    await sim.disconnect();
  });

  it('includes battery, position, and pattern in telemetry', () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1', 1.5, 2.0, 1.0, 0.75));
    sim.simDrones.get('d1')!.currentPatternId = 7;

    const received: DroneTelemetry[] = [];
    sim.onTelemetry((t) => received.push(t));
    sim.broadcastTelemetry();

    const t = received[0]!;
    expect(t.state.position.x).toBe(1.5);
    expect(t.state.position.y).toBe(2.0);
    expect(t.state.battery.percentage).toBeCloseTo(0.75, 2);
    expect(t.currentPatternId).toBe(7);
  });

  it('simulates battery drain over time', () => {
    const sim = new SimComms(100); // 100ms telemetry rate
    const drone = makeSimDrone('d1', 0, 0, 1, 1.0);
    drone.batteryDrainRate = 0.1; // 10% per second
    sim.addSimDrone(drone);

    // Broadcast 10 times at 100ms intervals = 1 second
    for (let i = 0; i < 10; i++) {
      sim.broadcastTelemetry();
    }

    // Should have drained ~10% (0.1 per second × 1 second)
    expect(sim.simDrones.get('d1')!.state.battery.percentage).toBeCloseTo(0.9, 1);
  });

  it('battery never goes below 0', () => {
    const sim = new SimComms(1000);
    const drone = makeSimDrone('d1', 0, 0, 1, 0.01);
    drone.batteryDrainRate = 1.0; // 100% per second, will overshoot
    sim.addSimDrone(drone);

    sim.broadcastTelemetry();
    expect(sim.simDrones.get('d1')!.state.battery.percentage).toBe(0);
  });
});

describe('SimComms — drone position updates', () => {
  it('allows test code to move simulated drones', () => {
    const sim = new SimComms(1000);
    sim.addSimDrone(makeSimDrone('d1', 0, 0, 1));
    sim.updateSimDronePosition('d1', { x: 5, y: 3, z: 2 });

    expect(sim.simDrones.get('d1')!.state.position).toEqual({ x: 5, y: 3, z: 2 });
  });
});

describe('CflibBridge — stub', () => {
  it('throws not implemented', async () => {
    const { CflibBridge } = await import('./comms.js');
    const bridge = new CflibBridge();
    expect(bridge.connected).toBe(false);
    await expect(bridge.connect(['d1'])).rejects.toThrow('not implemented');
  });
});
