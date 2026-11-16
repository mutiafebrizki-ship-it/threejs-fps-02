// hud.js — every pixel that is not the 3D scene: health, ammo, timer, score, money,
// killfeed, banners, buy menu, scoreboard, minimap and the damage vignette.
// DOM writes happen only when a value actually changes.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';
import { BUY_ITEMS } from './rounds.js';
import { COLLIDERS, SITES } from './world.js';
import { TEAM } from './state.js';

const $ = (id) => document.getElementById(id);
const cache = {};

function setText(id, text) {
  if (cache[id] !== text) { cache[id] = text; $(id).textContent = text; }
}
function setShown(id, shown) {
  const el = $(id);
  if (!el) return;
  const hidden = !shown;
  if (el.hidden !== hidden) el.hidden = hidden;
}

export function initHUD(state, cb) {
  // buy menu items
  const list = $('buy-list');
  list.innerHTML = '';
  BUY_ITEMS.forEach((item, i) => {
    const row = document.createElement('button');
    row.className = 'buy-row';
    row.type = 'button';
    row.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => cb.onBuy(item.key));
    list.appendChild(row);
  });
  $('buy-close').addEventListener('click', () => cb.onCloseBuy());
  $('play-btn').addEventListener('click', () => cb.onPlay());
  $('again-btn').addEventListener('click', () => cb.onPlay());

  // minimap: static walls drawn once, actors each update
  const mm = $('minimap');
  mm.width = 150; mm.height = 110;
}

function drawMinimap(state) {
  const mm = $('minimap');
  if (!mm) return;
  const g = mm.getContext('2d');
  const W = mm.width, H = mm.height;
  const sx = (x) => ((x + 32) / 64) * W;
  const sz = (z) => ((z + 22) / 44) * H;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(20,22,26,0.72)';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#8d8a80';
  for (const b of COLLIDERS) g.fillRect(sx(b.x0), sz(b.z0), sx(b.x1) - sx(b.x0), sz(b.z1) - sz(b.z0));
  for (const [name, s] of Object.entries(SITES)) {
    g.fillStyle = state.bomb.planted && state.bomb.site === name ? '#e05a4e' : '#f0a830';
    g.beginPath(); g.arc(sx(s.x), sz(s.z), 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#14161a';
    g.font = 'bold 8px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, sx(s.x), sz(s.z));
  }
  // teammates
  g.fillStyle = '#f0c040';
  for (const b of state.bots) {
    if (b.team === TEAM.ATK && b.alive) { g.beginPath(); g.arc(sx(b.pos.x), sz(b.pos.z), 3, 0, Math.PI * 2); g.fill(); }
  }
  // enemies only when the player can see them
  g.fillStyle = '#e05a4e';
  for (const b of state.bots) {
    if (b.team === TEAM.DEF && b.alive && b.seenByPlayer) { g.beginPath(); g.arc(sx(b.pos.x), sz(b.pos.z), 3, 0, Math.PI * 2); g.fill(); }
  }
  // player arrow
  const p = state.player;
  g.save();
  g.translate(sx(p.pos.x), sz(p.pos.z));
  g.rotate(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) + Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
  g.restore();
}

export function flashHit(head) {
  const el = $('hitmarker');
  el.classList.remove('on');
  void el.offsetWidth; // restart the transition
  el.classList.add('on');
  el.style.setProperty('--hm-color', head ? '#e05a4e' : '#f0a830');
  setTimeout(() => el.classList.remove('on'), 120);
}

export function showBanner(title, sub, ms = 2600) {
  setText('banner-title', title);
  setText('banner-sub', sub || '');
  setShown('banner', true);
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => setShown('banner', false), ms);
}

let mmTimer = 0;

