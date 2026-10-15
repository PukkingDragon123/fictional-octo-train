// World stream 3 — props for the "wrong rooms": furniture on the ceiling or
// stuck to a wall, a door too high to reach and one too small to use, stairs
// that climb into the ceiling, a crack at the end of a corridor, slanted
// partition slabs, phones that ring for nobody, buckets under a dripping
// ceiling, a stack of televisions showing the back of your head, the same
// poster over and over (the man in it gets closer), black doorways.
import * as THREE from 'three';
import { defObj, buildObjGeometry, objDef } from '../../world/objects';
import { WALL_H } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph, bayer } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { text, textC, textW, rod } from './b_common';
import { WZ, crtGlass } from './a_lib';
import { nz, over } from '../textures/kit';
import '../../world/roomFx';

const T = ['wrong', 'zw'];

/** labels the zw_plate sign can show */
export const ZW_PLATES = ['ROOM 3', 'ROOM 4', 'ROOM 13', 'EXIT', 'NOT AN EXIT', 'STAFF', 'THIS WAY', 'THAT WAY', 'WAIT HERE', 'DO NOT KNOCK', 'BAY 0', 'LOST PROPERTY', 'TOILETS', 'WAITING ROOM', 'ANNEX B', 'BASE CAMP', 'SECTOR 7', 'DECON', 'CAFE', 'SHOWROOM', 'WAREHOUSE', 'COLLECTION', 'KITCHENS', 'BEDROOMS', 'OFFICES', 'LIVING', 'HOME', '?'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
export const zwPlateTex = (label: string) => 'zw_pl_' + slug(ZW_PLATES.includes(label) ? label : '?');

// ---------------------------------------------------------------- textures
/** a CRT frame of a corridor, seen from behind a figure in a yellow jumpsuit; k = small differences */
function backOfYou(pc: PixelCanvas, k: number) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  // the corridor: yellow walls converging on a dark doorway
  const Y = makeRamp(0xb8a050, 5, { spread: 0.35 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = Math.abs(x - W / 2) / (W / 2), cy = y / H;
    const wall = cx > 0.32 + cy * 0.1;
    const floor = cy > 0.62 + cx * 0.1;
    let v = wall ? 0.55 - cx * 0.2 : floor ? 0.3 + (1 - cy) * 0.2 : 0.4;
    if (!wall && !floor && cx < 0.12 && cy > 0.3 && cy < 0.66) v = 0.02;
    pc.set(x, y, Y[Math.max(0, Math.min(4, Math.round(v * 4 + (bayer(x, y) - 0.5) * 0.6)))]);
  }
  // a fluorescent panel on the ceiling
  pc.rect(Math.floor(W / 2) - 4, 2, 8, 2, 0xf8f0c0);
  // the figure: shoulders, jumpsuit, a neck, the back of a head; offset per screen
  const fx = Math.floor(W / 2) + [0, -2, 1, 3, -1, 0][k % 6], fy = H - 2;
  const sw = [9, 9, 8, 10, 9, 7][k % 6];
  for (let y = fy - 12; y <= fy; y++) for (let x = fx - sw; x <= fx + sw; x++) {
    const t = (y - (fy - 12)) / 12;
    if (Math.abs(x - fx) > sw * (0.7 + t * 0.3)) continue;
    pc.set(x, y, Math.abs(x - fx) < 1 && y > fy - 9 ? 0x8a6a10 : y === fy - 12 ? 0xe8c840 : 0xd0a820);
  }
  for (let y = fy - 16; y <= fy - 12; y++) for (let x = fx - 2; x <= fx + 2; x++) pc.set(x, y, 0xc89878);
  for (let y = fy - 23; y <= fy - 15; y++) for (let x = fx - 4; x <= fx + 4; x++) {
    if (Math.hypot((x - fx) / 4.2, (y - (fy - 19)) / 4.6) > 1) continue;
    pc.set(x, y, y < fy - 18 || Math.abs(x - fx) > 2 ? 0x2a1e14 : 0x3a2a1c);
  }
  // number patch on the back
  pc.rect(fx - 2, fy - 9, 5, 3, 0x1a1a1a); pc.set(fx - 1, fy - 8, 0xe8e8e8); pc.set(fx + 1, fy - 8, 0xe8e8e8);
  // REC dot and timestamp
  pc.rect(2, 2, 2, 2, 0xff2020);
  text(pc, 'REC', 5, 1, 0xf0f0f0);
  text(pc, k === 5 ? 'NOW' : '25:61', W - 22, H - 7, 0xf0f0f0);
  crtGlass(pc, 0, 0, W, H, 0x101010, 0.55);
  // tracking noise band
  const ty = 6 + ((k * 7) % (H - 10));
  for (let x = 0; x < W; x++) if (ph(x, ty, 8301 + k) < 0.6) pc.blend(x, ty, 0xffffff, 0.5);
}

/** the poster: a photo of this hallway, a figure standing far down it; k = how close it has come */
function samePoster(pc: PixelCanvas, k: number) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  pc.fill(0xf0ead6);
  pc.rect(0, 0, W, 9, 0x1a1a1a);
  textC(pc, 'HAVE YOU SEEN', W / 2, 2, 0xf0e8c8);
  const px = 2, py = 11, pw = W - 4, ph2 = H - 22;
  const Y = makeRamp(0xa89048, 5, { spread: 0.3 });
  for (let y = 0; y < ph2; y++) for (let x = 0; x < pw; x++) {
    const cx = Math.abs(x - pw / 2) / (pw / 2), cy = y / ph2;
    const wall = cx > 0.3 + cy * 0.15, floor = cy > 0.6;
    const v = wall ? 0.55 - cx * 0.25 : floor ? 0.35 : 0.2;
    pc.set(px + x, py + y, Y[Math.max(0, Math.min(4, Math.round(v * 4 + (bayer(x, y) - 0.5) * 0.5)))]);
  }
  // the figure, closer on every poster
  const s = [1, 1.4, 2, 2.8, 3.8, 5.2][k % 6];
  const fx = px + pw / 2, fyb = py + ph2 * (0.62 + k * 0.05);
  for (let y = 0; y < Math.round(8 * s); y++) for (let x = -Math.round(1.6 * s); x <= Math.round(1.6 * s); x++) {
    const t = y / (8 * s);
    if (Math.abs(x) > 1.6 * s * (t < 0.3 ? 0.55 : 1)) continue;
    const Yy = Math.round(fyb - 8 * s + y);
    if (Yy < py || Yy >= py + ph2) continue;
    pc.set(Math.round(fx + x), Yy, t < 0.3 ? 0x2a2018 : 0x3a3020);
  }
  pc.strokeRect(px - 1, py - 1, pw + 2, ph2 + 2, 0x1a1a1a);
  textC(pc, 'THIS HALLWAY?', W / 2, H - 9, 0x1a1a1a);
  for (let x = 4; x < W - 4; x += 2) pc.set(x, H - 3, 0x8a8478);
  // tape corners
  for (const [x, y] of [[0, 0], [W - 4, 0], [0, H - 3], [W - 4, H - 3]] as const) pc.rect(x, y, 4, 3, 0xe8dca0);
}

