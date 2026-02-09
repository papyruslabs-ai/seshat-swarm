/**
 * Seshat Swarm -- Catalog Validation Script
 *
 * Validates the entire behavioral catalog for internal consistency.
 * Can be run standalone or imported as a library.
 *
 * Usage:
 *   npx tsx scripts/validate-catalog.ts [catalogDir]
 *
 * Checks (errors):
 *   - All valid_to / valid_from / forced_exit targets reference existing pattern IDs
 *   - Pattern ID matches filename convention {sigma}-{kappa}-{chi}-{tau}.{rho}
 *   - Sigma-level transitions are consistent with the transition matrix
 *   - Fiber bundle dependency constraints are respected
 *   - Emergency patterns have battery_floor = 0 and position_quality_floor = 0
 *   - No completely isolated patterns (empty valid_from AND valid_to)
 *   - Precondition values are in valid ranges
 *   - No dead-end patterns (every pattern can reach grounded via valid_to)
 *
 * Checks (warnings):
 *   - Empty verified_transitions
 *   - Unverified status
 *   - Asymmetric transitions (A lists B in valid_to but B does not list A in valid_from)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BehavioralPattern, BehavioralCatalog } from '../src/catalog/types.js';
import { isTransitionValid } from '../src/types/transitions.js';
import { validateDependencies } from '../src/types/dependencies.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Core Validation
// ---------------------------------------------------------------------------

/**
 * Validate a loaded BehavioralCatalog for internal consistency.
 * Returns errors (must fix) and warnings (informational).
 */
