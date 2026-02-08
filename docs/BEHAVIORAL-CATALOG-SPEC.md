# Behavioral Catalog Specification

The behavioral catalog is the central data structure of Seshat Swarm. It is the drone equivalent of Seshat's `verified_entities` table — a finite, pre-verified collection of behavioral patterns that drones select from at runtime.

---

## Design Principles

1. **The catalog IS the safety case.** No drone can execute a behavior that isn't in the catalog. Every pattern is verified offline for collision safety, energy bounds, and transition stability.

2. **Selection, not generation.** Runtime is O(1) lookup + parameterization. The catalog is compiled into firmware.

3. **The catalog is the product.** Growing the catalog (adding more patterns, more hardware targets, more verification) is the primary development activity. The coordinator and firmware are infrastructure; the catalog is the value.

4. **Patterns are independent of specific drones.** A pattern describes what *any* drone with matching (ρ, τ) can do. It does not reference drone IDs.

---

## Pattern Schema

```typescript
interface BehavioralPattern {
  /** Unique pattern identifier — also the filename stem */
  id: string;

  /** Core pattern — the finite structural coordinates */
  core: {
    /** Behavioral mode: what the drone is physically doing */
    sigma: 'hover' | 'translate' | 'orbit' | 'avoid' | 'climb' | 'descend'
         | 'land' | 'takeoff' | 'dock' | 'undock' | 'grounded' | 'docked'
         | 'formation-hold' | 'formation-transition' | 'relay-hold';

    /** Autonomy level */
    kappa: 'autonomous' | 'operator-guided' | 'emergency' | 'manual';

    /** Formation role */
    chi: 'leader' | 'follower' | 'relay' | 'performer' | 'charger-inbound'
       | 'charging' | 'charger-outbound' | 'scout' | 'anchor' | 'reserve';

    /** Resource ownership */
    lambda: 'exclusive-volume' | 'shared-corridor' | 'yielding'
          | 'energy-source' | 'energy-store' | 'energy-consumer' | 'comm-bridge';

    /** Physical traits (payload configuration) */
    tau: 'bare' | 'solar-equipped' | 'battery-carrier' | 'camera-equipped'
       | 'sensor-extended' | 'dual-deck';

    /** Hardware target */
    rho: 'crazyflie-2.1' | 'crazyflie-bl' | 'esp-drone' | 'sim-gazebo' | 'sim-simple';
  };

  /** Human-readable description of this behavioral pattern */
  description: string;

  /** Entry requirements — must be met to select this pattern */
  preconditions: {
    /** Minimum battery level (0-1) to enter this pattern */
    battery_floor: number;

    /** Minimum positioning confidence (0-1) */
    position_quality_floor: number;

    /** Minimum number of visible neighbors or base stations */
    min_references: number;

    /** Patterns that can transition TO this pattern */
    valid_from: string[];

    /** Additional constraints (e.g., "must have UWB deck for relay") */
    hardware_requirements?: string[];
  };

  /** Exit conditions — when to leave this pattern */
  postconditions: {
    /** Patterns that can transition FROM this pattern */
    valid_to: string[];

    /** Conditions that force exit to a specific pattern */
    forced_exits: Array<{
      condition: string;        // e.g., "battery < 0.10"
      target_pattern: string;   // e.g., "land-emergency-any-any"
    }>;
  };

  /** Motor command generation — the γ function for this pattern */
  generator: {
    /** Control mode determines how δ parameters map to motor commands */
    type:
      | 'position-hold'          // Hold specific (x,y,z). Params: target_pos.
      | 'velocity-track'         // Track velocity setpoint. Params: target_vel.
      | 'waypoint-sequence'      // Follow waypoints. Params: waypoints[].
      | 'relative-offset'        // Maintain offset from reference drone. Params: ref_drone_id, offset_vec.
      | 'orbit-center'           // Orbit a point. Params: center, radius, angular_vel.
      | 'trajectory-spline'      // Follow spline. Params: control_points[], duration.
      | 'emergency-stop'         // Kill motors / controlled descent.
      | 'idle';                  // Grounded, no motor output.

    /** Default parameters (can be overridden by ground station command) */
    defaults: Record<string, number | number[]>;

    /** Parameter bounds (for safety — ground station cannot exceed these) */
    bounds: Record<string, { min: number; max: number }>;
  };

  /** Offline verification results */
  verification: {
    /** Status of verification */
    status: 'verified' | 'unverified' | 'failed';

    /** Minimum safe separation distance (meters) when two drones run this pattern */
    collision_clearance_m: number;

    /** Maximum velocity this pattern can produce (m/s) */
    max_velocity_ms: number;

    /** Maximum acceleration (m/s²) */
    max_acceleration_ms2: number;

    /** Energy consumption rate (Joules/second) */
    energy_rate_js: number;

    /** Maximum duration this pattern can run on a full battery (seconds) */
    max_duration_s: number;

    /** Verified transition pairs (pattern IDs this has been tested transitioning to/from) */
    verified_transitions: string[];

    /** Simulation test results */
    sim_results?: {
      runs: number;
      failures: number;
      mean_clearance_m: number;
      min_clearance_m: number;
    };
  };
}
```

