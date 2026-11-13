// THE CRT SKIN (round 17): the wrist terminal's tube as a reusable piece, for any screen that should look
// like an old monochrome monitor (the band, the press, a terminal on a desk).
//
//   crtScreen(o)       a tube that fills its parent: phosphor green or amber (the other colour is the
//                      accent), scanlines, film grain, a vignette, a rolling bar, a flicker, and an SVG
//                      filter on the glass for the slight barrel bulge, the colour fringe and the bloom.
//                      Put the screen's own DOM in .glass. Transitions:
//                        powerOn(short?)   a bright line opens to the picture, the static settles
//                        powerOff()        the picture collapses to a line, then a dot
//                        swap(fn)          a static burst and a vertical roll; fn() runs while the static hides it
//                        burst(k, secs)    static only
//                      setPhos('green' | 'amber'), setBright(0.7..1.2), dispose()
//   crtIcon(kind, size) a big 3D model (src/ui/machine/decor.ts) turning slowly on its turntable, toned to the
//                      phosphor, lifting and turning quicker while hot; its name shows only while hot
//
// The CSS custom properties on .crt (inherited by everything in the glass) are the palette for a screen's own
// parts: --ph (the phosphor), --ph-hi, --ph-dim, --ph-dark, --ph-rgb (r, g, b), --acc and --acc-dim (the
// accent), --glow, and --mono (a CSS filter that tones any picture, a page or a canvas, to the phosphor).
// Sounds are recorded samples (src/ui/menus/sfx.ts). Square everywhere; Alagard.
import './crt.css';
import { sfx } from '../menus/sfx';
import { mxOk } from '../machine/core';
import { mxIconSpin, type IconKind } from '../machine/decor';

export type Phos = 'green' | 'amber';
export interface CrtOpts { phos?: Phos; bright?: number; /** the bulge / fringe / bloom filter (default on) */ bulge?: boolean; /** power and static sounds (default on) */ sound?: boolean }
export interface Crt {
  readonly el: HTMLElement;
  readonly glass: HTMLElement;
  powerOn(short?: boolean): Promise<void>;
  powerOff(): Promise<void>;
  swap(fn: () => void): Promise<void>;
  burst(k?: number, secs?: number): void;
  setPhos(p: Phos): void;
  setBright(v: number): void;
  dispose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '') => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body.classList.contains('reduce-flash');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function crtScreen(o: CrtOpts = {}): Crt {
  const root = el('div', 'crt');
  const tube = el('div', 'crt-tube');
  const glass = el('div', 'crt-glass');
  const fx = el('canvas', 'crt-fx');
  const grain = el('i', 'crt-grain');
  grain.style.backgroundImage = `url(${grainUrl()})`;
  tube.append(glass, el('i', 'crt-scan'), el('i', 'crt-roll'), grain, fx, el('i', 'crt-vig'), el('i', 'crt-flash'));
  root.append(tube);
  const sound = o.sound !== false;
  // the static: its own frames, only while a burst runs (on the clock, so a slow frame never leaves it stuck)
  let fxEnd = 0, fxDur = 1, fxK = 0, raf = 0, dead = false;
  const fxFrame = () => {
    raf = 0;
    if (dead) return;
    const c = fx.getContext('2d')!;
    const left = (fxEnd - performance.now()) / 1000;
    if (left <= 0) { c.clearRect(0, 0, fx.width, fx.height); return; }
    const w = fx.width, h = fx.height, im = c.createImageData(w, h), d = im.data;
    const a = Math.min(1, fxK * Math.min(1, (left / fxDur) * 2.2)) * 255;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = Math.random() < 0.85 ? a : 0; }
    c.putImageData(im, 0, 0);
    c.fillStyle = `rgba(255,255,255,${(0.5 * a / 255).toFixed(2)})`;
    for (let k = 0; k < 3; k++) c.fillRect(0, Math.floor(Math.random() * h), w, 1);
    raf = requestAnimationFrame(fxFrame);
  };
  const burst = (k = 0.8, secs = 0.35) => {
    if (reduce() || dead) return;
    fxK = k; fxDur = secs; fxEnd = performance.now() + secs * 1000;
    if (!raf) raf = requestAnimationFrame(fxFrame);
  };
  // the bulge / fringe / bloom filter, sized to the tube's own layout size
  const fit = () => {
    const w = root.offsetWidth, h = root.offsetHeight;
    if (w < 8 || h < 8) return;
    fx.width = Math.ceil(w / 3); fx.height = Math.ceil(h / 3);
    if (o.bulge !== false) glass.style.filter = `url(#${crtFilter(Math.ceil(w), Math.ceil(h))})`;
  };
  let ro: ResizeObserver | null = null;
  try { ro = new ResizeObserver(() => fit()); ro.observe(root); } catch { /* old browser: no filter */ }
  const api: Crt = {
    el: root, glass,
    async powerOn(short = false) {
      fit();
      tube.classList.remove('dot', 'rolling');
      void tube.offsetWidth;
      tube.classList.add('lit');
      tube.classList.toggle('quick', short);
      burst(short ? 0.45 : 0.85, short ? 0.35 : 0.7);
      if (sound) sfx('boot', short ? 0.3 : 0.5);
      await wait(reduce() ? 0 : short ? 260 : 520);
    },
    async powerOff() {
      tube.classList.remove('lit', 'rolling');
      tube.classList.add('dot');
      await wait(reduce() ? 0 : 280);
    },
    async swap(fn) {
      if (sound) { sfx('relay', 0.45); sfx('hiss', 0.25); }
      burst(0.9, 0.32);
      tube.classList.remove('rolling');
      void tube.offsetWidth;
      if (!reduce()) tube.classList.add('rolling');
      await wait(reduce() ? 0 : 110);
      fn();
      await wait(reduce() ? 0 : 270);
      tube.classList.remove('rolling');
    },
    burst,
    setPhos(p) { root.classList.toggle('amb', p === 'amber'); },
    setBright(v) { tube.style.setProperty('--crt-b', String(v)); },
    dispose() { dead = true; ro?.disconnect(); if (raf) cancelAnimationFrame(raf); root.remove(); },
  };
  api.setPhos(o.phos ?? 'green');
  api.setBright(o.bright ?? 1);
  return api;
}

