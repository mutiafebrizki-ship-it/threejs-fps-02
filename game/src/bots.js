// bots.js — the other nine players. Each bot has a route, a hold, a target and a temper:
// they walk lanes, hold angles, burst-fire with human-ish error, hear shots, plant the
// spike, rotate on a plant and defuse when the site is clear.
import * as THREE from 'three';
import { TEAM, TICK } from './state.js';
import { WEAPONS } from './weapons.js';
import { NAV, ROUTES, findRoute, nearestNode, moveCircle, losClear, SITES } from './world.js';
import { fireWeapon, startReload, finishReload, stepPlant, stepDefuse } from './combat.js';

export const ATK_NAMES = ['Vex', 'Rook', 'Havoc', 'Mira'];
export const DEF_NAMES = ['Sable', 'Onyx', 'Dagger', 'Warden', 'Frost'];
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export function makeBot(id, name, team, spawn) {
  return {
    id, name, team,
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    yaw: team === TEAM.ATK ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
    hp: 100, armor: 0, alive: true,
    weapon: 'pistol', ammo: { mag: 12, reserve: 36 },
    reloading: 0, fireCooldown: 0, grenades: 0,
    money: 800, kills: 0,
    hasBomb: false,
    route: [], wp: 0,
    holdYaw: 0, holdTimer: 0,
    mode: 'route', // route | hold | engage | investigate | plant | defuse
    target: null, reaction: 0, burstLeft: 0, burstPause: 0,
    strafeDir: 1, strafeTimer: 0,
    investigatePos: null,
    thinkTimer: Math.random() * 0.1,
    stuckTimer: 0, lastX: spawn.x, lastZ: spawn.z,
    aimError: 0,
    mesh: null, legL: null, legR: null, walkPhase: 0,
    deathTime: 0,
  };
}

/** Buy like a player: keep the weapon already owned, upgrade from pistol when rich. */
export function botBuy(bot, round) {
  if (bot.weapon === 'pistol') {
    const w = bot.money >= 2700 ? 'rifle' : bot.money >= 1500 && round > 1 ? 'smg' : 'pistol';
    if (w !== 'pistol') {
      bot.weapon = w;
      const def = WEAPONS[w];
      bot.ammo = { mag: def.mag, reserve: def.reserve };
      bot.money -= def.price;
    }
  }
  if (bot.armor < 50 && bot.money >= 650 && Math.random() < 0.4) { bot.armor = 50; bot.money -= 650; }
  if (bot.grenades === 0 && bot.money >= 300 && Math.random() < 0.25) { bot.grenades = 1; bot.money -= 300; }
}

export function assignRoutes(state) {
  const atkRoutes = [ROUTES.atkA, ROUTES.atkAmid, ROUTES.atkB, ROUTES.atkBmid];
  const defRoutes = [ROUTES.defA, ROUTES.defA2, ROUTES.defB, ROUTES.defB2, ROUTES.defMid];
  let ai = 0, di = 0;
  for (const b of state.bots) {
    if (b.team === TEAM.ATK) {
      b.route = [...atkRoutes[ai++ % atkRoutes.length]];
    } else {
      b.route = [...defRoutes[di++ % defRoutes.length]];
    }
    b.wp = 1; // index 0 is the spawn node
    b.mode = 'route';
    b.target = null;
    b.investigatePos = null;
    b.hasBomb = false; // the spike starts with the player
  }
  // the spike starts with the player; if the player is dead it is already reassigned.
  if (state.player.alive) state.bomb.carrier = 'player';
}

function eyeOf(bot) { _eye.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z); return _eye; }

/** Nearest visible enemy: the player or a bot of the other team. */
function acquireTarget(state, bot) {
  const foes = [];
  if (bot.team === TEAM.DEF && state.player.alive) foes.push(state.player);
  for (const b of state.bots) if (b.team !== bot.team && b.alive) foes.push(b);
  let best = null, bd = 55 * 55;
  const eye = eyeOf(bot);
  for (const f of foes) {
    const dx = f.pos.x - bot.pos.x, dz = f.pos.z - bot.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > bd) continue;
    const fy = f === state.player ? 1.3 : 1.2;
    _to.set(f.pos.x, f.pos.y + fy, f.pos.z);
    if (!losClear(eye, _to)) continue;
    // field of view: 140 degrees
    _fwd.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const dot = (dx * _fwd.x + dz * _fwd.z) / Math.sqrt(d2);
    if (dot < -0.35 && d2 > 9) continue;
    best = f; bd = d2;
  }
  return best;
}

