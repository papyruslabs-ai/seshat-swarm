# Technology Landscape — Modular Robotics and Programmable Matter

Survey of the closest existing systems and technologies, with relevance to our self-assembling structural cell fabric.

---

## Closest Existing Systems

### Tier 1: Directly Relevant

#### Mori3 (EPFL Reconfigurable Robotics Lab)

Triangular modules that tile, connect at edges, and fold from 2D into 3D. Each has onboard compute. 70mm wide, 6mm thick, 26g. Demonstrated walking, rolling, gripping.

- **What we learn:** Polygon tiling + edge connection + onboard compute is viable at 26g. The 2D→3D folding concept works.
- **Gap:** Too thin for load-bearing. Only 3 edges (triangular).
- **Open source:** github.com/chbelke/rrl-epfl-mori3
- **Paper:** Published in Nature Machine Intelligence
- **Link:** https://www.epfl.ch/labs/rrl/research-2/research-origami/mori/

#### HEXEL (Max Planck Institute, 2024)

Hexagonal modules with HASEL artificial muscles. 49% contraction per cell. Magnetic edge connections carry mechanical AND electrical signals. Published in Science Robotics September 2024.

- **What we learn:** Shape-changing hexagonal cells with magnetic edge connections work. HASEL actuators are fast (15.8 Hz) and self-healing.
- **Gap:** Only 6 modules demonstrated. Tethered (no onboard compute). Hexagonal (6 edges, not 8).
- **Paper:** Science Robotics 9(94), 2024
- **Link:** https://is.mpg.de/news/hexagonal-electrohydraulic-modules-shape-shift-into-versatile-robots

#### SMORES-EP (UPenn ModLab)

Modular robots with electropermanent magnet connections. 89N hold force, zero standby power. 4 connectable faces. Ongoing 2025 work on vision-based autonomous reconfiguration.

- **What we learn:** EP magnets are the right connection mechanism. 89N hold at zero power is proven. The EP magnet design is published and reproducible.
- **Gap:** Cubic (4 faces, not 8 edges). Not designed for tiling.
- **Link:** https://www.modlabupenn.org/smores-ep/

#### MIT VIK — Voxel Invention Kit (MIT CBA + Media Lab, 2025)

Aluminum cuboctahedral lattice voxels. 25mm unit size. Single voxel supports 228kg. Snap-fit connections carry data + power + mechanical force. NOT commercially available — research prototype only. Design files available in CHI 2025 paper supplementary materials.

- **What we learn:** Structural lattices from small cells CAN bear enormous load. The structural electronics concept (connection IS the data/power bus) is proven. ~$0.50/voxel manufacturing cost at MIT facilities.
- **Gap:** Passive structure (assembled by external robots, not self-reconfiguring). Snap-fit (not switchable magnets). Not available for purchase.
- **Paper:** CHI 2025: https://dl.acm.org/doi/10.1145/3706598.3713948

#### Tensegrity Blocks (Dartmouth/Rutgers/Yale, 2025)

Modular tensegrity blocks that self-assemble into bridges, shelters, and tools outdoors. Shape change via adjustable cable tension. Battery + WiFi per module. 8 rigid rods per block.

- **What we learn:** Modular robots CAN form load-bearing structures in real outdoor environments. Tensegrity approach (rigid rods + variable-tension cables) enables both shape change and structural rigidity.
- **Gap:** Not tiling geometry. Slower reconfiguration.
- **Paper:** Nature Communications 16:5888, 2025
- **Link:** https://www.nature.com/articles/s41467-025-60982-0

### Tier 2: Useful Concepts

#### M-Blocks 2.0 (MIT CSAIL)

5cm cubes that self-assemble using flywheel momentum transfer and permanent magnets. Barcode-based visual ID between neighbors. ~16 modules demonstrated.

- **What we learn:** Self-assembly via momentum + magnets works. Neighbor identification via visual barcodes is a simple approach.
- **Gap:** No shape-changing. Permanent magnets (not switchable). Noisy flywheel actuation.

#### Kilobots (Harvard Wyss Institute)

1,024 coin-sized robots forming complex 2D shapes using only local IR communication. $14/unit.

- **What we learn:** Large-scale swarm self-assembly (1000+ units) is economically feasible. Local-only communication is sufficient for global shape formation. $14/unit cost proves the economics.
- **Gap:** No physical connections. No shape-changing. No load-bearing. Just positioning.

#### FireAntV3 (Northwestern, 2023)

"Continuous docks" — modules attach anywhere at any orientation using electrostatic adhesion. 3D structures demonstrated.

