import { describe, it, expect } from 'vitest';
import {
  TRANSITION_RULES,
  findTransitionRule,
  isTransitionValid,
  validTransitionsFrom,
  validTransitionsTo,
} from './transitions.js';
import { BEHAVIORAL_MODES, type BehavioralMode } from './dimensions.js';

describe('Transition matrix completeness', () => {
  it('every σ has at least one valid outgoing transition', () => {
    for (const mode of BEHAVIORAL_MODES) {
      const outgoing = validTransitionsFrom(mode);
      expect(
        outgoing.length,
        `${mode} has no valid outgoing transitions`,
      ).toBeGreaterThan(0);
    }
  });

  it('every σ has at least one valid incoming transition', () => {
    for (const mode of BEHAVIORAL_MODES) {
      const incoming = validTransitionsTo(mode);
      expect(
        incoming.length,
        `${mode} has no valid incoming transitions`,
      ).toBeGreaterThan(0);
    }
  });

  it('no σ is a dead end — every mode can eventually reach grounded', () => {
    // BFS from each mode to 'grounded'
    for (const start of BEHAVIORAL_MODES) {
      const visited = new Set<BehavioralMode>();
      const queue: BehavioralMode[] = [start];
      let found = start === 'grounded';

      while (queue.length > 0 && !found) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        for (const next of validTransitionsFrom(current)) {
          if (next === 'grounded') {
            found = true;
            break;
          }
          if (!visited.has(next)) {
            queue.push(next);
          }
        }
      }

      expect(found, `${start} cannot reach 'grounded'`).toBe(true);
    }
  });
});

describe('Specific transition rules', () => {
  it('grounded → orbit is invalid', () => {
    expect(isTransitionValid('grounded', 'orbit')).toBe(false);
  });

  it('grounded → orbit requires via takeoff', () => {
    const rule = findTransitionRule('grounded', 'orbit');
    expect(rule).not.toBeNull();
    expect(rule!.valid).toBe(false);
    expect(rule!.via).toBe('takeoff');
  });

  it('grounded → takeoff is valid', () => {
    expect(isTransitionValid('grounded', 'takeoff')).toBe(true);
  });

  it('takeoff → hover is valid', () => {
    expect(isTransitionValid('takeoff', 'hover')).toBe(true);
  });

  it('hover → orbit is valid', () => {
    expect(isTransitionValid('hover', 'orbit')).toBe(true);
  });

  it('* → avoid is always valid (emergency)', () => {
    for (const mode of BEHAVIORAL_MODES) {
      expect(
        isTransitionValid(mode, 'avoid'),
        `${mode} → avoid should be valid`,
      ).toBe(true);
    }
  });

  it('avoid → hover is valid (recovery)', () => {
    expect(isTransitionValid('avoid', 'hover')).toBe(true);
  });

  it('land → grounded is valid', () => {
    expect(isTransitionValid('land', 'grounded')).toBe(true);
  });

  it('dock → docked is valid', () => {
    expect(isTransitionValid('dock', 'docked')).toBe(true);
  });

  it('docked → undock is valid', () => {
    expect(isTransitionValid('docked', 'undock')).toBe(true);
  });

  it('undock → hover is valid', () => {
    expect(isTransitionValid('undock', 'hover')).toBe(true);
  });
});

describe('Transition rule properties', () => {
  it('all rules have non-negative transition times', () => {
    for (const rule of TRANSITION_RULES) {
      expect(
        rule.transition_time_s,
        `Rule ${rule.from} → ${rule.to} has negative transition time`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('emergency avoidance has fast transition time (≤0.2s)', () => {
    const rule = TRANSITION_RULES.find(
      (r) => r.from === '*' && r.to === 'avoid',
    );
    expect(rule).toBeDefined();
    expect(rule!.transition_time_s).toBeLessThanOrEqual(0.2);
  });

  it('invalid rules with via suggest a valid intermediate path', () => {
    const viaRules = TRANSITION_RULES.filter(
      (r) => !r.valid && r.via !== undefined,
    );
    for (const rule of viaRules) {
      // The 'via' mode should be a valid transition from the source
      if (rule.from !== '*') {
        expect(
          isTransitionValid(rule.from as BehavioralMode, rule.via!),
          `${rule.from} → ${rule.via} (via) should be valid`,
        ).toBe(true);
      }
    }
  });
});
