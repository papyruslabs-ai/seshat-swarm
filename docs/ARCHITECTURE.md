# System Architecture

## Overview

The system has four major components, mirroring the Hologram UI architecture for code:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPERATOR INTERFACE                           │
│  VR headset / laptop visualization / tablet                        │
│  (equivalent to Hologram UI — intent in, materialization out)      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ operator intent + focus
┌────────────────────────────▼────────────────────────────────────────┐
│                        GROUND STATION                               │
│  Behavioral catalog │ Constraint engine │ Blast radius │ Roles     │
│  (equivalent to Hologram backend — A01-A06)                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │ pattern IDs + δ parameters (via Crazyradio)
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │  DRONE 1   │ │  DRONE 2   │ │  DRONE 3   │
       │  Firmware   │ │  Firmware   │ │  Firmware   │
       │  (generator)│ │  (generator)│ │  (generator)│
       └────────────┘ └────────────┘ └────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │ telemetry (position, battery, status)
              ┌──────────────▼──────────────┐
              │     POSITIONING SYSTEM       │
              │  Lighthouse / UWB / Relay    │
              └─────────────────────────────┘
```

---

## Component 1: Behavioral Catalog

**What it is**: A finite, pre-verified collection of behavioral patterns. The drone equivalent of the `verified_entities` table in Seshat's database.

**Structure**:
```
catalog/
├── patterns/
│   ├── hover-autonomous-performer-bare.json
│   ├── orbit-autonomous-performer-bare.json
│   ├── translate-autonomous-follower-bare.json
│   ├── avoid-emergency-any-any.json
│   ├── relay-hold-autonomous-relay-bare.json
│   └── ... (~200-1,500 patterns)
├── compatibility-matrix.json     # Which patterns can coexist on neighbors
├── transition-matrix.json        # Valid pattern → pattern transitions
└── verification-results/         # Offline verification proofs
    ├── collision-clearance/
    ├── energy-bounds/
    └── transition-safety/
```

**Pattern schema**:
```typescript
interface BehavioralPattern {
  // Core pattern (the FK — finite key)
  id: string;                          // e.g., "hover-auto-performer-bare"
  core: {
    sigma: BehavioralMode;             // What the drone does
    kappa: AutonomyLevel;              // How much operator control
    chi: FormationRole;                // Job in the swarm
    lambda: ResourceOwnership;         // What it owns
    tau: PhysicalTraits;               // Hardware characteristics
    rho: HardwareTarget;              // What platform
  };

  // Parameterization schema (what δ and ε values this pattern needs)
  requires: {
    position: boolean;                 // Needs absolute position?
    neighbors: number;                 // Min neighbors required
    position_quality: number;          // Min positioning confidence (0-1)
    battery_floor: number;             // Min battery to enter this pattern (0-1)
  };

  // Motor command template (parameterized by δ)
  // This is the γ function for this specific pattern × hardware target
  generator: {
    type: 'position-hold' | 'velocity-track' | 'waypoint-sequence' | 'relative-offset';
    params: Record<string, any>;       // Pattern-specific parameters
  };

  // Verification results (computed offline)
  verification: {
    collision_clearance_m: number;     // Minimum clearance at which this pattern is safe
    max_velocity_ms: number;           // Maximum velocity during this pattern
    max_acceleration_ms2: number;      // Maximum acceleration
    energy_cost_j_per_s: number;       // Energy consumption rate
    tested_transitions: string[];      // Pattern IDs this can transition to/from
  };
}
```

**Naming convention**: Patterns follow the same "grep as graph" philosophy as JSTF files. The filename IS the core pattern, enabling filesystem-based lookup:
```
{sigma}-{kappa}-{chi}-{tau}.{rho}.pattern.json
hover-autonomous-performer-bare.crazyflie-2.1.pattern.json
```

---

## Component 2: Ground Station (Coordinator)

**What it is**: The brain of the swarm. Runs on a laptop. Receives telemetry from all drones, runs constraint satisfaction, sends pattern assignments.

**Responsibilities**:

### 2a. Pattern Selection Engine

Given a swarm state (all drones' current δ and ε), select compatible pattern assignments:

```
Input:  Current state of N drones (position, battery, role, neighbors)
        + Operator intent (if any)
        + Constraints (formation shape, boundary, objectives)

Process: Constraint satisfaction over the finite catalog
         For each drone: filter catalog to valid patterns (given ρ, τ, battery, position_quality)
         For each pair of neighbors: check compatibility matrix
         Select globally consistent assignment

Output: Pattern ID + δ parameters for each drone
```

This is arc consistency / constraint propagation over a finite domain. Well-studied algorithms, millisecond runtime for 10 drones.

### 2b. Blast Radius Engine

When drone_i's state changes (Δ ≠ 0):

```
affected(drone_i) = spatial_neighbors(drone_i, range=COMM_RANGE)
                  ∪ role_dependents(drone_i)  // followers if drone_i is leader, etc.
                  ∪ {drone_i}

