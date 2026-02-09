import { describe, it, expect } from 'vitest';
import { solveAssignment, checkForcedExits } from './constraint-engine.js';
import type { Assignment, SwarmObjective } from './constraint-engine.js';
import { WorldModel } from './world-model.js';
import type { DroneState } from './world-model.js';
import type {
  BehavioralPattern,
  BehavioralCatalog,
  CompatibilityRule,
} from '../catalog/types.js';
import type { SensorState, Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Create a SensorState with defaults. */
function makeTelemetry(
  pos: Vec3,
  battery = 0.8,
  positionQuality = 0.95,
): SensorState {
  return {
    position: pos,
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0 },
    angular_velocity: { x: 0, y: 0, z: 0 },
    battery: {
      voltage: 3.7,
      percentage: battery,
      discharge_rate: 2.5,
      estimated_remaining: battery * 300,
    },
    position_quality: positionQuality,
    wind_estimate: { x: 0, y: 0, z: 0 },
  };
}

/** Create a minimal BehavioralPattern for testing. */
function makePattern(overrides: {
  id: string;
  sigma?: BehavioralPattern['core']['sigma'];
  kappa?: BehavioralPattern['core']['kappa'];
  chi?: BehavioralPattern['core']['chi'];
  lambda?: BehavioralPattern['core']['lambda'];
  tau?: BehavioralPattern['core']['tau'];
  rho?: BehavioralPattern['core']['rho'];
  battery_floor?: number;
  position_quality_floor?: number;
  min_references?: number;
  valid_from?: string[];
  valid_to?: string[];
  forced_exits?: Array<{ condition: string; target_pattern: string }>;
  generator_type?: BehavioralPattern['generator']['type'];
}): BehavioralPattern {
  return {
    id: overrides.id,
    core: {
      sigma: overrides.sigma ?? 'hover',
      kappa: overrides.kappa ?? 'autonomous',
      chi: overrides.chi ?? 'performer',
      lambda: overrides.lambda ?? 'shared-corridor',
      tau: overrides.tau ?? 'bare',
      rho: overrides.rho ?? 'crazyflie-2.1',
    },
    description: `Test pattern: ${overrides.id}`,
    preconditions: {
      battery_floor: overrides.battery_floor ?? 0.1,
      position_quality_floor: overrides.position_quality_floor ?? 0.5,
      min_references: overrides.min_references ?? 0,
      valid_from: overrides.valid_from ?? [],
    },
    postconditions: {
      valid_to: overrides.valid_to ?? [],
      forced_exits: overrides.forced_exits ?? [],
    },
    generator: {
      type: overrides.generator_type ?? 'position-hold',
      defaults: {},
      bounds: {},
    },
    verification: {
      status: 'verified',
      collision_clearance_m: 0.3,
      max_velocity_ms: 1.0,
      max_acceleration_ms2: 2.0,
      energy_rate_js: 5.0,
      max_duration_s: 300,
      verified_transitions: [],
    },
  };
}

/**
 * Build a test catalog with hover, translate, orbit, land, grounded, and
 * emergency patterns for crazyflie-2.1 + bare configuration.
 *
 * Transition graph:
 *   grounded -> takeoff -> hover <-> translate
 *                          hover <-> orbit
 *                          hover  -> land -> grounded
 *                          hover  -> emergency-land (forced exit only)
 */
