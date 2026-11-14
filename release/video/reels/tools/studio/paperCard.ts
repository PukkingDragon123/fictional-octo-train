// The Institute's card, round 17c: heavy off-white card stock, a fine guilloche printed under everything,
// a soft crease across it (the card is bent a little along it), the Institute's lockup printed clean,
// "JOIN THE INSTITUTE" and the link in dark green ink; and off a green foil chip printed on it, a phosphor
// green hologram of the lockup hovering over the paper, with scanlines and a sweep of light.
// Drawn by the game's renderer (world materials), so it sits in the level's light.
//
//   const card = paperCard(link)   card.root (portrait, 0.055 x 0.09 m, face +z)   card.update(t, dt, on)
import * as THREE from 'three';
import { worldMaterial } from '/src/gfx/materials';
import { atlas } from '/src/gfx/atlas';

const W = 0.055, H = 0.09, T = 0.0007;
const TW = 560, TH = Math.round(TW * H / W);
/** the crease, as a fraction of the height from the top */
const CREASE = 0.56;
export const GREEN = 'rgb(110,255,160)';

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** a world material carrying our own texture (the world shader reads it through an atlas rect: the whole texture) */
export function texMat(tex: THREE.Texture, o: { additive?: boolean; unlit?: boolean } = {}): THREE.Material {
  const base = worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: o.unlit, additive: o.additive, outline: o.additive ? 0 : 1 } as never) as THREE.MeshLambertMaterial;
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  m.customProgramCacheKey = base.customProgramCacheKey;
  m.map = tex;
  if (o.additive) { m.transparent = true; m.blending = THREE.AdditiveBlending; m.depthWrite = false; }
  return m;
}
/** our own textures map whole (rect 0,0,1,1); plain parts sample the world atlas' white tile, tinted */
export function attrs(geo: THREE.BufferGeometry, col: number | [number, number, number] = 1, plain = false) {
  const n = geo.attributes.position.count;
  const c3 = typeof col === 'number' ? [col, col, col] : col;
  const cc = new Float32Array(n * 3); for (let i = 0; i < n; i++) cc.set(c3, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  let rect = [0, 0, 1, 1];
  if (plain) { const w = atlas().get('white') as { u0: number; v0: number; du: number; dv: number }; rect = [w.u0, w.v0, w.du, w.dv]; }
  const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set(rect, i * 4);
  geo.setAttribute('aAtlas', new THREE.BufferAttribute(a, 4));
  geo.setAttribute('aHd', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  geo.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
export function canvasTex(c: HTMLCanvasElement) { const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

/** the lockup made into green light once: its brightness kept, its colour turned phosphor green */
export function greenLight(img: HTMLImageElement, rgb = '110,255,160'): HTMLCanvasElement {
  const t = document.createElement('canvas'); t.width = img.width; t.height = img.height;
  const x = t.getContext('2d')!; x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, t.width, t.height);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgb(${rgb})`; x.fillRect(0, 0, t.width, t.height);
  x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5; x.drawImage(t, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
  return t;
}

function paperCanvas(link: string, logo: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const x = c.getContext('2d')!;
  // card stock: warm off-white, fibres, a faint tooth
  const img = x.createImageData(TW, TH), d = img.data, r = rng(7);
  for (let y = 0; y < TH; y++) for (let xx = 0; xx < TW; xx++) {
    const i = (y * TW + xx) * 4, n = (r() - 0.5) * 7;
    const ex = Math.min(xx, TW - 1 - xx) / TW, ey = Math.min(y, TH - 1 - y) / TH, vig = Math.max(0, 0.06 - Math.min(ex, ey)) * 1.6;
    d[i] = 242 + n - vig * 60; d[i + 1] = 238 + n - vig * 64; d[i + 2] = 227 + n - vig * 75; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.lineCap = 'round';
  for (let k = 0; k < 260; k++) {
    const sx = r() * TW, sy = r() * TH, a = r() * Math.PI, l = 3 + r() * 10;
    x.strokeStyle = `rgba(${r() < 0.5 ? '170,160,140' : '255,255,250'},${0.12 + r() * 0.15})`; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * l * 0.5 + 1, sy + Math.sin(a) * l * 0.5, sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
  }
  // the guilloche: fine interlaced waves in a pale green ink, under everything (the fine print)
  x.lineWidth = 0.7;
  for (let k = 0; k < 26; k++) {
    x.strokeStyle = `rgba(60,150,100,${0.1 + (k % 3) * 0.03})`;
    x.beginPath();
    for (let xx = 30; xx <= TW - 30; xx += 3) {
      const y = 70 + k * 30 + Math.sin(xx * 0.045 + k * 0.7) * 11 + Math.sin(xx * 0.013 + k) * 6;
      xx === 30 ? x.moveTo(xx, y) : x.lineTo(xx, y);
    }
    x.stroke();
  }
  // a printed border: a hairline inside a heavier rule
  x.strokeStyle = 'rgba(20,70,45,.85)'; x.lineWidth = 4; x.strokeRect(22, 22, TW - 44, TH - 44);
  x.strokeStyle = 'rgba(20,70,45,.55)'; x.lineWidth = 1.2; x.strokeRect(32, 32, TW - 64, TH - 64);
  // the emblem, printed at the head (ink sits in the paper: multiply)
  if (logo) {
    const lw = 128, lh = lw * logo.height / logo.width;
    x.globalCompositeOperation = 'multiply'; x.imageSmoothingEnabled = false;
    x.drawImage(logo, (TW - lw) / 2, 44, lw, lh);
    x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true;
  }
  // the foil chip the hologram is thrown from
  const fx0 = TW / 2 - 34, fy0 = TH * 0.505;
  const fg = x.createLinearGradient(fx0, fy0, fx0 + 68, fy0 + 30);
  fg.addColorStop(0, '#9ff2c0'); fg.addColorStop(0.45, '#e8fff0'); fg.addColorStop(0.55, '#5fd893'); fg.addColorStop(1, '#2f9a62');
  x.fillStyle = fg; x.fillRect(fx0, fy0, 68, 30);
  x.strokeStyle = 'rgba(20,70,45,.7)'; x.lineWidth = 1.5; x.strokeRect(fx0, fy0, 68, 30);
  for (let k = 0; k < 7; k++) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(fx0 + 6 + k * 9, fy0 + 4, 2, 22); }
  // the words, printed in dark green ink
  const print = (t: string, y: number, px: number, font: string, wt = '') => {
    x.font = `${wt} ${px}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    let s = px; while (x.measureText(t).width > TW - 120 && s > 12) { s -= 1; x.font = `${wt} ${s}px ${font}`; }
    x.fillStyle = '#123d28'; x.fillText(t, TW / 2, y);
  };
  x.fillStyle = 'rgba(20,70,45,.85)'; x.fillRect(70, TH * 0.66, TW - 140, 2);
  print('JOIN THE INSTITUTE', TH * 0.72, 44, 'Alagard, monospace');
  const bare = link.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const cut = bare.indexOf('/');
  const mono = '"IBM Plex Mono", monospace';
  if (cut > 0 && bare.length > 24) { print(bare.slice(0, cut), TH * 0.8, 33, mono, '600'); print(bare.slice(cut), TH * 0.85, 33, mono, '600'); }
  else print(bare, TH * 0.82, 33, mono, '600');
  // the crease: a soft valley line with light on one side, shade on the other
  const cy = TH * CREASE;
  const sh = x.createLinearGradient(0, cy - 26, 0, cy + 26);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,255,.28)'); sh.addColorStop(0.5, 'rgba(120,110,95,.38)'); sh.addColorStop(0.62, 'rgba(120,110,95,.12)'); sh.addColorStop(1, 'rgba(120,110,95,0)');
  x.fillStyle = sh; x.fillRect(0, cy - 26, TW, 52);
  return c;
}

/** images loaded once, when the studio starts (a still can be asked for before an onload would fire) */
const IMG: Record<string, HTMLImageElement> = {};
export function img(src: string): HTMLImageElement { if (!IMG[src]) { IMG[src] = new Image(); IMG[src].src = src; } return IMG[src]; }
const whenLoaded = (im: HTMLImageElement, fn: () => void) => { if (im.complete && im.naturalWidth) fn(); else im.addEventListener('load', fn, { once: true }); };
export { whenLoaded };
img('/brand/emblem-256.png'); img('/brand/lockup-stacked@4x.png'); img('/brand/lockup-horizontal@4x.png');

export interface PaperCard { root: THREE.Group; update(t: number, dt: number, on: number): void }

export function paperCard(link: string): PaperCard {
  const root = new THREE.Group();
  const pc = document.createElement('canvas'); pc.width = TW; pc.height = TH;
  const ptex = canvasTex(pc);
  const logo = img('/brand/lockup-stacked@4x.png'), emblem = img('/brand/emblem-256.png');
  let tint: HTMLCanvasElement | null = null;
  const repaint = (l: HTMLImageElement | null) => { const c = paperCanvas(link, l); pc.getContext('2d')!.drawImage(c, 0, 0); ptex.needsUpdate = true; };
  repaint(null);
  whenLoaded(emblem, () => repaint(emblem));
  whenLoaded(logo, () => { tint = greenLight(logo); });
  // two leaves of card, bent a few degrees along the crease (the top leaf tips back)
  const mat = texMat(ptex);
  const hTop = H * CREASE, hBot = H - hTop, bend = 0.11;
  const top = new THREE.Mesh(attrs(new THREE.PlaneGeometry(W, hTop)), mat);
  const geoB = new THREE.PlaneGeometry(W, hBot);
  // uv: the bottom leaf shows the lower part of the texture, the top leaf the upper part
  const fixUV = (g: THREE.PlaneGeometry, v0: number, v1: number) => { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0)); uv.needsUpdate = true; };
  fixUV(top.geometry as THREE.PlaneGeometry, 1 - CREASE, 1);
  fixUV(geoB, 0, 1 - CREASE);
  const bot = new THREE.Mesh(attrs(geoB), mat);
  const hinge = new THREE.Group(); hinge.position.set(0, H / 2 - hTop, T / 2); hinge.rotation.x = -bend; root.add(hinge);
  // the printed faces sit a hair in front of the stock (coplanar faces z-fight: the card flickered)
  const LIFT = 0.00035;
  top.position.set(0, hTop / 2, LIFT); hinge.add(top);
  bot.position.set(0, H / 2 - hTop - hBot / 2, T / 2 + LIFT); root.add(bot);
  // the stock's thickness and back, plain off-white
  const back = new THREE.Mesh(attrs(new THREE.BoxGeometry(W, hBot, T), [0.86, 0.84, 0.78], true), worldMaterial({ noVis: true, noFog: true, noGrid: true } as never));
  back.position.set(0, H / 2 - hTop - hBot / 2, 0); root.add(back);
  const backT = new THREE.Mesh(attrs(new THREE.BoxGeometry(W, hTop, T), [0.86, 0.84, 0.78], true), worldMaterial({ noVis: true, noFog: true, noGrid: true } as never));
  backT.position.set(0, hTop / 2, -T / 2); hinge.add(backT);
  // the hologram: the lockup in three thin green layers over the paper, scanned and swept
  const HP = 512, HS = W * 0.92;
  const hc = document.createElement('canvas'); hc.width = HP; hc.height = HP;
  const hx = hc.getContext('2d')!;
  const htex = canvasTex(hc);
  const layers: THREE.Mesh[] = [];
  const holoY = H * (0.5 - 0.34);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(attrs(new THREE.PlaneGeometry(HS, HS), [1, 0.42, 0.2][i]), texMat(htex, { additive: true, unlit: true }));
    m.position.set(0, holoY, T + 0.007 + i * 0.0045);
    m.scale.setScalar(1 + i * 0.025);
    root.add(m); layers.push(m);
  }
  const chipY = H * (0.5 - 0.52);
  const fy = HP / 2 + ((holoY - chipY) / HS) * HP;
  const paintHolo = (t: number, on: number) => {
    hx.clearRect(0, 0, HP, HP);
    if (!tint || on <= 0) return;
    const flick = on < 1 ? (Math.random() < 0.35 ? 0.25 : 1) * on : 0.88 + 0.12 * Math.sin(t * 37) * Math.sin(t * 13);
    const sw = HP * 0.8, sh = sw * tint.height / tint.width;
    const ox = (HP - sw) / 2, oy = (HP - sh) / 2 - 30;
    // the beam off the chip, a glow at its foot
    const top = oy + sh * 0.6, half = sw * 0.3;
    const glow = hx.createRadialGradient(HP / 2, fy, 0, HP / 2, fy, 40);
    glow.addColorStop(0, `rgba(170,255,200,${0.55 * flick})`); glow.addColorStop(1, 'rgba(110,255,160,0)');
    hx.fillStyle = glow; hx.fillRect(HP / 2 - 40, fy - 40, 80, 80);
    const fan = hx.createLinearGradient(0, fy, 0, top);
    fan.addColorStop(0, `rgba(110,255,160,${0.12 * flick})`); fan.addColorStop(1, 'rgba(110,255,160,0)');
    hx.fillStyle = fan; hx.beginPath(); hx.moveTo(HP / 2 - 12, fy); hx.lineTo(HP / 2 + 12, fy); hx.lineTo(HP / 2 + half, top); hx.lineTo(HP / 2 - half, top); hx.fill();
    hx.globalAlpha = flick; hx.imageSmoothingEnabled = false; hx.drawImage(tint, ox, oy, sw, sh);
    hx.globalCompositeOperation = 'lighter'; hx.globalAlpha = flick * 0.2; hx.drawImage(tint, ox + 1.5, oy, sw, sh);
    hx.globalCompositeOperation = 'source-over'; hx.globalAlpha = 1; hx.imageSmoothingEnabled = true;
    hx.fillStyle = 'rgba(0,0,0,.42)';
    for (let y = (t * 40) % 5; y < HP; y += 5) hx.fillRect(0, y, HP, 1.5);
    const sy = ((t * 0.45) % 1.4) * HP - 80;
    const g = hx.createLinearGradient(0, sy - 50, 0, sy + 50);
    g.addColorStop(0, 'rgba(180,255,210,0)'); g.addColorStop(0.5, 'rgba(220,255,230,.6)'); g.addColorStop(1, 'rgba(180,255,210,0)');
    hx.globalCompositeOperation = 'source-atop'; hx.fillStyle = g; hx.fillRect(0, sy - 50, HP, 100); hx.globalCompositeOperation = 'source-over';
    htex.needsUpdate = true;
  };
  return {
    root,
    update(t, _dt, on) {
      paintHolo(t, on);
      layers.forEach((m, i) => { m.visible = on > 0; m.position.x = Math.sin(t * 2.3 + i) * 0.0003 * i; });
    },
  };
}
