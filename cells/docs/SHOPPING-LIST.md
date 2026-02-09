# Shopping List — Prototyping Components

This is a practical list of things you can buy today to start experimenting with the subsystems of a self-assembling structural cell. Organized by subsystem, cheapest-first.

---

## 1. Microcontrollers

The brain of each cell. Needs to be tiny, cheap, and have wireless communication.

### Buy First: ESP32-C3 Super Mini

The best balance of size, cost, compute, and wireless for cell prototyping.

| Attribute | Value |
|-----------|-------|
| Price | **$2-3 each** (AliExpress), ~$6 on Amazon |
| CPU | RISC-V 160MHz |
| Wireless | WiFi + BLE 5.0 |
| GPIO | 13 pins (enough for 8 edge magnets + sensors) |
| Size | 22.5 × 18mm |
| Flash | 4MB |
| RAM | 400KB |
| Power | 3.3V, deep sleep ~5μA |
| USB | USB-C for programming |

**Where to buy:**
- AliExpress: search "ESP32-C3 Super Mini" — ~$2-3/each, ships in 2-3 weeks
- Amazon: search "ESP32-C3 Super Mini" — ~$5-7/each, 2-day shipping
- Buy 10+ to have spares for prototyping

### Alternative: ESP32-S3 (more compute)

If you need more processing power (e.g., running constraint satisfaction on-cell):
- ~$4-5 each on AliExpress
- Dual-core, 240MHz, 512KB RAM
- Same WiFi + BLE

### For Wired Neighbor Communication: MCP2515 CAN Bus Module

CAN bus is the best protocol for cell-to-cell wired communication through edge connectors.

| Attribute | Value |
|-----------|-------|
| Price | **$1-2 each** |
| Protocol | CAN 2.0B, up to 1Mbps |
| Interface | SPI to ESP32 |
| Why | Hot-plug capable, 2-wire, designed for connect/disconnect scenarios |

**Where to buy:**
- AliExpress: search "MCP2515 CAN bus module" — ~$1/each
- Amazon: search "MCP2515 CAN bus module" — ~$3-5 for pack of 2

---

## 2. Magnets and Connection Mechanisms

The most important subsystem. Start with permanent magnets to understand attraction/alignment, then move to switchable electromagnets, then to EP magnets.

### Phase A: Permanent Magnets (Learn Attraction + Alignment)

Start here. Cheap, no electronics needed, teaches you how magnetic self-assembly feels.

**Neodymium Disc Magnets (N52, 6mm × 2mm)**
- Price: **$8-12 for 100 pieces**
- Where: Amazon — search "6mm x 2mm neodymium magnets N52"
- Use: Embed in cell edges to understand attractive force, alignment, and tiling
- Key learning: How much force at what distance? How does alignment work? What happens when two cells approach each other?

**Neodymium Ring Magnets (6mm OD × 3mm ID × 2mm)**
- Price: **$10-15 for 50 pieces**
- Where: Amazon — search "6mm ring neodymium magnets"
- Use: Ring magnets can be oriented for axial or diametric magnetization — useful for rotational alignment

**Magnetic Connector Pogo Pins (spring-loaded)**
- Price: **$15-25 for 50 pairs**
- Where: Amazon — search "magnetic pogo pin connector" or "spring loaded magnetic connector"
- Use: These carry both magnetic attraction AND electrical signals through the same connection point. Exactly what cell edges need. Used in laptop chargers, smartwatch chargers.

### Phase B: Electromagnets (Learn Switchable Attraction)

Add the ability to turn attraction on/off.

**Small Electromagnets (5V, 10mm diameter, ~2.5N holding force)**
- Price: **$2-4 each**, ~$15 for pack of 5
- Where: Amazon — search "5V mini electromagnet 10mm" or "micro electromagnet solenoid"
- Use: Wire to ESP32 GPIO via MOSFET. Turn on/off programmatically.
- Key learning: Response time, power consumption, holding force vs. distance

**N-Channel MOSFETs (IRLZ44N or similar, for switching electromagnet current)**
- Price: **$6-8 for pack of 10**
- Where: Amazon — search "IRLZ44N MOSFET"
- Use: ESP32 GPIO can't drive an electromagnet directly. MOSFET switches the current.

**Flyback Diodes (1N4007)**
- Price: **$3 for 100 pieces**
- Where: Amazon — search "1N4007 diode"
- Use: Protect MOSFET from electromagnet back-EMF when switching off. Essential.

### Phase C: Electropermanent (EP) Magnets (The Real Thing)

EP magnets are the target connection mechanism: pulse to switch on/off, zero power to hold. You can't buy these off the shelf, but you can build them.

**Components for DIY EP Magnets:**

