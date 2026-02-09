# Design Notes — Octagonal Cell

Working notes on design decisions and considerations for the cell hardware.

---

## Geometry: Why Octagonal, Precisely

An octagon with 8 edges, oriented with flats on cardinal axes:

```
    ────────
   /        \
  /          \
 │            │
 │            │
  \          /
   \        /
    ────────
```

**Cardinal edges (4):** top, bottom, left, right → connect to neighbors in the same plane. These form a square tiling pattern. Every cell has 4 in-plane neighbors.

**Diagonal edges (4):** NE, NW, SE, SW → connect to cells in adjacent planes (above/below). When layers are stacked with a half-cell offset, the diagonals become cross-bracing between planes.

**Result:** One cell geometry produces a space frame — one of the strongest known lattice structures per unit mass. No shape-changing required for structural strength. The triangulation from diagonal connections provides inherent rigidity.

### Tiling Properties

Regular octagons don't tile alone — they produce small square gaps. Options:

1. **Octagon + square tiling (truncated square tiling):** Accept the square gaps. They become joint spaces where connections between planes are made. Could even be small "joint cells" with a different form factor.

2. **Irregular octagon:** Adjust angles so the octagon tiles without gaps. Sacrifices regular geometry but simplifies manufacturing.

3. **Square with 8 connection points:** A square cell with connections on all 4 edges AND all 4 corners. Simpler to manufacture. Tiles perfectly. The "corners" become the diagonal/cross-plane connections. This might be the most practical v1.

**Recommendation for v1:** Start with a square cell body that has 8 EP magnet connection points (4 edges + 4 corners). This tiles trivially, is easy to 3D print and PCB-manufacture, and provides the same 8-connectivity topology. Graduate to true octagonal geometry in v2 if the corner connections prove awkward.

---

## Edge Connection Design

Each edge needs:
1. **EP magnet** — switchable attraction, zero-power hold
2. **Electrical contacts** — power sharing + CAN bus data (2-4 pogo pins)
3. **Alignment feature** — ensures cells connect in the correct orientation
4. **Hall effect sensor** — detects approaching cell / connection status

### Connection Sequence

```
1. DETECT    → Hall sensor detects approaching cell's permanent magnet bias
2. IDENTIFY  → Brief CAN handshake through pogo pins once contact is made
3. LOCK      → EP magnet pulse → hold at 89N, zero power
4. CONFIRM   → Hall sensor reads full-strength field, CAN link stable
5. JOINED    → Cell pair now shares power bus and data link
```

### Disconnection Sequence

```
1. NEGOTIATE → Both cells agree to disconnect (or one cell forces emergency release)
2. RELEASE   → EP magnet reverse pulse → field cancels → cells free
3. SEPARATE  → If self-assembling, corridor cells guide the departing cell away
4. CONFIRM   → Hall sensor reads no field, CAN link dropped
```

### Pogo Pin Layout (Per Edge)

```
[GND] [CAN_H] [CAN_L] [V+]
```

4 spring-loaded pogo pins per edge, mating with 4 flat pads on the neighbor's corresponding edge. Pogo pins handle misalignment up to ~1mm, which is within magnetic self-centering range.

With 8 edges × 4 pins = 32 pins per cell. Each pin is ~$0.10-0.20 at volume. ~$3-6 per cell for connection hardware.

---

## Power Architecture

### Per-Cell Battery

- Small LiPo (3.7V, 150-300mAh)
- Enough for hours of standby, minutes of active magnet switching
- TP4056 charger IC on the cell PCB

### Through-Connector Power Sharing

When cells connect, V+ and GND are shared through pogo pins. This creates a power mesh:
- Any cell connected to an external power source powers its neighbors
- Neighbors power their neighbors
- The entire connected fabric shares power

**Protection needed:**
- Reverse polarity protection (Schottky diode or MOSFET)
- Overcurrent protection (polyfuse per edge)
- Voltage regulation per cell (LDO from bus voltage to 3.3V for ESP32)

### Power Budget Per Cell