addTextureModule(() => {
  const A = atlas();
  for (let k = 0; k < 6; k++) A.add('zw_back_' + k, 40, 30, (pc) => backOfYou(pc, k));
  for (let k = 0; k < 6; k++) A.add('zw_same_' + k, 26, 38, (pc) => samePoster(pc, k));
  // the crack: a ragged black slit in plaster
  A.add('zw_crack_tex', 12, 64, (pc) => {
    pc.wrap = false; pc.clear();
    for (let y = 0; y < 64; y++) {
      const c = 6 + Math.round(Math.sin(y * 0.31) * 1.2 + (nz(pc, 0, y, 1, 8, 2, 8311) - 0.5) * 3);
      const w = 1 + (y > 4 && y < 60 ? 1 : 0) + (y > 14 && y < 50 ? 1 : 0);
      for (let x = c - w - 1; x <= c + w; x++) {
        if (x === c - w - 1 || x === c + w) over(pc, x, y, 0x6a6448, 160);
        else over(pc, x, y, 0x000000, 255);
      }
    }
  });
  // pure black, no texture at all (it eats the light)
  A.add('zw_black', 4, 4, (pc) => pc.fill(0x000000));
  // water: drip strand
  A.add('zw_water', 4, 4, (pc) => { pc.fill(0x9ab8c8); pc.set(1, 1, 0xe8f4ff); });
  // plates for signs
  for (const L of ZW_PLATES) A.add(zwPlateTex(L), Math.max(24, textW(L) + 6), 9, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2c30);
    for (let x = 0; x < pc.w; x++) { pc.set(x, 0, 0x4a4c50); pc.set(x, 8, 0x16181a); }
    textC(pc, L, pc.w / 2, 2, 0xe8e4d8);
  });
  // rotary phone body texture
  A.add('zw_dial', 8, 8, (pc) => {
    pc.wrap = false; pc.clear();
    pc.circle(3.5, 3.5, 3.6, 0xe8e4d8); pc.circle(3.5, 3.5, 1.4, 0x2a2a2a);
    for (let k = 0; k < 8; k++) { const a = k * 0.7 + 0.6; pc.set(Math.round(3.5 + Math.cos(a) * 2.6), Math.round(3.5 + Math.sin(a) * 2.6), 0x1a1a1a); }
  });
});