---

## Compatibility Matrix

The compatibility matrix defines which patterns can **coexist** on neighboring drones. Two drones within communication range must have compatible patterns.

```typescript
interface CompatibilityRule {
  /** Pattern A (or wildcard "*" or pattern prefix "hover-*") */
  pattern_a: string;

  /** Pattern B */
  pattern_b: string;

  /** Compatible? */
  compatible: boolean;

  /** Minimum separation distance required (meters) */
  min_separation_m: number;

  /** Reason for incompatibility (if not compatible) */
  reason?: string;
}
```

**Examples**:
```json
[
  {
    "pattern_a": "orbit-*",
    "pattern_b": "orbit-*",
    "compatible": true,
    "min_separation_m": 0.5,
    "reason": null
  },
  {
    "pattern_a": "avoid-emergency-*",
    "pattern_b": "*",
    "compatible": true,
    "min_separation_m": 1.0,
    "reason": null
  },
  {
    "pattern_a": "translate-*-leader-*",
    "pattern_b": "translate-*-leader-*",
    "compatible": false,
    "min_separation_m": 0,
    "reason": "Two leaders in proximity causes conflicting follower references"
  }
]
```

The compatibility matrix is the constraint graph for the constraint satisfaction engine. It's pre-computed and stored as a lookup table.

---

## Transition Matrix

The transition matrix defines valid **pattern-to-pattern transitions** for a single drone. Not every transition is physically possible or safe.

```typescript
interface TransitionRule {
  /** Source pattern (or prefix) */
  from: string;

  /** Target pattern (or prefix) */
  to: string;

  /** Is this transition valid? */
  valid: boolean;

  /** Estimated transition time (seconds) */
  transition_time_s: number;

  /** Intermediate pattern required? (e.g., must hover before orbiting) */
  via?: string;

  /** Reason for invalidity */
  reason?: string;
}
```

**Examples**:
```json
[
  {
    "from": "hover-*",
    "to": "orbit-*",
    "valid": true,
    "transition_time_s": 1.5
  },
  {
    "from": "grounded-*",
    "to": "orbit-*",
    "valid": false,
    "via": "takeoff-*",
    "reason": "Must take off before orbiting"
  },
  {
    "from": "*",
    "to": "avoid-emergency-*",
    "valid": true,
    "transition_time_s": 0.1,
    "reason": "Emergency avoidance always available"
  }
]
```

---

## Catalog Enumeration Strategy

### Phase 1: Seed Catalog (~50 patterns)

Start with the minimum patterns needed for basic swarm flight:

**Hover family** (the "imports" of drone behavior — most common, least interesting):
```
hover-autonomous-performer-bare.crazyflie-2.1
hover-autonomous-leader-bare.crazyflie-2.1
hover-autonomous-follower-bare.crazyflie-2.1
hover-autonomous-relay-bare.crazyflie-2.1
hover-autonomous-anchor-bare.crazyflie-2.1
hover-autonomous-reserve-bare.crazyflie-2.1
hover-operator-performer-bare.crazyflie-2.1
```

**Translate family** (moving between points):
```
translate-autonomous-performer-bare.crazyflie-2.1
translate-autonomous-follower-bare.crazyflie-2.1
translate-autonomous-leader-bare.crazyflie-2.1
translate-operator-performer-bare.crazyflie-2.1
```

**Formation family** (maintaining relative positions):
```
formation-hold-autonomous-performer-bare.crazyflie-2.1
formation-hold-autonomous-follower-bare.crazyflie-2.1
formation-transition-autonomous-performer-bare.crazyflie-2.1
```

**Orbit family**:
```
orbit-autonomous-performer-bare.crazyflie-2.1
orbit-operator-performer-bare.crazyflie-2.1
```

**Lifecycle family** (takeoff, land, charge):
```
takeoff-autonomous-performer-bare.crazyflie-2.1
land-autonomous-performer-bare.crazyflie-2.1
grounded-autonomous-reserve-bare.crazyflie-2.1
```

**Safety family** (always available):
```
avoid-emergency-any-bare.crazyflie-2.1
land-emergency-any-bare.crazyflie-2.1
```

