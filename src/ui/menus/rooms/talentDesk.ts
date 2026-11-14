// THE TALENT DESK: the bench in the control room, up close, on its own full-resolution renderer (no pixel
// filter): an oak bench top under a clamp lamp, eight enamelled tins of marbles in two arcs, a brass balance
// in the middle, a felt tray in front, a red seal button and an inspection stand with a printed lab card.
// Everything is painted at high resolution (canvas textures with grain, wear, rust, patina, fingerprints)
// and lit with a real environment, so the glass marbles refract the bench behind them.
//   tins       press one: the lid flips, the tin tips and pours its marbles into the tray (the last lot goes home)
//   marbles    hover: a glint and a lift, the name by the pointer. Drag one: it follows with weight and lag; drop
//              it on its pan (buffs left, debuffs right) and it lands, rolls, clinks and the beam swings; drag it
//              off the pan to send it home. Press one: it rolls onto the stand and its lab card stands beside it.
//   balance    the needle on the dial and the gram wheels under the pans are the readout
//   seal       the red button: only when level or leaning to the debuffs (else it buzzes and the needle shivers)
// Keys: 1-8 pour a tin, ← → pick a marble in the tray, Enter inspect / put on or take off, S seal, Esc back.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MARBLES, MARBLE, CANS, weigh, balanced, effectsOf, type Marble } from '../../../survival/talents';
import { marbleOwned, unlockHint, loadout, setLoadout, freshMarbles, markSeen } from '../../../game/talentFile';
import { buildMarble, type Marble3D } from './marble3d';
import { statMask } from './statIcons';
import { uiSound, gameSound } from '../monitor/props';

const R = 0.019, PAN_R = 0.078, BEAM = 0.21, PIV = 0.42, HANG = 0.2;
const CAN_R = 0.052, CAN_H = 0.13;
const DRAG_Y = 0.3;
type Where = 'can' | 'tray' | 'pan' | 'stand' | 'drag' | 'fly';
interface MS { m: Marble; v: Marble3D; where: Where; pos: THREE.Vector3; vel: THREE.Vector3; last: THREE.Vector3; lift: number; hop: number; fly: { from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; arc: number; then: Where; land?: number } | null }
interface Tin { i: number; key: string; group: THREE.Group; body: THREE.Group; lid: THREE.Group; glow: THREE.Mesh; x: number; z: number; tip: number; tipGoal: number; lid0: number; marbles: string[] }