| Component | What | Price | Where |
|-----------|------|-------|-------|
| AlNiCo 5 rod magnets (6mm × 25mm) | The switchable element | ~$1-2 each | Amazon: "AlNiCo 5 rod magnet" or K&J Magnetics |
| NdFeB disc magnets (6mm × 3mm) | The permanent bias element | ~$0.10 each | Same neodymium magnets from Phase A |
| Soft iron cores (6mm diameter rod) | Flux guide | ~$5-10 for 1 meter of round bar | Amazon: "soft iron rod 6mm" or local metalworking supplier |
| Magnet wire (26-30 AWG) | Coil winding | ~$8-12 per spool | Amazon: "magnet wire 28 AWG" |
| H-Bridge driver (L293D or DRV8833) | Current pulse in either direction | ~$2-5 each | Amazon: "L293D motor driver" or "DRV8833 breakout" |

**How EP magnets work:**
1. AlNiCo rod + NdFeB disc + soft iron core wrapped in a coil
2. Pulse current one direction → AlNiCo magnetizes → combined field holds (89N in SMORES-EP)
3. Pulse current other direction → AlNiCo demagnetizes → no field → releases
4. Zero power in either state (hold or release)

**Key reference:** The SMORES-EP papers from UPenn ModLab describe the exact construction. Search for "Electropermanent Magnets for SMORES" for diagrams and specifications.

---

## 3. Structural / Cell Body

### For Rapid Prototyping: 3D Printing

If you have a 3D printer (or access to one):
- Print octagonal cell frames in PLA or PETG
- Design magnet pockets on all 8 edges
- Design PCB mounting points in the center
- Cost: ~$0.30-0.50 per cell in filament

If you don't have a printer:
- **JLCPCB 3D printing service** — upload STL, get parts shipped. ~$2-5 per part for small quantities.
- **PCBWay 3D printing** — similar service and pricing.

### For Structural Prototyping: Aluminum PCBs

For load-bearing tests, use aluminum-core PCBs as the cell body (like MIT VIK):
- **JLCPCB aluminum PCBs** — $2-5 per board at quantity 5-10
- Design the PCB as an octagonal shape with pads for EP magnets on all 8 edges
- The aluminum substrate provides structural rigidity AND is the electrical ground plane
- Order at jlcpcb.com — upload Gerber files, select "Aluminum" substrate

### For Playing With Tiling: Laser-Cut Acrylic

Cheap, fast way to test tiling geometry:
- **Ponoko** or **SendCutSend** — upload SVG/DXF, get laser-cut acrylic shipped
- Cut octagonal tiles with edge slots for magnets
- ~$20-40 for a sheet of 20-50 tiles
- Great for understanding how octagonal tiling works in practice before adding electronics

---

## 4. Sensors

### Hall Effect Sensors (Detect Magnetic Connection)

Know when an edge connection is made — the hall sensor detects the neighbor's magnet.

- **A3144 Hall Effect Sensor (digital, latching)**
  - Price: **$5-8 for 20 pieces**
  - Where: Amazon — search "A3144 hall effect sensor"
  - Use: Goes on each edge. Outputs HIGH when a magnet is nearby = neighbor connected.
  - 8 sensors per cell (one per edge) = $2-3 per cell

- **AH49E Hall Effect Sensor (analog, linear)**
  - Price: **$6-10 for 20 pieces**
  - Where: Amazon — search "AH49E hall effect sensor"
  - Use: Analog output proportional to field strength. Can detect how close a neighbor is, not just present/absent. Useful for guiding approaching cells.

### Strain Gauges (Detect Load)

Know when a cell is bearing weight.

- **HX711 Load Cell Amplifier + strain gauges**
  - Price: **$3-5 for HX711 module** + **$5-10 for pack of strain gauges**
  - Where: Amazon — search "HX711 load cell amplifier" and "strain gauge 120 ohm"
  - Use: Measure stress on cell body. Detect load-bearing state.

### Current Sensors (Monitor Power)

- **INA219 I2C Current Sensor**
  - Price: **$3-5 each**
  - Where: Amazon — search "INA219 current sensor module"
  - Use: Monitor power consumption per cell, detect EP magnet switching events

---

## 5. Power

### Small LiPo Batteries

- **3.7V 150mAh LiPo** (fits inside a ~40mm cell)
  - Price: **$8-12 for pack of 5**
  - Where: Amazon — search "3.7V 150mAh LiPo battery JST"
  - Runtime: Hours in standby (ESP32-C3 deep sleep), minutes during active magnet switching

- **3.7V 500mAh LiPo** (for larger prototype cells)
  - Price: **$10-15 for pack of 4**
  - Where: Amazon — search "3.7V 500mAh LiPo battery"

### Charging

- **TP4056 USB-C LiPo Charger Module**
  - Price: **$6-8 for pack of 10**
  - Where: Amazon — search "TP4056 USB-C charger module"
  - Use: One per cell. Enables charging via USB or through-connector power sharing.

### Voltage Regulation

- **3.3V LDO Regulator (AMS1117-3.3)**
  - Price: **$4-6 for pack of 20**
  - Where: Amazon — search "AMS1117-3.3 regulator module"
  - Use: Regulate LiPo (3.7-4.2V) to 3.3V for ESP32-C3

---

## 6. Existing Kits and Systems to Learn From

