/**
 * Seshat Swarm — Transition Matrix
 *
 * Defines which σ→σ transitions are valid for a single drone.
 * Populated from docs/DRONE-9D-SPACE.md transition table.
 *
 * Rules:
 *  - Every σ has at least one valid outgoing and incoming transition
 *  - grounded → orbit is invalid (must go through takeoff → hover)
 *  - * → avoid (emergency) is always valid
 *  - No σ is a dead end (can always reach grounded eventually)
 */

import { type BehavioralMode, BEHAVIORAL_MODES } from './dimensions.js';

/**
 * A single rule in the transition matrix.
 * Supports wildcards ('*') for broad rules like "any → avoid".
 */
export interface TransitionRule {
  /** Source behavioral mode, or '*' for any */
  from: BehavioralMode | '*';
  /** Target behavioral mode, or '*' for any */
  to: BehavioralMode | '*';
  /** Whether this transition is allowed */
  valid: boolean;
  /** Intermediate mode required (e.g., must hover before orbiting from translate) */
  via?: BehavioralMode;
  /** Estimated transition time in seconds */
  transition_time_s: number;
  /** Human-readable reason (especially for invalid transitions) */
  reason?: string;
}

/**
 * The initial transition matrix.
 *
 * Evaluation order: specific rules override wildcards.
 * A transition is valid if ANY matching rule says valid=true,
 * UNLESS a more specific rule says valid=false.
 */
export const TRANSITION_RULES: readonly TransitionRule[] = [
  // -------------------------------------------------------------------
  // Universal rules (wildcard)
  // -------------------------------------------------------------------
  {
    from: '*',
    to: 'avoid',
    valid: true,
    transition_time_s: 0.1,
    reason: 'Emergency avoidance is always available',
  },

  // -------------------------------------------------------------------
  // Grounded (on ground, powered)
  // -------------------------------------------------------------------
  {
    from: 'grounded',
    to: 'takeoff',
    valid: true,
    transition_time_s: 0.5,
  },
  // Grounded is a terminal — only exit is takeoff
  {
    from: 'grounded',
    to: 'hover',
    valid: false,
    via: 'takeoff',
    transition_time_s: 0,
    reason: 'Must take off before hovering',
  },
  {
    from: 'grounded',
    to: 'translate',
    valid: false,
    via: 'takeoff',
    transition_time_s: 0,
    reason: 'Must take off before translating',
  },
  {
    from: 'grounded',
    to: 'orbit',
    valid: false,
    via: 'takeoff',
    transition_time_s: 0,
    reason: 'Must take off before orbiting',
  },

  // -------------------------------------------------------------------
  // Takeoff (controlled ascent from surface)
  // -------------------------------------------------------------------
  {
    from: 'takeoff',
    to: 'hover',
    valid: true,
    transition_time_s: 1.0,
    reason: 'Normal takeoff completion',
  },

  // -------------------------------------------------------------------
  // Hover (stationary position hold)
  // -------------------------------------------------------------------
  {
    from: 'hover',
    to: 'translate',
    valid: true,
    transition_time_s: 0.5,
  },
  {
    from: 'hover',
    to: 'orbit',
    valid: true,
    transition_time_s: 1.5,
  },
  {
    from: 'hover',
    to: 'climb',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'hover',
    to: 'descend',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'hover',
    to: 'land',
    valid: true,
    transition_time_s: 0.5,
  },
  {
    from: 'hover',
    to: 'dock',
    valid: true,
    transition_time_s: 1.0,
  },
  {
    from: 'hover',
    to: 'formation-hold',
    valid: true,
    transition_time_s: 0.5,
  },
  {
    from: 'hover',
    to: 'relay-hold',
    valid: true,
    transition_time_s: 0.3,
  },

  // -------------------------------------------------------------------
  // Translate (moving from A to B)
  // -------------------------------------------------------------------
  {
    from: 'translate',
    to: 'hover',
    valid: true,
    transition_time_s: 0.5,
  },
  {
    from: 'translate',
    to: 'dock',
    valid: true,
    transition_time_s: 1.0,
    reason: 'Approach dock while translating (charger-inbound)',
  },
  {
    from: 'translate',
    to: 'relay-hold',
    valid: true,
    transition_time_s: 0.5,
    reason: 'Arrive at relay position after translating',
  },
  {
    from: 'translate',
    to: 'orbit',
    valid: true,
    transition_time_s: 1.0,
  },
  {
    from: 'translate',
    to: 'climb',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'translate',
    to: 'descend',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'translate',
    to: 'formation-hold',
    valid: true,
    transition_time_s: 0.5,
  },

  // -------------------------------------------------------------------
  // Orbit (circling a fixed point)
  // -------------------------------------------------------------------
  {
    from: 'orbit',
    to: 'hover',
    valid: true,
    transition_time_s: 1.0,
  },
  {
    from: 'orbit',
    to: 'translate',
    valid: true,
    transition_time_s: 1.0,
  },

  // -------------------------------------------------------------------
  // Avoid (emergency collision avoidance)
  // -------------------------------------------------------------------
  {
    from: 'avoid',
    to: 'hover',
    valid: true,
    transition_time_s: 0.5,
    reason: 'Return to hover after avoidance clears',
  },
  {
    from: 'avoid',
    to: 'land',
    valid: true,
    transition_time_s: 0.5,
    reason: 'Emergency land after avoidance (critical battery)',
  },

  // -------------------------------------------------------------------
  // Climb (gaining altitude)
  // -------------------------------------------------------------------
  {
    from: 'climb',
    to: 'hover',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'climb',
    to: 'translate',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'climb',
    to: 'descend',
    valid: true,
    transition_time_s: 0.5,
  },

  // -------------------------------------------------------------------
  // Descend (losing altitude)
  // -------------------------------------------------------------------
  {
    from: 'descend',
    to: 'hover',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'descend',
    to: 'translate',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'descend',
    to: 'land',
    valid: true,
    transition_time_s: 0.5,
  },

  // -------------------------------------------------------------------
  // Land (controlled descent to surface)
  // -------------------------------------------------------------------
  {
    from: 'land',
    to: 'grounded',
    valid: true,
    transition_time_s: 1.0,
    reason: 'Landing complete',
  },

  // -------------------------------------------------------------------
  // Dock (approaching charging pad)
  // -------------------------------------------------------------------
  {
    from: 'dock',
    to: 'docked',
    valid: true,
    transition_time_s: 2.0,
    reason: 'Docking complete',
  },

  // -------------------------------------------------------------------
  // Docked (connected to charging infrastructure)
  // -------------------------------------------------------------------
  {
    from: 'docked',
    to: 'undock',
    valid: true,
    transition_time_s: 1.0,
  },

  // -------------------------------------------------------------------
  // Undock (departing from dock)
  // -------------------------------------------------------------------
  {
    from: 'undock',
    to: 'hover',
    valid: true,
    transition_time_s: 1.0,
    reason: 'Undocking complete, return to hover',
  },
  {
    from: 'undock',
    to: 'translate',
    valid: true,
    transition_time_s: 1.0,
    reason: 'Undock and immediately translate to rejoin formation',
  },

  // -------------------------------------------------------------------
  // Formation Hold (maintaining relative position)
  // -------------------------------------------------------------------
  {
    from: 'formation-hold',
    to: 'translate',
    valid: true,
    transition_time_s: 0.5,
  },
  {
    from: 'formation-hold',
    to: 'hover',
    valid: true,
    transition_time_s: 0.5,
  },
  {
    from: 'formation-hold',
    to: 'formation-transition',
    valid: true,
    transition_time_s: 0.3,
  },

  // -------------------------------------------------------------------
  // Formation Transition (moving to new formation slot)
  // -------------------------------------------------------------------
  {
    from: 'formation-transition',
    to: 'formation-hold',
    valid: true,
    transition_time_s: 1.0,
    reason: 'Arrived at new formation slot',
  },
  {
    from: 'formation-transition',
    to: 'hover',
    valid: true,
    transition_time_s: 0.5,
  },

  // -------------------------------------------------------------------
  // Relay Hold (stationary position hold for communication relay)
  // -------------------------------------------------------------------
  {
    from: 'relay-hold',
    to: 'hover',
    valid: true,
    transition_time_s: 0.3,
  },
  {
    from: 'relay-hold',
    to: 'translate',
    valid: true,
    transition_time_s: 0.5,
  },
] as const;

