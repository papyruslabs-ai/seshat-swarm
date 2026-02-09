import { describe, it, expect } from 'vitest';
import {
  flattenDefaults,
  flattenBounds,
  compilePatterns,
  generateHeader,
  type CompiledPattern,
  type CompilationResult,
} from './compile-catalog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePattern(
  id: string,
  genType: string,
  defaults: Record<string, number | number[]> = {},
  bounds: Record<string, { min: number; max: number }> = {},
  batteryFloor = 0.15,
  posQuality = 0.5,
) {
  return {
    id,
    core: {
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
    },
    preconditions: {
      battery_floor: batteryFloor,
      position_quality_floor: posQuality,
    },
    generator: { type: genType, defaults, bounds },
  };
}

// ---------------------------------------------------------------------------
// flattenDefaults
// ---------------------------------------------------------------------------

describe('flattenDefaults', () => {
  it('maps position-hold altitude to slot 0', () => {
    const result = flattenDefaults('position-hold', { altitude: 1.5 });
    expect(result[0]).toBe(1.5);
    expect(result.length).toBe(8);
    // All other slots should be 0
    for (let i = 1; i < 8; i++) expect(result[i]).toBe(0);
  });

  it('maps orbit-center radius and angular_vel to slots 0 and 1', () => {
    const result = flattenDefaults('orbit-center', { radius: 0.5, angular_vel: 0.3 });
    expect(result[0]).toBe(0.5);
    expect(result[1]).toBe(0.3);
  });

  it('maps relative-offset to slots 0, 1, 2', () => {
    const result = flattenDefaults('relative-offset', {
      offset_x: 1.0,
      offset_y: 2.0,
      offset_z: 0.5,
    });
    expect(result[0]).toBe(1.0);
    expect(result[1]).toBe(2.0);
    expect(result[2]).toBe(0.5);
  });

  it('returns all zeros for idle', () => {
    const result = flattenDefaults('idle', {});
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('returns all zeros for unknown generator type', () => {
    const result = flattenDefaults('unknown-type', { foo: 42 });
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('handles missing parameters gracefully', () => {
    const result = flattenDefaults('orbit-center', { radius: 0.5 });
    expect(result[0]).toBe(0.5);
    expect(result[1]).toBe(0); // angular_vel missing → 0
  });
});

// ---------------------------------------------------------------------------
// flattenBounds
// ---------------------------------------------------------------------------

describe('flattenBounds', () => {
  it('maps position-hold altitude bounds to slot 0', () => {
    const { boundsMin, boundsMax } = flattenBounds('position-hold', {
      altitude: { min: 0.2, max: 2.5 },
    });
    expect(boundsMin[0]).toBe(0.2);
    expect(boundsMax[0]).toBe(2.5);
    expect(boundsMin.length).toBe(8);
    expect(boundsMax.length).toBe(8);
  });

  it('maps orbit-center bounds correctly', () => {
    const { boundsMin, boundsMax } = flattenBounds('orbit-center', {
      radius: { min: 0.3, max: 1.5 },
      angular_vel: { min: 0.1, max: 1.0 },
    });
    expect(boundsMin[0]).toBe(0.3);
    expect(boundsMax[0]).toBe(1.5);
    expect(boundsMin[1]).toBe(0.1);
    expect(boundsMax[1]).toBe(1.0);
  });

  it('returns zeros for idle', () => {
    const { boundsMin, boundsMax } = flattenBounds('idle', {});
    expect(boundsMin.every((v) => v === 0)).toBe(true);
    expect(boundsMax.every((v) => v === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compilePatterns
// ---------------------------------------------------------------------------

describe('compilePatterns', () => {
  it('assigns sequential IDs sorted by string ID', () => {
    const patterns = [
      makePattern('z-pattern', 'idle'),
      makePattern('a-pattern', 'position-hold', { altitude: 1.0 }),
      makePattern('m-pattern', 'orbit-center', { radius: 0.5, angular_vel: 0.3 }),
    ];

    const result = compilePatterns(patterns);
    expect(result.patterns.length).toBe(3);

    // Should be sorted: a, m, z
    expect(result.patterns[0]!.stringId).toBe('a-pattern');
    expect(result.patterns[0]!.numericId).toBe(0);
    expect(result.patterns[1]!.stringId).toBe('m-pattern');
    expect(result.patterns[1]!.numericId).toBe(1);
    expect(result.patterns[2]!.stringId).toBe('z-pattern');
    expect(result.patterns[2]!.numericId).toBe(2);
  });

  it('builds correct ID map', () => {
    const patterns = [
      makePattern('beta', 'idle'),
      makePattern('alpha', 'idle'),
    ];

    const result = compilePatterns(patterns);
    expect(result.idMap['alpha']).toBe(0);
    expect(result.idMap['beta']).toBe(1);
  });

  it('maps generator types to correct enum values', () => {
    const patterns = [
      makePattern('p1', 'position-hold'),
      makePattern('p2', 'velocity-track'),
      makePattern('p3', 'orbit-center'),
      makePattern('p4', 'emergency-stop'),
      makePattern('p5', 'idle'),
    ];

    const result = compilePatterns(patterns);
    const byName = new Map(result.patterns.map((p) => [p.stringId, p]));

    expect(byName.get('p1')!.generatorType).toBe(0); // GEN_POSITION_HOLD
    expect(byName.get('p2')!.generatorType).toBe(1); // GEN_VELOCITY_TRACK
    expect(byName.get('p3')!.generatorType).toBe(4); // GEN_ORBIT_CENTER
    expect(byName.get('p4')!.generatorType).toBe(6); // GEN_EMERGENCY_STOP
    expect(byName.get('p5')!.generatorType).toBe(7); // GEN_IDLE
  });

  it('preserves battery and position quality floors', () => {
    const patterns = [
      makePattern('p1', 'idle', {}, {}, 0.0, 0.0),
      makePattern('p2', 'position-hold', { altitude: 1.0 }, {}, 0.2, 0.8),
    ];

    const result = compilePatterns(patterns);
    const byName = new Map(result.patterns.map((p) => [p.stringId, p]));

    expect(byName.get('p1')!.batteryFloor).toBe(0.0);
    expect(byName.get('p1')!.posQualityFloor).toBe(0.0);
    expect(byName.get('p2')!.batteryFloor).toBe(0.2);
    expect(byName.get('p2')!.posQualityFloor).toBe(0.8);
  });

  it('throws on unknown generator type', () => {
    const patterns = [makePattern('bad', 'nonexistent-gen')];
    expect(() => compilePatterns(patterns)).toThrow('Unknown generator type');
  });

  it('compiles an empty catalog', () => {
    const result = compilePatterns([]);
    expect(result.patterns.length).toBe(0);
    expect(Object.keys(result.idMap).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateHeader
// ---------------------------------------------------------------------------

describe('generateHeader', () => {
  it('produces valid C header with include guard', () => {
    const result = compilePatterns([
      makePattern('hover-auto', 'position-hold', { altitude: 1.0 }, { altitude: { min: 0.2, max: 2.5 } }),
    ]);

    const header = generateHeader(result);

    expect(header).toContain('#ifndef SESHAT_CATALOG_DATA_H');
    expect(header).toContain('#define SESHAT_CATALOG_DATA_H');
    expect(header).toContain('#endif');
    expect(header).toContain('#include "types.h"');
  });

  it('contains CATALOG_SIZE define', () => {
    const result = compilePatterns([
      makePattern('p1', 'idle'),
      makePattern('p2', 'idle'),
    ]);

    const header = generateHeader(result);
    expect(header).toContain('#define CATALOG_SIZE 2');
  });

  it('contains pattern entries with correct structure', () => {
    const result = compilePatterns([
      makePattern('test-pattern', 'position-hold', { altitude: 1.5 }, { altitude: { min: 0.2, max: 2.5 } }, 0.15, 0.5),
    ]);

    const header = generateHeader(result);
    expect(header).toContain('.id = 0');
    expect(header).toContain('.generator_type = 0');  // GEN_POSITION_HOLD
    expect(header).toContain('1.5f');                 // altitude default
    expect(header).toContain('0.2f');                 // bounds min
    expect(header).toContain('2.5f');                 // bounds max
    expect(header).toContain('.battery_floor = 0.15f');
    expect(header).toContain('.pos_quality_floor = 0.5f');
  });

  it('generates PATTERN_ defines', () => {
    const result = compilePatterns([
      makePattern('hover-auto.cf', 'idle'),
    ]);

    const header = generateHeader(result);
    expect(header).toContain('#define PATTERN_HOVER_AUTO_CF 0');
  });

  it('contains AUTO-GENERATED warning', () => {
    const result = compilePatterns([]);
    const header = generateHeader(result);
    expect(header).toContain('AUTO-GENERATED');
    expect(header).toContain('DO NOT EDIT MANUALLY');
  });

  it('produces deterministic output for same input', () => {
    const patterns = [
      makePattern('b-pat', 'idle'),
      makePattern('a-pat', 'position-hold', { altitude: 1.0 }),
    ];

    // Remove date line for comparison (it changes each run)
    const strip = (h: string) => h.replace(/\* Generated:.*\n/, '');
    const h1 = strip(generateHeader(compilePatterns(patterns)));
    const h2 = strip(generateHeader(compilePatterns(patterns)));
    expect(h1).toBe(h2);
  });
});
