import { describe, it, expect } from 'vitest';
import { computeBlastRadius, computeCascadingBlastRadius } from './blast-radius.js';
import { WorldModel } from './world-model.js';
import type { SensorState, Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Create a WorldModel with the given comm range and add drones at specified
 * positions. Returns the model and drone IDs. Drones default to 'reserve'
 * role with 'grounded' mode.
 */
function buildSwarm(
  positions: Vec3[],
  commRange = 5.0,
): { world: WorldModel; ids: string[] } {
  const world = new WorldModel({ commRange });
  const ids: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const id = `d${i}`;
    ids.push(id);
    world.addDrone(id, 'crazyflie-2.1', 'bare', 'idle', makeTelemetry(positions[i]));
  }
  // Recompute neighbor graphs now that all drones are present
  for (const id of ids) {
    const drone = world.getDrone(id)!;
    world.updateTelemetry(id, drone.lastTelemetry);
  }
  return { world, ids };
}

// ---------------------------------------------------------------------------
// computeBlastRadius — basic tests
// ---------------------------------------------------------------------------

describe('computeBlastRadius', () => {
  it('single drone with no neighbors returns just itself', () => {
    const { world } = buildSwarm([{ x: 0, y: 0, z: 1 }]);
    const affected = computeBlastRadius('d0', world);
    expect(affected.size).toBe(1);
    expect(affected.has('d0')).toBe(true);
  });

  it('drone with 2 spatial neighbors includes all 3', () => {
    // All within commRange=5.0
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ]);

    const affected = computeBlastRadius('d0', world);
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(true);
    expect(affected.size).toBe(3);
  });

  it('drone far away is NOT in blast radius', () => {
    // d2 is far away (x=100), outside commRange=5.0
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 100, y: 0, z: 1 },
    ]);

    const affected = computeBlastRadius('d0', world);
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(false);
    expect(affected.size).toBe(2);
  });

  it('returns set with just the ID for unknown drone', () => {
    const { world } = buildSwarm([{ x: 0, y: 0, z: 1 }]);
    const affected = computeBlastRadius('nonexistent', world);
    expect(affected.size).toBe(1);
    expect(affected.has('nonexistent')).toBe(true);
  });

  it('does not check Delta -- always returns the blast radius set (caller responsibility)', () => {
    // Even without any state change (Delta = 0 scenario), computeBlastRadius
    // returns the full neighbor set. The Delta check is the caller's job.
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
    ]);

    const affected = computeBlastRadius('d0', world);
    expect(affected.size).toBe(2);
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeBlastRadius — role-dependent tests
// ---------------------------------------------------------------------------

describe('computeBlastRadius — role dependents', () => {
  it('leader changes -> all followers are affected', () => {
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },  // d0 = leader
      { x: 1, y: 0, z: 1 },  // d1 = follower
      { x: 2, y: 0, z: 1 },  // d2 = follower
      { x: 100, y: 0, z: 1 }, // d3 = follower (out of range, not in neighbor graph)
    ]);

    // Assign roles
    world.updatePattern('d0', 'hover-leader', 'hover', 'autonomous', 'leader', 'exclusive-volume');
    world.updatePattern('d1', 'hover-follower', 'hover', 'autonomous', 'follower', 'shared-corridor');
    world.updatePattern('d2', 'hover-follower', 'hover', 'autonomous', 'follower', 'shared-corridor');
    world.updatePattern('d3', 'hover-follower', 'hover', 'autonomous', 'follower', 'shared-corridor');

    // Recompute neighbor graphs to pick up role relationships
    for (const id of ['d0', 'd1', 'd2', 'd3']) {
      const drone = world.getDrone(id)!;
      world.updateTelemetry(id, drone.lastTelemetry);
    }

    const affected = computeBlastRadius('d0', world);
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);  // follower in range
    expect(affected.has('d2')).toBe(true);  // follower in range
    // d3 is out of comm range, so it won't appear as a follower in d0's neighbor graph
    expect(affected.has('d3')).toBe(false);
  });

  it('follower changes -> leader is affected', () => {
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },  // d0 = leader
      { x: 1, y: 0, z: 1 },  // d1 = follower
    ]);

    world.updatePattern('d0', 'hover-leader', 'hover', 'autonomous', 'leader', 'exclusive-volume');
    world.updatePattern('d1', 'hover-follower', 'hover', 'autonomous', 'follower', 'shared-corridor');

    // Recompute neighbor graphs
    for (const id of ['d0', 'd1']) {
      const drone = world.getDrone(id)!;
      world.updateTelemetry(id, drone.lastTelemetry);
    }

    const affected = computeBlastRadius('d1', world);
    expect(affected.has('d1')).toBe(true); // self
    expect(affected.has('d0')).toBe(true); // leader
  });

  it('relay changes -> relay_target is affected', () => {
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },  // d0 = relay
      { x: 1, y: 0, z: 1 },  // d1 = performer (relay target)
    ]);

    world.updatePattern('d0', 'relay-hold-relay', 'relay-hold', 'autonomous', 'relay', 'comm-bridge');
    world.updatePattern('d1', 'hover-performer', 'hover', 'autonomous', 'performer', 'shared-corridor');

    // Recompute neighbor graphs
    for (const id of ['d0', 'd1']) {
      const drone = world.getDrone(id)!;
      world.updateTelemetry(id, drone.lastTelemetry);
    }

    const affected = computeBlastRadius('d0', world);
    expect(affected.has('d0')).toBe(true); // self
    expect(affected.has('d1')).toBe(true); // relay target
  });

  it('drone with relay_source includes the relay source in blast radius', () => {
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },  // d0 = performer
      { x: 1, y: 0, z: 1 },  // d1 = relay
    ]);

    world.updatePattern('d0', 'hover-performer', 'hover', 'autonomous', 'performer', 'shared-corridor');
    world.updatePattern('d1', 'relay-hold-relay', 'relay-hold', 'autonomous', 'relay', 'comm-bridge');

    // Recompute neighbor graphs
    for (const id of ['d0', 'd1']) {
      const drone = world.getDrone(id)!;
      world.updateTelemetry(id, drone.lastTelemetry);
    }

    // d0's graph should have d1 as relay_source (d1 is a relay in range)
    const affected = computeBlastRadius('d0', world);
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true); // relay_source
  });
});

