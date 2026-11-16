// combat.js — everything that hurts: hitscan fire with headshots, grenades, the spike.
// Player and bots fire through the same function so the rules are identical for both.
import * as THREE from 'three';
import { WEAPONS, GRENADE, shotSpread, applyDamage } from './weapons.js';
import { raycastWorld, rayBot, losClear, SITES } from './world.js';
import { PLANT_TIME, DEFUSE_TIME, BOMB_FUSE, TEAM } from './state.js';
import * as audio from './audio.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function dirFromYawPitch(yaw, pitch, out) {
  out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return out;
}

const _up2 = new THREE.Vector3();

/** Cone offset for spread: two uniform draws approximate a gaussian. */
function spreadDir(base, spread, out) {
  _fwd.copy(base);
  _right.crossVectors(_fwd, _up).normalize();
  _up2.crossVectors(_right, _fwd).normalize();
  const a = (Math.random() + Math.random() - 1) * spread;
  const b = (Math.random() + Math.random() - 1) * spread;
  out.copy(base).addScaledVector(_right, a).addScaledVector(_up2, b).normalize();
  return out;
}

function targetsOf(state, team) {
  return team === TEAM.ATK
    ? state.bots.filter((b) => b.team === TEAM.DEF && b.alive)
    : state.bots.filter((b) => b.team === TEAM.ATK && b.alive);
}

/**
 * Fire one shot for `shooter` ({pos, yaw, pitch, team, weapon, ammo, ...}).
 * `eye` is the muzzle height offset. Returns 'hit' | 'head' | 'miss' | 'wall' | null
 * (null when the weapon cannot fire: reloading, cooling down, empty).
 */
export function fireWeapon(state, shooter, isPlayer) {
  const def = WEAPONS[shooter.weapon];
  const ammo = shooter.ammo;
  if (!def || !ammo) return null;
  if (shooter.reloading > 0 || shooter.fireCooldown > 0) return null;
  if (ammo.mag <= 0) {
    if (isPlayer) audio.playDryFire();
    return null;
  }
  ammo.mag -= 1;
  shooter.fireCooldown = 1 / def.rof;
  if (isPlayer) {
    state.player.bloom = Math.min(1, state.player.bloom + 0.12);
    state.player.recoilPitch += def.recoil;
  }

  const eyeY = isPlayer
    ? shooter.pos.y + (shooter.crouch ? shooter.eyeCrouch : shooter.eyeStand)
    : shooter.pos.y + 1.45;
  _origin.set(shooter.pos.x, eyeY, shooter.pos.z);
  dirFromYawPitch(shooter.yaw, shooter.pitch + (shooter.aimError || 0), _dir);
  const moving = Math.hypot(shooter.vel.x, shooter.vel.z) > 1.2;
  const spread = shotSpread(def, moving, !!shooter.crouch, isPlayer ? state.player.bloom : 0.4);
  spreadDir(_dir, spread, _dir);

  // muzzle for the tracer
  _muzzle.copy(_origin).addScaledVector(_dir, 0.6);
  _muzzle.y -= 0.12;

  const wall = raycastWorld(_origin, _dir, def.range);
  const wallDist = wall ? wall.dist : def.range;
  let best = null, bestBot = null;
  const foes = targetsOf(state, shooter.team);
  // the player is a valid target for bots
  const playerTarget = shooter.team !== TEAM.ATK && state.player.alive ? state.player : null;
  for (const b of foes) {
    const hit = rayBot(_origin, _dir, Math.min(wallDist, def.range), b);
    if (hit && (!best || hit.dist < best.dist)) { best = hit; bestBot = b; }
  }
  let playerHit = null;
  if (playerTarget) {
    const fake = { pos: state.player.pos };
    playerHit = rayBot(_origin, _dir, Math.min(wallDist, def.range), fake);
    if (playerHit && (!best || playerHit.dist < best.dist)) { best = playerHit; bestBot = null; }
  }

  let end;
  let result = 'miss';
  if (best) {
    end = best.point;
    const head = best.part === 'head';
    const raw = def.damage * (head ? def.headMul : 1);
    if (bestBot) {
      damageBot(state, bestBot, raw, head, shooter);
    } else if (playerTarget) {
      damagePlayer(state, raw, shooter.yaw);
    }
    result = head ? 'head' : 'hit';
  } else if (wall) {
    end = wall.point;
    state.puffs.push({ pos: wall.point.clone(), life: 0.4, size: 0.3 });
    result = 'wall';
  } else {
    end = _origin.clone().addScaledVector(_dir, def.range);
  }
  state.tracers.push({ a: _muzzle.clone(), b: end, life: 0.09, color: def.tracer });
  const distToPlayer = _origin.distanceTo(state.player.pos);
  audio.playShot(shooter.weapon, isPlayer ? 0 : distToPlayer);
  if (isPlayer && (result === 'hit' || result === 'head')) audio.playHit();
  return result;
}

export function startReload(shooter) {
  const def = WEAPONS[shooter.weapon];
  const ammo = shooter.ammo;
  if (!def || !ammo || shooter.reloading > 0 || ammo.mag >= def.mag || ammo.reserve <= 0) return false;
  shooter.reloading = def.reload;
  return true;
}

export function finishReload(shooter, isPlayer) {
  const def = WEAPONS[shooter.weapon];
  const ammo = shooter.ammo;
  if (!def || !ammo) return;
  const need = def.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
  if (isPlayer) audio.playReload();
}