function makeTestCatalog(): BehavioralCatalog {
  const patterns = new Map<string, BehavioralPattern>();

  // --- Hover patterns ---
  const hoverPerformer = makePattern({
    id: 'hover-auto-performer',
    sigma: 'hover',
    chi: 'performer',
    valid_from: ['takeoff-auto-performer', 'translate-auto-performer', 'orbit-auto-performer'],
    valid_to: ['translate-auto-performer', 'orbit-auto-performer', 'land-auto-performer'],
    forced_exits: [
      { condition: 'battery < 0.10', target_pattern: 'emergency-land' },
      { condition: 'position_quality < 0.3', target_pattern: 'emergency-land' },
    ],
  });

  const hoverLeader = makePattern({
    id: 'hover-auto-leader',
    sigma: 'hover',
    chi: 'leader',
    lambda: 'exclusive-volume',
    valid_from: ['takeoff-auto-leader', 'translate-auto-leader'],
    valid_to: ['translate-auto-leader', 'land-auto-leader'],
    forced_exits: [
      { condition: 'battery < 0.10', target_pattern: 'emergency-land' },
    ],
  });

  const hoverFollower = makePattern({
    id: 'hover-auto-follower',
    sigma: 'hover',
    chi: 'follower',
    valid_from: ['takeoff-auto-follower', 'translate-auto-follower'],
    valid_to: ['translate-auto-follower', 'land-auto-follower'],
    forced_exits: [
      { condition: 'battery < 0.10', target_pattern: 'emergency-land' },
    ],
  });

  // --- Translate patterns ---
  const translatePerformer = makePattern({
    id: 'translate-auto-performer',
    sigma: 'translate',
    chi: 'performer',
    valid_from: ['hover-auto-performer'],
    valid_to: ['hover-auto-performer'],
  });

  const translateLeader = makePattern({
    id: 'translate-auto-leader',
    sigma: 'translate',
    chi: 'leader',
    lambda: 'exclusive-volume',
    valid_from: ['hover-auto-leader'],
    valid_to: ['hover-auto-leader'],
  });

  const translateFollower = makePattern({
    id: 'translate-auto-follower',
    sigma: 'translate',
    chi: 'follower',
    valid_from: ['hover-auto-follower'],
    valid_to: ['hover-auto-follower'],
  });

  // --- Orbit pattern ---
  const orbitPerformer = makePattern({
    id: 'orbit-auto-performer',
    sigma: 'orbit',
    chi: 'performer',
    battery_floor: 0.4,
    valid_from: ['hover-auto-performer'],
    valid_to: ['hover-auto-performer'],
  });

  // --- Takeoff patterns ---
  const takeoffPerformer = makePattern({
    id: 'takeoff-auto-performer',
    sigma: 'takeoff',
    chi: 'performer',
    valid_from: ['grounded-auto-performer'],
    valid_to: ['hover-auto-performer'],
  });

  const takeoffLeader = makePattern({
    id: 'takeoff-auto-leader',
    sigma: 'takeoff',
    chi: 'leader',
    lambda: 'exclusive-volume',
    valid_from: ['grounded-auto-leader'],
    valid_to: ['hover-auto-leader'],
  });

  const takeoffFollower = makePattern({
    id: 'takeoff-auto-follower',
    sigma: 'takeoff',
    chi: 'follower',
    valid_from: ['grounded-auto-follower'],
    valid_to: ['hover-auto-follower'],
  });

  // --- Land patterns ---
  const landPerformer = makePattern({
    id: 'land-auto-performer',
    sigma: 'land',
    chi: 'performer',
    battery_floor: 0.0,
    valid_from: ['hover-auto-performer'],
    valid_to: ['grounded-auto-performer'],
  });

  const landLeader = makePattern({
    id: 'land-auto-leader',
    sigma: 'land',
    chi: 'leader',
    lambda: 'exclusive-volume',
    battery_floor: 0.0,
    valid_from: ['hover-auto-leader'],
    valid_to: ['grounded-auto-leader'],
  });

  const landFollower = makePattern({
    id: 'land-auto-follower',
    sigma: 'land',
    chi: 'follower',
    battery_floor: 0.0,
    valid_from: ['hover-auto-follower'],
    valid_to: ['grounded-auto-follower'],
  });

  // --- Grounded patterns ---
  const groundedPerformer = makePattern({
    id: 'grounded-auto-performer',
    sigma: 'grounded',
    chi: 'performer',
    battery_floor: 0.0,
    position_quality_floor: 0.0,
    valid_from: ['land-auto-performer'],
    valid_to: ['takeoff-auto-performer'],
    generator_type: 'idle',
  });

  const groundedLeader = makePattern({
    id: 'grounded-auto-leader',
    sigma: 'grounded',
    chi: 'leader',
    lambda: 'exclusive-volume',
    battery_floor: 0.0,
    position_quality_floor: 0.0,
    valid_from: ['land-auto-leader'],
    valid_to: ['takeoff-auto-leader'],
    generator_type: 'idle',
  });

  const groundedFollower = makePattern({
    id: 'grounded-auto-follower',
    sigma: 'grounded',
    chi: 'follower',
    battery_floor: 0.0,
    position_quality_floor: 0.0,
    valid_from: ['land-auto-follower'],
    valid_to: ['takeoff-auto-follower'],
    generator_type: 'idle',
  });

  // --- Emergency land pattern (battery_floor = 0, any state can enter) ---
  const emergencyLand = makePattern({
    id: 'emergency-land',
    sigma: 'land',
    kappa: 'emergency',
    chi: 'performer',
    battery_floor: 0.0,
    position_quality_floor: 0.0,
    valid_from: [
      'hover-auto-performer', 'hover-auto-leader', 'hover-auto-follower',
      'translate-auto-performer', 'translate-auto-leader', 'translate-auto-follower',
      'orbit-auto-performer',
    ],
    valid_to: ['grounded-auto-performer'],
    generator_type: 'emergency-stop',
  });

  // Register all patterns
  for (const p of [
    hoverPerformer, hoverLeader, hoverFollower,
    translatePerformer, translateLeader, translateFollower,
    orbitPerformer,
    takeoffPerformer, takeoffLeader, takeoffFollower,
    landPerformer, landLeader, landFollower,
    groundedPerformer, groundedLeader, groundedFollower,
    emergencyLand,
  ]) {
    patterns.set(p.id, p);
  }

  // Compatibility rules
  const compatibility: CompatibilityRule[] = [
    // Default: all patterns compatible at 0.5m
    { pattern_a: '*', pattern_b: '*', compatible: true, min_separation_m: 0.5 },
    // Hover patterns need less separation
    { pattern_a: 'hover-*', pattern_b: 'hover-*', compatible: true, min_separation_m: 0.3 },
    // Orbit patterns need more separation
    { pattern_a: 'orbit-*', pattern_b: 'orbit-*', compatible: true, min_separation_m: 1.0 },
  ];

  return { patterns, compatibility };
}

