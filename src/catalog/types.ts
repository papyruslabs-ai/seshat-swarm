/**
 * Seshat Swarm — Behavioral Catalog Types
 *
 * Schema for behavioral patterns, compatibility rules, and catalog structure.
 * Pattern JSON files in catalog/patterns/ conform to the BehavioralPattern interface.
 * See docs/BEHAVIORAL-CATALOG-SPEC.md for the full specification.
 */

import type {
  BehavioralMode,
  AutonomyLevel,
  FormationRole,
  ResourceOwnership,
  PhysicalTraits,
  HardwareTarget,
  GeneratorType,
} from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Pattern Schema
// ---------------------------------------------------------------------------

/** The core structural coordinates of a behavioral pattern (the finite key). */
export interface PatternCore {
  /** σ — What the drone is physically doing */
  sigma: BehavioralMode;
  /** κ — Autonomy level */
  kappa: AutonomyLevel;
  /** χ — Formation role */
  chi: FormationRole;
  /** λ — Resource ownership */
  lambda: ResourceOwnership;
  /** τ — Physical traits (payload) */
  tau: PhysicalTraits;
  /** ρ — Hardware target */
  rho: HardwareTarget;
}

/** Entry requirements — must be met to select this pattern. */
export interface PatternPreconditions {
  /** Minimum battery level (0–1) to enter this pattern */
  battery_floor: number;
  /** Minimum positioning confidence (0–1) */
  position_quality_floor: number;
  /** Minimum number of visible references (neighbors or base stations) */
  min_references: number;
  /** Pattern IDs that can transition TO this pattern */
  valid_from: string[];
  /** Additional hardware requirements (e.g., "uwb-deck") */
  hardware_requirements?: string[];
}

/** Conditions that force exit to a specific pattern. */
export interface ForcedExit {
  /** Human-readable condition (e.g., "battery < 0.10") */
  condition: string;
  /** Pattern ID to transition to */
  target_pattern: string;
}

/** Exit conditions — when/how to leave this pattern. */
export interface PatternPostconditions {
  /** Pattern IDs that this pattern can transition TO */
  valid_to: string[];
  /** Conditions that force exit to a specific pattern */
  forced_exits: ForcedExit[];
}

/** Motor command generation — the γ function for this pattern. */
export interface PatternGenerator {
  /** Control mode: how δ parameters map to motor commands */
  type: GeneratorType;
  /** Default parameters (can be overridden by ground station command) */
  defaults: Record<string, number | number[]>;
  /** Parameter bounds for safety — ground station cannot exceed these */
  bounds: Record<string, { min: number; max: number }>;
}

/** Simulation test results (optional, filled by verification pipeline). */
export interface SimResults {
  runs: number;
  failures: number;
  mean_clearance_m: number;
  min_clearance_m: number;
}

/** Offline verification results. */
export interface PatternVerification {
  /** Verification status */
  status: 'verified' | 'unverified' | 'failed';
  /** Minimum safe separation distance (meters) */
  collision_clearance_m: number;
  /** Maximum velocity this pattern can produce (m/s) */
  max_velocity_ms: number;
  /** Maximum acceleration (m/s²) */
  max_acceleration_ms2: number;
  /** Energy consumption rate (Joules/second) */
  energy_rate_js: number;
  /** Maximum duration on full battery (seconds) */
  max_duration_s: number;
  /** Pattern IDs this has been verified transitioning to/from */
  verified_transitions: string[];
  /** Simulation test results */
  sim_results?: SimResults;
}

/**
 * A single behavioral pattern in the catalog.
 * The drone equivalent of a verified entity in Seshat's database.
 */
export interface BehavioralPattern {
  /** Unique pattern identifier — also the filename stem */
  id: string;
  /** Core structural coordinates (the finite key) */
  core: PatternCore;
  /** Human-readable description */
  description: string;
  /** Entry requirements */
  preconditions: PatternPreconditions;
  /** Exit conditions */
  postconditions: PatternPostconditions;
  /** Motor command generation config */
  generator: PatternGenerator;
  /** Offline verification results */
  verification: PatternVerification;
}

// ---------------------------------------------------------------------------
// Compatibility Matrix
// ---------------------------------------------------------------------------

/**
 * A pairwise compatibility rule between patterns.
 * Supports wildcards (*) and prefixes (hover-*).
 */
export interface CompatibilityRule {
  /** Pattern A (or wildcard "*" or prefix "hover-*") */
  pattern_a: string;
  /** Pattern B (or wildcard "*" or prefix "hover-*") */
  pattern_b: string;
  /** Whether the pair is compatible */
  compatible: boolean;
  /** Minimum separation distance (meters). 0 only for incompatible pairs. */
  min_separation_m: number;
  /** Reason for incompatibility (if not compatible) */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Catalog Structure
// ---------------------------------------------------------------------------

/** The loaded catalog — all patterns indexed for O(1) lookup. */
export interface BehavioralCatalog {
  /** All patterns indexed by ID */
  patterns: Map<string, BehavioralPattern>;
  /** Compatibility rules */
  compatibility: CompatibilityRule[];
}