/** Throw a grenade from the shooter, arcing towards where they look. */
export function throwGrenade(state, shooter, isPlayer) {
  if (shooter.grenades <= 0) return false;
  shooter.grenades -= 1;
  dirFromYawPitch(shooter.yaw, shooter.pitch, _dir);
  const eyeY = shooter.pos.y + 1.45;
  state.grenades.push({
    pos: new THREE.Vector3(shooter.pos.x, eyeY, shooter.pos.z),
    vel: _dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: GRENADE.fuse,
    owner: shooter,
  });
  if (isPlayer) audio.playReload();
  return true;
}

export function stepGrenades(state, dt) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 12 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // ground bounce
    if (g.pos.y < 0.15) {
      g.pos.y = 0.15;
      if (Math.abs(g.vel.y) > 1) audio.playBounce();
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
    }
    if (g.fuse <= 0) {
      explode(state, g.pos, GRENADE.damage, GRENADE.radius, g.owner);
      state.grenades.splice(i, 1);
    }
  }
}

export function explode(state, pos, damage, radius, owner) {
  audio.playExplosion();
  state.puffs.push({ pos: pos.clone(), life: 0.8, size: 2.2 });
  const victims = [...state.bots.filter((b) => b.alive)];
  if (state.player.alive) victims.push(state.player);
  for (const v of victims) {
    const d = v.pos.distanceTo(pos);
    if (d > radius || v === owner) continue;
    if (!losClear(new THREE.Vector3(v.pos.x, v.pos.y + 1, v.pos.z), pos.clone().setY(pos.y + 0.5))) continue;
    const raw = damage * (1 - d / radius) + 10;
    if (v === state.player) damagePlayer(state, raw, owner ? owner.yaw : 0);
    else damageBot(state, v, raw, false, owner);
  }
  // shake the player's view a little when close
  const dp = state.player.pos.distanceTo(pos);
  if (dp < 20) state.player.recoilPitch += 0.03 * (1 - dp / 20);
}

export function damageBot(state, bot, raw, head, attacker) {
  const r = applyDamage(bot.hp, bot.armor, raw);
  bot.hp = r.hp; bot.armor = r.armor;
  bot.lastHitBy = attacker;
  bot.lastHitAt = state.time;
  if (bot.hp <= 0 && bot.alive) {
    bot.alive = false;
    bot.deathTime = state.time;
    const name = attacker === state.player ? 'You' : attacker.name;
    state.killfeed.push({ text: `${name} ▸ ${bot.name}${head ? ' (headshot)' : ''}`, color: attacker === state.player ? '#f0a830' : '#98a0a8', life: 5 });
    if (attacker === state.player) {
      state.player.kills += 1;
      state.money += 300;
      audio.playKill();
    }
    // the spike drops to the nearest living attacker teammate
    if (state.bomb.carrier === bot && bot.team === TEAM.ATK) {
      const mate = state.bots.find((b) => b.team === TEAM.ATK && b.alive);
      state.bomb.carrier = mate || null;
      if (mate) mate.hasBomb = true;
    }
  }
}

export function damagePlayer(state, raw, fromYaw) {
  const p = state.player;
  if (!p.alive) return;
  const r = applyDamage(p.hp, p.armor, raw);
  p.hp = r.hp; p.armor = r.armor;
  p.damageFlash = 1;
  p.lastDamageFrom = fromYaw;
  audio.playHurt();
  if (p.hp <= 0) {
    p.alive = false;
    p.deaths += 1;
    state.killfeed.push({ text: `You were eliminated`, color: '#e05a4e', life: 5 });
    if (state.bomb.carrier === 'player') {
      const mate = state.bots.find((b) => b.team === TEAM.ATK && b.alive);
      state.bomb.carrier = mate || null;
      if (mate) mate.hasBomb = true;
    }
  }
}

/** Plant progress while the carrier holds E inside a site. Returns true when planted. */
export function stepPlant(state, dt, carrier, holding) {
  const bomb = state.bomb;
  if (bomb.planted || !carrier || !carrier.alive) return false;
  const site = siteAt(carrier.pos.x, carrier.pos.z);
  if (!site || !holding) { bomb.plantProgress = 0; return false; }
  bomb.plantProgress += dt;
  bomb.site = site;
  bomb.pos.set(SITES[site].x, 0, SITES[site].z);
  if (bomb.plantProgress >= PLANT_TIME) {
    bomb.planted = true;
    bomb.timer = BOMB_FUSE;
    bomb.plantProgress = 0;
    audio.playPlant();
    state.events.push({ text: `Spike planted at site ${site}!`, color: '#f0a830', life: 4 });
    return true;
  }
  return false;
}

/** Defuse progress while a defender holds E inside the planted site. */
export function stepDefuse(state, dt, defuser, holding) {
  const bomb = state.bomb;
  if (!bomb.planted || !defuser || !defuser.alive) return false;
  const site = siteAt(defuser.pos.x, defuser.pos.z);
  if (site !== bomb.site || !holding) { bomb.defuseProgress = 0; return false; }
  bomb.defuseProgress += dt;
  if (bomb.defuseProgress >= DEFUSE_TIME) {
    bomb.planted = false;
    bomb.defuseProgress = 0;
    bomb.defused = true; // main.js ends the round on this flag
    state.events.push({ text: 'Spike defused!', color: '#2fa39a', life: 4 });
    return true;
  }
  return false;
}

export function siteAt(x, z) {
  for (const [name, s] of Object.entries(SITES)) {
    if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) return name;
  }
  return null;
}
