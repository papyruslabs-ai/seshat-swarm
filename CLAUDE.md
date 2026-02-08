# Seshat Swarm — Claude Code Instance Briefing

## 30-Second Overview

This project applies the Seshat framework's 9D semantic space (JSTF-T) to **drone swarm coordination**. The core discovery: the structural vocabulary of behavior is **finite**. Just as 108,966 code entities across 34 repos collapsed to 2,571 Core patterns (42.4x compression), drone behaviors collapse to a finite, pre-verifiable catalog.

Drones don't generate behavior at runtime. They **select** from a pre-verified catalog and **parameterize** with real-time sensor data.

```
Traditional:    Sensor input → Generate behavior → Execute (brittle, uncertifiable)
This project:   Sensor input → Select verified pattern → Parameterize → Execute (safe, O(1))
```

The generation function is the same as Seshat's code generation:

```
γ(J, S, L) → Output

Code:   γ(coordinates, style, TypeScript) → source files
Drones: γ(coordinates, style, CrazyflieMotors) → motor commands
```

Where:
- **J** = behavioral coordinates (finite structural catalog + continuous parameterization)
- **S** = swarm style (smooth vs sharp transitions, tight vs loose formations)
- **L** = hardware target (Crazyflie 2.1+, ESP-drone, future platforms)

---

## The Empirical Foundation

This is NOT speculative. The finite-catalog property is **empirically proven for code**:

| Metric | Code (34 repos) | Drones (predicted) |
|--------|-----------------|-------------------|
| Total entities | 108,966 | — |
| Core patterns | 2,571 | Est. 200–1,500 |
| Compression ratio | 42.4x | Est. 50–200x (physics more constrained than code) |
| Top patterns coverage | 112 patterns → 85.7% | Est. 50–100 patterns → 85%+ |
| Growth rate | Sublinear (log) | Sublinear (log) — fewer valid physical behaviors than code behaviors |

**Source**: `../seshat-converter/api-v2/translator/STATUS-AND-VISION.md`

The argument: if the infinite-seeming space of all possible programs collapses to ~2,571 structural archetypes, then the more-constrained space of physically valid drone behaviors should collapse to an even smaller catalog. Every behavioral pattern can be verified offline for collision safety, energy bounds, and transition stability. At runtime, the drone is indexing a lookup table — not running a neural net.

---

## The 9 Dimensions (Reinterpreted for Drones)

The same 9D space. Different domain. See `docs/DRONE-9D-SPACE.md` for the complete specification.

### Structural Dimensions (Finite — The Catalog)

| Dim | Code Meaning | Drone Meaning | Est. Cardinality |
|-----|-------------|---------------|-----------------|
| σ (sigma) | Entity type | Behavioral mode (hover, translate, orbit, avoid, land, climb, dock) | ~15–30 |
| κ (kappa) | Purity | Autonomy level (autonomous, operator-guided, emergency-override) | ~3–5 |
| χ (chi) | Layer/visibility | Formation role (leader, follower, relay, performer, charger, scout) | ~10–15 |
| λ (lambda) | Ownership | Resource ownership (exclusive-volume, shared-corridor, energy-budget) | ~5–10 |
| τ (tau) | Type traits | Physical traits (bare, solar-panel, battery-carrier, camera-equipped) | ~10–20 |
| ρ (rho) | Runtime env | Hardware target (crazyflie-2.1, crazyflie-bl, esp-drone, sim) | ~5–10 |

### Semantic Dimensions (Continuous — The Parameterization)

| Dim | Code Meaning | Drone Meaning | Nature |
|-----|-------------|---------------|--------|
| ε (epsilon) | Call graph | Neighbor graph (which drones I see, depend on, communicate with) | Combinatorial |
| δ (delta) | Data flow | Sensor state (position, velocity, orientation, battery, wind) | Continuous |
| Σ (sigma_upper) | Statement semantics | Intent hash (current behavioral objective summary) | Derived |

### The Factorization

```
J_drone = J_structural × J_semantic

J_structural = (σ, κ, χ, λ, τ, ρ)  → FINITE: est. 200–1,500 occupied points
J_semantic   = (ε, δ, Σ)            → CONTINUOUS: real-time parameterization
```

---

## Key Properties (Inherited from Seshat)

### 1. Theorem 9.4 — Blast Radius

When drone_i changes behavioral state:
```
affected(drone_i) = spatial_neighbors(drone_i) ∪ role_dependents(drone_i) ∪ {drone_i}
```
Only affected drones recompute. A 10-drone swarm where each drone has 2–3 neighbors: 3–4 drones update per state change, not 10. Cost: O(|affected| × catalog_lookup) ≈ microseconds.

### 2. Δ Classifier

Every state change is classified:
- **Δ = 0** (style change): LED color, interpolation curve, transition smoothness → update S only, no propagation to neighbors
- **Δ ≠ 0** (behavioral change): new trajectory, role reassignment, formation change → update J, propagate via blast radius

### 3. Style/Semantic Separation

Same formation, different "feel." S controls:
- Transition smoothness (sharp military snap vs. flowing organic movement)
- Formation tightness (tight grid vs. loose cloud)
- Speed profile (constant velocity vs. ease-in-ease-out)
- Visual personality (the "choreography feel")

Changing S never changes collision safety. The behavioral patterns (J) are verified independently of style.

### 4. Roles Are Coordinates, Not Chassis

"Relay" is a value of χ, not a property of the hardware. Any drone can be a relay, performer, charger, or scout. Role assignment is pattern selection from the finite catalog. The system dynamically reassigns based on position, battery, and formation needs.

