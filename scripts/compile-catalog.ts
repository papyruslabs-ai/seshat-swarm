/**
 * Seshat Swarm — Catalog Compiler
 *
 * Compiles the JSON behavioral catalog into a C header file for the firmware.
 *
 * Input:  catalog/patterns/*.pattern.json
 * Output: src/firmware/catalog_data.h (const PatternEntry CATALOG[])
 *         src/firmware/catalog_ids.json (pattern ID → string mapping for ground station)
 *
 * Pattern IDs are assigned as sequential uint16 values (0, 1, 2, ...),
 * deterministically sorted by pattern string ID for reproducibility.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types (mirrors the JSON schema)
// ---------------------------------------------------------------------------

interface PatternJSON {
  id: string;
  core: {
    sigma: string;
    kappa: string;
    chi: string;
    lambda: string;
    tau: string;
    rho: string;
  };
  preconditions: {
    battery_floor: number;
    position_quality_floor: number;
  };
  generator: {
    type: string;
    defaults: Record<string, number | number[]>;
    bounds: Record<string, { min: number; max: number }>;
  };
}

// ---------------------------------------------------------------------------
// Enum Mappings (must match types.h)
// ---------------------------------------------------------------------------

const GENERATOR_TYPE_MAP: Record<string, number> = {
  'position-hold': 0,
  'velocity-track': 1,
  'waypoint-sequence': 2,
  'relative-offset': 3,
  'orbit-center': 4,
  'trajectory-spline': 5,
  'emergency-stop': 6,
  'idle': 7,
};

/**
 * Parameter slot layout per generator type.
 * Each generator type defines a fixed ordering of named parameters
 * into the 8-slot float array. Unlisted slots default to 0.
 */
const PARAM_SLOTS: Record<string, string[]> = {
  'position-hold': ['altitude'],
  'velocity-track': ['speed'],
  'waypoint-sequence': ['speed'],
  'relative-offset': ['offset_x', 'offset_y', 'offset_z'],
  'orbit-center': ['radius', 'angular_vel'],
  'trajectory-spline': [],
  'emergency-stop': ['escape_distance'],
  'idle': [],
};

const MAX_PARAMS = 8;

// ---------------------------------------------------------------------------
// Core Compilation Logic
// ---------------------------------------------------------------------------

export interface CompiledPattern {
  numericId: number;
  stringId: string;
  generatorType: number;
  defaults: number[];
  boundsMin: number[];
  boundsMax: number[];
  batteryFloor: number;
  posQualityFloor: number;
}

export interface CompilationResult {
  patterns: CompiledPattern[];
  idMap: Record<string, number>;
}

/**
 * Flatten a pattern's defaults into a fixed-size float array
 * according to the generator type's parameter slot layout.
 */
export function flattenDefaults(
  genType: string,
  defaults: Record<string, number | number[]>,
): number[] {
  const slots = PARAM_SLOTS[genType] ?? [];
  const result = new Array<number>(MAX_PARAMS).fill(0);

  for (let i = 0; i < slots.length && i < MAX_PARAMS; i++) {
    const val = defaults[slots[i]!];
    if (typeof val === 'number') {
      result[i] = val;
    } else if (Array.isArray(val) && val.length > 0) {
      result[i] = val[0]!;
    }
  }

  return result;
}

/**
 * Flatten a pattern's bounds into fixed-size min/max float arrays.
 */
export function flattenBounds(
  genType: string,
  bounds: Record<string, { min: number; max: number }>,
): { boundsMin: number[]; boundsMax: number[] } {
  const slots = PARAM_SLOTS[genType] ?? [];
  const boundsMin = new Array<number>(MAX_PARAMS).fill(0);
  const boundsMax = new Array<number>(MAX_PARAMS).fill(0);

  for (let i = 0; i < slots.length && i < MAX_PARAMS; i++) {
    const b = bounds[slots[i]!];
    if (b) {
      boundsMin[i] = b.min;
      boundsMax[i] = b.max;
    }
  }

  return { boundsMin, boundsMax };
}

/**
 * Compile a list of pattern JSON objects into sequential PatternEntry data.
 * Patterns are sorted by string ID for deterministic ordering.
 */
export function compilePatterns(patterns: PatternJSON[]): CompilationResult {
  // Sort by ID for deterministic ordering
  const sorted = [...patterns].sort((a, b) => a.id.localeCompare(b.id));

  const compiled: CompiledPattern[] = [];
  const idMap: Record<string, number> = {};

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const genType = GENERATOR_TYPE_MAP[p.generator.type];
    if (genType === undefined) {
      throw new Error(`Unknown generator type "${p.generator.type}" in pattern "${p.id}"`);
    }

    const defaults = flattenDefaults(p.generator.type, p.generator.defaults);
    const { boundsMin, boundsMax } = flattenBounds(p.generator.type, p.generator.bounds);

    compiled.push({
      numericId: i,
      stringId: p.id,
      generatorType: genType,
      defaults,
      boundsMin,
      boundsMax,
      batteryFloor: p.preconditions.battery_floor,
      posQualityFloor: p.preconditions.position_quality_floor,
    });

    idMap[p.id] = i;
  }

  return { patterns: compiled, idMap };
}

