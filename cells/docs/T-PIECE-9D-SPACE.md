# T-Piece 9D Semantic Space

The fundamental composable unit is the **T-piece** — a crossbar (fixed length) with a vertical bar (variable length) extending from its center. Polygons emerge from how many T-pieces connect: 3 T's make a triangle, 4 a square, 6 a hexagon, 8 an octagon. 3D polyhedra (including the truncated octahedron) emerge from polygons connecting at their crossbar faces.

This document defines the 9D semantic space for T-pieces, following the same mathematical framework as code (JSTF-T) and drone swarms.

## The T-Piece Anatomy

```
     crossbar end L ◄──── edge to neighbor T ────► crossbar end R
           ╔═══════════════════════════════╗
           ║    crossbar (MCU lives here)        ║ ← flat face = inter-face
           ╚═══════════════╦═══════════════╝       connection to adjacent
                           ║                       polygon (3D joint)
                           ║  vertical bar
                           ║  (variable length)
                           ║
                           ◉ ← center hub connection
```

### 4 Connection Points

| Point | Name | Type | Connects to |
|-------|------|------|-------------|
| 0 | Crossbar end L | intra-face | Adjacent T's crossbar end (same polygon edge) |
| 1 | Crossbar end R | intra-face | Adjacent T's crossbar end (same polygon edge) |
| 2 | Crossbar face | inter-face | Another polygon's T crossbar (3D dihedral joint) |
| 3 | Vertical tip | hub | Polygon center (where all vertical bars meet) |

### Polygon Emergence

The shape is determined by count and vertical bar length:

| T-count | Polygon | Vertex angle | Vertical bar length |
|---------|---------|--------------|---------------------|
| 3 | Triangle | 60° | Short |
| 4 | Square | 90° | Medium |
| 5 | Pentagon | 108° | Medium-long |
| 6 | Hexagon | 120° | Long |
| 8 | Octagon | 135° | Longer |
| 12+ | Approaches circle | — | — |

A truncated octahedron assembles from two T variants: one with the vertical bar length for square faces (4 T's per face) and one for hexagonal faces (6 T's per face). Same crossbar. Same MCU bay. Same connection geometry. Just the spoke length differs.

## The 9 Dimensions

### Overview

| Dim | Symbol | Name | What it encodes | Finite? | Est. cardinality |
|-----|--------|------|-----------------|---------|-----------------|
| 1 | **σ** | **Mode** | What is this T doing right now? | Yes | ~8-12 |
| 2 | **ε** | **Edges** | What is this T connected to, at which points? | Combinatorial | Topologies finite |
| 3 | **δ** | **State** | Position, orientation, load, power | Continuous | Parameterization |
| 4 | **κ** | **Criticality** | Can this T disconnect right now without collapse? | Yes | ~4-5 |
| 5 | **χ** | **Role** | What structural role does this T play? | Yes | ~8-12 |
| 6 | **λ** | **Ownership** | Which polygon(s) claim this T? | Yes | ~4-6 |
| 7 | **τ** | **Traits** | What hardware variant is this T? | Yes | ~5-8 |
| 8 | **ρ** | **Target** | What MCU/magnet configuration? | Yes | ~3-5 |
| 9 | **Σ** | **Intent** | What macro-operation is this T part of? | Derived | — |

### σ (Mode) — What is this T doing?

The T-piece's current behavioral state. Analogous to `hover`/`translate`/`orbit` for drones, or `function`/`const`/`class` for code.

| Value | Description |
|-------|-------------|
| `locked` | All active connections rigid, steady state |
| `assembling` | In the process of forming a new connection |
| `disassembling` | Controlled disconnect sequence |
| `corridor` | Weak guide mode — routing a cell or void through the fabric |
| `phase-shift` | Disconnect/reconnect for projectile passage |
| `load-redirect` | Temporarily absorbing extra load while a neighbor disconnects |
| `free` | Unattached, available for assembly |
| `emergency-lock` | All connections maximum force, structural threat detected |

