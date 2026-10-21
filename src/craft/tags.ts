// Printed things for the first-person close-ups: typewritten manila luggage
// tags on string, index cards, engraved brass and bakelite plates, embossed
// label tape, chalk slates, blueprint sheets, spring-scale dial faces, rubber
// stamps. Each is a canvas drawn with real type (src/ui/fonts.css: the worn
// typewriter, the enamel-sign condensed face, chalk handwriting...) on paper,
// brass or tape with fibre, grime and ink bleed, mapped onto a plane in the
// overlay scene. Never a box on screen: the text lives on the object.
import * as THREE from 'three';
import { fontsReady } from '../gfx/crt';
import { metalEnv } from './metal';

export type TagKind = 'tag' | 'card' | 'plate' | 'dymo' | 'slate' | 'blueprint' | 'bakelite';

/** canvas pixels per layout unit (layout units are the sizes callers pass) */
const S = 4;
const fontVar = (name: string, fb: string) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch { return fb; }
};
let FONTS: Record<string, string> | null = null;
function fonts() {
  if (!FONTS) FONTS = {
    type: fontVar('--font-type', "'Special Elite', 'Courier Prime', monospace"),
    typeset: fontVar('--font-typeset', "'Courier Prime', monospace"),
    sign: fontVar('--font-sign', "'Oswald', 'Arial Narrow', sans-serif"),
    pen: fontVar('--font-pen', "'Caveat', cursive"),
    nixie: fontVar('--font-nixie', "'Nixie One', monospace"),
  };
  return FONTS;
}
const FACE: Record<TagKind, string> = { tag: 'type', card: 'type', plate: 'sign', bakelite: 'sign', dymo: 'sign', slate: 'pen', blueprint: 'typeset' };
export const inkFor = (k: TagKind) => (k === 'slate' ? '#ecebe2' : k === 'blueprint' ? '#e8f0ff' : k === 'dymo' ? '#f6f2ea' : k === 'plate' ? '#2a1c0c' : k === 'bakelite' ? '#e8dcc0' : '#25201b');

let seedN = 1;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) & 0x7fffffff; return seedN / 0x7fffffff; };

export interface PixTag {
  mesh: THREE.Mesh;
  kind: TagKind;
  /** layout size in units (canvas is S times larger) */
  w: number; h: number;
  ctx: CanvasRenderingContext2D;
  /** draw the stock again (paper, brass, tape...), then write on it */
  clear(): void;
  /** upload to the texture */
  flush(): void;
  /** one line of type at x, y (top), size in units; returns the x after it */
  type(s: string, x: number, y: number, ink?: string | number, size?: number, face?: string): number;
  /** wrapped text; returns lines used */
  para(s: string, x: number, y: number, w: number, ink?: string | number, lineH?: number, maxLines?: number, size?: number): number;
  line(x0: number, y0: number, x1: number, y1: number, ink: string | number, width?: number): void;
  frame(x: number, y: number, w: number, h: number, ink: string | number, width?: number): void;
}

const css = (c: string | number | undefined, k: TagKind) => (c === undefined ? inkFor(k) : typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

// tags drawn before the web fonts arrived are drawn again once they have
let fontsIn = false;
const early: { t: PixTag; ops: (() => void)[] }[] = [];
fontsReady().then(() => {
  fontsIn = true; FONTS = null;
  for (const e of early) { for (const op of e.ops) op(); e.t.flush(); }
  early.length = 0;
});

/** a printed sheet w x h layout units, `size` scene units wide */
export function pixTag(kind: TagKind, w: number, h: number, size: number): PixTag {
  const cv = document.createElement('canvas'); cv.width = w * S; cv.height = h * S;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: kind === 'plate' ? 0.38 : kind === 'dymo' ? 0.45 : kind === 'bakelite' ? 0.4 : 0.92, metalness: kind === 'plate' ? 0.45 : 0, envMap: kind === 'plate' || kind === 'dymo' || kind === 'bakelite' ? metalEnv() : null, envMapIntensity: 0.6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, (size * h) / w), mat);
  const seed = Math.floor(Math.random() * 1e6);
  const entry: { t: PixTag; ops: (() => void)[] } = { t: null as unknown as PixTag, ops: [] };
  const rec = (f: () => void) => { if (!fontsIn) entry.ops.push(f); f(); };
  const t: PixTag = {
    mesh, kind, w, h, ctx,
    clear() { entry.ops = []; rec(() => { seedN = seed; stock(ctx, kind, w, h); }); },
    flush() { tex.needsUpdate = true; },
    type(s, x, y, ink, size = 7, face) { let r = 0; rec(() => { r = typeLine(ctx, s, x, y, css(ink, kind), size, kind, face); }); return r; },
    para(s, x, y, wpx, ink, lineH = 9, maxLines = 99, size = 7) { let n = 0; rec(() => { n = typePara(ctx, s, x, y, wpx, css(ink, kind), lineH, maxLines, size, kind); }); return n; },
    line(x0, y0, x1, y1, ink, width = 1) { rec(() => { ctx.strokeStyle = css(ink, kind); ctx.lineWidth = width * S; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0 * S, y0 * S); ctx.lineTo(x1 * S, y1 * S); ctx.stroke(); }); },
    frame(x, y, fw, fh, ink, width = 1) { rec(() => { ctx.strokeStyle = css(ink, kind); ctx.lineWidth = width * S; ctx.strokeRect(x * S, y * S, fw * S, fh * S); }); },
  };
  entry.t = t;
  if (!fontsIn) early.push(entry);
  t.clear(); t.flush();
  return t;
}