// ---------------------------------------------------------------------------
// C Header Generation
// ---------------------------------------------------------------------------

function floatLiteral(n: number): string {
  // Ensure the number has a decimal point and f suffix
  const s = n.toString();
  if (s.includes('.')) return s + 'f';
  return s + '.0f';
}

function floatArray(arr: number[]): string {
  return `{ ${arr.map(floatLiteral).join(', ')} }`;
}

/**
 * Generate the C header file content.
 */
export function generateHeader(result: CompilationResult): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Seshat Swarm — Compiled Behavioral Catalog');
  lines.push(' *');
  lines.push(' * AUTO-GENERATED by scripts/compile-catalog.ts');
  lines.push(' * DO NOT EDIT MANUALLY — regenerate with: pnpm compile-catalog');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(` * Patterns: ${result.patterns.length}`);
  lines.push(' */');
  lines.push('');
  lines.push('#ifndef SESHAT_CATALOG_DATA_H');
  lines.push('#define SESHAT_CATALOG_DATA_H');
  lines.push('');
  lines.push('#include "types.h"');
  lines.push('');
  lines.push(`#define CATALOG_SIZE ${result.patterns.length}`);
  lines.push('');
  lines.push('static const PatternEntry CATALOG[CATALOG_SIZE] = {');

  for (const p of result.patterns) {
    lines.push(`    /* [${p.numericId}] ${p.stringId} */`);
    lines.push('    {');
    lines.push(`        .id = ${p.numericId},`);
    lines.push(`        .generator_type = ${p.generatorType},`);
    lines.push(`        ._pad = 0,`);
    lines.push(`        .defaults = ${floatArray(p.defaults)},`);
    lines.push(`        .bounds_min = ${floatArray(p.boundsMin)},`);
    lines.push(`        .bounds_max = ${floatArray(p.boundsMax)},`);
    lines.push(`        .battery_floor = ${floatLiteral(p.batteryFloor)},`);
    lines.push(`        .pos_quality_floor = ${floatLiteral(p.posQualityFloor)},`);
    lines.push('    },');
  }

  lines.push('};');
  lines.push('');

  // Generate pattern ID defines for readability
  lines.push('/* Pattern ID defines (for firmware code readability) */');
  for (const p of result.patterns) {
    const defName = 'PATTERN_' + p.stringId
      .toUpperCase()
      .replace(/[.-]/g, '_');
    lines.push(`#define ${defName} ${p.numericId}`);
  }

  lines.push('');
  lines.push('#endif /* SESHAT_CATALOG_DATA_H */');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

export function compileCatalogFromDisk(
  catalogDir: string,
  outputHeader: string,
  outputIdMap: string,
): CompilationResult {
  const patternsDir = join(catalogDir, 'patterns');
  const files = readdirSync(patternsDir).filter((f: string) =>
    f.endsWith('.pattern.json'),
  );

  const patterns: PatternJSON[] = files.map((f: string) => {
    const raw = readFileSync(join(patternsDir, f), 'utf-8');
    return JSON.parse(raw) as PatternJSON;
  });

  const result = compilePatterns(patterns);

  // Write C header
  writeFileSync(outputHeader, generateHeader(result), 'utf-8');

  // Write ID mapping JSON (ground station uses this)
  writeFileSync(outputIdMap, JSON.stringify(result.idMap, null, 2) + '\n', 'utf-8');

  return result;
}

// Run if invoked directly
const isDirectRun = process.argv[1]?.endsWith('compile-catalog.ts') ||
                    process.argv[1]?.endsWith('compile-catalog.js');

if (isDirectRun) {
  const rootDir = resolve(import.meta.dirname ?? '.', '..');
  const catalogDir = join(rootDir, 'catalog');
  const outputHeader = join(rootDir, 'src', 'firmware', 'catalog_data.h');
  const outputIdMap = join(rootDir, 'src', 'firmware', 'catalog_ids.json');

  const result = compileCatalogFromDisk(catalogDir, outputHeader, outputIdMap);

  console.log(`Compiled ${result.patterns.length} patterns`);
  console.log(`  Header: ${outputHeader}`);
  console.log(`  ID Map: ${outputIdMap}`);
}
