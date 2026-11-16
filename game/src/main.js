// main.js — boots the game: renderer, fixed-step sim loop, input wiring, viewmodel and
// the visual pools (tracers, impact puffs, grenades, the spike). The sim lives in the
// modules; this file only steps it at 60 Hz and draws what it says.
import * as THREE from 'three';
import { createState, TICK, TEAM } from './state.js';
import { buildWorld, losClear, SITES } from './world.js';
import { createInput } from './input.js';
import { stepPlayer, eyePos, speed2D } from './player.js';
import { stepBots, buildBotMesh, syncBotMeshes, noteShot } from './bots.js';
import { createBots, startMatch, stepRounds, buyItem, endRound } from './rounds.js';
import { fireWeapon, startReload, finishReload, throwGrenade, stepGrenades, stepPlant, explode } from './combat.js';
import { WEAPONS } from './weapons.js';
import { initHUD, updateHUD, flashHit, showBanner } from './hud.js';
import { setupDemo } from './demo.js';
import { initAudio, setMuted, playFootstep } from './audio.js';

const state = createState();

// ---- renderer / scene -----------------------------------------------------
// ?lowfx=1 disables shadows for fast headless testing; the shipped game runs full fx.
const params = new URLSearchParams(window.location.search);
const lowfx = params.get('lowfx') === '1';
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowfx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
if (lowfx) scene.traverse((o) => { o.castShadow = false; });

// ---- bots -----------------------------------------------------------------
createBots(state);
for (const b of state.bots) scene.add(buildBotMesh(b));

// ---- viewmodel gun --------------------------------------------------------
const gun = new THREE.Group();
gun.scale.setScalar(0.62);
gun.rotation.y = -0.1;
const gunMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.45, metalness: 0.6 });
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.6), gunMat);
gun.add(gunBody);
const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.34), gunMat);
gunBarrel.position.set(0, 0.03, -0.44);
gun.add(gunBarrel);
const gunSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.1),
  new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 0.6 }));
gunSight.position.set(0, 0.11, -0.1);
gun.add(gunSight);
const gunStripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.4),
  new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 0.35 }));
gunStripe.position.set(0, 0.08, -0.05);
gun.add(gunStripe);
gun.position.set(0.3, -0.26, -0.55);
camera.add(gun);

// radial glow texture, shared by the muzzle flash and the impact puffs
const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,220,140,0.95)');
  grad.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const flashMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xffc860, transparent: true, opacity: 0, depthWrite: false });
const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), flashMat);
flash.position.set(0.28, -0.2, -0.9);
camera.add(flash);
let flashUntil = 0;

// ---- visual pools ----------------------------------------------------------
const TRACER_MAX = 32;
const tracers = [];
for (let i = 0; i < TRACER_MAX; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push(line);
}

const puffTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(220,200,160,0.9)');
  grad.addColorStop(1, 'rgba(220,200,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const PUFF_MAX = 16;
const puffs = [];
for (let i = 0; i < PUFF_MAX; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, transparent: true, opacity: 0, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  puffs.push(s);
}

const GRENADE_MAX = 8;
const grenadeMeshes = [];
for (let i = 0; i < GRENADE_MAX; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.4, metalness: 0.7 }));
  m.visible = false;
  scene.add(m);
  grenadeMeshes.push(m);
}

