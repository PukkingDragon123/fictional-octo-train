// Low-poly models for cyberware, shared by the survivor rig (humanRig.ts hangs
// them on the bones so they swing, bend and curl with the animation), the
// boxed parts as items (src/content/items/cyber.ts) and the operating table
// (src/ui/surgery). One builder per style and bone role; every piece is built
// in its bone's local space (limbs hang along -y from the joint, the thumb
// side is +z, side k = +1 left / -1 right). Textures are the 'i_cy_*' item
// textures registered by the cyber content file.
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import type { BoneName, Dims } from './humanModel';
import { CyberSlot, CyberStyle, SLOT_KIND, cyberDef, CYBER_SLOTS } from '../survival/cyberParts';

export const CT = {
  rust: 'i_cy_rust', paint: 'i_cy_paint', hazard: 'i_cy_hazard', pipe: 'i_cy_pipe', chrome: 'i_cy_chrome', shell: 'i_cy_shell',
  black: 'i_cy_black', hose: 'i_cy_hose', glow: 'i_cy_glow', teeth: 'i_cy_teeth', lens: 'i_cy_lens', wires: 'i_cy_wires', steel: 'i_cy_steel',
};
type MB = ModelBuilder;
export type Role = 'uarm' | 'farm' | 'hand' | 'f1' | 'f2' | 'th' | 'thigh' | 'shin' | 'foot' | 'head' | 'chest' | 'spine' | 'hips';

const all = (t: string) => ({ sides: t, top: t, bottom: t });
/** a rod hanging from y0 down to y1 (y1 < y0) */
function rod(mb: MB, x: number, y0: number, y1: number, z: number, r: number, t: string, o: { color?: number; emissive?: number; rTop?: number; segs?: number } = {}) {
  mb.cylinder(x, y1, z, r, y0 - y1, o.segs ?? 6, all(t), { fit: true, color: o.color, emissive: o.emissive, rTop: o.rTop });
}
const box = (mb: MB, x: number, y: number, z: number, w: number, h: number, d: number, t: string, o: { color?: number; emissive?: number } = {}) =>
  mb.box(x, y, z, w, h, d, t, { fit: true, color: o.color, emissive: o.emissive });
function bolt(mb: MB, x: number, y: number, z: number, axis: 'x' | 'z' = 'x', r = 0.008) {
  if (axis === 'x') mb.cylinderX(x, y, z, r, 0.012, 6, all(CT.chrome), { fit: true });
  else mb.cylinderZ(x, y, z, r, 0.012, 6, all(CT.chrome), { fit: true });
}
function glowStrip(mb: MB, x: number, y: number, z: number, w: number, h: number, d: number, col: number) {
  box(mb, x, y, z, w, h, d, CT.glow, { color: col, emissive: 1.4 });
}
/** a hinge across the joint (axis x) */
function hinge(mb: MB, r: number, len: number, t = CT.steel) { mb.cylinderX(0, 0, 0, r, len, 8, all(t), { fit: true }); }