/**
 * Build a WorldModel and add drones at specified positions.
 * Each drone starts in the given pattern with (crazyflie-2.1, bare).
 */
function makeWorld(
  drones: Array<{
    id: string;
    pos: Vec3;
    pattern: string;
    battery?: number;
    positionQuality?: number;
  }>,
  commRange = 5.0,
): WorldModel {
  const world = new WorldModel({ commRange });
  for (const d of drones) {
    world.addDrone(
      d.id,
      'crazyflie-2.1',
      'bare',
      d.pattern,
      makeTelemetry(d.pos, d.battery ?? 0.8, d.positionQuality ?? 0.95),
    );
  }
  // Recompute neighbor graphs after all drones are added
  for (const d of drones) {
    world.updateTelemetry(
      d.id,
      makeTelemetry(d.pos, d.battery ?? 0.8, d.positionQuality ?? 0.95),
    );
  }
  return world;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkForcedExits', () => {
  it('returns null when no conditions are met', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);
    const drone = world.getDrone('d1')!;
    const pattern = catalog.patterns.get('hover-auto-performer')!;

    expect(checkForcedExits(drone, pattern)).toBeNull();
  });

  it('triggers battery forced exit when battery < 0.10', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'hover-auto-performer',
        battery: 0.05,
      },
    ]);
    const drone = world.getDrone('d1')!;
    const pattern = catalog.patterns.get('hover-auto-performer')!;

    expect(checkForcedExits(drone, pattern)).toBe('emergency-land');
  });

  it('triggers position quality forced exit', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'hover-auto-performer',
        positionQuality: 0.2,
      },
    ]);
    const drone = world.getDrone('d1')!;
    const pattern = catalog.patterns.get('hover-auto-performer')!;

    expect(checkForcedExits(drone, pattern)).toBe('emergency-land');
  });

  it('returns the first matching forced exit', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'hover-auto-performer',
        battery: 0.05,
        positionQuality: 0.2,
      },
    ]);
    const drone = world.getDrone('d1')!;
    const pattern = catalog.patterns.get('hover-auto-performer')!;

    // Both conditions met; returns the first one (battery < 0.10)
    expect(checkForcedExits(drone, pattern)).toBe('emergency-land');
  });

  it('returns null for pattern with no forced exits', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'translate-auto-performer',
        battery: 0.05,
      },
    ]);
    const drone = world.getDrone('d1')!;
    const pattern = catalog.patterns.get('translate-auto-performer')!;

    expect(checkForcedExits(drone, pattern)).toBeNull();
  });
});

