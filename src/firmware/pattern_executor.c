/**
 * Seshat Swarm -- Pattern Executor
 *
 * Core firmware loop: GroundCommand + SensorState -> MotorSetpoints.
 * Looks up the commanded pattern in the onboard catalog, switches on the
 * generator type, and computes setpoints. Never generates novel behavior.
 *
 * Target: STM32F405 (Crazyflie 2.1+), arm-none-eabi-gcc.
 */

#include "pattern_executor.h"
#include "catalog_data.h"   /* CATALOG[], CATALOG_SIZE */
#include <math.h>

/* -- Constants ---------------------------------------------------------- */

#define HOVER_THRUST         37500.0f  /* Base hover thrust (of 65535)      */
#define POS_P_GAIN           15.0f     /* Position error -> attitude (deg)  */
#define VEL_P_GAIN           8.0f      /* Velocity error -> attitude (deg)  */
#define ALT_P_GAIN           8000.0f   /* Altitude error -> thrust offset   */
#define MAX_ANGLE_DEG        25.0f     /* Max commanded attitude angle      */
#define THRUST_MIN           10000.0f
#define THRUST_MAX           60000.0f
#define DEFAULT_HOVER_ALT    0.5f      /* meters */
#define DEFAULT_ORBIT_RADIUS 0.5f      /* meters */
#define DEFAULT_ORBIT_OMEGA  0.5f      /* rad/s  */
#define DEFAULT_WP_SPEED     0.3f      /* m/s    */

static uint8_t s_initialized = 0;

/* -- Helpers ------------------------------------------------------------ */

static float clampf(float val, float lo, float hi) {
    if (val < lo) return lo;
    if (val > hi) return hi;
    return val;
}

/** Look up a pattern by ID. Returns NULL if not found. */
static const PatternEntry* catalog_lookup(uint16_t pattern_id) {
    uint16_t i;
    for (i = 0; i < CATALOG_SIZE; i++) {
        if (CATALOG[i].id == pattern_id) return &CATALOG[i];
    }
    return (const PatternEntry*)0;
}

/** Read pattern parameter with fallback and bounds clamping.
 *  Bounds are active when bounds_max > bounds_min for the slot. */
static float read_param(const PatternEntry* pat, uint8_t slot, float fallback) {
    float val;
    if (slot >= PATTERN_MAX_PARAMS) return fallback;
    val = pat->defaults[slot];
    if (val == 0.0f && fallback != 0.0f) val = fallback;
    if (pat->bounds_max[slot] > pat->bounds_min[slot])
        val = clampf(val, pat->bounds_min[slot], pat->bounds_max[slot]);
    return val;
}

/** Hover thrust +/- P-correction from altitude error. */
static float compute_thrust(float current_z, float target_z) {
    return clampf(HOVER_THRUST + ALT_P_GAIN * (target_z - current_z),
                  THRUST_MIN, THRUST_MAX);
}

