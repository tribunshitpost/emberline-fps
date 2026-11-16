// Combat: hitscan shooting with headshot multipliers, tracers, grenades and
// damage. Shooters are agents (player or bots); targets are agents and the
// world. A shot is one raycast against bot hit meshes and world surfaces —
// the first thing it meets takes the hit.
import * as THREE from 'three';
import { KILL_REWARD } from './state.js';
import { takeRound, canFire, currentSpread, weaponDef } from './weapons.js';
import { recoilAgent } from './player.js';
import { clamp } from './rng.js';

// Reused temporaries: the hot loop allocates nothing per shot.
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const tmpV = new THREE.Vector3();

export function buildShootables(game, world) {
  const meshes = [...world.shootables];
  for (const bot of [...game.allies, ...game.enemies]) {
    if (bot.bodyMesh) meshes.push(bot.bodyMesh, bot.headMesh);
  }
  return meshes;
}

// Fire one round from `shooter` along its yaw/pitch with spread. `onHit`
// reports (victim, part, damage, killed) for HUD, feed and rewards.
export function fireWeapon(game, world, shooter, shootables, fx, onHit) {
  if (!canFire(shooter)) return false;
  if (!takeRound(shooter)) return false;
  const def = weaponDef(shooter);
  const spread = currentSpread(shooter);
  const eyeY = shooter.y + shooter.eye;
  origin.set(shooter.x, eyeY, shooter.z);
  // Yaw 0 faces -Z; pitch positive looks up.
  direction.set(
    -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
    Math.sin(shooter.pitch),
    -Math.cos(shooter.yaw) * Math.cos(shooter.pitch),
  );
  direction.x += (game.random() * 2 - 1) * spread;
  direction.y += (game.random() * 2 - 1) * spread;
  direction.z += (game.random() * 2 - 1) * spread;
  direction.normalize();
  raycaster.set(origin, direction);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(shootables, false);
  let end = tmpV.copy(direction).multiplyScalar(def.range).add(origin);
  for (const hit of hits) {
    const data = hit.object.userData;
    // Dead bodies and teammates never block a shot.
    if (data && data.agent && (!data.agent.alive || data.agent.team === shooter.team)) continue;
    end = hit.point;
    if (data && data.agent) {
      const victim = data.agent;
      const isHead = data.part === 'head';
      const dist = hit.distance;
      const falloff = clamp(1 - Math.max(0, dist - 20) / 80, 0.5, 1);
      const damage = Math.round(def.damage * (isHead ? def.headMul : 1) * falloff);
      damageAgent(game, victim, damage, shooter, isHead, onHit);
      fx.impact(hit.point, isHead);
    } else {
      fx.impact(hit.point, false);
    }
    break;
  }
  fx.tracer(origin, end, def.tracer);
  if (shooter === game.player) {
    recoilAgent(shooter, def.recoil * (0.8 + game.random() * 0.4), (game.random() * 2 - 1) * def.recoil * 0.3);
  }
  game.lastShot = { x: shooter.x, z: shooter.z, team: shooter.team, t: game.time };
  if (shooter === game.player) game.stats.shots += 1;
  return true;
}

export function damageAgent(game, victim, damage, attacker, isHead, onHit) {
  if (!victim.alive) return;
  victim.hp -= damage;
  if (attacker === game.player) game.stats.hits += 1;
  const killed = victim.hp <= 0;
  if (killed) {
    victim.hp = 0;
    victim.alive = false;
    if (victim.mesh) victim.mesh.visible = false;
    if (attacker === game.player) {
      game.money += KILL_REWARD;
      game.stats.kills += 1;
    }
    game.killfeed.unshift({ text: `${attacker.name} ▸ ${victim.name}${isHead ? ' (headshot)' : ''}`, team: attacker.team, t: game.time });
    if (game.killfeed.length > 5) game.killfeed.pop();
  }
  if (onHit) onHit(victim, isHead ? 'head' : 'body', damage, killed, attacker);
}

// Grenades: thrown on a ballistic arc, bounce once off the floor, explode
// after a fuse, damaging every agent in radius through line of sight.
export function throwGrenade(game, thrower) {
  const dir = new THREE.Vector3(
    -Math.sin(thrower.yaw) * Math.cos(thrower.pitch),
    Math.sin(thrower.pitch) + 0.25,
    -Math.cos(thrower.yaw) * Math.cos(thrower.pitch),
  ).normalize();
  game.grenades.push({
    x: thrower.x, y: thrower.y + thrower.eye, z: thrower.z,
    vx: dir.x * 14, vy: dir.y * 14, vz: dir.z * 14,
    fuse: 1.6, team: thrower.team, mesh: null,
  });
}

export function stepGrenades(game, world, dt, fx, onHit) {
  for (let i = game.grenades.length - 1; i >= 0; i -= 1) {
    const g = game.grenades[i];
    g.vy -= 18 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y < 0.15) {
      g.y = 0.15;
      g.vy = Math.abs(g.vy) * 0.35;
      g.vx *= 0.6;
      g.vz *= 0.6;
    }
    if (g.mesh) g.mesh.position.set(g.x, g.y, g.z);
    g.fuse -= dt;
    if (g.fuse <= 0) {
      fx.explosion(g.x, g.y, g.z);
      const agents = [game.player, ...game.allies, ...game.enemies];
      for (const agent of agents) {
        if (!agent || !agent.alive) continue;
        const dist = Math.hypot(agent.x - g.x, agent.z - g.z, (agent.y + 1) - g.y);
        if (dist < 6 && world.hasLineOfSight(g.x, g.y, g.z, agent.x, agent.y + 1.2, agent.z)) {
          const damage = Math.round(clamp(1 - dist / 6, 0.15, 1) * 110);
          damageAgent(game, agent, damage, { name: 'Frag', team: g.team }, false, onHit);
        }
      }
      if (g.mesh) g.mesh.parent?.remove(g.mesh);
      game.grenades.splice(i, 1);
    }
  }
}

export function createGrenadeMesh(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a3324, roughness: 0.6, metalness: 0.5 }),
  );
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}