// ---------------------------------------------------------------- furniture on the ceiling / on a wall
const m4 = (fn: (m: THREE.Matrix4) => void) => { const m = new THREE.Matrix4(); fn(m); return m; };
function stamp(mb: ModelBuilder, of: string, st: Record<string, any>, m: THREE.Matrix4) {
  if (!objDef(of)) return;
  const g = buildObjGeometry(of, st);
  if (g) mb.appendGeometry(g, m);
}
const ofState = (s: Record<string, any>) => (s.ofState && typeof s.ofState === 'object' ? s.ofState : {});

defObj({
  key: 'zw_upside_down', name: 'Furniture', w: 1, d: 1, height: 0, block: 'none', ceiling: true,
  sound: 'wood', hp: 200,
  desc: 'Bolted to the ceiling, upside down, exactly where it would stand on the floor. The dust on it has settled upwards.',
  tags: [...T, 'ceiling'],
  variant: (s) => String(s.of ?? 'chair_office') + '|' + JSON.stringify(ofState(s)),
  model: (mb, s) => {
    const of = String(s.of ?? 'chair_office');
    // rotate 180° about z: up becomes down, the front still faces +z
    stamp(mb, of, ofState(s), m4((m) => m.makeTranslation(0, WALL_H - 0.01, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI))));
  },
});

defObj({
  key: 'zw_on_wall', name: 'Furniture', w: 1, d: 1, height: 1.9, block: 'low', onWall: true,
  sound: 'wood', hp: 200,
  desc: 'It stands on the wall as if the wall were the floor. When you look away, you are not sure which one is.',
  tags: [...T, 'wall', 'fixed'],
  variant: (s) => String(s.of ?? 'chair_office') + '|' + String(s.h ?? 1.35) + '|' + JSON.stringify(ofState(s)),
  model: (mb, s) => {
    const of = String(s.of ?? 'chair_office');
    const h = Number(s.h ?? 1.35);
    // rotate +90° about x: the object's up points into the room, its front points down at the floor
    stamp(mb, of, ofState(s), m4((m) => m.makeTranslation(0, h, WZ + 0.02).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))));
    // the brackets holding it there
    for (const x of [-0.3, 0.3]) mb.box(x, h - 0.05, WZ + 0.01, 0.06, 0.1, 0.04, 'metal_dark');
  },
});

// ---------------------------------------------------------------- doors you cannot use
defObj({
  key: 'zw_high_door', name: 'Door', height: 2.7, block: 'none', onWall: true,
  sound: 'wood', hp: 99999,
  desc: 'A perfectly ordinary door, two metres up the wall. There is a light on behind it. There are no stairs.',
  tags: [...T, 'door', 'wall', 'fixed'],
  variant: (s) => String(s.style ?? 'door_office'),
  model: (mb, s) => {
    const tex = String(s.style ?? 'door_office');
    const y0 = 1.62, h = 1.06, w = 0.5;
    mb.box(0, y0 - 0.04, WZ + 0.03, w + 0.1, 0.05, 0.06, 'wood_trim');
    for (const sx of [-1, 1]) mb.box(sx * (w / 2 + 0.03), y0, WZ + 0.03, 0.05, h, 0.06, 'wood_trim');
    mb.box(0, y0 + h, WZ + 0.03, w + 0.1, 0.05, 0.06, 'wood_trim');
    mb.box(0, y0, WZ + 0.01, w, h, 0.04, tex, { fit: true });
    mb.cylinderZ(w / 2 - 0.07, y0 + h * 0.48, WZ + 0.04, 0.018, 0.04, 6, 'metal_brass');
    // light leaking out under it
    mb.box(0, y0 - 0.008, WZ + 0.035, w - 0.04, 0.012, 0.01, 'white', { color: 0xfff0c0, emissive: 1.4 });
  },
});