**Relay family**:
```
relay-hold-autonomous-relay-bare.crazyflie-2.1
```

### Phase 2: Expand (~200 patterns)

Add:
- `sim-gazebo` variants of all Phase 1 patterns (for CrazySim testing)
- `operator-guided` variants for VR control
- `crazyflie-bl` variants if brushless drones are available
- Battery-management patterns (charger-inbound, charging, charger-outbound)
- Multi-role transitions (performer → relay, relay → performer)

### Phase 3: Enrich (~500+ patterns)

Add:
- Solar-equipped variants (τ = solar-equipped)
- Camera-equipped variants (τ = camera-equipped)
- Complex maneuvers (figure-8, synchronized orbits, formation morphing)
- Degraded-positioning patterns (UWB-only accuracy)
- Weather-aware patterns (wind compensation)

### Growth Tracking

Track the same metrics as the code catalog:

| Metric | Target |
|--------|--------|
| Total patterns | Growing |
| Compression ratio (flight hours / unique patterns used) | Increasing |
| Pattern coverage (% of flight time in top N patterns) | >85% in top 50 |
| Singleton patterns | Acceptable long tail |
| Verification rate | 100% (no unverified patterns in production) |

---

## Verification Pipeline

Every pattern must pass offline verification before entering the catalog.

### Stage 1: Geometric Verification

- Given this pattern's generator + parameter bounds, what's the reachable set of positions?
- Does the reachable set stay within safe bounds (geofence)?
- What's the minimum clearance when two drones run this pattern?

### Stage 2: Energy Verification

- Given this pattern's generator + worst-case parameters, what's the maximum energy consumption?
- Can a drone complete this pattern on minimum allowed battery (preconditions.battery_floor)?
- How long can this pattern sustain before battery is depleted?

### Stage 3: Transition Verification

For each valid transition (from pattern A to pattern B):
- Is the intermediate trajectory collision-free?
- What's the maximum velocity/acceleration during transition?
- Is the transition time within acceptable limits?

### Stage 4: Pairwise Compatibility Verification

For each compatible pair (pattern A on drone_1, pattern B on drone_2):
- At the minimum separation distance, can both patterns execute without collision?
- Are there resonance or oscillation risks (e.g., two followers tracking each other)?

### Stage 5: Swarm Simulation

- Run N drones (3, 5, 10) with random pattern assignments from the catalog
- Verify no collisions over extended runs
- Verify battery management cycle (swap, charge, return) sustains indefinitely
- Verify relay chain maintains coverage

---

## Catalog Storage Formats

### Ground Station (JSON)

Full pattern definitions with verification results. Used for constraint satisfaction and monitoring.

```
catalog/
├── patterns/*.pattern.json
├── compatibility-matrix.json
├── transition-matrix.json
└── verification-results/*.verification.json
```

### Firmware (C Struct Array)

Compiled pattern table. Stripped to what the firmware needs: generator config + parameter bounds.

```c
typedef struct {
    uint16_t id;
    uint8_t generator_type;    // position-hold, velocity-track, etc.
    float defaults[8];         // Default parameters
    float bounds_min[8];       // Parameter minimums
    float bounds_max[8];       // Parameter maximums
    float battery_floor;       // Minimum battery to enter
    float pos_quality_floor;   // Minimum positioning confidence
} PatternEntry;

// Compiled into flash
const PatternEntry CATALOG[] = {
    { 0, GEN_POSITION_HOLD, {0,0,1, ...}, {-2,-2,0.2, ...}, {2,2,2.5, ...}, 0.10, 0.5 },
    { 1, GEN_VELOCITY_TRACK, {0,0,0, ...}, {-1,-1,-0.5, ...}, {1,1,0.5, ...}, 0.15, 0.7 },
    // ...
};

#define CATALOG_SIZE (sizeof(CATALOG) / sizeof(PatternEntry))
```

### Simulation (Same as Ground Station JSON)

CrazySim uses the same JSON catalog. No separate format needed.

---

## Catalog Evolution

The catalog grows over time, following the same sublinear pattern observed in code:

```
Early:   Few patterns, high coverage per pattern (most drones hover most of the time)
Growth:  Specialized patterns added for specific maneuvers and hardware configs
Mature:  Long tail of rare patterns, top ~50 cover 85%+ of all flight time
Plateau: New patterns become increasingly rare as the behavioral space is saturated
```

**The bet**: The structural behavioral space of drones is smaller and more constrained than the structural space of code (2,571 patterns across 34 repos). If code converges, drone behavior converges faster.

Tracking catalog growth against the code domain's growth curve will be a key validation metric for the entire Seshat framework's generality claim.