### ε (Edges) — Connection topology

The most important dimension for structural analysis. Encodes what each of the 4 connection points is connected to.

```
ε = {
  point_0: { connected_to: [UUID, ...], strength: N, angle: degrees },
  point_1: { connected_to: [UUID, ...], strength: N, angle: degrees },
  point_2: { connected_to: [UUID, ...], strength: N, angle: degrees },
  point_3: { connected_to: [UUID, ...], strength: N, angle: degrees }
}
```

Connection multiplicity is the key structural signal:

| Multiplicity at Point 2 | Meaning |
|--------------------------|---------|
| 0 | Surface-facing — this T is on the exterior skin |
| 1 | Standard inter-face joint — 2 polygons share this edge |
| 2 | Truss node — 3 polygons share this edge (bridge pattern) |
| 3+ | Complex 3D junction — 4+ polygons converge |

The 3-triangles-sharing-an-edge case (common in bridge trusses for load-bearing strength) appears as multiplicity 2 at Point 2:

```
ε = {
  point_0: { connected_to: [T_a] },        // left edge of my polygon
  point_1: { connected_to: [T_b] },        // right edge of my polygon
  point_2: { connected_to: [T_c, T_d] },   // TWO inter-face connections
  point_3: { connected_to: [T_e, T_f] }    // hub (shared with polygon siblings)
}
```

### δ (State) — Continuous sensor data

Real-time measurements. Analogous to drone sensor state (position, velocity, battery) or code data flow (inputs, mutations).

| Field | Type | Description |
|-------|------|-------------|
| `position` | Vec3 | Location within the structure |
| `orientation` | Quaternion | Which way the crossbar faces |
| `load` | [N, N, N, N] | Force at each of the 4 connection points |
| `power` | float | Remaining energy (0–1) |
| `temperature` | float | Thermal state |
| `strain` | float | Deformation measurement (if sensor-equipped) |

### κ (Criticality) — Can this T safely disconnect?

Computed from the structure's load graph, not configured. The coordinator analyzes δ readings across the structure to classify each T.

| Value | Description | Disconnect safe? |
|-------|-------------|-----------------|
| `redundant` | Alternative load paths exist | Yes |
| `load-path` | In a load chain but alternatives available | With care |
| `load-critical` | No alternative path — disconnect causes structural failure | No |
| `emergency` | Structural threat detected — lock everything | No |

When a projectile response needs to disconnect a T with κ = `load-critical`, the wave must either route around it or surrounding T's must enter σ = `load-redirect` first to establish alternative load paths before the disconnect.

### χ (Role) — Structural role in the larger assembly

Where this T sits in the structural hierarchy. Analogous to code's layer/visibility (`service`/`controller`/`route`) or a drone's formation role (`leader`/`follower`/`relay`).

| Value | Description |
|-------|-------------|
| `vertex` | Standard position at a polygon corner |
| `shared-edge` | At an edge where 2+ polygons meet |
| `shared-vertex` | At a point where 3+ polygons converge |
| `anchor` | Fixed to ground/base, non-removable |
| `surface` | On the exterior skin of the structure |
| `interior` | Fully enclosed by other T's on all sides |
| `bridge-node` | Removing this T splits the structure into disconnected components |
| `cantilever-tip` | At the unsupported end of an overhang |

### λ (Ownership) — Which polygons claim this T?

Resource allocation across polygon boundaries. Analogous to code's borrow/own/lend semantics or drone airspace ownership.

| Value | Description |
|-------|-------------|
| `owned-1` | Belongs to exactly 1 polygon |
| `shared-2` | Claimed by 2 polygons (standard edge-sharing) |
| `shared-3` | Claimed by 3 polygons (bridge truss pattern) |
| `shared-4+` | Claimed by 4+ polygons (complex 3D junction) |
| `contested` | Multiple polygons requesting, not yet resolved |
| `unowned` | Free, not part of any polygon |

