import { describe, it, expect } from 'vitest';
import { WorldModel } from './world-model.js';
import { assignRoles, DEFAULT_ROLE_CONFIG } from './role-assignment.js';
import type { FormationSpec, CoverageSpec, RoleAssignmentConfig } from './role-assignment.js';
import type { SensorState, Vec3 } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeTelemetry(pos: Vec3, battery = 0.8, positionQuality = 0.95): SensorState {
  return {
    position: pos,
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0 },
    angular_velocity: { x: 0, y: 0, z: 0 },
    battery: { voltage: 3.7, percentage: battery, discharge_rate: 2.5, estimated_remaining: 300 },
    position_quality: positionQuality,
    wind_estimate: { x: 0, y: 0, z: 0 },
  };
}

const defaultFormation: FormationSpec = {
  minPerformers: 2,
  needsLeader: false,
  center: { x: 0, y: 0, z: 1 },
};

const defaultCoverage: CoverageSpec = {
  coverageRadius: 5.0,
  needsRelay: false,
};

/**
 * Create a WorldModel with drones at known positions and battery levels.
 * All drones are airborne (sigma = hover) and assigned as performers by default.
 */
function buildWorld(
  specs: Array<{ id: string; pos: Vec3; battery: number; role?: string; sigma?: string; positionQuality?: number }>,
): WorldModel {
  const wm = new WorldModel({ commRange: 10.0 });
  for (const s of specs) {
    wm.addDrone(s.id, 'crazyflie-2.1', 'bare', 'hover', makeTelemetry(s.pos, s.battery, s.positionQuality));
    // addDrone sets sigma=grounded, chi=reserve by default.
    // Override to the desired state.
    const sigma = s.sigma ?? 'hover';
    const chi = s.role ?? 'performer';
    wm.updatePattern(
      s.id,
      `${sigma}-autonomous-${chi}-bare.crazyflie-2.1`,
      sigma as any,
      'autonomous',
      chi as any,
      'shared-corridor',
    );
  }
  return wm;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Role Assignment — Safety (Rule 1)', () => {
  it('1. low-battery drone is always assigned charger-inbound', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.10 },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.80 },
    ]);

    const changes = assignRoles(wm, defaultFormation, defaultCoverage);
    expect(changes.get('d1')).toBe('charger-inbound');
  });

  it('2. drone at 5% battery -> charger-inbound even if only performer', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.05 },
    ]);

    const formation: FormationSpec = { minPerformers: 1, needsLeader: false, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);
    expect(changes.get('d1')).toBe('charger-inbound');
  });
});

describe('Role Assignment — Charging Lifecycle (Rules 2-3)', () => {
  it('3. charging drone at 95% -> charger-outbound', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 0 }, battery: 0.95, role: 'charging', sigma: 'docked' },
    ]);

    const changes = assignRoles(wm, defaultFormation, defaultCoverage);
    expect(changes.get('d1')).toBe('charger-outbound');
  });

  it('4. charging drone at 50% -> stays charging (below return threshold)', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 0 }, battery: 0.50, role: 'charging', sigma: 'docked' },
    ]);

    const changes = assignRoles(wm, defaultFormation, defaultCoverage);
    // Should not appear in changes at all (no change to charging drone)
    expect(changes.has('d1')).toBe(false);
  });
});

describe('Role Assignment — Leader (Rule 5)', () => {
  it('5. no leader, formation needs one -> assigns leader to best-battery drone', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.60 },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.90 },
      { id: 'd3', pos: { x: 2, y: 0, z: 1 }, battery: 0.70 },
    ]);

    const formation: FormationSpec = { minPerformers: 2, needsLeader: true, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);
    expect(changes.get('d2')).toBe('leader');
  });
});

describe('Role Assignment — Relay (Rule 4)', () => {
  it('6. relay needed at boundary -> assigns relay to closest-to-boundary drone', () => {
    // Coverage radius = 5.0, so the boundary is at distance 5 from origin
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80 },   // dist ~1.0 from origin
      { id: 'd2', pos: { x: 4.5, y: 0, z: 1 }, battery: 0.80 }, // dist ~4.6, close to boundary 5.0
      { id: 'd3', pos: { x: 2, y: 0, z: 1 }, battery: 0.80 },   // dist ~2.2
    ]);

    const coverage: CoverageSpec = { coverageRadius: 5.0, needsRelay: true };
    const changes = assignRoles(wm, defaultFormation, coverage);
    expect(changes.get('d2')).toBe('relay');
  });
});

describe('Role Assignment — Performer Filling (Rule 6)', () => {
  it('7. not enough performers -> promotes reserves to performer', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80, role: 'reserve' },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.70, role: 'reserve' },
      { id: 'd3', pos: { x: 2, y: 0, z: 1 }, battery: 0.60, role: 'reserve' },
    ]);

    const formation: FormationSpec = { minPerformers: 2, needsLeader: false, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);

    // Should promote the two highest-battery reserves to performer
    expect(changes.get('d1')).toBe('performer');
    expect(changes.get('d2')).toBe('performer');
    // d3 stays reserve
    expect(changes.has('d3')).toBe(false);
  });
});