For each drone_j in affected:
  Re-run pattern selection for drone_j given new neighbor state
  If drone_j's pattern changes: add drone_j's neighbors to affected (cascade)
  Cascade terminates when no new patterns change (guaranteed: finite catalog, finite drones)
```

**Key property**: Cascade terminates because the catalog is finite and each drone's pattern can only change once per propagation cycle (no oscillation in a well-designed compatibility matrix).

### 2c. Δ Classifier

When a state change is detected:

```
Extract new coordinate for drone_i
Compare J_new vs J_old

If J_structural unchanged (same σ, κ, χ, λ):
  Δ = 0 (style change)
  → Update S only (transition smoothness, visual parameters)
  → No propagation to neighbors

If J_structural changed:
  Δ ≠ 0 (behavioral change)
  → Update J for drone_i
  → Run blast radius propagation
  → Affected drones get new pattern assignments
```

### 2d. Role Assignment

Dynamic assignment of χ values based on current needs:

```
Inputs:
  - Battery levels of all drones
  - Position relative to Lighthouse/UWB coverage
  - Formation requirements (how many performers needed)
  - Charging pad availability

Rules (examples):
  - Battery < 15%: force χ = charger-inbound (safety)
  - Outside Lighthouse range + no UWB relay: χ = return-to-coverage (safety)
  - Formation needs relay at boundary: pick drone closest to boundary with best battery
  - Fully charged on pad + formation has empty slot: χ = charger-outbound → performer
```

Role assignment is constraint satisfaction, not if/else chains. The same engine that selects behavioral patterns selects role assignments. Roles are just one dimension (χ) of the pattern.

### 2e. Communication Layer

Uses Crazyflie's `cflib` (Python) or Crazyswarm2 (ROS 2):

```
Ground Station ←→ Crazyradio PA ←→ Drones (2.4GHz radio)

Uplink (ground → drone):
  - Pattern ID (uint16 — index into onboard catalog copy)
  - Target position (3 × float16 — for position-tracking patterns)
  - Target velocity (3 × float16 — for velocity-tracking patterns)
  - Flags (uint8 — emergency, style update, etc.)
  Total: ~20 bytes per drone per tick

Downlink (drone → ground):
  - Position (3 × float16)
  - Velocity (3 × float16)
  - Battery (uint8, percentage)
  - Current pattern ID (uint16)
  - Status flags (uint8)
  Total: ~18 bytes per drone per tick

Update rate: 100Hz (Crazyradio supports this for small packets)
```

**Bandwidth**: 10 drones × 38 bytes × 100Hz = 38KB/s. Well within Crazyradio capacity.

---

## Component 3: Drone Firmware

**What it is**: C code running on the Crazyflie's STM32F405. Receives pattern IDs, looks up motor commands, parameterizes with local sensor data, executes.

**Key design**: The firmware does NOT run constraint satisfaction or pattern selection. It receives assignments from the ground station and executes them. The intelligence is in the ground station; the firmware is a generator.

```c
// Simplified firmware loop (pseudocode)
void behavioral_loop() {
    while (true) {
        // 1. Receive assignment from ground station (100Hz)
        Assignment cmd = radio_receive();

        // 2. Look up pattern in onboard catalog (O(1))
        Pattern* p = catalog_lookup(cmd.pattern_id);

        // 3. Read local sensors
        SensorState delta = sensors_read();  // position, velocity, battery

        // 4. Parameterize: pattern + sensors → motor setpoints
        MotorSetpoints sp = p->generator(delta, cmd.target_pos, cmd.target_vel);

        // 5. Apply to motors (inner PID loop runs at 500-1000Hz independently)
        motors_set(sp);

        // 6. Send telemetry back to ground station
        radio_send_telemetry(delta, cmd.pattern_id, status);
    }
}
```

**Onboard catalog**: The full behavioral catalog compiled to a C struct array. At ~200-1,500 patterns × ~100 bytes each = 20-150KB. The STM32F405 has 1MB flash. Plenty of room.

**Existing Crazyflie firmware layers we use (don't rewrite)**:
- **Attitude controller**: PID loops for roll/pitch/yaw (runs at 500Hz)
- **Motor mixing**: Converts attitude setpoints to individual motor PWM
- **Sensor fusion**: Kalman filter for position/velocity estimation
- **Radio driver**: CRTP protocol over nRF51

**What we add**:
- **Behavioral layer**: Pattern lookup + parameterization (our code)
- **Catalog storage**: Compiled pattern table in flash
- **Command parser**: Deserialize ground station commands
- **Telemetry reporter**: Serialize sensor state for uplink

---

## Component 4: Positioning System

### Primary: Lighthouse (Indoor, High Accuracy)

- 2× SteamVR 2.0 base stations
- Lighthouse deck on each drone
- Coverage: ~5×5×2m
- Accuracy: <1mm jitter, <5mm absolute
- Update rate: 30-60Hz per base station

### Extended: UWB Relay Chain

When drones need to fly beyond Lighthouse range:

```
Zone A (Lighthouse):
  Drone knows absolute position from base stations
  If χ = relay: broadcasts position via UWB

