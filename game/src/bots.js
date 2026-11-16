// Bots: meshes plus the brain. Two teams share one AI. Defenders (Ash) hold
// a site, patrol its approaches, rotate toward gunfire and rush to defuse a
// planted charge. Attackers (Ember, the player's allies) push a site along
// the waypoint graph and clear it. In a fight a bot reacts after a delay,
// fires in bursts with aim error that grows with distance, and strafes.
import * as THREE from 'three';
import { createAgent, DEFUSE_TIME } from './state.js';
import { moveAgent } from './player.js';
import { findPath, nearestWaypoint } from './world.js';
import { canFire, startReload, stepWeapon } from './weapons.js';
import { clamp } from './rng.js';

const BOT_NAMES = {
  ember: ['FLINT', 'TINDER'],
  ash: ['RUST', 'SLAG', 'CINDER', 'SOOT'],
};
const TEAM_COLOR = { ember: 0xf0a830, ash: 0xe4572e };
const BODY_COLOR = { ember: 0x4a3d28, ash: 0x4a2620 };

export function createBotMesh(scene, agent) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_COLOR[agent.team], roughness: 0.85 });
  const teamMat = new THREE.MeshStandardMaterial({
    color: TEAM_COLOR[agent.team], roughness: 0.5, emissive: TEAM_COLOR[agent.team], emissiveIntensity: 0.35,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.92, 0.34), bodyMat);
  body.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), darkMat);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), teamMat);
  visor.position.set(0, 1.6, 0.19);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), darkMat);
  gun.position.set(0.22, 1.18, 0.3);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.16), teamMat);
  pack.position.set(0, 1.05, -0.26);
  for (const mesh of [body, head, visor, gun, pack]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  body.userData = { agent, part: 'body' };
  head.userData = { agent, part: 'head' };
  visor.userData = { agent, part: 'head' };
  agent.mesh = group;
  agent.bodyMesh = body;
  agent.headMesh = head;
  agent.gunMesh = gun;
  scene.add(group);
  return group;
}

export function spawnBots(game, world, scene) {
  game.allies = [];
  game.enemies = [];
  const random = game.random;
  // Two Ember allies push the sites with the player.
  const allySites = ['A', 'B'];
  for (let i = 0; i < 2; i += 1) {
    const spawn = world.spawns.ember[i + 1] ?? world.spawns.ember[0];
    const agent = createAgent(`ally-${i}`, 'ember', BOT_NAMES.ember[i], i === 0 ? 'rifle' : 'smg', spawn.x, spawn.z, 0);
    agent.brain = {
      mode: 'push', site: allySites[i], spawnX: spawn.x, spawnZ: spawn.z, initYaw: 0, path: [], pathI: 0,
      holdUntil: 0, react: 0, burstLeft: 0, burstPause: 0, target: null,
      aimYaw: agent.yaw, aimPitch: 0, aimErr: 0, strafeDir: 1, strafeT: 0,
      stuckT: 0, lastX: agent.x, lastZ: agent.z, heard: null, defusing: false,
    };
    createBotMesh(scene, agent);
    game.allies.push(agent);
  }
  // Four Ash defenders: two hold A, two hold B.
  const ashSetup = [
    { site: 'A', wp: 6, weapon: 'rifle' },
    { site: 'A', wp: 19, weapon: 'smg' },
    { site: 'B', wp: 9, weapon: 'rifle' },
    { site: 'B', wp: 20, weapon: 'pistol' },
  ];
  for (let i = 0; i < 4; i += 1) {
    const setup = ashSetup[i];
    const wp = world.waypoints[setup.wp];
    const agent = createAgent(`enemy-${i}`, 'ash', BOT_NAMES.ash[i], setup.weapon, wp.x, wp.z, Math.PI);
    agent.brain = {
      mode: 'hold', site: setup.site, homeWp: setup.wp, spawnX: wp.x, spawnZ: wp.z, initYaw: Math.PI, patrolWp: setup.wp === 6 ? 5 : setup.wp === 19 ? 15 : setup.wp === 9 ? 8 : 16,
      path: [], pathI: 0, holdUntil: 1 + random() * 2, react: 0, burstLeft: 0, burstPause: 0,
      target: null, aimYaw: agent.yaw, aimPitch: 0, aimErr: 0, strafeDir: 1, strafeT: 0,
      stuckT: 0, lastX: agent.x, lastZ: agent.z, heard: null, defusing: false,
    };
    createBotMesh(scene, agent);
    game.enemies.push(agent);
  }
}

function visibleEnemy(game, world, bot) {
  const foes = bot.team === 'ember' ? game.enemies : [game.player, ...game.allies];
  let best = null;
  let bestD = Infinity;
  const eyeY = bot.y + bot.eye;
  for (const foe of foes) {
    if (!foe || !foe.alive) continue;
    const dx = foe.x - bot.x;
    const dz = foe.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 55 || dist >= bestD) continue;
    // Close quarters: heard and felt, no facing needed. Further out the
    // target must be inside the bot's view cone.
    const angleTo = Math.atan2(-dx, -dz);
    let diff = angleTo - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (dist > 8 && Math.abs(diff) > 1.05) continue;
    const chestY = foe.y + 1.2;
    if (!world.hasLineOfSight(bot.x, eyeY, bot.z, foe.x, chestY, foe.z)) continue;
    best = foe;
    bestD = dist;
  }
  return best ? { foe: best, dist: bestD } : null;
}

