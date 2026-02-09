/**
 * Seshat Swarm — Firmware Type Definitions
 *
 * C struct definitions matching src/types/dimensions.ts.
 * Target: STM32F405 (Crazyflie 2.1+), compiled with arm-none-eabi-gcc.
 *
 * These types are the firmware's view of the 9D semantic space.
 * The ground station sends pattern IDs; the firmware looks up the
 * corresponding PatternEntry and parameterizes with local sensor data.
 */

#ifndef SESHAT_SWARM_TYPES_H
#define SESHAT_SWARM_TYPES_H

#include <stdint.h>

/* -----------------------------------------------------------------------
 * Structural Dimension Enums
 * Must stay in sync with src/types/dimensions.ts
 * ----------------------------------------------------------------------- */

/**
 * σ (Sigma) — Behavioral Mode
 * sizeof: 1 byte (uint8_t underlying)
 */
typedef enum {
    SIGMA_HOVER              = 0,
    SIGMA_TRANSLATE          = 1,
    SIGMA_ORBIT              = 2,
    SIGMA_AVOID              = 3,
    SIGMA_CLIMB              = 4,
    SIGMA_DESCEND            = 5,
    SIGMA_LAND               = 6,
    SIGMA_TAKEOFF            = 7,
    SIGMA_DOCK               = 8,
    SIGMA_UNDOCK             = 9,
    SIGMA_GROUNDED           = 10,
    SIGMA_DOCKED             = 11,
    SIGMA_FORMATION_HOLD     = 12,
    SIGMA_FORMATION_TRANSITION = 13,
    SIGMA_RELAY_HOLD         = 14,
    SIGMA_COUNT              = 15
} BehavioralMode;

/**
 * κ (Kappa) — Autonomy Level
 * sizeof: 1 byte
 */
typedef enum {
    KAPPA_AUTONOMOUS       = 0,
    KAPPA_OPERATOR_GUIDED  = 1,
    KAPPA_EMERGENCY        = 2,
    KAPPA_MANUAL           = 3,
    KAPPA_COUNT            = 4
} AutonomyLevel;

/**
 * χ (Chi) — Formation Role
 * sizeof: 1 byte
 */
typedef enum {
    CHI_LEADER           = 0,
    CHI_FOLLOWER         = 1,
    CHI_RELAY            = 2,
    CHI_PERFORMER        = 3,
    CHI_CHARGER_INBOUND  = 4,
    CHI_CHARGING         = 5,
    CHI_CHARGER_OUTBOUND = 6,
    CHI_SCOUT            = 7,
    CHI_ANCHOR           = 8,
    CHI_RESERVE          = 9,
    CHI_COUNT            = 10
} FormationRole;

/**
 * λ (Lambda) — Resource Ownership
 * sizeof: 1 byte
 */
typedef enum {
    LAMBDA_EXCLUSIVE_VOLUME = 0,
    LAMBDA_SHARED_CORRIDOR  = 1,
    LAMBDA_YIELDING         = 2,
    LAMBDA_ENERGY_SOURCE    = 3,
    LAMBDA_ENERGY_STORE     = 4,
    LAMBDA_ENERGY_CONSUMER  = 5,
    LAMBDA_COMM_BRIDGE      = 6,
    LAMBDA_COUNT            = 7
} ResourceOwnership;

/**
 * τ (Tau) — Physical Traits
 * sizeof: 1 byte
 */
typedef enum {
    TAU_BARE            = 0,
    TAU_SOLAR_EQUIPPED  = 1,
    TAU_BATTERY_CARRIER = 2,
    TAU_CAMERA_EQUIPPED = 3,
    TAU_SENSOR_EXTENDED = 4,
    TAU_DUAL_DECK       = 5,
    TAU_COUNT           = 6
} PhysicalTraits;

/**
 * ρ (Rho) — Hardware Target
 * sizeof: 1 byte
 */
typedef enum {
    RHO_CRAZYFLIE_2_1 = 0,
    RHO_CRAZYFLIE_BL  = 1,
    RHO_ESP_DRONE     = 2,
    RHO_SIM_GAZEBO    = 3,
    RHO_SIM_SIMPLE    = 4,
    RHO_COUNT         = 5
} HardwareTarget;

