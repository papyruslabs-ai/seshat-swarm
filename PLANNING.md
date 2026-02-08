# Seshat Swarm — Build Plan

This document is the authoritative build plan. Future Claude Code instances should follow this phase-by-phase, checking off deliverables as they go. Each phase has explicit acceptance criteria.

**Read before starting**: `CLAUDE.md` (project briefing), `docs/DRONE-9D-SPACE.md` (the 9 dimensions), `docs/ARCHITECTURE.md` (system components), `docs/BEHAVIORAL-CATALOG-SPEC.md` (catalog schema).

---

## Phase Overview

```
Phase 1: Space Definition ──┐
Phase 2: Behavioral Catalog ─┼── No hardware needed (simulation only)
Phase 3: Ground Station ─────┤
Phase 4: Firmware Skeleton ──┤
Phase 5: Simulation ─────────┘
Phase 6: Hardware Integration ── Needs real drones ($1,500)
```

Phases 1–2 are sequential (2 depends on types from 1). Phases 3–4 can run in parallel after Phase 2. Phase 5 integrates 3 and 4. Phase 6 is the real-world test.

```
1 ──▶ 2 ──▶ 3 ──┐
                  ├──▶ 5 ──▶ 6
           2 ──▶ 4 ──┘
```

---

## Phase 1: Space Definition

**Goal**: Define the 9D drone semantic space as executable types and schemas. This is the foundation — every subsequent phase imports these types.

### Deliverables

#### 1.1 Core Type Definitions

**File**: `src/types/dimensions.ts`

Define TypeScript types for all 9 dimensions:

```typescript
// Structural dimensions (finite enums)
type BehavioralMode = 'hover' | 'translate' | 'orbit' | ...;
type AutonomyLevel = 'autonomous' | 'operator-guided' | 'emergency' | 'manual';
type FormationRole = 'leader' | 'follower' | 'relay' | 'performer' | ...;
type ResourceOwnership = 'exclusive-volume' | 'shared-corridor' | ...;
type PhysicalTraits = 'bare' | 'solar-equipped' | 'battery-carrier' | ...;
type HardwareTarget = 'crazyflie-2.1' | 'crazyflie-bl' | 'sim-gazebo' | ...;

// Semantic dimensions (structured data)
interface NeighborGraph { ... }      // ε
interface SensorState { ... }        // δ
type IntentHash = string;            // Σ

// The full coordinate
interface DroneCoordinate {
  sigma: BehavioralMode;
  epsilon: NeighborGraph;
  delta: SensorState;
  kappa: AutonomyLevel;
  chi: FormationRole;
  lambda: ResourceOwnership;
  tau: PhysicalTraits;
  rho: HardwareTarget;
  sigma_upper: IntentHash;
}

// The core pattern (finite key — structural dimensions only)
interface CorePattern {
  sigma: BehavioralMode;
  kappa: AutonomyLevel;
  chi: FormationRole;
  lambda: ResourceOwnership;
  tau: PhysicalTraits;
  rho: HardwareTarget;
}
```

**Acceptance criteria**:
- [ ] All 9 dimensions have TypeScript types
- [ ] CorePattern type contains only the 6 structural dimensions
- [ ] DroneCoordinate type contains all 9 dimensions
- [ ] SensorState includes position, velocity, orientation, battery, position_quality
- [ ] NeighborGraph includes neighbors, leader, followers, relay relationships
- [ ] Types are importable by all other modules

#### 1.2 C Header Equivalents

**File**: `src/firmware/types.h`

C struct definitions matching the TypeScript types, for the firmware layer:

```c
typedef enum { HOVER, TRANSLATE, ORBIT, AVOID, ... } BehavioralMode;
typedef enum { AUTONOMOUS, OPERATOR_GUIDED, EMERGENCY, MANUAL } AutonomyLevel;
// ...

typedef struct {
    float x, y, z;
} Vec3;

typedef struct {
    Vec3 position;
    Vec3 velocity;
    Vec3 orientation;     // roll, pitch, yaw
    float battery_pct;    // 0-1
    float pos_quality;    // 0-1
} SensorState;

typedef struct {
    uint16_t pattern_id;
    Vec3 target_pos;
    Vec3 target_vel;
    uint8_t flags;
} GroundCommand;
```

**Acceptance criteria**:
- [ ] C structs match TypeScript types field-for-field
- [ ] Sizeof each struct is documented (for radio packet sizing)
- [ ] Compiles with `arm-none-eabi-gcc` (Crazyflie toolchain)

