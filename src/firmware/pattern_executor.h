/**
 * Seshat Swarm -- Pattern Executor
 *
 * Core firmware loop for Crazyflie STM32F405. Receives a ground command
 * and current sensor state, looks up the behavioral pattern in the onboard
 * catalog, and produces motor setpoints.
 *
 * The executor never generates novel behavior. It selects from the
 * pre-verified catalog and parameterizes with real-time sensor data.
 *
 * Usage:
 *   pattern_executor_init();
 *   // In the control loop (500 Hz on Crazyflie):
 *   MotorSetpoints sp = pattern_executor_step(&cmd, &sensor);
 *   // Feed sp.roll, sp.pitch, sp.yaw, sp.thrust to attitude controller
 */

#ifndef SESHAT_SWARM_PATTERN_EXECUTOR_H
#define SESHAT_SWARM_PATTERN_EXECUTOR_H

#include "types.h"

/**
 * Initialize the pattern executor.
 * Must be called once before the first call to pattern_executor_step.
 */
void pattern_executor_init(void);

/**
 * Execute one step of the behavioral pattern.
 *
 * @param cmd    Ground command with pattern_id, target position/velocity, flags.
 *               Target position and velocity are float16-encoded (mm / mm/s).
 * @param state  Current sensor state (position, velocity, orientation, battery).
 * @return       Motor setpoints for the Crazyflie attitude controller.
 *
 * If the pattern_id is invalid or the generator type is unknown, the executor
 * falls back to emergency hover at the drone's current position.
 */
MotorSetpoints pattern_executor_step(const GroundCommand* cmd,
                                     const SensorState* state);

#endif /* SESHAT_SWARM_PATTERN_EXECUTOR_H */