| State | Current (est.) | Duration |
|-------|---------------|----------|
| Deep sleep | ~5μA | Hours |
| Idle (WiFi off, listening CAN) | ~20mA | Normal operation |
| Active (WiFi on, sensors reading) | ~80mA | During coordination |
| EP magnet pulse | ~500mA-1A | <100ms per switch |
| Electromagnet hold (non-EP, for prototyping) | ~200mA | Continuous — this is why EP is better |

At 150mAh battery and 20mA idle: ~7.5 hours standalone. With power sharing, indefinite.

---

## Communication Architecture

### Layer 1: CAN Bus (Neighbor-to-Neighbor)

- Through edge pogo pins
- Each edge is a separate CAN bus segment
- Cell acts as a CAN bridge between its 8 edges
- Latency: <1ms per hop
- Bandwidth: 1Mbps per link

### Layer 2: ESP-NOW or BLE Mesh (Broadcast / System-Wide)

- Wireless, for coordination messages that need to reach non-connected cells
- ESP-NOW: 250 bytes/packet, <1ms latency, no router needed
- BLE Mesh: standard protocol, more devices, higher latency

### Addressing

- Each cell has a UUID (burned into ESP32 at manufacturing)
- CAN messages addressed to specific UUIDs
- Routing: cells maintain a neighbor table (which UUID is on which edge)
- Multi-hop routing: cell A sends message to cell B via cells C, D, E (each forwarding on the appropriate edge CAN bus)

This is standard mesh networking adapted to the physical cell topology. The ε dimension in the 9D space IS the routing table.

---

## Cell PCB Layout (Conceptual)

```
         EP+Hall  Pogo×4  EP+Hall
            │      │ │      │
    ────────┴──────┴─┴──────┴────────
   /    EP+Hall                EP+Hall\
  /        │                      │    \
 │  Pogo×4─┤                    ├─Pogo×4│
 │         │    ┌──────────┐    │      │
 │         │    │ ESP32-C3 │    │      │
 │         │    │   CAN    │    │      │
 │  Pogo×4─┤    │  LiPo    │    ├─Pogo×4│
  \        │    │  TP4056  │    │    /
   \    EP+Hall └──────────┘ EP+Hall/
    ────────┬──────┬─┬──────┬────────
            │      │ │      │
         EP+Hall  Pogo×4  EP+Hall
```

Center: ESP32-C3 + CAN transceiver + LiPo + charger + voltage regulator
Edges: 8× (EP magnet + Hall sensor + 4 pogo pins)

**Estimated PCB size:** 50-60mm across (octagonal or square with corner connections)
**Estimated thickness:** 10-15mm (PCB + LiPo + magnets)
**Estimated weight:** 20-40g per cell

---

## Firmware Architecture

Each cell runs the same firmware. Behavior is determined by catalog pattern selection.

```
Main Loop (100Hz):
  1. Read all 8 hall sensors → who is nearby / connected
  2. Read CAN messages from all connected edges → neighbor state
  3. Update local ε (edge connectivity map)
  4. Check for pattern assignment from coordinator (via CAN or wireless)
  5. Execute current pattern:
     - locked: do nothing (zero power hold)
     - corridor: pulse guide magnets in sequence for transiting cell
     - attracting: hold target edge EP magnet active
     - idle: all magnets off
  6. Report telemetry (battery, connections, load) to coordinator
```

The coordinator (laptop or a designated "brain cell") runs the constraint satisfaction engine and sends pattern assignments. Individual cells are generators — they receive pattern IDs and execute.

---

## Open Design Questions

1. **Square body with 8 connection points vs. true octagonal body?** Square is easier to manufacture and tiles perfectly. Octagonal is geometrically cleaner for diagonal connections.

2. **How many EP magnets per edge?** One centered EP magnet per edge for hold + one permanent magnet for passive alignment? Or multiple smaller EP magnets for variable grip strength?

3. **Pogo pin vs. flat spring contact?** Pogo pins are more reliable but taller (add thickness). Flat spring contacts are thinner but less tolerant of misalignment.

4. **CAN bus topology:** One CAN bus per edge (8 buses per cell, full isolation) or shared bus with edge addressing? Isolated is simpler but needs 8 CAN transceivers. Shared is cheaper but risks bus contention.

5. **Coordinator placement:** External laptop? Or a designated "brain cell" in the fabric that runs coordination? Or fully distributed (each cell runs partial constraint satisfaction with neighbors)?
