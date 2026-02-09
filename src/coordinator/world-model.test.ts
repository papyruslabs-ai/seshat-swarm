import { describe, it, expect } from 'vitest';
import { WorldModel, vec3Distance } from './world-model.js';
import type { SensorState, Vec3 } from '../types/dimensions.js';

function makeTelemetry(pos: Vec3, battery = 0.8): SensorState {
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

describe('WorldModel — drone management', () => {
  it('adds and retrieves drones', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover-autonomous-performer-bare.crazyflie-2.1', makeTelemetry({ x: 0, y: 0, z: 1 }));
    expect(wm.size).toBe(1);
    expect(wm.getDrone('d1')).toBeDefined();
    expect(wm.getDrone('d1')!.id).toBe('d1');
  });

  it('removes drones', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'grounded', makeTelemetry({ x: 0, y: 0, z: 0 }));
    expect(wm.removeDrone('d1')).toBe(true);
    expect(wm.size).toBe(0);
    expect(wm.removeDrone('nonexistent')).toBe(false);
  });

  it('tracks N drones with full 9D coordinates', () => {
    const wm = new WorldModel();
    for (let i = 0; i < 10; i++) {
      wm.addDrone(`d${i}`, 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: i * 0.5, y: 0, z: 1 }));
    }
    expect(wm.size).toBe(10);
    const d5 = wm.getDrone('d5');
    expect(d5?.coordinate.sigma).toBe('grounded');
    expect(d5?.coordinate.rho).toBe('crazyflie-2.1');
    expect(d5?.coordinate.delta.position.x).toBe(2.5);
  });

  it('getActiveDroneIds excludes stale drones', () => {
    const wm = new WorldModel({ staleThresholdMs: 100 });
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.addDrone('d2', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 1, y: 0, z: 1 }));

    // Make d1 stale
    wm.getDrone('d1')!.lastUpdate = Date.now() - 200;
    wm.markStaleDrones();

    const active = wm.getActiveDroneIds();
    expect(active).toContain('d2');
    expect(active).not.toContain('d1');
  });
});

describe('WorldModel — telemetry updates', () => {
  it('updates sensor data and timestamp', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));

    const before = wm.getDrone('d1')!.lastUpdate;
    wm.updateTelemetry('d1', makeTelemetry({ x: 1, y: 0, z: 1 }, 0.7));

    const d1 = wm.getDrone('d1')!;
    expect(d1.lastTelemetry.position.x).toBe(1);
    expect(d1.coordinate.delta.position.x).toBe(1);
    expect(d1.lastTelemetry.battery.percentage).toBe(0.7);
    expect(d1.lastUpdate).toBeGreaterThanOrEqual(before);
  });

  it('ignores telemetry for unknown drones', () => {
    const wm = new WorldModel();
    // Should not throw
    wm.updateTelemetry('unknown', makeTelemetry({ x: 0, y: 0, z: 0 }));
    expect(wm.size).toBe(0);
  });
});

describe('WorldModel — neighbor graph (ε)', () => {
  it('computes neighbors within communication range', () => {
    const wm = new WorldModel({ commRange: 2.0 });
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.addDrone('d2', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 1, y: 0, z: 1 }));
    wm.addDrone('d3', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 10, y: 0, z: 1 }));

    // Recompute after all drones are added
    wm.updateTelemetry('d1', makeTelemetry({ x: 0, y: 0, z: 1 }));

    const graph = wm.getNeighborGraph('d1')!;
    expect(graph.neighbors).toContain('d2');
    expect(graph.neighbors).not.toContain('d3'); // too far
  });

  it('updates neighbor graph on telemetry update', () => {
    const wm = new WorldModel({ commRange: 2.0 });
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.addDrone('d2', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 10, y: 0, z: 1 }));

    // d2 is out of range
    wm.updateTelemetry('d1', makeTelemetry({ x: 0, y: 0, z: 1 }));
    expect(wm.getNeighborGraph('d1')!.neighbors).not.toContain('d2');

    // Move d2 close
    wm.updateTelemetry('d2', makeTelemetry({ x: 1, y: 0, z: 1 }));
    wm.updateTelemetry('d1', makeTelemetry({ x: 0, y: 0, z: 1 }));
    expect(wm.getNeighborGraph('d1')!.neighbors).toContain('d2');
  });

  it('detects leader/follower relationships', () => {
    const wm = new WorldModel({ commRange: 5.0 });
    wm.addDrone('leader', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.addDrone('follower', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 1, y: 0, z: 1 }));

    // Assign roles
    wm.updatePattern('leader', 'hover-autonomous-leader-bare.crazyflie-2.1', 'hover', 'autonomous', 'leader', 'exclusive-volume');
    wm.updatePattern('follower', 'hover-autonomous-follower-bare.crazyflie-2.1', 'hover', 'autonomous', 'follower', 'shared-corridor');

    // Recompute neighbor graphs
    wm.updateTelemetry('follower', makeTelemetry({ x: 1, y: 0, z: 1 }));

    const followerGraph = wm.getNeighborGraph('follower')!;
    expect(followerGraph.leader).toBe('leader');
  });
});

