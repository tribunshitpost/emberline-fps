// Emberline — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. ?shot=start|play|end with &seed=N stages a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createGame, createAgent, WEAPONS, START_MONEY } from './state.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { moveAgent, lookAgent, groundSpeed } from './player.js';
import { spawnBots, resetBots, stepBots } from './bots.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createEffects, createViewmodel } from './effects.js';
import { fireWeapon, buildShootables, stepGrenades, throwGrenade, createGrenadeMesh } from './combat.js';
import { canFire, startReload, stepWeapon, currentSpread, buyWeapon, buyGrenade, weaponDef } from './weapons.js';
import { startBuyPhase, startLivePhase, stepRounds, onPlayerDeath } from './rounds.js';
import { clamp } from './rng.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const game = createGame(shot ? seed : (Date.now() % 2147483647));
game.keptWeapon = 'pistol';
game.playerGrenades = 0;
game.lastShot = null;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color('#2a2118'), 34, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const fx = createEffects(scene);
const viewmodel = createViewmodel(camera, scene);
const audio = createAudio();
const hud = createHud(game);

// The player: an agent like any other, with no body mesh (first person).
const player = createAgent('player', 'ember', 'YOU', 'pistol', 0, 16, 0);
player.plantHeld = false;
game.player = player;
spawnBots(game, world, scene);
const shootables = buildShootables(game, world);

const input = createInput(renderer.domElement, onLockChange);
let started = false;
let frozen = false;
let buyOpen = false;
let lastBanner = '';
let lastFeedLen = -1;
let accumulator = 0;
let lastTime = performance.now();

hud.setAmmo(player.mag, player.reserve);
hud.setWeapon(WEAPONS.pistol.name);
hud.setHealth(100);
hud.setScore(0, 0);
hud.setMoney(game.money);
hud.setTimer(100);
hud.setAlive(3, 4);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.phase === 'matchEnd') {
    // Fresh match.
    game.score = { ember: 0, ash: 0 };
    game.round = 1;
    game.money = START_MONEY;
    game.keptWeapon = 'pistol';
    game.playerGrenades = 0;
    game.killfeed = [];
    game.stats = { kills: 0, deaths: 0, plants: 0, shots: 0, hits: 0 };
  }
  if (game.phase === 'menu' || game.phase === 'matchEnd') {
    startBuyPhase(game, world, audio);
    resetBots(game, world);
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
    buyOpen = false;
  } else if (game.phase !== 'matchEnd') {
    hud.showOverlay(started ? 'paused' : 'start', game.stats.kills * 100);
    hud.showBuy(false);
    buyOpen = false;
  }
}

