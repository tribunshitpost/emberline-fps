// HUD: all DOM reads and writes in one place. The simulation never touches
// the DOM; main.js calls these setters once per rendered frame.
import { WEAPONS, GRENADE_PRICE } from './state.js';

function el(id) { return document.getElementById(id); }

export function createHud(game) {
  const refs = {
    hp: el('hp-value'), hpBar: el('hp-bar'), ammoMag: el('ammo-mag'), ammoReserve: el('ammo-reserve'),
    ammoBox: el('ammo'), timer: el('timer'), score: el('score-value'), money: el('money-value'),
    weapon: el('weapon-name'), alive: el('alive'), killfeed: el('killfeed'),
    banner: el('banner'), bannerTitle: el('banner-title'), bannerSub: el('banner-sub'),
    overlay: el('overlay'), overlayTitle: el('overlay-title'), overlayCopy: el('overlay-copy'),
    playBtn: el('play'), buyMenu: el('buy-menu'), buyList: el('buy-list'),
    crosshair: el('crosshair'), hitmarker: el('hitmarker'), vignette: el('vignette'),
    plantBar: el('plant-bar'), plantFill: el('plant-fill'), plantLabel: el('plant-label'),
    bomb: el('bomb-status'), nades: el('nades'),
  };
  let hitTimer = null;
  let bannerTimer = null;

  function showOverlay(kind, score) {
    refs.overlay.hidden = false;
    refs.buyMenu.hidden = true;
    if (kind === 'start') {
      refs.overlayTitle.textContent = 'EMBERLINE';
      refs.overlayCopy.textContent = 'A tactical FPS on Foundry Yard. Plant the charge at Furnace (A) or Crane (B), or eliminate the Ash defenders. First to 5 rounds takes the match.';
      refs.playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      refs.overlayTitle.textContent = 'Paused';
      refs.overlayCopy.textContent = 'Click to keep playing.';
      refs.playBtn.textContent = 'Resume';
    } else if (kind === 'end') {
      const won = game.winner === 'ember';
      refs.overlayTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      refs.overlayCopy.textContent = `Final — Ember ${game.score.ember} : ${game.score.ash} Ash. ${score} points scored.`;
      refs.playBtn.textContent = 'Play again';
    }
  }
  function hideOverlay() { refs.overlay.hidden = true; }

  const hud = {
    setHealth(hp) {
      refs.hp.textContent = Math.max(0, Math.ceil(hp));
      refs.hpBar.style.width = `${Math.max(0, hp)}%`;
      refs.hpBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve) {
      refs.ammoMag.textContent = mag;
      refs.ammoReserve.textContent = `/ ${reserve}`;
      refs.ammoBox.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { refs.weapon.textContent = name; },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      refs.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      refs.timer.classList.toggle('urgent', seconds <= 10);
    },
    setScore(ember, ash) { refs.score.textContent = `${ember} : ${ash}`; },
    setMoney(money) { refs.money.textContent = `$${money}`; },
    setNades(n) { refs.nades.textContent = n > 0 ? `◉ ${n}` : ''; },
    setAlive(ember, ash) { refs.alive.textContent = `EMBER ${ember} · ASH ${ash}`; },
    setSpread(spreadPx) {
      refs.crosshair.style.setProperty('--gap', `${spreadPx}px`);
    },
    hitMarker(killed, holdMs = 90) {
      refs.hitmarker.classList.add('on');
      refs.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => refs.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      refs.vignette.classList.add('on');
      setTimeout(() => refs.vignette.classList.remove('on'), 180);
    },
    setKillfeed(feed) {
      refs.killfeed.innerHTML = feed.map((f) => `<div class="${f.team}">${f.text}</div>`).join('');
    },
    setPlant(progress, defusing, defuseProgress) {
      if (progress > 0) {
        refs.plantBar.hidden = false;
        refs.plantLabel.textContent = 'PLANTING…';
        refs.plantFill.style.width = `${Math.min(100, progress * 100)}%`;
      } else if (defusing) {
        refs.plantBar.hidden = false;
        refs.plantLabel.textContent = 'DEFUSING…';
        refs.plantFill.style.width = `${Math.min(100, defuseProgress * 100)}%`;
      } else {
        refs.plantBar.hidden = true;
      }
    },
    setBomb(bomb) {
      if (bomb.planted) {
        refs.bomb.hidden = false;
        refs.bomb.textContent = `◉ CHARGE ${bomb.site} — ${Math.ceil(bomb.detonate)}s`;
      } else if (bomb.site) {
        refs.bomb.hidden = false;
        refs.bomb.textContent = `◎ SITE ${bomb.site} — hold E to plant`;
      } else {
        refs.bomb.hidden = true;
      }
    },
    showBanner(title, sub, ms = 2600) {
      refs.bannerTitle.textContent = title;
      refs.bannerSub.textContent = sub;
      refs.banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { refs.banner.hidden = true; }, ms);
    },
    showOverlay,
    hideOverlay,
    onPlay(handler) { refs.playBtn.addEventListener('click', handler); },
    // Buy menu: rebuilt each time it opens so prices and money are current.
    showBuy(open, onBuy) {
      refs.buyMenu.hidden = !open;
      if (!open) return;
      const items = [
        { key: '1', id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, desc: '25-round automatic rifle — accurate, hard-hitting' },
        { key: '2', id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, desc: '32-round SMG — fast up close, wild at range' },
        { key: '3', id: 'pistol', name: WEAPONS.pistol.name, price: 0, desc: 'Your sidearm — already owned' },
        { key: '4', id: 'grenade', name: 'Frag Grenade', price: GRENADE_PRICE, desc: 'Thrown explosive — clears a site (max 2)' },
      ];
      refs.buyList.innerHTML = items.map((item) => `
        <button type="button" data-buy="${item.id}" ${game.money < item.price ? 'disabled' : ''}>
          <span class="buy-key">${item.key}</span>
          <span class="buy-name">${item.name}</span>
          <span class="buy-desc">${item.desc}</span>
          <span class="buy-price">${item.price === 0 ? 'OWNED' : '$' + item.price}</span>
        </button>`).join('');
      refs.buyList.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => onBuy(btn.dataset.buy));
      });
    },
  };
  return hud;
}