Zone B (UWB, 1st hop):
  Drone ranges against 2-3 relay drones in Zone A
  Triangulates position
  Accuracy: ~10-20cm
  Can itself become relay for Zone C

Zone C (UWB, 2nd hop):
  Ranges against Zone B relays
  Accuracy: ~20-40cm
  Suitable for loose formations
```

**Relay assignment is dynamic** (see Role Assignment above). The system continuously reassesses which drones should be relays based on the current formation and coverage needs.

### Future: Outdoor GPS

- GPS module (community projects exist for Crazyflie)
- Accuracy: ~1-2m (not suitable for tight formations)
- Unlimited range
- Could be combined with UWB for local precision within GPS-level global frame

---

## Component 5: Operator Interface

### Option A: VR (SteamVR)

The Lighthouse base stations are SteamVR base stations. A VR headset uses the same positioning system. Operator and drones share one coordinate frame.

```
Operator actions → Ground station intent:
  - Point controller at location → formation waypoint
  - Swipe gesture → rotate formation
  - Pinch → tighten/loosen formation
  - Voice: "spread out" → formation mode change
  - Grab drone (virtual) → manual reposition
  - Tap drone → focus (show telemetry overlay)
```

### Option B: Laptop/Tablet Visualization

3D visualization of drone positions in the Lighthouse frame:

```
┌─────────────────────────────────────────┐
│  [3D View]                              │
│                                         │
│    ●₁ ─── ●₂                           │
│       \  /                              │
│        ●₃                               │
│                                         │
│  Formation: triangle  Drones: 3/3 active│
│  Battery: ●₁ 87% ●₂ 72% ●₃ 45%       │
│                                         │
│  [Intent Bar: _________________ ]       │
│  [Patterns: hover | orbit | line ]      │
└─────────────────────────────────────────┘
```

This is the Hologram UI adapted for physical space. The Intent Bar is equivalent. The 3D view is the Structure Panel. Drone telemetry is the Projections Panel.

### Option C: Autonomous (No Operator)

The ground station runs without human input. Formation and objectives are pre-configured. The system handles all role assignment, charging rotation, and relay management autonomously. The operator interface becomes a monitoring dashboard.

---

## Data Flow (One Tick)

```
1. SENSE
   Each drone reads sensors (IMU, Lighthouse, battery)
   Each drone sends telemetry to ground station via radio
   Latency: ~5-10ms

2. PERCEIVE
   Ground station updates world model
   Recomputes ε (neighbor graph) from positions
   Detects any Δ ≠ 0 (behavioral changes, constraint violations)
   Latency: ~1-2ms

3. DECIDE
   If Δ ≠ 0 for any drone:
     Compute blast radius
     Re-run constraint satisfaction for affected drones
     Select new pattern assignments
   If operator intent received:
     Translate intent to formation/objective change
     Re-run constraint satisfaction for all affected drones
   Latency: ~1-5ms

4. COMMAND
   Send pattern ID + parameters to each affected drone
   Unaffected drones continue executing current pattern
   Latency: ~2-5ms

5. EXECUTE
   Each drone looks up pattern, parameterizes with local δ
   Inner PID loop runs at 500Hz (independent of command rate)
   Latency: O(1) lookup + PID iteration

Total loop: ~10-20ms (50-100Hz effective update rate)
```

---

## Simulation Architecture

For Phases 1-5 (pre-hardware), the system runs against CrazySim:

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Ground      │────▶│  CrazySim    │────▶│  Gazebo        │
│  Station     │◀────│  Bridge      │◀────│  Physics       │
│  (real code) │     │  (replaces   │     │  (simulated    │
│              │     │   Crazyradio)│     │   drones)      │
└─────────────┘     └──────────────┘     └────────────────┘
```

The ground station code is identical in simulation and real flight. Only the communication layer changes (CrazySim bridge vs. Crazyradio). This is the same principle as Seshat's generators: same coordinates, different output target.

---

## Mapping to Hologram Architecture

For context, here's how each component maps to the Hologram UI's task streams:

| Hologram (Code) | Seshat Swarm (Drones) |
|-----------------|----------------------|
| A01: WebSocket API | Ground station communication layer |
| A02: Import Pipeline | Not applicable (drones don't "import") — replaced by catalog loading |
| A03: Blast Radius Engine | Blast radius engine (direct transfer) |
| A04: Projection Engine | Telemetry processing + world model |
| A05: Δ Classifier | Δ classifier (direct transfer) |
| A06: Style Engine | Style engine (transition smoothness, formation personality) |
| B01: Materialization Display | 3D visualization / VR view |
| B02: Structure Panel | Swarm status panel (roles, battery, formation) |
| B03: Code Surface | Direct drone control (VR grab, manual positioning) |
| B04: Language Switcher | Hardware target switcher (sim ↔ real) |
| B05: Projections Panel | Telemetry dashboard (battery, coverage, formation health) |
| B06: Style Profile Panel | Swarm style controls (smoothness, tightness, speed) |
| C01: Intent Processing | Operator intent translation |
| C02: Import/Onboarding | Swarm initialization + calibration flow |
| C05: Edit→Propagate | State change → blast radius → pattern reassignment |