#### 1.3 Transition Matrix Schema

**File**: `src/types/transitions.ts`

Define which σ→σ transitions are valid:

```typescript
interface TransitionRule {
  from: BehavioralMode | '*';
  to: BehavioralMode | '*';
  valid: boolean;
  via?: BehavioralMode;          // Intermediate state required
  transition_time_s: number;
  reason?: string;
}
```

Populate with the initial transition rules from `docs/DRONE-9D-SPACE.md`.

**Acceptance criteria**:
- [ ] Every σ value has at least one valid outgoing transition
- [ ] Every σ value has at least one valid incoming transition
- [ ] `grounded` → `orbit` is invalid (must go through `takeoff` → `hover`)
- [ ] `*` → `avoid-emergency` is always valid
- [ ] No σ value is a dead end (can always reach `grounded` eventually)

#### 1.4 Dependency Graph

**File**: `src/types/dependencies.ts`

Define the fiber bundle dependencies between dimensions:

```typescript
// Given a drone's (ρ, τ), which σ values are valid?
const validModes: Record<HardwareTarget, Record<PhysicalTraits, BehavioralMode[]>> = { ... };

// Given a drone's τ, which χ values are valid?
const validRoles: Record<PhysicalTraits, FormationRole[]> = { ... };

// Given a drone's χ, which λ values apply?
const roleOwnership: Record<FormationRole, ResourceOwnership[]> = { ... };
```

**Acceptance criteria**:
- [ ] `solar-equipped` drones cannot select aggressive maneuver modes
- [ ] Only drones with UWB capability can have χ = `relay`
- [ ] `leader` role implies `exclusive-volume` ownership
- [ ] Dependency graph is acyclic

---

## Phase 2: Behavioral Catalog

**Goal**: Build the seed catalog (~50 patterns), define the compatibility matrix, and implement the pattern lookup.

**Depends on**: Phase 1 (types)

### Deliverables

#### 2.1 Seed Catalog (~50 Patterns)

**Directory**: `catalog/patterns/`

Create JSON files for the initial behavioral patterns following the schema in `docs/BEHAVIORAL-CATALOG-SPEC.md`. Start with:

| Family | Count | Patterns |
|--------|-------|----------|
| Hover | ~8 | One per (χ, κ) combination that makes sense |
| Translate | ~6 | Leader, follower, performer × autonomous, operator |
| Formation | ~4 | Hold and transition for performer and follower |
| Orbit | ~3 | Autonomous performer, operator performer, follower |
| Lifecycle | ~6 | Takeoff, land, grounded, dock, undock, docked |
| Safety | ~3 | Emergency avoid, emergency land, communication lost |
| Relay | ~2 | Relay hold, relay translate |
| Charging | ~4 | Charger-inbound, charging, charger-outbound, reserve |
| **Sim variants** | ~15 | Key patterns duplicated for `sim-gazebo` target |

**Acceptance criteria**:
- [ ] Each pattern has all required fields from the BehavioralPattern schema
- [ ] Each pattern has valid preconditions (battery_floor, position_quality_floor)
- [ ] Each pattern's `valid_from` and `valid_to` are consistent with the transition matrix
- [ ] Every `forced_exit` targets a pattern that exists in the catalog
- [ ] Emergency patterns have battery_floor = 0 (always available)
- [ ] Pattern filenames match the `{sigma}-{kappa}-{chi}-{tau}.{rho}.pattern.json` convention

#### 2.2 Compatibility Matrix

**File**: `catalog/compatibility-matrix.json`

Define pairwise compatibility rules.

**Acceptance criteria**:
- [ ] All pattern pairs have a compatibility determination (explicit or via wildcard)
- [ ] Two leaders within communication range are incompatible
- [ ] Emergency patterns are compatible with everything
- [ ] Every compatible pair has a minimum separation distance
- [ ] No two patterns are compatible at 0m separation (collision would be guaranteed)

#### 2.3 Pattern Lookup Module

**File**: `src/catalog/lookup.ts`

```typescript
function lookupPattern(id: string): BehavioralPattern | null;
function filterByCore(core: Partial<CorePattern>): BehavioralPattern[];
function isCompatible(patternA: string, patternB: string, separation_m: number): boolean;
function isTransitionValid(from: string, to: string): TransitionRule | null;
function corePatternKey(core: CorePattern): string;  // The FK — same concept as code's core_pattern
```

