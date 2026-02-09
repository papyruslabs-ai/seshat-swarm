/**
 * Seshat Swarm — Command Parser
 *
 * Deserializes raw radio packets from the ground station into
 * GroundCommand structs. The ground station sends packed, little-endian
 * packets whose layout matches the GroundCommand struct byte-for-byte.
 *
 * Target: STM32F405 (Crazyflie 2.1+), compiled with arm-none-eabi-gcc.
 *
 * Usage:
 *   uint8_t raw[20];                  // filled by radio driver
 *   GroundCommand cmd;
 *   if (command_parse(raw, sizeof(raw), &cmd)) {
 *       if (command_validate(&cmd, catalog_size)) {
 *           Vec3 pos, vel;
 *           command_decode_positions(&cmd, &pos, &vel);
 *           // ... use pos/vel in meters and m/s
 *       }
 *   }
 */

#ifndef SESHAT_SWARM_COMMAND_PARSER_H
#define SESHAT_SWARM_COMMAND_PARSER_H

#include "types.h"
#include <stdint.h>

/**
 * Parse a raw radio packet into a GroundCommand.
 *
 * The packet must be exactly sizeof(GroundCommand) bytes and is copied
 * via memcpy to avoid alignment issues on ARM. On failure the output
 * struct is zero-filled.
 *
 * @param raw  Pointer to the raw packet bytes (must not be NULL).
 * @param len  Length of the raw buffer in bytes.
 * @param out  Pointer to the destination GroundCommand (must not be NULL).
 * @return     1 on success, 0 on failure (NULL pointers or wrong length).
 */
int command_parse(const uint8_t* raw, uint16_t len, GroundCommand* out);

/**
 * Validate that a parsed command references a valid pattern.
 *
 * @param cmd           Pointer to a parsed GroundCommand (must not be NULL).
 * @param catalog_size  Number of patterns in the onboard catalog.
 * @return              1 if cmd->pattern_id < catalog_size, 0 otherwise.
 */
int command_validate(const GroundCommand* cmd, uint16_t catalog_size);

/**
 * Decode the int16 millimeter fields of a GroundCommand into float
 * meters/seconds Vec3 structs.
 *
 * Uses mm_to_float() from types.h for the conversion:
 *   target_pos_{x,y,z} (mm)   -> pos->{x,y,z} (meters)
 *   target_vel_{x,y,z} (mm/s) -> vel->{x,y,z} (m/s)
 *
 * @param cmd  Pointer to a parsed GroundCommand (must not be NULL).
 * @param pos  Output position in meters (must not be NULL).
 * @param vel  Output velocity in m/s (must not be NULL).
 */
void command_decode_positions(const GroundCommand* cmd, Vec3* pos, Vec3* vel);

#endif /* SESHAT_SWARM_COMMAND_PARSER_H */
