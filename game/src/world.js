// world.js — the map: "Yard 7", a dusk desert freight yard. Two bombsites (A north, B
// south), three lanes (A-long, mid double-doors, B-long). All collision is flat AABBs;
// the same list drives player movement, bot movement, bullets and line of sight.
import * as THREE from 'three';
import { PALETTE, mat, containerTexture, groundTexture, letterTexture } from './palette.js';

export const MAP = { minX: -32, maxX: 32, minZ: -22, maxZ: 22 };
export const SITES = {
  A: { x: 20, z: -14, r: 3.5 },
  B: { x: 20, z: 14, r: 3.5 },
};
export const SPAWNS = {
  atk: [{ x: -28, z: -3 }, { x: -28, z: 0 }, { x: -28, z: 3 }, { x: -26, z: -5 }, { x: -26, z: 5 }],
  def: [{ x: 28, z: -3 }, { x: 28, z: 0 }, { x: 28, z: 3 }, { x: 26, z: -5 }, { x: 26, z: 5 }],
};

// Colliders: {x0, z0, x1, z1, h}. Movement is 2D (y is jump only); bullets use h.
export const COLLIDERS = [
  // perimeter
  { x0: -32, z0: -22, x1: -31, z1: 22, h: 4 },
  { x0: 31, z0: -22, x1: 32, z1: 22, h: 4 },
  { x0: -32, z0: -22, x1: 32, z1: -21, h: 4 },
  { x0: -32, z0: 21, x1: 32, z1: 22, h: 4 },
  // lane walls: north block forces A-long or doors, south mirrors it
  { x0: -8, z0: -13, x1: 8, z1: -12, h: 3 },
  { x0: -8, z0: 12, x1: 8, z1: 13, h: 3 },
  // mid double doors: two pillars, gap z -2..2
  { x0: -1, z0: -6, x1: 1, z1: -2, h: 3.2 },
  { x0: -1, z0: 2, x1: 1, z1: 6, h: 3.2 },
  // crates and containers (h <= 1.2 can be shot over while standing)
  { x0: -21, z0: -9, x1: -19, z1: -7, h: 1.2 },
  { x0: -21, z0: 7, x1: -19, z1: 9, h: 1.2 },
  { x0: -13.5, z0: -17, x1: -10.5, z1: -15, h: 2.2 },
  { x0: -13.5, z0: 15, x1: -10.5, z1: 17, h: 2.2 },
  { x0: 7, z0: -17, x1: 9, z1: -15, h: 1.1 },
  { x0: 7, z0: 15, x1: 9, z1: 17, h: 1.1 },
  { x0: 15, z0: -7.5, x1: 17, z1: -4.5, h: 2.4 },
  { x0: 15, z0: 4.5, x1: 17, z1: 7.5, h: 2.4 },
  { x0: 23, z0: -15, x1: 25, z1: -13, h: 1.1 },
  { x0: 23, z0: 13, x1: 25, z1: 15, h: 1.1 },
  { x0: 9, z0: -1, x1: 11, z1: 1, h: 1.1 },
  { x0: -5, z0: -10.5, x1: 1, z1: -8.5, h: 2.6 },  // container north
  { x0: -5, z0: 8.5, x1: 1, z1: 10.5, h: 2.6 },   // container south
  { x0: -0.5, z0: -2, x1: 0.5, z1: -0.5, h: 1.0 }, // barrel cluster mid (approx boxes)
  { x0: -0.5, z0: 0.5, x1: 0.5, z1: 2, h: 1.0 },
];