// ---------------------------------------------------------------------------
// computeCascadingBlastRadius — basic tests
// ---------------------------------------------------------------------------

describe('computeCascadingBlastRadius', () => {
  it('without callback, returns union of initial blast radii', () => {
    const { world } = buildSwarm([
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 10, y: 0, z: 1 },  // far from d0/d1
      { x: 11, y: 0, z: 1 },  // near d2
    ]);

    // d0 and d2 change simultaneously
    const affected = computeCascadingBlastRadius(['d0', 'd2'], world);

    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);  // neighbor of d0
    expect(affected.has('d2')).toBe(true);
    expect(affected.has('d3')).toBe(true);  // neighbor of d2
  });

  it('cascade: drone A changes, neighbor B would also change -> B neighbors affected', () => {
    // d0 -- d1 -- d2 (chain, each within commRange=3.0 of next)
    const { world } = buildSwarm(
      [
        { x: 0, y: 0, z: 1 },  // d0
        { x: 2, y: 0, z: 1 },  // d1 (neighbor of d0 and d2)
        { x: 4, y: 0, z: 1 },  // d2 (neighbor of d1, NOT neighbor of d0)
      ],
      3.0,
    );

    // d0 changes. d1 is in d0's blast radius. d1 would also change pattern.
    // d2 is in d1's blast radius, so d2 should be in the cascaded set.
    const affected = computeCascadingBlastRadius(
      ['d0'],
      world,
      (droneId) => droneId === 'd1', // only d1 would change
    );

    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(true); // cascade through d1
  });

  it('cascade terminates -- does not loop infinitely', () => {
    // Create a ring: d0 <-> d1 <-> d2 <-> d0 (all within range)
    const { world } = buildSwarm(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0.5, y: 0.866, z: 0 }, // equilateral triangle, all within range 2
      ],
      2.0,
    );

    // Everyone would change pattern -- could loop forever if not bounded
    let callCount = 0;
    const affected = computeCascadingBlastRadius(
      ['d0'],
      world,
      (_droneId) => {
        callCount++;
        return true; // everyone cascades
      },
    );

    // All 3 should be affected
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(true);

    // The callback should have been called at most N-1 = 2 times
    // (d0 is in changedDroneIds, so only d1 and d2 are evaluated)
    expect(callCount).toBeLessThanOrEqual(2);
  });

  it('cascade is bounded at N iterations for N drones', () => {
    // Long chain: d0 - d1 - d2 - d3 - d4, each 2m apart, commRange=3
    const positions: Vec3[] = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      positions.push({ x: i * 2, y: 0, z: 1 });
    }
    const { world, ids } = buildSwarm(positions, 3.0);

    let callCount = 0;
    const affected = computeCascadingBlastRadius(
      ['d0'],
      world,
      (_droneId) => {
        callCount++;
        return true; // everyone cascades
      },
    );

    // All drones should be affected through cascade
    for (const id of ids) {
      expect(affected.has(id)).toBe(true);
    }

    // The callback should never be called more than N-1 times
    // (d0 is the initial change, so at most d1..d4 are evaluated)
    expect(callCount).toBeLessThanOrEqual(n - 1);
  });

  it('cascade stops when no drone would change pattern', () => {
    const { world } = buildSwarm(
      [
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ],
      3.0,
    );

    // Nobody cascades
    const affected = computeCascadingBlastRadius(
      ['d0'],
      world,
      (_droneId) => false,
    );

    // Only d0 and its direct neighbors
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(true);
    // Size is 3 (d0 + two neighbors within range 3.0)
    expect(affected.size).toBe(3);
  });

  it('handles empty initial changed set', () => {
    const { world } = buildSwarm([{ x: 0, y: 0, z: 1 }]);
    const affected = computeCascadingBlastRadius([], world);
    expect(affected.size).toBe(0);
  });

  it('handles multiple initial changed drones', () => {
    // Two clusters far apart
    const { world } = buildSwarm(
      [
        { x: 0, y: 0, z: 1 },   // d0 cluster A
        { x: 1, y: 0, z: 1 },   // d1 cluster A
        { x: 100, y: 0, z: 1 }, // d2 cluster B
        { x: 101, y: 0, z: 1 }, // d3 cluster B
      ],
      3.0,
    );

    const affected = computeCascadingBlastRadius(['d0', 'd2'], world);
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(true);
    expect(affected.has('d3')).toBe(true);
    expect(affected.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 10-drone swarm test
// ---------------------------------------------------------------------------

describe('computeBlastRadius — 10-drone swarm', () => {
  it('leader change affects only nearby followers, not entire swarm', () => {
    // 10 drones in two clusters:
    //   Cluster A (d0-d4): centered at origin, within commRange=3.0
    //   Cluster B (d5-d9): centered at (50,0,1), within commRange=3.0
    const positions: Vec3[] = [
      // Cluster A
      { x: 0, y: 0, z: 1 },   // d0 = leader
      { x: 1, y: 0, z: 1 },   // d1 = follower
      { x: 0, y: 1, z: 1 },   // d2 = follower
      { x: -1, y: 0, z: 1 },  // d3 = follower
      { x: 0, y: -1, z: 1 },  // d4 = follower
      // Cluster B
      { x: 50, y: 0, z: 1 },  // d5 = leader
      { x: 51, y: 0, z: 1 },  // d6 = follower
      { x: 50, y: 1, z: 1 },  // d7 = follower
      { x: 49, y: 0, z: 1 },  // d8 = follower
      { x: 50, y: -1, z: 1 }, // d9 = performer
    ];
    const { world, ids } = buildSwarm(positions, 3.0);

    // Assign roles in cluster A
    world.updatePattern('d0', 'hover-leader', 'hover', 'autonomous', 'leader', 'exclusive-volume');
    for (let i = 1; i <= 4; i++) {
      world.updatePattern(`d${i}`, 'hover-follower', 'hover', 'autonomous', 'follower', 'shared-corridor');
    }

    // Assign roles in cluster B
    world.updatePattern('d5', 'hover-leader', 'hover', 'autonomous', 'leader', 'exclusive-volume');
    for (let i = 6; i <= 8; i++) {
      world.updatePattern(`d${i}`, 'hover-follower', 'hover', 'autonomous', 'follower', 'shared-corridor');
    }
    world.updatePattern('d9', 'hover-performer', 'hover', 'autonomous', 'performer', 'shared-corridor');

    // Recompute neighbor graphs to pick up role relationships
    for (const id of ids) {
      const drone = world.getDrone(id)!;
      world.updateTelemetry(id, drone.lastTelemetry);
    }

    // Leader d0 changes -- should affect cluster A but NOT cluster B
    const affected = computeBlastRadius('d0', world);

    // Cluster A: d0 (self) + d1,d2,d3,d4 (neighbors + followers)
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(true);
    expect(affected.has('d3')).toBe(true);
    expect(affected.has('d4')).toBe(true);

    // Cluster B: NOT affected
    expect(affected.has('d5')).toBe(false);
    expect(affected.has('d6')).toBe(false);
    expect(affected.has('d7')).toBe(false);
    expect(affected.has('d8')).toBe(false);
    expect(affected.has('d9')).toBe(false);

    // Only 5 out of 10 drones affected
    expect(affected.size).toBe(5);
  });

  it('cascading blast radius across clusters stays bounded', () => {
    // Same two clusters, but cascade through relay drone bridging them
    const positions: Vec3[] = [
      // Cluster A
      { x: 0, y: 0, z: 1 },   // d0
      { x: 1, y: 0, z: 1 },   // d1
      // Relay bridge (between clusters, out of range of both)
      { x: 25, y: 0, z: 1 },  // d2
      // Cluster B
      { x: 50, y: 0, z: 1 },  // d3
      { x: 51, y: 0, z: 1 },  // d4
    ];
    const { world } = buildSwarm(positions, 3.0);

    // d0 changes, no cascade -- only d0 and d1 affected
    // (d2 is 25m away, well outside commRange=3.0)
    const affected = computeCascadingBlastRadius(
      ['d0'],
      world,
      (_droneId) => true, // everyone would cascade
    );

    // Only cluster A is reachable
    expect(affected.has('d0')).toBe(true);
    expect(affected.has('d1')).toBe(true);
    expect(affected.has('d2')).toBe(false); // out of range
    expect(affected.has('d3')).toBe(false); // out of range
    expect(affected.has('d4')).toBe(false); // out of range
  });
});
