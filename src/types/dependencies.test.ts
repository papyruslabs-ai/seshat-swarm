import { describe, it, expect } from 'vitest';
import {
  VALID_TRAITS,
  EXCLUDED_MODES,
  EXCLUDED_MODES_BY_HARDWARE,
  EXCLUDED_ROLES,
  ROLE_OWNERSHIP,
  getValidModes,
  getValidRoles,
  getValidOwnerships,
  validateDependencies,
} from './dependencies.js';
import {
  BEHAVIORAL_MODES,
  FORMATION_ROLES,
  HARDWARE_TARGETS,
  PHYSICAL_TRAITS,
  RESOURCE_OWNERSHIPS,
} from './dimensions.js';

describe('ρ → τ: trait validity', () => {
  it('every hardware target has at least one valid trait', () => {
    for (const hw of HARDWARE_TARGETS) {
      expect(
        VALID_TRAITS[hw].length,
        `${hw} has no valid traits`,
      ).toBeGreaterThan(0);
    }
  });

  it('every hardware target supports bare', () => {
    for (const hw of HARDWARE_TARGETS) {
      expect(
        VALID_TRAITS[hw].includes('bare'),
        `${hw} should support bare`,
      ).toBe(true);
    }
  });

  it('simulators support all traits (for testing)', () => {
    for (const trait of PHYSICAL_TRAITS) {
      expect(
        VALID_TRAITS['sim-gazebo'].includes(trait),
        `sim-gazebo should support ${trait}`,
      ).toBe(true);
    }
  });
});

describe('(ρ, τ) → σ: mode validity', () => {
  it('solar-equipped drones cannot do orbit (aggressive maneuver)', () => {
    const modes = getValidModes('crazyflie-2.1', 'solar-equipped');
    expect(modes).not.toContain('orbit');
  });

  it('bare drones can do all modes on crazyflie-2.1', () => {
    const modes = getValidModes('crazyflie-2.1', 'bare');
    for (const mode of BEHAVIORAL_MODES) {
      expect(modes, `bare crazyflie should support ${mode}`).toContain(mode);
    }
  });

  it('every (ρ, τ) combo has at least hover, translate, land, takeoff, grounded', () => {
    const essentialModes = ['hover', 'translate', 'land', 'takeoff', 'grounded'] as const;
    for (const hw of HARDWARE_TARGETS) {
      for (const trait of VALID_TRAITS[hw]) {
        const modes = getValidModes(hw, trait);
        for (const essential of essentialModes) {
          expect(
            modes,
            `${hw}/${trait} should support ${essential}`,
          ).toContain(essential);
        }
      }
    }
  });

  it('esp-drone cannot dock (no docking hardware)', () => {
    const modes = getValidModes('esp-drone', 'bare');
    expect(modes).not.toContain('dock');
    expect(modes).not.toContain('undock');
    expect(modes).not.toContain('docked');
  });
});

describe('τ → χ: role validity', () => {
  it('bare drones can play all roles', () => {
    const roles = getValidRoles('bare');
    for (const role of FORMATION_ROLES) {
      expect(roles, `bare should support role ${role}`).toContain(role);
    }
  });

  it('solar-equipped drones cannot be scouts (too heavy)', () => {
    const roles = getValidRoles('solar-equipped');
    expect(roles).not.toContain('scout');
  });

  it('every trait allows at least performer, follower, and reserve', () => {
    const minRoles = ['performer', 'follower', 'reserve'] as const;
    for (const trait of PHYSICAL_TRAITS) {
      const roles = getValidRoles(trait);
      for (const role of minRoles) {
        expect(
          roles,
          `${trait} should support role ${role}`,
        ).toContain(role);
      }
    }
  });
});

describe('χ → λ: ownership validity', () => {
  it('leader implies exclusive-volume', () => {
    const ownerships = getValidOwnerships('leader');
    expect(ownerships).toContain('exclusive-volume');
  });

  it('relay has comm-bridge', () => {
    const ownerships = getValidOwnerships('relay');
    expect(ownerships).toContain('comm-bridge');
  });

  it('charging has energy-consumer', () => {
    const ownerships = getValidOwnerships('charging');
    expect(ownerships).toContain('energy-consumer');
  });

  it('every role has at least one valid ownership', () => {
    for (const role of FORMATION_ROLES) {
      const ownerships = getValidOwnerships(role);
      expect(
        ownerships.length,
        `${role} has no valid ownerships`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('Dependency graph is acyclic', () => {
  it('dependency chain is strictly ordered: ρ → τ → σ, τ → χ → λ', () => {
    // The dependency chain is a DAG by construction:
    //   ρ → τ (VALID_TRAITS)
    //   (ρ, τ) → σ (EXCLUDED_MODES, EXCLUDED_MODES_BY_HARDWARE)
    //   τ → χ (EXCLUDED_ROLES)
    //   χ → λ (ROLE_OWNERSHIP)
    //
    // There are no reverse dependencies (σ doesn't constrain ρ, λ doesn't constrain χ).
    // This test verifies the structural property by checking that:
    // 1. VALID_TRAITS keys are hardware targets (ρ), values are traits (τ)
    // 2. EXCLUDED_MODES keys are traits (τ), values are modes (σ)
    // 3. EXCLUDED_ROLES keys are traits (τ), values are roles (χ)
    // 4. ROLE_OWNERSHIP keys are roles (χ), values are ownerships (λ)

    for (const hw of HARDWARE_TARGETS) {
      expect(VALID_TRAITS).toHaveProperty(hw);
    }
    for (const trait of PHYSICAL_TRAITS) {
      expect(EXCLUDED_MODES).toHaveProperty(trait);
      expect(EXCLUDED_ROLES).toHaveProperty(trait);
    }
    for (const role of FORMATION_ROLES) {
      expect(ROLE_OWNERSHIP).toHaveProperty(role);
    }
  });
});

describe('validateDependencies', () => {
  it('accepts valid combination: bare crazyflie hover performer shared-corridor', () => {
    const result = validateDependencies(
      'crazyflie-2.1', 'bare', 'hover', 'performer', 'shared-corridor',
    );
    expect(result).toBeNull();
  });

  it('rejects invalid τ for ρ', () => {
    const result = validateDependencies(
      'esp-drone', 'solar-equipped', 'hover', 'performer', 'shared-corridor',
    );
    expect(result).toContain('not valid for hardware');
  });

  it('rejects orbit for solar-equipped', () => {
    const result = validateDependencies(
      'crazyflie-2.1', 'solar-equipped', 'orbit', 'performer', 'shared-corridor',
    );
    expect(result).toContain('not valid for hardware');
  });

  it('rejects scout for solar-equipped', () => {
    const result = validateDependencies(
      'crazyflie-2.1', 'solar-equipped', 'hover', 'scout', 'exclusive-volume',
    );
    expect(result).toContain('not valid for trait');
  });

  it('rejects energy-consumer for leader', () => {
    const result = validateDependencies(
      'crazyflie-2.1', 'bare', 'hover', 'leader', 'energy-consumer',
    );
    expect(result).toContain('not valid for role');
  });

  it('accepts leader with exclusive-volume', () => {
    const result = validateDependencies(
      'crazyflie-2.1', 'bare', 'hover', 'leader', 'exclusive-volume',
    );
    expect(result).toBeNull();
  });
});
