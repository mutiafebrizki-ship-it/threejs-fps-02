// weapons.js — the arsenal. One table, one fire function: every gun in the game, player
// and bot alike, fires through here so recoil, spread and damage stay consistent.
export const WEAPONS = {
  pistol: {
    name: 'P-9', price: 0, auto: false, damage: 30, headMul: 3.2,
    rof: 6, mag: 12, reserve: 36, reload: 1.1,
    spreadBase: 0.006, spreadMove: 0.014, spreadBloom: 0.010,
    recoil: 0.011, kick: 0.05, range: 60, tracer: 0xffd27a,
  },
  smg: {
    name: 'Kestrel-9', price: 1500, auto: true, damage: 24, headMul: 3.2,
    rof: 11, mag: 25, reserve: 100, reload: 1.6,
    spreadBase: 0.010, spreadMove: 0.022, spreadBloom: 0.009,
    recoil: 0.008, kick: 0.04, range: 45, tracer: 0x9adfff,
  },
  rifle: {
    name: 'VK-47', price: 2700, auto: true, damage: 34, headMul: 4.0,
    rof: 9, mag: 30, reserve: 90, reload: 2.2,
    spreadBase: 0.005, spreadMove: 0.020, spreadBloom: 0.012,
    recoil: 0.016, kick: 0.09, range: 80, tracer: 0xffb347,
  },
};

export const GRENADE = { name: 'HE-7', price: 300, damage: 120, radius: 6, fuse: 1.8 };
export const ARMOR = { name: 'Vest', price: 650, absorb: 0.5 };

/** Spread in radians for a shot: still and aimed is tight, moving and spraying is not. */
export function shotSpread(def, moving, crouch, bloom) {
  let s = def.spreadBase + bloom * def.spreadBloom;
  if (moving) s += def.spreadMove;
  if (crouch) s *= 0.65;
  return s;
}

/** Damage after armor. Headshots multiply first, armor absorbs half of the rest. */
export function applyDamage(hp, armor, raw) {
  let dmg = raw;
  let armorLeft = armor;
  if (armorLeft > 0) {
    const absorbed = Math.min(armorLeft, dmg * ARMOR.absorb);
    armorLeft -= absorbed;
    dmg -= absorbed;
  }
  return { hp: hp - dmg, armor: armorLeft, dealt: dmg };
}
