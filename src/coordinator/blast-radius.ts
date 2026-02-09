/**
 * Seshat Swarm — Blast Radius Engine (Theorem 9.4)
 *
 * Implements Theorem 9.4 adapted for drone swarms:
 *
 *   affected(drone_i) = spatial_neighbors(drone_i)
 *                      U role_dependents(drone_i)
 *                      U {drone_i}
 *
 * When a drone's structural state changes (Delta != 0), only the drones
 * within its blast radius need to re-evaluate. For a 10-drone swarm where
 * each drone has 2-3 neighbors, this means 3-4 drones update per state
 * change, not 10.
 *
 * The cascade variant handles transitive effects: if re-evaluation changes
 * drone_j's pattern, drone_j's blast radius is added to the affected set.
 * This repeats until stable (at most N iterations for N drones).
 */

import type { WorldModel, DroneState } from './world-model.js';
import type { NeighborGraph } from '../types/dimensions.js';

// ---------------------------------------------------------------------------
// Single-Drone Blast Radius
// ---------------------------------------------------------------------------

/**
 * Compute the set of drones affected by a state change in the given drone.
 *
 * The affected set is the union of:
 * 1. The changed drone itself
 * 2. All spatial neighbors (from epsilon.neighbors)
 * 3. All role dependents:
 *    - If changed drone is a leader: all followers
 *    - If changed drone is a follower: the leader
 *    - If changed drone is a relay: relay_target
 *    - If there is a relay_source: the relay_source
 *
 * This function does NOT check whether Delta != 0 -- that is the caller's
 * responsibility. It always computes and returns the blast radius set.
 *
 * @param changedDroneId - The drone whose state changed
 * @param world - Current world model state
 * @returns Set of affected drone IDs (includes changedDroneId itself)
 */
export function computeBlastRadius(
  changedDroneId: string,
  world: WorldModel,
): Set<string> {
  const affected = new Set<string>();

  // 1. Always include the changed drone itself
  affected.add(changedDroneId);

  const drone = world.getDrone(changedDroneId);
  if (!drone) return affected;

  const graph = drone.coordinate.epsilon;

  // 2. Add all spatial neighbors
  for (const neighborId of graph.neighbors) {
    affected.add(neighborId);
  }

  // 3. Add role dependents
  addRoleDependents(affected, drone, graph);

  return affected;
}

/**
 * Add role-dependent drones to the affected set based on the drone's
 * formation role (chi) and neighbor graph relationships.
 */
function addRoleDependents(
  affected: Set<string>,
  drone: DroneState,
  graph: NeighborGraph,
): void {
  const role = drone.coordinate.chi;

  // Leader change affects all followers
  if (role === 'leader') {
    for (const followerId of graph.followers) {
      affected.add(followerId);
    }
  }

  // Follower change affects the leader
  if (role === 'follower' && graph.leader !== null) {
    affected.add(graph.leader);
  }

  // Relay change affects relay target
  if (role === 'relay' && graph.relay_target !== null) {
    affected.add(graph.relay_target);
  }

  // If someone relays for this drone, they are affected too
  if (graph.relay_source !== null) {
    affected.add(graph.relay_source);
  }
}

// ---------------------------------------------------------------------------
// Cascading Blast Radius
// ---------------------------------------------------------------------------

/**
 * Compute blast radius with cascade propagation.
 *
 * After computing the initial blast radius for each changed drone, if any
 * newly-affected drone would change its pattern (determined by the callback),
 * that drone's blast radius is added to the affected set. This repeats until
 * no new drones are added.
 *
 * Termination guarantee: each drone can be added to the affected set at most
 * once, so the loop runs at most N iterations for N drones in the swarm.
 *
 * Without the wouldChangePattern callback, this simply returns the union of
 * the initial blast radii (no cascade).
 *
 * @param changedDroneIds - Initial set of drones that changed
 * @param world - Current world model
 * @param wouldChangePattern - Optional callback that determines if a drone
 *        would change pattern given the current world state. Used by the
 *        constraint engine during cascade evaluation.
 * @returns Set of all affected drone IDs
 */
export function computeCascadingBlastRadius(
  changedDroneIds: string[],
  world: WorldModel,
  wouldChangePattern?: (droneId: string) => boolean,
): Set<string> {
  const affected = new Set<string>();

  // Phase 1: Compute blast radius for each initially changed drone
  for (const droneId of changedDroneIds) {
    const radius = computeBlastRadius(droneId, world);
    for (const id of radius) {
      affected.add(id);
    }
  }

  // Phase 2: Cascade -- if callback is provided, check newly affected drones
  if (!wouldChangePattern) return affected;

  // Track which drones have already been evaluated for cascade
  const evaluated = new Set<string>(changedDroneIds);
  // Queue of drones to evaluate for cascade (newly affected, not yet evaluated)
  let frontier = new Set<string>();
  for (const id of affected) {
    if (!evaluated.has(id)) {
      frontier.add(id);
    }
  }

  // Iterate until no new drones are added. Bounded by total drone count.
  while (frontier.size > 0) {
    const nextFrontier = new Set<string>();

    for (const droneId of frontier) {
      evaluated.add(droneId);

      if (wouldChangePattern(droneId)) {
        // This drone would change pattern -- expand its blast radius
        const cascadeRadius = computeBlastRadius(droneId, world);
        for (const id of cascadeRadius) {
          affected.add(id);
          // If this is a newly discovered drone (not already evaluated and
          // not in the current frontier being processed), add to next frontier
          if (!evaluated.has(id) && !frontier.has(id)) {
            nextFrontier.add(id);
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return affected;
}