const bombMesh = new THREE.Group();
const bombBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x1a1c20, emissive: 0xe05a4e, emissiveIntensity: 0.4, roughness: 0.4 }));
bombBox.position.y = 0.11;
bombMesh.add(bombBox);
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0xe05a4e, emissive: 0xe05a4e, emissiveIntensity: 3 }));
bombLight.position.y = 0.3;
bombMesh.add(bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// ---- input -----------------------------------------------------------------
const input = createInput(renderer.domElement);
let prevFireHeld = false;
let stepAcc = 0;
let seenTimer = 0;

function switchSlot(i) {
  const p = state.player;
  if (i < p.slots.length && p.slot !== i) {
    p.slot = i;
    p.weapon = p.slots[i];
    p.ammo = p.weapons[p.weapon];
    p.reloading = 0;
  }
}

function onPlay() {
  initAudio();
  startMatch(state);
  state.buyOpen = true;
  input.requestLock();
  showBanner('Yard 7', 'Plant the spike at A or B — first to 5 rounds');
}

initHUD(state, {
  onPlay,
  onBuy: (key) => { buyItem(state, key); },
  onCloseBuy: () => { state.buyOpen = false; input.requestLock(); },
  onResume: () => { input.requestLock(); },
});

input.onKeyDown = (code) => {
  const p = state.player;
  if (code === 'Tab') { state.scoreboardOpen = true; return; }
  if (code === 'KeyM') { state.muted = !state.muted; setMuted(state.muted); return; }
  if (state.phase !== 'live' && state.phase !== 'buy') return;
  if (!p.alive) return;
  if (code === 'KeyR') startReload(p);
  else if (code === 'KeyG' || code === 'Digit4') throwGrenade(state, p, true);
  else if (code === 'KeyB') {
    if (state.phase === 'buy') {
      state.buyOpen = !state.buyOpen;
      if (state.buyOpen) input.exitLock(); else input.requestLock();
    }
  } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
    const n = Number(code.slice(-1)) - 1;
    if (state.buyOpen && state.phase === 'buy') {
      const keys = ['rifle', 'smg', 'grenade', 'armor'];
      buyItem(state, keys[n]);
    } else switchSlot(n);
  }
};
input.onKeyUp = (code) => {
  if (code === 'Tab') state.scoreboardOpen = false;
};
input.onMouseDown = () => {
  if ((state.phase === 'live' || state.phase === 'buy') && !input.locked && state.player.alive) {
    input.requestLock();
  }
};
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for automated play-tests (read-only state inspection).
window.__sandline = { state };

const sceneParam = params.get('scene');
if (sceneParam) setupDemo(state, sceneParam);

// ---- sim -------------------------------------------------------------------
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function simStep(dt) {
  state.time += dt;
  state.tick += 1;
  const p = state.player;
  const phase = state.phase;

  // decay transient visuals + feeds
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    state.tracers[i].life -= dt;
    if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
  }
  for (let i = state.puffs.length - 1; i >= 0; i--) {
    state.puffs[i].life -= dt;
    if (state.puffs[i].life <= 0) state.puffs.splice(i, 1);
  }
  for (const k of state.killfeed) k.life -= dt;
  for (const e of state.events) e.life -= dt;
  state.killfeed = state.killfeed.filter((k) => k.life > 0);
  state.events = state.events.filter((e) => e.life > 0);

  if (phase === 'buy' || phase === 'live') {
    if (p.alive) {
      const wasReloading = p.reloading > 0;
      stepPlayer(state, input, dt);
      if (wasReloading && p.reloading <= 0) finishReload(p, true);

      // fire
      const def = WEAPONS[p.weapon];
      const fireHeld = input.fireHeld || state.time < state.demoFireUntil;
      const edge = fireHeld && !prevFireHeld;
      if (phase === 'live' && (def.auto ? fireHeld : edge)) {
        const r = fireWeapon(state, p, true);
        if (r === 'hit' || r === 'head') flashHit(r === 'head');
        if (r !== null) { flashUntil = state.time + 0.05; noteShot(state, p.pos, TEAM.ATK); }
      }
      prevFireHeld = fireHeld;

      // plant the spike
      const holdingE = input.down('KeyE') || state.demoPlant;
      if (phase === 'live' && state.bomb.carrier === 'player') {
        stepPlant(state, dt, p, holdingE);
      }

      // footsteps
      const sp = speed2D(p);
      if (p.onGround && sp > 1) {
        stepAcc += sp * dt;
        if (stepAcc > 2.4) { stepAcc = 0; playFootstep(false); }
      }
    }

    if (phase === 'live') {
      stepBots(state, dt);
      stepGrenades(state, dt);
      // a bot finished the defuse
      if (state.bomb.defused) {
        state.bomb.defused = false;
        endRound(state, TEAM.DEF, 'Spike defused — defenders take the round');
      }
      // spike explosion: big puff + damage once, just before the round ends
      const bomb = state.bomb;
      if (bomb.planted && bomb.timer <= 0.25 && !bomb.boomShown) {
        bomb.boomShown = true;
        explode(state, bomb.pos.clone().setY(0.5), 160, 14, null);
      }
    }
  }

  stepRounds(state, dt);

  // who can the player see? (for the minimap, 5 Hz)
  seenTimer -= dt;
  if (seenTimer <= 0) {
    seenTimer = 0.2;
    eyePos(p, _eye);
    for (const b of state.bots) {
      if (b.team !== TEAM.DEF || !b.alive) { b.seenByPlayer = false; continue; }
      _to.set(b.pos.x, b.pos.y + 1.2, b.pos.z);
      _fwd.copy(_to).sub(_eye);
      const dist = _fwd.length();
      b.seenByPlayer = dist < 55 && losClear(_eye, _to);
    }
  }
}