// ------------------------------------------------------------------ arms
function armScrap(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'uarm':
      // a dented hubcap for a shoulder, rusty plate, two pipes and a jack piston down to the elbow
      mb.push().translate(k * 0.03, -0.02, 0).rotateZ(k * Math.PI / 2);
      mb.cylinder(0, -0.02, 0, 0.068, 0.04, 9, { sides: CT.rust, top: CT.paint, bottom: CT.rust }, { fit: true, rTop: 0.05 });
      mb.pop();
      box(mb, 0, -0.1, 0.0, 0.07, 0.09, 0.075, CT.paint);
      rod(mb, 0.014, -0.06, -0.27, 0.018, 0.014, CT.pipe);
      rod(mb, -0.016, -0.06, -0.27, -0.012, 0.014, CT.pipe, { color: 0xc8b8a0 });
      rod(mb, 0.0, -0.13, -0.25, -0.03, 0.02, CT.black);
      rod(mb, 0.0, -0.2, -0.29, -0.03, 0.009, CT.chrome);
      rod(mb, -0.03, -0.04, -0.26, 0.03, 0.007, CT.hose, { segs: 5 });
      for (const y of [-0.12, -0.22]) mb.cylinder(0, y, 0.003, 0.034, 0.012, 7, all(CT.steel), { fit: true });
      bolt(mb, k * 0.036, -0.08, 0.02); bolt(mb, k * 0.036, -0.13, -0.02);
      break;
    case 'farm':
      hinge(mb, 0.03, 0.075, CT.rust);
      bolt(mb, k * 0.04, 0, 0);
      box(mb, 0, -0.23, 0, 0.052, 0.21, 0.056, CT.rust);
      box(mb, k * 0.0285, -0.19, 0, 0.004, 0.11, 0.046, CT.hazard);
      rod(mb, 0, -0.04, -0.21, 0.034, 0.008, CT.wires, { segs: 5 });
      box(mb, -k * 0.027, -0.12, 0.012, 0.006, 0.03, 0.014, CT.glow, { color: glow, emissive: 1.6 });
      for (const y of [-0.08, -0.16]) box(mb, 0, y, 0, 0.06, 0.014, 0.064, CT.hose);
      mb.cylinder(0, -0.255, 0, 0.032, 0.03, 7, all(CT.steel), { fit: true });
      break;
    case 'hand':
      // the vice body
      box(mb, 0, -0.075, 0, 0.044, 0.075, 0.06, CT.paint);
      mb.cylinderZ(0, -0.04, 0.0, 0.012, 0.09, 6, all(CT.chrome), { fit: true });
      box(mb, 0, -0.085, -0.036, 0.03, 0.02, 0.016, CT.rust);
      break;
    case 'f1': box(mb, 0, -0.045, -0.006, 0.04, 0.05, 0.045, CT.steel); break;
    case 'f2': box(mb, 0, -0.035, -0.006, 0.036, 0.035, 0.04, CT.rust); box(mb, 0, -0.037, 0.016, 0.034, 0.004, 0.003, CT.teeth); break;
    case 'th': box(mb, 0, -0.045, 0.004, 0.034, 0.05, 0.018, CT.steel); box(mb, 0, -0.05, -0.006, 0.032, 0.04, 0.004, CT.teeth); break;
  }
}
function armServo(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'uarm':
      mb.push().translate(k * 0.02, -0.03, 0);
      mb.sphere(0, 0, 0, 0.06, 8, 6, CT.shell);
      mb.pop();
      rod(mb, 0, -0.06, -0.26, 0, 0.042, CT.shell, { rTop: 0.05, segs: 8 });
      glowStrip(mb, k * 0.046, -0.24, 0.0, 0.004, 0.15, 0.01, glow);
      rod(mb, 0, -0.25, -0.285, 0, 0.034, CT.black, { segs: 8 });
      break;
    case 'farm':
      hinge(mb, 0.032, 0.07, CT.black);
      rod(mb, 0, -0.02, -0.235, 0, 0.032, CT.shell, { rTop: 0.042, segs: 8 });
      glowStrip(mb, 0, -0.2, 0.038, 0.012, 0.14, 0.004, glow);
      box(mb, -k * 0.03, -0.16, 0, 0.012, 0.06, 0.03, CT.black);
      rod(mb, 0, -0.235, -0.255, 0, 0.026, CT.black, { segs: 8 });
      break;
    case 'hand': box(mb, 0, -0.088, 0, 0.026, 0.08, 0.068, CT.shell); box(mb, k * 0.014, -0.06, 0, 0.003, 0.03, 0.04, CT.glow, { color: glow, emissive: 1.4 }); break;
    case 'f1': for (let i = 0; i < 4; i++) box(mb, 0, -0.042, 0.024 - i * 0.016, 0.018, 0.042, 0.012, i % 2 ? CT.black : CT.shell); break;
    case 'f2': for (let i = 0; i < 4; i++) box(mb, 0, -0.03, 0.024 - i * 0.016, 0.016, 0.03, 0.011, CT.shell); break;
    case 'th': box(mb, 0, -0.045, 0, 0.018, 0.045, 0.016, CT.shell); break;
  }
}
function armPiston(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'uarm':
      box(mb, k * 0.01, -0.12, 0, 0.1, 0.13, 0.1, CT.steel);
      box(mb, k * 0.058, -0.11, 0, 0.008, 0.08, 0.07, CT.hazard);
      rod(mb, 0, -0.12, -0.27, 0, 0.034, CT.black, { segs: 7 });
      rod(mb, 0.0, -0.06, -0.12, 0.0, 0.05, CT.steel, { segs: 7 });
      break;
    case 'farm':
      hinge(mb, 0.042, 0.1, CT.steel);
      box(mb, 0, -0.2, 0, 0.07, 0.17, 0.07, CT.black);
      for (const z of [0.045, -0.045]) { rod(mb, 0, -0.01, -0.12, z, 0.016, CT.black); rod(mb, 0, -0.1, -0.24, z, 0.008, CT.chrome); }
      glowStrip(mb, k * 0.036, -0.17, 0, 0.004, 0.08, 0.02, glow);
      break;
    case 'hand': box(mb, 0, -0.11, 0, 0.075, 0.11, 0.095, CT.steel); box(mb, 0, -0.112, 0.049, 0.06, 0.07, 0.004, CT.hazard); break;
    case 'f1': box(mb, 0, -0.025, -0.004, 0.072, 0.03, 0.09, CT.black); break;
    case 'f2': break;
    case 'th': box(mb, 0, -0.03, 0, 0.03, 0.035, 0.03, CT.steel); break;
  }
}
// ------------------------------------------------------------------ hands only (hand slot)
function handVise(mb: MB, role: Role, k: number, glow: number) {
  if (role === 'farm') { mb.cylinder(0, -0.262, 0, 0.036, 0.03, 8, all(CT.steel), { fit: true }); box(mb, -k * 0.03, -0.245, 0, 0.008, 0.012, 0.012, CT.glow, { color: glow, emissive: 1.6 }); return; }
  if (role === 'hand') { box(mb, 0, -0.08, 0, 0.046, 0.08, 0.064, CT.paint, { color: 0xffe080 }); mb.cylinderZ(0, -0.04, 0, 0.012, 0.09, 6, all(CT.chrome), { fit: true }); return; }
  armScrap(mb, role, k, glow);
}
function handTool(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'farm': mb.cylinder(0, -0.262, 0, 0.034, 0.03, 8, all(CT.black), { fit: true }); break;
    case 'hand': box(mb, 0, -0.085, 0, 0.03, 0.08, 0.066, CT.black); glowStrip(mb, k * 0.016, -0.07, 0, 0.003, 0.03, 0.05, glow); break;
    case 'f1':
      rod(mb, 0, 0, -0.06, 0.022, 0.006, CT.chrome); rod(mb, 0, 0, -0.05, 0.006, 0.005, CT.steel);
      box(mb, 0, -0.07, -0.012, 0.004, 0.07, 0.014, CT.chrome); rod(mb, 0, 0, -0.045, -0.027, 0.006, CT.chrome);
      break;
    case 'f2': box(mb, 0, -0.02, 0.022, 0.006, 0.02, 0.006, CT.glow, { color: glow, emissive: 1.5 }); break;
    case 'th': rod(mb, 0, 0, -0.05, 0, 0.007, CT.chrome); break;
  }
}
// ------------------------------------------------------------------ legs
function legScrap(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'thigh':
      box(mb, k * 0.01, -0.09, 0, 0.1, 0.08, 0.1, CT.paint);
      rod(mb, 0, -0.06, -0.41, 0, 0.026, CT.pipe, { segs: 7 });
      rod(mb, 0.02, -0.1, -0.38, -0.03, 0.008, CT.hose, { segs: 5 });
      for (const y of [-0.17, -0.3]) mb.cylinder(0, y, 0, 0.036, 0.014, 7, all(CT.steel), { fit: true });
      bolt(mb, k * 0.052, -0.06, 0);
      box(mb, -k * 0.03, -0.25, 0.024, 0.008, 0.02, 0.008, CT.glow, { color: glow, emissive: 1.6 });
      break;
    case 'shin':
      hinge(mb, 0.042, 0.095, CT.rust); bolt(mb, k * 0.05, 0, 0, 'x', 0.012);
      // a van shock absorber: spring coils around a chrome rod
      rod(mb, 0, -0.03, -0.38, 0, 0.012, CT.chrome);
      for (let i = 0; i < 7; i++) mb.cylinder(0, -0.07 - i * 0.042, 0, 0.034, 0.012, 7, all(CT.rust), { fit: true });
      rod(mb, 0, -0.03, -0.1, 0, 0.032, CT.black);
      box(mb, 0, -0.42, 0, 0.05, 0.06, 0.05, CT.rust);
      break;
    case 'foot':
      box(mb, 0, -0.085, 0.045, 0.09, 0.06, 0.24, CT.rust);
      box(mb, 0, -0.088, 0.15, 0.094, 0.05, 0.05, CT.steel);
      box(mb, 0, -0.09, 0.045, 0.096, 0.012, 0.25, CT.hose);
      break;
  }
}
function legCoil(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'thigh':
      rod(mb, 0, -0.03, -0.41, 0, 0.05, CT.black, { rTop: 0.07, segs: 8 });
      glowStrip(mb, k * 0.05, -0.36, 0.02, 0.004, 0.24, 0.012, glow);
      break;
    case 'shin': {
      hinge(mb, 0.044, 0.1, CT.chrome);
      // the running blade: a C-curve of carbon segments
      for (let i = 0; i < 8; i++) {
        const a = (i / 7) * 1.9, y = -0.04 - i * 0.05, z = -Math.sin(a) * 0.07;
        mb.push().translate(0, y, z).rotateX(-Math.cos(a) * 0.5);
        box(mb, 0, -0.03, 0, 0.05, 0.055, 0.016, i % 3 === 1 ? CT.shell : CT.black);
        mb.pop();
      }
      glowStrip(mb, 0, -0.2, 0.018, 0.012, 0.1, 0.003, glow);
      break;
    }
    case 'foot': box(mb, 0, -0.07, 0.07, 0.05, 0.016, 0.17, CT.black); box(mb, 0, -0.08, 0.12, 0.054, 0.01, 0.08, CT.hose); break;
  }
}
// ------------------------------------------------------------------ head, spine, skin
function eyesLamp(mb: MB, d: Dims, glow: number) {
  const s = d.s * d.headS, y = 0.104 * s, z = 0.088 * s;
  for (const x of [-0.033, 0.033]) {
    mb.cylinderZ(x * s, y, z, 0.017 * s, 0.014, 8, { sides: CT.steel, top: CT.steel, bottom: CT.steel }, { fit: true });
    mb.cylinderZ(x * s, y, z + 0.008, 0.012 * s, 0.006, 8, { sides: CT.lens, top: CT.lens, bottom: CT.lens }, { fit: true, color: glow, emissive: 1.8 });
  }
  box(mb, 0, y - 0.006, z - 0.004, 0.03 * s, 0.01, 0.012, CT.steel);
}
function eyesLedger(mb: MB, d: Dims, glow: number) {
  const s = d.s * d.headS, y = 0.104 * s, z = 0.088 * s;
  mb.cylinderZ(-0.033 * s, y, z + 0.004, 0.022 * s, 0.022, 8, all(CT.black), { fit: true });
  mb.cylinderZ(-0.033 * s, y, z + 0.016, 0.016 * s, 0.006, 8, all(CT.lens), { fit: true, color: glow, emissive: 1.8 });
  box(mb, -0.072 * s, y - 0.004, z - 0.05, 0.012, 0.012, 0.09, CT.black);
  rod(mb, -0.078 * s, y + 0.08, y, z - 0.07, 0.003, CT.chrome);
  box(mb, -0.078 * s, y + 0.08, z - 0.07, 0.008, 0.008, 0.008, CT.glow, { color: glow, emissive: 1.8 });
}
function jawTrap(mb: MB, d: Dims, glow: number) {
  const s = d.s * d.headS, y = 0.02 * s, z = 0.06 * s;
  box(mb, 0, y - 0.006, z, 0.11 * s, 0.035, 0.05 * s, CT.steel);
  for (let i = 0; i < 7; i++) box(mb, (-0.045 + i * 0.015) * s, y + 0.027, z + 0.022 * s, 0.008, 0.012, 0.008, CT.teeth);
  for (const x of [-0.058, 0.058]) { mb.cylinderX(x * s, y + 0.03, z - 0.02, 0.012, 0.02, 7, all(CT.rust), { fit: true }); }
  box(mb, 0.04 * s, y + 0.004, z + 0.027 * s, 0.01, 0.006, 0.003, CT.glow, { color: glow, emissive: 1.6 });
}
function spineGantry(mb: MB, role: Role, d: Dims, glow: number) {
  const s = d.s, back = -0.105 * s * (0.85 + 0.15 * d.mass);
  if (role === 'chest') {
    for (let i = 0; i < 6; i++) box(mb, 0, 0.0 + i * 0.045 * s, back - 0.01, 0.05, 0.034, 0.03, i % 2 ? CT.steel : CT.paint);
    for (const k of [-1, 1]) { mb.push().translate(k * 0.06 * s, 0.22 * s, back - 0.005).rotateZ(k * 1.1); rod(mb, 0, 0, -0.12, 0, 0.007, CT.hose, { segs: 5 }); mb.pop(); }
    glowStrip(mb, 0, 0.1 * s, back - 0.026, 0.01, 0.12, 0.004, glow);
  } else if (role === 'spine') {
    for (let i = 0; i < 3; i++) box(mb, 0, -0.02 + i * 0.07 * s, back + 0.01, 0.05, 0.05, 0.03, i % 2 ? CT.paint : CT.steel);
  } else if (role === 'hips') {
    box(mb, 0, 0.0, back + 0.02, 0.14 * s, 0.05, 0.03, CT.steel);
  }
}
function skinPlates(mb: MB, role: Role, d: Dims, glow: number, k = 1) {
  const s = d.s, fr = 0.1 * s * (0.85 + 0.15 * d.mass), bw = d.bw;
  if (role === 'chest') {
    for (const x of [-0.06, 0.06]) for (let r = 0; r < 3; r++) {
      mb.push().translate(x * s * bw, 0.04 * s + r * 0.06 * s, fr + 0.004).rotateX(-0.12);
      box(mb, 0, 0, 0, 0.09 * s, 0.055 * s, 0.014, r === 1 ? CT.black : CT.shell, { color: 0xd8d4e8 });
      mb.pop();
    }
    glowStrip(mb, 0, 0.08 * s, fr + 0.01, 0.008, 0.12 * s, 0.004, glow);
  } else if (role === 'uarm') {
    mb.push().translate(k * 0.012, -0.02, 0).rotateZ(k * 0.5);
    box(mb, 0, -0.06, 0, 0.08, 0.08, 0.1, CT.shell, { color: 0xd8d4e8 });
    mb.pop();
  } else if (role === 'thigh') {
    box(mb, 0, -0.2, 0.05, 0.1, 0.12, 0.02, CT.shell, { color: 0xd8d4e8 });
  }
}