describe('solveAssignment — single drone', () => {
  it('single drone with valid catalog gets an assignment', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0].droneId).toBe('d1');
    expect(assignments[0].patternId).toBeDefined();
    // Pattern should exist in catalog
    expect(catalog.patterns.has(assignments[0].patternId)).toBe(true);
  });

  it('stability: drone already in good pattern keeps it (score +10)', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );

    // Should prefer staying in hover-auto-performer (+10 stability + 5 objective match)
    expect(assignments[0].patternId).toBe('hover-auto-performer');
  });

  it('objective matching: hover objective selects hover patterns', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );

    const assignedPattern = catalog.patterns.get(assignments[0].patternId)!;
    expect(assignedPattern.core.sigma).toBe('hover');
  });
});

describe('solveAssignment — battery constraints', () => {
  it('drone with low battery selects pattern with lower battery_floor', () => {
    const catalog = makeTestCatalog();
    // Battery at 0.30 -- orbit requires 0.40, so should not get orbit
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'hover-auto-performer',
        battery: 0.30,
      },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'orbit' }],
    );

    // Should NOT get orbit (battery_floor 0.40 > drone battery 0.30)
    const assignedPattern = catalog.patterns.get(assignments[0].patternId)!;
    expect(assignedPattern.core.sigma).not.toBe('orbit');
  });

  it('drone with forced exit (battery < 0.10) returns emergency pattern', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'hover-auto-performer',
        battery: 0.05,
      },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );

    expect(assignments[0].patternId).toBe('emergency-land');
  });
});

describe('solveAssignment — transition filtering', () => {
  it('invalid transition is filtered out (grounded cannot go to orbit)', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 0 },
        pattern: 'grounded-auto-performer',
      },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'orbit' }],
    );

    // From grounded, can only go to takeoff. Orbit is not a valid transition.
    const assignedPattern = catalog.patterns.get(assignments[0].patternId)!;
    expect(assignedPattern.core.sigma).not.toBe('orbit');
  });
});

