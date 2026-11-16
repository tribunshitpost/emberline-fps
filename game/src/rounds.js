// Rounds: the phase machine. buy -> live -> roundEnd -> buy ... -> matchEnd.
// Ember (the player) wins a round by eliminating Ash, or by planting the
// charge and having it detonate. Ash wins by eliminating Ember, by running
// the clock out before a plant, or by defusing a planted charge.
import {
  BUY_TIME, ROUND_TIME, PLANT_TIME, DEFUSE_TIME, DETONATE_TIME,
  ROUNDS_TO_WIN, MAX_ROUNDS, WIN_REWARD, LOSS_REWARD, PLANT_REWARD,
} from './state.js';

export function startBuyPhase(game, world, audio) {
  game.phase = 'buy';
  game.phaseTime = 0;
  game.timer = BUY_TIME;
  game.bomb = { site: null, planted: false, plantProgress: 0, defuseProgress: 0, detonate: 0, carrier: 'player' };
  // Respawn the player at the Ember spawn with fresh health and full ammo
  // for the weapon they kept. Allies and enemies are rebuilt by main.js.
  const player = game.player;
  const spawn = world.spawns.ember[0];
  const mags = { pistol: 12, rifle: 25, smg: 32 };
  const reserves = { pistol: 36, rifle: 75, smg: 96 };
  player.weaponId = game.keptWeapon ?? 'pistol';
  player.alive = true;
  player.hp = 100;
  player.x = spawn.x; player.z = spawn.z; player.y = 0;
  player.yaw = 0; player.pitch = 0;
  player.vx = 0; player.vz = 0; player.vy = 0;
  player.mag = mags[player.weaponId];
  player.reserve = reserves[player.weaponId];
  player.reloading = 0; player.cooldown = 0; player.spreadBloom = 0;
  player.crouching = false; player.height = 1.72; player.eye = 1.6;
  game.banner = { title: `ROUND ${game.round}`, sub: 'Buy phase — press B for the buy menu', t: 0 };
}

export function startLivePhase(game, audio) {
  game.phase = 'live';
  game.phaseTime = 0;
  game.timer = ROUND_TIME;
  game.banner = { title: 'GO', sub: 'Plant the charge at Furnace (A) or Crane (B)', t: 0 };
}

function endRound(game, winner, reason, audio) {
  if (game.phase === 'roundEnd' || game.phase === 'matchEnd') return;
  game.score[winner] += 1;
  const won = winner === 'ember';
  game.money += won ? WIN_REWARD : LOSS_REWARD;
  game.phase = 'roundEnd';
  game.phaseTime = 0;
  game.timer = 5;
  game.banner = {
    title: won ? 'ROUND WON' : 'ROUND LOST',
    sub: `${reason} — Ember ${game.score.ember} : ${game.score.ash} Ash`,
    t: 0,
  };
  if (won) audio.roundWin(); else audio.roundLose();
  if (game.score.ember >= ROUNDS_TO_WIN || game.score.ash >= ROUNDS_TO_WIN || game.round >= MAX_ROUNDS) {
    game.phase = 'matchEnd';
    game.winner = game.score.ember > game.score.ash ? 'ember' : 'ash';
    game.banner = {
      title: game.winner === 'ember' ? 'MATCH WON' : 'MATCH LOST',
      sub: `Final — Ember ${game.score.ember} : ${game.score.ash} Ash. Click to play again.`,
      t: 0,
    };
  }
}

export function stepRounds(game, world, dt, audio) {
  game.phaseTime += dt;
  if (game.phase === 'buy') {
    game.timer = Math.max(0, BUY_TIME - game.phaseTime);
    if (game.phaseTime >= BUY_TIME) startLivePhase(game, audio);
    return;
  }
  if (game.phase === 'roundEnd') {
    game.timer = Math.max(0, 5 - game.phaseTime);
    if (game.phaseTime >= 5) {
      game.round += 1;
      startBuyPhase(game, world, audio);
    }
    return;
  }
  if (game.phase !== 'live') return;

  game.timer = Math.max(0, ROUND_TIME - game.phaseTime);
  const bomb = game.bomb;

  // Planting: the player holds E inside a site while alive and carrying.
  const player = game.player;
  if (!bomb.planted && player.alive && bomb.carrier !== false) {
    const site = sitePlayerStandsIn(game, world);
    if (site && player.plantHeld) {
      bomb.site = site;
      bomb.plantProgress += dt;
      if (Math.floor(bomb.plantProgress * 4) !== Math.floor((bomb.plantProgress - dt) * 4)) audio.plantBeep();
      if (bomb.plantProgress >= PLANT_TIME) {
        bomb.planted = true;
        bomb.detonate = DETONATE_TIME;
        game.money += PLANT_REWARD;
        game.stats.plants += 1;
        game.banner = { title: 'CHARGE PLANTED', sub: `Defend ${world.sites[site].name} — detonation in ${DETONATE_TIME}s`, t: 0 };
        audio.plantBeep();
      }
    } else {
      bomb.plantProgress = 0;
      bomb.site = site;
    }
  }
  // Detonation countdown once planted.
  if (bomb.planted) {
    bomb.detonate -= dt;
    if (bomb.detonate <= 0) {
      endRound(game, 'ember', 'The charge detonated', audio);
      return;
    }
    if (bomb.defuseProgress >= DEFUSE_TIME) {
      endRound(game, 'ash', 'The charge was defused', audio);
      return;
    }
  }
  // Elimination and clock.
  const emberAlive = (player.alive ? 1 : 0) + game.allies.filter((a) => a.alive).length;
  const ashAlive = game.enemies.filter((a) => a.alive).length;
  if (ashAlive === 0) {
    endRound(game, 'ember', bomb.planted ? 'Site cleared' : 'Enemy team eliminated', audio);
    return;
  }
  if (emberAlive === 0) {
    endRound(game, 'ash', 'Your team was eliminated', audio);
    return;
  }
  if (game.timer <= 0) {
    endRound(game, bomb.planted ? 'ember' : 'ash', bomb.planted ? 'Time expired after the plant' : 'Time expired — no plant', audio);
  }
}

function sitePlayerStandsIn(game, world) {
  const p = game.player;
  for (const key of ['A', 'B']) {
    if (world.sites[key].box.containsPoint({ x: p.x, y: 1, z: p.z })) return key;
  }
  return null;
}

// Called when the player dies: the charge drops, so the round can only be
// won by elimination from here.
export function onPlayerDeath(game) {
  game.bomb.carrier = false;
  game.bomb.plantProgress = 0;
}