function setPath(bot, world, toWp) {
  const from = nearestWaypoint(world.waypoints, bot.x, bot.z);
  bot.brain.path = findPath(world.waypoints, from, toWp);
  bot.brain.pathI = 0;
}

function followPath(bot, world, colliders, dt, speedMul = 1) {
  const brain = bot.brain;
  if (brain.pathI >= brain.path.length) return true;
  const wp = world.waypoints[brain.path[brain.pathI]];
  const dx = wp.x - bot.x;
  const dz = wp.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.9) {
    brain.pathI += 1;
    return brain.pathI >= brain.path.length;
  }
  const wishX = (dx / dist) * speedMul;
  const wishZ = (dz / dist) * speedMul;
  moveAgent(bot, colliders, dt, wishX, wishZ, false, false);
  bot.yaw = Math.atan2(-wishX, -wishZ);
  return false;
}

function aimAt(bot, target, err) {
  const dx = target.x - bot.x;
  const dy = (target.y + 1.25) - (bot.y + bot.eye);
  const dz = target.z - bot.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const wantYaw = Math.atan2(-dx, -dz) + err;
  const wantPitch = Math.asin(clamp(dy / dist, -1, 1));
  let dyaw = wantYaw - bot.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  bot.yaw += dyaw * 0.35;
  bot.pitch += (wantPitch - bot.pitch) * 0.35;
  bot.brain.aimYaw = bot.yaw;
  bot.brain.aimPitch = bot.pitch;
}

function syncMesh(bot) {
  if (!bot.mesh) return;
  bot.mesh.position.set(bot.x, bot.y, bot.z);
  // The mesh's visor and gun sit on local +Z; the bot's forward is
  // (-sin yaw, -cos yaw), so the mesh needs yaw + PI to face its forward.
  bot.mesh.rotation.y = bot.yaw + Math.PI;
}

// Reset every bot for a new round: back to its spawn, full health and ammo,
// brain back to its opening role. Meshes are reused, never rebuilt.
export function resetBots(game, world) {
  const mags = { pistol: 12, rifle: 25, smg: 32 };
  const reserves = { pistol: 36, rifle: 75, smg: 96 };
  for (const bot of [...game.allies, ...game.enemies]) {
    const brain = bot.brain;
    bot.alive = true;
    bot.hp = 100;
    bot.x = brain.spawnX;
    bot.z = brain.spawnZ;
    bot.y = 0;
    bot.yaw = brain.initYaw;
    bot.pitch = 0;
    bot.vx = 0; bot.vz = 0; bot.vy = 0;
    bot.mag = mags[bot.weaponId];
    bot.reserve = reserves[bot.weaponId];
    bot.reloading = 0; bot.cooldown = 0; bot.spreadBloom = 0;
    bot.crouching = false; bot.height = 1.72; bot.eye = 1.6;
    brain.mode = bot.team === 'ember' ? 'push' : 'hold';
    brain.path = [];
    brain.pathI = 0;
    brain.holdUntil = 1 + game.random() * 2;
    brain.target = null;
    brain.heard = null;
    brain.defusing = false;
    brain.burstLeft = 0;
    brain.burstPause = 0;
    if (bot.mesh) bot.mesh.visible = true;
    syncMesh(bot);
  }
  void world;
}