describe('WorldModel — delta detection (Δ classifier)', () => {
  it('Δ = 0 when no structural dimensions change', () => {
    const wm = new WorldModel();
    // addDrone initializes to sigma=grounded, kappa=autonomous, chi=reserve, lambda=shared-corridor
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover-autonomous-performer', makeTelemetry({ x: 0, y: 0, z: 1 }));

    // Update with same structural coords as initial → no change
    const delta = wm.updatePattern('d1', 'grounded-autonomous-reserve', 'grounded', 'autonomous', 'reserve', 'shared-corridor');
    expect(delta.changed).toBe(false);
    expect(delta.structural).toBe(false);
    expect(delta.changedDimensions).toHaveLength(0);
  });

  it('Δ = 0 when updating with identical coordinates', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.updatePattern('d1', 'hover-auto-perf', 'hover', 'autonomous', 'performer', 'shared-corridor');

    // Update with same coords
    const delta = wm.updatePattern('d1', 'hover-auto-perf', 'hover', 'autonomous', 'performer', 'shared-corridor');
    expect(delta.changed).toBe(false);
    expect(delta.structural).toBe(false);
    expect(delta.changedDimensions).toHaveLength(0);
  });

  it('Δ ≠ 0 when sigma changes (behavioral change)', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.updatePattern('d1', 'hover', 'hover', 'autonomous', 'performer', 'shared-corridor');

    const delta = wm.updatePattern('d1', 'translate', 'translate', 'autonomous', 'performer', 'shared-corridor');
    expect(delta.structural).toBe(true);
    expect(delta.changedDimensions).toEqual(['sigma']);
  });

  it('Δ ≠ 0 when chi changes (role change)', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.updatePattern('d1', 'hover-perf', 'hover', 'autonomous', 'performer', 'shared-corridor');

    const delta = wm.updatePattern('d1', 'hover-leader', 'hover', 'autonomous', 'leader', 'exclusive-volume');
    expect(delta.structural).toBe(true);
    expect(delta.changedDimensions).toContain('chi');
    expect(delta.changedDimensions).toContain('lambda');
  });

  it('reports all changed dimensions', () => {
    const wm = new WorldModel();
    wm.addDrone('d1', 'crazyflie-2.1', 'bare', 'hover', makeTelemetry({ x: 0, y: 0, z: 1 }));
    wm.updatePattern('d1', 'hover', 'hover', 'autonomous', 'performer', 'shared-corridor');

    const delta = wm.updatePattern('d1', 'orbit', 'orbit', 'operator-guided', 'leader', 'exclusive-volume');
    expect(delta.changedDimensions).toContain('sigma');
    expect(delta.changedDimensions).toContain('kappa');
    expect(delta.changedDimensions).toContain('chi');
    expect(delta.changedDimensions).toContain('lambda');
  });
});

describe('vec3Distance', () => {
  it('returns 0 for same point', () => {
    expect(vec3Distance({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
  });

  it('computes correct distance', () => {
    expect(vec3Distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  it('works in 3D', () => {
    const d = vec3Distance({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(d).toBeCloseTo(Math.sqrt(3));
  });
});
