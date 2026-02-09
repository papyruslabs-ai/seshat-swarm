# References — Papers, Projects, and Resources

---

## Key Papers

### Modular Robotics

1. **"Tiling Robotics: A New Paradigm of Shape-Morphing Reconfigurable Robots"**
   Samarakoon et al., *Advanced Intelligent Systems*, 2025.
   The formal taxonomy that our system falls into.
   https://advanced.onlinelibrary.wiley.com/doi/10.1002/aisy.202400417

2. **"Hexagonal electrohydraulic modules for rapidly reconfigurable high-speed robots"**
   Yoder et al., *Science Robotics* 9(94), 2024.
   HEXEL — hexagonal shape-changing cells with HASEL actuators and magnetic connections.
   https://www.science.org/doi/10.1126/scirobotics.adl3546

3. **"Modular shape-changing tensegrity-blocks enable self-assembling robotic structures"**
   *Nature Communications* 16:5888, 2025.
   Load-bearing outdoor structures from modular tensegrity blocks.
   https://www.nature.com/articles/s41467-025-60982-0

4. **"PARTS — A 2D Self-Reconfigurable Programmable Mechanical Structure"**
   *MDPI Robotics* 13(5):77, 2024.
   Triangular cells with variable geometry and autonomous topology change.
   https://www.mdpi.com/2218-6581/13/5/77

5. **"Rhombot: Rhombus-shaped Modular Robots for Stable, Medium-Independent Reconfiguration Motion"**
   arXiv, January 2025.
   Single-actuator deformable tiling module.
   https://arxiv.org/html/2601.19529v1

6. **"Decoding modular reconfigurable robots: A survey on mechanisms and design"**
   Liang et al., *International Journal of Robotics Research* 44(5), 2025.
   Comprehensive survey of the field.
   https://journals.sagepub.com/doi/abs/10.1177/02783649241283847

7. **"Programmable Locking Cells (PLC) for Modular Robots with High Stiffness Tunability"**
   Zhou et al., IEEE, 2025.
   Tendon-driven cells with 950% stiffness variation.
   https://hf.co/papers/2509.07916

8. **"Snap inflatable modular metastructures for multipath, multimode morphing machines"**
   Park et al., *Cell Reports Physical Science*, 2025.
   Bistable shells at tile junctions for programmable shape transformations.
   https://www.cell.com/cell-reports-physical-science/fulltext/S2666-3864(25)00047-5

9. **"Self-replicating hierarchical modular robotic swarms"**
   MIT CBA, *Communications Engineering*, 2022.
   Discrete building blocks + mobile assemblers that build copies of themselves.
   https://www.nature.com/articles/s44172-022-00034-3

10. **"FireAntV3: A Modular Self-Reconfigurable Robot Toward Free-Form Self-Assembly"**
    IEEE RA-L, 2023.
    Continuous docks enabling attachment at any orientation.
    https://ieeexplore.ieee.org/document/10168247/

### Shape-Changing Technologies

11. **"Fabric-based cellular pneumatic actuators with programmable shape morphing and high stiffness variation"**
    *Science China*, 2025.
    420× stiffness variation with simultaneous shape morphing.
    https://link.springer.com/article/10.1007/s11431-025-3109-3

12. **"Shape-Morphing Robotics: From Fundamental Principles to Adaptive Machines"**
    Sun et al., *Advanced Intelligent Systems*, 2025.
    Comprehensive review of shape-morphing approaches.
    https://advanced.onlinelibrary.wiley.com/doi/full/10.1002/aisy.202500878

### Structural Electronics / Voxels

13. **"Voxel Invention Kit: Reconfigurable Building Blocks for Prototyping Interactive Electronic Structures"**
    Forman, Smith, Gershenfeld. CHI 2025.
    Aluminum cuboctahedral voxels, 228kg per unit, integrated data/power/force.
    https://dl.acm.org/doi/10.1145/3706598.3713948

14. **"Hierarchical Discrete Lattice Assembly: An Approach for the Digital Fabrication of Scalable Macroscale Structures"**
    MIT CBA, arXiv 2025.
    Scaling discrete lattice construction.
    https://arxiv.org/html/2510.13686

### Swarm Coordination