// Nav graph: node name -> {x, z, links: [names]}. Bots walk it; collision slides them round cover.
export const NAV = {
  atkSpawn: { x: -28, z: 0, links: ['aLong1', 'mid1', 'bLong1'] },
  aLong1: { x: -20, z: -16, links: ['atkSpawn', 'aLong2', 'mid1'] },
  aLong2: { x: -8, z: -16, links: ['aLong1', 'aLong3'] },
  aLong3: { x: 6, z: -16, links: ['aLong2', 'aSiteEntry', 'midA'] },
  aSiteEntry: { x: 14, z: -14, links: ['aLong3', 'aSite', 'midA'] },
  aSite: { x: 20, z: -14, links: ['aSiteEntry', 'defA'] },
  mid1: { x: -14, z: 0, links: ['atkSpawn', 'aLong1', 'bLong1', 'midDoors'] },
  midDoors: { x: 0, z: 0, links: ['mid1', 'mid2'] },
  mid2: { x: 8, z: 0, links: ['midDoors', 'midA', 'midB', 'defMid'] },
  midA: { x: 13, z: -8, links: ['mid2', 'aSiteEntry', 'aLong3'] },
  midB: { x: 13, z: 8, links: ['mid2', 'bSiteEntry', 'bLong3'] },
  bLong1: { x: -20, z: 16, links: ['atkSpawn', 'bLong2', 'mid1'] },
  bLong2: { x: -8, z: 16, links: ['bLong1', 'bLong3'] },
  bLong3: { x: 6, z: 16, links: ['bLong2', 'bSiteEntry', 'midB'] },
  bSiteEntry: { x: 14, z: 14, links: ['bLong3', 'bSite', 'midB'] },
  bSite: { x: 20, z: 14, links: ['bSiteEntry', 'defB'] },
  defSpawn: { x: 28, z: 0, links: ['defA', 'defB', 'defMid'] },
  defA: { x: 24, z: -8, links: ['defSpawn', 'aHold1', 'aSite'] },
  defB: { x: 24, z: 8, links: ['defSpawn', 'bHold1', 'bSite'] },
  defMid: { x: 20, z: 0, links: ['defSpawn', 'mid2', 'aSite', 'bSite'] },
  aHold1: { x: 16, z: -18, links: ['defA', 'aSite'] },
  bHold1: { x: 16, z: 18, links: ['defB', 'bSite'] },
  aHold2: { x: 25, z: -18, links: ['defA', 'aSite'] },
  bHold2: { x: 25, z: 18, links: ['defB', 'bSite'] },
};

export const ROUTES = {
  atkA: ['atkSpawn', 'aLong1', 'aLong2', 'aLong3', 'aSiteEntry', 'aSite'],
  atkAmid: ['atkSpawn', 'mid1', 'midDoors', 'mid2', 'midA', 'aSiteEntry', 'aSite'],
  atkB: ['atkSpawn', 'bLong1', 'bLong2', 'bLong3', 'bSiteEntry', 'bSite'],
  atkBmid: ['atkSpawn', 'mid1', 'midDoors', 'mid2', 'midB', 'bSiteEntry', 'bSite'],
  defA: ['defSpawn', 'defA', 'aHold1'],
  defA2: ['defSpawn', 'defA', 'aHold2'],
  defB: ['defSpawn', 'defB', 'bHold1'],
  defB2: ['defSpawn', 'defB', 'bHold2'],
  defMid: ['defSpawn', 'defMid'],
};

/** Breadth-first route between two nav nodes. */
export function findRoute(from, to) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    for (const l of NAV[n].links) {
      if (!(l in prev)) {
        prev[l] = n;
        if (l === to) {
          const path = [to];
          let c = to;
          while (prev[c] !== null) { c = prev[c]; path.unshift(c); }
          return path;
        }
        queue.push(l);
      }
    }
  }
  return [from, to];
}

