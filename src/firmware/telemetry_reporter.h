/**
 * Seshat Swarm — Telemetry Reporter
 *
 * Serializes onboard SensorState + pattern info into an 18-byte
 * TelemetryPacket for radio uplink to the ground station.
 *
 * Encoding summary (matches TelemetryPacket in types.h):
 *   pos_x/y/z   : float meters  -> int16 millimeters  (float_to_mm)
 *   vel_x/y/z   : float m/s     -> int16 mm/s         (float_to_mm)
 *   battery_pct  : float 0.0-1.0 -> uint8 0-200        (x200)
 *   pos_quality  : float 0.0-1.0 -> uint8 0-255        (x255)
 *   pattern_id   : uint16        -> direct copy
 *   status_flags : uint8         -> direct copy
 *   reserved     : uint8         -> 0
 *
 * Target: STM32F405 (Crazyflie 2.1+), arm-none-eabi-gcc.
 */

#ifndef SESHAT_SWARM_TELEMETRY_REPORTER_H
#define SESHAT_SWARM_TELEMETRY_REPORTER_H

#include "types.h"

/** Sentinel value meaning "no valid pattern loaded." */
#define PATTERN_ID_INVALID  0xFFFFu

/** Size of a serialized TelemetryPacket in bytes. */
#define TELEMETRY_PACKET_SIZE  18u

/* -----------------------------------------------------------------------
 * Public API
 * ----------------------------------------------------------------------- */

/**
 * Pack a SensorState + current pattern info into a TelemetryPacket.
 *
 * Converts floating-point sensor values into the compact integer
 * encodings used by the radio protocol:
 *   - Position/velocity: float meters (m/s) -> int16 millimeters (mm/s)
 *   - Battery: float 0.0-1.0 -> uint8 0-200
 *   - Position quality: float 0.0-1.0 -> uint8 0-255
 *
 * @param state              Current sensor readings.
 * @param current_pattern_id Pattern currently being executed, or
 *                           PATTERN_ID_INVALID if none.
 * @param status_flags       Pre-built TELEM_FLAG_* bitfield.
 * @param out                Destination packet (caller-allocated).
 */
void telemetry_pack(
    const SensorState* state,
    uint16_t current_pattern_id,
    uint8_t status_flags,
    TelemetryPacket* out
);

/**
 * Serialize a TelemetryPacket into a raw byte buffer for radio
 * transmission.
 *
 * The packet is already packed (__attribute__((packed))), so this is
 * a straight memcpy.  Buffer must be at least TELEMETRY_PACKET_SIZE
 * (18) bytes.
 *
 * @param packet   Packed telemetry data.
 * @param buf      Destination byte buffer (caller-allocated).
 * @param buf_len  Size of buf in bytes.
 * @return         Number of bytes written (18), or 0 if buf_len < 18.
 */
uint16_t telemetry_serialize(
    const TelemetryPacket* packet,
    uint8_t* buf,
    uint16_t buf_len
);

/**
 * Build TELEM_FLAG_* status flags from current sensor state.
 *
 * Auto-detects:
 *   - TELEM_FLAG_AIRBORNE       : position.z > 0.05m
 *   - TELEM_FLAG_PATTERN_ACTIVE : current_pattern_id != PATTERN_ID_INVALID
 *   - TELEM_FLAG_EMERGENCY      : low battery flag set AND battery < 0.10
 *   - TELEM_FLAG_LOW_BATTERY    : battery < 0.15
 *
 * Note: TELEM_FLAG_COMM_LOST is NOT set here; it is managed by the
 * radio layer which has visibility into link quality.
 *
 * @param state              Current sensor readings.
 * @param current_pattern_id Pattern currently being executed.
 * @return                   Assembled TELEM_FLAG_* bitfield.
 */
uint8_t telemetry_build_flags(
    const SensorState* state,
    uint16_t current_pattern_id
);

#endif /* SESHAT_SWARM_TELEMETRY_REPORTER_H */