// ---- render ----------------------------------------------------------------
function render() {
  const p = state.player;
  eyePos(p, _eye);
  camera.position.copy(_eye);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch + p.recoilPitch;

  // viewmodel bob + recoil
  const sp = speed2D(p);
  const bob = p.onGround && sp > 0.5 ? Math.sin(state.time * 9) * 0.012 * Math.min(1, sp / 4) : 0;
  gun.position.y = -0.22 + bob;
  gun.position.z = -0.5 + Math.min(0.12, p.recoilPitch * 1.2);
  flashMat.opacity = state.time < flashUntil ? 0.9 : 0;
  flash.rotation.z = Math.random() * Math.PI;

  syncBotMeshes(state);

  for (let i = 0; i < TRACER_MAX; i++) {
    const line = tracers[i];
    const t = state.tracers[i];
    if (!t) { line.visible = false; continue; }
    line.visible = true;
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, t.a.x, t.a.y, t.a.z);
    pos.setXYZ(1, t.b.x, t.b.y, t.b.z);
    pos.needsUpdate = true;
    line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
    line.material.color.setHex(t.color);
  }
  for (let i = 0; i < PUFF_MAX; i++) {
    const s = puffs[i];
    const pf = state.puffs[i];
    if (!pf) { s.visible = false; continue; }
    s.visible = true;
    s.position.copy(pf.pos);
    const k = pf.size * (1.6 - pf.life);
    s.scale.set(k, k, 1);
    s.material.opacity = Math.max(0, pf.life / 0.8) * 0.8;
  }
  for (let i = 0; i < GRENADE_MAX; i++) {
    const m = grenadeMeshes[i];
    const g = state.grenades[i];
    if (!g) { m.visible = false; continue; }
    m.visible = true;
    m.position.copy(g.pos);
  }
  const bomb = state.bomb;
  bombMesh.visible = bomb.planted;
  if (bomb.planted) {
    bombMesh.position.set(bomb.pos.x, 0, bomb.pos.z);
    bombLight.material.emissiveIntensity = (Math.sin(state.time * 9) > 0) ? 3 : 0.4;
  }

  // site rings pulse; site letters shrink up close so they never fill the frame
  const pulse = 0.45 + Math.sin(state.time * 2) * 0.15;
  world.rings.A.material.opacity = bomb.planted && bomb.site === 'A' ? 0.9 : pulse;
  world.rings.B.material.opacity = bomb.planted && bomb.site === 'B' ? 0.9 : pulse;
  for (const [name, sprite] of Object.entries(world.siteMarkers)) {
    const s = SITES[name];
    const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
    const k = Math.max(1.1, Math.min(3.2, d * 0.22));
    sprite.scale.set(k, k, 1);
    // fade the letter out up close: the ground ring marks the site there
    sprite.material.opacity = Math.max(0, Math.min(1, (d - 3) / 6));
  }

  updateHUD(state, 1 / 60);
  renderer.render(scene, camera);
}

// ---- loop ------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n < 5) {
    simStep(TICK);
    acc -= TICK;
    n++;
  }
  if (n === 5) acc = 0; // drop backlog rather than spiral
  render();
}
requestAnimationFrame(frame);