// ------------------------------------------------------------------ dispatch
function buildRole(mb: MB, style: CyberStyle, role: Role, k: number, glow: number, d: Dims) {
  switch (style) {
    case 'scrap': if (role === 'thigh' || role === 'shin' || role === 'foot') legScrap(mb, role, k, glow); else armScrap(mb, role, k, glow); break;
    case 'servo': armServo(mb, role, k, glow); break;
    case 'piston': armPiston(mb, role, k, glow); break;
    case 'vise': handVise(mb, role, k, glow); break;
    case 'tool': handTool(mb, role, k, glow); break;
    case 'coil': legCoil(mb, role, k, glow); break;
    case 'lamp': eyesLamp(mb, d, glow); break;
    case 'ledger': eyesLedger(mb, d, glow); break;
    case 'trap': jawTrap(mb, d, glow); break;
    case 'gantry': spineGantry(mb, role, d, glow); break;
    case 'plate': skinPlates(mb, role, d, glow, k); break;
  }
}

/** bones (and roles) a slot's hardware hangs on */
export function slotBones(slot: CyberSlot): [BoneName, Role][] {
  const S = slot.endsWith('_l') ? 'L' : 'R';
  switch (SLOT_KIND[slot]) {
    case 'arm': return [[`uarm${S}`, 'uarm'], [`farm${S}`, 'farm'], [`hand${S}`, 'hand'], [`fing1${S}`, 'f1'], [`fing2${S}`, 'f2'], [`thumb${S}`, 'th']] as [BoneName, Role][];
    case 'hand': return [[`farm${S}`, 'farm'], [`hand${S}`, 'hand'], [`fing1${S}`, 'f1'], [`fing2${S}`, 'f2'], [`thumb${S}`, 'th']] as [BoneName, Role][];
    case 'leg': return [[`thigh${S}`, 'thigh'], [`shin${S}`, 'shin'], [`foot${S}`, 'foot']] as [BoneName, Role][];
    case 'eyes': case 'jaw': return [['head', 'head']];
    case 'spine': return [['chest', 'chest'], ['spine', 'spine'], ['hips', 'hips']];
    case 'skin': return [['chest', 'chest'], ['uarmL', 'uarm'], ['uarmR', 'uarm'], ['thighL', 'thigh'], ['thighR', 'thigh']];
  }
  return [];
}

