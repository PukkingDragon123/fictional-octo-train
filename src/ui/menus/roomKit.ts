// Parts for the subject room (room3d.ts): the concrete cell (ModelBuilder on
// the world atlas), the settings gear, the painted faces of things (Nixie
// glyphs, label tape, brass, gauges) and the blood. The machines and props
// are smooth models in roomParts.ts. Nothing here runs per frame.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { cssFont } from '../../gfx/crt';

export const ROOM = { W: 3.4, BACK: -2.4, FRONT: 6, H: 3.6, HATCH_W: 1.3, HATCH_H: 2.3, SEAT_Y: 0.47, CHAIR_Z: -0.45, FLOAT_Z: 0.45, PLATE_Y: 0.07 };
/** phosphor and lamp colours (no neon: tubes, filaments, phosphor) */
export const PHOS = { amber: 0xffb43c, green: 0x8dff7a, white: 0xe8e4d0, nixie: 0xff7a2a, red: 0xff4a2a };

const hz = (mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, n: number, axis: 'x' | 'z') => {
  // a hazard stripe: alternating yellow / black blocks
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const c = i % 2 ? 0x17150f : 0xe8b52a;
    if (axis === 'x') mb.box(x + t * w, y, z, w / n + 0.001, h, d, 'plastic_white', { color: c });
    else mb.box(x, y, z + t * d, w, h, d / n + 0.001, 'plastic_white', { color: c });
  }
};