/** Clamp attitude and thrust to safe ranges. */
static MotorSetpoints clamp_setpoints(MotorSetpoints sp) {
    sp.roll   = clampf(sp.roll,   -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.pitch  = clampf(sp.pitch,  -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.thrust = clampf(sp.thrust, THRUST_MIN, THRUST_MAX);
    return sp;
}

/** Emergency hover: level off and hold altitude. Fallback for all errors. */
static MotorSetpoints emergency_hover(const SensorState* state) {
    MotorSetpoints sp;
    float target_z = state->position.z;
    if (target_z < 0.1f) target_z = DEFAULT_HOVER_ALT;
    sp.roll  = 0.0f;
    sp.pitch = 0.0f;
    sp.yaw   = 0.0f;
    sp.thrust = compute_thrust(state->position.z, target_z);
    return sp;
}

/* -- Generators ---------------------------------------------------------
 * Convention: position error_x -> pitch, error_y -> roll.
 * Each generator produces attitude commands for the Crazyflie PID layer. */

/** GEN_POSITION_HOLD (0): Hold at target position. Slot 0 = altitude. */
static MotorSetpoints gen_position_hold(const SensorState* state,
        float tgt_x, float tgt_y, float tgt_z, const PatternEntry* pat) {
    MotorSetpoints sp;
    float alt = read_param(pat, 0, DEFAULT_HOVER_ALT);
    if (alt > 0.0f) tgt_z = alt;
    sp.pitch  = clampf(POS_P_GAIN * (tgt_x - state->position.x),
                        -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.roll   = clampf(POS_P_GAIN * (tgt_y - state->position.y),
                        -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.yaw    = 0.0f;
    sp.thrust = compute_thrust(state->position.z, tgt_z);
    return sp;
}

/** GEN_VELOCITY_TRACK (1): Track target velocity. Slot 0 = max speed. */
static MotorSetpoints gen_velocity_track(const SensorState* state,
        float tgt_vx, float tgt_vy, float tgt_z, const PatternEntry* pat) {
    MotorSetpoints sp;
    float max_speed = read_param(pat, 0, 1.0f);
    float spd = sqrtf(tgt_vx * tgt_vx + tgt_vy * tgt_vy);
    if (spd > max_speed && spd > 0.001f) {
        float s = max_speed / spd;
        tgt_vx *= s;
        tgt_vy *= s;
    }
    sp.pitch  = clampf(VEL_P_GAIN * (tgt_vx - state->velocity.x),
                        -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.roll   = clampf(VEL_P_GAIN * (tgt_vy - state->velocity.y),
                        -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.yaw    = 0.0f;
    sp.thrust = compute_thrust(state->position.z, tgt_z);
    return sp;
}

/** GEN_WAYPOINT_SEQUENCE (2): Fly toward target at configured speed.
 *  Slot 0 = approach speed. Slows linearly within 0.3 m. */
static MotorSetpoints gen_waypoint_sequence(const SensorState* state,
        float tgt_x, float tgt_y, float tgt_z, const PatternEntry* pat) {
    float speed = read_param(pat, 0, DEFAULT_WP_SPEED);
    float ex = tgt_x - state->position.x;
    float ey = tgt_y - state->position.y;
    float dist = sqrtf(ex * ex + ey * ey);
    float dvx = 0.0f, dvy = 0.0f;
    if (dist > 0.01f) {
        float s = speed / dist;
        if (dist < 0.3f) s = (speed * dist / 0.3f) / dist;
        dvx = ex * s;
        dvy = ey * s;
    }
    return gen_velocity_track(state, dvx, dvy, tgt_z, pat);
}

/** GEN_RELATIVE_OFFSET (3): Hold at target + offset.
 *  Slots 0,1,2 = offset_x, offset_y, offset_z. */
static MotorSetpoints gen_relative_offset(const SensorState* state,
        float tgt_x, float tgt_y, float tgt_z, const PatternEntry* pat) {
    return gen_position_hold(state,
        tgt_x + read_param(pat, 0, 0.0f),
        tgt_y + read_param(pat, 1, 0.0f),
        tgt_z + read_param(pat, 2, 0.0f), pat);
}

/** GEN_ORBIT_CENTER (4): Orbit around target position.
 *  Slot 0 = radius, Slot 1 = angular velocity. */
static MotorSetpoints gen_orbit_center(const SensorState* state,
        float cx, float cy, float cz, const PatternEntry* pat) {
    MotorSetpoints sp;
    float radius = read_param(pat, 0, DEFAULT_ORBIT_RADIUS);
    float omega  = read_param(pat, 1, DEFAULT_ORBIT_OMEGA);
    float dx = state->position.x - cx;
    float dy = state->position.y - cy;
    float angle = atan2f(dy, dx);
    float cur_r = sqrtf(dx * dx + dy * dy);
    /* Tangential velocity (CCW). */
    float dvx = -sinf(angle) * omega * radius;
    float dvy =  cosf(angle) * omega * radius;
    /* Radial correction to maintain orbit radius. */
    if (cur_r > 0.01f) {
        float re = radius - cur_r;
        dvx += (dx / cur_r) * re * POS_P_GAIN * 0.3f;
        dvy += (dy / cur_r) * re * POS_P_GAIN * 0.3f;
    }
    sp.pitch  = clampf(VEL_P_GAIN * (dvx - state->velocity.x),
                        -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.roll   = clampf(VEL_P_GAIN * (dvy - state->velocity.y),
                        -MAX_ANGLE_DEG, MAX_ANGLE_DEG);
    sp.yaw    = 0.0f;
    sp.thrust = compute_thrust(state->position.z, cz);
    return sp;
}

/** GEN_TRAJECTORY_SPLINE (5): Stub -- falls back to position hold. */
static MotorSetpoints gen_trajectory_spline(const SensorState* state,
        float tgt_x, float tgt_y, float tgt_z, const PatternEntry* pat) {
    return gen_position_hold(state, tgt_x, tgt_y, tgt_z, pat);
}

/** GEN_EMERGENCY_STOP (6): Kill velocity, hold current position. */
static MotorSetpoints gen_emergency_stop(const SensorState* state,
        const PatternEntry* pat) {
    (void)pat;
    return emergency_hover(state);
}

/** GEN_IDLE (7): Zero setpoints (motors off). */
static MotorSetpoints gen_idle(void) {
    MotorSetpoints sp = {0.0f, 0.0f, 0.0f, 0.0f};
    return sp;
}

/* -- Public API --------------------------------------------------------- */

void pattern_executor_init(void) {
    s_initialized = 1;
}

MotorSetpoints pattern_executor_step(const GroundCommand* cmd,
                                     const SensorState* state) {
    const PatternEntry* pat;
    MotorSetpoints sp;
    float tgt_x, tgt_y, tgt_z, tgt_vx, tgt_vy;

    if (!s_initialized) return gen_idle();
    if (cmd->flags & CMD_FLAG_EMERGENCY) return emergency_hover(state);

    pat = catalog_lookup(cmd->pattern_id);
    if (!pat) return emergency_hover(state);

    /* Decode float16 targets from ground command. */
    tgt_x  = mm_to_float(cmd->target_pos_x);
    tgt_y  = mm_to_float(cmd->target_pos_y);
    tgt_z  = mm_to_float(cmd->target_pos_z);
    tgt_vx = mm_to_float(cmd->target_vel_x);
    tgt_vy = mm_to_float(cmd->target_vel_y);

    switch ((GeneratorType)pat->generator_type) {
    case GEN_POSITION_HOLD:
        sp = gen_position_hold(state, tgt_x, tgt_y, tgt_z, pat);       break;
    case GEN_VELOCITY_TRACK:
        sp = gen_velocity_track(state, tgt_vx, tgt_vy, tgt_z, pat);    break;
    case GEN_WAYPOINT_SEQUENCE:
        sp = gen_waypoint_sequence(state, tgt_x, tgt_y, tgt_z, pat);   break;
    case GEN_RELATIVE_OFFSET:
        sp = gen_relative_offset(state, tgt_x, tgt_y, tgt_z, pat);     break;
    case GEN_ORBIT_CENTER:
        sp = gen_orbit_center(state, tgt_x, tgt_y, tgt_z, pat);        break;
    case GEN_TRAJECTORY_SPLINE:
        sp = gen_trajectory_spline(state, tgt_x, tgt_y, tgt_z, pat);   break;
    case GEN_EMERGENCY_STOP:
        sp = gen_emergency_stop(state, pat);                            break;
    case GEN_IDLE:
        sp = gen_idle();                                                break;
    default:
        sp = emergency_hover(state);                                    break;
    }

    return clamp_setpoints(sp);
}
