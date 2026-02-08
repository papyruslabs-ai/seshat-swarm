# Seshat Swarm

**Drone swarm coordination through finite behavioral catalog selection.**

Seshat Swarm applies the [Seshat framework](https://github.com/papyruslabs-ai/seshat)'s 9D semantic space to physical drone coordination. The same mathematical framework that proves code has a finite structural vocabulary (2,571 patterns from 108,966 entities across 34 repos) is reinterpreted for drone behavior — where the structural space is even more constrained.

## The Idea

Traditional drone swarms either follow pre-programmed choreography (brittle) or run real-time AI planners (uncertifiable). This project takes a third path:

**The space of meaningfully different drone behaviors is finite and enumerable.**

A drone can hover, translate, orbit, avoid, land, climb, dock. It can be a leader, follower, relay, performer, or charger. It can be bare, carrying a solar panel, or carrying a battery pack. These structural dimensions are finite. The infinite variation — actual position, velocity, neighbor relationships — is *parameterization* within a finite behavioral archetype. The same way the infinite variation in code (which functions are called, which data flows through) is parameterization within 2,571 structural archetypes.

This means:
- Every behavioral pattern can be **pre-verified offline** (collision-free, energy-bounded, transition-safe)
- Runtime coordination is **O(1) catalog lookup**, not real-time planning
- Safety is a property of the **finite catalog**, not a property of a black-box runtime
- Adding a new drone type requires **one new generator**, not rewriting coordination logic
- Role assignment (relay, performer, charger) is **dynamic** — any drone can play any role

## Architecture

```
              ┌──────────────────────────┐
              │   Behavioral Catalog      │
              │   (finite, pre-verified)  │
              │   ~200-1,500 patterns     │
              └────────────┬─────────────┘
                           │ select + parameterize
              ┌────────────▼─────────────┐
              │   Ground Station          │
              │   (constraint satisfaction│
              │    blast radius engine    │
              │    role assignment)       │
              └────────────┬─────────────┘
                           │ pattern ID + δ params
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ Drone 1  │  │ Drone 2  │  │ Drone 3  │
      │ ρ=CF2.1  │  │ ρ=CF2.1  │  │ ρ=CF2.1  │
      │ χ=leader │  │ χ=follow │  │ χ=relay  │
      │ σ=orbit  │  │ σ=orbit  │  │ σ=hover  │
      └──────────┘  └──────────┘  └──────────┘
```

Each drone receives a pattern ID and parameterizes it with its own sensor data. The ground station runs constraint satisfaction over the finite catalog to find compatible pattern assignments. When a drone changes state, only its spatial neighbors recompute (Theorem 9.4 — blast radius propagation).

## The 9D Semantic Space for Drones

| Dimension | Meaning | Finite? | Role |
|-----------|---------|---------|------|
| σ (sigma) | Behavioral mode | Yes (~15-30) | What the drone is doing |
| ε (epsilon) | Neighbor graph | Combinatorial | Who the drone sees |
| δ (delta) | Sensor state | Continuous | Where the drone is |
| κ (kappa) | Autonomy level | Yes (~3-5) | How much operator control |
| χ (chi) | Formation role | Yes (~10-15) | The drone's job in the swarm |
| λ (lambda) | Resource ownership | Yes (~5-10) | What the drone "owns" (airspace, energy) |
| τ (tau) | Physical traits | Yes (~10-20) | Payload-dependent flight characteristics |
| ρ (rho) | Hardware target | Yes (~5-10) | What firmware to generate |
| Σ (sigma_upper) | Intent hash | Derived | Summary of current objective |

**J = J_structural × J_semantic**
- J_structural = (σ, κ, χ, λ, τ, ρ) → Finite catalog (~200-1,500 patterns)
- J_semantic = (ε, δ, Σ) → Continuous parameterization

## Key Properties

- **Blast Radius (Theorem 9.4)**: State change propagates only to affected neighbors, not the whole swarm
- **Δ Classification**: Cosmetic changes (LED, smoothness) don't propagate. Behavioral changes do.
- **Style Layer**: Same formation with different "feel" — smooth organic vs. sharp precise. Style never affects safety.
- **Dynamic Roles**: "Relay" is a coordinate value, not a chassis property. Any drone can be anything.
- **Relay Chain Positioning**: Drones in known-position zones act as mobile positioning anchors, extending flyable volume beyond base station range

## Hardware

**Target platform**: [Crazyflie 2.1+](https://store.bitcraze.io/products/crazyflie-2-1-plus) by Bitcraze
- 27g, 92mm, fully open source C firmware
- Lighthouse positioning (sub-mm accuracy)
- Mature swarm framework (Crazyswarm2/ROS 2)
- CrazySim simulator for pre-hardware development

**Minimum viable swarm**: 3 drones, ~$1,500 total with positioning infrastructure.

## Project Status

**Phase**: Planning and specification. No hardware purchased yet. All development targets the CrazySim simulator until hardware integration phase.

See [PLANNING.md](PLANNING.md) for the complete build plan.

## Relationship to Seshat

This project is a domain extension of the [Seshat framework](https://github.com/papyruslabs-ai/seshat). Seshat proves that the structural vocabulary of code is finite (2,571 Core patterns, 42.4x compression, sublinear growth). Seshat Swarm applies the same mathematical framework — the 9D semantic space, blast radius propagation, Δ classification, style/semantic separation — to the physical domain of drone coordination.

The hypothesis: if code behaviors are finite (proven), then physical behaviors under tighter constraints are also finite (predicted). A successful drone swarm demo would validate the framework's generality beyond software.

## License

TBD

## Author

Joseph Merrill — [Papyrus Labs](https://github.com/papyruslabs-ai)