**Acceptance criteria**:
- [ ] `lookupPattern` is O(1) (hash map or indexed)
- [ ] `filterByCore` returns all patterns matching partial core specification
- [ ] `isCompatible` checks both the compatibility matrix AND minimum separation
- [ ] `corePatternKey` produces the same string for the same structural coordinates
- [ ] All functions have unit tests

#### 2.4 Catalog Validation Script

**File**: `scripts/validate-catalog.ts`

Validate the entire catalog for internal consistency:
- All transitions reference existing patterns
- All forced exits reference existing patterns
- Compatibility matrix covers all pattern pairs
- No dead-end patterns (can always reach `grounded`)
- Dependency graph constraints are respected (e.g., no `solar-equipped` + aggressive maneuvers)

**Acceptance criteria**:
- [ ] Script runs and passes with 0 errors on the seed catalog
- [ ] Script reports warnings for patterns with no verified transitions
- [ ] Script can be run as a CI check

---

## Phase 3: Ground Station (Coordinator)

**Goal**: Build the laptop-side coordination engine. This is the brain of the swarm.

**Depends on**: Phase 2 (catalog + lookup)
**Can run in parallel with**: Phase 4 (firmware)

### Deliverables

#### 3.1 World Model

**File**: `src/coordinator/world-model.ts`

Maintains the current state of all drones:

```typescript
interface DroneState {
  id: string;
  coordinate: DroneCoordinate;      // Full 9D state
  currentPattern: string;            // Pattern ID
  lastTelemetry: SensorState;       // Most recent δ
  lastUpdate: number;                // Timestamp
}

class WorldModel {
  drones: Map<string, DroneState>;
  updateTelemetry(droneId: string, telemetry: SensorState): void;
  getNeighborGraph(droneId: string): NeighborGraph;
  detectDelta(droneId: string): { changed: boolean; structural: boolean };
}
```

**Acceptance criteria**:
- [ ] Tracks N drones with full 9D coordinates
- [ ] Computes ε (neighbor graph) from positions + communication range
- [ ] Detects Δ = 0 (style) vs Δ ≠ 0 (behavioral) changes
- [ ] Handles drone addition/removal (takeoff/landing)

#### 3.2 Constraint Satisfaction Engine

**File**: `src/coordinator/constraint-engine.ts`

Selects compatible pattern assignments for all drones:

```typescript
interface Assignment {
  droneId: string;
  patternId: string;
  targetPos?: Vec3;
  targetVel?: Vec3;
}

function solveAssignment(
  world: WorldModel,
  catalog: BehavioralCatalog,
  objectives: SwarmObjective[],
  operatorIntent?: OperatorIntent
): Assignment[];
```

**Algorithm**: Arc consistency / constraint propagation over the finite catalog. For each drone:
1. Filter catalog to patterns valid for this drone's (ρ, τ, battery, position_quality)
2. Apply formation constraints (objectives)
3. Apply pairwise compatibility with current neighbor assignments
4. Select highest-priority consistent assignment

**Acceptance criteria**:
- [ ] Produces valid assignments for 3, 5, and 10 drone configurations
- [ ] Respects compatibility matrix (no incompatible neighbor pairs)
- [ ] Respects transition matrix (no invalid transitions from current patterns)
- [ ] Respects preconditions (battery, positioning quality)
- [ ] Runs in <10ms for 10 drones (fast enough for 100Hz loop)
- [ ] Handles the case where no valid assignment exists (fallback to safe hover)

#### 3.3 Blast Radius Engine

**File**: `src/coordinator/blast-radius.ts`

When a drone's state changes (Δ ≠ 0), compute which other drones need to re-evaluate:

```typescript
function computeBlastRadius(
  changedDrone: string,
  world: WorldModel
): Set<string>;  // Set of affected drone IDs
```

**Implementation**: Direct adaptation of Theorem 9.4 from the code domain:
```
affected(drone_i) = spatial_neighbors(drone_i)
                  ∪ role_dependents(drone_i)
                  ∪ {drone_i}
```

With cascade: if a re-evaluation changes drone_j's pattern, add drone_j's neighbors to the affected set. Repeat until stable.

**Acceptance criteria**:
- [ ] Correctly identifies spatial neighbors (within communication range)
- [ ] Correctly identifies role dependents (followers of a leader, etc.)
- [ ] Cascade terminates (no infinite loops)
- [ ] Cascade is bounded (at most N iterations for N drones)
- [ ] A drone with Δ = 0 (style change) produces empty blast radius
- [ ] Unit tests for: single change, cascade, full-swarm propagation