- **What we learn:** Freeform attachment (not just edge-to-edge) is possible. The tradeoff: more flexible but harder to control and coordinate.

#### PARTS (2024)

Planar Adaptive Robot with Triangular Structure. Triangular cells with variable edge lengths. Both topology change AND continuous deformation. 9 fabricated modules, 62 simulated.

- **What we learn:** 2D tiling with individual cell shape change AND topology reconfiguration is demonstrated. Closest to our octagonal concept in terms of capability.
- **Paper:** MDPI Robotics 13(5):77, 2024
- **Link:** https://www.mdpi.com/2218-6581/13/5/77

#### Rhombot (2025)

Rhombus-shaped modules with single-actuator expansion/contraction. "Morphpivoting" motion. 2D lattice + chain hybrid.

- **What we learn:** A single-actuator deformable tiling module is feasible and can both tile and locomote.
- **Paper:** arXiv, January 2025: https://arxiv.org/html/2601.19529v1

---

## Key Technologies

### Electropermanent (EP) Magnets

The critical technology for switchable, zero-power-hold connections.

**How they work:**
- Combine an AlNiCo magnet (easily switchable) with a NdFeB magnet (strong, permanent)
- Wrapped around a soft iron core with a coil
- Pulse current one way → AlNiCo aligns with NdFeB → combined strong field → HOLD
- Pulse current other way → AlNiCo opposes NdFeB → fields cancel → RELEASE
- Zero power in either state

**Performance (from SMORES-EP):**
- Hold force: 89N (~9kg)
- Switch time: <100ms
- Standby power: 0W
- Pulse energy: ~1J per switch

**Key reference:** Search "Electropermanent Magnets for Modular Robotics" for UPenn ModLab construction details.

### HASEL Actuators

Hydraulically Amplified Self-healing Electrostatic actuators. Leading candidate for cell shape-changing.

- 49% contraction demonstrated (HEXEL)
- 15.8 Hz bandwidth (fast enough for real-time)
- 122 W/kg specific power
- Self-healing: if punctured, dielectric fluid redistributes
- Voltage-driven (no moving mechanical parts)

### Particle/Layer Jamming

For switching between soft (shape-changeable) and rigid (load-bearing) states.

- Up to 420× stiffness variation (fabric-based, 2025)
- Granular jamming: 344% stiffness increase
- Layer jamming combined with particle jamming: 1.5× higher than particle alone
- Mechanism: apply vacuum → particles/layers lock → rigid. Release vacuum → soft.

### Shape-Memory Alloys (SMA)

For holding shape without power.

- 10g SMA fabric swatch can lift 10kg (Korea, 2024-2025)
- Up to 200 Hz actuation at high-frequency variants
- Holds shape without continuous power (like EP magnets hold without power)
- Now being woven into fabric-like structures at industrial scale

### CAN Bus

For wired cell-to-cell communication through edge connectors.

- Designed for hot-plug (connect/disconnect while running)
- Differential 2-wire, robust to noise
- Up to 1Mbps (CAN 2.0) or 8Mbps (CAN FD)
- Used in automotive (proven in harsh, vibrating environments)
- Daisy-chain topology matches cell edge-to-edge connectivity

---

## Formal Framework

The academic field now has a name for what we're building:

**"Tiling Robotics"** — defined by Samarakoon et al. (Advanced Intelligent Systems, 2025) as polyform-inspired reconfigurable robots that transform between polymorphic shapes using translation and rotation operations.

Our octagonal cell fabric is a tiling robot with:
- Individual cell actuation (shape-changing if added)
- Addressable edge connections (EP magnets)
- Self-assembly via peristaltic magnetic transport
- Load-bearing structural capability
- Finite behavioral catalog coordination (novel — our contribution)

**Key survey paper:** "Tiling Robotics: A New Paradigm of Shape-Morphing Reconfigurable Robots" — Advanced Intelligent Systems, 2025.

---

## What Nobody Has Done

The specific combination we're targeting does not exist yet:

1. Octagonal geometry with 8 connectable edges → **not demonstrated**
2. EP magnet connections on a tiling robot → **not demonstrated** (SMORES-EP uses EP magnets but isn't a tiling robot)
3. Self-assembly via peristaltic magnetic transport across a cell surface → **not demonstrated**
4. Finite behavioral catalog coordination (Seshat 9D) for modular robots → **novel**
5. Load-bearing + self-reconfiguring + individually addressable cells → **gap between VIK (load-bearing but not self-reconfiguring) and everything else (self-reconfiguring but not load-bearing)**

Every individual capability is proven. The integration is the contribution.
