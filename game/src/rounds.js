// rounds.js — the match: buy phase, live round, win/loss, economy, first to 5.
// Counter-Strike-shaped: attackers plant the spike, defenders stop them or defuse it.
import { TEAM, BUY_TIME, ROUND_TIME, WIN_ROUNDS, START_MONEY } from './state.js';
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';
import { SPAWNS } from './world.js';
import { makeBot, botBuy, assignRoutes, ATK_NAMES, DEF_NAMES } from './bots.js';
import * as audio from './audio.js';

export const BUY_ITEMS = [
  { key: 'rifle', name: 'VK-47 rifle', price: WEAPONS.rifle.price, desc: 'Auto, 34 dmg, one-tap headshot' },
  { key: 'smg', name: 'Kestrel-9 SMG', price: WEAPONS.smg.price, desc: 'Fast, close quarters' },
  { key: 'grenade', name: 'HE-7 grenade', price: GRENADE.price, desc: 'Throw with G or key 4' },
  { key: 'armor', name: 'Vest', price: ARMOR.price, desc: 'Absorbs half of each hit' },
];

/** Build the nine bots once (meshes are attached by main.js). */
export function createBots(state) {
  state.bots = [];
  ATK_NAMES.forEach((name, i) => {
    state.bots.push(makeBot(i, name, TEAM.ATK, SPAWNS.atk[i]));
  });
  DEF_NAMES.forEach((name, i) => {
    state.bots.push(makeBot(10 + i, name, TEAM.DEF, SPAWNS.def[i]));
  });
}

export function startMatch(state) {
  state.score = { atk: 0, def: 0 };
  state.round = 1;
  state.money = START_MONEY;
  state.lossStreak = 0;
  state.matchWinner = null;
  state.player.kills = 0;
  state.player.deaths = 0;
  for (const b of state.bots) { b.money = START_MONEY; b.kills = 0; }
  startRound(state);
}

function resetFighter(f, spawn, yaw) {
  f.pos.set(spawn.x, 0, spawn.z);
  f.vel.set(0, 0, 0);
  f.yaw = yaw;
  f.pitch = 0;
  f.hp = 100;
  f.alive = true;
  f.reloading = 0;
  f.fireCooldown = 0;
  f.bloom = 0;
  f.recoilPitch = 0;
}

export function startRound(state) {
  const p = state.player;
  resetFighter(p, SPAWNS.atk[0], -Math.PI / 2);
  // Loadout persists across rounds (CS-style): only an empty mag is refilled from reserve.
  refillMag(p);
  p.bombCarrier = true;
  p.planting = 0;
  p.defusing = 0;
  p.damageFlash = 0;
  state.bots.forEach((b, i) => {
    const spawn = b.team === TEAM.ATK ? SPAWNS.atk[i % 5] : SPAWNS.def[i % 5];
    resetFighter(b, spawn, b.team === TEAM.ATK ? -Math.PI / 2 : Math.PI / 2);
    refillMag(b);
    b.hasBomb = false;
    botBuy(b, state.round);
  });
  assignRoutes(state);
  state.bomb = {
    site: null, planted: false, plantProgress: 0, defuseProgress: 0,
    timer: 0, pos: state.bomb.pos, carrier: 'player',
  };
  state.grenades = [];
  state.tracers = [];
  state.puffs = [];
  state.killfeed = [];
  state.phase = 'buy';
  state.phaseTimer = BUY_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.events.push({ text: `Round ${state.round} — buy phase`, color: '#f0a830', life: 3 });
}

/** Move reserve ammo into an empty magazine at round start. */
function refillMag(f) {
  const def = WEAPONS[f.weapon];
  const ammo = f.ammo;
  if (!def || !ammo) return;
  if (ammo.mag === 0 && ammo.reserve > 0) {
    const take = Math.min(def.mag, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
  }
}


export function buyItem(state, key) {
  if (state.phase !== 'buy') return false;
  const p = state.player;
  if (key === 'rifle' || key === 'smg') {
    const def = WEAPONS[key];
    if (p.weapons[key] || state.money < def.price) return false;
    state.money -= def.price;
    p.weapons[key] = { mag: def.mag, reserve: def.reserve };
    p.slots.push(key);
    p.slot = p.slots.length - 1;
    p.weapon = key;
    p.ammo = p.weapons[key];
    audio.playBuy();
    return true;
  }
  if (key === 'grenade') {
    if (p.grenades >= 2 || state.money < GRENADE.price) return false;
    state.money -= GRENADE.price;
    p.grenades += 1;
    audio.playBuy();
    return true;
  }
  if (key === 'armor') {
    if (p.armor >= 50 || state.money < ARMOR.price) return false;
    state.money -= ARMOR.price;
    p.armor = 50;
    audio.playBuy();
    return true;
  }
  return false;
}

function aliveCount(state, team) {
  let n = team === TEAM.ATK && state.player.alive ? 1 : 0;
  for (const b of state.bots) if (b.team === team && b.alive) n++;
  return n;
}

export function endRound(state, winner, reason) {
  if (state.phase !== 'live' && state.phase !== 'buy') return;
  state.phase = 'end';
  state.phaseTimer = 5;
  state.roundWinner = winner;
  state.roundReason = reason;
  if (winner === TEAM.ATK) {
    state.score.atk += 1;
    state.money += 3250;
    state.lossStreak = 0;
  } else {
    state.score.def += 1;
    state.lossStreak += 1;
    state.money += state.lossStreak >= 2 ? 2400 : 1900;
  }
  for (const b of state.bots) {
    b.money += b.team === winner ? 3250 : 1900;
  }
  state.events.push({ text: reason, color: winner === TEAM.ATK ? '#f0a830' : '#e05a4e', life: 5 });
  audio.playRoundEnd(winner === TEAM.ATK);
}

export function stepRounds(state, dt) {
  if (state.phase === 'buy') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phase = 'live';
      state.phaseTimer = ROUND_TIME;
      state.events.push({ text: 'Round live — plant the spike!', color: '#e9e6df', life: 3 });
    }
    return;
  }
  if (state.phase === 'live') {
    state.phaseTimer -= dt;
    const bomb = state.bomb;
    if (bomb.planted) {
      bomb.timer -= dt;
      if (bomb.timer <= 0) {
        endRound(state, TEAM.ATK, 'Spike detonated — attackers take the round');
        return;
      }
    }
    const atkAlive = aliveCount(state, TEAM.ATK);
    const defAlive = aliveCount(state, TEAM.DEF);
    if (defAlive === 0) {
      endRound(state, TEAM.ATK, 'Enemy team eliminated');
      return;
    }
    if (atkAlive === 0 && !bomb.planted) {
      endRound(state, TEAM.DEF, 'Attackers eliminated');
      return;
    }
    if (state.phaseTimer <= 0) {
      endRound(state, TEAM.DEF, 'Time expired — defenders hold the yard');
      return;
    }
    return;
  }
  if (state.phase === 'end') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.score.atk >= WIN_ROUNDS || state.score.def >= WIN_ROUNDS || state.round >= 9) {
        state.phase = 'matchend';
        state.matchWinner = state.score.atk > state.score.def ? TEAM.ATK : TEAM.DEF;
        state.phaseTimer = 0;
      } else {
        state.round += 1;
        startRound(state);
      }
    }
  }
}