#### 3.4 Role Assignment

**File**: `src/coordinator/role-assignment.ts`

Dynamic assignment of χ values based on swarm needs:

```typescript
function assignRoles(
  world: WorldModel,
  formationRequirements: FormationSpec,
  coverageRequirements: CoverageSpec
): Map<string, FormationRole>;
```

**Key rules**:
- Battery < 15%: force χ = `charger-inbound`
- Outside positioning coverage: force χ = return or become relay
- Formation needs N performers: assign N drones with best battery/position
- Relay needed at boundary: assign drone closest to boundary
- Charging complete: assign χ = `charger-outbound`

**Acceptance criteria**:
- [ ] Low-battery drones are always assigned to charge (safety)
- [ ] At least one relay is assigned when drones are near coverage boundary
- [ ] Role transitions are smooth (no oscillation — drone doesn't flip between performer and relay every tick)
- [ ] Hysteresis on battery thresholds (go to charge at 15%, don't return to performer until 90%)

#### 3.5 Communication Protocol

**File**: `src/coordinator/comms.ts`

Interface to Crazyradio (via cflib Python bridge or direct USB):

```typescript
interface DroneComms {
  sendCommand(droneId: string, cmd: GroundCommand): Promise<void>;
  onTelemetry(callback: (droneId: string, telemetry: SensorState) => void): void;
  connect(droneIds: string[]): Promise<void>;
  disconnect(): Promise<void>;
}
```

For simulation, this talks to CrazySim. For real hardware, this talks to Crazyradio.

**Acceptance criteria**:
- [ ] Abstracted behind interface (sim and real use same API)
- [ ] Command packet fits in 20 bytes
- [ ] Telemetry packet fits in 18 bytes
- [ ] 100Hz update rate for 3 drones (minimum)
- [ ] Handles packet loss gracefully (drone continues last pattern if command missed)

#### 3.6 Main Loop

**File**: `src/coordinator/main.ts`

The ground station main loop:

```typescript
while (running) {
  // 1. Receive telemetry from all drones
  updateWorldModel(telemetry);

  // 2. Detect Δ changes
  const deltas = detectDeltas(world);

  // 3. If any Δ ≠ 0, compute blast radius and re-solve
  if (deltas.some(d => d.structural)) {
    const affected = computeBlastRadius(deltas, world);
    const assignments = solveAssignment(world, catalog, objectives, affected);
    sendCommands(assignments);
  }

  // 4. If operator intent, process it
  if (operatorIntent) {
    processIntent(operatorIntent, world, catalog);
  }

  // 5. Periodic role reassignment (every 1s, not every tick)
  if (tickCount % 100 === 0) {
    reassignRoles(world, formationSpec, coverageSpec);
  }

  await sleep(10); // 100Hz
}
```

**Acceptance criteria**:
- [ ] Loop runs at 100Hz without drift
- [ ] Telemetry updates are processed before decisions
- [ ] Blast radius is computed only when Δ ≠ 0 (not every tick)
- [ ] Role reassignment runs at lower frequency (1Hz) to prevent oscillation
- [ ] Graceful shutdown (land all drones on SIGINT)

---

## Phase 4: Firmware Skeleton

**Goal**: Build the C firmware module that runs on the Crazyflie STM32. Receives pattern IDs, looks up motor commands, parameterizes, executes.

**Depends on**: Phase 2 (catalog)
**Can run in parallel with**: Phase 3 (ground station)

### Deliverables

#### 4.1 Pattern Executor

**File**: `src/firmware/pattern_executor.c`

The core firmware loop:

```c
void pattern_executor_step(const GroundCommand* cmd, const SensorState* state) {
    const PatternEntry* pattern = catalog_lookup(cmd->pattern_id);
    if (!pattern) { emergency_hover(state); return; }

    MotorSetpoints sp;
    switch (pattern->generator_type) {
        case GEN_POSITION_HOLD:
            sp = gen_position_hold(cmd->target_pos, state);
            break;
        case GEN_VELOCITY_TRACK:
            sp = gen_velocity_track(cmd->target_vel, state);
            break;
        case GEN_RELATIVE_OFFSET:
            sp = gen_relative_offset(cmd->target_pos, cmd->offset, state);
            break;
        // ... other generator types
    }

    // Safety bounds check
    sp = clamp_setpoints(sp, pattern->bounds_min, pattern->bounds_max);

    // Send to attitude controller (existing Crazyflie firmware)
    set_attitude_setpoint(sp.roll, sp.pitch, sp.yaw, sp.thrust);
}
```

**Acceptance criteria**:
- [ ] Compiles for STM32F405 with Crazyflie build system
- [ ] Catalog lookup is O(1) (array index by pattern_id)
- [ ] All generator types implemented (position-hold, velocity-track, relative-offset, orbit-center, emergency-stop, idle)
- [ ] Safety clamp prevents exceeding pattern's verified bounds
- [ ] Falls back to emergency hover on unknown pattern ID
- [ ] Runs within the Crazyflie's 1ms control loop budget

#### 4.2 Catalog Compiler

**File**: `scripts/compile-catalog.ts`

Compiles the JSON catalog into a C header file:

```
Input:  catalog/patterns/*.pattern.json
Output: src/firmware/catalog_data.h (const PatternEntry CATALOG[] = { ... })
```

**Acceptance criteria**:
- [ ] Output compiles with arm-none-eabi-gcc
- [ ] Pattern IDs are sequential uint16 (0, 1, 2, ...)
- [ ] Ground station and firmware use the same ID mapping
- [ ] Regenerating after catalog changes produces a new header

#### 4.3 Command Parser

**File**: `src/firmware/command_parser.c`

Deserializes radio packets into GroundCommand structs.

**Acceptance criteria**:
- [ ] Parses 20-byte command packets
- [ ] Validates pattern_id is within catalog range
- [ ] Handles malformed packets (discard, don't crash)

#### 4.4 Telemetry Reporter

**File**: `src/firmware/telemetry_reporter.c`

Serializes SensorState into radio packets for uplink.

**Acceptance criteria**:
- [ ] Produces 18-byte telemetry packets
- [ ] Includes position, velocity, battery, current pattern ID, status flags
- [ ] Runs at 100Hz without impacting control loop

---

## Phase 5: Simulation

**Goal**: Integrate the ground station and firmware into CrazySim. Run end-to-end swarm coordination against simulated drones.

**Depends on**: Phase 3 (ground station) + Phase 4 (firmware)

### Deliverables

#### 5.1 CrazySim Integration

**File**: `src/simulator/crazysim-bridge.ts`

Bridge between the ground station and CrazySim:

```typescript
class CrazySimBridge implements DroneComms {
  // Implements the same DroneComms interface as real Crazyradio
  // Translates commands to CrazySim actuator inputs
  // Translates CrazySim sensor outputs to telemetry
}
```

**Acceptance criteria**:
- [ ] Ground station runs unmodified against CrazySim
- [ ] 3 simulated drones fly simultaneously
- [ ] Position data from simulated Lighthouse is realistic
- [ ] Battery drain is simulated (configurable rate)

#### 5.2 Scenario Tests

**Directory**: `tests/scenarios/`

Automated test scenarios:

| Scenario | What It Tests | Pass Criteria |
|----------|--------------|---------------|
| `basic-hover.test.ts` | 3 drones hover in triangle | All hold position within 5cm for 30s |
| `formation-translate.test.ts` | Triangle formation moves to waypoint | Formation maintained within 10cm, all arrive |
| `role-rotation.test.ts` | Performer → charger → performer cycle | Smooth transition, no mid-air collisions |
| `relay-handoff.test.ts` | Drone A relays, drone B takes over | Coverage maintained, no positioning gaps |
| `emergency-avoid.test.ts` | Inject collision course | Emergency avoid fires, drones separate |
| `blast-radius.test.ts` | Leader changes trajectory | Followers update, non-followers unaffected |
| `battery-swap.test.ts` | Drone hits battery floor | Returns to pad, reserve launches, formation maintained |
| `style-change.test.ts` | Change swarm style (smooth → sharp) | All drones update transitions, no behavioral change |
| `operator-intent.test.ts` | Operator sends "orbit" command | Swarm transitions to orbit formation |
| `full-autonomy.test.ts` | 5 drones, 10 min, no operator | Formation holds, charging cycles, no collisions |

**Acceptance criteria**:
- [ ] All scenarios pass in CrazySim
- [ ] No collisions in any scenario
- [ ] Battery management sustains flight for >2× single battery duration
- [ ] Blast radius propagation is correct (affected drones update, others don't)
- [ ] Δ classifier correctly distinguishes style vs behavioral changes

#### 5.3 Visualization

**File**: `src/visualization/viewer.ts` (or use existing 3D framework)

3D real-time visualization of the simulated swarm:

- Drone positions rendered as colored markers
- Formation lines between neighbors
- Role indicated by color (performer=blue, relay=green, charging=yellow)
- Blast radius visualization (highlight affected drones on state change)
- Battery levels as labels
- Pattern names as labels

**Acceptance criteria**:
- [ ] Updates at ≥30fps for 10 simulated drones
- [ ] Shows all drone states in real time
- [ ] Visually confirms blast radius propagation
- [ ] Can be recorded for demos

---

## Phase 6: Hardware Integration

**Goal**: Flash firmware to real Crazyflies, calibrate, and achieve first real-world swarm flight using catalog-based coordination.

**Depends on**: Phase 5 (all simulation tests pass) + Hardware purchase (~$1,500)

### Deliverables

#### 6.1 Firmware Flash

- Compile firmware with catalog for `crazyflie-2.1` target
- Flash to 3 Crazyflies using `cfloader`
- Verify basic communication (send command, receive telemetry)

#### 6.2 Positioning Calibration

- Set up 2 SteamVR 2.0 base stations in test area
- Install Lighthouse decks on all drones
- Calibrate coordinate frame (origin, axes)
- Verify position accuracy (<5mm)

#### 6.3 Single-Drone Validation

- Hover test: drone holds position from catalog pattern
- Translate test: drone moves to waypoint from catalog pattern
- Emergency test: emergency avoid triggers correctly
- Battery test: drone returns to pad when threshold hit

#### 6.4 Multi-Drone Validation

- Triangle formation: 3 drones hold formation
- Formation translate: formation moves as unit
- Role rotation: performer → charger → performer cycle
- Relay test: extend coverage using relay drone

#### 6.5 Operator Control (Optional)

- VR headset integration (if SteamVR headset available)
- Tablet/laptop visualization with real drone positions
- Operator intent → formation change (live)

### Acceptance Criteria (Phase 6 Overall)

- [ ] 3 drones fly simultaneously using catalog-based coordination
- [ ] Formation is maintained within 10cm of nominal positions
- [ ] Role rotation works (at least one successful performer ↔ charger swap)
- [ ] Blast radius propagation visible: change leader trajectory → followers update, others don't
- [ ] No collisions during any test
- [ ] Ground station code is identical to simulation (only DroneComms implementation changes)

---

## Decision Log

Decisions that need human input before implementation. Record decisions here as they are made.

| Decision | Options | Status | Chosen | Rationale |
|----------|---------|--------|--------|-----------|
| Ground station language | TypeScript / Python / Rust | **Open** | — | TypeScript matches Seshat codebase. Python matches cflib/Crazyswarm2 ecosystem. |
| Coordinator ↔ Crazyradio interface | Direct USB (cflib Python) / ROS 2 (Crazyswarm2) / Custom bridge | **Open** | — | cflib is simpler but Python-only. Crazyswarm2 is more capable but heavier. |
| Visualization framework | Three.js (web) / Unity / Godot / ROS Rviz | **Open** | — | Three.js keeps everything in TypeScript. Unity/Godot better for VR. |
| Catalog storage in firmware | C array in flash / JSON parsed at boot / Binary format | **Open** | — | C array is simplest and fastest (O(1) index). |
| Position encoding in radio packets | float32 (accurate) / float16 (compact) / fixed-point (predictable) | **Open** | — | float16 gives ±65m range at ~1mm precision. Sufficient for indoor. |

---

## Notes for Future Claude Instances

1. **Don't modify the seshat-converter repo from this project.** The Seshat codebase is being actively developed by other instances. Read its math docs, don't write to it.

2. **The catalog is the product.** When in doubt about where to invest effort, invest in the catalog — more patterns, better verification, tighter compatibility rules. The coordinator and firmware are infrastructure.

3. **Test in simulation first. Always.** Phase 5 exists for a reason. Every behavioral pattern should be validated in CrazySim before it touches real hardware. "It works in sim" is the minimum bar, not the finish line, but it's a hard requirement.

4. **The math is already proven.** Don't re-derive Theorem 9.4 or the finite catalog argument. They're proven in the Seshat docs. Just apply them. If something doesn't work, the bug is in the implementation, not the math.

5. **Selection, not generation.** This is the mantra. If you find yourself writing code that generates novel behavior at runtime, you've drifted. Every behavior should be a catalog lookup + parameterization. The only exception is emergency avoidance, and even that is a catalog pattern.

6. **Ask Joseph.** When you hit a decision point not covered here, ask. The Decision Log above tracks open questions. Don't guess on architectural decisions — they're hard to undo.