When a polygon needs to reconfigure, it cannot unilaterally take T's with λ = `shared-2` or higher. It must negotiate with co-owning polygons through the coordinator — one polygon's reconfiguration affects all polygons sharing those T's.

### τ (Traits) — Hardware variant

Physical capabilities of this specific T-piece. Analogous to drone payload (bare, solar-equipped, camera-equipped) or code runtime traits (async, iterable).

| Value | Description |
|-------|-------------|
| `basic` | CH32V003, wired comms only, 4 electropermanent magnets |
| `wireless` | ESP32-C2, has BLE/WiFi for coordinator link |
| `camera` | Has image sensor for exterior sensing |
| `power-source` | Connected to external power, distributes to neighbors |
| `heavy-duty` | Stronger magnets, higher load rating |
| `sensor-rich` | Strain gauges, temperature, accelerometer |

Not every T needs every capability. Interior T's run on `basic` ($0.10 MCU). Surface-facing T's carry `camera` or `wireless`. A structure of 200 T's might have 150 `basic`, 30 `camera`, 15 `wireless`, and 5 `power-source`.

### ρ (Target) — Hardware configuration

The specific MCU + magnet combination. Analogous to drone hardware target (crazyflie-2.1, sim-gazebo) or code runtime environment (node, browser, wasm).

| Value | Description |
|-------|-------------|
| `ch32v003-ep` | CH32V003 + electropermanent magnets (production) |
| `esp32c2-ep` | ESP32-C2 + electropermanent magnets (wireless variant) |
| `ch32v003-em` | CH32V003 + electromagnets (prototype) |
| `xiao-em` | XIAO ESP32-C3 dev board + electromagnets (prototyping) |
| `sim` | Simulated, no physical hardware |

### Σ (Intent) — Current macro-operation

Derived from the coordinator's commands. Not stored per-T, but computed from the active operation.

| Value | Description |
|-------|-------------|
| `steady-state` | Holding position, no active operation |
| `build` | Part of an assembly sequence |
| `absorb-impact` | Participating in projectile phase-shift corridor |
| `reconfigure` | Structure is changing shape |
| `load-test` | Coordinator is probing structural integrity |
| `transport` | Being moved through the fabric to a new position |
| `repair` | Replacing a failed T or restoring a damaged section |

## The Factorization

Same decomposition as code and drones:

```
J = J_structural × J_semantic

J_structural = (σ, κ, χ, λ, τ, ρ)  → FINITE catalog, est. ~100-300 valid patterns
J_semantic   = (ε, δ, Σ)            → Continuous parameterization per-instance
```

The structural catalog is smaller than drones (~200-1,500) which is smaller than code (~2,571). Physics constrains the space more than software does, and structural physics constrains it more than flight physics. Many combinations are invalid (e.g., `free` + `load-critical`, `emergency-lock` + `disassembling`) and never enter the catalog.

## Key Properties (Inherited from Seshat)

### Theorem 9.4 — Blast Radius

When T_i changes state:

```
affected(T_i) = polygon_siblings(T_i) ∪ load_dependents(T_i) ∪ {T_i}
```

For a T with λ = `shared-3` (bridge truss node), the blast radius includes siblings from all 3 polygons. For a T with λ = `owned-1` on a non-load-bearing surface, the blast radius is minimal.

### Δ Classification

- **Δ = 0 (style change)**: Surface appearance, LED color, transition speed. No structural effect, no propagation.
- **Δ ≠ 0 (structural change)**: Connection state, load path, polygon membership. Propagates via blast radius.

### Corridor Mode = Peristaltic Wave

The same catalog pattern handles two use cases:

