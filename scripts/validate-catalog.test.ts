/**
 * Seshat Swarm -- Catalog Validation Tests
 *
 * Tests the validateCatalog function with mock catalogs to ensure
 * each validation check works correctly.
 */

import { describe, it, expect } from 'vitest';
import { validateCatalog } from './validate-catalog.js';
import type { BehavioralPattern, BehavioralCatalog, CompatibilityRule } from '../src/catalog/types.js';
import type { BehavioralMode, AutonomyLevel, FormationRole, ResourceOwnership, PhysicalTraits, HardwareTarget, GeneratorType } from '../src/types/dimensions.js';

// ---------------------------------------------------------------------------
// Helpers: build mock patterns
// ---------------------------------------------------------------------------

/** Create a minimal valid BehavioralPattern with sensible defaults. */
function makePattern(overrides: Partial<{
  id: string;
  sigma: BehavioralMode;
  kappa: AutonomyLevel;
  chi: FormationRole;
  lambda: ResourceOwnership;
  tau: PhysicalTraits;
  rho: HardwareTarget;
  description: string;
  battery_floor: number;
  position_quality_floor: number;
  min_references: number;
  valid_from: string[];
  valid_to: string[];
  forced_exits: Array<{ condition: string; target_pattern: string }>;
  generator_type: GeneratorType;
  verification_status: 'verified' | 'unverified' | 'failed';
  verified_transitions: string[];
  hardware_requirements: string[];
}> = {}): BehavioralPattern {
  const sigma = overrides.sigma ?? 'hover';
  const kappa = overrides.kappa ?? 'autonomous';
  const chi = overrides.chi ?? 'performer';
  const tau = overrides.tau ?? 'bare';
  const rho = overrides.rho ?? 'crazyflie-2.1';
  const lambda = overrides.lambda ?? 'exclusive-volume';

  const id = overrides.id ?? `${sigma}-${kappa}-${chi}-${tau}.${rho}`;

  return {
    id,
    core: { sigma, kappa, chi, lambda, tau, rho },
    description: overrides.description ?? `Test pattern: ${id}`,
    preconditions: {
      battery_floor: overrides.battery_floor ?? 0.15,
      position_quality_floor: overrides.position_quality_floor ?? 0.5,
      min_references: overrides.min_references ?? 1,
      valid_from: overrides.valid_from ?? [],
      hardware_requirements: overrides.hardware_requirements,
    },
    postconditions: {
      valid_to: overrides.valid_to ?? [],
      forced_exits: overrides.forced_exits ?? [],
    },
    generator: {
      type: overrides.generator_type ?? 'position-hold',
      defaults: { altitude: 1.0 },
      bounds: { altitude: { min: 0.2, max: 2.5 } },
    },
    verification: {
      status: overrides.verification_status ?? 'verified',
      collision_clearance_m: 0.3,
      max_velocity_ms: 0.1,
      max_acceleration_ms2: 0.5,
      energy_rate_js: 5.0,
      max_duration_s: 420,
      verified_transitions: overrides.verified_transitions ?? ['some-transition'],
    },
  };
}

/** Create a BehavioralCatalog from a list of patterns. */
function makeCatalog(patterns: BehavioralPattern[], compatibility: CompatibilityRule[] = []): BehavioralCatalog {
  const map = new Map<string, BehavioralPattern>();
  for (const p of patterns) {
    map.set(p.id, p);
  }
  return { patterns: map, compatibility };
}

// ---------------------------------------------------------------------------
// Helpers: build a minimal valid catalog with a path to grounded
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid catalog that passes all checks:
 *   takeoff (performer) -> hover (performer) -> land (performer) -> grounded (reserve) -> takeoff
 *
 * Transition matrix allows:
 *   grounded -> takeoff (valid)
 *   takeoff -> hover (valid)
 *   hover -> land (valid)
 *   land -> grounded (valid)
 *
 * Dependency constraints:
 *   performer -> exclusive-volume or shared-corridor
 *   reserve -> shared-corridor or yielding
 *
 * grounded pattern: sigma=grounded is the terminal.
 */
