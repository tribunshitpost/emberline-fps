// One state store for the whole game. The fixed-step simulation (main.js)
// mutates this object; rendering and the HUD only read it. Nothing else
// keeps game state, so a round can be reset by rebuilding it.
import { mulberry32 } from './rng.js';

export const ROUND_TIME = 100;      // seconds a round lasts before it expires
export const BUY_TIME = 18;         // seconds of buy phase before a round
export const PLANT_TIME = 3.2;      // seconds holding E on a site to plant
export const DEFUSE_TIME = 5;       // seconds a defender needs to defuse
export const DETONATE_TIME = 35;    // seconds from plant to detonation
export const ROUNDS_TO_WIN = 5;     // first to 5 takes the match (max 9)
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;

// Weapon table: damage is per body hit; headshots multiply by 3. Spread is
// in radians at rest; moving, airborne and sustained fire all widen it.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, auto: false,
    damage: 26, headMul: 3, mag: 12, reserve: 36, reload: 1.1,
    rate: 0.16, spread: 0.012, moveSpread: 0.030, recoil: 0.011,
    range: 60, tracer: 0xece5d8,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Rifle', price: 2700, auto: true,
    damage: 34, headMul: 3, mag: 25, reserve: 75, reload: 2.2,
    rate: 0.1, spread: 0.006, moveSpread: 0.024, recoil: 0.016,
    range: 90, tracer: 0xf0a830,
  },
  smg: {
    id: 'smg', name: 'Raptor SMG', price: 1500, auto: true,
    damage: 22, headMul: 3, mag: 32, reserve: 96, reload: 1.8,
    rate: 0.067, spread: 0.014, moveSpread: 0.034, recoil: 0.009,
    range: 45, tracer: 0x3fb6a8,
  },
};
export const GRENADE_PRICE = 300;

export function createGame(seed) {
  return {
    random: mulberry32(seed),
    seed,
    time: 0,
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0,
    round: 1,
    score: { ember: 0, ash: 0 },
    timer: BUY_TIME,
    money: START_MONEY,
    // Bomb state: site is 'A' | 'B' | null; planted counts down to detonation.
    bomb: { site: null, planted: false, plantProgress: 0, defuseProgress: 0, detonate: 0, carrier: 'player' },
    player: null,   // filled in by main.js
    allies: [],     // bot agents on Ember (player's team)
    enemies: [],    // bot agents on Ash (defenders)
    grenades: [],
    killfeed: [],   // {text, team, t}
    banner: null,   // {title, sub, t}
    winner: null,
    stats: { kills: 0, deaths: 0, plants: 0, shots: 0, hits: 0 },
  };
}

// A fresh agent record. Bots and the player share this shape so combat,
// the HUD and the AI all treat them the same way.
export function createAgent(id, team, name, weaponId, x, z, yaw) {
  const def = WEAPONS[weaponId];
  return {
    id, team, name,
    alive: true, hp: 100,
    x, z, y: 0, yaw, pitch: 0,
    vx: 0, vz: 0, vy: 0,
    eye: 1.6, height: 1.72, crouching: false, onGround: true,
    weaponId, mag: def.mag, reserve: def.reserve,
    reloading: 0, cooldown: 0, spreadBloom: 0,
    // Bot brain (unused for the player).
    brain: null,
    // Rendering handles, attached by bots.js / main.js.
    mesh: null, headMesh: null, bodyMesh: null, gunMesh: null,
  };
}
