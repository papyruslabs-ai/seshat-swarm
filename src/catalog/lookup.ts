/**
 * Seshat Swarm — Behavioral Catalog Lookup
 *
 * O(1) pattern lookup, filtering by core dimensions, pairwise compatibility
 * checking, and transition validation. The catalog is loaded from disk
 * (JSON pattern files + compatibility matrix) and indexed into a Map for
 * constant-time access.
 *
 * This module is the runtime entry point for the "selection, not generation"
 * principle: drones select from the pre-verified catalog, they never generate
 * novel behavior.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CorePattern } from '../types/dimensions.js';
import { findTransitionRule } from '../types/transitions.js';
import type {
  BehavioralPattern,
  CompatibilityRule,
  BehavioralCatalog,
} from './types.js';

// ---------------------------------------------------------------------------
// Catalog Loading
// ---------------------------------------------------------------------------

/**
 * Load the behavioral catalog from disk.
 *
 * Reads all `*.pattern.json` files from `{catalogDir}/patterns/` and the
 * `{catalogDir}/compatibility-matrix.json` file. Builds an indexed Map
 * for O(1) lookup by pattern ID.
 *
 * @param catalogDir — path to the catalog root directory
 * @returns The fully loaded and indexed BehavioralCatalog
 * @throws If the directory is unreadable or JSON is malformed
 */
export function loadCatalog(catalogDir: string): BehavioralCatalog {
  const patternsDir = join(catalogDir, 'patterns');
  const patterns = new Map<string, BehavioralPattern>();

  // Read all *.pattern.json files
  const files = readdirSync(patternsDir).filter((f) =>
    f.endsWith('.pattern.json'),
  );

  for (const file of files) {
    const filePath = join(patternsDir, file);
    const raw = readFileSync(filePath, 'utf-8');
    const pattern: BehavioralPattern = JSON.parse(raw);
    patterns.set(pattern.id, pattern);
  }

  // Read compatibility matrix
  const compatPath = join(catalogDir, 'compatibility-matrix.json');
  let compatibility: CompatibilityRule[] = [];
  try {
    const raw = readFileSync(compatPath, 'utf-8');
    compatibility = JSON.parse(raw);
  } catch {
    // Compatibility matrix is optional — empty rules means default behavior
    compatibility = [];
  }

  return { patterns, compatibility };
}

// ---------------------------------------------------------------------------
// O(1) Pattern Lookup
// ---------------------------------------------------------------------------

/**
 * Look up a behavioral pattern by its unique ID.
 *
 * This is the core "selection" operation. O(1) via Map.get().
 *
 * @returns The pattern, or null if not found in the catalog
 */
