// audio.js — every sound is synthesized with WebAudio. No audio files, no network.
// One AudioContext, one master gain, short-lived nodes only (no per-frame allocation).
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function now() { return ctx ? ctx.currentTime : 0; }

/** Short filtered noise burst: the body of a gunshot, a footstep, an explosion. */
function noiseBurst(t, dur, filterFreq, gain, type = 'lowpass', q = 1) {
  if (!ctx || muted) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

function tone(t, freq, dur, gain, type = 'sine', slideTo = 0) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

function click(t, freq, gain) { tone(t, freq, 0.03, gain, 'square'); }

/** distance in metres scales a shot down and dulls it. */
export function playShot(weapon, distance) {
  if (!ctx || muted) return;
  const t = now();
  const att = Math.max(0.08, 1 - distance / 70);
  if (weapon === 'rifle') { noiseBurst(t, 0.12, 1800, 0.5 * att); tone(t, 160, 0.09, 0.35 * att, 'sawtooth', 60); }
  else if (weapon === 'smg') { noiseBurst(t, 0.08, 2400, 0.35 * att); tone(t, 220, 0.06, 0.22 * att, 'sawtooth', 90); }
  else if (weapon === 'pistol') { noiseBurst(t, 0.1, 1400, 0.45 * att); tone(t, 130, 0.08, 0.3 * att, 'sawtooth', 55); }
  else { noiseBurst(t, 0.06, 3000, 0.25 * att); }
}

export function playDryFire() { if (ctx && !muted) click(now(), 900, 0.12); }
export function playReload() {
  if (!ctx || muted) return;
  const t = now();
  click(t, 700, 0.15); click(t + 0.18, 500, 0.15); click(t + 0.55, 800, 0.18);
}
export function playHit() { if (ctx && !muted) tone(now(), 1400, 0.05, 0.2, 'sine'); }
export function playKill() {
  if (!ctx || muted) return;
  const t = now();
  tone(t, 660, 0.07, 0.2, 'sine'); tone(t + 0.07, 990, 0.1, 0.2, 'sine');
}
export function playHurt() {
  if (!ctx || muted) return;
  noiseBurst(now(), 0.15, 300, 0.4);
  tone(now(), 90, 0.15, 0.3, 'sine', 50);
}
export function playFootstep(run) {
  if (!ctx || muted) return;
  noiseBurst(now(), 0.05, 500, run ? 0.1 : 0.06);
}
export function playExplosion() {
  if (!ctx || muted) return;
  const t = now();
  noiseBurst(t, 1.2, 400, 0.9); tone(t, 70, 1.0, 0.7, 'sine', 28);
}
export function playBeep(final = false) {
  if (!ctx || muted) return;
  tone(now(), final ? 1200 : 880, final ? 0.25 : 0.08, 0.18, 'sine');
}
export function playPlant() { if (ctx && !muted) { const t = now(); tone(t, 440, 0.12, 0.2, 'sine'); tone(t + 0.15, 660, 0.2, 0.2, 'sine'); } }
export function playBuy() { if (ctx && !muted) { const t = now(); tone(t, 990, 0.06, 0.15, 'sine'); tone(t + 0.06, 1320, 0.1, 0.15, 'sine'); } }
export function playRoundEnd(win) {
  if (!ctx || muted) return;
  const t = now();
  if (win) { tone(t, 523, 0.15, 0.22, 'sine'); tone(t + 0.15, 659, 0.15, 0.22, 'sine'); tone(t + 0.3, 784, 0.3, 0.22, 'sine'); }
  else { tone(t, 392, 0.2, 0.22, 'sine'); tone(t + 0.2, 311, 0.35, 0.22, 'sine'); }
}
export function playBounce() { if (ctx && !muted) click(now(), 300, 0.1); }