function makeValidCatalog(): BehavioralCatalog {
  const takeoffPattern = makePattern({
    sigma: 'takeoff',
    kappa: 'autonomous',
    chi: 'performer',
    lambda: 'exclusive-volume',
    tau: 'bare',
    rho: 'crazyflie-2.1',
    valid_from: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
    valid_to: ['hover-autonomous-performer-bare.crazyflie-2.1'],
  });

  const hoverPattern = makePattern({
    sigma: 'hover',
    kappa: 'autonomous',
    chi: 'performer',
    lambda: 'exclusive-volume',
    tau: 'bare',
    rho: 'crazyflie-2.1',
    valid_from: ['takeoff-autonomous-performer-bare.crazyflie-2.1'],
    valid_to: ['land-autonomous-performer-bare.crazyflie-2.1'],
  });

  const landPattern = makePattern({
    sigma: 'land',
    kappa: 'autonomous',
    chi: 'performer',
    lambda: 'exclusive-volume',
    tau: 'bare',
    rho: 'crazyflie-2.1',
    valid_from: ['hover-autonomous-performer-bare.crazyflie-2.1'],
    valid_to: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
  });

  const groundedPattern = makePattern({
    sigma: 'grounded',
    kappa: 'autonomous',
    chi: 'reserve',
    lambda: 'shared-corridor',
    tau: 'bare',
    rho: 'crazyflie-2.1',
    valid_from: ['land-autonomous-performer-bare.crazyflie-2.1'],
    valid_to: ['takeoff-autonomous-performer-bare.crazyflie-2.1'],
    generator_type: 'idle',
  });

  return makeCatalog([takeoffPattern, hoverPattern, landPattern, groundedPattern]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateCatalog', () => {
  // -----------------------------------------------------------------------
  // 1. Valid catalog passes with 0 errors
  // -----------------------------------------------------------------------
  it('should pass a valid mock catalog with 0 errors', () => {
    const catalog = makeValidCatalog();
    const result = validateCatalog(catalog);

    expect(result.errors).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 2. Missing transition target (valid_to) produces error
  // -----------------------------------------------------------------------
  it('should error when valid_to references a non-existent pattern', () => {
    const catalog = makeValidCatalog();

    // Add a bad reference to the hover pattern
    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.postconditions.valid_to.push('nonexistent-pattern-id');

    const result = validateCatalog(catalog);

    const matchingErrors = result.errors.filter((e) =>
      e.includes('valid_to references non-existent pattern "nonexistent-pattern-id"'),
    );
    expect(matchingErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 3. Missing valid_from target produces error
  // -----------------------------------------------------------------------
  it('should error when valid_from references a non-existent pattern', () => {
    const catalog = makeValidCatalog();

    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.preconditions.valid_from.push('nonexistent-source-pattern');

    const result = validateCatalog(catalog);

    const matchingErrors = result.errors.filter((e) =>
      e.includes('valid_from references non-existent pattern "nonexistent-source-pattern"'),
    );
    expect(matchingErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 4. Missing forced_exit target produces error
  // -----------------------------------------------------------------------
  it('should error when forced_exit target does not exist', () => {
    const catalog = makeValidCatalog();

    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.postconditions.forced_exits.push({
      condition: 'battery < 0.05',
      target_pattern: 'ghost-pattern-that-does-not-exist',
    });

    const result = validateCatalog(catalog);

    const matchingErrors = result.errors.filter((e) =>
      e.includes('forced_exit target "ghost-pattern-that-does-not-exist" does not exist'),
    );
    expect(matchingErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 5. Emergency pattern with non-zero battery_floor produces error
  // -----------------------------------------------------------------------
  it('should error when emergency pattern has non-zero battery_floor', () => {
    const catalog = makeValidCatalog();

    // Add an emergency pattern with invalid floors
    const emergencyPattern = makePattern({
      sigma: 'land',
      kappa: 'emergency',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      battery_floor: 0.10,
      position_quality_floor: 0.0,
      valid_from: ['hover-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
    });
    catalog.patterns.set(emergencyPattern.id, emergencyPattern);

    const result = validateCatalog(catalog);

    const matchingErrors = result.errors.filter((e) =>
      e.includes('emergency pattern must have battery_floor = 0'),
    );
    expect(matchingErrors.length).toBeGreaterThan(0);
  });

  it('should error when emergency pattern has non-zero position_quality_floor', () => {
    const catalog = makeValidCatalog();

    const emergencyPattern = makePattern({
      sigma: 'land',
      kappa: 'emergency',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      battery_floor: 0,
      position_quality_floor: 0.5,
      valid_from: ['hover-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
    });
    catalog.patterns.set(emergencyPattern.id, emergencyPattern);

    const result = validateCatalog(catalog);

    const matchingErrors = result.errors.filter((e) =>
      e.includes('emergency pattern must have position_quality_floor = 0'),
    );
    expect(matchingErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 6. Dead-end pattern (no path to grounded) produces error
  // -----------------------------------------------------------------------
  it('should error when a pattern has no path to a grounded pattern', () => {
    // Build a catalog where a pattern forms a cycle with no exit to grounded.
    const patternA = makePattern({
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['translate-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['translate-autonomous-performer-bare.crazyflie-2.1'],
    });

    const patternB = makePattern({
      sigma: 'translate',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['hover-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['hover-autonomous-performer-bare.crazyflie-2.1'],
    });

    const catalog = makeCatalog([patternA, patternB]);
    const result = validateCatalog(catalog);

    const deadEndErrors = result.errors.filter((e) => e.includes('dead-end'));
    expect(deadEndErrors.length).toBeGreaterThan(0);
  });

  it('should NOT error on grounded patterns themselves (they are the target)', () => {
    const catalog = makeValidCatalog();
    const result = validateCatalog(catalog);

    const groundedDeadEnd = result.errors.filter(
      (e) => e.includes('grounded') && e.includes('dead-end'),
    );
    expect(groundedDeadEnd).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 7. Dependency violation produces error
  // -----------------------------------------------------------------------
  it('should error when fiber bundle dependency constraints are violated', () => {
    // follower -> valid lambda is shared-corridor (per ROLE_OWNERSHIP)
    // But we'll set lambda to 'comm-bridge' which is only valid for relay
    const badPattern = makePattern({
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'follower',
      lambda: 'comm-bridge', // Invalid for follower
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['takeoff-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['land-autonomous-performer-bare.crazyflie-2.1'],
    });

    // We also need a full valid chain so the dead-end check does not
    // obscure the dependency error.
    const takeoffPattern = makePattern({
      sigma: 'takeoff',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
      valid_to: ['hover-autonomous-follower-bare.crazyflie-2.1'],
    });

    const landPattern = makePattern({
      sigma: 'land',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['hover-autonomous-follower-bare.crazyflie-2.1'],
      valid_to: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
    });

    const groundedPattern = makePattern({
      sigma: 'grounded',
      kappa: 'autonomous',
      chi: 'reserve',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['land-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['takeoff-autonomous-performer-bare.crazyflie-2.1'],
      generator_type: 'idle',
    });

    const catalog = makeCatalog([badPattern, takeoffPattern, landPattern, groundedPattern]);
    const result = validateCatalog(catalog);

    const depErrors = result.errors.filter((e) => e.includes('dependency violation'));
    expect(depErrors.length).toBeGreaterThan(0);
  });

  it('should error when hardware/trait combination is invalid', () => {
    // esp-drone does not support 'solar-equipped' trait
    const badPattern = makePattern({
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'solar-equipped',
      rho: 'esp-drone',
      valid_from: ['land-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['land-autonomous-performer-bare.crazyflie-2.1'],
    });

    const catalog = makeValidCatalog();
    catalog.patterns.set(badPattern.id, badPattern);

    const result = validateCatalog(catalog);

    const depErrors = result.errors.filter((e) => e.includes('dependency violation'));
    expect(depErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 8. Unverified patterns produce warnings
  // -----------------------------------------------------------------------
  it('should warn when a pattern has verification status "unverified"', () => {
    const catalog = makeValidCatalog();

    // Set the hover pattern to unverified
    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.verification.status = 'unverified';

    const result = validateCatalog(catalog);

    const unverifiedWarnings = result.warnings.filter((w) =>
      w.includes('verification status is "unverified"'),
    );
    expect(unverifiedWarnings.length).toBeGreaterThan(0);
  });

  it('should warn when a pattern has empty verified_transitions', () => {
    const catalog = makeValidCatalog();

    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.verification.verified_transitions = [];

    const result = validateCatalog(catalog);

    const emptyTransitionWarnings = result.warnings.filter((w) =>
      w.includes('has no verified transitions'),
    );
    expect(emptyTransitionWarnings.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 9. Asymmetric transition warning
  // -----------------------------------------------------------------------
  it('should warn on asymmetric transitions (A valid_to B but B missing A in valid_from)', () => {
    const catalog = makeValidCatalog();

    // Remove hover from land's valid_from to create an asymmetry
    // hover lists land in valid_to, but land won't list hover in valid_from
    const land = catalog.patterns.get('land-autonomous-performer-bare.crazyflie-2.1')!;
    land.preconditions.valid_from = [];

    const result = validateCatalog(catalog);

    const asymmetricWarnings = result.warnings.filter((w) => w.includes('asymmetric'));
    expect(asymmetricWarnings.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 10. Pattern ID mismatch produces error
  // -----------------------------------------------------------------------
  it('should error when pattern ID does not match core coordinates', () => {
    const catalog = makeValidCatalog();

    const badPattern = makePattern({
      id: 'totally-wrong-id',
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'follower',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['land-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['land-autonomous-performer-bare.crazyflie-2.1'],
    });
    catalog.patterns.set(badPattern.id, badPattern);

    const result = validateCatalog(catalog);

    const idErrors = result.errors.filter((e) =>
      e.includes('ID does not match filename convention'),
    );
    expect(idErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 11. Completely isolated pattern produces error
  // -----------------------------------------------------------------------
  it('should error when a pattern has both empty valid_from and valid_to', () => {
    const catalog = makeValidCatalog();

    const isolatedPattern = makePattern({
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'follower',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: [],
      valid_to: [],
    });
    catalog.patterns.set(isolatedPattern.id, isolatedPattern);

    const result = validateCatalog(catalog);

    const isolatedErrors = result.errors.filter((e) => e.includes('completely isolated'));
    expect(isolatedErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 12. battery_floor out of range produces error
  // -----------------------------------------------------------------------
  it('should error when battery_floor is negative', () => {
    const catalog = makeValidCatalog();

    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.preconditions.battery_floor = -0.1;

    const result = validateCatalog(catalog);

    const rangeErrors = result.errors.filter((e) =>
      e.includes('battery_floor must be between 0 and 1'),
    );
    expect(rangeErrors.length).toBeGreaterThan(0);
  });

  it('should error when battery_floor is greater than 1', () => {
    const catalog = makeValidCatalog();

    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.preconditions.battery_floor = 1.5;

    const result = validateCatalog(catalog);

    const rangeErrors = result.errors.filter((e) =>
      e.includes('battery_floor must be between 0 and 1'),
    );
    expect(rangeErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 13. position_quality_floor out of range produces error
  // -----------------------------------------------------------------------
  it('should error when position_quality_floor is out of range', () => {
    const catalog = makeValidCatalog();

    const hover = catalog.patterns.get('hover-autonomous-performer-bare.crazyflie-2.1')!;
    hover.preconditions.position_quality_floor = 2.0;

    const result = validateCatalog(catalog);

    const rangeErrors = result.errors.filter((e) =>
      e.includes('position_quality_floor must be between 0 and 1'),
    );
    expect(rangeErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 14. Invalid sigma transition produces error
  // -----------------------------------------------------------------------
  it('should error when valid_to implies an invalid sigma transition', () => {
    // grounded -> orbit is invalid (must go through takeoff -> hover)
    const groundedPattern = makePattern({
      sigma: 'grounded',
      kappa: 'autonomous',
      chi: 'reserve',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['orbit-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['orbit-autonomous-performer-bare.crazyflie-2.1'],
      generator_type: 'idle',
    });

    const orbitPattern = makePattern({
      sigma: 'orbit',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
      valid_to: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
    });

    const catalog = makeCatalog([groundedPattern, orbitPattern]);
    const result = validateCatalog(catalog);

    const transitionErrors = result.errors.filter((e) =>
      e.includes('sigma transition') && e.includes('not valid per transition matrix'),
    );
    expect(transitionErrors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 15. Dead-end check considers forced_exits as valid paths
  // -----------------------------------------------------------------------
  it('should not flag dead-end if forced_exit provides path to grounded', () => {
    // hover has no valid_to, but a forced_exit to land, which leads to grounded.
    // takeoff -> hover is valid. grounded -> takeoff is valid.
    const takeoffPattern = makePattern({
      sigma: 'takeoff',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
      valid_to: ['hover-autonomous-performer-bare.crazyflie-2.1'],
    });

    const hoverPattern = makePattern({
      sigma: 'hover',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['takeoff-autonomous-performer-bare.crazyflie-2.1'],
      // No valid_to -- but forced_exit reaches land
      valid_to: [],
      forced_exits: [
        {
          condition: 'battery < 0.10',
          target_pattern: 'land-autonomous-performer-bare.crazyflie-2.1',
        },
      ],
    });

    const landPattern = makePattern({
      sigma: 'land',
      kappa: 'autonomous',
      chi: 'performer',
      lambda: 'exclusive-volume',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['hover-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['grounded-autonomous-reserve-bare.crazyflie-2.1'],
    });

    const groundedPattern = makePattern({
      sigma: 'grounded',
      kappa: 'autonomous',
      chi: 'reserve',
      lambda: 'shared-corridor',
      tau: 'bare',
      rho: 'crazyflie-2.1',
      valid_from: ['land-autonomous-performer-bare.crazyflie-2.1'],
      valid_to: ['takeoff-autonomous-performer-bare.crazyflie-2.1'],
      generator_type: 'idle',
    });

    const catalog = makeCatalog([takeoffPattern, hoverPattern, landPattern, groundedPattern]);
    const result = validateCatalog(catalog);

    // hover has no valid_to but has a forced_exit to land, so it should NOT
    // be flagged as dead-end. The forced exit provides the path to grounded.
    const deadEndErrors = result.errors.filter(
      (e) => e.includes('hover-autonomous-performer') && e.includes('dead-end'),
    );
    expect(deadEndErrors).toEqual([]);
  });
});
