// Weapons: fire, reload and spread. One weapon record per agent lives on the
// agent (mag/reserve/reloading/cooldown); the table in state.js is the spec.
// Spread grows with movement speed, being airborne, and sustained fire
// (bloom), so stopping to aim pays — the heart of the gunplay criterion.
import { WEAPONS, GRENADE_PRICE } from './state.js';
import { groundSpeed } from './player.js';
import { clamp } from './rng.js';

export function weaponDef(agent) {
  return WEAPONS[agent.weaponId];
}

export function canFire(agent) {
  const def = weaponDef(agent);
  return agent.alive && agent.cooldown <= 0 && agent.reloading <= 0 && agent.mag > 0;
}

// Current spread in radians for this agent, from its state.
export function currentSpread(agent) {
  const def = weaponDef(agent);
  const speed = groundSpeed(agent);
  const moving = clamp(speed / 5.2, 0, 1);
  const air = agent.onGround ? 0 : 0.5;
  const crouch = agent.crouching ? -0.25 : 0;
  return def.spread + def.moveSpread * (moving + air) * (1 + crouch) + agent.spreadBloom;
}

export function takeRound(agent) {
  if (agent.mag <= 0) return false;
  agent.mag -= 1;
  agent.cooldown = weaponDef(agent).rate;
  agent.spreadBloom = Math.min(0.03, agent.spreadBloom + weaponDef(agent).recoil * 0.55);
  return true;
}

export function startReload(agent) {
  const def = weaponDef(agent);
  if (agent.reloading > 0 || agent.mag >= def.mag || agent.reserve <= 0) return false;
  agent.reloading = def.reload;
  return true;
}

export function stepWeapon(agent, dt) {
  if (agent.cooldown > 0) agent.cooldown -= dt;
  agent.spreadBloom = Math.max(0, agent.spreadBloom - dt * 0.05);
  if (agent.reloading > 0) {
    agent.reloading -= dt;
    if (agent.reloading <= 0) {
      const def = weaponDef(agent);
      const need = def.mag - agent.mag;
      const take = Math.min(need, agent.reserve);
      agent.mag += take;
      agent.reserve -= take;
    }
  }
}

export function buyWeapon(game, weaponId) {
  const def = WEAPONS[weaponId];
  if (!def || game.money < def.price) return false;
  if (game.player.weaponId === weaponId) return false;
  game.money -= def.price;
  const player = game.player;
  player.weaponId = weaponId;
  player.mag = def.mag;
  player.reserve = def.reserve;
  player.reloading = 0;
  return true;
}

export function buyGrenade(game) {
  if (game.money < GRENADE_PRICE || game.playerGrenades >= 2) return false;
  game.money -= GRENADE_PRICE;
  game.playerGrenades += 1;
  return true;
}