// ---------------------------------------------------------------- big 3D icons
export interface CrtIcon { readonly el: HTMLElement; hot(on: boolean): void; wake(): void }
/**
 * a big 3D model turning slowly (quicker and lifted while hot), toned to the phosphor; `name` shows under it
 * only while it is hot, `num` (a key number) always. Size is the model's box (the canvas is 8 px larger).
 */
export function crtIcon(kind: IconKind, size = 70, o: { name?: string; num?: string | number } = {}): CrtIcon {
  const box = el('span', 'crt-ic');
  const well = el('span', 'crt-ic-m');
  const spin = mxOk() ? mxIconSpin(kind, size) : null;
  if (spin) { spin.cv.style.width = spin.cv.style.height = size + 8 + 'px'; well.append(spin.cv); }
  else { const b = el('b'); b.textContent = (o.name ?? kind).slice(0, 2).toUpperCase(); b.style.width = b.style.height = size + 'px'; well.append(b); }
  box.append(well);
  if (o.name || o.num !== undefined) {
    const l = el('span', 'crt-ic-l');
    if (o.num !== undefined) { const i = el('i'); i.textContent = String(o.num); l.append(i); }
    if (o.name) { const n = el('em'); n.textContent = o.name.toUpperCase(); l.append(n); }
    box.append(l);
  }
  return { el: box, hot: (on) => { box.classList.toggle('hot', on); spin?.hot(on); }, wake: () => spin?.wake() };
}

// ---------------------------------------------------------------- film grain (one tile, shifted about by CSS)
let grain = '';
function grainUrl(): string {
  if (grain) return grain;
  const cv = document.createElement('canvas'); cv.width = cv.height = 160;
  const c = cv.getContext('2d')!, im = c.createImageData(160, 160), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = Math.random() < 0.6 ? 255 : 0; }
  c.putImageData(im, 0, 0);
  return (grain = cv.toDataURL());
}

// ---------------------------------------------------------------- the glass's SVG filter: bulge, fringe, bloom
const filters = new Set<string>();
function crtFilter(w: number, h: number): string {
  const id = `crt-f-${w}x${h}`;
  if (filters.has(id)) return id;
  filters.add(id);
  // a displacement map: each pixel samples a little further out the further it is from the centre (a slight barrel)
  const S = 44, k = 0.034;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!, im = c.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1, r2 = nx * nx + ny * ny;
    const i = (y * w + x) * 4;
    d[i] = Math.max(0, Math.min(255, Math.round(127.5 + ((nx * k * r2 * (w / 2)) / S) * 255)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(127.5 + ((ny * k * r2 * (h / 2)) / S) * 255)));
    d[i + 2] = 128; d[i + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">
    <feImage href="${cv.toDataURL()}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${S}" xChannelSelector="R" yChannelSelector="G" result="bent"/>
    <feColorMatrix in="bent" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feOffset in="r" dx="1.4" dy="0" result="r2"/>
    <feColorMatrix in="bent" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>
    <feOffset in="gb" dx="-0.6" dy="0" result="gb2"/>
    <feComposite in="r2" in2="gb2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="split"/>
    <feGaussianBlur in="split" stdDeviation="3.2" result="blur"/>
    <feComposite in="split" in2="blur" operator="arithmetic" k1="0" k2="1" k3="0.65" k4="0"/>
  </filter>`;
  document.body.append(svg);
  return id;
}