15. **"Decentralised, Self-Organising Drone Swarms using Coupled Oscillators"**
    Quinn et al., 2025.
    Decentralized swarm formation via coupled oscillators.
    https://hf.co/papers/2505.00442

16. **"FISC: A Fluid-Inspired Framework for Decentralized and Scalable Swarm Control"**
    Kolluri et al., January 2026.
    Treats 1000+ agent swarms as continuum fluid systems.
    https://hf.co/papers/2602.00480

### Simulation and Design

17. **"DittoGym: Learning to Control Soft Shape-Shifting Robots"**
    Huang et al., 2024.
    RL benchmark for reconfigurable soft robots.
    https://hf.co/papers/2401.13231

18. **"SoftZoo: A Soft Robot Co-design Benchmark"**
    Wang et al., 2023.
    Co-design platform for soft robots across diverse environments.
    https://hf.co/papers/2303.09555

---

## Research Labs to Follow

| Lab | Institution | Focus | Link |
|-----|-------------|-------|------|
| **Reconfigurable Robotics Lab** | EPFL | Mori3, origami robotics | epfl.ch/labs/rrl/ |
| **ModLab** | UPenn | SMORES-EP, modular reconfiguration | modlabupenn.org |
| **Center for Bits and Atoms** | MIT | VIK voxels, digital materials | cba.mit.edu |
| **Robotic Systems Lab** | Max Planck | HEXEL, soft robotics | is.mpg.de |
| **Faboratory** | Yale | Robotic fabric, EP magnets, variable stiffness | eng.yale.edu/faboratory/ |
| **BioRob** | EPFL | Roombots, modular self-assembly | epfl.ch/labs/biorob/ |
| **Northwestern Robotics** | Northwestern | FireAnt, self-reconfiguring | robotics.northwestern.edu |
| **Wyss Institute** | Harvard | Kilobots, bioinspired robotics | wyss.harvard.edu |
| **CSAIL** | MIT | M-Blocks, self-assembly | csail.mit.edu |

---

## Open Source Repositories

| Project | Language | What | Link |
|---------|----------|------|------|
| **Mori3** | C++/Arduino | Triangular modular robot firmware | github.com/chbelke/rrl-epfl-mori3 |
| **ESP-Drone** | C (ESP-IDF) | Crazyflie firmware ported to ESP32 | github.com/espressif/esp-drone |
| **Crazyswarm2** | Python/ROS 2 | Swarm coordination for Crazyflies | github.com/IMRCLab/crazyswarm2 |
| **CrazySim** | C++/Gazebo | Crazyflie simulator | github.com/gtfactslab/CrazySim |

---

## Component Suppliers

| Component | Supplier | Notes |
|-----------|----------|-------|
| Custom PCBs (FR4 + Aluminum) | JLCPCB (jlcpcb.com) | Cheapest for prototyping. Aluminum PCBs available. |
| Custom PCBs | PCBWay (pcbway.com) | Good for small quantities, fast turnaround |
| Neodymium magnets | K&J Magnetics (kjmagnetics.com) | Best selection, US-based |
| Neodymium magnets (bulk) | AliExpress | Cheapest for large quantities |
| AlNiCo magnets (for EP) | K&J Magnetics or Amazing Magnets | Fewer suppliers than NdFeB |
| Pogo pins | AliExpress (search "pogo pin connector") | $0.05-0.20 each at quantity |
| ESP32-C3 | AliExpress or Espressif distributor | $2-3 each |
| CAN transceivers | LCSC (lcsc.com) or Mouser | MCP2551 or TJA1050, $0.30-0.50 each |
| Laser cutting | SendCutSend (sendcutsend.com) | Metal + acrylic, US-based, fast |
| Laser cutting | Ponoko (ponoko.com) | Acrylic + wood, design-friendly |
| 3D printing service | JLCPCB 3D printing | SLA/MJF, $2-5 per part |

---

## Books and Background Reading

- **"Programmable Matter" by MIT CBA** — The foundational vision for digital materials
- **"Self-Assembling: Architecture, Design and Computation" by Skylar Tibbits** — MIT's self-assembly pioneer
- **"Modular Robotics" chapter in Springer Handbook of Robotics** — Academic overview
- **"Space Frame Structures" by Murthy** — Structural engineering of the lattice geometry we're building
