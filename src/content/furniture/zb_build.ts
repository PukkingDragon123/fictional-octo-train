// Furniture — BUILD MODE pieces (src/build): the scaffold frames that get
// welded, and the finished welded objects: machines, defences, living pieces,
// planters and hydro racks. Built from salvage, so everything is mismatched
// plate, pipe and rust with fresh bright weld seams.
import { defObj } from '../../world/objects';
import { defWall } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { makeRamp, ph, bayer } from '../../gfx/pixel';
import { rod } from './b_common';
import { PIECES, piece } from '../../build/pieces';

const T = ['build', 'buildable'];
const SEAM = 0xffd890;

// ---------------------------------------------------------------- textures
addTextureModule(() => {
  const A = atlas();
  // a wall of mismatched plates: rust, primer grey, a green door panel, bright weld beads at the seams
  A.add('bw_scrap_plate', 32, 86, (pc, rng) => {
    const tones = [0x6e7276, 0x8a4a2a, 0x5a6a5a, 0x7a7a70, 0x4e5a64];
    let y0 = 0, i = 0;
    while (y0 < 86) {
      const h = rng.int(14, 24), split = rng.int(9, 23);
      for (let part = 0; part < 2; part++) {
        const R = makeRamp(tones[(i + part * 2) % tones.length], 5, { spread: 0.35 });
        const xa = part ? split : 0, xb = part ? 32 : split;
        for (let y = y0; y < Math.min(86, y0 + h); y++) for (let x = xa; x < xb; x++) {
          const n = ph(x >> 1, y >> 1, 77 + i * 3 + part);
          let c = n < 0.3 ? R[1] : n > 0.75 ? R[3] : R[2];
          if (ph(x, y, 91 + i) < 0.06) c = 0x7a3a1e;
          if (x === xa || y === y0) c = R[4];
          if (x === xb - 1 || y === y0 + h - 1) c = R[0];
          pc.set(x, y, c);
        }
        // rivets
        for (const [rx, ry] of [[xa + 2, y0 + 2], [xb - 3, y0 + 2], [xa + 2, y0 + h - 3], [xb - 3, y0 + h - 3]]) if (ry < 86) { pc.set(rx, ry, 0xc8ccd0); if (ry + 1 < 86) pc.set(rx, ry + 1, 0x2a2a2a); }
      }
      // weld beads along the seams
      for (let x = 0; x < 32; x++) if (y0 > 0 && (x + i) % 2 === 0) pc.set(x, y0, bayer(x, y0) > 0.5 ? 0xd8c890 : 0x9a8a60);
      for (let y = y0; y < Math.min(86, y0 + h); y++) if (y % 2 === 0) pc.set(split, y, 0xb8a878);
      y0 += h; i++;
    }
  }, 1, 2.7);
  A.add('bt_plate', 16, 16, (pc) => {
    const R = makeRamp(0x7a7e82, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, ph(x >> 1, y >> 1, 31) < 0.25 ? R[1] : ph(x, y, 33) < 0.05 ? 0x7a3e22 : R[2]));
    pc.strokeRect(0, 0, 16, 16, R[0]);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { pc.set(x, y, R[4]); pc.set(x + 1, y + 1, R[0]); }
  });
  A.add('bt_grate', 16, 16, (pc) => {
    pc.each((x, y) => pc.set(x, y, x % 4 === 0 || y % 4 === 0 ? (ph(x, y, 41) < 0.15 ? 0x7a3e22 : 0x8a8e92) : 0x1a1a1c));
  });
  A.add('bt_hazard', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, ((x + y) >> 1) % 2 ? 0x1a1a1a : 0xe8c020)); });
  A.add('bt_seam', 4, 4, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y) % 2 ? 0xf2e0a0 : 0xc8a860)); });
  A.add('bt_soil', 16, 16, (pc) => {
    pc.each((x, y) => { const n = ph(x, y, 51); pc.set(x, y, n < 0.04 ? 0x8a7a48 : n < 0.5 ? 0x3a2a1e : n < 0.8 ? 0x2a1e16 : 0x4a3a2a); });
  });
});