// ---------------------------------------------------------------------------
// Transition Lookup
// ---------------------------------------------------------------------------

/**
 * Check whether a σ→σ transition is valid.
 *
 * Looks up rules in specificity order:
 *  1. Exact (from, to) match
 *  2. Wildcard (*, to) or (from, *) match
 *
 * Returns the matching rule, or null if no rule covers this transition
 * (which means the transition is implicitly invalid).
 */
export function findTransitionRule(
  from: BehavioralMode,
  to: BehavioralMode,
): TransitionRule | null {
  // Exact match first
  const exact = TRANSITION_RULES.find(
    (r) => r.from === from && r.to === to,
  );
  if (exact) return exact;

  // Wildcard: * → to
  const wildcardFrom = TRANSITION_RULES.find(
    (r) => r.from === '*' && r.to === to,
  );
  if (wildcardFrom) return wildcardFrom;

  // Wildcard: from → *
  const wildcardTo = TRANSITION_RULES.find(
    (r) => r.from === from && r.to === '*',
  );
  if (wildcardTo) return wildcardTo;

  // No rule → implicitly invalid
  return null;
}

/**
 * Check if a transition is valid. Returns true only if a matching rule
 * exists AND that rule has valid=true.
 *
 * Self-transitions (from === to) are always valid — they represent
 * role/autonomy/ownership changes within the same behavioral mode.
 * The transition matrix governs σ→σ' changes; when σ doesn't change,
 * there's no σ constraint to enforce.
 */
export function isTransitionValid(
  from: BehavioralMode,
  to: BehavioralMode,
): boolean {
  if (from === to) return true;
  const rule = findTransitionRule(from, to);
  return rule !== null && rule.valid;
}

/**
 * Get all valid outgoing transitions from a given mode.
 */
export function validTransitionsFrom(from: BehavioralMode): BehavioralMode[] {
  const results: BehavioralMode[] = [];
  for (const to of BEHAVIORAL_MODES) {
    if (to !== from && isTransitionValid(from, to)) {
      results.push(to);
    }
  }
  return results;
}

/**
 * Get all valid incoming transitions to a given mode.
 */
export function validTransitionsTo(to: BehavioralMode): BehavioralMode[] {
  const results: BehavioralMode[] = [];
  for (const from of BEHAVIORAL_MODES) {
    if (from !== to && isTransitionValid(from, to)) {
      results.push(from);
    }
  }
  return results;
}
