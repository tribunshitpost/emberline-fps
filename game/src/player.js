// Player movement: acceleration, friction, gravity, crouch and jump, resolved
// as a box against the world's colliders one axis at a time, so a wall never
// swallows the player. Shared by the player and the bots' bodies.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

// Move an agent (player or bot) by its wish direction for one fixed step.
// `wish` is a normalized {x, z} in world space, or null for no input.
export function moveAgent(agent, colliders, dt, wishX, wishZ, wantJump, wantCrouch) {
  const probe = moveAgent.probe ?? (moveAgent.probe = new THREE.Box3());
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  if (wantCrouch && !agent.crouching) {
    agent.crouching = true;
    agent.height = CROUCH_HEIGHT;
  } else if (!wantCrouch && agent.crouching && !overlaps(agent.x, agent.y, agent.z, STAND_HEIGHT, 0.02)) {
    agent.crouching = false;
    agent.height = STAND_HEIGHT;
  }
  const eyeTarget = agent.crouching ? CROUCH_EYE : STAND_EYE;
  agent.eye += (eyeTarget - agent.eye) * Math.min(1, dt * 12);

  const speed = agent.crouching ? CROUCH_SPEED : WALK_SPEED;
  const blend = Math.min(1, (agent.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
  agent.vx += (wishX * speed - agent.vx) * blend;
  agent.vz += (wishZ * speed - agent.vz) * blend;
  if (agent.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - FRICTION * dt);
    agent.vx *= damp;
    agent.vz *= damp;
  }
  if (wantJump && agent.onGround) {
    agent.vy = JUMP_SPEED;
    agent.onGround = false;
  }
  agent.vy -= GRAVITY * dt;

  const nextX = agent.x + agent.vx * dt;
  if (!overlaps(nextX, agent.y, agent.z, agent.height, 0.04)) agent.x = nextX;
  else agent.vx = 0;
  const nextZ = agent.z + agent.vz * dt;
  if (!overlaps(agent.x, agent.y, nextZ, agent.height, 0.04)) agent.z = nextZ;
  else agent.vz = 0;

  agent.y += agent.vy * dt;
  agent.onGround = false;
  const hit = overlaps(agent.x, agent.y, agent.z, agent.height, 0);
  if (hit && agent.vy <= 0) {
    agent.y = hit.max.y;
    agent.vy = 0;
    agent.onGround = true;
  } else if (hit) {
    agent.y = hit.min.y - agent.height;
    agent.vy = 0;
  }
  if (agent.y < 0) {
    agent.y = 0;
    agent.vy = 0;
    agent.onGround = true;
  }
  agent.vy = Math.max(-30, agent.vy);
}

export function groundSpeed(agent) {
  return Math.hypot(agent.vx, agent.vz);
}

export function lookAgent(agent, dx, dy, sensitivity = 0.0022) {
  agent.yaw -= dx * sensitivity;
  agent.pitch = Math.max(-1.45, Math.min(1.45, agent.pitch - dy * sensitivity));
}

export function recoilAgent(agent, pitchKick, yawKick) {
  agent.pitch = Math.min(1.45, agent.pitch + pitchKick);
  agent.yaw += yawKick;
}