defWall({ key: 'bld_scrap_plate', name: 'Scrap-Plate Wall', tex: 'bw_scrap_plate', top: 'metal_dark', hp: 900, sound: 'metal', noWallpaper: true });

// ---------------------------------------------------------------- helpers
const M = 'metal_rusty', ST = 'metal_grey', DK = 'metal_dark';
const P = (mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.025, t = M) => rod(mb, x0, y0, z0, x1, y1, z1, r, 5, t);
/** a bright weld bead at a joint */
const bead = (mb: ModelBuilder, x: number, y: number, z: number, r = 0.03) => mb.sphere(x, y, z, r, 5, 3, 'bt_seam', { color: SEAM, emissive: 0.25 });
/** four pipe legs + a top frame */
function legs(mb: ModelBuilder, w: number, d: number, h: number, r = 0.025, t = M) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P(mb, sx * w / 2, 0, sz * d / 2, sx * w / 2, h, sz * d / 2, r, t); bead(mb, sx * w / 2, h, sz * d / 2, r * 1.3); }
}

// ---------------------------------------------------------------- scaffold frames (state.piece, state.w weld 0..1, state.side for walls)
function frameModel(mb: ModelBuilder, s: Record<string, any>) {
  const pc = piece(s.piece as string);
  const odd = (s.prot ?? 0) % 2 === 1;
  const w = Math.max(0.6, ((odd ? pc?.d : pc?.w) ?? 1) - 0.1), d = Math.max(0.6, ((odd ? pc?.w : pc?.d) ?? 1) - 0.1), h = Math.max(0.12, pc?.h ?? 1);
  const stage = Math.min(4, Math.floor((s.w ?? 0) * 4));
  if (pc?.kind === 'wall' || pc?.kind === 'door') {
    // a vertical frame along the edge: north (side 0) or west (side 1)
    mb.push();
    if (s.side === 1) mb.translate(-0.5, 0, 0).rotateY(Math.PI / 2); else mb.translate(0, 0, -0.5);
    P(mb, -0.48, 0, 0, -0.48, h, 0); P(mb, 0.48, 0, 0, 0.48, h, 0); P(mb, -0.48, h, 0, 0.48, h, 0);
    P(mb, -0.48, 0.05, 0, 0.48, 0.05, 0); P(mb, -0.48, 0.05, 0, 0.48, h, 0, 0.018);
    for (let k = 0; k < stage; k++) mb.box(0, h * (k / 4), 0, 0.94, h / 4 - 0.02, 0.03, pc.wall === 'wood_built' ? 'plank' : 'bt_plate', { uvScale: 2 });
    mb.pop();
    return;
  }
  // a box skeleton the size of the finished piece, plates bolted on as the weld progresses
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(mb, sx * w / 2, 0, sz * d / 2, sx * w / 2, h, sz * d / 2, 0.02);
  for (const y of [0.03, h]) { P(mb, -w / 2, y, -d / 2, w / 2, y, -d / 2, 0.018); P(mb, -w / 2, y, d / 2, w / 2, y, d / 2, 0.018); P(mb, -w / 2, y, -d / 2, -w / 2, y, d / 2, 0.018); P(mb, w / 2, y, -d / 2, w / 2, y, d / 2, 0.018); }
  P(mb, -w / 2, 0.03, -d / 2, w / 2, h, d / 2, 0.014);
  if (stage >= 1) mb.box(0, 0, 0, w * 0.96, 0.04, d * 0.96, 'bt_plate', { uvScale: 2 });
  if (stage >= 2) mb.box(0, h * 0.3, -d / 2, w * 0.9, h * 0.4, 0.02, 'bt_plate', { uvScale: 2 });
  if (stage >= 3) mb.box(-w / 2, h * 0.3, 0, 0.02, h * 0.4, d * 0.9, 'bt_plate', { uvScale: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (stage >= 1) bead(mb, sx * w / 2, h, sz * d / 2, 0.022);
  // hazard tape tag
  mb.box(w / 2 - 0.05, h * 0.6, d / 2 + 0.005, 0.12, 0.04, 0.005, 'bt_hazard', { fit: true });
}
const frameDef = (key: string, w: number, d: number) => defObj({
  key, name: 'Weld Frame', w, d, height: 1.2, block: 'low', sound: 'metal', flammable: 0, hp: 60,
  tags: ['build', 'bld_frame'], desc: 'A tacked-together frame waiting for the welder.',
  variant: (s) => `${s.piece}:${Math.min(4, Math.floor((s.w ?? 0) * 4))}:${s.side ?? 0}:${(s.prot ?? 0) % 2}`,
  model: (mb, s) => frameModel(mb, s),
});
frameDef('bld_frame', 1, 1);
frameDef('bld_frame_2x1', 2, 1);
frameDef('bld_frame_1x2', 1, 2);
defObj({
  key: 'bld_frame_wall', name: 'Wall Frame', w: 1, d: 1, height: 2.6, block: 'none', sound: 'metal', flammable: 0, hp: 60,
  tags: ['build', 'bld_frame'], desc: 'A wall frame tacked to the floor, waiting for plates.',
  variant: (s) => `${s.piece}:${Math.min(4, Math.floor((s.w ?? 0) * 4))}:${s.side ?? 0}`,
  model: (mb, s) => frameModel(mb, s),
});

// ---------------------------------------------------------------- structure
defObj({
  key: 'bld_deck', name: 'Deck Grating', height: 0.06, block: 'none', sound: 'metal', flammable: 0, hp: 300, tags: [...T],
  desc: 'Welded grating. The carpet underneath can no longer touch you.',
  model: (mb) => { mb.box(0, 0, 0, 0.98, 0.05, 0.98, { all: DK, top: 'bt_grate' }, { uvScale: 1 }); for (const x of [-0.49, 0.49]) bead(mb, x, 0.05, 0, 0.02); },
});
defObj({
  key: 'bld_steps', name: 'Welded Platform', height: 0.5, block: 'low', sound: 'metal', flammable: 0, hp: 500, tags: [...T],
  desc: 'A raised steel deck with two steps welded to the front.',
  model: (mb) => {
    legs(mb, 0.9, 0.6, 0.45, 0.025);
    mb.box(0, 0.45, -0.15, 0.96, 0.05, 0.66, { all: DK, top: 'bt_grate' });
    mb.box(0, 0.0, 0.32, 0.9, 0.15, 0.2, { all: M, top: 'bt_grate' });
    mb.box(0, 0.15, 0.24, 0.9, 0.15, 0.16, { all: M, top: 'bt_grate' });
    P(mb, -0.47, 0.5, -0.47, -0.47, 1.05, -0.47, 0.02, ST); P(mb, 0.47, 0.5, -0.47, 0.47, 1.05, -0.47, 0.02, ST); P(mb, -0.47, 1.05, -0.47, 0.47, 1.05, -0.47, 0.02, ST);
  },
});

// ---------------------------------------------------------------- machines
defObj({
  key: 'bld_mech_bench', name: 'Powered Workbench', w: 2, d: 1, height: 1.6, block: 'table', surface: 0.92, sound: 'metal', flammable: 0, hp: 600,
  tags: [...T, 'workbench', 'station'], desc: 'A steel bench welded from bed frames: motorised vise, grinder, drill press, a lamp that buzzes.',
  light: { color: 0xfff0c8, intensity: 0.5, radius: 3, y: 1.5, kind: 'lamp', power: false },
  model: (mb) => {
    legs(mb, 1.86, 0.8, 0.88, 0.03);
    mb.box(0, 0.88, 0, 1.96, 0.06, 0.92, { all: DK, top: 'bt_plate' }, { uvScale: 2 });
    mb.box(0, 0.25, 0, 1.8, 0.03, 0.76, 'bt_grate');
    // motorised vise
    mb.box(-0.6, 0.94, 0.2, 0.26, 0.12, 0.16, 'metal_painted_green');
    mb.box(-0.6, 1.06, 0.2, 0.3, 0.04, 0.04, ST); mb.cylinderX(-0.42, 1.0, 0.28, 0.012, 0.2, 6, 'chrome');
    // grinder with a guard
    mb.box(0.1, 0.94, 0.15, 0.22, 0.12, 0.12, 'plastic_blue');
    for (const x of [-0.04, 0.24]) mb.cylinderX(x, 1.0, 0.15, 0.07, 0.03, 10, 'stone_rough');
    // drill press column
    P(mb, 0.72, 0.94, -0.3, 0.72, 1.55, -0.3, 0.03, 'chrome');
    mb.box(0.72, 1.4, -0.22, 0.16, 0.16, 0.24, 'metal_painted_green'); mb.cylinder(0.72, 1.24, -0.12, 0.012, 0.16, 6, 'chrome');
    // salvaged motor bolted under the top, cables
    mb.cylinder(0.3, 0.45, 0, 0.12, 0.3, 10, 'plastic_blue'); bead(mb, 0.3, 0.75, 0, 0.03);
    rod(mb, 0.3, 0.6, 0.12, -0.6, 0.94, 0.2, 0.012, 4, 'rubber_black');
    // lamp on a gooseneck
    P(mb, -0.9, 0.94, -0.35, -0.9, 1.45, -0.2, 0.015, ST);
    mb.box(-0.9, 1.42, -0.12, 0.14, 0.06, 0.1, 'metal_painted_green'); mb.box(-0.9, 1.415, -0.12, 0.1, 0.01, 0.07, 'plastic_white', { emissive: 1.2, color: 0xfff0c8 });
    // weld seams
    for (const x of [-0.93, 0.93]) bead(mb, x, 0.88, 0, 0.03);
  },
});
defObj({
  key: 'bld_compactor', name: 'Scrap Compactor', height: 1.9, block: 'solid', sound: 'metal', flammable: 0, hp: 800,
  tags: [...T, 'compactor', 'station'], desc: 'Four columns, a platen, a hydraulic ram from a car lift. Feed it scrap, pull the lever.',
  variant: (s) => (s.down ? 'd' : 'u'),
  model: (mb, s) => {
    mb.box(0, 0, 0, 0.9, 0.2, 0.9, { all: DK, top: 'bt_plate' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P(mb, sx * 0.38, 0.2, sz * 0.38, sx * 0.38, 1.85, sz * 0.38, 0.035, ST); bead(mb, sx * 0.38, 0.2, sz * 0.38, 0.04); }
    mb.box(0, 1.75, 0, 0.9, 0.14, 0.9, M);
    const py = s.down ? 0.32 : 1.05;
    mb.cylinder(0, py + 0.12, 0, 0.07, 1.63 - py, 8, 'chrome');
    mb.box(0, py, 0, 0.72, 0.12, 0.72, { all: 'metal_painted_green', bottom: 'bt_plate' });
    mb.box(0, py + 0.12, 0.37, 0.4, 0.04, 0.005, 'bt_hazard', { fit: true });
    // lever
    P(mb, 0.46, 0.9, 0.2, 0.62, s.down ? 0.75 : 1.2, 0.2, 0.02, ST); mb.sphere(0.62, s.down ? 0.75 : 1.2, 0.2, 0.04, 6, 4, 'plastic_red');
    mb.cylinder(-0.3, 0.2, 0.3, 0.12, 0.3, 10, 'plastic_blue');
  },
});
defObj({
  key: 'bld_gen_rig', name: 'Generator Rig', height: 1.2, block: 'solid', sound: 'metal', flammable: 0.1, hp: 500, movable: 0,
  tags: [...T, 'generator', 'station'], desc: 'Two salvaged motors run backwards off a fuel drum. Powers everything within fourteen metres.',
  model: (mb) => {
    mb.cylinder(-0.18, 0, 0, 0.26, 0.8, 12, { sides: 'metal_painted_green', top: DK, bottom: DK });
    mb.box(-0.18, 0.5, 0.265, 0.3, 0.06, 0.005, 'bt_hazard', { fit: true });
    for (const z of [-0.2, 0.2]) { mb.cylinderX(0.25, 0.55, z, 0.12, 0.34, 10, 'plastic_blue'); bead(mb, 0.08, 0.55, z, 0.035); }
    mb.box(0.25, 0, 0, 0.42, 0.42, 0.7, DK);
    P(mb, 0.35, 0.67, 0, 0.35, 1.2, -0.25, 0.04, M); mb.cylinder(0.35, 1.15, -0.28, 0.06, 0.06, 8, DK);
    rod(mb, 0.3, 0.42, 0.3, 0.45, 0.02, 0.45, 0.015, 4, 'rubber_black');
  },
});

// ---------------------------------------------------------------- defence
defObj({
  key: 'bld_turret', name: 'Pipe Sentry', height: 1.4, block: 'low', sound: 'metal', flammable: 0, hp: 400,
  tags: [...T, 'turret', 'station'], desc: 'A nail-cannon barrel cluster on a motor swivel. It knows who its friends are. Mostly.',
  variant: (s) => String((s.yq ?? 0) & 7),
  model: (mb, s) => {
    for (let i = 0; i < 3; i++) { const a = i * 2.094; P(mb, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0, 0.8, 0, 0.025, M); }
    mb.cylinder(0, 0.8, 0, 0.12, 0.16, 10, 'plastic_blue'); bead(mb, 0, 0.8, 0, 0.05);
    mb.push().translate(0, 1.0, 0).rotateY(-((s.yq ?? 0) & 7) * Math.PI / 4);
    mb.box(0, -0.04, 0, 0.3, 0.2, 0.34, { all: 'metal_painted_green', north: 'bt_hazard' });
    for (const [dx, dy] of [[-0.05, 0.03], [0.05, 0.03], [0, -0.04]]) mb.cylinderZ(dx, dy + 0.06, 0.38, 0.03, 0.46, 6, ST);
    mb.box(0.1, 0.16, 0, 0.06, 0.05, 0.06, 'led_red', { emissive: 1.5 });
    mb.pop();
  },
});
defObj({
  key: 'bld_spikes', name: 'Rebar Spikes', height: 0.4, block: 'none', sound: 'metal', flammable: 0, hp: 300,
  tags: [...T, 'spikes'], desc: 'Rebar ground to points and welded to a plate. Do not walk here.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.9, 0.03, 0.9, 'bt_plate');
    for (let i = 0; i < 9; i++) { const x = ((i % 3) - 1) * 0.28 + (ph(i, 1, 3) - 0.5) * 0.06, z = (Math.floor(i / 3) - 1) * 0.28; rod(mb, x, 0.03, z, x + 0.03, 0.38, z - 0.02, 0.016, 4, M, { color: i % 2 ? 0xffffff : 0xd8b0a0 }); bead(mb, x, 0.03, z, 0.02); }
  },
});

// ---------------------------------------------------------------- living
defObj({
  key: 'bld_beacon', name: 'Claim Beacon', height: 2.2, block: 'low', sound: 'metal', flammable: 0, hp: 500,
  tags: [...T, 'beacon'], desc: 'A scrap mast with a dish and a red lamp. Everything within twelve metres is yours.',
  light: { color: 0xff3a2a, intensity: 0.8, radius: 4, y: 2.1, kind: 'emergency', flicker: 0.4, power: false },
  model: (mb) => {
    mb.box(0, 0, 0, 0.6, 0.12, 0.6, { all: DK, top: 'bt_plate' });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; P(mb, Math.cos(a) * 0.26, 0.12, Math.sin(a) * 0.26, 0, 1.9, 0, 0.018, M); }
    P(mb, 0, 0.12, 0, 0, 2.05, 0, 0.03, ST);
    mb.push().translate(0, 1.55, 0.08).rotateX(-0.6); mb.cylinder(0, 0, 0, 0.22, 0.03, 10, 'metal_grey', { rTop: 0.25 }); mb.pop();
    mb.sphere(0, 2.1, 0, 0.07, 8, 5, 'led_red', { emissive: 2 });
    mb.box(0, 0.5, 0.17, 0.2, 0.25, 0.04, 'screen_on', { emissive: 0.8, color: 0x8aff8a });
  },
});
defObj({
  key: 'bld_locker', name: 'Welded Locker', height: 1.8, block: 'solid', sound: 'metal', flammable: 0, hp: 600, movable: 0,
  container: { capacity: 40, kind: 'locker', name: 'Locker' }, tags: [...T, 'station'], desc: 'Sheet steel folded and seam-welded into a box with a door. Yours.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.8, 1.8, 0.6, { all: 'metal_painted_green', south: 'bt_plate' }, { uvScale: 2 });
    for (let i = 0; i < 4; i++) mb.box(-0.15, 1.4 + i * 0.05, 0.302, 0.3, 0.015, 0.005, DK);
    mb.box(0.28, 0.9, 0.31, 0.04, 0.16, 0.03, 'chrome');
    for (const y of [0.01, 1.79]) for (const x of [-0.4, 0.4]) bead(mb, x, y, 0.3, 0.025);
  },
});
defObj({
  key: 'bld_cot', name: 'Steel Cot', d: 2, height: 0.6, block: 'solid', sleep: 0.62, sit: true, sound: 'metal', flammable: 0.3, hp: 300,
  tags: [...T], desc: 'A pipe frame with a sheet stretched tight. Off the floor, off the carpet, nearly a bed.',
  model: (mb) => {
    legs(mb, 0.8, 1.8, 0.42, 0.022);
    for (const x of [-0.4, 0.4]) P(mb, x, 0.42, -0.9, x, 0.42, 0.9, 0.026);
    mb.box(0, 0.4, 0, 0.78, 0.05, 1.78, 'mattress', { color: 0xe8e2d0 });
    mb.box(0, 0.45, -0.72, 0.6, 0.1, 0.3, 'pillow');
  },
});
defObj({
  key: 'bld_strip_light', name: 'Strip Light Stand', height: 2.0, block: 'low', sound: 'metal', flammable: 0, hp: 150,
  tags: [...T, 'growlight'], desc: 'A fluorescent tube on a welded pole. It hums the same note as the Lobby.',
  light: { color: 0xe8fff0, intensity: 1.15, radius: 6, y: 1.9, kind: 'fluoro', flicker: 0.05, power: false },
  model: (mb) => {
    mb.box(0, 0, 0, 0.4, 0.05, 0.4, 'bt_plate');
    P(mb, 0, 0.05, 0, 0, 1.9, 0, 0.022, ST); bead(mb, 0, 0.05, 0, 0.03);
    mb.box(0, 1.88, 0, 1.0, 0.06, 0.1, 'metal_painted_green');
    mb.box(0, 1.86, 0, 0.92, 0.025, 0.05, 'plastic_white', { emissive: 1.6, color: 0xf2fff4 });
    rod(mb, 0, 1.9, 0, 0.2, 0.03, 0.15, 0.008, 4, 'rubber_black');
  },
});
defObj({
  key: 'bld_stove', name: 'Drum Stove', height: 1.0, block: 'solid', heat: 'fire', sound: 'metal', flammable: 0, hp: 500,
  tags: [...T, 'stove', 'station'], desc: 'An oil drum cut open for a firebox, a grate welded on top, a flue out the back. Cook here (E).',
  variant: (s) => (s.lit ? 'l' : 'o'),
  model: (mb, s) => {
    mb.cylinder(0, 0, 0, 0.3, 0.82, 12, { sides: 'metal_rusty', top: DK, bottom: DK });
    mb.box(0, 0.12, 0.27, 0.3, 0.2, 0.06, s.lit ? 'q_embers' : DK, { emissive: s.lit ? 1.4 : 0, fit: true });
    mb.box(0, 0.82, 0, 0.62, 0.03, 0.62, 'bt_grate');
    P(mb, 0, 0.6, -0.3, 0, 1.0, -0.45, 0.05, DK); P(mb, 0, 1.0, -0.45, 0, 1.6, -0.45, 0.05, DK);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; P(mb, Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28, Math.cos(a) * 0.34, -0.0, Math.sin(a) * 0.34, 0.02); }
  },
});
defObj({
  key: 'bld_table', name: 'Steel Table', height: 0.85, block: 'table', surface: 0.82, sound: 'metal', flammable: 0, hp: 300,
  tags: [...T], desc: 'A sheet of steel on four pipe legs, weld beads at every joint.',
  model: (mb) => { legs(mb, 0.84, 0.84, 0.78, 0.024); mb.box(0, 0.78, 0, 0.96, 0.04, 0.96, { all: DK, top: 'bt_plate' }); },
});