/** the cell: floor, walls round a hatch in the back wall, a low ceiling with the press housing, pipes, the die plate */
export function roomGeometry(): THREE.BufferGeometry {
  const { W, BACK, FRONT, H, HATCH_W, HATCH_H, FLOAT_Z, PLATE_Y } = ROOM;
  const mb = new ModelBuilder();
  const zc = (BACK + FRONT) / 2, D = FRONT - BACK;
  mb.box(0, -0.05, zc, W * 2, 0.05, D, { top: 'concrete_wet', all: 'concrete' }, { color: 0x8a8c84 });
  // back wall in four pieces round the hatch
  const hw = HATCH_W / 2;
  const wallTex = { south: 'p_tile_wall', all: 'concrete' };
  mb.box((-W - hw) / 2, 0, BACK - 0.1, W - hw, 1.3, 0.2, wallTex, { color: 0x7a8078 });
  mb.box((W + hw) / 2, 0, BACK - 0.1, W - hw, 1.3, 0.2, wallTex, { color: 0x7a8078 });
  mb.box((-W - hw) / 2, 1.3, BACK - 0.1, W - hw, H - 1.3, 0.2, { south: 'concrete_b', all: 'concrete' }, { color: 0x6a6c66 });
  mb.box((W + hw) / 2, 1.3, BACK - 0.1, W - hw, H - 1.3, 0.2, { south: 'concrete_b', all: 'concrete' }, { color: 0x6a6c66 });
  mb.box(0, HATCH_H, BACK - 0.1, HATCH_W, H - HATCH_H, 0.2, { south: 'concrete_b', all: 'concrete' }, { color: 0x6a6c66 });
  // hatch frame and its hazard lintel
  for (const k of [-1, 1]) mb.box(k * (hw + 0.06), 0, BACK + 0.02, 0.12, HATCH_H + 0.06, 0.08, 'metal_dark', { color: 0x4a4c48 });
  hz(mb, 0, HATCH_H + 0.02, BACK + 0.04, HATCH_W + 0.24, 0.1, 0.06, 12, 'x');
  // the tunnel behind the hatch (a dark throat)
  mb.box(0, 0, BACK - 1.6, HATCH_W + 0.2, 0.04, 3, 'grate', { color: 0x3a3c38 });
  for (const k of [-1, 1]) mb.box(k * (hw + 0.1), 0, BACK - 1.6, 0.04, HATCH_H + 0.2, 3, 'metal_dark', { color: 0x2a2c2a });
  mb.box(0, HATCH_H + 0.1, BACK - 1.6, HATCH_W + 0.2, 0.04, 3, 'metal_dark', { color: 0x222422 });
  mb.box(0, 0, BACK - 3.05, HATCH_W + 0.2, HATCH_H + 0.2, 0.05, 'metal_dark', { color: 0x1a1a1a });
  // side walls, skirting
  for (const k of [-1, 1]) {
    mb.box(k * (W + 0.1), 0, zc, 0.2, H, D, { east: 'concrete_b', west: 'concrete_b', all: 'concrete' }, { color: 0x6a6e68 });
    mb.box(k * (W - 0.01), 0, zc, 0.02, 0.14, D, 'metal_painted_green', { color: 0x30342c });
  }
  // ceiling with the press housing (a square well) and tube fixtures
  const pw = 1.5, pd = 1.2;
  mb.box((-W - pw / 2) / 2, H, zc, W - pw / 2, 0.1, D, 'metal_dark', { color: 0x3a3c3a });
  mb.box((W + pw / 2) / 2, H, zc, W - pw / 2, 0.1, D, 'metal_dark', { color: 0x3a3c3a });
  mb.box(0, H, (BACK + FLOAT_Z - pd / 2) / 2, pw, 0.1, FLOAT_Z - pd / 2 - BACK, 'metal_dark', { color: 0x3a3c3a });
  mb.box(0, H, (FLOAT_Z + pd / 2 + FRONT) / 2, pw, 0.1, FRONT - FLOAT_Z - pd / 2, 'metal_dark', { color: 0x3a3c3a });
  for (const k of [-1, 1]) { mb.box(k * (pw / 2 + 0.05), H - 0.25, FLOAT_Z, 0.1, 0.25, pd + 0.2, 'metal_rusty', { color: 0x6a5a4a }); mb.box(0, H - 0.25, FLOAT_Z + k * (pd / 2 + 0.05), pw, 0.25, 0.1, 'metal_rusty', { color: 0x6a5a4a }); }
  mb.box(0, H + 1.2, FLOAT_Z, pw, 0.05, pd, 'metal_dark', { color: 0x111111 });
  for (const k of [-1, 1]) mb.box(k * (pw / 2), H, FLOAT_Z, 0.02, 1.2, pd, 'metal_dark', { color: 0x161616 });
  // pipes and conduits
  for (const [x, z, r] of [[-W + 0.18, -1.0, 0.07], [-W + 0.32, -1.0, 0.04], [W - 0.2, 1.4, 0.06]] as const) {
    mb.cylinder(x, 0, z, r, H, 8, 'metal_rusty', { color: 0x7a6a5a });
  }
  mb.cylinderX(0, H - 0.18, BACK + 0.2, 0.06, W * 2, 8, 'metal_grey', { color: 0x5a5e60 });
  mb.cylinderX(0, H - 0.34, BACK + 0.14, 0.035, W * 2, 6, 'metal_rusty', { color: 0x6a5040 });
  // the breaker panel on the left wall, with a fat cable to the chair
  mb.box(-W + 0.06, 1.1, -1.3, 0.12, 0.7, 0.5, 'metal_painted_green', { color: 0x3a4a3a });
  mb.box(-W + 0.14, 1.35, -1.3, 0.05, 0.25, 0.08, 'metal_dark', {});
  mb.box(-W + 0.18, 1.55, -1.3, 0.08, 0.04, 0.04, 'plastic_red', { color: 0xa81a1a });
  hz(mb, -W + 0.125, 1.04, -1.3, 0.01, 0.04, 0.5, 8, 'z');
  // arm slots (dark mouths in the wall the arms come out of)
  for (const k of [-1, 1]) { mb.box(k * 1.75, 2.75, BACK + 0.005, 0.7, 0.7, 0.02, 'metal_dark', { color: 0x0a0a0a }); hz(mb, k * 1.75, 3.12, BACK + 0.02, 0.8, 0.05, 0.03, 8, 'x'); }
  mb.box(0, H - 0.01, -0.95, 0.6, 0.02, 0.6, 'metal_dark', { color: 0x0a0a0a });
  mb.box(0, H - 0.01, 1.75, 0.6, 0.02, 0.6, 'metal_dark', { color: 0x0a0a0a });
  // the press die: a steel plate on the floor with hazard edging and anchors for the ankle chains
  mb.box(0, 0, FLOAT_Z, 1.4, PLATE_Y, 1.1, { top: 'metal_brushed', all: 'metal_dark' }, { color: 0x8a8e90 });
  hz(mb, 0, PLATE_Y, FLOAT_Z + 0.58, 1.5, 0.012, 0.06, 14, 'x');
  hz(mb, 0, PLATE_Y, FLOAT_Z - 0.58, 1.5, 0.012, 0.06, 14, 'x');
  for (const k of [-1, 1]) mb.cylinder(k * 0.34, PLATE_Y, FLOAT_Z + 0.1, 0.035, 0.05, 6, 'metal_rusty', { color: 0x7a6050 });
  // drain grate, a bucket, a stained mop sink corner
  mb.box(1.6, 0.003, 1.6, 0.4, 0.006, 0.4, 'q_floor_grate', { fit: true });
  mb.cylinder(-2.4, 0, 1.2, 0.16, 0.34, 8, 'metal_grey', { color: 0x6a6e70, rTop: 0.19 });
  return mb.build();
}




