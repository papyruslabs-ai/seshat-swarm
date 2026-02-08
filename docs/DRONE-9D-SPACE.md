# The 9D Semantic Space for Drone Behavior

This document reinterprets each dimension of Seshat's JSTF-T 9D semantic space for the domain of physical drone behavior. The mathematical structure (fiber bundle, dependent types, factorization into finite core × combinatorial tail) transfers directly. The semantics change from "what code does" to "what a drone does."

---

## The Factorization Theorem (Adapted)

From the code domain (empirically measured across 34 repos, 108,966 entities):

```
J_code = J_structural × J_semantic

J_structural = (σ, κ, χ, λ, τ, ρ)  → 2,571 occupied points (finite, sublinear growth)
J_semantic   = (ε, δ, Σ)            → 31,527 unique combinations (combinatorial, grows with diversity)
```

**Predicted for drones:**

```
J_drone = J_structural × J_semantic

J_structural = (σ, κ, χ, λ, τ, ρ)  → Est. 200–1,500 occupied points
J_semantic   = (ε, δ, Σ)            → Continuous (position, velocity, neighbor state)
```

The drone structural space should be *smaller* than code's because physics imposes tighter constraints than programming languages. Many combinations of (σ, κ, χ, λ, τ, ρ) are physically invalid (you can't orbit while docked, you can't be a leader with no followers, a solar-laden drone can't do aggressive acrobatics). The 0.01% occupancy rate observed in code (2,571 of ~23.5M theoretical combinations) may be even lower for drones.

---

## Structural Dimensions (Finite — The Catalog)

### σ (Sigma) — Behavioral Mode

**Code**: Entity type (function, class, const, interface, type, import, re-export, hook, component, page...)
**Drones**: What the drone is physically doing right now.

| Value | Description | Transitions From | Transitions To |
|-------|-------------|-----------------|----------------|
| `hover` | Stationary position hold | translate, orbit, avoid, climb, descend | translate, orbit, avoid, climb, descend, land, dock |
| `translate` | Moving from point A to point B | hover, orbit, avoid | hover, orbit, avoid, climb, descend |
| `orbit` | Circling a fixed point at set radius | hover, translate | hover, translate, avoid |
| `avoid` | Emergency collision avoidance maneuver | any | hover (after clear) |
| `climb` | Gaining altitude | hover, translate | hover, translate, descend |
| `descend` | Losing altitude | hover, translate, climb | hover, translate, land |
| `land` | Controlled descent to surface | hover, descend | grounded |
| `takeoff` | Controlled ascent from surface | grounded | hover |
| `dock` | Approaching and connecting to charging pad or peer | hover, translate | docked |
| `undock` | Departing from dock | docked | hover |
| `grounded` | On ground, powered | land | takeoff |
| `docked` | Connected to charging infrastructure | dock | undock |
| `formation-hold` | Maintaining position relative to formation center | translate | translate, hover, avoid |
| `formation-transition` | Smoothly moving to new formation position | formation-hold | formation-hold, hover |
| `relay-hold` | Stationary position hold optimized for communication relay | hover | hover, translate |

**Estimated cardinality: ~15–20 values.** This is a closed enum — the set of physically possible behavioral modes is bounded by physics.

**Transition matrix**: Not every σ→σ transition is valid. The transition matrix is part of the catalog verification — invalid transitions are excluded. A drone in `grounded` cannot jump to `orbit` without passing through `takeoff` → `hover` → `orbit`.

### κ (Kappa) — Autonomy Level

**Code**: Purity (PURE / IMP — whether the function has side effects)
**Drones**: How much operator control the drone is under.

| Value | Description | When |
|-------|-------------|------|
| `autonomous` | Drone selects patterns from catalog independently | Normal swarm operation |
| `operator-guided` | Drone follows operator intent (VR controller, waypoints) | Interactive direction |
| `emergency` | Override all normal behavior, execute safety protocol | Collision imminent, battery critical, communication lost |
| `manual` | Direct motor control from operator (bypasses catalog) | Calibration, testing only |

**Estimated cardinality: 4 values.** Binary in code (PURE/IMP). Slightly richer for drones because the autonomy spectrum matters for safety.

**Key property**: Emergency κ overrides all other dimensions. A drone in `emergency` ignores its current σ, χ, and formation obligations. This is the safety floor.

### χ (Chi) — Formation Role

**Code**: Layer and visibility (module, route, service, controller × public, private, internal)
**Drones**: The drone's current job within the swarm.

