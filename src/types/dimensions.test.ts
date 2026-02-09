import { describe, it, expect } from 'vitest';
import {
  BEHAVIORAL_MODES,
  AUTONOMY_LEVELS,
  FORMATION_ROLES,
  RESOURCE_OWNERSHIPS,
  PHYSICAL_TRAITS,
  HARDWARE_TARGETS,
  GENERATOR_TYPES,
  extractCore,
  corePatternKey,
  type DroneCoordinate,
  type CorePattern,
} from './dimensions.js';

describe('Structural dimension enums', () => {
  it('σ has 15 behavioral modes', () => {
    expect(BEHAVIORAL_MODES).toHaveLength(15);
  });

  it('κ has 4 autonomy levels', () => {
    expect(AUTONOMY_LEVELS).toHaveLength(4);
  });

  it('χ has 10 formation roles', () => {
    expect(FORMATION_ROLES).toHaveLength(10);
  });

  it('λ has 7 resource ownerships', () => {
    expect(RESOURCE_OWNERSHIPS).toHaveLength(7);
  });

  it('τ has 6 physical traits', () => {
    expect(PHYSICAL_TRAITS).toHaveLength(6);
  });

  it('ρ has 5 hardware targets', () => {
    expect(HARDWARE_TARGETS).toHaveLength(5);
  });

  it('generator types has 8 entries', () => {
    expect(GENERATOR_TYPES).toHaveLength(8);
  });

  it('all enum arrays have unique values', () => {
    for (const arr of [
      BEHAVIORAL_MODES,
      AUTONOMY_LEVELS,
      FORMATION_ROLES,
      RESOURCE_OWNERSHIPS,
      PHYSICAL_TRAITS,
      HARDWARE_TARGETS,
      GENERATOR_TYPES,
    ]) {
      expect(new Set(arr).size).toBe(arr.length);
    }
  });
});

describe('CorePattern', () => {
  it('contains exactly the 6 structural dimensions', () => {
    const core: CorePattern = {
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
    };
    const keys = Object.keys(core).sort();
    expect(keys).toEqual(['chi', 'kappa', 'lambda', 'rho', 'sigma', 'tau']);
  });
});

describe('DroneCoordinate', () => {
  const coord: DroneCoordinate = {
    sigma: 'hover',
    kappa: 'autonomous',
    chi: 'performer',
    lambda: 'shared-corridor',
    tau: 'bare',
    rho: 'crazyflie-2.1',
    epsilon: {
      neighbors: ['drone-2'],
      leader: null,
      followers: [],
      relay_target: null,
      relay_source: null,
      dock_target: null,
      base_stations: ['bs-1', 'bs-2'],
    },
    delta: {
      position: { x: 0, y: 0, z: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0 },
      angular_velocity: { x: 0, y: 0, z: 0 },
      battery: {
        voltage: 3.7,
        percentage: 0.85,
        discharge_rate: 2.5,
        estimated_remaining: 420,
      },
      position_quality: 0.95,
      wind_estimate: { x: 0, y: 0, z: 0 },
    },
    sigma_upper: 'hover-at-position',
  };

  it('contains all 9 dimensions', () => {
    expect(coord).toHaveProperty('sigma');
    expect(coord).toHaveProperty('kappa');
    expect(coord).toHaveProperty('chi');
    expect(coord).toHaveProperty('lambda');
    expect(coord).toHaveProperty('tau');
    expect(coord).toHaveProperty('rho');
    expect(coord).toHaveProperty('epsilon');
    expect(coord).toHaveProperty('delta');
    expect(coord).toHaveProperty('sigma_upper');
  });

  it('SensorState includes position, velocity, orientation, battery, position_quality', () => {
    expect(coord.delta).toHaveProperty('position');
    expect(coord.delta).toHaveProperty('velocity');
    expect(coord.delta).toHaveProperty('orientation');
    expect(coord.delta).toHaveProperty('battery');
    expect(coord.delta).toHaveProperty('position_quality');
  });

  it('NeighborGraph includes neighbors, leader, followers, relay relationships', () => {
    expect(coord.epsilon).toHaveProperty('neighbors');
    expect(coord.epsilon).toHaveProperty('leader');
    expect(coord.epsilon).toHaveProperty('followers');
    expect(coord.epsilon).toHaveProperty('relay_target');
    expect(coord.epsilon).toHaveProperty('relay_source');
  });
});

describe('extractCore', () => {
  it('extracts only structural dimensions', () => {
    const coord: DroneCoordinate = {
      sigma: 'orbit',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      epsilon: {
        neighbors: [],
        leader: null,
        followers: [],
        relay_target: null,
        relay_source: null,
        dock_target: null,
        base_stations: [],
      },
      delta: {
        position: { x: 1, y: 2, z: 1 },
        velocity: { x: 0.5, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0.3 },
        angular_velocity: { x: 0, y: 0, z: 0 },
        battery: {
          voltage: 3.5,
          percentage: 0.6,
          discharge_rate: 3.0,
          estimated_remaining: 240,
        },
        position_quality: 0.9,
        wind_estimate: { x: 0, y: 0, z: 0 },
      },
      sigma_upper: 'orbiting-center',
    };

    const core = extractCore(coord);
    expect(Object.keys(core).sort()).toEqual(['chi', 'kappa', 'lambda', 'rho', 'sigma', 'tau']);
    expect(core.sigma).toBe('orbit');
    expect(core.kappa).toBe('autonomous');
    expect(core).not.toHaveProperty('epsilon');
    expect(core).not.toHaveProperty('delta');
    expect(core).not.toHaveProperty('sigma_upper');
  });
});

describe('corePatternKey', () => {
  it('produces the catalog filename convention', () => {
    const key = corePatternKey({
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
    });
    expect(key).toBe('hover-autonomous-performer-bare.crazyflie-2.1');
  });

  it('produces the same key for the same structural coordinates', () => {
    const core: CorePattern = {
      sigma: 'orbit',
      kappa: 'operator-guided',
      chi: 'leader',
      lambda: 'exclusive-volume',
      tau: 'camera-equipped',
      rho: 'sim-gazebo',
    };
    expect(corePatternKey(core)).toBe(corePatternKey({ ...core }));
  });
});