/**
 * Generator type — how a pattern maps δ to motor commands.
 * sizeof: 1 byte
 */
typedef enum {
    GEN_POSITION_HOLD     = 0,
    GEN_VELOCITY_TRACK    = 1,
    GEN_WAYPOINT_SEQUENCE = 2,
    GEN_RELATIVE_OFFSET   = 3,
    GEN_ORBIT_CENTER      = 4,
    GEN_TRAJECTORY_SPLINE = 5,
    GEN_EMERGENCY_STOP    = 6,
    GEN_IDLE              = 7,
    GEN_COUNT             = 8
} GeneratorType;

/* -----------------------------------------------------------------------
 * Math Primitives
 * ----------------------------------------------------------------------- */

/**
 * 3D vector. Used for position, velocity, orientation, etc.
 * sizeof: 12 bytes (3 × float32)
 */
typedef struct {
    float x;
    float y;
    float z;
} Vec3;

/* -----------------------------------------------------------------------
 * Semantic Dimension Structs
 * ----------------------------------------------------------------------- */

/**
 * δ (Delta) — Sensor State
 * The drone's current physical state from onboard sensors.
 * sizeof: 56 bytes
 *   position(12) + velocity(12) + orientation(12) + battery_pct(4)
 *   + battery_voltage(4) + discharge_rate(4) + pos_quality(4) + flags(4)
 */
typedef struct {
    Vec3 position;          /* Meters, in Lighthouse frame          */
    Vec3 velocity;          /* m/s                                  */
    Vec3 orientation;       /* roll, pitch, yaw in radians          */
    float battery_pct;      /* 0.0–1.0                              */
    float battery_voltage;  /* Volts                                */
    float discharge_rate;   /* Watts                                */
    float pos_quality;      /* 0.0–1.0, confidence in position      */
    uint32_t flags;         /* Status flags (bitfield)              */
} SensorState;
/* Static assert: sizeof(SensorState) == 56 */

/** SensorState flag bits. */
#define SENSOR_FLAG_POS_VALID     (1u << 0)
#define SENSOR_FLAG_LIGHTHOUSE_OK (1u << 1)
#define SENSOR_FLAG_UWB_OK        (1u << 2)
#define SENSOR_FLAG_LOW_BATTERY   (1u << 3)
#define SENSOR_FLAG_CHARGING      (1u << 4)

/* -----------------------------------------------------------------------
 * Communication Protocol Structs
 * ----------------------------------------------------------------------- */

/**
 * Ground station → drone command packet.
 * sizeof: 20 bytes
 *   pattern_id(2) + target_pos(6, float16×3) + target_vel(6, float16×3)
 *   + flags(1) + reserved(5)
 *
 * Note: target_pos and target_vel use float16 encoding for radio efficiency.
 * float16 gives ±65m range at ~1mm precision — sufficient for indoor flight.
 */
typedef struct __attribute__((packed)) {
    uint16_t pattern_id;       /* Index into onboard catalog             */
    int16_t target_pos_x;      /* float16: position x (mm)              */
    int16_t target_pos_y;      /* float16: position y (mm)              */
    int16_t target_pos_z;      /* float16: position z (mm)              */
    int16_t target_vel_x;      /* float16: velocity x (mm/s)            */
    int16_t target_vel_y;      /* float16: velocity y (mm/s)            */
    int16_t target_vel_z;      /* float16: velocity z (mm/s)            */
    uint8_t flags;             /* CMD_FLAG_* bitfield                   */
    uint8_t reserved[3];       /* Pad to 20 bytes, future use           */
} GroundCommand;
/* Static assert: sizeof(GroundCommand) == 20 */

/** Command flag bits. */
#define CMD_FLAG_EMERGENCY    (1u << 0)
#define CMD_FLAG_STYLE_UPDATE (1u << 1)
#define CMD_FLAG_FORCE_PATTERN (1u << 2)