function aimAt(bot, target) {
  const ty = target === bot ? 0 : (target.pos.y + 1.2);
  const dx = target.pos.x - bot.pos.x;
  const dz = target.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  const baseYaw = Math.atan2(-dx, -dz);
  const basePitch = Math.atan2(ty - (bot.pos.y + 1.45), dist);
  const moving = target.vel ? Math.hypot(target.vel.x, target.vel.z) > 1.5 : false;
  const err = 0.028 + dist * 0.0016 + (moving ? 0.015 : 0) + (Math.hypot(bot.vel.x, bot.vel.z) > 1 ? 0.02 : 0);
  bot.yaw = baseYaw + (Math.random() + Math.random() - 1) * err;
  bot.pitch = basePitch + (Math.random() + Math.random() - 1) * err;
  return dist;
}

function moveToward(state, bot, x, z, speed, dt) {
  const dx = x - bot.pos.x, dz = z - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  bot.vel.set(vx, 0, vz);
  moveCircle(bot.pos, vx * dt, vz * dt, 0.35);
  const targetYaw = Math.atan2(-vx, -vz);
  let dy = targetYaw - bot.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dy));
  return d < 0.6;
}

/** A shot went off: nearby bots hear it and come to look. */
export function noteShot(state, shooterPos, shooterTeam) {
  for (const b of state.bots) {
    if (!b.alive || b.mode === 'engage') continue;
    const d = Math.hypot(b.pos.x - shooterPos.x, b.pos.z - shooterPos.z);
    if (d < 26 && b.team !== shooterTeam && Math.random() < 0.7) {
      b.investigatePos = { x: shooterPos.x, z: shooterPos.z };
    }
  }
}

function think(state, bot, dt) {
  const target = acquireTarget(state, bot);
  if (target) {
    if (bot.target !== target) {
      bot.target = target;
      bot.reaction = 0.35 + Math.random() * 0.3;
      bot.burstLeft = 0;
    }
    bot.mode = 'engage';
    return;
  }
  bot.target = null;

  const bomb = state.bomb;
  if (bomb.planted && bot.team === TEAM.DEF) {
    const site = SITES[bomb.site];
    if (Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) > 2.5) {
      bot.mode = 'route';
      bot.route = findRoute(nearestNode(bot.pos.x, bot.pos.z), bomb.site === 'A' ? 'aSite' : 'bSite');
      bot.wp = 1;
    } else {
      bot.mode = 'defuse';
    }
    return;
  }
  if (bot.team === TEAM.ATK && bot.hasBomb && !bomb.planted) {
    const site = SITES[bot.route[bot.route.length - 1] === 'aSite' ? 'A' : 'B'];
    if (site && Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) <= site.r) {
      bot.mode = 'plant';
      return;
    }
  }
  if (bot.investigatePos) {
    bot.mode = 'investigate';
    return;
  }
  if (bot.mode === 'engage' || bot.mode === 'plant' || bot.mode === 'defuse' || bot.mode === 'investigate') {
    bot.mode = bot.wp < bot.route.length ? 'route' : 'hold';
  }
  if (bot.mode === 'hold') {
    bot.holdTimer -= 0.1; // think() runs every 0.1s
    if (bot.holdTimer <= 0) {
      // attackers rotate to the other site, defenders re-hold
      if (bot.team === TEAM.ATK) {
        const other = bot.route[bot.route.length - 1] === 'aSite' ? ROUTES.atkB : ROUTES.atkA;
        bot.route = findRoute(nearestNode(bot.pos.x, bot.pos.z), other[1]);
        bot.route = [...bot.route, ...other.slice(1)];
        bot.wp = 1;
        bot.mode = 'route';
      } else {
        bot.holdTimer = 4 + Math.random() * 6;
      }
    }
  }
}