These won't become your cells, but they teach relevant concepts.

### Cubelets (Modular Robotics Inc.)

Magnetic modular robot blocks — sense, think, act.

- Price: **$43-56 per cube**, kits $199-$500+
- Where: Amazon — search "Cubelets robot blocks"
- Why: Experience what magnetic modular connection feels like. Understand the tactile feel of snap-together modular robots. The magnet placement and polarity design is well-executed.
- Limitation: Not programmable at firmware level, not structural

### Buckminster Fuller / Tensegrity Kits

Understand space frames and tensegrity structures before building them from cells.

- **Zometool Creator Kit**
  - Price: **$60-90**
  - Where: Amazon — search "Zometool creator kit"
  - Why: Build space frames, understand how triangulated lattices carry load. The octahedral/cuboctahedral geometries you'll use are buildable in Zometool.

- **DIY Tensegrity Kit**
  - Price: **$15-25**
  - Where: Amazon — search "tensegrity model kit"
  - Why: Understand tension vs. compression members. Relevant if your cells use cable-tension for shape-changing later.

### Magna-Tiles / Picasso Tiles

Magnetic flat tiles that snap together — surprisingly relevant for understanding 2D→3D folding.

- Price: **$30-60 for 100-piece set**
- Where: Amazon — search "Picasso Tiles 100 piece"
- Why: They tile in 2D and fold into 3D. The magnetic edge connection is the same principle (simpler magnets, but same idea). Great for spatial intuition about what shapes 2D tiles can form when folded.

---

## 7. Development Tools

### For PCB Design

- **KiCad** (free, open source) — design your octagonal cell PCB
  - Download: kicad.org
  - Learning: YouTube "KiCad ESP32 tutorial"

### For 3D Modeling

- **FreeCAD** or **Fusion 360** (free for personal use) — design cell body
  - Fusion 360 is better but requires Autodesk account
  - FreeCAD is fully open source

### For Firmware

- **PlatformIO** (VSCode extension) — ESP32 development
  - Install in VSCode, create ESP32-C3 project
  - Supports Arduino framework and ESP-IDF

- **ESP-NOW** — Espressif's peer-to-peer protocol
  - Low latency, no WiFi router needed
  - Perfect for cell-to-cell communication during prototyping
  - Built into ESP32, no extra hardware

### For Simulation

- **Gazebo** (robotic simulation) — test coordination algorithms before building
- **Matter.js** or **Box2D** (2D physics) — lighter weight, test tiling and magnetic attraction in 2D
- **Three.js** (web 3D) — visualize cell fabric in browser

---

## Starter Budget Options

### Bare Minimum (~$50): Magnets + Tiles + Spatial Intuition

| Item | Price |
|------|-------|
| Neodymium disc magnets (100pc) | $10 |
| Picasso Tiles 60pc set | $25 |
| Laser-cut acrylic octagons (DIY or Ponoko) | $15 |
| **Total** | **~$50** |

Play with tiling, magnetic attraction, and 2D→3D folding. No electronics yet.

### First Electronic Prototype (~$150): One Programmable Cell

| Item | Price |
|------|-------|
| ESP32-C3 Super Mini (5x) | $15 |
| Neodymium disc magnets (100pc) | $10 |
| Mini electromagnets (5x) | $15 |
| MOSFETs + flyback diodes | $10 |
| Hall effect sensors (20x) | $8 |
| LiPo 150mAh (5x) | $10 |
| TP4056 chargers (10x) | $7 |
| 3D printed cell body (if you have a printer) | $2 |
| Breadboard + jumper wires | $10 |
| Soldering iron (if you don't have one) | $25 |
| **Total** | **~$115-150** |

Build ONE cell with switchable electromagnets on a few edges, hall sensors for neighbor detection, and wireless communication. Prove: "this ESP32 can detect when a magnet approaches edge 3 and activate edge 5 in response."

### First Multi-Cell Test (~$300-400): 5-8 Cells Tiling

| Item | Price |
|------|-------|
| Everything from above (×5-8 cells) | $200-250 |
| Custom PCB order from JLCPCB (10 boards) | $20-40 |
| CAN bus modules (10x) | $15 |
| Additional magnets and sensors | $30-50 |
| **Total** | **~$300-400** |

Build 5-8 cells that tile, communicate with neighbors, and demonstrate coordinated magnet switching. Prove: "cell A can request cell B, and the path clears to let B travel to A."

### EP Magnet Experiment (~$100 add-on): Switchable Hold

| Item | Price |
|------|-------|
| AlNiCo 5 rod magnets (20x) | $20-30 |
| Soft iron rod (1 meter) | $8 |
| Magnet wire 28 AWG (1 spool) | $10 |
| H-Bridge drivers DRV8833 (5x) | $15 |
| Additional NdFeB magnets | $10 |
| **Total** | **~$65-100** |

Build 2-3 EP magnets, test pulse-to-switch and zero-power hold. Prove: "I can hold 5+ kg with zero continuous power, and release with a current pulse."