export function validateCatalog(catalog: BehavioralCatalog): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const patternIds = new Set(catalog.patterns.keys());

  for (const [id, pattern] of catalog.patterns) {
    // ------------------------------------------------------------------
    // Check 4: Pattern ID matches filename convention
    // ------------------------------------------------------------------
    const { sigma, kappa, chi, tau, rho } = pattern.core;
    const expectedId = `${sigma}-${kappa}-${chi}-${tau}.${rho}`;
    if (id !== expectedId) {
      errors.push(
        `Pattern "${id}": ID does not match filename convention. ` +
        `Expected "${expectedId}" from core coordinates.`,
      );
    }

    // ------------------------------------------------------------------
    // Check 1: All valid_to entries reference existing pattern IDs
    // ------------------------------------------------------------------
    for (const targetId of pattern.postconditions.valid_to) {
      if (!patternIds.has(targetId)) {
        errors.push(
          `Pattern "${id}": valid_to references non-existent pattern "${targetId}".`,
        );
      }
    }

    // ------------------------------------------------------------------
    // Check 2: All valid_from entries reference existing pattern IDs
    // ------------------------------------------------------------------
    for (const sourceId of pattern.preconditions.valid_from) {
      if (!patternIds.has(sourceId)) {
        errors.push(
          `Pattern "${id}": valid_from references non-existent pattern "${sourceId}".`,
        );
      }
    }

    // ------------------------------------------------------------------
    // Check 3: All forced_exits[].target_pattern reference existing IDs
    // ------------------------------------------------------------------
    for (const exit of pattern.postconditions.forced_exits) {
      if (!patternIds.has(exit.target_pattern)) {
        errors.push(
          `Pattern "${id}": forced_exit target "${exit.target_pattern}" does not exist.`,
        );
      }
    }

    // ------------------------------------------------------------------
    // Check 5: Sigma transition consistency
    // For each valid_to target, the sigma-level transition must be valid.
    // ------------------------------------------------------------------
    for (const targetId of pattern.postconditions.valid_to) {
      const target = catalog.patterns.get(targetId);
      if (target) {
        const fromSigma = pattern.core.sigma;
        const toSigma = target.core.sigma;
        if (!isTransitionValid(fromSigma, toSigma)) {
          errors.push(
            `Pattern "${id}": valid_to "${targetId}" requires sigma transition ` +
            `"${fromSigma}" -> "${toSigma}" which is not valid per transition matrix.`,
          );
        }
      }
    }

    // ------------------------------------------------------------------
    // Check 6: Dependency constraints
    // ------------------------------------------------------------------
    const depError = validateDependencies(
      pattern.core.rho,
      pattern.core.tau,
      pattern.core.sigma,
      pattern.core.chi,
      pattern.core.lambda,
    );
    if (depError !== null) {
      errors.push(
        `Pattern "${id}": dependency violation: ${depError}`,
      );
    }

    // ------------------------------------------------------------------
    // Check 7: Emergency patterns must have floors = 0
    // ------------------------------------------------------------------
    if (pattern.core.kappa === 'emergency') {
      if (pattern.preconditions.battery_floor !== 0) {
        errors.push(
          `Pattern "${id}": emergency pattern must have battery_floor = 0, ` +
          `got ${pattern.preconditions.battery_floor}.`,
        );
      }
      if (pattern.preconditions.position_quality_floor !== 0) {
        errors.push(
          `Pattern "${id}": emergency pattern must have position_quality_floor = 0, ` +
          `got ${pattern.preconditions.position_quality_floor}.`,
        );
      }
    }

    // ------------------------------------------------------------------
    // Check 8: No completely isolated patterns
    // ------------------------------------------------------------------
    if (
      pattern.preconditions.valid_from.length === 0 &&
      pattern.postconditions.valid_to.length === 0
    ) {
      errors.push(
        `Pattern "${id}": completely isolated (both valid_from and valid_to are empty).`,
      );
    }

    // ------------------------------------------------------------------
    // Check 9: battery_floor in [0, 1]
    // ------------------------------------------------------------------
    if (
      pattern.preconditions.battery_floor < 0 ||
      pattern.preconditions.battery_floor > 1
    ) {
      errors.push(
        `Pattern "${id}": battery_floor must be between 0 and 1, ` +
        `got ${pattern.preconditions.battery_floor}.`,
      );
    }

    // ------------------------------------------------------------------
    // Check 10: position_quality_floor in [0, 1]
    // ------------------------------------------------------------------
    if (
      pattern.preconditions.position_quality_floor < 0 ||
      pattern.preconditions.position_quality_floor > 1
    ) {
      errors.push(
        `Pattern "${id}": position_quality_floor must be between 0 and 1, ` +
        `got ${pattern.preconditions.position_quality_floor}.`,
      );
    }

    // ------------------------------------------------------------------
    // Warning 1: Empty verified_transitions
    // ------------------------------------------------------------------
    if (pattern.verification.verified_transitions.length === 0) {
      warnings.push(
        `Pattern "${id}": has no verified transitions.`,
      );
    }

    // ------------------------------------------------------------------
    // Warning 2: Unverified status
    // ------------------------------------------------------------------
    if (pattern.verification.status === 'unverified') {
      warnings.push(
        `Pattern "${id}": verification status is "unverified".`,
      );
    }

    // ------------------------------------------------------------------
    // Warning 3: Asymmetric transitions
    // If A lists B in valid_to, B should list A in valid_from.
    // ------------------------------------------------------------------
    for (const targetId of pattern.postconditions.valid_to) {
      const target = catalog.patterns.get(targetId);
      if (target && !target.preconditions.valid_from.includes(id)) {
        warnings.push(
          `Pattern "${id}": lists "${targetId}" in valid_to, ` +
          `but "${targetId}" does not list "${id}" in valid_from (asymmetric).`,
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Dead-end check: every pattern must reach a grounded pattern via
  // valid_to chains (BFS).
  // ------------------------------------------------------------------
  for (const [id, pattern] of catalog.patterns) {
    if (pattern.core.sigma === 'grounded') {
      // Grounded patterns are themselves the target -- not dead ends.
      continue;
    }

    if (!canReachGrounded(id, catalog)) {
      errors.push(
        `Pattern "${id}": dead-end -- no path to a grounded pattern via valid_to.`,
      );
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// BFS helper: can pattern `startId` reach any pattern with sigma=grounded?
// ---------------------------------------------------------------------------

function canReachGrounded(startId: string, catalog: BehavioralCatalog): boolean {
  const visited = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const current = catalog.patterns.get(currentId);
    if (!current) continue;

    // Check if this pattern is grounded
    if (current.core.sigma === 'grounded') {
      return true;
    }

    // Enqueue all valid_to targets and forced_exit targets
    for (const targetId of current.postconditions.valid_to) {
      if (!visited.has(targetId)) {
        queue.push(targetId);
      }
    }
    for (const exit of current.postconditions.forced_exits) {
      if (!visited.has(exit.target_pattern)) {
        queue.push(exit.target_pattern);
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Catalog Loading
// ---------------------------------------------------------------------------

/**
 * Load a BehavioralCatalog from a directory on disk.
 *
 * Expects:
 *   catalogDir/patterns/*.pattern.json
 *   catalogDir/compatibility-matrix.json
 */
export function loadCatalogForValidation(catalogDir: string): BehavioralCatalog {
  const patternsDir = join(catalogDir, 'patterns');
  const files = readdirSync(patternsDir).filter((f) => f.endsWith('.pattern.json'));
  const patterns = new Map<string, BehavioralPattern>();

  for (const file of files) {
    const data: BehavioralPattern = JSON.parse(
      readFileSync(join(patternsDir, file), 'utf-8'),
    );
    patterns.set(data.id, data);
  }

  const compatFile = join(catalogDir, 'compatibility-matrix.json');
  const compatibility = JSON.parse(readFileSync(compatFile, 'utf-8'));

  return { patterns, compatibility };
}

/**
 * Load a catalog from disk and validate it.
 * Convenience wrapper combining loadCatalogForValidation + validateCatalog.
 */
export function loadAndValidate(catalogDir: string): ValidationResult {
  const catalog = loadCatalogForValidation(catalogDir);
  return validateCatalog(catalog);
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('validate-catalog.ts') ||
   process.argv[1].endsWith('validate-catalog.js'));

if (isMainModule) {
  const catalogDir = process.argv[2] || join(import.meta.dirname ?? '.', '..', 'catalog');

  console.log(`Validating catalog at: ${catalogDir}\n`);

  try {
    const result = loadAndValidate(catalogDir);

    if (result.errors.length > 0) {
      console.log(`ERRORS (${result.errors.length}):`);
      for (const err of result.errors) {
        console.log(`  [ERROR] ${err}`);
      }
      console.log();
    }

    if (result.warnings.length > 0) {
      console.log(`WARNINGS (${result.warnings.length}):`);
      for (const warn of result.warnings) {
        console.log(`  [WARN]  ${warn}`);
      }
      console.log();
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log('Catalog is valid with no errors or warnings.');
    } else if (result.errors.length === 0) {
      console.log(`Catalog is valid with ${result.warnings.length} warning(s).`);
    } else {
      console.log(`Catalog has ${result.errors.length} error(s) and ${result.warnings.length} warning(s).`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to load catalog:', err);
    process.exit(2);
  }
}
