// demo.js — screenshot scenes. ?scene=fight | plant | score | menu
// These are real gameplay states (the sim runs from here); they only choose where the
// player stands and what the round looks like when the screenshot is taken.
import { TEAM } from './state.js';
import { startMatch } from './rounds.js';

export function setupDemo(state, name) {
  state.demo = name;
  if (name === 'menu') return; // title screen as-is

  startMatch(state);
  // skip the buy phase: the screenshots want live action
  state.phase = 'live';
  state.phaseTimer = 100;
  state.buyOpen = false;

  const p = state.player;
  const defs = state.bots.filter((b) => b.team === TEAM.DEF);
  const atks = state.bots.filter((b) => b.team === TEAM.ATK);

  if (name === 'fight') {
    // player at mid doors, two defenders in the lane ahead, tracers in the air
    p.pos.set(-10, 0, 0);
    p.yaw = -Math.PI / 2;
    p.pitch = 0;
    p.weapon = 'rifle';
    if (!p.weapons.rifle) p.weapons.rifle = { mag: 30, reserve: 90 };
    p.ammo = p.weapons.rifle;
    if (!p.slots.includes('rifle')) p.slots.push('rifle');
    const d0 = defs[0], d1 = defs[1];
    d0.pos.set(8, 0, -2); d0.mode = 'hold'; d0.holdYaw = Math.PI / 2;
    d1.pos.set(11, 0, 2.5); d1.mode = 'hold'; d1.holdYaw = Math.PI / 2;
    const a0 = atks[0];
    a0.pos.set(-6, 0, -3); a0.mode = 'hold'; a0.holdYaw = -Math.PI / 2;
    state.demoFireUntil = 2.5; // hold the trigger briefly for muzzle flash + tracers
  } else if (name === 'plant') {
    // player inside site A with the spike, planting; a defender closing in
    p.pos.set(18, 0, -13); // inside site A (centre 20,-14, r 3.5)
    p.yaw = -1.0; // facing the site centre and the east approach
    p.pitch = 0;
    p.armor = 50;
    p.weapon = 'rifle';
    if (!p.weapons.rifle) p.weapons.rifle = { mag: 30, reserve: 90 };
    p.ammo = p.weapons.rifle;
    if (!p.slots.includes('rifle')) p.slots.push('rifle');
    state.bomb.plantProgress = 2.2; // mid-plant when the shot is taken
    const d0 = defs[0];
    d0.pos.set(24, 0, -14);
    // every defender holds facing east, away from the site: caught off guard
    for (const d of defs) { d.mode = 'hold'; d.holdYaw = -Math.PI / 2; d.yaw = -Math.PI / 2; }
    state.demoPlant = true; // keep E held so the plant completes on camera
  } else if (name === 'score') {
    // end of a round the attackers won; scoreboard open over the yard
    state.score = { atk: 2, def: 1 };
    state.round = 4;
    state.phase = 'end';
    state.phaseTimer = 4;
    state.roundWinner = TEAM.ATK;
    state.roundReason = 'Enemy team eliminated';
    state.scoreboardOpen = true;
    p.pos.set(-14, 0, -6);
    p.yaw = -Math.PI / 2;
    p.kills = 3;
    const d0 = defs[0];
    d0.alive = false; d0.deathTime = state.time;
    d0.pos.set(2, 0, -1);
  }
}