const GEO = new Map<string, THREE.BufferGeometry>();
const qz = (v: number) => Math.round(v * 50) / 50;
/** one piece's geometry (cached by style, role, side and size) */
export function pieceGeo(key: string, slot: CyberSlot, role: Role, bone: BoneName, d: Dims): THREE.BufferGeometry | null {
  const def = cyberDef(key);
  if (!def) return null;
  const k = bone.endsWith('L') ? 1 : bone.endsWith('R') ? -1 : 1;
  const ck = `${def.style}:${role}:${k}:${qz(d.s)}:${qz(d.mass)}:${qz(d.headS)}:${qz(d.bw)}`;
  let g = GEO.get(ck);
  if (g === undefined) {
    const mb = new ModelBuilder();
    // limb pieces are authored at height 1 and scaled with the body
    const limb = role !== 'head' && role !== 'chest' && role !== 'spine' && role !== 'hips' && !(def.style === 'plate');
    if (limb) mb.push().scale(d.s, d.s, d.s);
    buildRole(mb, def.style, role, k, def.glow, d);
    if (limb) mb.pop();
    g = mb.isEmpty ? (null as any) : mb.build();
    GEO.set(ck, g as THREE.BufferGeometry);
  }
  void slot;
  return g ?? null;
}

export interface GearPiece { geo: THREE.BufferGeometry; bone: BoneName }
/** everything a loadout hangs on a rig */
export function cyberPieces(load: Partial<Record<string, string>> | undefined, d: Dims): GearPiece[] {
  const out: GearPiece[] = [];
  if (!load) return out;
  for (const slot of CYBER_SLOTS) {
    const key = load[slot];
    if (!key) continue;
    for (const [bone, role] of slotBones(slot)) {
      const g = pieceGeo(key, slot, role, bone, d);
      if (g) out.push({ geo: g, bone });
    }
  }
  return out;
}