function onHit(victim, part, damage, killed, attacker) {
  if (attacker === player) {
    hud.hitMarker(killed, shot ? 60000 : 120);
    if (killed) audio.kill(); else audio.hit();
  }
  if (victim === player) {
    hud.damageFlash();
    if (killed) {
      game.stats.deaths += 1;
      onPlayerDeath(game);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
}

function botFire(bot) {
  fireWeapon(game, world, bot, shootables, fx, onHit);
  const d = Math.hypot(bot.x - player.x, bot.z - player.z);
  if (d < 45) audio.enemyShot();
}

function syncCamera() {
  // Dead players spectate their first living ally.
  let eye = player;
  if (!player.alive) {
    const ally = game.allies.find((a) => a.alive);
    if (ally) eye = ally;
  }
  camera.position.set(eye.x, eye.y + eye.eye, eye.z);
  camera.rotation.set(eye.pitch, eye.yaw, 0, 'YXZ');
}

function aimPlayerAt(x, y, z) {
  const dx = x - player.x;
  const dy = y - (player.y + player.eye);
  const dz = z - player.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(clamp(dy / len, -1, 1));
}

function tryBuy(id) {
  if (game.phase !== 'buy') return;
  let ok = false;
  if (id === 'grenade') ok = buyGrenade(game);
  else {
    ok = buyWeapon(game, id);
    if (ok) game.keptWeapon = id;
  }
  if (ok) {
    audio.buy();
    hud.setMoney(game.money);
    hud.setWeapon(weaponDef(player).name);
    hud.setAmmo(player.mag, player.reserve);
    hud.setNades(game.playerGrenades);
    hud.showBuy(true, tryBuy);
  }
}

function step(dt) {
  game.time += dt;
  const prevPhase = game.phase;
  if (game.phase === 'buy' || game.phase === 'live') {
    // Player movement from keys, relative to facing.
    const keys = input.keys;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if ((forward || strafe) && player.alive) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
    }
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    moveAgent(player, world.colliders, dt, wishX, wishZ, keys.has('Space'), crouch);
    stepWeapon(player, dt);
    player.plantHeld = keys.has('KeyE');
  }
  if (game.phase === 'live') {
    stepBots(game, world, dt, botFire);
    stepGrenades(game, world, dt, fx, onHit);
    for (const g of game.grenades) {
      if (!g.mesh) g.mesh = createGrenadeMesh(scene);
    }
  } else if (game.phase === 'buy') {
    // Bots idle at their spawns during the buy phase; keep meshes synced.
    for (const bot of [...game.allies, ...game.enemies]) {
      if (bot.mesh) { bot.mesh.position.set(bot.x, bot.y, bot.z); bot.mesh.rotation.y = bot.yaw + Math.PI; }
    }
  }
  stepRounds(game, world, dt, audio);
  if (prevPhase === 'roundEnd' && game.phase === 'buy') resetBots(game, world);
  if (game.phase === 'matchEnd' && prevPhase !== 'matchEnd' && !shot) {
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('end', game.stats.kills * 100);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive) lookAgent(player, look.x, look.y);
    // Fire, reload, grenade, buy — frame-rate input, sim-rate effects.
    if (game.phase === 'live' && player.alive && input.locked) {
      if (input.firing && canFire(player)) {
        fireWeapon(game, world, player, shootables, fx, onHit);
        viewmodel.fire();
        audio.shot(player.weaponId);
      }
    }
    for (const code of input.pressed) {
      if (code === 'KeyR' && player.alive) {
        if (startReload(player)) audio.reload();
      } else if (code === 'KeyG' && game.phase === 'live' && player.alive && game.playerGrenades > 0) {
        game.playerGrenades -= 1;
        throwGrenade(game, player);
        hud.setNades(game.playerGrenades);
      } else if (code === 'KeyB' && game.phase === 'buy') {
        buyOpen = !buyOpen;
        hud.showBuy(buyOpen, tryBuy);
      } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
        tryBuy({ Digit1: 'rifle', Digit2: 'smg', Digit3: 'pistol', Digit4: 'grenade' }[code]);
      }
    }
    input.endStep();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // HUD, once per frame from the single state store.
    hud.setHealth(player.hp);
    hud.setAmmo(player.mag, player.reserve);
    hud.setWeapon(weaponDef(player).name);
    hud.setTimer(game.timer);
    hud.setScore(game.score.ember, game.score.ash);
    hud.setMoney(game.money);
    hud.setNades(game.playerGrenades);
    const emberAlive = (player.alive ? 1 : 0) + game.allies.filter((a) => a.alive).length;
    const ashAlive = game.enemies.filter((a) => a.alive).length;
    hud.setAlive(emberAlive, ashAlive);
    hud.setSpread(3 + currentSpread(player) * 900);
    hud.setPlant(game.bomb.plantProgress / 3.2, game.enemies.some((b) => b.brain?.defusing), game.bomb.defuseProgress / 5);
    hud.setBomb(game.bomb);
    if (game.killfeed.length !== lastFeedLen) {
      lastFeedLen = game.killfeed.length;
      hud.setKillfeed(game.killfeed);
    }
    if (game.banner && `${game.banner.title}|${game.round}|${game.phase}` !== lastBanner) {
      lastBanner = `${game.banner.title}|${game.round}|${game.phase}`;
      hud.showBanner(game.banner.title, game.banner.sub);
    }
    viewmodel.step(dt, groundSpeed(player) > 0.5, player.reloading > 0);
    fx.step(dt);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  game.money = 4000;
  startBuyPhase(game, world, audio);
  resetBots(game, world);
  if (name === 'start') {
    // Buy phase at the Ember spawn, rifle bought, menu open, mid in view.
    buyWeapon(game, 'rifle');
    game.keptWeapon = 'rifle';
    hud.showBuy(true, tryBuy);
    hud.setMoney(game.money);
    // Allies step ahead into the frame so the cover shows the team.
    const allyA = game.allies[0];
    allyA.x = -2; allyA.z = 10; allyA.yaw = 0;
    if (allyA.mesh) { allyA.mesh.position.set(allyA.x, allyA.y, allyA.z); allyA.mesh.rotation.y = allyA.yaw + Math.PI; }
    const allyB = game.allies[1];
    allyB.x = 2.5; allyB.z = 8; allyB.yaw = 0;
    if (allyB.mesh) { allyB.mesh.position.set(allyB.x, allyB.y, allyB.z); allyB.mesh.rotation.y = allyB.yaw + Math.PI; }
    settle(30);
    aimPlayerAt(0, 1.6, -8);
  } else if (name === 'play') {
    // Mid-round firefight: live, player in mid aiming at a visible Ash bot.
    startLivePhase(game, audio);
    game.timer = 85;
    player.x = 0; player.z = 6;
    const foe = game.enemies[0];
    foe.x = 1.5; foe.z = 0; foe.yaw = Math.PI;
    if (foe.mesh) { foe.mesh.position.set(foe.x, foe.y, foe.z); foe.mesh.rotation.y = foe.yaw + Math.PI; }
    const ally = game.allies[0];
    ally.x = -4.5; ally.z = 4; ally.yaw = 0;
    if (ally.mesh) { ally.mesh.position.set(ally.x, ally.y, ally.z); ally.mesh.rotation.y = ally.yaw + Math.PI; }
    buyWeapon(game, 'rifle');
    game.keptWeapon = 'rifle';
    settle(25);
    aimPlayerAt(foe.x, 1.3, foe.z);
    fireWeapon(game, world, player, shootables, fx, onHit);
    viewmodel.fire();
    hud.setHealth(player.hp);
    hud.setAmmo(player.mag, player.reserve);
  } else {
    // Round won at Site A: banner up, charge site in view, feed populated.
    game.score.ember = 1;
    game.phase = 'roundEnd';
    game.banner = { title: 'ROUND WON', sub: 'Enemy team eliminated — Ember 1 : 0 Ash', t: 0 };
    buyWeapon(game, 'rifle');
    game.keptWeapon = 'rifle';
    player.x = -11; player.z = -6;
    const ally = game.allies[1];
    ally.x = -13; ally.z = -9; ally.yaw = 0.6;
    if (ally.mesh) { ally.mesh.position.set(ally.x, ally.y, ally.z); ally.mesh.rotation.y = ally.yaw + Math.PI; }
    game.killfeed = [
      { text: 'YOU ▸ RUST (headshot)', team: 'ember', t: 0 },
      { text: 'FLINT ▸ SLAG', team: 'ember', t: 0 },
    ];
    hud.setKillfeed(game.killfeed);
    hud.showBanner(game.banner.title, game.banner.sub, 60000);
    settle(20);
    aimPlayerAt(-15, 1.2, -11);
  }
  hud.setHealth(player.hp);
  hud.setAmmo(player.mag, player.reserve);
  hud.setWeapon(weaponDef(player).name);
  hud.setTimer(game.timer);
  hud.setScore(game.score.ember, game.score.ash);
  hud.setMoney(game.money);
  hud.setNades(game.playerGrenades);
  hud.setAlive((player.alive ? 1 : 0) + game.allies.filter((a) => a.alive).length, game.enemies.filter((a) => a.alive).length);
  hud.setBomb(game.bomb);
  syncCamera();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
// Debug handle for play-testing (used by the local soak test): the live game
// state, read-only in spirit — the game never reads it back.
window.__ember = { game, player };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