defObj({
  key: 'zw_tiny_door', name: 'Small Door', height: 0.6, block: 'none', onWall: true,
  sound: 'wood', hp: 99999,
  desc: 'A door about knee high, with a knob, a keyhole and a doormat. Something on the other side is watching television.',
  tags: [...T, 'door', 'wall', 'fixed'],
  variant: (s) => String(s.style ?? 'door_house'),
  model: (mb, s) => {
    const tex = String(s.style ?? 'door_house');
    const h = 0.52, w = 0.24;
    for (const sx of [-1, 1]) mb.box(sx * (w / 2 + 0.015), 0, WZ + 0.02, 0.025, h, 0.04, 'wood_trim');
    mb.box(0, h, WZ + 0.02, w + 0.06, 0.025, 0.04, 'wood_trim');
    mb.box(0, 0, WZ + 0.005, w, h, 0.02, tex, { fit: true });
    mb.cylinderZ(w / 2 - 0.04, h * 0.48, WZ + 0.02, 0.009, 0.02, 5, 'metal_brass');
    mb.box(0, 0.005, WZ + 0.12, 0.32, 0.01, 0.16, 'carpet_rug', { color: 0x8a5a3a });
    mb.box(0, 0.002, WZ + 0.022, w - 0.02, 0.008, 0.008, 'white', { color: 0x9ad0ff, emissive: 1.2 });
  },
});

defObj({
  key: 'zw_black_door', name: 'Black Doorway', height: 2.7, block: 'none', onWall: true,
  sound: 'metal', hp: 99999,
  desc: 'Not a door painted black. A doorway that is black, flat and slightly too tall, and the light that falls on it does not come back.',
  tags: [...T, 'door', 'wall', 'portal_like', 'fixed'],
  model: (mb) => {
    mb.box(0, 0, WZ + 0.004, 0.86, 2.34, 0.01, 'zw_black', { ao: false });
  },
});

// ---------------------------------------------------------------- stairs into the ceiling
defObj({
  key: 'zw_stairs_ceiling', name: 'Stairs', w: 1, d: 3, height: 2.7, block: 'solid', tall: true, movable: 0,
  sound: 'wood', hp: 99999,
  desc: 'Nine carpeted steps up into the ceiling. The top step is worn smooth.',
  tags: [...T, 'stairs', 'fixed'],
  variant: (s) => String(s.mat ?? 'carpet'),
  model: (mb, s) => {
    const mat = String(s.mat ?? 'carpet');
    const tread = mat === 'concrete' ? 'concrete' : mat === 'wood' ? 'wood_floor' : 'carpet_yellow';
    const riser = mat === 'concrete' ? 'concrete' : mat === 'wood' ? 'wood_dark' : 'wall_yellow';
    const n = 9, rise = WALL_H / n, run = 2.9 / n, z0 = 1.45;
    for (let i = 0; i < n; i++) {
      const zc = z0 - (i + 0.5) * run;
      mb.box(0, 0, zc, 0.96, (i + 1) * rise, run, { top: tread, south: riser, sides: riser }, { skip: ['bottom'], uvOffset: [0, -i * rise] });
      mb.box(0, (i + 1) * rise - 0.02, zc + run / 2 - 0.01, 0.96, 0.025, 0.03, 'wood_trim', { color: 0x8a7a5a });
    }
    // handrails up both sides, running into the plaster
    for (const sx of [-1, 1]) {
      rod(mb, sx * 0.46, 0.9, z0 - 0.1, sx * 0.46, WALL_H - 0.02, z0 - 0.1 - (WALL_H - 0.92) * (run / rise), 0.022, 4, 'wood_dark');
      for (let i = 0; i < n; i += 2) mb.box(sx * 0.46, (i + 1) * rise, z0 - (i + 0.5) * run, 0.025, Math.min(0.9, WALL_H - (i + 1) * rise), 0.025, 'wood_dark');
    }
    // the dark gap where the flight goes through the ceiling
    mb.box(0, WALL_H - 0.03, z0 - 2.9 + run, 0.98, 0.03, run * 2, 'zw_black');
  },
});

// ---------------------------------------------------------------- the crack
defObj({
  key: 'zw_crack', name: 'Crack', height: 2.7, block: 'none', onWall: true,
  sound: 'ceramic', hp: 99999,
  desc: 'The corridor narrows to this: a split in the wall, a hand wide, floor to ceiling. Air comes out of it, warm, smelling of carpet.',
  tags: [...T, 'wall', 'fixed'],
  model: (mb) => {
    mb.box(0, 0, WZ + 0.004, 0.36, 2.66, 0.008, 'zw_crack_tex', { fit: true, ao: false });
    // chips of plaster on the floor under it
    for (let i = 0; i < 5; i++) mb.box(-0.15 + ph(i, 1, 8321) * 0.3, 0, WZ + 0.08 + ph(i, 2, 8322) * 0.2, 0.05, 0.02, 0.04, 'plastic_white', { color: 0xd8d0a8 });
  },
});