export function stepBots(game, world, dt, fire) {
  const bots = [...game.allies, ...game.enemies];
  for (const bot of bots) {
    if (!bot.alive) {
      if (bot.mesh) bot.mesh.visible = false;
      continue;
    }
    const brain = bot.brain;
    stepWeapon(bot, dt);
    if (bot.mag === 0 && bot.reloading <= 0) startReload(bot);

    // Stuck detection: no progress while following a path means re-route.
    if (Math.hypot(bot.x - brain.lastX, bot.z - brain.lastZ) < 0.05 && brain.pathI < brain.path.length) {
      brain.stuckT += dt;
      if (brain.stuckT > 2) {
        brain.stuckT = 0;
        brain.pathI += 1;
      }
    } else brain.stuckT = 0;
    brain.lastX = bot.x;
    brain.lastZ = bot.z;

    // Hearing: a nearby enemy shot pulls the bot toward the sound.
    const shot = game.lastShot;
    if (shot && shot.team !== bot.team && game.time - shot.t < 0.6) {
      const d = Math.hypot(shot.x - bot.x, shot.z - bot.z);
      if (d < 28) brain.heard = { x: shot.x, z: shot.z, t: game.time };
    }

    const seen = visibleEnemy(game, world, bot);
    if (seen) {
      brain.target = seen.foe;
      if (brain.mode !== 'engage') {
        brain.mode = 'engage';
        // Reaction time: further targets take longer to notice.
        brain.react = 0.35 + seen.dist * 0.008 + game.random() * 0.25;
        brain.aimErr = (game.random() * 2 - 1) * (0.012 + seen.dist * 0.0009);
        brain.burstLeft = 0;
        brain.burstPause = 0;
      }
      aimAt(bot, seen.foe, brain.aimErr);
      if (brain.react > 0) {
        brain.react -= dt;
      } else if (brain.burstPause > 0) {
        brain.burstPause -= dt;
        // Strafe while waiting between bursts.
        brain.strafeT -= dt;
        if (brain.strafeT <= 0) { brain.strafeDir *= -1; brain.strafeT = 0.6 + game.random() * 0.8; }
        const sideX = Math.cos(bot.yaw) * brain.strafeDir;
        const sideZ = -Math.sin(bot.yaw) * brain.strafeDir;
        moveAgent(bot, world.colliders, dt, sideX * 0.5, sideZ * 0.5, false, game.random() < 0.1);
      } else if (brain.burstLeft <= 0) {
        brain.burstLeft = 3 + Math.floor(game.random() * 3);
        brain.aimErr = (game.random() * 2 - 1) * (0.012 + seen.dist * 0.0009);
      } else if (canFire(bot)) {
        fire(bot);
        brain.burstLeft -= 1;
        if (brain.burstLeft <= 0) brain.burstPause = 0.5 + game.random() * 0.5;
      }
      syncMesh(bot);
      continue;
    }

    brain.target = null;
    // A planted charge pulls every defender to its site; the closest one
    // defuses once it arrives and the site looks clear.
    if (game.bomb.planted && bot.team === 'ash') {
      const site = world.sites[game.bomb.site];
      const dSite = Math.hypot(site.center.x - bot.x, site.center.z - bot.z);
      if (dSite < 1.6) {
        brain.defusing = true;
        game.bomb.defuseProgress += dt;
        bot.yaw = Math.atan2(-(site.center.x - bot.x), -(site.center.z - bot.z));
        syncMesh(bot);
        continue;
      }
      brain.defusing = false;
      if (brain.mode !== 'rotate' || brain.pathI >= brain.path.length) {
        setPath(bot, world, game.bomb.site === 'A' ? 5 : 8);
        brain.mode = 'rotate';
      }
      followPath(bot, world, world.colliders, dt, 1);
      syncMesh(bot);
      continue;
    }
    brain.defusing = false;

    if (bot.team === 'ash') {
      // Defenders: hold, patrol the site's approaches, rotate to gunfire.
      if (brain.heard && game.time - brain.heard.t < 4 && brain.mode !== 'rotate') {
        const to = nearestWaypoint(world.waypoints, brain.heard.x, brain.heard.z);
        setPath(bot, world, to);
        brain.mode = 'rotate';
      }
      if (brain.mode === 'rotate') {
        if (followPath(bot, world, world.colliders, dt, 1)) {
          brain.mode = 'hold';
          brain.holdUntil = 2 + game.random() * 2;
          brain.heard = null;
        }
      } else if (brain.mode === 'hold') {
        brain.holdUntil -= dt;
        // Slow scan so a held angle is not a statue.
        bot.yaw += Math.sin(game.time * 0.5 + bot.id.charCodeAt(bot.id.length - 1)) * dt * 0.25;
        if (brain.holdUntil <= 0) {
          const dest = brain.patrolWp === brain.homeWp ? brain.patrolWp : brain.homeWp;
          brain.patrolWp = dest;
          setPath(bot, world, dest);
          brain.mode = 'patrol';
        }
      } else if (brain.mode === 'patrol') {
        if (followPath(bot, world, world.colliders, dt, 0.85)) {
          brain.mode = 'hold';
          brain.holdUntil = 2 + game.random() * 3;
        }
      } else {
        brain.mode = 'hold';
        brain.holdUntil = 2;
      }
    } else {
      // Attackers: push their site, then sweep it.
      if (brain.mode === 'push') {
        const siteWp = brain.site === 'A' ? 5 : 8;
        if (brain.path.length === 0) setPath(bot, world, siteWp);
        if (followPath(bot, world, world.colliders, dt, 1)) {
          brain.mode = 'hold';
          brain.holdUntil = 3 + game.random() * 2;
        }
      } else if (brain.mode === 'hold') {
        brain.holdUntil -= dt;
        bot.yaw += Math.sin(game.time * 0.6) * dt * 0.3;
        if (brain.holdUntil <= 0) {
          const dest = brain.site === 'A' ? 15 : 16;
          setPath(bot, world, dest);
          brain.mode = 'patrol';
        }
      } else if (brain.mode === 'patrol') {
        if (followPath(bot, world, world.colliders, dt, 0.85)) {
          brain.mode = 'push';
          brain.path = [];
        }
      } else {
        brain.mode = 'push';
        brain.path = [];
      }
    }
    // Keep the render mesh on the simulated body.
    syncMesh(bot);
  }
}