export function nearestNode(x, z) {
  let best = null, bd = Infinity;
  for (const [name, n] of Object.entries(NAV)) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

/** Move a circle (radius r) by (dx, dz), sliding on AABBs. Mutates and returns pos. */
export function moveCircle(pos, dx, dz, r) {
  // X axis
  let nx = pos.x + dx;
  for (const b of COLLIDERS) {
    if (pos.z + r > b.z0 && pos.z - r < b.z1) {
      if (dx > 0 && nx + r > b.x0 && pos.x + r <= b.x0) nx = b.x0 - r;
      else if (dx < 0 && nx - r < b.x1 && pos.x - r >= b.x1) nx = b.x1 + r;
    }
  }
  pos.x = Math.max(MAP.minX + r, Math.min(MAP.maxX - r, nx));
  // Z axis
  let nz = pos.z + dz;
  for (const b of COLLIDERS) {
    if (pos.x + r > b.x0 && pos.x - r < b.x1) {
      if (dz > 0 && nz + r > b.z0 && pos.z + r <= b.z0) nz = b.z0 - r;
      else if (dz < 0 && nz - r < b.z1 && pos.z - r >= b.z1) nz = b.z1 + r;
    }
  }
  pos.z = Math.max(MAP.minZ + r, Math.min(MAP.maxZ - r, nz));
  return pos;
}

/** Slab ray vs one AABB (y from 0..h). Returns t or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [
    [ox, dx, b.x0, b.x1], [oy, dy, 0, b.h], [oz, dz, b.z0, b.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

const _dir = new THREE.Vector3();
/** Ray vs world: walls and ground. Returns {dist, point} or null. */
export function raycastWorld(origin, dir, maxDist) {
  let best = Infinity;
  for (const b of COLLIDERS) {
    const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b);
    if (t < best && t > 0) best = t;
  }
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t > 0 && t < best) best = t;
  }
  if (best === Infinity || best > maxDist) return null;
  return { dist: best, point: origin.clone().addScaledVector(dir, best) };
}

/** True when no wall stands between a and b (both Vector3). */
export function losClear(a, b) {
  _dir.copy(b).sub(a);
  const d = _dir.length();
  if (d < 0.01) return true;
  _dir.multiplyScalar(1 / d);
  const hit = raycastWorld(a, _dir, d);
  return hit === null;
}

// The capsule test the game actually uses: horizontal distance to the body axis plus
// a head sphere. Cheap, exact enough for hit registration.
export function rayBot(origin, dir, maxDist, bot) {
  // body: vertical segment (x, 0.15..1.35, z), radius 0.38
  // head: sphere centre (x, 1.52, z), radius 0.26
  const ox = origin.x - bot.pos.x, oz = origin.z - bot.pos.z;
  const dx = dir.x, dz = dir.z;
  // 2D closest approach in XZ
  const a = dx * dx + dz * dz;
  let t2d = 0;
  if (a > 1e-9) t2d = -(ox * dx + oz * dz) / a;
  if (t2d < 0) t2d = 0;
  const cx = ox + dx * t2d, cz = oz + dz * t2d;
  const distXZ = Math.sqrt(cx * cx + cz * cz);
  let best = Infinity, part = null;
  if (distXZ < 0.38 && t2d <= maxDist) {
    // ray passes the body cylinder: find the t where y is inside 0.15..1.35
    const yAt = origin.y + dir.y * t2d;
    if (yAt >= 0.1 && yAt <= 1.4) { best = t2d; part = 'body'; }
    else if (dir.y !== 0) {
      // enter/exit the y slab before/after closest approach
      const tLow = (0.15 - origin.y) / dir.y, tHigh = (1.35 - origin.y) / dir.y;
      const tIn = Math.min(tLow, tHigh), tOut = Math.max(tLow, tHigh);
      if (tOut >= 0 && tIn <= maxDist) {
        const t = Math.max(tIn, 0);
        const px2 = ox + dx * t, pz2 = oz + dz * t;
        if (Math.sqrt(px2 * px2 + pz2 * pz2) < 0.38) { best = t; part = 'body'; }
      }
    }
  }
  // head sphere
  const hx = bot.pos.x, hy = 1.52, hz = bot.pos.z;
  const lx = origin.x - hx, ly = origin.y - hy, lz = origin.z - hz;
  const bq = lx * dir.x + ly * dir.y + lz * dir.z;
  const cq = lx * lx + ly * ly + lz * lz - 0.26 * 0.26;
  const disc = bq * bq - cq;
  if (disc >= 0) {
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && t < best && t <= maxDist) { best = t; part = 'head'; }
  }
  if (best === Infinity) return null;
  return { dist: best, part, point: origin.clone().addScaledVector(dir, best) };
}