defObj({
  key: 'zw_slab', name: 'Wall', height: 2.7, block: 'solid', blocksSight: true, tall: true, movable: 0,
  sound: 'ceramic', hp: 600,
  desc: 'A wall that does not line up with the others. The wallpaper on it matches perfectly.',
  tags: [...T, 'wall', 'fixed'],
  variant: (s) => String(s.paper ?? 'wall_yellow') + '|' + String(s.len ?? 1.42),
  model: (mb, s) => {
    const p = String(s.paper ?? 'wall_yellow'), len = Number(s.len ?? 1.42);
    mb.box(0, 0, 0, len, WALL_H, 0.12, { south: p, north: p, east: p, west: p, top: 'wall_top' }, { uvOffset: [0, 0] });
  },
});

// ---------------------------------------------------------------- phones that ring
defObj({
  key: 'zw_phone', name: 'Telephone', height: 0.16, block: 'none', movable: 2,
  sound: 'plastic', hp: 40,
  disassemble: { tools: ['#screwdriver'], time: 6, skill: 'electrical', yields: [['electronics_scrap', 1, 2], ['wire', 1, 2]] },
  desc: 'A beige office telephone. It rings. When you pick up there is breathing, and then your own voice saying hello.',
  tags: [...T, 'phone', 'ring'],
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, col = [0xe8dcc0, 0x2a2a2e, 0xc04030][v];
    const y = Number(s.y0 ?? 0);
    mb.wedge(0, y, 0.02, 0.22, 0.24, 0.07, 0.04, { top: 'plastic_beige', all: 'plastic_beige' }, { color: col });
    mb.box(0, y + 0.055, 0.04, 0.09, 0.012, 0.09, 'zw_dial', { fit: true });
    // the receiver, off its cradle, lying beside it
    mb.push().translate(0.16, y, 0.06).rotateY(0.6);
    mb.box(0, 0, 0, 0.05, 0.04, 0.2, 'plastic_beige', { color: col });
    mb.box(0, 0, -0.1, 0.07, 0.05, 0.06, 'plastic_beige', { color: col }); mb.box(0, 0, 0.1, 0.07, 0.05, 0.06, 'plastic_beige', { color: col });
    mb.pop();
    for (let i = 0; i < 5; i++) mb.box(0.09 + i * 0.012, y + 0.01, 0.06 + Math.sin(i) * 0.02, 0.012, 0.012, 0.012, 'plastic_black', { color: scaleHex(col, 0.7) });
  },
});

// ---------------------------------------------------------------- buckets under a dripping ceiling
defObj({
  key: 'zw_drip_bucket', name: 'Bucket', height: 2.7, block: 'low', movable: 6,
  sound: 'plastic', hp: 40, water: { capacity: 8, tainted: true },
  desc: 'A bucket, nearly full, under a drip that never stops. The water smells faintly of almonds.',
  tags: [...T, 'drip', 'bucket'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4;
    const col = [0xc83a2a, 0xe0b830, 0x3a6ab0, 0x9aa0a4][v];
    if (v === 3) { // a saucepan
      mb.cylinder(0, 0, 0, 0.14, 0.13, 10, 'metal_brushed', { caps: false });
      mb.cylinder(0, 0, 0, 0.14, 0.01, 10, 'metal_brushed');
      mb.box(0.24, 0.1, 0, 0.2, 0.02, 0.03, 'plastic_black');
      mb.cylinder(0, 0.1, 0, 0.13, 0.01, 10, 'zw_water', { emissive: 0.15 });
    } else {
      mb.cylinder(0, 0, 0, 0.13, 0.3, 10, 'plastic_red', { rTop: 0.16, color: col, caps: false });
      mb.cylinder(0, 0, 0, 0.13, 0.01, 10, 'plastic_red', { color: scaleHex(col, 0.7) });
      mb.cylinder(0, 0.26, 0, 0.155, 0.01, 10, 'zw_water', { emissive: 0.15 });
      // wire handle
      mb.push().translate(0, 0.3, 0).rotateZ(0.3); mb.box(0, 0, 0, 0.32, 0.01, 0.01, 'metal_grey'); mb.pop();
    }
    // the drip, caught mid-fall, and the stain it comes from
    for (const [y, l] of [[2.2, 0.06], [1.6, 0.04], [0.9, 0.05]] as const) mb.box(0, y, 0, 0.012, l, 0.012, 'zw_water', { emissive: 0.4 });
  },
});