// ------------------------------------------------------------------ painting
const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rngOf(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** a soft value-noise canvas (blurred up when drawn large) */
function noiseCanvas(n: number, seed: number, lo = 0, hi = 255): HTMLCanvasElement {
  const c = cv(n, n), x = c.getContext('2d')!, d = x.createImageData(n, n), r = rngOf(seed);
  for (let i = 0; i < n * n; i++) { const v = lo + r() * (hi - lo); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0); return c;
}
function tex(c: HTMLCanvasElement, srgb = true, rep?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
/** oak planks: grain, seams, knots, worn patches, scratches, a few rings from mugs */
function paintWood(): { map: THREE.Texture; bump: THREE.Texture; rough: THREE.Texture } {
  const W = 2048, H = 1024, c = cv(W, H), x = c.getContext('2d')!, r = rngOf(71);
  const planks = 5, ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const base = [[118, 76, 42], [108, 70, 38], [126, 84, 48], [112, 72, 40], [102, 66, 36]][p];
    x.fillStyle = `rgb(${base})`; x.fillRect(0, p * ph, W, ph);
    for (let i = 0; i < 260; i++) {
      const y0 = p * ph + r() * ph, amp = 2 + r() * 10, f = 0.002 + r() * 0.006, ph0 = r() * 6;
      x.strokeStyle = `rgba(${r() < 0.5 ? '70,42,20' : '200,160,110'},${0.05 + r() * 0.12})`; x.lineWidth = 0.6 + r() * 2.2;
      x.beginPath(); for (let u = 0; u <= W; u += 16) { const yy = y0 + Math.sin(u * f + ph0) * amp + Math.sin(u * f * 3.1) * amp * 0.3; if (u === 0) x.moveTo(u, yy); else x.lineTo(u, yy); } x.stroke();
    }
    for (let k = 0; k < 2; k++) { const kx = r() * W, ky = p * ph + ph * (0.3 + r() * 0.4); for (let q = 0; q < 9; q++) { x.strokeStyle = `rgba(60,34,16,${0.22 - q * 0.02})`; x.lineWidth = 1.5; x.beginPath(); x.ellipse(kx, ky, 10 + q * 7, 4 + q * 2.4, 0, 0, Math.PI * 2); x.stroke(); } }
    x.fillStyle = 'rgba(30,18,8,0.75)'; x.fillRect(0, p * ph, W, 3);
  }
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.35; x.imageSmoothingEnabled = true; x.drawImage(noiseCanvas(64, 3, 150, 255), 0, 0, W, H); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 7; i++) { const gx = r() * W, gy = r() * H, gr = 80 + r() * 220; const g = x.createRadialGradient(gx, gy, 0, gx, gy, gr); g.addColorStop(0, 'rgba(220,190,140,0.18)'); g.addColorStop(1, 'rgba(220,190,140,0)'); x.fillStyle = g; x.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }
  for (let i = 0; i < 4; i++) { const gx = r() * W, gy = r() * H, gr = 40 + r() * 30; x.strokeStyle = 'rgba(70,40,20,0.22)'; x.lineWidth = 4; x.beginPath(); x.arc(gx, gy, gr, 0, Math.PI * 2); x.stroke(); }
  for (let i = 0; i < 160; i++) { const sx = r() * W, sy = r() * H, a = r() * 6, l = 10 + r() * 80; x.strokeStyle = `rgba(${r() < 0.6 ? '235,210,170' : '60,36,18'},${0.1 + r() * 0.2})`; x.lineWidth = 0.7; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l * 0.3); x.stroke(); }
  // the bump: luminance of the same paint, the seams sunk
  const b = cv(W / 2, H / 2), bx = b.getContext('2d')!; bx.filter = 'grayscale(1) contrast(1.6)'; bx.drawImage(c, 0, 0, W / 2, H / 2);
  const rg = cv(512, 256), rx = rg.getContext('2d')!; rx.fillStyle = '#9a9a9a'; rx.fillRect(0, 0, 512, 256); rx.globalAlpha = 0.5; rx.drawImage(noiseCanvas(32, 9, 90, 200), 0, 0, 512, 256);
  return { map: tex(c), bump: tex(b, false), rough: tex(rg, false) };
}
/** a tin's wrap: brushed tinplate, rust creeping from the rims and the seam, a printed label with the tin's name */
function paintTin(i: number): { map: THREE.Texture; bump: THREE.Texture; rough: THREE.Texture } {
  const C0 = CANS[i], W = 1024, H = 512, c = cv(W, H), x = c.getContext('2d')!, r = rngOf(100 + i);
  const hx = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9a9ea0'); g.addColorStop(0.5, '#b8bcbc'); g.addColorStop(1, '#8a8e90');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,96,100'},${0.04 + r() * 0.08})`; x.fillRect(r() * W, r() * H, 30 + r() * 200, 1); }
  // the label (the middle 64%), its ink, the name big where it faces the operator (u = 0.5)
  const L0 = H * 0.18, L1 = H * 0.82;
  x.fillStyle = hx(C0.paper); x.fillRect(0, L0, W, L1 - L0);
  x.globalAlpha = 0.22; x.drawImage(noiseCanvas(48, 20 + i, 120, 255), 0, L0, W, L1 - L0); x.globalAlpha = 1;
  x.fillStyle = hx(C0.ink); x.fillRect(0, L0 + 14, W, 6); x.fillRect(0, L1 - 20, W, 6);
  for (let u = 0; u < W; u += 24) { x.fillRect(u, L0 + 26, 12, 3); x.fillRect(u + 12, L1 - 29, 12, 3); }
  x.font = `${C0.label.length > 5 ? 92 : 112}px Alagard, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = hx(C0.ink); x.fillText(C0.label, W / 2, (L0 + L1) / 2 + 4);
  x.font = '28px Alagard, serif'; x.fillText('MARBLES', W / 2 - 300, (L0 + L1) / 2); x.fillText('No. 0' + (i + 1), W / 2 + 300, (L0 + L1) / 2);
  // wear: a scuffed band, a torn corner, stains
  for (let k = 0; k < 5; k++) { const sx = r() * W, sy = L0 + r() * (L1 - L0), sr = 20 + r() * 60; const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr); sg.addColorStop(0, 'rgba(110,80,40,0.28)'); sg.addColorStop(1, 'rgba(110,80,40,0)'); x.fillStyle = sg; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
  for (let k = 0; k < 120; k++) { x.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.2})`; x.lineWidth = 0.8; const sx = r() * W, sy = L0 + r() * (L1 - L0); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 40, sy + (r() - 0.5) * 8); x.stroke(); }
  // rust from the rims and the back seam (u = 0)
  for (let k = 0; k < 1600; k++) {
    const atRim = r() < 0.7, sx = atRim ? r() * W : (r() < 0.5 ? r() * 30 : W - r() * 30), sy = atRim ? (r() < 0.5 ? r() * L0 * 0.9 : H - r() * L0 * 0.9) : r() * H;
    const v = r(); x.fillStyle = `rgba(${130 + v * 60},${60 + v * 30},${20 + v * 10},${0.15 + r() * 0.4})`; x.fillRect(sx, sy, 1 + r() * 4, 1 + r() * 3);
  }
  const b = cv(256, 128), bx = b.getContext('2d')!; bx.fillStyle = '#808080'; bx.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 3; k++) { const dx = r() * 256, dy = 30 + r() * 70, dr = 8 + r() * 14; const dg = bx.createRadialGradient(dx, dy, 0, dx, dy, dr); dg.addColorStop(0, 'rgba(40,40,40,0.8)'); dg.addColorStop(1, 'rgba(128,128,128,0)'); bx.fillStyle = dg; bx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2); }
  for (const y of [10, 22, 106, 118]) { bx.fillStyle = '#c0c0c0'; bx.fillRect(0, y, 256, 3); }
  const rg = cv(256, 128), rx = rg.getContext('2d')!; rx.fillStyle = '#5a5a5a'; rx.fillRect(0, 0, 256, 128); rx.fillStyle = '#d8d8d8'; rx.fillRect(0, 128 * 0.18, 256, 128 * 0.64);
  return { map: tex(c), bump: tex(b, false), rough: tex(rg, false) };
}
function paintLid(i: number): THREE.Texture {
  const C0 = CANS[i], S = 512, c = cv(S, S), x = c.getContext('2d')!, r = rngOf(300 + i);
  x.fillStyle = '#b0b4b6'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 12; k++) { x.strokeStyle = `rgba(${k % 2 ? '255,255,255' : '90,96,100'},0.35)`; x.lineWidth = 3; x.beginPath(); x.arc(S / 2, S / 2, 60 + k * 16, 0, Math.PI * 2); x.stroke(); }
  for (let k = 0; k < 220; k++) { const a = r() * 6.28, rr = r() * S * 0.45; x.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,64,66'},${0.08 + r() * 0.15})`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); x.lineTo(S / 2 + Math.cos(a + 0.2) * rr, S / 2 + Math.sin(a + 0.2) * rr); x.stroke(); }
  x.fillStyle = '#' + C0.paper.toString(16).padStart(6, '0'); x.beginPath(); x.arc(S / 2, S / 2, 92, 0, Math.PI * 2); x.fill();
  x.font = '120px Alagard, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#' + C0.ink.toString(16).padStart(6, '0'); x.fillText(String(i + 1), S / 2, S / 2 + 6);
  for (let k = 0; k < 500; k++) { const a = r() * 6.28, rr = S * (0.42 + r() * 0.08); x.fillStyle = `rgba(150,80,30,${0.2 + r() * 0.4})`; x.fillRect(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr, 2 + r() * 3, 2 + r() * 3); }
  return tex(c);
}
/** brass: warm metal, a green-brown patina in the corners, fingerprints in the shine */
function paintBrass(): { map: THREE.Texture; rough: THREE.Texture } {
  const S = 1024, c = cv(S, S), x = c.getContext('2d')!, r = rngOf(500);
  x.fillStyle = '#d6a64c'; x.fillRect(0, 0, S, S);
  x.globalAlpha = 0.1; x.drawImage(noiseCanvas(16, 501, 120, 255), 0, 0, S, S); x.globalAlpha = 1;
  for (let k = 0; k < 40; k++) { const px = r() * S, py = r() * S, pr = 20 + r() * 90; const g = x.createRadialGradient(px, py, 0, px, py, pr); g.addColorStop(0, `rgba(${r() < 0.5 ? '70,96,70' : '90,64,36'},0.22)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
  const rg = cv(512, 512), rx = rg.getContext('2d')!; rx.fillStyle = '#5c5c5c'; rx.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 26; k++) { const fx = r() * 512, fy = r() * 512; for (let q = 0; q < 9; q++) { rx.strokeStyle = 'rgba(190,190,190,0.25)'; rx.lineWidth = 1.2; rx.beginPath(); rx.ellipse(fx, fy, 4 + q * 2.2, 6 + q * 2.8, r(), 0, Math.PI * 2); rx.stroke(); } }
  return { map: tex(c), rough: tex(rg) };
}
/** the balance's dial: cream enamel, a green arc (level or leaning to the debuffs) and a red one */
function paintDial(): THREE.Texture {
  const W = 1024, H = 640, c = cv(W, H), x = c.getContext('2d')!;
  x.fillStyle = '#efe7d0'; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.12; x.drawImage(noiseCanvas(40, 77, 120, 255), 0, 0, W, H); x.globalAlpha = 1;
  const cx = W / 2, cy = -140, r0 = 560, r1 = 640;
  const arc = (a0: number, a1: number, col: string) => { x.strokeStyle = col; x.lineWidth = r1 - r0; x.beginPath(); x.arc(cx, cy, (r0 + r1) / 2, Math.PI / 2 - a1, Math.PI / 2 - a0); x.stroke(); };
  arc(-0.02, 0.42, '#2e8a3a'); arc(-0.42, -0.02, '#c03020');
  x.strokeStyle = '#1a1410';
  for (let k = -12; k <= 12; k++) { const a = k * 0.035, l = k % 4 === 0 ? 60 : 30; x.lineWidth = k % 4 === 0 ? 6 : 3; x.beginPath(); x.moveTo(cx + Math.sin(a) * (r0 - l), cy + Math.cos(a) * (r0 - l)); x.lineTo(cx + Math.sin(a) * r0, cy + Math.cos(a) * r0); x.stroke(); }
  x.font = '44px Alagard, serif'; x.textAlign = 'center'; x.fillStyle = '#1a1410';
  x.fillText('DEBUFF', 190, 560); x.fillText('BUFF', W - 190, 560);
  x.font = '30px Alagard, serif'; x.fillStyle = '#6a5a40'; x.fillText('MERIDIAN · T-1', cx, 600);
  return tex(c);
}
function paintFelt(): THREE.Texture {
  const W = 1024, H = 256, c = cv(W, H), x = c.getContext('2d')!;
  x.fillStyle = '#163a26'; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.28; x.drawImage(noiseCanvas(128, 41, 40, 255), 0, 0, W, H); x.globalAlpha = 1;
  for (let k = 0; k < 8; k++) { const sx = (k + 0.5) / 8 * W, g = x.createRadialGradient(sx, H / 2, 0, sx, H / 2, 54); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.8, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(sx - 60, 0, 120, H); }
  return tex(c);
}
function paintWall(): THREE.Texture {
  const W = 1024, H = 512, c = cv(W, H), x = c.getContext('2d')!, r = rngOf(9);
  x.fillStyle = '#4a524c'; x.fillRect(0, 0, W, H);
  for (let ty = 0; ty < H; ty += 64) for (let tx = 0; tx < W; tx += 64) { const v = 112 + r() * 22; x.fillStyle = `rgb(${v - 8},${v + 6},${v - 2})`; x.fillRect(tx + 2, ty + 2, 60, 60); }
  x.fillStyle = '#245a46'; x.fillRect(0, H - 90, W, 26);
  x.fillStyle = '#3a3c38'; x.fillRect(0, 0, W, 80);
  for (let k = 0; k < 30; k++) { const sx = r() * W; const g = x.createLinearGradient(sx, 80, sx, 80 + 200 * r()); g.addColorStop(0, 'rgba(80,70,50,0.25)'); g.addColorStop(1, 'rgba(80,70,50,0)'); x.fillStyle = g; x.fillRect(sx, 80, 3 + r() * 6, 260); }
  return tex(c);
}
/** the lab card: name, weight, each effect as an icon and a number, the drawback in red ink, a lock if it is not earned */
function paintCard(m: Marble, own: boolean): THREE.Texture {
  const W = 1024, H = 680, c = cv(W, H), x = c.getContext('2d')!, r = rngOf(m.key.length * 31 + 7);
  x.fillStyle = '#f2ead6'; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.18; x.drawImage(noiseCanvas(64, 12, 120, 255), 0, 0, W, H); x.globalAlpha = 1;
  x.strokeStyle = 'rgba(70,110,170,0.25)'; x.lineWidth = 2; for (let y = 200; y < H; y += 64) { x.beginPath(); x.moveTo(30, y); x.lineTo(W - 30, y); x.stroke(); }
  x.fillStyle = m.kind === 'buff' ? '#b8902a' : '#b23a24'; x.fillRect(0, 0, W, 14);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  x.font = '76px Alagard, serif'; x.fillStyle = own ? '#1a1408' : '#6a6050'; x.fillText(m.name, 44, 108);
  x.textAlign = 'right'; x.font = '84px Alagard, serif'; x.fillStyle = '#1a1408'; x.fillText(m.weight + 'g', W - 44, 112);
  x.textAlign = 'left'; x.font = '34px Alagard, serif'; x.fillStyle = '#6a5a40'; x.fillText(m.line, 46, 168);
  let y = 200;
  const icon = (stat: Parameters<typeof statMask>[0], ix: number, iy: number, col: string) => { const mk = statMask(stat), s = 5; x.fillStyle = col; for (let j = 0; j < mk.length; j++) for (let k = 0; k < mk[j].length; k++) if (mk[j][k] === '#') x.fillRect(ix + k * s, iy + j * s, s - 0.6, s - 0.6); };
  for (const e of effectsOf(m)) {
    const col = e.good ? '#1e5a2a' : '#b02418';
    icon(e.stat, 54, y + 6, col);
    x.font = '40px Alagard, serif'; x.fillStyle = col; x.fillText(e.label, 130, y + 46);
    x.textAlign = 'right'; x.font = '64px Alagard, serif'; x.fillText(e.value, W - 50, y + 54); x.textAlign = 'left';
    if (!e.good) { x.strokeStyle = 'rgba(176,36,24,0.85)'; x.lineWidth = 4; x.beginPath(); for (let u = 130; u < W - 50; u += 12) x.lineTo(u, y + 62 + Math.sin(u * 0.3) * 2.5); x.stroke(); }
    y += 84;
  }
  if (!own) {
    y = Math.max(y, H - 150);
    x.fillStyle = '#1a1408'; x.fillRect(54, y + 12, 34, 28); x.strokeStyle = '#1a1408'; x.lineWidth = 6; x.beginPath(); x.arc(71, y + 12, 12, Math.PI, 0); x.stroke();
    x.font = '32px Alagard, serif'; x.fillStyle = '#4a3a20';
    const words = unlockHint(m).split(' '); let line = '', ly = y + 36;
    for (const w of words) { if (x.measureText(line + w).width > W - 190) { x.fillText(line, 110, ly); line = ''; ly += 40; } line += w + ' '; }
    x.fillText(line, 110, ly);
  }
  for (let k = 0; k < 4; k++) { const sx = r() * W, sy = r() * H, sr = 30 + r() * 40; const g = x.createRadialGradient(sx, sy, 0, sx, sy, sr); g.addColorStop(0, 'rgba(140,100,50,0.12)'); g.addColorStop(1, 'rgba(140,100,50,0)'); x.fillStyle = g; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
  return tex(c);
}
function paintGrams(n: number, kind: 'buff' | 'debuff', c?: HTMLCanvasElement): HTMLCanvasElement {
  c = c ?? cv(256, 112); const x = c.getContext('2d')!;
  x.fillStyle = '#1a1712'; x.fillRect(0, 0, 256, 112);
  for (let k = 0; k < 2; k++) { const dx = 64 + k * 74; x.fillStyle = '#efe7d0'; x.fillRect(dx, 12, 64, 88); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(dx, 12, 64, 16); x.fillRect(dx, 84, 64, 16); }
  const s = String(Math.min(99, n)).padStart(2, '0');
  x.font = '76px Alagard, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = kind === 'buff' ? '#1a1408' : '#9a1e12';
  x.fillText(s[0], 96, 60); x.fillText(s[1], 170, 60);
  x.font = '34px Alagard, serif'; x.fillStyle = '#c8a050'; x.fillText('g', 226, 64);
  return c;
}

// ------------------------------------------------------------------ the desk
export class TalentDesk {
  private canvas = document.createElement('canvas');
  private R: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(44, 1, 0.02, 20);
  private raf = 0; private last = 0; private t = 0;
  private tins: Tin[] = [];
  private ms = new Map<string, MS>();
  private onScale: Set<string>;
  private beam = new THREE.Group(); private pans: THREE.Group[] = []; private needle = new THREE.Group();
  private ang = 0; private angV = 0; private jam = 0;
  private grams: { c: HTMLCanvasElement; t: THREE.CanvasTexture }[] = [];
  private seal = new THREE.Group(); private sealCap!: THREE.Mesh; private sealLamp!: THREE.MeshStandardMaterial; private sealT = 0;
  private card!: THREE.Mesh; private cardMat!: THREE.MeshStandardMaterial; private cardShown = 0;
  private standP = new THREE.Vector3(0.36, 0.06 + R, 0.2);
  private poured = -1;
  private tray: string[] = [];
  private inspect: string | null = null;
  private hover: string | null = null; private hoverTin = -1;
  private drag: { key: string; from: Where; sx: number; sy: number; moved: boolean } | null = null;
  private ptr = new THREE.Vector2(-9, -9); private ray = new THREE.Raycaster();
  private camP = new THREE.Vector3(0, 0.7, 0.92); private camL = new THREE.Vector3(0, 0.07, -0.06); private camF = 44;
  private tag = document.createElement('div');
  private back = document.createElement('button');
  private sel = 0;
  private fresh: Set<string>;
  private glint: THREE.Sprite;
  private lamp = new THREE.SpotLight(0xffe6c4, 40, 3.2, 0.75, 0.55, 1.6);
  private pmrem: THREE.PMREMGenerator;
  private disposables: { dispose(): void }[] = [];
  private v = new THREE.Vector3(); private q = new THREE.Quaternion();

  constructor(private o: { intake: boolean; onDone: (keys: string[] | null) => void }) {
    this.onScale = new Set(loadout());
    this.fresh = freshMarbles();
    this.canvas.className = 'td-canvas';
    this.R = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.R.outputColorSpace = THREE.SRGBColorSpace;
    this.R.toneMapping = THREE.ACESFilmicToneMapping; this.R.toneMappingExposure = 0.8;
    this.R.shadowMap.enabled = true; this.R.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(this.R);
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env; this.scene.environmentIntensity = 0.38;
    this.scene.background = new THREE.Color(0x101210);
    this.build();
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glint.scale.setScalar(0.04); this.glint.visible = false; this.scene.add(this.glint);
    this.tag.className = 'td-tag';
    this.back.className = 'td-back'; this.back.type = 'button'; this.back.setAttribute('aria-label', 'Back (Esc)'); this.back.textContent = '‹';
    this.back.addEventListener('click', () => this.escape());
    document.body.append(this.canvas, this.tag, this.back);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    uiSound('servo', 0.4);
    this.last = performance.now();
    const loop = (now: number) => { this.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.frame(dt); };
    this.raf = requestAnimationFrame(loop);
    if (import.meta.env.DEV) (window as any).__desk = this;
  }

  // ================================================================== the set
  private build() {
    const S = this.scene;
    const wood = paintWood(), brass = paintBrass();
    this.disposables.push(wood.map, wood.bump, wood.rough, brass.map, brass.rough);
    // the bench top (oak, a steel nosing), the wall behind, the upstand
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.0), new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 1.4, roughnessMap: wood.rough, roughness: 0.62, metalness: 0 }));
    top.position.set(0, -0.025, -0.08); top.receiveShadow = true; S.add(top);
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9094, metalness: 0.9, roughness: 0.38 });
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.02), steel); nose.position.set(0, -0.03, 0.43); S.add(nose);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: paintWall(), roughness: 0.55 }));
    wall.position.set(0, 0.6, -0.58); wall.receiveShadow = true; S.add(wall);
    // the balance: a dark iron base, brass pillar and beam on a knife edge, two pans on rods, the dial
    // polished brass: the colour is the metal's own; fingerprints and wear live in the roughness
    const brassM = new THREE.MeshStandardMaterial({ roughnessMap: brass.rough, roughness: 0.26, metalness: 1, color: 0xd8a650, envMapIntensity: 1.8 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x232426, metalness: 0.55, roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.16), iron); base.position.set(0, 0.02, -0.2); base.castShadow = base.receiveShadow = true; S.add(base);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.565, 0.008, 0.008), brassM); rail.position.set(0, 0.041, -0.118); S.add(rail);
    for (const [dx, dz] of [[-0.25, -0.06], [0.25, -0.06], [-0.25, 0.06], [0.25, 0.06]]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 24), brassM); f.position.set(dx, 0.006, -0.2 + dz); S.add(f); }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, PIV - 0.05, 32), brassM); pillar.position.set(0, 0.04 + (PIV - 0.05) / 2, -0.2); pillar.castShadow = true; S.add(pillar);
    const knife = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), brassM); knife.position.set(0, PIV - 0.005, -0.2); S.add(knife);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 2 + 0.04, 0.02, 0.014), brassM); bar.castShadow = true; this.beam.add(bar);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 32), brassM); hub.rotation.x = Math.PI / 2; this.beam.add(hub);
    for (const s of [-1, 1]) { const end = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 14), brassM); end.position.set(s * (BEAM + 0.02), 0, 0); this.beam.add(end); }
    this.beam.position.set(0, PIV, -0.2); S.add(this.beam);
    // the dial behind the needle
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125), new THREE.MeshStandardMaterial({ map: paintDial(), roughness: 0.35, metalness: 0 }));
    dial.position.set(0, PIV - 0.16, -0.214); S.add(dial);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.212, 0.137, 0.008), brassM); bezel.position.set(0, PIV - 0.16, -0.22); S.add(bezel);
    const nd = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.17, 0.003), new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.4 })); nd.position.y = -0.085;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.018, 12), new THREE.MeshStandardMaterial({ color: 0xc81a10, roughness: 0.4 })); tip.position.y = -0.172; tip.rotation.z = Math.PI;
    this.needle.add(nd, tip); this.needle.position.set(0, PIV, -0.206); S.add(this.needle);
    const pan = (side: number) => {
      const g = new THREE.Group();
      const prof = [[0, 0], [PAN_R * 0.7, 0.002], [PAN_R, 0.016], [PAN_R + 0.004, 0.02], [PAN_R + 0.001, 0.021], [PAN_R - 0.003, 0.017], [PAN_R * 0.68, 0.005], [0, 0.004]].map(([a, b]) => new THREE.Vector2(a, b));
      const dish = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), brassM); dish.castShadow = dish.receiveShadow = true; g.add(dish);
      for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.5; const p0 = new THREE.Vector3(Math.cos(a) * PAN_R * 0.95, 0.018, Math.sin(a) * PAN_R * 0.95), p1 = new THREE.Vector3(0, HANG, 0); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, p0.distanceTo(p1), 6), steel); rod.position.copy(p0).add(p1).multiplyScalar(0.5); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); g.add(rod); }
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 8, 20), brassM); hook.position.y = HANG; g.add(hook);
      g.userData.side = side; this.pans.push(g); S.add(g);
      // its gram wheels on the base below it
      const c = paintGrams(0, side > 0 ? 'debuff' : 'buff'), t = tex(c);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.03), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
      plate.position.set(side * 0.18, 0.03, -0.119); S.add(plate);
      this.grams.push({ c, t });
    };
    pan(-1); pan(1);
    // the tins in two arcs, the tray, the seal button, the inspection stand and its card
    const spots: [number, number][] = [[-0.76, -0.04], [-0.68, -0.18], [-0.56, -0.29], [-0.42, -0.36], [0.42, -0.36], [0.56, -0.29], [0.68, -0.18], [0.76, -0.04]];
    CANS.forEach((_, i) => this.buildTin(i, spots[i][0], spots[i][1]));
    const trayM = new THREE.MeshStandardMaterial({ map: wood.map, roughness: 0.5, color: 0x8a6a4a });
    const tw = 0.62, td = 0.1;
    for (const [w, d, x, z] of [[tw + 0.02, 0.012, 0, -td / 2], [tw + 0.02, 0.012, 0, td / 2], [0.012, td, -tw / 2, 0], [0.012, td, tw / 2, 0]] as [number, number, number, number][]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, d), trayM); b.position.set(x, 0.011, 0.2 + z); b.castShadow = true; S.add(b); }
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(tw, td), new THREE.MeshStandardMaterial({ map: paintFelt(), roughness: 0.95 })); felt.rotation.x = -Math.PI / 2; felt.position.set(0, 0.004, 0.2); felt.receiveShadow = true; S.add(felt);
    // the seal button: a steel box, a hazard collar, a red mushroom cap and a status lamp
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.08), steel); box.position.set(-0.5, 0.0225, 0.2); box.castShadow = true; this.seal.add(box);
    this.sealCap = new THREE.Mesh(new THREE.SphereGeometry(0.028, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xc8180e, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
    this.sealCap.scale.y = 0.65; this.sealCap.position.set(-0.5, 0.047, 0.2); this.seal.add(this.sealCap);
    this.sealLamp = new THREE.MeshStandardMaterial({ color: 0x103a10, emissive: 0x2aff4a, emissiveIntensity: 0 });
    const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), this.sealLamp); lampM.position.set(-0.47, 0.046, 0.235); this.seal.add(lampM);
    S.add(this.seal);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.05, 48), brassM); stand.position.set(this.standP.x, 0.025, this.standP.z); stand.castShadow = true; S.add(stand);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 10, 32), brassM); ring.rotation.x = Math.PI / 2; ring.position.set(this.standP.x, 0.051, this.standP.z); S.add(ring);
    this.cardMat = new THREE.MeshStandardMaterial({ roughness: 0.85, transparent: true, opacity: 0 });
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.14), this.cardMat);
    this.card.position.set(0.535, 0.085, 0.21); this.card.rotation.set(-0.55, -0.1, 0); this.card.castShadow = true; S.add(this.card);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.03), brassM); clip.position.set(0.535, 0.012, 0.25); S.add(clip);
    // the marbles: real glass on this renderer
    for (const m of MARBLES) {
      const v = buildMarble(m, R, true);
      v.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; } });
      v.caustic.scale.setScalar(1.6);
      S.add(v.group, v.caustic);
      const where: Where = this.onScale.has(m.key) ? 'pan' : 'can';
      this.ms.set(m.key, { m, v, where, pos: new THREE.Vector3(), vel: new THREE.Vector3(), last: new THREE.Vector3(), lift: 0, hop: -1, fly: null });
    }
    // light: the clamp lamp (shadows), a cool window fill, the room's bounce
    this.lamp.position.set(-0.35, 1.15, 0.35); this.lamp.target.position.set(0.05, 0, -0.1);
    this.lamp.castShadow = true; this.lamp.shadow.mapSize.set(2048, 2048); this.lamp.shadow.bias = -0.0004; this.lamp.shadow.normalBias = 0.01; this.lamp.shadow.radius = 4;
    S.add(this.lamp, this.lamp.target);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); fill.position.set(1.2, 1.4, 1.2); S.add(fill);
    S.add(new THREE.HemisphereLight(0xf4f0e8, 0x3a2a1c, 0.3));
    this.drawGrams();
    this.snapAll();
  }
  private buildTin(i: number, x: number, z: number) {
    const p = paintTin(i);
    this.disposables.push(p.map, p.bump, p.rough);
    const group = new THREE.Group(), body = new THREE.Group();
    const side = new THREE.Mesh(new THREE.CylinderGeometry(CAN_R, CAN_R, CAN_H, 72, 8, true, Math.PI, Math.PI * 2), new THREE.MeshStandardMaterial({ map: p.map, bumpMap: p.bump, bumpScale: 2, roughnessMap: p.rough, roughness: 1, metalness: 0.55 }));
    side.position.y = CAN_H / 2; side.castShadow = side.receiveShadow = true; body.add(side);
    const tin = new THREE.MeshStandardMaterial({ color: 0xa8acae, metalness: 0.9, roughness: 0.3 });
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(CAN_R - 0.0015, CAN_R - 0.0015, CAN_H, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a8e90, metalness: 0.7, roughness: 0.5, side: THREE.BackSide }));
    inner.position.y = CAN_H / 2; body.add(inner);
    for (const y of [0.002, CAN_H - 0.002]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(CAN_R + 0.0005, 0.0022, 10, 72), tin); rim.rotation.x = Math.PI / 2; rim.position.y = y; body.add(rim); }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(CAN_R, 48), tin); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.003; body.add(floor);
    const lid = new THREE.Group();
    const lidM = new THREE.Mesh(new THREE.CylinderGeometry(CAN_R + 0.003, CAN_R + 0.003, 0.01, 72), [new THREE.MeshStandardMaterial({ color: 0x9a9ea0, metalness: 0.9, roughness: 0.32 }), new THREE.MeshStandardMaterial({ map: paintLid(i), metalness: 0.5, roughness: 0.4, color: 0xc8c8c8 }), tin]);
    lidM.position.set(CAN_R, 0.005, 0); lidM.castShadow = true; lid.add(lidM);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(CAN_R * 0.82, 0.0022, 8, 64), new THREE.MeshBasicMaterial({ color: 0x8aff9a, transparent: true, opacity: 0.9, toneMapped: false }));
    glow.rotation.x = Math.PI / 2; glow.position.set(CAN_R, 0.0106, 0); lid.add(glow);
    lid.position.set(-CAN_R, CAN_H, 0); body.add(lid);
    // the tin turns to face the tray, pivots on its front edge to pour
    body.position.set(0, 0, -CAN_R); group.add(body);
    const face = Math.atan2(0 - x, 0.2 - z);
    group.rotation.y = face; group.position.set(x + Math.sin(face) * CAN_R, 0, z + Math.cos(face) * CAN_R);
    // turn the label's name back toward the operator
    side.rotation.y = -face; lidM.rotation.y = 0;
    this.scene.add(group);
    this.tins.push({ i, key: CANS[i].key, group, body, lid, glow, x, z, tip: 0, tipGoal: 0, lid0: 0, marbles: MARBLES.filter((m) => m.can === CANS[i].key).map((m) => m.key) });
  }

  // ================================================================== where the marbles go
  private traySlot(j: number, out: THREE.Vector3) { return out.set(-0.27 + (j + 0.5) * (0.54 / 8), 0.004 + R, 0.2); }
  private panSlot(side: number, j: number, out: THREE.Vector3) {
    const p = this.pans[side > 0 ? 1 : 0];
    const ring = j === 0 ? 0 : j <= 6 ? 1 : 2, idx = j === 0 ? 0 : j <= 6 ? j - 1 : j - 7;
    const a = ring === 1 ? idx * Math.PI / 3 : idx * Math.PI / 4 + 0.3, rr = ring === 0 ? 0 : ring === 1 ? R * 2.05 : R * 1.3;
    out.set(Math.cos(a) * rr, 0.004 + R + (ring === 2 ? R * 1.5 : 0) + (j >= 15 ? R * 1.5 : 0), Math.sin(a) * rr);
    return p.localToWorld(out);
  }
  private canMouth(tin: Tin, out: THREE.Vector3) { return tin.body.localToWorld(out.set(0, CAN_H * 0.6, 0)); }
  private goal(key: string, out: THREE.Vector3): THREE.Vector3 {
    const s = this.ms.get(key)!;
    switch (s.where) {
      case 'pan': { const side = s.m.kind === 'buff' ? -1 : 1; const list = [...this.onScale].filter((k) => MARBLE.get(k)!.kind === s.m.kind && this.ms.get(k)!.where === 'pan'); return this.panSlot(side, Math.max(0, list.indexOf(key)), out); }
      case 'tray': return this.traySlot(Math.max(0, this.tray.indexOf(key)), out);
      case 'stand': return out.copy(this.standP);
      default: return this.canMouth(this.tins.find((t) => t.key === s.m.can)!, out);
    }
  }
  private send(key: string, then: Where, dur = 0.5, arc = 0.1, land?: number) {
    const s = this.ms.get(key)!;
    s.where = 'fly';
    s.fly = { from: s.pos.clone(), to: () => { const prev = s.where; s.where = then; const g = this.goal(key, new THREE.Vector3()); s.where = prev; return g; }, t: 0, dur, arc, then, land };
  }
  private snapAll() {
    this.scene.updateMatrixWorld(true);
    for (const s of this.ms.values()) { this.goal(s.m.key, s.pos); s.last.copy(s.pos); s.v.group.position.copy(s.pos); s.v.group.visible = s.where !== 'can'; }
  }

  // ================================================================== acts
  /** tip a tin over the tray: the last lot goes back to its tin first */
  pour(i: number) {
    const tin = this.tins[i]; if (!tin) return;
    if (this.inspect) this.unInspect();
    if (this.poured === i) return;
    const prev = this.poured >= 0 ? this.tins[this.poured] : null;
    for (const k of this.tray) { const s = this.ms.get(k)!; if (s.where === 'tray') this.send(k, 'can', 0.55, 0.16); }
    if (prev) prev.tipGoal = 0;
    this.poured = i; this.tray = tin.marbles.filter((k) => !this.onScale.has(k));
    tin.tipGoal = 1;
    gameSound('can_open', 0.5, 1.1);
    setTimeout(() => gameSound('metal_clank', 0.3, 0.95), 250);
    setTimeout(() => gameSound('tithe_jingle', 0.35, 1.25), 520);
    this.tray.forEach((k, j) => {
      setTimeout(() => {
        const s = this.ms.get(k)!; if (s.where !== 'can' || this.poured !== i) return;
        this.canMouth(tin, s.pos); s.v.group.visible = true;
        this.send(k, 'tray', 0.45, 0.06, 0);
      }, 560 + j * 85);
    });
    setTimeout(() => { if (this.poured === i) tin.tipGoal = 0; }, 560 + this.tray.length * 85 + 250);
    markSeen(tin.marbles.filter((k) => marbleOwned(MARBLE.get(k)!)));
    for (const k of tin.marbles) this.fresh.delete(k);
    this.sel = 0;
  }
  private inspectKey(key: string) {
    const s = this.ms.get(key)!;
    if (this.inspect && this.inspect !== key) this.unInspect();
    this.inspect = key;
    if (s.where === 'pan') this.onScale.delete(key);
    this.send(key, 'stand', 0.55, 0.08);
    setTimeout(() => gameSound('glass_clink', 0.4, 0.9), 520);
    this.cardMat.map?.dispose(); this.cardMat.map = paintCard(s.m, marbleOwned(s.m)); this.cardMat.needsUpdate = true;
    uiSound('paper' as never, 0.3); gameSound('paper', 0.4);
    this.drawGrams();
  }
  private unInspect() {
    const k = this.inspect; if (!k) return;
    this.inspect = null;
    const s = this.ms.get(k)!;
    if (s.where === 'stand' || (s.where === 'fly' && s.fly?.then === 'stand')) this.send(k, this.tray.includes(k) ? 'tray' : 'can', 0.5, 0.08);
  }
  /** onto its pan (or off it), with the landing and the swing */
  put(key: string, on: boolean) {
    const s = this.ms.get(key)!;
    if (on && !marbleOwned(s.m)) { this.refuse(key); return; }
    if (this.inspect === key) this.inspect = null;
    if (on) { this.onScale.add(key); this.send(key, 'pan', 0.32, 0.03, s.m.kind === 'buff' ? -1 : 1); }
    else { this.onScale.delete(key); this.send(key, this.tray.includes(key) ? 'tray' : 'can', 0.5, 0.1); setTimeout(() => gameSound('glass_clink', 0.35, 1.2), 460); }
    this.drawGrams();
    if (balanced(this.onScale)) setLoadout([...this.onScale]);
  }
  private refuse(key: string) {
    const s = this.ms.get(key)!;
    uiSound('error', 0.5); gameSound('metal_clank', 0.2, 0.7);
    this.send(key, this.tray.includes(key) ? 'tray' : s.where === 'stand' ? 'stand' : 'can', 0.45, 0.12);
  }
  sealIt() {
    this.sealT = 0.3;
    if (this.inspect) this.unInspect();
    if (!balanced(this.onScale)) { this.jam = 1; uiSound('error', 0.8); setTimeout(() => uiSound('buzz', 0.5), 120); return; }
    setLoadout([...this.onScale]);
    uiSound('clamp', 0.8); gameSound('metal_clank', 0.35, 0.8);
    const keys = [...this.onScale];
    setTimeout(() => this.close(keys), 700);
  }
  private escape() {
    if (this.drag) return;
    if (this.inspect) { this.unInspect(); uiSound('back', 0.4); return; }
    this.close(null);
  }
  close(keys: string[] | null) {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (keys === null && balanced(this.onScale)) setLoadout([...this.onScale]);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.canvas.remove(); this.tag.remove(); this.back.remove();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose(); const mm = m.material as THREE.Material | THREE.Material[]; for (const q of Array.isArray(mm) ? mm : [mm]) { for (const v of Object.values(q)) if (v instanceof THREE.Texture) v.dispose(); q.dispose(); } } });
    for (const d of this.disposables) d.dispose();
    this.pmrem.dispose(); this.R.dispose(); this.R.forceContextLoss();
    if (!keys) uiSound('back', 0.5);
    this.o.onDone(keys);
  }

  // ================================================================== input
  private pick(x: number, y: number): { kind: 'marble' | 'tin' | 'seal' | 'none'; key?: string; i?: number } {
    const r = this.canvas.getBoundingClientRect();
    this.ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.cam);
    let best: { d: number; kind: 'marble' | 'tin' | 'seal'; key?: string; i?: number } | null = null;
    for (const s of this.ms.values()) {
      if (!s.v.group.visible || s.where === 'can' || s.where === 'fly') continue;
      const h = this.ray.ray.intersectSphere(new THREE.Sphere(s.pos, R * 1.25), this.v);
      if (h) { const d = h.distanceTo(this.ray.ray.origin); if (!best || d < best.d) best = { d, kind: 'marble', key: s.m.key }; }
    }
    if (best) return best;
    for (const t of this.tins) { const h = this.ray.intersectObject(t.group, true)[0]; if (h && (!best || h.distance < best.d)) best = { d: h.distance, kind: 'tin', i: t.i }; }
    const sh = this.ray.intersectObject(this.seal, true)[0]; if (sh && (!best || sh.distance < best.d)) best = { d: sh.distance, kind: 'seal' };
    return best ?? { kind: 'none' };
  }
  private onMove = (e: PointerEvent) => {
    if (this.drag) {
      const d = this.drag;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
        d.moved = true; const s = this.ms.get(d.key)!;
        if (this.inspect === d.key) this.inspect = null;
        if (s.where === 'pan') { this.onScale.delete(d.key); this.drawGrams(); this.angV += (s.m.kind === 'buff' ? 1 : -1) * s.m.weight * 0.05; }
        s.where = 'drag'; s.fly = null; s.vel.set(0, 0, 0); gameSound('glass_clink', 0.2, 1.4);
      }
      this.pick(e.clientX, e.clientY);
      this.tag.style.opacity = '0';
      return;
    }
    const p = this.pick(e.clientX, e.clientY);
    this.hover = p.kind === 'marble' ? p.key! : null; this.hoverTin = p.kind === 'tin' ? p.i! : -1;
    const name = this.hover ? (marbleOwned(MARBLE.get(this.hover)!) ? MARBLE.get(this.hover)!.name : '???') : this.hoverTin >= 0 ? CANS[this.hoverTin].label : p.kind === 'seal' ? 'Seal' : '';
    this.tag.textContent = name; this.tag.style.opacity = name ? '1' : '0';
    this.tag.style.left = e.clientX + 'px'; this.tag.style.top = (e.clientY - 18) + 'px';
    this.canvas.style.cursor = p.kind === 'none' ? 'default' : this.hover ? 'grab' : 'pointer';
  };
  private onDown = (e: PointerEvent) => {
    const p = this.pick(e.clientX, e.clientY);
    if (p.kind === 'marble') { this.drag = { key: p.key!, from: this.ms.get(p.key!)!.where, sx: e.clientX, sy: e.clientY, moved: false }; this.canvas.setPointerCapture?.(e.pointerId); this.canvas.style.cursor = 'grabbing'; }
    else if (p.kind === 'tin') this.pour(p.i!);
    else if (p.kind === 'seal') this.sealIt();
    else if (this.inspect) this.unInspect();
  };
  private onUp = () => {
    const d = this.drag; if (!d) return;
    this.drag = null;
    const s = this.ms.get(d.key)!;
    if (!d.moved) { if (this.inspect === d.key) this.put(d.key, !this.onScale.has(d.key)); else this.inspectKey(d.key); return; }
    // dropped: over its own pan it goes on; over the other pan it bounces off; anywhere else it goes home
    const overPan = this.pans.findIndex((p) => Math.hypot(s.pos.x - p.position.x, s.pos.z - p.position.z) < PAN_R * 1.25);
    const own = s.m.kind === 'buff' ? 0 : 1;
    if (overPan === own) this.put(d.key, true);
    else if (overPan >= 0) { s.where = 'tray'; this.refuse(d.key); }
    else { s.where = this.tray.includes(d.key) ? 'tray' : 'can'; this.send(d.key, s.where, 0.45, 0.06); setTimeout(() => gameSound('glass_clink', 0.3, 1.1), 420); this.drawGrams(); }
  };
  private onKey = (e: KeyboardEvent) => {
    const k = e.key;
    let used = true;
    if (k === 'Escape') this.escape();
    else if (k >= '1' && k <= '8') this.pour(Number(k) - 1);
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { if (this.tray.length) { this.sel = (this.sel + (k === 'ArrowLeft' ? -1 : 1) + this.tray.length) % this.tray.length; this.hover = this.tray[this.sel]; uiSound('tick', 0.3); } }
    else if (k === 'Enter' || k === ' ') { const key = this.inspect ?? this.hover; if (key) { if (this.inspect === key) this.put(key, !this.onScale.has(key)); else this.inspectKey(key); } }
    else if (k === 's' || k === 'S') this.sealIt();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  };
  private onResize = () => {
    const w = innerWidth, h = innerHeight;
    this.R.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  };
  private drawGrams() {
    const w = weigh([...this.onScale].filter((k) => this.ms.get(k)?.where !== 'drag'));
    this.grams.forEach((g, i) => { paintGrams(i === 0 ? w.buff : w.debuff, i === 0 ? 'buff' : 'debuff', g.c); g.t.needsUpdate = true; });
  }

  // ================================================================== frame
  private frame(dt: number) {
    this.t += dt; const t = this.t;
    const port = innerHeight > innerWidth * 1.05;
    // the camera: the whole bench, or close on the stand and its card
    const insp = !!this.inspect && !this.drag;
    const gp = insp ? (port ? [0.45, 0.4, 0.66] : [0.45, 0.22, 0.5]) : (port ? [0, 1.25, 1.35] : [0, 0.7, 0.92]);
    const gl = insp ? [0.45, 0.075, 0.2] : [0, 0.07, -0.06];
    const k = 1 - Math.exp(-dt * 4);
    this.camP.lerp(this.v.set(gp[0], gp[1], gp[2]), k); this.camL.lerp(new THREE.Vector3(gl[0], gl[1], gl[2]), k);
    this.camF += ((insp ? 34 : port ? 56 : 44) - this.camF) * k;
    this.cam.position.copy(this.camP); this.cam.lookAt(this.camL); this.cam.fov = this.camF; this.cam.updateProjectionMatrix();
    this.cardShown += ((this.inspect ? 1 : 0) - this.cardShown) * Math.min(1, dt * 8);
    this.cardMat.opacity = this.cardShown; this.card.visible = this.cardShown > 0.02;
    // the tins: the lid flips, the tin tips toward the tray and pours, then rights itself; fresh ones glow
    for (const tin of this.tins) {
      tin.tip += (tin.tipGoal - tin.tip) * Math.min(1, dt * 5);
      tin.lid0 += ((tin.tipGoal > 0 || tin.tip > 0.05 ? 1 : 0) - tin.lid0) * Math.min(1, dt * 9);
      tin.body.rotation.x = tin.tip * 1.75;
      tin.lid.rotation.z = tin.lid0 * 2.4;
      const fresh = tin.marbles.some((m) => this.fresh.has(m));
      tin.glow.visible = fresh; (tin.glow.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 3 + tin.i) * 0.35;
      const hov = this.hoverTin === tin.i;
      tin.group.position.y = THREE.MathUtils.lerp(tin.group.position.y, hov && tin.tip < 0.05 ? 0.006 : 0, Math.min(1, dt * 10));
    }
    // the beam: torque from the grams against its own low centre of mass, inertia with the load, hard stops that knock
    const w = weigh([...this.onScale].filter((kk) => this.ms.get(kk)!.where === 'pan'));
    const inertia = 1 + 0.06 * (w.buff + w.debuff);
    for (let n = 0, h = dt / 3; n < 3; n++) {
      const torque = (w.debuff - w.buff) * Math.cos(this.ang) - 29 * Math.sin(this.ang) - 3 * this.angV;
      this.angV += (torque / inertia) * h * 3; this.ang += this.angV * h;
      if (Math.abs(this.ang) > 0.24) { this.ang = Math.sign(this.ang) * 0.24; if (Math.abs(this.angV) > 0.25) gameSound('metal_clank', Math.min(0.3, Math.abs(this.angV) * 0.2), 1.3); this.angV *= -0.25; }
    }
    this.jam = Math.max(0, this.jam - dt);
    const shiver = this.jam > 0 ? Math.sin(t * 70) * 0.015 * this.jam : 0;
    this.beam.rotation.z = -this.ang + shiver; this.needle.rotation.z = (-this.ang + shiver) * 2.2;
    this.beam.updateMatrixWorld(true);
    for (const p of this.pans) { const s = p.userData.side as number; this.v.set(s * BEAM, 0, 0).applyMatrix4(this.beam.matrixWorld); p.position.set(this.v.x, this.v.y - HANG, this.v.z); p.rotation.z = this.angV * 0.03; }
    const ok = balanced(this.onScale);
    this.sealT = Math.max(0, this.sealT - dt); this.sealCap.position.y = 0.047 - (this.sealT > 0 ? 0.007 : 0);
    this.sealLamp.emissive.setHex(ok ? 0x2aff4a : 0xff3a1a); this.sealLamp.emissiveIntensity = ok ? 2 : (Math.sin(t * 6) > 0 ? 2 : 0.3);
    this.scene.updateMatrixWorld(true);
    // the marbles
    let glintAt: THREE.Vector3 | null = null;
    for (const s of this.ms.values()) {
      const key = s.m.key;
      if (s.where === 'drag') {
        // follows the pointer on a plane above the bench, a spring with weight (heavier marbles lag more)
        const hit = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y), this.v);
        if (hit) { hit.x = THREE.MathUtils.clamp(hit.x, -0.9, 0.9); hit.z = THREE.MathUtils.clamp(hit.z, -0.4, 0.38); const kk = 160 / (1 + s.m.weight * 0.25); s.vel.addScaledVector(hit.sub(s.pos), kk * dt).multiplyScalar(Math.exp(-dt * 14)); s.pos.addScaledVector(s.vel, dt); }
        const over = this.pans.find((p) => Math.hypot(s.pos.x - p.position.x, s.pos.z - p.position.z) < PAN_R * 1.25);
        if (over) glintAt = over.position;
      } else if (s.fly) {
        const f = s.fly; f.t += dt / f.dur;
        const u = Math.min(1, f.t), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, to = f.to();
        s.pos.lerpVectors(f.from, to, e); s.pos.y += Math.sin(u * Math.PI) * f.arc;
        if (u >= 1) {
          s.where = f.then; s.fly = null;
          if (f.then === 'can') s.v.group.visible = false;
          if (f.land !== undefined) { s.hop = 0; gameSound('glass_clink', 0.5, 0.95 + Math.random() * 0.1); if (f.land) { this.angV += -f.land * s.m.weight * 0.08; gameSound('metal_clank', 0.12, 1.8); } }
        }
      } else if (s.where !== 'can') {
        this.goal(key, this.v); s.pos.lerp(this.v, 1 - Math.exp(-dt * 20));
      }
      if (s.hop >= 0) {
        const h0 = s.hop; s.hop += dt;
        s.pos.y += Math.abs(Math.sin(s.hop * Math.PI * 2.6)) * Math.exp(-s.hop * 6) * 0.025;
        for (const a0 of [0.385, 0.77]) if (h0 < a0 && s.hop >= a0) gameSound('glass_clink', a0 < 0.5 ? 0.28 : 0.14, 1.15 + a0 * 0.3);
        if (s.hop > 1.2) s.hop = -1;
      }
      // hover: a lift and a glint
      const hov = this.hover === key && !this.drag;
      s.lift += ((hov ? 0.012 : 0) - s.lift) * Math.min(1, dt * 12);
      if (hov) glintAt = s.pos;
      // rolling as it moves, a slow turn on the stand
      const d = this.v.subVectors(s.pos, s.last), len = d.length();
      if (len > 1e-5) { const ax = new THREE.Vector3(d.z, 0, -d.x).normalize(); if (ax.lengthSq() > 0.5) { this.q.setFromAxisAngle(ax, len / R); s.v.group.quaternion.premultiply(this.q); } }
      if (s.where === 'stand') { this.q.setFromAxisAngle(this.v.set(0, 1, 0), dt * 0.6); s.v.group.quaternion.premultiply(this.q); }
      s.last.copy(s.pos);
      s.v.group.position.copy(s.pos); s.v.group.position.y += s.lift;
      s.v.update(t, dt, 0);
      s.v.setLocked(!marbleOwned(s.m));
      // its caustic on the wood, the felt or the pan, thrown away from the lamp
      const rest = s.where === 'tray' || s.where === 'pan' || s.where === 'stand';
      s.v.caustic.visible = rest && s.v.group.visible;
      if (s.v.caustic.visible) {
        const away = this.v.set(s.pos.x - this.lamp.position.x, 0, s.pos.z - this.lamp.position.z).normalize();
        s.v.caustic.position.set(s.pos.x + away.x * R * 1.6, s.pos.y - R + 0.0015, s.pos.z + away.z * R * 1.6);
      }
    }
    if (glintAt) { this.glint.visible = true; this.glint.position.copy(glintAt).add(new THREE.Vector3(-0.006, 0.012, 0.006)); this.glint.material.rotation = t * 1.5; this.glint.scale.setScalar(0.03 + Math.sin(t * 8) * 0.006); } else this.glint.visible = false;
    this.R.render(this.scene, this.cam);
  }
  /** dev / screenshots: every marble to its place now */
  settle() {
    for (const s of this.ms.values()) { if (s.fly) { s.where = s.fly.then; s.fly = null; if (s.where === 'can') s.v.group.visible = false; } s.hop = -1; }
    for (const tin of this.tins) { tin.tip = tin.tipGoal; tin.lid0 = tin.tipGoal > 0 ? 1 : 0; }
    this.snapAll();
    this.cardShown = this.inspect ? 1 : 0;
  }
}

function glintTex(): THREE.Texture {
  const S = 64, c = cv(S, S), x = c.getContext('2d')!;
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,250,230,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(S / 2 - 0.8, 2, 1.6, S - 4); x.fillRect(2, S / 2 - 0.8, S - 4, 1.6);
  return tex(c);
}