| Use case | σ | What moves through the fabric |
|----------|---|-------------------------------|
| Self-assembly | `corridor` | A T-piece being routed to a target position |
| Projectile response | `phase-shift` | A void being routed along a ballistic trajectory |

The T-piece doesn't care whether it's making way for a cell or a bullet. It disconnects at time T, reconnects at time T + Δt. The difference is parameterization (δ): assembly uses cell UUID and destination; projectile response uses trajectory vector and velocity.

### Projectile Phase-Shift Timing

The traveling wave disconnects only the T-pieces directly ahead of the projectile and reconnects immediately behind it. At any instant, only 1-2 T's are disconnected:

| Projectile | Speed | Disconnect time per T (60mm) | Gravitational sag |
|-----------|-------|------------------------------|-------------------|
| Nerf bullet | 25 m/s | 2.4ms | 0.028mm |
| Paintball | 90 m/s | 0.67ms | 0.002mm |
| Airsoft | 120 m/s | 0.5ms | 0.001mm |

Electropermanent magnets switch in ~100μs — 20-30x faster than needed. The faster the projectile, the less time any T is disconnected, and the less structural compromise occurs.

For T's where κ = `load-critical` in the projectile path, surrounding T's enter σ = `load-redirect` before the disconnect, establishing temporary alternative load paths for the ~2-5ms window.

## Example: Bridge Truss Node in 9D

A T-piece at the shared edge of 3 triangles in a load-bearing bridge truss:

```json
{
  "σ": "locked",
  "ε": {
    "point_0": { "connected_to": ["T_a"], "strength": 89, "angle": 60 },
    "point_1": { "connected_to": ["T_b"], "strength": 89, "angle": 60 },
    "point_2": { "connected_to": ["T_c", "T_d"], "strength": 89, "angle": 60 },
    "point_3": { "connected_to": ["T_e", "T_f"], "strength": 45, "angle": 0 }
  },
  "δ": {
    "position": [2.1, 0.0, 1.4],
    "orientation": [0, 0, 0, 1],
    "load": [12, 14, 23, 8],
    "power": 0.87,
    "temperature": 22.3,
    "strain": 0.0012
  },
  "κ": "load-critical",
  "χ": "shared-edge",
  "λ": "shared-3",
  "τ": "basic",
  "ρ": "ch32v003-ep",
  "Σ": "steady-state"
}
```

This T is load-critical (κ), shared by 3 polygons (λ), at a polygon boundary (χ), with 2 inter-face connections at Point 2 (ε). Disconnecting it requires the coordinator to first establish alternative load paths through surrounding T's, then negotiate with all 3 owning polygons.

## Cross-Domain Comparison

The same 9D framework, three domains:

| Concept | Code | Drones | T-Pieces |
|---------|------|--------|----------|
| Atom | Function | Drone | T-piece |
| Molecule | Module | Formation | Polygon |
| Organism | Codebase | Swarm | Structure |
| Catalog size | ~2,571 | ~200-1,500 | ~100-300 |
| σ modes | fn, const, class | hover, orbit, translate | locked, corridor, phase-shift |
| ε edges | Call targets | Neighbor drones | Connected T's at 4 points |
| κ constraint | Purity (pure/impure) | Autonomy level | Load criticality |
| χ role | Layer (svc/ctrl/route) | Formation role (leader/relay) | Structural role (vertex/bridge) |
| λ ownership | Borrow/own/lend | Airspace ownership | Polygon co-ownership |
| Blast radius | Callers + callees | Spatial neighbors | Polygon siblings + load chain |
| Corridor/wave | — | — | Cell transport OR void transport |
| γ output | Source code | Motor commands | Magnet activation sequences |
| Generation formula | γ(J, S, L) → code | γ(J, S, L) → flight | γ(J, S, L) → structure |

The compression ratio increases as the physical constraints tighten: code (42.4x) → drones (est. 50-200x) → T-pieces (est. 200-1000x). Fewer degrees of freedom means fewer valid patterns.
