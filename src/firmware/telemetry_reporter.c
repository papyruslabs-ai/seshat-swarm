/**
 * Seshat Swarm — Telemetry Reporter Implementation
 *
 * Packs the drone's current SensorState and active pattern into a
 * compact 18-byte TelemetryPacket for radio uplink to the ground
 * station coordinator.
 *
 * The encoding trades precision for bandwidth:
 *   - Position : ±32.767 m at 1 mm resolution  (int16 millimeters)
 *   - Velocity : ±32.767 m/s at 1 mm/s resolution
 *   - Battery  : 0.0–1.0 at 0.5% resolution    (uint8 × 200)
 *   - Quality  : 0.0–1.0 at ~0.4% resolution    (uint8 × 255)
 *
 * This is more than sufficient for indoor Crazyflie operations where
 * the Lighthouse system provides sub-mm positioning.
 *
 * Target: STM32F405 (Crazyflie 2.1+), arm-none-eabi-gcc.
 */

#include "telemetry_reporter.h"
#include <string.h>  /* memcpy */

/* -----------------------------------------------------------------------
 * Internal helpers
 * ----------------------------------------------------------------------- */

/**
 * Clamp a float to [lo, hi].
 */
static inline float clampf(float val, float lo, float hi) {
    if (val < lo) return lo;
    if (val > hi) return hi;
    return val;
}

/* -----------------------------------------------------------------------
 * telemetry_pack
 * ----------------------------------------------------------------------- */

void telemetry_pack(
    const SensorState* state,
    uint16_t current_pattern_id,
    uint8_t status_flags,
    TelemetryPacket* out)
{
    /* Position: float meters -> int16 millimeters.
     * float_to_mm() (from types.h) clamps to ±32.767m and scales ×1000. */
    out->pos_x = float_to_mm(state->position.x);
    out->pos_y = float_to_mm(state->position.y);
    out->pos_z = float_to_mm(state->position.z);

    /* Velocity: float m/s -> int16 mm/s.  Same encoding as position. */
    out->vel_x = float_to_mm(state->velocity.x);
    out->vel_y = float_to_mm(state->velocity.y);
    out->vel_z = float_to_mm(state->velocity.z);

    /* Battery: float 0.0–1.0 -> uint8 0–200.
     * The ×200 encoding gives 0.5% resolution, which is plenty for
     * flight-time estimation. */
    float batt_scaled = clampf(state->battery_pct * 200.0f, 0.0f, 200.0f);
    out->battery_pct = (uint8_t)batt_scaled;

    /* Pattern ID: direct copy. */
    out->pattern_id = current_pattern_id;

    /* Status flags: direct copy.  Built by telemetry_build_flags()
     * or assembled manually by the caller. */
    out->status_flags = status_flags;

    /* Position quality: float 0.0–1.0 -> uint8 0–255. */
    float qual_scaled = clampf(state->pos_quality * 255.0f, 0.0f, 255.0f);
    out->pos_quality = (uint8_t)qual_scaled;

    /* Reserved byte — zero for forward compatibility. */
    out->reserved = 0;
}

/* -----------------------------------------------------------------------
 * telemetry_serialize
 * ----------------------------------------------------------------------- */

uint16_t telemetry_serialize(
    const TelemetryPacket* packet,
    uint8_t* buf,
    uint16_t buf_len)
{
    /* Guard: caller must provide at least 18 bytes. */
    if (buf_len < TELEMETRY_PACKET_SIZE) {
        return 0;
    }

    /* TelemetryPacket is __attribute__((packed)), so a straight memcpy
     * produces the correct wire format with no padding surprises. */
    memcpy(buf, packet, TELEMETRY_PACKET_SIZE);

    return TELEMETRY_PACKET_SIZE;
}

/* -----------------------------------------------------------------------
 * telemetry_build_flags
 * ----------------------------------------------------------------------- */

uint8_t telemetry_build_flags(
    const SensorState* state,
    uint16_t current_pattern_id)
{
    uint8_t flags = 0;

    /* Bit 0 — AIRBORNE: position.z above the ground threshold (5 cm).
     * This avoids false positives from sensor noise when the drone is
     * sitting on the pad. */
    if (state->position.z > 0.05f) {
        flags |= TELEM_FLAG_AIRBORNE;
    }

    /* Bit 1 — PATTERN_ACTIVE: a valid pattern is loaded.
     * PATTERN_ID_INVALID (0xFFFF) is the sentinel for "no pattern." */
    if (current_pattern_id != PATTERN_ID_INVALID) {
        flags |= TELEM_FLAG_PATTERN_ACTIVE;
    }

    /* Bit 2 — EMERGENCY: firmware has already flagged low battery AND
     * we've crossed the critical 10% threshold.  This is the "land
     * immediately" signal. */
    if ((state->flags & SENSOR_FLAG_LOW_BATTERY) &&
        (state->battery_pct < 0.10f)) {
        flags |= TELEM_FLAG_EMERGENCY;
    }

    /* Bit 3 — LOW_BATTERY: early warning at 15%.  Gives the ground
     * station time to plan an orderly role-reassignment before the
     * drone must land. */
    if (state->battery_pct < 0.15f) {
        flags |= TELEM_FLAG_LOW_BATTERY;
    }

    /* Bit 4 — COMM_LOST: intentionally NOT set here.
     * Communication loss is detected by the radio layer, which tracks
     * round-trip acknowledgments.  The radio layer ORs this flag in
     * before the packet is queued for transmission. */

    return flags;
}