// ---------------------------------------------------------------- the televisions
defObj({
  key: 'zw_tv_stack', name: 'Stacked Televisions', w: 2, d: 1, height: 1.95, block: 'solid', blocksSight: false, movable: 0,
  sound: 'glass', hp: 300, power: true, hum: 'tv',
  light: { color: 0xd8c890, intensity: 0.55, radius: 3.6, y: 1.0, kind: 'screen', power: true, flicker: 0.12 },
  disassemble: { tools: ['#screwdriver'], time: 40, skill: 'electrical', yields: [['electronics_scrap', 4, 9], ['glass_shard', 3, 6], ['wire', 2, 4]] },
  desc: 'Every screen shows a corridor and somebody standing in it with their back to the camera. When you raise your arm, they raise theirs.',
  tags: [...T, 'tv', 'screens', 'electronics'],
  variant: (s) => (s.unpowered ? 'off' : 'on'),
  model: (mb, s) => {
    const lit = !s.unpowered;
    const tv = (x: number, y: number, z: number, w: number, h: number, k: number, yaw: number, wood: boolean) => {
      mb.push().translate(x, y, z).rotateY(yaw);
      mb.box(0, 0, 0, w, h, w * 0.8, wood ? 'wood_dark' : 'plastic_black', { color: wood ? 0xffffff : 0x8a8a90 });
      mb.box(-w * 0.08, h * 0.12, w * 0.4 + 0.004, w * 0.72, h * 0.74, 0.01, { south: lit ? 'zw_back_' + k : 'p_crt_off', all: 'glass_dark' }, { fit: { south: true }, emissive: lit ? 1.0 : 0 });
      mb.box(w * 0.38, h * 0.2, w * 0.4 + 0.004, w * 0.14, h * 0.6, 0.01, 'p_speaker_cloth');
      mb.pop();
    };
    tv(-0.5, 0, 0.0, 0.8, 0.62, 0, 0.1, true);
    tv(0.42, 0, 0.05, 0.72, 0.56, 1, -0.08, false);
    tv(-0.45, 0.62, 0.0, 0.62, 0.48, 2, -0.06, false);
    tv(0.35, 0.56, 0.02, 0.7, 0.54, 3, 0.12, true);
    tv(-0.2, 1.1, 0.03, 0.52, 0.42, 4, 0.05, false);
    tv(0.45, 1.1, 0.0, 0.42, 0.34, 5, -0.2, false);
    // cables tumbling down the back
    for (let i = 0; i < 6; i++) mb.box(-0.6 + i * 0.22, 0, -0.38, 0.02, 1.2 - i * 0.12, 0.02, 'plastic_black');
  },
});

// ---------------------------------------------------------------- the poster
defObj({
  key: 'zw_poster_same', name: 'Poster', height: 1.9, block: 'none', onWall: true,
  sound: 'paper', hp: 20, flammable: 1,
  desc: 'HAVE YOU SEEN THIS HALLWAY? A photograph of this corridor. There is somebody standing in it.',
  tags: [...T, 'poster', 'wall'],
  variant: (s) => String((s.v ?? 0) % 6),
  model: (mb, s) => {
    const k = (s.v ?? 0) % 6;
    mb.box(0, 0.82, WZ + 0.006, 0.8, 1.16, 0.006, 'zw_same_' + k, { fit: true });
  },
});

// ---------------------------------------------------------------- signs
defObj({
  key: 'zw_plate', name: 'Sign', height: 2.0, block: 'none', onWall: true,
  sound: 'plastic', hp: 300,
  desc: 'A small sign, very sure of itself.',
  tags: [...T, 'sign', 'wall'],
  variant: (s) => String(s.label ?? '?'),
  model: (mb, s) => {
    const L = String(s.label ?? '?');
    const w = Math.max(24, textW(ZW_PLATES.includes(L) ? L : '?') + 6) / 32;
    mb.box(0, 1.85, WZ + 0.01, w, 0.28, 0.02, { south: zwPlateTex(L), all: 'metal_dark' }, { fit: { south: true } });
  },
});
void mixHex; void textC; void T;