// ---- three.js scene -------------------------------------------------------
export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 40, 110);

  const hemi = new THREE.HemisphereLight(0xbfd4e6, 0x8a6f4d, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(-30, 38, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 50),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const box = (x0, z0, x1, z1, h, material, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), material);
    m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // perimeter walls
  const wallMat = mat(PALETTE.concrete, 0.95);
  const wallDark = mat(PALETTE.concreteDark, 0.95);
  box(-32, -22, -31, 22, 4, wallMat);
  box(31, -22, 32, 22, 4, wallMat);
  box(-32, -22, 32, -21, 4, wallDark);
  box(-32, 21, 32, 22, 4, wallDark);
  // lane walls + mid doors
  box(-8, -13, 8, -12, 3, wallDark);
  box(-8, 12, 8, 13, 3, wallDark);
  box(-1, -6, 1, -2, 3.2, wallMat);
  box(-1, 2, 1, 6, 3.2, wallMat);
  // crates
  const crateMat = mat(0x9a7b4f, 0.9);
  const crateDark = mat(0x7d6240, 0.9);
  for (const b of COLLIDERS.slice(8)) {
    if (b.h > 2.5) continue; // containers handled below
    box(b.x0, b.z0, b.x1, b.z1, b.h, (b.x1 - b.x0 + b.z1 - b.z0) > 3 ? crateDark : crateMat);
  }
  // containers with ribbed sides
  const contTexA = containerTexture('#4a5a66', '#33414c');
  const contTexB = containerTexture('#b05a2a', '#7d3d1c');
  const contA = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.6, 2),
    new THREE.MeshStandardMaterial({ map: contTexA, roughness: 0.7, metalness: 0.3 }),
  );
  contA.position.set(-2, 1.3, -9.5); contA.castShadow = true; contA.receiveShadow = true;
  scene.add(contA);
  const contB = contA.clone();
  contB.material = new THREE.MeshStandardMaterial({ map: contTexB, roughness: 0.7, metalness: 0.3 });
  contB.position.set(-2, 1.3, 9.5);
  scene.add(contB);

  // barrels (visual, at the mid collider boxes)
  const barrelMat = mat(PALETTE.rust, 0.6, 0.4);
  for (const [bx, bz] of [[-0.2, -1.2], [0.2, 1.2]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), barrelMat);
    barrel.position.set(bx, 0.5, bz);
    barrel.castShadow = true;
    scene.add(barrel);
  }

  // site markers: floating letter + ground ring
  const rings = {};
  const siteMarkers = {};
  for (const [name, s] of Object.entries(SITES)) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(name), transparent: true, depthWrite: false }));
    sprite.position.set(s.x, 3.4, s.z);
    sprite.scale.set(3.2, 3.2, 1);
    scene.add(sprite);
    siteMarkers[name] = sprite;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    rings[name] = ring;
  }

  // lamp poles at the sites and mid
  const poleMat = mat(0x2c2f34, 0.5, 0.6);
  const lampMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 2.2 });
  for (const [lx, lz] of [[20, -18], [20, 18], [0, -8], [0, 8]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 8), poleMat);
    pole.position.set(lx, 2.5, lz);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    lamp.position.set(lx, 5.1, lz);
    scene.add(lamp);
  }
  const siteLightA = new THREE.PointLight(PALETTE.amber, 12, 18, 1.8);
  siteLightA.position.set(20, 4, -14);
  scene.add(siteLightA);
  const siteLightB = siteLightA.clone();
  siteLightB.position.set(20, 4, 14);
  scene.add(siteLightB);

  return { rings, siteMarkers };
}