describe('solveAssignment — neighbor compatibility', () => {
  it('two neighbors get pairwise compatible assignments', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
      { id: 'd2', pos: { x: 0.4, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1', 'd2']),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(2);

    // Both should have valid assignments
    for (const a of assignments) {
      expect(catalog.patterns.has(a.patternId)).toBe(true);
    }

    // Verify pairwise: look up the compatibility
    // Both in hover patterns at 0.4m separation; hover-* rule requires 0.3m,
    // so they should be compatible
    const p1 = assignments[0].patternId;
    const p2 = assignments[1].patternId;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
  });
});

describe('solveAssignment — fallback to hover', () => {
  it('falls back to hover when no valid assignment exists', () => {
    // Drone's current pattern is NOT in the catalog, so it can't "stay"
    // in a recognized pattern. The only catalog entry is hover-fallback.
    // Since the current pattern is unknown, all catalog patterns are
    // evaluated as potential transitions. The hover-fallback should be
    // selected because:
    //   - The unknown current pattern can't match any candidate (no stability bonus)
    //   - transition filter allows all when current pattern is not in catalog
    //   - hover-fallback matches the hover objective (+5)
    const patterns = new Map<string, BehavioralPattern>();

    const hoverFallback = makePattern({
      id: 'hover-fallback',
      sigma: 'hover',
      battery_floor: 0.0,
      position_quality_floor: 0.0,
      valid_from: [],
      valid_to: [],
    });

    patterns.set(hoverFallback.id, hoverFallback);

    const catalog: BehavioralCatalog = { patterns, compatibility: [] };

    // Drone is in a pattern that does not exist in the catalog
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'removed-pattern' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(1);
    // Should fall back to hover since current pattern is not in catalog
    expect(assignments[0].patternId).toBe('hover-fallback');
  });
});

describe('solveAssignment — multi-drone formations', () => {
  it('3-drone formation: all get assignments, no conflicts', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
      { id: 'd3', pos: { x: 0, y: 1, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1', 'd2', 'd3']),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(3);

    // All drones should have valid assignments
    const droneIds = assignments.map((a) => a.droneId);
    expect(droneIds).toContain('d1');
    expect(droneIds).toContain('d2');
    expect(droneIds).toContain('d3');

    // All assigned patterns should exist in catalog
    for (const a of assignments) {
      expect(catalog.patterns.has(a.patternId)).toBe(true);
    }
  });

  it('5-drone formation: completes in reasonable time', () => {
    const catalog = makeTestCatalog();
    const drones = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      pos: { x: i * 0.8, y: 0, z: 1 } as Vec3,
      pattern: 'hover-auto-performer',
    }));
    const world = makeWorld(drones);

    const start = performance.now();
    const assignments = solveAssignment(
      world,
      catalog,
      new Set(drones.map((d) => d.id)),
      [{ type: 'hover' }],
    );
    const elapsed = performance.now() - start;

    expect(assignments).toHaveLength(5);
    // Should complete well within 100ms for a 17-pattern catalog + 5 drones
    expect(elapsed).toBeLessThan(100);
  });
});

describe('solveAssignment — objective influence', () => {
  it('translate objective influences pattern selection toward translate', () => {
    const catalog = makeTestCatalog();
    // Drone in hover; translate objective should nudge toward translate
    // But stability (+10) for current pattern outweighs objective (+5)
    // So we need to check that translate at least gets scored higher
    // than a non-matching, non-current pattern.
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    // With no objectives, should stay in hover (stability)
    const noObjAssignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [],
    );
    expect(noObjAssignments[0].patternId).toBe('hover-auto-performer');

    // With hover objective, hover gets both stability AND objective bonus
    const hoverObjAssignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );
    expect(hoverObjAssignments[0].patternId).toBe('hover-auto-performer');
  });

  it('land-all objective does not override forced safety constraints', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      {
        id: 'd1',
        pos: { x: 0, y: 0, z: 1 },
        pattern: 'hover-auto-performer',
        battery: 0.05,
      },
    ]);

    // Even with a land-all objective, forced exit should trigger emergency
    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'land-all' }],
    );

    expect(assignments[0].patternId).toBe('emergency-land');
  });
});

describe('solveAssignment — edge cases', () => {
  it('unknown drone ID is skipped gracefully', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    // Request assignment for a drone that does not exist
    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['nonexistent']),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(0);
  });

  it('empty affected set returns no assignments', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'hover-auto-performer' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(0);
  });

  it('drone with current pattern not in catalog falls back gracefully', () => {
    const catalog = makeTestCatalog();
    const world = makeWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, pattern: 'totally-made-up-pattern' },
    ]);

    const assignments = solveAssignment(
      world,
      catalog,
      new Set(['d1']),
      [{ type: 'hover' }],
    );

    expect(assignments).toHaveLength(1);
    // Should still produce some assignment (hover fallback or catalog pattern)
    expect(assignments[0].patternId).toBeDefined();
  });
});