// ---------------------------------------------------------------- farm: state.crop, state.cc (crop colour), state.stage 0..5, state.dead
function crops(mb: ModelBuilder, s: Record<string, any>, y: number, w: number, n: number) {
  if (!s.crop) return;
  const st = Math.floor(s.stage ?? 0), dead = !!s.dead || st >= 5;
  const leaf = dead ? 0x8a6a3a : st >= 4 ? 0x4a8a2a : 0x6ab04a;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    if (st <= 0) { mb.box(x, y, 0, 0.03, 0.02, 0.03, 'grass', { color: 0x8ac060 }); continue; }
    const h = 0.08 + Math.min(4, st) * 0.09;
    mb.cross(x, y, 0, 0.18 + st * 0.05, h, 'grass', { color: leaf, rot: i * 0.7, sway: 0.6 });
    if (st >= 4 && !dead) mb.sphere(x + 0.03, y + h * 0.55, 0.03, 0.04, 5, 4, 'plastic_white', { color: s.cc ?? 0xd83a2a });
  }
}
defObj({
  key: 'bld_planter', name: 'Welded Planter', height: 0.55, block: 'low', sound: 'metal', flammable: 0, hp: 300,
  tags: [...T, 'farm', 'bplanter', 'station'], desc: 'A steel trough of dark soil cut with carpet fibre. Sow, water, wait under the lights.',
  variant: (s) => `${s.crop ?? ''}:${Math.floor(s.stage ?? 0)}:${s.dead ? 1 : 0}:${(s.water ?? 0) > 20 ? 1 : 0}`,
  model: (mb, s) => {
    legs(mb, 0.84, 0.6, 0.18, 0.02);
    mb.box(0, 0.18, 0, 0.92, 0.3, 0.66, { all: 'bt_plate', top: (s.water ?? 0) > 20 ? 'bt_soil' : 'q_soil_bed' }, { color: 0xffffff });
    for (const x of [-0.46, 0.46]) bead(mb, x, 0.48, 0, 0.025);
    crops(mb, s, 0.48, 0.8, 3);
  },
});
defObj({
  key: 'bld_hydro', name: 'Hydro Rack', height: 1.8, block: 'solid', sound: 'metal', flammable: 0, hp: 350,
  tags: [...T, 'farm', 'bplanter', 'hydro', 'station'], desc: 'Two trays, a dripping pipe loop and a row of warm grow bulbs. Grows fast, drinks little.',
  light: { color: 0xffb878, intensity: 0.45, radius: 2.5, y: 1.0, kind: 'bulb', power: false },
  variant: (s) => `${s.crop ?? ''}:${Math.floor(s.stage ?? 0)}:${s.dead ? 1 : 0}`,
  model: (mb, s) => {
    legs(mb, 0.86, 0.56, 1.75, 0.022, ST);
    for (const y of [0.25, 0.95]) {
      mb.box(0, y, 0, 0.9, 0.12, 0.6, { all: 'plastic_white', top: 'bt_soil' }, { color: 0xd8e8e8 });
      crops(mb, s, y + 0.12, 0.8, 3);
      mb.box(0, y + 0.64, 0, 0.84, 0.03, 0.08, 'metal_painted_green'); for (const bx of [-0.28, 0, 0.28]) mb.sphere(bx, y + 0.62, 0, 0.035, 6, 4, 'plastic_white', { emissive: 1.4, color: 0xffc890 });
    }
    P(mb, -0.45, 0.4, -0.3, -0.45, 1.6, -0.3, 0.02, 'chrome'); P(mb, -0.45, 1.6, -0.3, 0.45, 1.6, -0.3, 0.02, 'chrome');
    mb.cylinder(0.3, 0, -0.18, 0.12, 0.25, 8, 'plastic_blue');
  },
});
defObj({
  key: 'bld_rain', name: 'Rain Funnel', height: 1.6, block: 'solid', sound: 'metal', flammable: 0, hp: 300,
  water: { capacity: 40 }, tags: [...T, 'rain'], desc: 'A sheet-metal funnel welded over a drum. Water from the sky, or whatever drips here.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.28, 0.8, 12, { sides: 'metal_painted_green', top: 'water', bottom: DK });
    mb.cylinder(0, 0.8, 0, 0.1, 0.6, 12, 'metal_grey', { rTop: 0.48 });
    mb.cylinder(0.24, 0.2, 0.18, 0.02, 0.06, 6, 'metal_brass');
  },
});

void PIECES;