export function updateHUD(state, dt) {
  const p = state.player;
  const def = WEAPONS[p.weapon];

  // the menu covers the screen: hide the in-game HUD behind it
  $('hud').style.visibility = state.phase === 'menu' ? 'hidden' : 'visible';

  setText('health-num', String(Math.max(0, Math.ceil(p.hp))));
  setText('armor-num', String(Math.ceil(p.armor)));
  setText('ammo-mag', String(p.ammo.mag));
  setText('ammo-reserve', `/ ${p.ammo.reserve}`);
  setText('weapon-name', def.name);
  setText('grenades', `HE-7 × ${p.grenades}`);
  setText('money', `$${state.money}`);
  setText('score-atk', String(state.score.atk));
  setText('score-def', String(state.score.def));
  setText('round-num', `Round ${state.round}`);
  const t = Math.max(0, Math.ceil(state.phaseTimer));
  setText('timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);

  const ammoEl = $('ammo');
  ammoEl.classList.toggle('empty', p.ammo.mag === 0);

  // bomb status line
  const bomb = state.bomb;
  let bombText = '';
  if (bomb.planted) bombText = `SPIKE PLANTED ${bomb.site} — ${Math.ceil(bomb.timer)}s`;
  else if (bomb.plantProgress > 0) bombText = `Planting spike… ${Math.round((bomb.plantProgress / 3.2) * 100)}%`;
  else if (bomb.defuseProgress > 0) bombText = `Defusing spike… ${Math.round((bomb.defuseProgress / 5) * 100)}%`;
  else if (p.bombCarrier && p.alive) bombText = 'You carry the spike — plant at A or B (hold E)';
  else if (bomb.carrier && bomb.carrier !== 'player') bombText = `${bomb.carrier.name} carries the spike`;
  setText('bomb-status', bombText);

  // crosshair spread from bloom + movement
  const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
  const gap = 4 + p.bloom * 14 + (moving ? 5 : 0) + (p.crouch ? -2 : 0);
  $('crosshair').style.setProperty('--gap', `${gap}px`);

  // damage vignette + direction
  const vig = $('vignette');
  vig.style.opacity = p.damageFlash > 0 ? String(Math.min(0.85, p.damageFlash)) : '0';
  const dir = $('dmg-dir');
  if (p.damageFlash > 0.1) {
    const rel = p.lastDamageFrom - p.yaw;
    dir.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
    dir.style.opacity = '1';
  } else dir.style.opacity = '0';

  // killfeed
  const kf = $('killfeed');
  const html = state.killfeed.filter((k) => k.life > 0)
    .map((k) => `<div style="color:${k.color}">${k.text}</div>`).join('');
  if (cache.killfeed !== html) { cache.killfeed = html; kf.innerHTML = html; }

  // phase overlays
  setShown('menu', state.phase === 'menu');
  setShown('matchend', state.phase === 'matchend');
  setShown('buy-menu', state.phase === 'buy' && state.buyOpen);
  setShown('dead-banner', state.phase === 'live' && !p.alive);
  if (state.phase === 'matchend') {
    setText('matchend-title', state.matchWinner === TEAM.ATK ? 'Victory — Yard 7 is yours' : 'Defeat — the yard holds');
    setText('matchend-sub', `Final score ${state.score.atk} — ${state.score.def}`);
  }
  setShown('scoreboard', !!state.scoreboardOpen);
  if (state.scoreboardOpen) {
    const rows = [];
    const you = `<tr><td>You</td><td>ATK</td><td>${p.kills}</td><td>${p.alive ? '' : '✕'}</td><td>$${state.money}</td></tr>`;
    rows.push(you);
    for (const b of state.bots) {
      rows.push(`<tr><td>${b.name}</td><td>${b.team === TEAM.ATK ? 'ATK' : 'DEF'}</td><td>${b.kills}</td><td>${b.alive ? '' : '✕'}</td><td>$${b.money}</td></tr>`);
    }
    const html2 = rows.join('');
    if (cache.scoreboard !== html2) { cache.scoreboard = html2; $('score-table').innerHTML = html2; }
  }

  // buy affordability
  if (state.phase === 'buy') {
    const rows = document.querySelectorAll('.buy-row');
    BUY_ITEMS.forEach((item, i) => {
      const owned = (item.key === 'rifle' || item.key === 'smg') ? !!p.weapons[item.key]
        : item.key === 'armor' ? p.armor >= 50 : p.grenades >= 2;
      rows[i].classList.toggle('cant', state.money < item.price || owned);
    });
    setText('buy-money', `$${state.money}`);
  }

  mmTimer -= dt;
  if (mmTimer <= 0) { drawMinimap(state); mmTimer = 0.2; }
}
