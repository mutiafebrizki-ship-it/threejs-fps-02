// player.js — first-person movement: acceleration, friction, crouch, jump and AABB
// collision. Stopping to aim pays: spread grows with speed, crouching tightens it.
import * as THREE from 'three';
import { TICK } from './state.js';
import { moveCircle } from './world.js';

const WALK_SPEED = 4.6;
const CROUCH_SPEED = 2.3;
const ACCEL = 42;
const FRICTION = 10;
const GRAVITY = 15;
const JUMP_SPEED = 5.6;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

/** Advance the player one fixed tick. input: {down, consumeMouse, lookSpeed}. */
export function stepPlayer(state, input, dt = TICK) {
  const p = state.player;
  if (!p.alive) return;

  // look: mouse deltas + arrow keys
  const { dx, dy } = input.consumeMouse();
  p.yaw -= dx * input.lookSpeed;
  p.pitch -= dy * input.lookSpeed;
  if (input.down('ArrowLeft')) p.yaw += 2.4 * dt;
  if (input.down('ArrowRight')) p.yaw -= 2.4 * dt;
  if (input.down('ArrowUp')) p.pitch += 1.8 * dt;
  if (input.down('ArrowDown')) p.pitch -= 1.8 * dt;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));

  p.crouch = input.down('ControlLeft') || input.down('KeyC');
  const speed = p.crouch ? CROUCH_SPEED : WALK_SPEED;

  _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  _wish.set(0, 0, 0);
  if (input.down('KeyW')) _wish.add(_fwd);
  if (input.down('KeyS')) _wish.sub(_fwd);
  if (input.down('KeyD')) _wish.add(_right);
  if (input.down('KeyA')) _wish.sub(_right);
  if (_wish.lengthSq() > 0) _wish.normalize();

  // accelerate towards wish direction, friction when idle
  const targetVx = _wish.x * speed;
  const targetVz = _wish.z * speed;
  const rate = _wish.lengthSq() > 0 ? ACCEL * dt : FRICTION * dt;
  p.vel.x += Math.max(-rate, Math.min(rate, targetVx - p.vel.x));
  p.vel.z += Math.max(-rate, Math.min(rate, targetVz - p.vel.z));

  // jump / gravity (y is vertical velocity)
  if (p.onGround && input.down('Space')) {
    p.vel.y = JUMP_SPEED;
    p.onGround = false;
  }
  p.vel.y -= GRAVITY * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }

  moveCircle(p.pos, p.vel.x * dt, p.vel.z * dt, p.radius);

  // recoil recovery + bloom decay
  p.recoilPitch *= Math.pow(0.001, dt); // fast decay
  p.bloom = Math.max(0, p.bloom - dt * 2.2);
  if (p.damageFlash > 0) p.damageFlash -= dt * 2;
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.reloading > 0) p.reloading -= dt;
}

/** Eye position for the camera. */
export function eyePos(p, out) {
  const eye = p.crouch ? p.eyeCrouch : p.eyeStand;
  out.set(p.pos.x, p.pos.y + eye, p.pos.z);
  return out;
}

/** Current horizontal speed, for spread and footsteps. */
export function speed2D(p) {
  return Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
}