| Value | Description | Responsibilities |
|-------|-------------|-----------------|
| `leader` | Formation reference point | Maintains absolute position, others position relative to leader |
| `follower` | Maintains offset from leader or peer | Tracks leader + offset vector |
| `relay` | Positioning reference for out-of-range drones | Holds stable position, broadcasts UWB |
| `performer` | Executing the "show" (whatever the swarm's purpose is) | Active in formation, following choreography |
| `charger-inbound` | Returning to charging pad | Navigating to pad, preparing to land/dock |
| `charging` | On charging pad, receiving energy | Stationary, monitoring charge level |
| `charger-outbound` | Departing charging pad, rejoining swarm | Navigating to formation slot |
| `scout` | Exploring ahead of formation | Extended range, relay chain |
| `anchor` | Fixed reference point for formation geometry | Minimal movement, high stability |
| `reserve` | Hovering in standby, ready to replace | Near formation, conserving energy |

**Estimated cardinality: ~10–12 values.**

**Dynamic assignment**: χ is the most frequently reassigned dimension. A drone might cycle through `performer` → `charger-inbound` → `charging` → `charger-outbound` → `performer` every 7–10 minutes (one battery cycle). The assignment is constraint satisfaction, not configuration.

### λ (Lambda) — Resource Ownership

**Code**: Parameter ownership (Rust-relevant: owned, borrowed, mutable reference — near-zero for JS/TS)
**Drones**: What resources the drone currently "owns" or is responsible for.

| Value | Description |
|-------|-------------|
| `exclusive-volume` | Owns a specific airspace volume — no other drone may enter |
| `shared-corridor` | In a shared movement corridor — must maintain separation |
| `yielding` | Has yielded its volume to another drone (during role transition) |
| `energy-source` | Owns/produces energy (solar panel drone) |
| `energy-store` | Owns stored energy available for transfer |
| `energy-consumer` | Consuming energy, no excess |
| `comm-bridge` | Owns a communication link between two zones |

**Estimated cardinality: ~7–10 values.**

**Activation note**: This dimension was near-zero for JS/TS code (ownership is implicit). It activates for drones because airspace and energy are explicitly owned resources that must be coordinated. This validates the 9D design — dimensions that lie dormant in one domain activate in another.

### τ (Tau) — Physical Traits

**Code**: Type-level traits (Rust-relevant: Send, Sync, Copy, Clone — dead for JS/TS)
**Drones**: Physical characteristics that affect what behavioral patterns are valid.

| Value | Description | Flight Impact |
|-------|-------------|---------------|
| `bare` | No payload | Full agility, lowest weight, shortest range |
| `solar-equipped` | Carrying solar panel | Reduced agility, higher drag, energy harvesting |
| `battery-carrier` | Carrying extra battery | Reduced agility, extended range, can transfer energy |
| `camera-equipped` | Carrying camera (AI deck) | Slight weight increase, vision capability |
| `sensor-extended` | Carrying additional sensors | Weight varies, enhanced awareness |
| `dual-deck` | Two expansion decks | Reduced agility, combined capabilities |

**Estimated cardinality: ~6–10 values.** Determined by physical deck configurations.

**Catalog partitioning**: τ constrains which σ values are valid. A `solar-equipped` drone cannot select `aggressive-acrobatic` behavioral modes. The catalog explicitly excludes patterns that are unsafe for a given τ.

**Activation note**: Like λ, this dimension was dead for JS/TS. It activates for drones because physical traits genuinely constrain behavior. A 27g bare Crazyflie and a 35g solar-equipped Crazyflie are different platforms that need different motor commands for the same maneuver.

### ρ (Rho) — Hardware Target

**Code**: Runtime environment (reactive model, async model, platform, rendering)
**Drones**: The specific hardware the drone runs on.

| Value | Description | Motor Config |
|-------|-------------|-------------|
| `crazyflie-2.1` | Stock Crazyflie 2.1+ with brushed motors | 4× coreless DC, ~15g thrust/motor |
| `crazyflie-bl` | Crazyflie 2.1 Brushless | 4× brushless, ~25g thrust/motor |
| `esp-drone` | ESP32-based micro drone | Varies by build |
| `sim-gazebo` | CrazySim simulated drone | Virtual physics |
| `sim-simple` | Simplified physics simulator | Point-mass model |

**Estimated cardinality: ~5–10 values.**

**Generator target**: ρ determines which generator γ uses. `γ(J, S, crazyflie-2.1)` produces STM32 motor commands. `γ(J, S, sim-gazebo)` produces Gazebo actuator commands. Same coordinates, different output — exactly like generating TypeScript vs. Python from the same JSTF-T coordinate.

---

## Semantic Dimensions (Continuous — The Parameterization)

### ε (Epsilon) — Neighbor Graph

**Code**: Call graph (which functions this function calls, which call it)
**Drones**: The drone's relationship to other drones and infrastructure.

```
ε = {
  neighbors: [drone_id, ...],        // Spatial neighbors within communication range
  leader: drone_id | null,           // Who this drone follows (if follower)
  followers: [drone_id, ...],        // Who follows this drone (if leader)
  relay_target: drone_id | null,     // Who this drone relays for (if relay)
  relay_source: drone_id | null,     // Who relays for this drone
  dock_target: pad_id | null,        // Charging target (if charger-inbound)
  base_stations: [station_id, ...],  // Visible Lighthouse base stations
}
```

**Nature**: Combinatorial. Changes as drones move relative to each other. The *types* of relationships are finite (neighbor, leader, follower, relay), but the *specific instances* are combinatorial.

**Blast radius source**: ε defines the propagation graph. When drone_i changes state, affected = ε.neighbors ∪ ε.followers ∪ {drone_i}.

### δ (Delta) — Sensor State

**Code**: Data flow signatures (input types, mutability, source)
**Drones**: The drone's current physical state from sensors.

```
δ = {
  position: { x, y, z },            // Meters, in Lighthouse frame
  velocity: { vx, vy, vz },         // Meters/second
  orientation: { roll, pitch, yaw }, // Radians
  angular_velocity: { p, q, r },    // Radians/second
  battery: {
    voltage: float,                  // Volts
    percentage: float,               // 0–1
    discharge_rate: float,           // Watts
    estimated_remaining: float,      // Seconds
  },
  position_quality: float,           // 0–1, confidence in position estimate
  wind_estimate: { wx, wy, wz },    // Estimated wind vector (if available)
}
```

**Nature**: Continuous. Updated at IMU rate (500–1000Hz). This is the parameterization that makes each drone's execution of a behavioral pattern unique — two drones both in `hover` at different positions run different motor commands because their δ differs.

### Σ (Sigma Upper) — Intent Hash

**Code**: Statement-level semantics (operation sequence, statement count)
**Drones**: A compact summary of the drone's current behavioral objective.

```
Σ = hash(σ, target_position, formation_slot, current_objective)
```

**Nature**: Derived from the other dimensions. Used for quick comparison — two drones with the same Σ are doing "the same thing" in different locations. Useful for swarm-level monitoring: "how many drones are performing vs. charging vs. relaying?"

---

## Dimension Interactions (Fiber Bundle Structure)

In the code domain, λ and τ are dependent types indexed over σ.params — a function's ownership semantics depend on its parameter types. The same fiber bundle structure applies to drones:

| Dependency | Meaning |
|-----------|---------|
| τ depends on ρ | Physical traits depend on hardware (what decks are attached to what platform) |
| Valid σ depends on τ | Available behavioral modes depend on physical traits (solar drone can't do acrobatics) |
| Valid χ depends on τ | Available roles depend on capability (only drones with UWB can be relays) |
| λ depends on χ | Resource ownership depends on role (only leaders own formation anchor points) |
| ε depends on δ | Neighbor graph depends on positions (who is in range) |
| Σ derives from all | Intent hash summarizes the full state |

These dependencies mean the catalog isn't a flat cross-product. It's a fiber bundle — at each base point (ρ, τ), only certain fibers (σ, χ, λ) are valid. This is why 0.01% occupancy is expected, just as in the code domain.

---

## Comparison: Code vs. Drones

| Property | Code (measured) | Drones (predicted) |
|----------|----------------|-------------------|
| Total structural dimensions | 6 | 6 (same) |
| Total semantic dimensions | 3 | 3 (same) |
| Core pattern occupancy | 0.01% of theoretical | ≤0.01% (tighter constraints) |
| Core patterns (measured/est.) | 2,571 | 200–1,500 |
| Growth rate | Sublinear (log) | Sublinear (log) |
| Dominant trivial pattern | imports (25.7%) | hover-idle (est. 20-30%) |
| λ cardinality | 0 (JS/TS) | ~7–10 (airspace + energy) |
| τ cardinality | 0 (JS/TS) | ~6–10 (payload configs) |
| κ cardinality | 2 (PURE/IMP) | ~4 (autonomy levels) |
| Bimodal distribution? | Yes (93.9% singletons, top 10 = 51.5%) | Expected (most time in few patterns, long tail of rare maneuvers) |

---

## The Core Pattern for Drones

Following the code domain's `core_pattern` definition:

```
core_pattern = κ | χ.role | σ | ρ | τ
```

Example:
```
autonomous|performer|orbit|crazyflie-2.1|bare
autonomous|relay|relay-hold|crazyflie-2.1|bare
autonomous|charging|docked|crazyflie-2.1|solar-equipped
emergency|*|avoid|crazyflie-2.1|bare
```

The core pattern determines *what kind of behavior*. The semantic dimensions (ε, δ, Σ) determine *the specific instance* — where, relative to whom, at what velocity.

---

## Open Questions

1. **Is the drone catalog truly convergent?** The code catalog converges sublinearly. We predict the same for drones but need to enumerate and verify.

2. **How fine-grained should σ be?** Is "translate" one mode, or should "translate-fast" and "translate-slow" be distinct? The answer depends on whether the motor command differences are parameterization (δ-dependent speed) or structural (fundamentally different control strategies).

3. **What's the right granularity for τ?** Is "solar-equipped" enough, or do we need "solar-30W" vs "solar-10W"? The answer depends on whether the flight characteristics are meaningfully different.

4. **How do we handle degraded positioning?** When a drone loses Lighthouse lock and is on UWB-only (lower accuracy), does that change its catalog? Probably: position_quality in δ constrains which σ modes are safe (tight formation requires high position_quality).

5. **Multi-swarm coordination**: Two independent swarms meeting. Does the catalog scale, or does inter-swarm coordination require a meta-layer?
