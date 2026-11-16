// state.js — one state object for the whole game. The sim owns it, the renderer reads it,
// the HUD reads it. Nothing else keeps game truth.
import * as THREE from 'three';

export const TICK = 1 / 60;          // fixed-step sim
export const ROUND_TIME = 100;        // seconds of live play per round
export const BUY_TIME = 20;           // seconds of buy phase
export const PLANT_TIME = 3.2;        // seconds holding E to plant
export const DEFUSE_TIME = 5.0;       // seconds holding E to defuse
export const BOMB_FUSE = 35;          // seconds from plant to explosion
export const WIN_ROUNDS = 5;          // first to 5 takes the match (max 9 rounds)
export const START_MONEY = 800;

export const TEAM = { ATK: 'atk', DEF: 'def' };

export function createPlayerState() {
  const weapons = { pistol: { mag: 12, reserve: 36 } };
  return {
    pos: new THREE.Vector3(-28, 0, 0),
    vel: new THREE.Vector3(),
    yaw: -Math.PI / 2, // facing +x (east, towards the sites)
    pitch: 0,
    hp: 100,
    armor: 0,
    alive: true,
    crouch: false,
    onGround: true,
    radius: 0.35,
    eyeStand: 1.62,
    eyeCrouch: 1.05,
    weapons,
    slots: ['pistol'],
    slot: 0,
    weapon: 'pistol',      // current weapon key; ammo points at weapons[weapon]
    ammo: weapons.pistol,
    grenades: 0,
    bombCarrier: true, // the player starts with the spike
    planting: 0,
    defusing: 0,
    reloading: 0,
    fireCooldown: 0,
    bloom: 0,          // accumulated spread, decays
    recoilPitch: 0,    // visual + aim kick, recovers
    lastDamageFrom: 0, // yaw of last attacker, for the damage indicator
    damageFlash: 0,
    kills: 0,
    deaths: 0,
  };
}

export function createState() {
  return {
    time: 0,
    tick: 0,
    phase: 'menu', // menu | buy | live | end | matchend
    phaseTimer: 0,
    round: 1,
    score: { atk: 0, def: 0 },
    money: START_MONEY,
    lossStreak: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    player: createPlayerState(),
    bots: [],
    tracers: [],   // {a: Vector3, b: Vector3, life, color}
    grenades: [],  // {pos, vel, fuse, owner, bounced}
    puffs: [],     // impact dust {pos, life, size}
    bomb: {
      site: null, planted: false, plantProgress: 0, defuseProgress: 0,
      timer: 0, pos: new THREE.Vector3(), carrier: 'player',
    },
    killfeed: [],  // {text, color, life}
    events: [],    // transient banners for HUD
    demo: null,    // screenshot scene name, from ?scene=
    demoFireUntil: 0,
    demoPlant: false,
    buyOpen: false,
    scoreboardOpen: false,
    muted: false,
  };
}