/**
 * A loose part in its rest pose (bones laid out straight) as one builder pass:
 * for item models and the surgery table. Origin at the slot's root joint.
 */
export function buildLoosePart(mb: MB, key: string, slot: CyberSlot, d: Dims) {
  const def = cyberDef(key);
  if (!def) return;
  const S = slot.endsWith('_l') ? 'L' : 'R', k = S === 'L' ? 1 : -1, s = d.s;
  const off = (b: string) => d.off[b as BoneName];
  const at = (bone: string, role: Role, base: [number, number, number]) => {
    mb.push().translate(base[0], base[1], base[2]).scale(s, s, s);
    buildRole(mb, def.style, role, k, def.glow, d);
    mb.pop();
  };
  const kind = SLOT_KIND[slot];
  if (kind === 'arm' || kind === 'hand') {
    // an arm hangs from the shoulder; a hand from the wrist (its wrist ring rides the end of the forearm)
    const farmY = kind === 'arm' ? off('farm' + S)[1] : -off('hand' + S)[1];
    const handY = kind === 'arm' ? farmY + off('hand' + S)[1] : 0;
    const f1 = off('fing1' + S), f2 = off('fing2' + S), th = off('thumb' + S);
    if (kind === 'arm') at('uarm', 'uarm', [0, 0, 0]);
    at('farm', 'farm', [0, farmY, 0]);
    at('hand', 'hand', [0, handY, 0]);
    at('f1', 'f1', [0, handY + f1[1], 0]);
    at('f2', 'f2', [0, handY + f1[1] + f2[1], 0]);
    at('th', 'th', [th[0], handY + th[1], th[2]]);
  } else if (kind === 'leg') {
    const sh = off('shin' + S)[1], ft = sh + off('foot' + S)[1];
    at('thigh', 'thigh', [0, 0, 0]); at('shin', 'shin', [0, sh, 0]); at('foot', 'foot', [0, ft, 0]);
  } else {
    // head / torso hardware is authored in body space already
    buildRole(mb, def.style, kind === 'spine' || kind === 'skin' ? 'chest' : 'head', k, def.glow, d);
  }
}
const LOOSE = new Map<string, THREE.BufferGeometry>();
export function loosePartGeo(key: string, slot: CyberSlot, d: Dims): THREE.BufferGeometry {
  const ck = `${key}:${slot}:${qz(d.s)}:${qz(d.mass)}`;
  let g = LOOSE.get(ck);
  if (!g) { const mb = new ModelBuilder(); buildLoosePart(mb, key, slot, d); g = mb.build(); LOOSE.set(ck, g); }
  return g;
}