function stepBot(state, bot, dt) {
  if (!bot.alive) return;
  bot.thinkTimer -= dt;
  if (bot.thinkTimer <= 0) { think(state, bot, dt); bot.thinkTimer = 0.1; }

  // reload when empty or between bursts
  if (bot.ammo.mag === 0 && bot.reloading <= 0) startReload(bot);
  if (bot.reloading > 0) {
    bot.reloading -= dt;
    if (bot.reloading <= 0) finishReload(bot, false);
  }
  if (bot.fireCooldown > 0) bot.fireCooldown -= dt;

  const speed = 3.7;
  if (bot.mode === 'engage' && bot.target) {
    const dist = aimAt(bot, bot.target);
    // strafe perpendicular to the target, approach when far
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) { bot.strafeDir = Math.random() < 0.5 ? -1 : 1; bot.strafeTimer = 0.7 + Math.random() * 0.8; }
    const tx = bot.target.pos.x - bot.pos.x, tz = bot.target.pos.z - bot.pos.z;
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len * bot.strafeDir, pz = tx / len * bot.strafeDir;
    let mx = px * 1.6, mz = pz * 1.6;
    if (dist > 26) { mx += (tx / len) * 2.2; mz += (tz / len) * 2.2; }
    if (dist < 6) { mx -= (tx / len) * 1.5; mz -= (tz / len) * 1.5; }
    bot.vel.set(mx, 0, mz);
    moveCircle(bot.pos, mx * dt, mz * dt, 0.35);
    // burst fire once reacted
    if (bot.reaction > 0) bot.reaction -= dt;
    else if (bot.reloading <= 0) {
      if (bot.burstLeft <= 0) {
        bot.burstPause -= dt;
        if (bot.burstPause <= 0) { bot.burstLeft = 2 + Math.floor(Math.random() * 3); bot.burstPause = 0.7 + Math.random() * 0.6; }
      } else {
        const r = fireWeapon(state, bot, false);
        if (r !== null) { bot.burstLeft -= 1; noteShot(state, bot.pos, bot.team); }
      }
    }
  } else if (bot.mode === 'plant') {
    bot.vel.set(0, 0, 0);
    stepPlant(state, dt, bot, true);
  } else if (bot.mode === 'defuse') {
    bot.vel.set(0, 0, 0);
    stepDefuse(state, dt, bot, true);
  } else if (bot.mode === 'investigate' && bot.investigatePos) {
    const arrived = moveToward(state, bot, bot.investigatePos.x, bot.investigatePos.z, speed, dt);
    if (arrived) {
      bot.investigatePos = null;
      bot.holdTimer = 2;
      bot.holdYaw = bot.yaw + Math.PI * (Math.random() < 0.5 ? 0.5 : -0.5);
      bot.mode = 'hold';
    }
  } else if (bot.mode === 'route' && bot.wp < bot.route.length) {
    const node = NAV[bot.route[bot.wp]];
    if (!node) { bot.wp++; return; }
    const arrived = moveToward(state, bot, node.x, node.z, speed, dt);
    // stuck? skip the waypoint
    const moved = Math.hypot(bot.pos.x - bot.lastX, bot.pos.z - bot.lastZ);
    if (moved < 0.02) bot.stuckTimer += dt; else bot.stuckTimer = 0;
    bot.lastX = bot.pos.x; bot.lastZ = bot.pos.z;
    if (arrived || bot.stuckTimer > 1.5) { bot.wp++; bot.stuckTimer = 0; }
    if (bot.wp >= bot.route.length) {
      bot.mode = 'hold';
      bot.holdTimer = 5 + Math.random() * 7;
      bot.holdYaw = bot.team === TEAM.ATK ? -Math.PI / 2 : Math.PI / 2;
    }
  } else {
    bot.vel.set(0, 0, 0);
    let dy = bot.holdYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, dy));
  }

  // walk cycle for the mesh
  const moving = Math.hypot(bot.vel.x, bot.vel.z);
  bot.walkPhase += moving * dt * 2.2;
}

export function stepBots(state, dt) {
  for (const b of state.bots) stepBot(state, b, dt);
}

// ---- meshes ---------------------------------------------------------------
const TEAM_COLORS = { [TEAM.ATK]: 0xc9a227, [TEAM.DEF]: 0x3f7fb5 };

export function buildBotMesh(bot) {
  const g = new THREE.Group();
  const team = TEAM_COLORS[bot.team];
  const cloth = new THREE.MeshStandardMaterial({ color: team, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6f55, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), cloth);
  body.position.y = 1.02; body.castShadow = true;
  g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), dark);
  vest.position.y = 1.08;
  g.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.3), skin);
  head.position.y = 1.56; head.castShadow = true;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: bot.team === TEAM.ATK ? 0xf0a830 : 0x2fa39a, emissiveIntensity: 0.9 }));
  visor.position.set(0, 1.58, 0.16);
  g.add(visor);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), dark);
  legL.position.set(-0.14, 0.35, 0);
  legL.geometry.translate(0, -0.35, 0); // pivot at hip
  legL.position.y = 0.7;
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.72), dark);
  gun.position.set(0.18, 1.18, 0.32);
  g.add(gun);
  // name tag sprite (canvas texture, drawn once)
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({
    map: nameTexture(bot.name, bot.team === TEAM.ATK ? '#f0c040' : '#6db3e8'),
    transparent: true, depthWrite: false,
  }));
  tag.position.y = 2.0;
  tag.scale.set(1.6, 0.4, 1);
  g.add(tag);
  bot.mesh = g; bot.legL = legL; bot.legR = legR;
  return g;
}

function nameTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15,17,20,0.72)';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = color;
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sync meshes with sim state (positions, facing, walk, death pose). */
export function syncBotMeshes(state) {
  for (const b of state.bots) {
    if (!b.mesh) continue;
    b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    if (b.alive) {
      b.mesh.rotation.set(0, b.yaw, 0);
      const swing = Math.sin(b.walkPhase) * 0.45;
      b.legL.rotation.x = swing;
      b.legR.rotation.x = -swing;
      b.mesh.visible = true;
    } else {
      // fall flat, fade out after 4s
      b.mesh.rotation.set(-Math.PI / 2, b.yaw, 0);
      b.mesh.position.y = 0.25;
      b.legL.rotation.x = 0; b.legR.rotation.x = 0;
      b.mesh.visible = state.time - b.deathTime < 4;
    }
  }
}
