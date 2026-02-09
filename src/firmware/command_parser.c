/**
 * Seshat Swarm — Command Parser Implementation
 *
 * Deserializes raw radio packets into GroundCommand structs.
 * The packet wire format matches the packed GroundCommand struct
 * byte-for-byte (little-endian, which matches ARM's native byte order).
 *
 * Safety:
 *   - All inputs are NULL-checked before use.
 *   - Length is validated before any memory access.
 *   - memcpy is used instead of pointer casts to avoid ARM alignment faults.
 *   - On any failure, the output struct is zero-filled and 0 is returned.
 *
 * Target: STM32F405 (Crazyflie 2.1+), compiled with arm-none-eabi-gcc.
 */

#include "command_parser.h"
#include "types.h"
#include <string.h>
#include <stdint.h>

/* Expected packet size — must match sizeof(GroundCommand) exactly. */
#define COMMAND_PACKET_SIZE ((uint16_t)sizeof(GroundCommand))

int command_parse(const uint8_t* raw, uint16_t len, GroundCommand* out)
{
    /* Reject NULL pointers immediately. */
    if (raw == NULL || out == NULL) {
        if (out != NULL) {
            memset(out, 0, sizeof(GroundCommand));
        }
        return 0;
    }

    /* Reject packets that don't match the expected size. */
    if (len != COMMAND_PACKET_SIZE) {
        memset(out, 0, sizeof(GroundCommand));
        return 0;
    }

    /*
     * Copy the raw bytes into the packed struct.
     *
     * GroundCommand is __attribute__((packed)), so its memory layout is
     * identical to the wire format — no padding inserted by the compiler.
     * We use memcpy rather than a pointer cast to avoid undefined behavior
     * from misaligned access on ARM Cortex-M4.
     *
     * Both ARM and the wire format are little-endian, so no byte-swapping
     * is needed.
     */
    memcpy(out, raw, COMMAND_PACKET_SIZE);

    return 1;
}

int command_validate(const GroundCommand* cmd, uint16_t catalog_size)
{
    if (cmd == NULL) {
        return 0;
    }

    if (catalog_size == 0) {
        return 0;
    }

    if (cmd->pattern_id >= catalog_size) {
        return 0;
    }

    return 1;
}

void command_decode_positions(const GroundCommand* cmd, Vec3* pos, Vec3* vel)
{
    if (cmd == NULL || pos == NULL || vel == NULL) {
        /* Zero-fill any non-NULL outputs for defensive safety. */
        if (pos != NULL) {
            pos->x = 0.0f;
            pos->y = 0.0f;
            pos->z = 0.0f;
        }
        if (vel != NULL) {
            vel->x = 0.0f;
            vel->y = 0.0f;
            vel->z = 0.0f;
        }
        return;
    }

    /* Convert int16 millimeters to float meters. */
    pos->x = mm_to_float(cmd->target_pos_x);
    pos->y = mm_to_float(cmd->target_pos_y);
    pos->z = mm_to_float(cmd->target_pos_z);

    /* Convert int16 mm/s to float m/s. */
    vel->x = mm_to_float(cmd->target_vel_x);
    vel->y = mm_to_float(cmd->target_vel_y);
    vel->z = mm_to_float(cmd->target_vel_z);
}