/**
 * Drone → ground station telemetry packet.
 * sizeof: 18 bytes
 *   pos(6, float16×3) + vel(6, float16×3) + battery(1) + pattern_id(2)
 *   + status(1) + pos_quality(1) + reserved(1)
 */
typedef struct __attribute__((packed)) {
    int16_t pos_x;             /* float16: position x (mm)              */
    int16_t pos_y;             /* float16: position y (mm)              */
    int16_t pos_z;             /* float16: position z (mm)              */
    int16_t vel_x;             /* float16: velocity x (mm/s)            */
    int16_t vel_y;             /* float16: velocity y (mm/s)            */
    int16_t vel_z;             /* float16: velocity z (mm/s)            */
    uint8_t battery_pct;       /* 0–200 → 0.0–1.0 (×200 encoding)      */
    uint16_t pattern_id;       /* Currently executing pattern           */
    uint8_t status_flags;      /* TELEM_FLAG_* bitfield                 */
    uint8_t pos_quality;       /* 0–255 → 0.0–1.0 (×255 encoding)      */
    uint8_t reserved;          /* Pad to 18 bytes, future use           */
} TelemetryPacket;
/* Static assert: sizeof(TelemetryPacket) == 18 */

/** Telemetry status flag bits. */
#define TELEM_FLAG_AIRBORNE      (1u << 0)
#define TELEM_FLAG_PATTERN_ACTIVE (1u << 1)
#define TELEM_FLAG_EMERGENCY     (1u << 2)
#define TELEM_FLAG_LOW_BATTERY   (1u << 3)
#define TELEM_FLAG_COMM_LOST     (1u << 4)

/* -----------------------------------------------------------------------
 * Catalog Entry (compiled into flash)
 * ----------------------------------------------------------------------- */

/** Maximum number of default/bound parameters per pattern. */
#define PATTERN_MAX_PARAMS 8

/**
 * A single entry in the onboard behavioral catalog.
 * sizeof: 104 bytes
 *   id(2) + generator_type(1) + pad(1) + defaults(32) + bounds_min(32)
 *   + bounds_max(32) + battery_floor(4) + pos_quality_floor(4)
 *
 * At ~1,500 patterns × 104 bytes = 156KB. STM32F405 has 1MB flash. Fits.
 */
typedef struct {
    uint16_t id;                              /* Pattern index             */
    uint8_t generator_type;                   /* GeneratorType enum        */
    uint8_t _pad;                             /* Alignment padding         */
    float defaults[PATTERN_MAX_PARAMS];       /* Default parameters        */
    float bounds_min[PATTERN_MAX_PARAMS];     /* Parameter minimums        */
    float bounds_max[PATTERN_MAX_PARAMS];     /* Parameter maximums        */
    float battery_floor;                      /* Min battery to enter      */
    float pos_quality_floor;                  /* Min positioning quality   */
} PatternEntry;
/* Static assert: sizeof(PatternEntry) == 104 */

/* -----------------------------------------------------------------------
 * Motor Output
 * ----------------------------------------------------------------------- */

/**
 * Setpoints sent to the Crazyflie's existing attitude controller.
 * sizeof: 16 bytes
 */
typedef struct {
    float roll;    /* Degrees */
    float pitch;   /* Degrees */
    float yaw;     /* Degrees/second (yaw rate) */
    float thrust;  /* 0–65535 (Crazyflie thrust units) */
} MotorSetpoints;

/* -----------------------------------------------------------------------
 * Utility: float16 encoding for radio packets
 *
 * Position: int16 in millimeters → ±32.767m range at 1mm precision
 * Velocity: int16 in mm/s → ±32.767 m/s range at 1mm/s precision
 * ----------------------------------------------------------------------- */

static inline int16_t float_to_mm(float meters) {
    float clamped = meters;
    if (clamped > 32.767f)  clamped = 32.767f;
    if (clamped < -32.767f) clamped = -32.767f;
    return (int16_t)(clamped * 1000.0f);
}

static inline float mm_to_float(int16_t mm) {
    return (float)mm / 1000.0f;
}

#endif /* SESHAT_SWARM_TYPES_H */