### 5. Pre-Verification Is the Safety Case

Every pattern in the catalog is verified offline:
- **Collision-free** at specified separation distances
- **Energy-bounded** (can complete the behavior on remaining battery)
- **Transition-safe** (every valid pattern-to-pattern transition is checked)
- **Communication-viable** (maintains contact with at least one peer or base)

If a behavior isn't in the catalog, no drone can execute it. This is certifiable safety — a finite lookup table, not a black-box neural network.

---

## Hardware Target

**Crazyflie 2.1+ (Bitcraze)** — $240/drone, 27g, fully open source C firmware.

| Component | Purpose | Cost |
|-----------|---------|------|
| Crazyflie 2.1+ (×3) | The drones | $720 |
| Lighthouse deck (×3) | Sub-mm positioning | $225 |
| SteamVR 2.0 base station (×2) | Lighthouse infrastructure | $480 |
| Crazyradio PA (×1) | Ground station communication | $75 |
| **Total MVP** | **3-drone swarm with positioning** | **$1,500** |

Optional: AI deck ($95, camera + GAP8 RISC-V), VR headset (SteamVR-compatible — shares base stations with drones).

**Simulator**: CrazySim (Gazebo-based). All development through Phase 5 uses the simulator. Hardware needed only for Phase 6.

---

## Build Phases

See `PLANNING.md` for the complete plan. Summary:

| Phase | What | Hardware? | Est. Effort |
|-------|------|-----------|-------------|
| 1 | Space Definition — types, dimension schemas | No | Days |
| 2 | Behavioral Catalog — pattern enumeration, compatibility matrix | No | Days |
| 3 | Coordinator — ground station, blast radius, role assignment | No | 1–2 weeks |
| 4 | Firmware Skeleton — C for STM32, pattern lookup | No | 1 week |
| 5 | Simulation — CrazySim integration, end-to-end validation | No | Days |
| 6 | Hardware Integration — flash, calibrate, first flight | Yes | Days |

Phases 1–5 are pre-hardware. By Phase 6, the software is tested against simulated drones.

---

## File Map

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — cold-start briefing |
| `README.md` | Project overview and motivation |
| `PLANNING.md` | Phase-by-phase build plan with acceptance criteria |
| `docs/DRONE-9D-SPACE.md` | Complete 9D dimension reinterpretation for drones |
| `docs/ARCHITECTURE.md` | System architecture, components, data flow |
| `docs/BEHAVIORAL-CATALOG-SPEC.md` | Catalog schema, pattern structure, verification approach |

### Seshat Framework References

These files in the parent repo provide the mathematical foundation:

| File | What You Learn |
|------|---------------|
| `../seshat-converter/api-v2/translator/STATUS-AND-VISION.md` | Empirical proof: 2,571 patterns from 108,966 entities |
| `../seshat-converter/api-v2/translator/docs/architecture/JSTF-T-MATHEMATICAL-FOUNDATIONS.md` | The 9D space mathematics, fiber bundle structure |
| `../seshat-converter/Onboarding/mathematical formulization of Seshat.md` | Theorem 9.4 (blast radius), 5-phase pipeline proof |
| `../seshat-converter/api-v2/translator/docs/architecture/STYLE-LAYER-SPEC.md` | Style layer — S in γ(J, S, L) |
| `../seshat-converter/hologram/VISION.md` | The Hologram UI vision (the drone VR interface mirrors this) |

---

## Principles

1. **Selection, not generation.** Drones select from a pre-verified finite catalog. They never generate novel behavior at runtime. This is the fundamental architectural decision.

2. **The catalog IS the safety case.** Every pattern is verified offline. If it's not in the catalog, no drone can do it. Safety is a property of the catalog, not of the runtime.

3. **Roles are coordinates, not chassis.** Any drone can play any role. Relay, performer, charger — these are χ values, not hardware properties. The system assigns roles dynamically.

4. **Hardware differences are ρ × τ.** A solar-panel drone has different ρ (hardware) and τ (traits) than a bare drone. The catalog partitions by ρ × τ — each drone selects only from patterns valid for its hardware.

5. **The math is the same.** This project adapts the Seshat framework. Don't reinvent. The 9D space, blast radius propagation, Δ classifier, and style layer all transfer directly. When in doubt, read the Seshat math docs.

6. **Simulate before you fly.** Phases 1–5 are simulation-only. No code should assume real hardware until Phase 6. Everything must work in CrazySim first.

7. **The swarm is an organism.** Individual drones cycle in and out (charging, role rotation). The swarm persists. Design for continuous operation, not individual drone lifetimes.

---

## Anti-Patterns (Don't Do This)

1. **Don't generate behavior at runtime.** If you find yourself writing code that computes novel motor commands from scratch, stop. You should be selecting from the catalog and parameterizing.

2. **Don't hard-code roles.** If drone #2 is always the relay, you've failed. Roles come from constraint satisfaction over the catalog, not from configuration.

3. **Don't ignore the math.** Every architectural decision should trace back to a property of the 9D space. If you can't explain why a design choice works in terms of coordinates, blast radius, or the Δ classifier, reconsider.

4. **Don't build a flight controller.** The Crazyflie firmware already has PID control, motor mixing, and attitude estimation. We're building the *behavioral layer on top* — what the drone should do, not how its motors spin.

5. **Don't conflate style and semantics.** A formation change is semantic (Δ ≠ 0, propagates). A transition-smoothness change is style (Δ = 0, local). If your code treats them the same, the architecture is broken.
