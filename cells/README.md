# Seshat Cells — Self-Assembling Structural Fabric

## The Vision

A fabric of hundreds of small, identical cells — each with its own microcontroller, edge magnets, and UUID — that can:

- **Connect and disconnect** edges to/from specific neighbor cells on command
- **Self-assemble** by routing free cells to target positions via magnetic guidance (peristaltic transport)
- **Bear weight** through triangulated lattice geometry (no shape-changing needed for structural strength)
- Optionally **change shape** (concave/flat/convex) at the individual cell level for curved structures

Each cell runs the same Seshat 9D behavioral catalog. The coordination math is identical to drone swarms and code translation — finite catalog selection, blast radius propagation, Δ classification.

## Why Octagonal

Not aesthetic. Geometric:

```
    ──────          4 cardinal edges → square tiling (same plane)
   /      \         4 diagonal edges → cross-plane connections
  /        \
 │          │       One cell shape tiles in 2D AND braces in 3D
 │          │       The diagonal connections form triangulated trusses
  \        /        between planes — inherently rigid
   \      /
    ──────
```

An octagonal cell with 8 edges gives you both in-plane tiling (structural sheets) and cross-plane bracing (structural depth). Two layers of octagonal cells connected at their diagonals form a space frame. Space frames are among the strongest weight-bearing structures per unit mass.

## How Self-Assembly Works

Each cell has a UUID. Assembly is addressable:

1. Cell A needs Cell B on its edge 3
2. System computes a path from B to A across the fabric surface
3. Cells along the path enter `corridor` mode (weak guide pulses, don't capture)
4. Cell B slides along the corridor via sequential magnetic attraction
5. Cell A's edge 3 activates `attract` mode
6. Connection made → `locked` (EP magnet holds with ~89N, zero power)

This is packet routing over a physical surface. Multiple cells can transit simultaneously on non-overlapping paths.

## Connection to Seshat Framework

This is the same math as code translation and drone swarms:

| Concept | Code | Drones | Cells |
|---------|------|--------|-------|
| Behavioral catalog | 2,571 code patterns | ~200-1,500 flight patterns | ~30-100 structural patterns |
| Blast radius | Callers + callees | Spatial neighbors | Connected edges + load chain |
| Δ classifier | Style vs semantic edit | Cosmetic vs behavioral change | Surface change vs structural change |
| Style layer | Naming, formatting | Formation feel (smooth/sharp) | Surface appearance, transition speed |
| Generation | γ → source code | γ → motor commands | γ → magnet activation sequences |

## Project Status

**Phase: Research and component exploration.** No cells have been built yet. This folder contains the technical landscape, purchasable components for prototyping, design notes, and use cases.

## Key Files

| File | Purpose |
|------|---------|
| `docs/TECH-LANDSCAPE.md` | Current state of modular robotics research |
| `docs/SHOPPING-LIST.md` | Actual components to buy for prototyping |
| `docs/DESIGN-NOTES.md` | Design considerations for the octagonal cell |
| `docs/USE-CASES.md` | Applications for self-assembling structural fabric |
| `docs/REFERENCES.md` | Papers, projects, and resources |