// ---------------------------------------------------------------- stock: what the text is printed on
function speckle(ctx: CanvasRenderingContext2D, W: number, H: number, n: number, col: string, a: number, r = 1.2) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = a * (0.3 + rnd() * 0.7); ctx.fillRect(rnd() * W, rnd() * H, r * (0.5 + rnd()), r * (0.5 + rnd())); }
  ctx.globalAlpha = 1;
}
function fibres(ctx: CanvasRenderingContext2D, W: number, H: number, col: string, n: number) {
  ctx.strokeStyle = col; ctx.lineWidth = 0.7;
  for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = 3 + rnd() * 9; ctx.globalAlpha = 0.12 + rnd() * 0.18; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function stock(ctx: CanvasRenderingContext2D, kind: TagKind, w: number, h: number) {
  const W = w * S, H = h * S;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (kind === 'tag') {
    // manila luggage tag: clipped top corners, a reinforced eyelet, edge wear
    const c = 5 * S;
    ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(W - c, 0); ctx.lineTo(W, c); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.lineTo(0, c); ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#dcc690'); g.addColorStop(1, '#cdb47a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    fibres(ctx, W, H, '#8a6a3a', Math.round(W * H / 400));
    speckle(ctx, W, H, Math.round(W * H / 300), '#5a3e1e', 0.25);
    const eg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(70,45,15,0.35)');
    ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
    const ex = W / 2, ey = 4.5 * S;
    ctx.fillStyle = '#b89448'; ctx.beginPath(); ctx.arc(ex, ey, 3.2 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2c878'; ctx.beginPath(); ctx.arc(ex - 0.5 * S, ey - 0.5 * S, 2.6 * S, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(ex, ey, 1.5 * S, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'card' || kind === 'blueprint') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (kind === 'card') { g.addColorStop(0, '#f1ead6'); g.addColorStop(1, '#e2d7bb'); } else { g.addColorStop(0, '#2c4f92'); g.addColorStop(1, '#22427c'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (kind === 'card') {
      fibres(ctx, W, H, '#b8a888', Math.round(W * H / 500));
      ctx.strokeStyle = 'rgba(110,150,190,0.45)'; ctx.lineWidth = S * 0.35;
      for (let y = 14; y < h - 2; y += 9) { ctx.beginPath(); ctx.moveTo(2 * S, y * S); ctx.lineTo(W - 2 * S, y * S); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(200,90,90,0.5)'; ctx.beginPath(); ctx.moveTo(9 * S, 0); ctx.lineTo(9 * S, H); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(200,220,255,0.16)'; ctx.lineWidth = S * 0.3;
      for (let y = 4; y < h; y += 6) { ctx.beginPath(); ctx.moveTo(0, y * S); ctx.lineTo(W, y * S); ctx.stroke(); }
      for (let x = 4; x < w; x += 6) { ctx.beginPath(); ctx.moveTo(x * S, 0); ctx.lineTo(x * S, H); ctx.stroke(); }
      speckle(ctx, W, H, Math.round(W * H / 600), '#c8d8f8', 0.15);
    }
    // a pushpin
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(W / 2 + S, 4 * S, 2.4 * S, 0, Math.PI * 2); ctx.fill();
    const pg = ctx.createRadialGradient(W / 2 - S * 0.6, 2.6 * S, 0.3 * S, W / 2, 3 * S, 2.4 * S);
    pg.addColorStop(0, '#ff9a8a'); pg.addColorStop(1, '#a8241a');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(W / 2, 3 * S, 2.3 * S, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = S * 0.5; ctx.strokeRect(0, 0, W, H);
  } else if (kind === 'plate' || kind === 'bakelite') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    if (kind === 'plate') { g.addColorStop(0, '#d8b45a'); g.addColorStop(0.5, '#b08a38'); g.addColorStop(1, '#c8a048'); }
    else { g.addColorStop(0, '#4a2c1a'); g.addColorStop(1, '#2e1a10'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // brushed grain / bakelite swirl
    ctx.strokeStyle = kind === 'plate' ? 'rgba(255,240,200,0.12)' : 'rgba(120,70,40,0.18)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < H; i += 2) { ctx.beginPath(); ctx.moveTo(0, i + rnd() * 2); ctx.bezierCurveTo(W * 0.3, i + rnd() * 4 - 2, W * 0.7, i + rnd() * 4 - 2, W, i + rnd() * 2); ctx.stroke(); }
    speckle(ctx, W, H, Math.round(W * H / 220), kind === 'plate' ? '#5a4010' : '#140a04', 0.3);
    ctx.strokeStyle = kind === 'plate' ? '#6a5020' : '#1a0e06'; ctx.lineWidth = S * 0.8; ctx.strokeRect(S * 0.4, S * 0.4, W - S * 0.8, H - S * 0.8);
    ctx.strokeStyle = kind === 'plate' ? 'rgba(255,240,190,0.5)' : 'rgba(150,100,70,0.35)'; ctx.lineWidth = S * 0.4; ctx.strokeRect(S * 1.2, S * 1.2, W - S * 2.4, H - S * 2.4);
    for (const [x, y] of [[3, 3], [w - 3, 3], [3, h - 3], [w - 3, h - 3]]) {
      const sg = ctx.createRadialGradient(x * S - S * 0.4, y * S - S * 0.4, 0.2 * S, x * S, y * S, 1.6 * S);
      sg.addColorStop(0, '#f0e8d0'); sg.addColorStop(1, '#5a5040');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x * S, y * S, 1.5 * S, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a3020'; ctx.lineWidth = S * 0.3; ctx.beginPath(); ctx.moveTo((x - 1) * S, y * S); ctx.lineTo((x + 1) * S, y * S); ctx.stroke();
    }
  } else if (kind === 'dymo') {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#c8342a'); g.addColorStop(0.5, '#a8241c'); g.addColorStop(1, '#801812');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, S * 0.5, W, S * 0.8);
    speckle(ctx, W, H, Math.round(W * H / 400), '#4a0a06', 0.25);
  } else if (kind === 'slate') {
    ctx.fillStyle = '#6e4a26'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(40,22,10,0.4)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < W; i += 3) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + rnd() * 3, H); ctx.stroke(); }
    const f = 3 * S;
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2e3430'); g.addColorStop(1, '#232825');
    ctx.fillStyle = g; ctx.fillRect(f, f, W - 2 * f, H - 2 * f);
    // ghosts of old chalk
    ctx.fillStyle = 'rgba(220,220,210,0.05)';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(f + rnd() * (W - 2 * f), f + rnd() * (H - 2 * f), 10 + rnd() * 30, 3 + rnd() * 8, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- type
function typeLine(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, ink: string, size: number, kind: TagKind, face?: string): number {
  const f = fonts();
  const fam = f[face || FACE[kind]] || f.type;
  const px = size * S;
  ctx.save();
  ctx.font = `${kind === 'dymo' || kind === 'plate' || kind === 'bakelite' ? '600 ' : ''}${px}px ${fam}`;
  ctx.textBaseline = 'top';
  let cx = x * S;
  const typed = kind === 'tag' || kind === 'card' || (kind === 'blueprint' && !face);
  const raised = kind === 'dymo', engraved = kind === 'plate' || kind === 'bakelite', chalk = kind === 'slate';
  const text = kind === 'dymo' || engraved ? str.toUpperCase() : str;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    if (ch !== ' ') {
      const jy = typed ? (rnd() - 0.5) * px * 0.08 : 0, rot = typed ? (rnd() - 0.5) * 0.05 : chalk ? (rnd() - 0.5) * 0.06 : 0;
      ctx.save();
      ctx.translate(cx + w / 2, y * S + jy + px / 2); ctx.rotate(rot); ctx.translate(-w / 2, -px / 2);
      if (raised) { ctx.fillStyle = 'rgba(60,8,6,0.85)'; ctx.fillText(ch, S * 0.35, S * 0.35); }
      if (engraved) { ctx.fillStyle = kind === 'plate' ? 'rgba(255,240,200,0.55)' : 'rgba(255,220,180,0.18)'; ctx.fillText(ch, S * 0.3, S * 0.3); }
      ctx.fillStyle = ink;
      ctx.globalAlpha = typed ? 0.72 + rnd() * 0.28 : chalk ? 0.82 : 1;
      if (typed) { ctx.shadowColor = ink; ctx.shadowBlur = S * 0.25; }
      ctx.fillText(ch, 0, 0);
      if (chalk) { ctx.globalAlpha = 0.35; ctx.fillText(ch, S * 0.25, -S * 0.15); }
      ctx.restore();
    }
    cx += w;
  }
  ctx.restore();
  return cx / S;
}

function typePara(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, w: number, ink: string, lineH: number, maxLines: number, size: number, kind: TagKind): number {
  const f = fonts();
  ctx.save();
  ctx.font = `${size * S}px ${f[FACE[kind]] || f.type}`;
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (ctx.measureText(test).width / S > w && line) { lines.push(line); line = wd; } else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines && out.length) out[out.length - 1] = out[out.length - 1].replace(/\s*\S*$/, '') + '…';
  out.forEach((l, i) => typeLine(ctx, l, x, y + i * lineH, ink, size, kind));
  return out.length;
}

/** free a tag's canvas texture, material and plane */
export function disposeTag(t: PixTag) {
  t.mesh.parent?.remove(t.mesh);
  const m = t.mesh.material as THREE.MeshStandardMaterial;
  m.map?.dispose(); m.dispose(); t.mesh.geometry.dispose();
}

/** a string from a tag's eyelet to whatever it is tied to */
export function tagString(color = 0x8a7a5a): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
export function setString(l: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
  const p = l.geometry.attributes.position as THREE.BufferAttribute;
  p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
  l.geometry.computeBoundingSphere();
}

/** a rubber stamp across a sheet ("READY", "NEED SAW"): condensed caps in a ruled box, a little crooked */
export function stamp(t: PixTag, s: string, x: number, y: number, col: string | number = '#c8281c') {
  const ink = typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : col;
  const ctx = t.ctx;
  const f = fonts();
  const draw = () => {
    ctx.save();
    ctx.font = `700 ${7 * S}px ${f.sign}`;
    const w = ctx.measureText(s.toUpperCase()).width;
    ctx.translate(x * S, y * S); ctx.rotate(-0.06);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = ink; ctx.lineWidth = S * 0.7;
    ctx.strokeRect(-S * 1.5, -S * 1.2, w + S * 3, 9.4 * S);
    ctx.fillStyle = ink; ctx.textBaseline = 'top';
    ctx.fillText(s.toUpperCase(), 0, 0);
    // patchy ink
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.3 + rnd() * 0.5; ctx.fillRect(rnd() * w, rnd() * 8 * S, S * 0.7, S * 0.7); }
    ctx.restore();
  };
  if (!fontsIn) early.find((q) => q.t === t)?.ops.push(draw);
  draw();
}

/** a spring-scale dial face: 0..max kg, red over the limit, and a PACE sub-dial */
export function dialFace(max: number): PixTag {
  const t = pixTag('card', 64, 64, 0.16);
  const ctx = t.ctx;
  const f = fonts();
  const draw = () => {
    const W = 64 * S, c = W / 2, R = W / 2;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    const rg = ctx.createLinearGradient(0, 0, W, W); rg.addColorStop(0, '#f0d080'); rg.addColorStop(0.5, '#9a7428'); rg.addColorStop(1, '#d8b058');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    const fg = ctx.createRadialGradient(c - R * 0.2, c - R * 0.3, R * 0.1, c, c, R * 0.9);
    fg.addColorStop(0, '#f6efdc'); fg.addColorStop(1, '#ddd2b4');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(c, c, R * 0.86, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * 0.75 + (i / 40) * Math.PI * 1.5;
      const big = i % 10 === 0, mid = i % 5 === 0;
      const r0 = R * (big ? 0.62 : mid ? 0.68 : 0.73);
      ctx.strokeStyle = i > 32 ? '#b8281c' : '#25201b'; ctx.lineWidth = S * (big ? 0.9 : 0.45);
      ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); ctx.lineTo(c + Math.cos(a) * R * 0.8, c + Math.sin(a) * R * 0.8); ctx.stroke();
    }
    ctx.fillStyle = '#25201b'; ctx.font = `600 ${7 * S}px ${f.sign}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const a = Math.PI * 0.75 + (i / 4) * Math.PI * 1.5; ctx.fillText(String(Math.round((max * i) / 4)), c + Math.cos(a) * R * 0.47, c + Math.sin(a) * R * 0.47); }
    ctx.font = `${6 * S}px ${f.type}`; ctx.fillStyle = '#5a4020'; ctx.fillText('KG', c, c + R * 0.18);
    // PACE sub-dial
    const sc = c + R * 0.5;
    ctx.strokeStyle = '#6a6050'; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.arc(c, sc, R * 0.2, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.font = `${4 * S}px ${f.sign}`; ctx.fillStyle = '#6a5a40'; ctx.fillText('PACE', c, sc + R * 0.1);
    ctx.fillStyle = '#b8281c'; ctx.beginPath(); ctx.arc(c - R * 0.2, sc, S * 0.8, 0, Math.PI * 2); ctx.fill();
    // glass glint
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(c - R * 0.3, c - R * 0.45, R * 0.35, R * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  draw();
  if (!fontsIn) early.push({ t, ops: [draw] });
  t.flush();
  return t;
}