export function lookupPattern(
  catalog: BehavioralCatalog,
  id: string,
): BehavioralPattern | null {
  return catalog.patterns.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Filtering by Core Dimensions
// ---------------------------------------------------------------------------

/**
 * Filter catalog patterns by a partial core specification.
 *
 * Useful for questions like "show me all hover patterns for crazyflie-2.1"
 * (partial = { sigma: 'hover', rho: 'crazyflie-2.1' }).
 *
 * Every field in the partial spec must match; fields not specified are ignored.
 *
 * @param catalog — the loaded catalog
 * @param partial — partial CorePattern spec; only specified fields are checked
 * @returns All patterns matching every specified dimension
 */
export function filterByCore(
  catalog: BehavioralCatalog,
  partial: Partial<CorePattern>,
): BehavioralPattern[] {
  const results: BehavioralPattern[] = [];

  for (const pattern of catalog.patterns.values()) {
    let matches = true;

    if (partial.sigma !== undefined && pattern.core.sigma !== partial.sigma) {
      matches = false;
    }
    if (partial.kappa !== undefined && pattern.core.kappa !== partial.kappa) {
      matches = false;
    }
    if (partial.chi !== undefined && pattern.core.chi !== partial.chi) {
      matches = false;
    }
    if (partial.lambda !== undefined && pattern.core.lambda !== partial.lambda) {
      matches = false;
    }
    if (partial.tau !== undefined && pattern.core.tau !== partial.tau) {
      matches = false;
    }
    if (partial.rho !== undefined && pattern.core.rho !== partial.rho) {
      matches = false;
    }

    if (matches) {
      results.push(pattern);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Compatibility Checking
// ---------------------------------------------------------------------------

/**
 * Test whether a pattern ID matches a compatibility rule pattern string.
 *
 * Handles four cases:
 *  - "*"            — matches anything
 *  - "hover-*"      — prefix match (ID starts with "hover-")
 *  - "*-leader-*"   — infix match (ID contains "-leader-")
 *  - exact string   — literal equality
 */
export function matchesPattern(
  patternId: string,
  rulePattern: string,
): boolean {
  // Universal wildcard
  if (rulePattern === '*') {
    return true;
  }

  // Check for wildcard characters
  if (rulePattern.includes('*')) {
    // Split on * to get literal segments
    const segments = rulePattern.split('*');
    // All segments must appear in order within the patternId
    let searchFrom = 0;

    // If pattern starts with *, first segment is empty — no prefix constraint
    // If pattern does NOT start with *, patternId must start with the first segment
    if (segments[0] !== '') {
      if (!patternId.startsWith(segments[0])) {
        return false;
      }
      searchFrom = segments[0].length;
    }

    // If pattern ends with *, last segment is empty — no suffix constraint
    // If pattern does NOT end with *, patternId must end with the last segment
    const lastSegment = segments[segments.length - 1];
    const mustMatchSuffix = lastSegment !== '';

    // Check middle segments appear in order
    for (let i = 1; i < segments.length - 1; i++) {
      if (segments[i] === '') continue;
      const idx = patternId.indexOf(segments[i], searchFrom);
      if (idx === -1) {
        return false;
      }
      searchFrom = idx + segments[i].length;
    }

    // Check suffix constraint
    if (mustMatchSuffix) {
      if (!patternId.endsWith(lastSegment)) {
        return false;
      }
      // Ensure the suffix doesn't overlap with previously matched content
      if (patternId.length - lastSegment.length < searchFrom) {
        return false;
      }
    }

    return true;
  }

  // Exact match
  return patternId === rulePattern;
}

/**
 * Score a compatibility rule by specificity. More specific rules should
 * take precedence over wildcards.
 *
 * Specificity: exact match > prefix/infix > universal wildcard
 */
function ruleSpecificity(rule: CompatibilityRule): number {
  let score = 0;
  if (rule.pattern_a === '*') score += 0;
  else if (rule.pattern_a.includes('*')) score += 1;
  else score += 2;

  if (rule.pattern_b === '*') score += 0;
  else if (rule.pattern_b.includes('*')) score += 1;
  else score += 2;

  return score;
}

/**
 * Check whether two patterns are compatible at a given separation distance.
 *
 * Looks through the compatibility matrix for matching rules. A pair of
 * pattern IDs matches a rule if patternA matches rule.pattern_a AND
 * patternB matches rule.pattern_b, OR vice versa (rules are bidirectional).
 *
 * When multiple rules match, the most specific one wins. A compatible rule
 * additionally requires that the actual separation meets the rule's
 * min_separation_m.
 *
 * If no rule matches at all, the patterns are considered compatible
 * (open-world assumption — only explicitly incompatible pairs are blocked).
 *
 * @returns true if compatible at the given separation, false otherwise
 */
export function isCompatible(
  catalog: BehavioralCatalog,
  patternA: string,
  patternB: string,
  separation_m: number,
): boolean {
  // Find all matching rules (check both orderings since rules are bidirectional)
  let bestRule: CompatibilityRule | null = null;
  let bestSpecificity = -1;

  for (const rule of catalog.compatibility) {
    const matchForward =
      matchesPattern(patternA, rule.pattern_a) &&
      matchesPattern(patternB, rule.pattern_b);
    const matchReverse =
      matchesPattern(patternA, rule.pattern_b) &&
      matchesPattern(patternB, rule.pattern_a);

    if (matchForward || matchReverse) {
      const spec = ruleSpecificity(rule);
      if (spec > bestSpecificity) {
        bestSpecificity = spec;
        bestRule = rule;
      }
    }
  }

  // No matching rule — default to compatible
  if (bestRule === null) {
    return true;
  }

  // Rule found — check compatibility and separation
  if (!bestRule.compatible) {
    return false;
  }

  return separation_m >= bestRule.min_separation_m;
}

// ---------------------------------------------------------------------------
// Transition Validation
// ---------------------------------------------------------------------------

/**
 * Check whether transitioning from one pattern to another is valid.
 *
 * Three conditions must ALL hold:
 *  1. The target pattern ID appears in the source's postconditions.valid_to
 *  2. The source pattern ID appears in the target's preconditions.valid_from
 *  3. The sigma-level transition (fromPattern.core.sigma -> toPattern.core.sigma)
 *     is valid according to the transition matrix
 *
 * If either pattern is not in the catalog, returns false.
 */
export function isPatternTransitionValid(
  catalog: BehavioralCatalog,
  fromId: string,
  toId: string,
): boolean {
  const fromPattern = catalog.patterns.get(fromId);
  const toPattern = catalog.patterns.get(toId);

  if (!fromPattern || !toPattern) {
    return false;
  }

  // 1. toId must be in fromPattern's valid_to list
  if (!fromPattern.postconditions.valid_to.includes(toId)) {
    return false;
  }

  // 2. fromId must be in toPattern's valid_from list
  if (!toPattern.preconditions.valid_from.includes(fromId)) {
    return false;
  }

  // 3. Sigma-level transition must be valid
  const sigmaRule = findTransitionRule(
    fromPattern.core.sigma,
    toPattern.core.sigma,
  );
  if (!sigmaRule || !sigmaRule.valid) {
    return false;
  }

  return true;
}