describe('Role Assignment — Hysteresis (Rule 8)', () => {
  it('8. role does not change if held for fewer than threshold ticks', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80, role: 'reserve' },
    ]);

    const formation: FormationSpec = { minPerformers: 1, needsLeader: false, center: { x: 0, y: 0, z: 1 } };
    // d1 is reserve, formation needs 1 performer -> rule 6 wants to promote it
    // But d1 has only held its role for 3 ticks (below default 10)
    const tickCounts = new Map<string, number>([['d1', 3]]);
    const changes = assignRoles(wm, formation, defaultCoverage, undefined, tickCounts);

    // Hysteresis suppresses the change
    expect(changes.has('d1')).toBe(false);
  });

  it('9. hysteresis is overridden for safety (low battery)', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.05 },
    ]);

    // d1 has held performer for only 2 ticks (below default 10)
    const tickCounts = new Map<string, number>([['d1', 2]]);
    const changes = assignRoles(wm, defaultFormation, defaultCoverage, undefined, tickCounts);

    // Safety always overrides hysteresis
    expect(changes.get('d1')).toBe('charger-inbound');
  });
});

describe('Role Assignment — No Changes Needed', () => {
  it('10. returns empty map when no changes needed', () => {
    // Two performers with healthy battery, formation needs 2, no leader needed, no relay needed
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80 },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.80 },
    ]);

    const formation: FormationSpec = { minPerformers: 2, needsLeader: false, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);
    expect(changes.size).toBe(0);
  });
});

describe('Role Assignment — 5-Drone Swarm Integration', () => {
  it('11. 5-drone swarm: correct mix of roles assigned', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.90, role: 'reserve' },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.85, role: 'reserve' },
      { id: 'd3', pos: { x: 4.8, y: 0, z: 1 }, battery: 0.70, role: 'reserve' },
      { id: 'd4', pos: { x: 2, y: 0, z: 1 }, battery: 0.10, role: 'performer' }, // low battery!
      { id: 'd5', pos: { x: 3, y: 0, z: 1 }, battery: 0.60, role: 'reserve' },
    ]);

    const formation: FormationSpec = { minPerformers: 2, needsLeader: true, center: { x: 0, y: 0, z: 1 } };
    const coverage: CoverageSpec = { coverageRadius: 5.0, needsRelay: true };

    const changes = assignRoles(wm, formation, coverage);

    // d4 (battery 10%) must become charger-inbound (safety, rule 1)
    expect(changes.get('d4')).toBe('charger-inbound');

    // d3 is closest to boundary (pos 4.8, boundary 5.0) -> relay (rule 4)
    expect(changes.get('d3')).toBe('relay');

    // d1 has highest battery among remaining performers/reserves -> leader (rule 5)
    expect(changes.get('d1')).toBe('leader');

    // Need 2 performers. d2 and d5 are the remaining reserves, both should be promoted.
    expect(changes.get('d2')).toBe('performer');
    expect(changes.get('d5')).toBe('performer');
  });
});

describe('Role Assignment — Edge Cases', () => {
  it('does not assign charger-inbound to drones already in charging lifecycle', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 0 }, battery: 0.05, role: 'charging', sigma: 'docked' },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.05, role: 'charger-inbound', sigma: 'translate' },
    ]);

    const changes = assignRoles(wm, defaultFormation, defaultCoverage);
    // Neither should change -- they are already in the charging lifecycle
    expect(changes.has('d1')).toBe(false);
    expect(changes.has('d2')).toBe(false);
  });

  it('charger-outbound drone rejoins as reserve when performers are full', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80 },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.80 },
      { id: 'd3', pos: { x: 2, y: 0, z: 1 }, battery: 0.95, role: 'charger-outbound', sigma: 'hover' },
    ]);

    const formation: FormationSpec = { minPerformers: 2, needsLeader: false, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);
    // d1 and d2 are already performers. d3 outbound -> reserve (formation full)
    expect(changes.get('d3')).toBe('reserve');
  });

  it('charger-outbound drone rejoins as performer when formation needs one', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80 },
      { id: 'd2', pos: { x: 2, y: 0, z: 1 }, battery: 0.95, role: 'charger-outbound', sigma: 'hover' },
    ]);

    const formation: FormationSpec = { minPerformers: 2, needsLeader: false, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);
    // d1 is performer, formation needs 2. d2 outbound + airborne -> performer
    expect(changes.get('d2')).toBe('performer');
  });

  it('leader assigned by position quality as tiebreaker when batteries equal', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.80, positionQuality: 0.70 },
      { id: 'd2', pos: { x: 1, y: 0, z: 1 }, battery: 0.80, positionQuality: 0.99 },
    ]);

    const formation: FormationSpec = { minPerformers: 1, needsLeader: true, center: { x: 0, y: 0, z: 1 } };
    const changes = assignRoles(wm, formation, defaultCoverage);
    expect(changes.get('d2')).toBe('leader');
  });

  it('custom config overrides defaults', () => {
    const wm = buildWorld([
      { id: 'd1', pos: { x: 0, y: 0, z: 1 }, battery: 0.20 },
    ]);

    // With default threshold (0.15), d1 is fine. With raised threshold (0.25), d1 is low.
    const customConfig: Partial<RoleAssignmentConfig> = { batteryChargeThreshold: 0.25 };
    const changes = assignRoles(wm, defaultFormation, defaultCoverage, customConfig);
    expect(changes.get('d1')).toBe('charger-inbound');
  });
});