/** a cog with n teeth, extruded (the settings gear) */
export function gearGeometry(r: number, n: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const r0 = r * 0.8, r1 = r;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.25) / n) * Math.PI * 2, a2 = ((i + 0.5) / n) * Math.PI * 2, a3 = ((i + 0.75) / n) * Math.PI * 2;
    const p = (a: number, rr: number) => [Math.cos(a) * rr, Math.sin(a) * rr] as const;
    if (i === 0) s.moveTo(...p(a0, r0)); else s.lineTo(...p(a0, r0));
    s.lineTo(...p(a1, r1)); s.lineTo(...p(a2, r1)); s.lineTo(...p(a3, r0));
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.2, bevelSize: r * 0.03, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}


// ------------------------------------------------------------------ painted faces
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
export function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a Nixie tube's cathode stack: the lit letter in glowing wire, the unlit cathodes behind it */
export function paintNixie(cv: HTMLCanvasElement, ch: string) {
  const W = 96, H = 128;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `104px ${cssFont('--font-nixie')}`;
  // the dark cathodes stacked behind the lit one
  ctx.fillStyle = 'rgba(120, 70, 40, 0.22)';
  for (const c of ['8', '0', 'A', 'X']) if (c !== ch) ctx.fillText(c, W / 2 + (Math.random() - 0.5) * 3, H / 2 + 4);
  // the anode mesh
  ctx.strokeStyle = 'rgba(90, 60, 40, 0.25)'; ctx.lineWidth = 1;
  for (let x = 4; x < W; x += 7) { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, H - 6); ctx.stroke(); }
  for (let y = 6; y < H; y += 7) { ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(W - 4, y); ctx.stroke(); }
  // the glow: a wide orange haze, then the hot core of the wire
  ctx.shadowColor = '#ff5a10'; ctx.shadowBlur = 18; ctx.fillStyle = '#ff7a2a';
  ctx.fillText(ch, W / 2, H / 2 + 4);
  ctx.shadowBlur = 6; ctx.fillStyle = '#ffb070';
  ctx.fillText(ch, W / 2, H / 2 + 4);
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255, 236, 200, 0.85)';
  ctx.font = `100px ${cssFont('--font-nixie')}`;
  ctx.fillText(ch, W / 2, H / 2 + 4);
}
/** a strip of embossed label tape (Dymo-style): raised white letters on coloured plastic */
export function paintTape(cv: HTMLCanvasElement, label: string, tape: number, w: number, h: number) {
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = css(tape); ctx.fillRect(0, 1, w, h - 2);
  ctx.fillStyle = css(0xffffff, 0.12); ctx.fillRect(0, 1, w, 1);
  ctx.fillStyle = css(0x000000, 0.35); ctx.fillRect(0, h - 2, w, 1);
  // notched ends
  ctx.clearRect(0, 0, 2, 2); ctx.clearRect(0, h - 2, 2, 2); ctx.clearRect(w - 2, 0, 2, 2); ctx.clearRect(w - 2, h - 2, 2, 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let fs = Math.round(h * 0.7);
  const font = (n: number) => `600 ${n}px ${cssFont('--font-sign', 'sans-serif')}`;
  ctx.font = font(fs);
  while (ctx.measureText(label).width > w - 10 && fs > 8) ctx.font = font(--fs);
  // raised letters: a dark undercut, then the stretched-white plastic
  ctx.fillStyle = css(0x000000, 0.55); ctx.fillText(label, w / 2 + 1, h / 2 + 1.5);
  ctx.fillStyle = '#f4f0e6'; ctx.fillText(label, w / 2, h / 2 + 0.5);
}
/** an engraved brass plate with screws */
export function paintBrass(cv: HTMLCanvasElement, line1: string, line2: string, w: number, h: number) {
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  for (let y = 0; y < h; y++) { const t = y / h; ctx.fillStyle = `rgb(${Math.round(196 - t * 70)},${Math.round(150 - t * 56)},${Math.round(70 - t * 30)})`; ctx.fillRect(0, y, w, 1); }
  for (let i = 0; i < w * 0.6; i++) { ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), Math.floor(2 + Math.random() * 8), 1); }
  ctx.strokeStyle = '#4a3410'; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(255,230,170,0.6)'; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  for (const [x, y] of [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]]) { ctx.fillStyle = '#5a4018'; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = '#e8d090'; ctx.fillRect(x - 1, y - 2, 1, 4); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 0.4)}px ${cssFont('--font-poster', 'serif')}`;
  ctx.fillStyle = 'rgba(255,240,200,0.55)'; ctx.fillText(line1, Math.round(w / 2) + 1, Math.round(h * 0.4) + 1);
  ctx.fillStyle = '#2a1c08'; ctx.fillText(line1, Math.round(w / 2), Math.round(h * 0.4));
  ctx.font = `500 ${Math.round(h * 0.2)}px ${cssFont('--font-sign', 'sans-serif')}`;
  ctx.fillStyle = '#3a2a10'; ctx.fillText(line2, Math.round(w / 2), Math.round(h * 0.76));
}
/** a gauge face: cream enamel, ticks, a red zone */
export function paintGauge(cv: HTMLCanvasElement, label: string) {
  const S = 48; cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2418';
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.8 + i * 0.14); const r0 = S * 0.36, r1 = i % 5 ? S * 0.41 : S * 0.44; ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); ctx.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); ctx.stroke(); }
  ctx.strokeStyle = '#b8261e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.4, Math.PI * 2.0, Math.PI * 2.2); ctx.stroke();
  ctx.font = `500 9px ${cssFont('--font-sign', 'sans-serif')}`; ctx.fillStyle = '#2a2418'; ctx.textAlign = 'center'; ctx.fillText(label, S / 2, S * 0.74);
}

/** a blood splat (alpha) for decals: a core, drops flung outwards, a few runs */
export function bloodCanvas(seed: number, size = 64, drip = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cols = ['#5a0606', '#7a0a0a', '#8e1010', '#4a0404'];
  const blob = (x: number, y: number, r: number) => { ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const c = size / 2;
  for (let i = 0; i < 9; i++) blob(c + (rnd() - 0.5) * size * 0.25, c + (rnd() - 0.5) * size * 0.25, size * (0.08 + rnd() * 0.12));
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = size * (0.18 + rnd() * 0.3);
    blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.7 + rnd() * size * 0.035);
  }
  if (drip) for (let i = 0; i < 5; i++) { const x = c + (rnd() - 0.5) * size * 0.4; ctx.fillStyle = cols[1]; ctx.fillRect(Math.round(x), c, 1 + Math.floor(rnd() * 2), Math.round(size * (0.2 + rnd() * 0.3))); }
  const d = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0;
  ctx.putImageData(d, 0, 0);
  return cv;
}
