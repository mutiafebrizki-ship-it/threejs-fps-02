// palette.js — one look for SANDLINE: dusk desert yard, warm sand, teal steel, amber accents.
// Every colour and material the game uses lives here, so the map reads as one place.
import * as THREE from 'three';

export const PALETTE = {
  sky: 0x2e3a4a,        // dusk blue-grey
  fog: 0x3a3f4a,
  sand: 0xc2a878,       // ground
  sandDark: 0xa68c60,
  concrete: 0x8d8a80,   // walls
  concreteDark: 0x6e6b62,
  steel: 0x4a5a66,      // containers, teal steel
  steelDark: 0x33414c,
  rust: 0xb05a2a,        // accent containers
  amber: 0xf0a830,      // UI accent, lamps, site markers
  teal: 0x2fa39a,
  attacker: 0xc9a227,   // team tint, attackers
  defender: 0x3f7fb5,   // team tint, defenders
  dark: 0x1a1c20,
};

const matCache = new Map();
/** Shared standard material by hex colour and roughness. Reused, never rebuilt per frame. */
export function mat(color, roughness = 0.9, metalness = 0.05) {
  const key = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}

/** A canvas texture drawn once at load (labels, ground detail). No network, no files. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Big letter sprite for a bombsite marker. */
export function letterTexture(letter, fg = '#f0a830', bg = 'rgba(20,22,26,0.85)') {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = bg;
    g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
    g.strokeStyle = fg; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
    g.fillStyle = fg;
    g.font = 'bold 150px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, 128, 136);
  });
}

/** Ribbed container side, painted once and reused on every container. */
export function containerTexture(base, rib) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = rib;
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 10, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, 0, w, 10);
  });
}

/** Ground: sand with noise speckle, tyre tracks and painted lane guides. */
export function groundTexture() {
  const t = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#c2a878'; g.fillRect(0, 0, w, h);
    // speckle
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // tyre tracks (vertical lanes)
    g.strokeStyle = 'rgba(60,45,25,0.16)'; g.lineWidth = 26;
    for (const x of [300, 340, 680, 720]) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    // painted centre line
    g.strokeStyle = 'rgba(240,168,48,0.55)'; g.lineWidth = 6; g.setLineDash([40, 30]);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.setLineDash([]);
  });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}
