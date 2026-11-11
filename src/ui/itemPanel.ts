// THE ITEM PANEL (round 15). Right-click (or long-press, or the pad's X) an
// item in a pack slot, a hotbar socket or on the floor and a record card opens
// beside it: a riveted gunmetal plate in crisp high-resolution pixel art
// (src/ui/hiPixel.ts), chamfered, never rounded, Alagard type. It holds a large
// render of the item (from its 3D model), its name and kind, condition and wear,
// weight, value in scrip, what it is made of (matter), a description and a
// field note, the stats that matter for it (nutrition, damage, uses...), and its
// actions as bone-enamel keycaps with a status lamp: hover glow, a pressed
// state, a recorded click. "Inspect in hand" takes it up to the eyes (the
// first-person close-up, src/craft/inspect.ts). Esc, a click outside or the
// same right-click again closes it; arrows / Tab / Enter and the pad (d-pad, A,
// B) drive it.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Container } from '../items/container';
import { type Item, itemDef, itemName, itemWeight, freshness } from '../items/item';
import { size3 } from '../items/grid';
import { floorContainer } from '../items/worldItems';
import { itemMenuOptions } from '../interact/itemMenu';
import { opsForItem, pickTool, pickParts, toolLabel, partLabel, type HandOp } from '../craft/handOps';
import { hasUnlock, researchNode } from '../game/research';
import { itemMatter, MAT, type Mat } from '../game/economy/matter';
import { itemIcon, iconVariant } from './icons';
import { crispCanvas, bevel, rivet, rect, glass, hazard, drawBar, GUN, AMB, GRN, RED, dprK } from './hiPixel';
import { DETAIL } from '../items/detailModels';
import { itemValue } from '../game/debt/values';
import type { MenuOption } from './ui';

type Lamp = 'go' | 'warn' | 'stop' | 'off' | 'info';
interface Btn { el: HTMLButtonElement; run: () => void; off: boolean }
const BONE = [0x4a4438, 0x6e6654, 0x8f8770, 0xaba38a, 0xc4bca2, 0xd8d1b8, 0xe8e2cc, 0xf4efde];
const OFF = [0x2a2c2e, 0x3a3d40, 0x4c5054, 0x5e6368, 0x72777c, 0x878c90];
const hx = (c: number) => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------- keycap art (cached per size / state / lamp)
const artCache = new Map<string, string>();
function keyArt(w: number, h: number, state: 'up' | 'hover' | 'down', lamp: Lamp, off: boolean): string {
  const k = [w, h, state, lamp, off ? 1 : 0, dprK()].join(':');
  const hit = artCache.get(k);
  if (hit) return hit;
  const { cv, c } = crispCanvas(w, h);
  const down = state === 'down';
  const ramp = off ? OFF : state === 'hover' ? BONE.slice(2).concat([0xfff8e8]) : BONE.slice(1);
  rect(c, 2, 3, w - 2, h - 3, 0x000000, 0.5);
  if (!down) rect(c, 1, h - 4, w - 3, 3, off ? OFF[0] : BONE[0]);
  bevel(c, 1, down ? 3 : 1, w - 3, h - 5, ramp, { chamfer: 4, sunk: down });
  // a dished face: lit band high, shade low, enamel grain
  if (!down) { rect(c, 6, 3, w - 13, 1, 0xffffff, off ? 0.08 : 0.32); rect(c, 4, h - 10, w - 9, 2, off ? 0x000000 : BONE[2], 0.25); }
  let s = (w * 31 + h * 17) | 0;
  for (let i = 0; i < w * h * 0.04; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const x = 3 + (s % (w - 8)); s = (s * 1103515245 + 12345) & 0x7fffffff; rect(c, x, 3 + (s % Math.max(1, h - 9)), 1, 1, s & 1 ? 0xffffff : 0x000000, 0.08); }
  // the status lamp, set into the cap at the left
  const ly = Math.round((h - 5) / 2) - 3 + (down ? 2 : 0);
  rect(c, 6, ly, 8, 8, 0x0a0b0c);
  const R = lamp === 'go' ? GRN : lamp === 'warn' ? AMB : lamp === 'stop' ? RED : lamp === 'info' ? [0x041c24, 0x083a4a, 0x0e6278, 0x1a92aa, 0x3ec8da, 0x9cf0f8, 0xe4feff] : null;
  if (R) { rect(c, 7, ly + 1, 6, 6, R[2]); rect(c, 7, ly + 1, 6, 3, R[3]); rect(c, 8, ly + 2, 3, 2, R[5]); rect(c, 8, ly + 2, 1, 1, R[6]); }
  else { rect(c, 7, ly + 1, 6, 6, GUN[3]); rect(c, 8, ly + 2, 2, 1, GUN[5]); }
  // hover: an amber rim light along the lit lip
  if (state === 'hover') { rect(c, 6, 1, w - 13, 1, AMB[5], 0.9); rect(c, 1, 6, 1, h - 13, AMB[5], 0.6); }
  const url = cv.toDataURL();
  artCache.set(k, url);
  return url;
}

/** a point-of-interest reticle: amber corner brackets round a small dark chamfered plate */
function markArt(on: boolean): string {
  const N = 26;
  const { cv, c } = crispCanvas(N, N);
  rect(c, 7, 7, 12, 12, 0x000000, 0.45);
  bevel(c, 6, 6, 13, 13, on ? AMB.slice(1) : GUN.slice(1, 7), { chamfer: 2 });
  for (const [x, y, dx, dy] of [[1, 1, 1, 1], [N - 2, 1, -1, 1], [1, N - 2, 1, -1], [N - 2, N - 2, -1, -1]]) {
    rect(c, Math.min(x, x + dx * 5), y, 6, 2, 0x000000, 0.6); rect(c, x, Math.min(y, y + dy * 5), 2, 6, 0x000000, 0.6);
    rect(c, Math.min(x, x + dx * 4), y, 5, 1, on ? AMB[6] : AMB[4]); rect(c, x, Math.min(y, y + dy * 4), 1, 5, on ? AMB[6] : AMB[4]);
  }
  return cv.toDataURL();
}

// ---------------------------------------------------------------- styles
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.ipnl { position: fixed; z-index: 70; width: 360px; color: #e8e2cc; font-family: var(--font-new, 'Alagard', monospace); user-select: none; -webkit-user-select: none; pointer-events: auto; opacity: 0; transform: translateY(6px) scale(0.985); transition: opacity 0.12s, transform 0.12s; image-rendering: pixelated; }
.ipnl.on { opacity: 1; transform: none; }
.ipnl > canvas.ip-bg { position: absolute; left: 0; top: 0; pointer-events: none; }
.ipnl .ip-in { position: relative; padding: 32px 18px 18px 18px; }
.ipnl .ip-hd { position: absolute; left: 20px; top: 9px; right: 96px; font-size: 11px; letter-spacing: 0.16em; color: #f2ad32; text-transform: uppercase; white-space: nowrap; overflow: hidden; }
.ipnl .ip-x { position: absolute; right: 12px; top: 6px; width: 24px; height: 20px; border: 0; padding: 0; background: transparent center/100% 100% no-repeat; color: #25201b; font: inherit; font-size: 12px; cursor: pointer; }
.ipnl .ip-top { display: flex; gap: 12px; }
.ipnl .ip-well { position: relative; flex: 0 0 132px; height: 132px; display: flex; align-items: center; justify-content: center; }
.ipnl .ip-well img { width: 120px; height: 120px; image-rendering: pixelated; filter: drop-shadow(0 3px 0 rgba(0,0,0,0.55)); }
.ipnl .ip-well .ip-n { position: absolute; right: 6px; bottom: 4px; font-size: 13px; color: #ffd06a; }
.ipnl .ip-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ipnl .ip-name { font-size: 21px; line-height: 1.02; color: #f4efde; text-shadow: 0 2px 0 #07080a; }
.ipnl .ip-kind { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8d98a1; }
.ipnl .ip-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b4bec4; }
.ipnl .ip-row b { font-weight: normal; color: #f2ad32; min-width: 40px; font-size: 11px; letter-spacing: 0.1em; }
.ipnl .ip-row canvas { flex: 1; min-width: 0; }
.ipnl .ip-mat { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.ipnl .ip-mat span { font-size: 10px; padding: 1px 4px 0 10px; background: #121417; color: #b4bec4; position: relative; letter-spacing: 0.06em; }
.ipnl .ip-mat span i { position: absolute; left: 3px; top: 4px; width: 4px; height: 4px; }
.ipnl .ip-desc { margin-top: 10px; font-size: 13px; line-height: 1.25; color: #dde4e6; }
.ipnl .ip-lore { margin-top: 5px; font-size: 12px; line-height: 1.22; color: #ffd06a; opacity: 0.85; }
.ipnl .ip-stats { margin-top: 8px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px 8px; }
.ipnl .ip-stats div { font-size: 11px; color: #8d98a1; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; overflow: hidden; }
.ipnl .ip-stats div span { color: #f4efde; margin-left: 4px; text-transform: none; letter-spacing: 0; font-size: 13px; }
.ipnl .ip-keys { margin-top: 12px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
.ipnl .ip-key { position: relative; min-width: 0; overflow: hidden; height: 34px; border: 0; padding: 0 6px 3px 24px; background: transparent center/100% 100% no-repeat; color: #25201b; font: inherit; font-size: 14px; text-align: left; cursor: pointer; display: flex; flex-direction: column; justify-content: center; line-height: 1; outline: none; transition: filter 0.08s, transform 0.05s; }
.ipnl .ip-key span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ipnl .ip-key small { font-size: 10px; color: #6e3608; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ipnl .ip-key.wide { grid-column: span 2; }
.ipnl .ip-key.off { color: #9aa0a4; cursor: default; }
.ipnl .ip-key.off small { color: #c8301e; }
.ipnl .ip-key.hov, .ipnl .ip-key.foc { filter: drop-shadow(0 0 3px rgba(242,173,50,0.85)) drop-shadow(0 0 1px #ffd06a); }
.ipnl .ip-key.dn { transform: translateY(2px); padding-top: 2px; }
.ipnl .ip-key.foc::after { content: ''; position: absolute; inset: -3px; border: 2px solid transparent; border-image: linear-gradient(90deg, #ffd06a 0 6px, transparent 6px calc(100% - 6px), #ffd06a calc(100% - 6px)) 2; pointer-events: none; }
.ipnl .ip-hint { margin-top: 8px; font-size: 10px; letter-spacing: 0.1em; color: #566069; text-transform: uppercase; text-align: right; }
.ipnl.ip-dock { transform: none; transition: none; }
.ipnl .ip-poi { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; }
.ipnl .ip-pl { position: relative; font-size: 13px; color: #b4bec4; padding: 2px 4px 1px 26px; cursor: pointer; }
.ipnl .ip-pl i { position: absolute; left: 3px; top: 1px; width: 16px; height: 15px; font-style: normal; font-size: 11px; text-align: center; line-height: 16px; color: #25201b; background: ${hx(BONE[5])}; clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px); }
.ipnl .ip-pl:hover { color: #f4efde; }
.ipnl .ip-pl.on { color: #ffd06a; background: rgba(242,173,50,0.1); }
.ipnl .ip-pl.on i { background: #f2ad32; }
.ipnl .ip-note { margin-top: 6px; min-height: 46px; padding: 6px 8px 6px 8px; font-size: 12.5px; line-height: 1.25; color: #ffd06a; background: #0a0f0c; box-shadow: inset 0 2px 0 #000, inset 0 -1px 0 #566069; }
.ipnl .ip-note b { display: block; font-weight: normal; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #3ec8da; margin-bottom: 2px; }
.ip-mark { position: fixed; left: -13px; top: -13px; width: 26px; height: 26px; z-index: 66; cursor: pointer; background: var(--ip-mark) center/100% 100% no-repeat; image-rendering: pixelated; transition: opacity 0.15s; }
.ip-mark i { position: absolute; inset: 0; font-style: normal; font-family: var(--font-new, monospace); font-size: 12px; color: #ffd06a; text-align: center; line-height: 26px; text-shadow: 0 1px 0 #000; }
.ip-mark:hover, .ip-mark.on { background-image: var(--ip-mark-on); }
.ip-mark.on i, .ip-mark:hover i { color: #25201b; text-shadow: none; }
.ip-mark.back { opacity: 0.35; }
`;
  st.textContent += `:root { --ip-mark: url(${markArt(false)}); --ip-mark-on: url(${markArt(true)}); }`;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------- the panel
const TAP = 0.45;
class ItemPanel {
  private el: HTMLDivElement | null = null;
  private it: Item | null = null;
  private c: Container | null = null;
  private btns: Btn[] = [];
  private foc = -1;
  private raf = 0;
  private pad = { a: true, b: true, mv: 0, t: 0 };
  private closedUid = 0; private closedAt = 0;
  private listening = false;

  get open() { return !!this.el; }
  get item() { return this.it; }

  show(it: Item, c: Container | null, at: { x: number; y: number; w?: number; h?: number }, group: Item[] = [it]) {
    const p = G.local;
    if (!p) return;
    // the same right-click again (it just closed on the press): stay shut
    if (!this.el && this.closedUid === it.uid && performance.now() - this.closedAt < 380) return;
    if (this.el && this.it === it) { this.close(); return; }
    this.close(true);
    style();
    this.listen();
    this.it = it;
    const cont = c ?? floorContainer(G.zone, p.x, p.z, 2.2);
    this.c = cont;
    const el = document.createElement('div');
    el.className = 'ipnl';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.close(); });
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const W = Math.min(360, window.innerWidth - 16);
    el.style.width = W + 'px';
    el.innerHTML = this.html(it, group);
    document.body.appendChild(el);
    this.el = el;
    this.bars(it);
    this.keys(it, cont, group);
    // beside the slot: to its right if it fits, else to its left; kept on screen
    const H = el.offsetHeight;
    const ax = at.x + (at.w ?? 0), ay = at.y;
    let x = ax + 14;
    if (x + W > window.innerWidth - 8) x = at.x - W - 14;
    x = Math.max(8, Math.min(window.innerWidth - W - 8, x));
    const y = Math.max(8, Math.min(window.innerHeight - H - 8, ay - 40));
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    this.paint();
    requestAnimationFrame(() => el.classList.add('on'));
    G.audio?.ui?.('mn_open', 0.4);
    G.input && (G.input.pointerOverUI = true);
    this.pad = { a: true, b: true, mv: 0, t: 0 };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.tick());
  }

  close(quiet = false) {
    if (!this.el) return;
    if (this.it) { this.closedUid = this.it.uid; this.closedAt = performance.now(); }
    this.el.remove();
    this.el = null; this.it = null; this.c = null; this.btns = []; this.foc = -1;
    cancelAnimationFrame(this.raf);
    if (!quiet) G.audio?.ui?.('tc_clack_up', 0.3);
    if (G.input) G.input.pointerOverUI = !!G.ui?.inventory?.open;
  }

  // ------------------------------------------------ content
  private html(it: Item, group: Item[]): string {
    const d = itemDef(it.key);
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
    const sz = size3(it.key);
    const cat = (d.cat || 'misc') + (d.weapon ? ' · ' + d.weapon.kind : d.medical ? ' · ' + d.medical.type : d.food?.ingredient ? ' · ' + d.food.ingredient : '');
    const cid = 'CAT-' + (Math.abs([...it.key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)) % 9000 + 1000);
    const icon = itemIcon(it.key, iconVariant(it), Math.min(176, Math.round(120 * dprK())));
    let val = d.value ?? 0;
    try { val = itemValue(it); } catch { /* no economy */ }
    const mat = itemMatter(it);
    const mats = (Object.keys(mat) as Mat[]).filter((k) => (mat[k] ?? 0) > 0.005).sort((a, b) => (mat[b] ?? 0) - (mat[a] ?? 0)).slice(0, 4)
      .map((k) => `<span><i style="background:${MAT[k].color}"></i>${MAT[k].code} ${(mat[k] ?? 0).toFixed(2)}</span>`).join('');
    const stats = this.stats(it).map(([k, v]) => `<div>${esc(k)}<span>${esc(v)}</span></div>`).join('');
    const lore = DETAIL[it.key]?.poi?.[0];
    const loreText = lore ? (typeof lore.note === 'function' ? lore.note(it) : lore.note) : d.anomaly ? 'Anomalous. Logged for the archive.' : '';
    return `<canvas class="ip-bg"></canvas><div class="ip-hd">Item record · ${esc(cid)}</div><button class="ip-x" data-x title="Close (Esc)">X</button>
<div class="ip-in"><div class="ip-top"><div class="ip-well"><img src="${icon}" alt="">${group.length > 1 ? `<div class="ip-n">x${group.length}</div>` : ''}</div>
<div class="ip-id"><div class="ip-name">${esc(itemName(it))}</div><div class="ip-kind">${esc(cat)}</div>
<div class="ip-row"><b>MASS</b>${itemWeight(it).toFixed(2)} kg · ${sz[0]}x${sz[1]}x${sz[2]}</div>
<div class="ip-row" data-bar="cond"><b>COND</b><canvas></canvas></div>
${this.meter(it) ? `<div class="ip-row" data-bar="meter"><b>${this.meter(it)![0]}</b><canvas></canvas></div>` : ''}
<div class="ip-row"><b>VALUE</b>${val ? val + ' scrip' : 'no market'}</div>
<div class="ip-mat">${mats}</div></div></div>
${d.desc ? `<div class="ip-desc">${esc(d.desc)}</div>` : ''}${loreText ? `<div class="ip-lore">Field note: ${esc(loreText)}</div>` : ''}
${stats ? `<div class="ip-stats">${stats}</div>` : ''}
<div class="ip-keys"></div><div class="ip-hint">Arrows · Enter · Esc  /  Pad: A use · B close</div></div>`;
  }

  /** a second meter under condition: freshness, charge, fill, ammo */
  private meter(it: Item): [string, number, number[]] | null {
    const d = itemDef(it.key);
    if (it.fluid !== undefined && d.fluidCap) return ['FILL', Math.min(1, (it.fluid?.amount ?? 0) / d.fluidCap), [0x041c24, 0x083a4a, 0x0e6278, 0x1a92aa, 0x3ec8da, 0x9cf0f8, 0xe4feff]];
    if (d.food && (d.food.fresh || d.food.rot)) { const f = freshness(it); return ['FRESH', f === 'fresh' ? 0.9 : f === 'stale' ? 0.45 : f === 'rotten' ? 0.08 : 1, f === 'rotten' ? RED : f === 'stale' ? AMB : GRN]; }
    if (it.uses !== undefined && (d.uses || d.battery)) return [d.battery ? 'CHARGE' : 'USES', Math.max(0, Math.min(1, it.uses)), AMB];
    if (d.weapon?.mag) return ['AMMO', Math.min(1, (it.ammo ?? 0) / d.weapon.mag), AMB];
    return null;
  }

  private stats(it: Item): [string, string][] {
    const d = itemDef(it.key), o: [string, string][] = [];
    if (d.food) { o.push(['Food', '' + Math.round(d.food.hunger)]); if (d.food.thirst) o.push(['Drink', '' + Math.round(d.food.thirst)]); o.push(['Kcal', '' + Math.round(d.food.calories)]); if (d.food.raw) o.push(['Raw', 'cook it']); if (d.food.canned) o.push(['Sealed', 'opener']); }
    if (d.weapon) { const w = d.weapon; o.push(['Dmg', w.dmg[0] + '-' + w.dmg[1]], ['Speed', w.speed.toFixed(1)], ['Reach', w.range.toFixed(1)]); if (w.crit) o.push(['Crit', Math.round(w.crit * 100) + '%']); if (w.mag) o.push(['Mag', (it.ammo ?? 0) + '/' + w.mag]); if (w.twoHanded) o.push(['Hands', 'two']); }
    if (d.medical) { o.push(['Treat', d.medical.type]); if (d.medical.power) o.push(['Power', d.medical.power.toFixed(1)]); if (d.medical.sterile) o.push(['Sterile', 'yes']); }
    if (d.light) o.push(['Light', d.light.range + ' m'], ['Burn', d.light.drainPerHour ? Math.round(1 / d.light.drainPerHour) + ' h' : '-']);
    if (d.bag) o.push(['Holds', d.bag.capacity + ' kg'], ['Slot', d.bag.slot]);
    if (d.clothing) { const c = d.clothing; o.push(['Warm', Math.round(c.insulation * 100) + '%'], ['Bite', '' + c.bite], ['Scratch', '' + c.scratch]); }
    if (d.fluidCap) o.push(['Holds', d.fluidCap + ' L']);
    if (d.burn) o.push(['Fuel', d.burn + ' h']);
    if (d.durability) o.push(['Durab', '' + d.durability]);
    return o.slice(0, 9);
  }

  private bars(it: Item) {
    const el = this.el!;
    const d = itemDef(it.key);
    const put = (sel: string, frac: number, ramp: number[]) => {
      const row = el.querySelector(`[data-bar="${sel}"]`) as HTMLElement | null;
      const old = row?.querySelector('canvas');
      if (!row || !old) return;
      const w = Math.max(40, Math.round(old.getBoundingClientRect().width || 120)), h = 12;
      const { cv, c } = crispCanvas(w, h);
      drawBar(c, 1, 1, w - 2, h - 3, frac, { ramp, cell: 4, gap: 1 });
      old.replaceWith(cv);
      const pct = document.createElement('span'); pct.textContent = Math.round(frac * 100) + '%'; pct.style.minWidth = '30px'; pct.style.textAlign = 'right';
      row.appendChild(pct);
    };
    const worn = d.durability || d.weapon;
    put('cond', it.cond, it.cond > 0.6 ? GRN : it.cond > 0.3 ? AMB : RED);
    if (!worn) { const r = el.querySelector('[data-bar="cond"] b'); if (r) r.textContent = 'STATE'; }
    const m = this.meter(it);
    if (m) put('meter', m[1], m[2]);
  }

  // ------------------------------------------------ keys
  private keys(it: Item, c: Container, group: Item[]) {
    const p = G.local;
    const host = this.el!.querySelector('.ip-keys') as HTMLElement;
    const add = (label: string, run: () => void, o: HiKeyOpts = {}) => {
      if (this.btns.length >= 14) return;
      const n = this.btns.length;
      const b = hiKey(label, () => this.fire(n), o);
      host.appendChild(b);
      this.btns.push({ el: b, run, off: !!o.off });
    };
    // the ordinary verbs: what the item menu offers (equip, eat, drop, move...), sub-menus opened out
    let opts: MenuOption[] = [];
    try { opts = itemMenuOptions(p, it, c, group); } catch (e) { console.warn('item panel options', e); opts = []; }
    const flat: { o: MenuOption; parent?: string }[] = [];
    for (const o of opts) {
      if (/inspect|look closer/i.test(o.label)) continue;
      if (o.sub?.length) { for (const s of o.sub.slice(0, 4)) flat.push({ o: s, parent: o.label }); }
      else flat.push({ o });
    }
    for (const { o, parent } of flat.slice(0, 9)) {
      const off = o.disabled ? (typeof o.disabled === 'string' ? o.disabled : 'not now') : false;
      add(o.label, () => { this.close(true); o.action?.(); }, { sub: parent, off: off || (!o.action ? 'not now' : false), danger: o.danger });
    }
    // what the hands can do to it (take apart, sharpen, bind...): done in the hands, up close
    const mine = p.allItems().includes(it);
    const ops = opsForItem(it).map((h) => ({ h, why: this.opWhy(h, it, mine) }));
    const ready = ops.filter((q) => !q.why);
    for (const { h, why } of (ready.length ? ready : ops).slice(0, ready.length ? 3 : 1)) {
      add(h.name, () => { this.close(true); (G as any).craft?.inspectInHand?.(it, c, { op: h.key }); }, { sub: why ? undefined : this.opSub(h, it), off: why || false, lamp: 'warn' });
    }
    add('Inspect in hand', () => { this.close(true); (G as any).craft?.inspectInHand?.(it, c); }, { sub: 'turn it over, look closer   (F)', wide: true, lamp: 'info' });
    // paint the caps once they have a size
    requestAnimationFrame(() => { for (const b of this.btns) b.el.style.backgroundImage = (b.el as any)._art('up'); });
    const xb = this.el!.querySelector('[data-x]') as HTMLButtonElement;
    xb.style.backgroundImage = `url(${keyArt(24, 20, 'up', 'off', false)})`;
    xb.addEventListener('pointerup', () => this.close());
  }
  private opWhy(h: HandOp, it: Item, mine: boolean): string {
    const p = G.local;
    if (h.requires && !hasUnlock(h.requires)) return 'research: ' + (researchNode(h.requires)?.title || 'locked');
    if (!mine) return 'take it first';
    if (!pickTool(p, h, it)) return 'need ' + toolLabel(h);
    const miss = pickParts(p, h, it).filter((q) => q.missing);
    if (miss.length) return 'need ' + miss.map((m) => partLabel(m.req)).join(', ');
    return '';
  }
  private opSub(h: HandOp, it: Item): string { const t = pickTool(G.local, h, it); return t?.it ? 'with ' + itemName(t.it) : 'bare hands'; }

  private fire(i: number) {
    const b = this.btns[i];
    if (!b || b.off) return;
    try { b.run(); } catch (e) { console.warn('item panel action', e); }
    bus.emit('inventoryChanged', G.local);
  }
  private setFoc(i: number) {
    if (!this.btns.length) return;
    const n = this.btns.length;
    let k = ((i % n) + n) % n, guard = 0;
    while (this.btns[k].off && guard++ < n) k = (k + (i >= this.foc ? 1 : -1) + n) % n;
    const prev = this.btns[this.foc];
    if (prev) { prev.el.classList.remove('foc'); prev.el.style.backgroundImage = (prev.el as any)._art('up'); }
    this.foc = k;
    const b = this.btns[k];
    b.el.classList.add('foc'); b.el.style.backgroundImage = (b.el as any)._art('hover');
    G.audio?.ui?.('tally_click', 0.14);
  }
  private press(i: number) {
    const b = this.btns[i];
    if (!b) return;
    b.el.classList.add('dn'); b.el.style.backgroundImage = (b.el as any)._art('down');
    G.audio?.ui?.('tc_clack', 0.5);
    setTimeout(() => this.fire(i), 90);
  }

  // ------------------------------------------------ the plate
  private paint() { plateBg(this.el!); }

  // ------------------------------------------------ input
  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('pointerdown', (e) => { if (this.el && !this.el.contains(e.target as Node)) this.close(); }, true);
    window.addEventListener('keydown', (e) => {
      if (!this.el || G.input?.textFocus) return;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.code === 'Escape') { stop(); this.close(); return; }
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey)) { stop(); this.setFoc(this.foc < 0 ? 0 : this.foc + (e.code === 'ArrowDown' ? 2 : 1)); return; }
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey)) { stop(); this.setFoc(this.foc < 0 ? this.btns.length - 1 : this.foc - (e.code === 'ArrowUp' ? 2 : 1)); return; }
      if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && this.foc >= 0) { stop(); if (!e.repeat) this.press(this.foc); return; }
      if (e.code === 'KeyF') { stop(); if (!e.repeat) this.press(this.btns.length - 1); return; }
      // anything else while the card is up stays with the card
      if (/^(Digit|Key|Space)/.test(e.code)) stop();
    }, true);
    window.addEventListener('resize', () => this.close(true));
  }
  private tick() {
    if (!this.el) return;
    this.raf = requestAnimationFrame(() => this.tick());
    let gp: Gamepad | undefined;
    try { gp = [...(navigator.getGamepads?.() || [])].find(Boolean) as Gamepad | undefined; } catch { gp = undefined; }
    if (!gp) return;
    const btn = (i: number) => !!gp!.buttons[i]?.pressed;
    const a = btn(0), b = btn(1);
    const ay = gp.axes[1] ?? 0, ax = gp.axes[0] ?? 0;
    const dir = btn(13) || ay > 0.6 ? 2 : btn(12) || ay < -0.6 ? -2 : btn(15) || ax > 0.6 ? 1 : btn(14) || ax < -0.6 ? -1 : 0;
    const now = performance.now();
    if (dir && (dir !== this.pad.mv || now - this.pad.t > 260)) { this.setFoc(this.foc < 0 ? 0 : this.foc + dir); this.pad.t = now; }
    this.pad.mv = dir;
    if (a && !this.pad.a && this.foc >= 0) this.press(this.foc);
    if (b && !this.pad.b) this.close();
    this.pad.a = a; this.pad.b = b;
  }
}

/** paint a card's gunmetal plate behind its content (a canvas.ip-bg child), the render well (.ip-well) and the keys' separator (.ip-keys) */
export function plateBg(el: HTMLElement) {
  const W = el.offsetWidth, H = el.offsetHeight;
  const old = el.querySelector('canvas.ip-bg') as HTMLCanvasElement | null;
  const { cv, c } = crispCanvas(W, H);
  cv.className = 'ip-bg';
  rect(c, 4, 5, W - 4, H - 5, 0x000000, 0.55);
  // the body: an ink edge, chamfered corners, a soft dithered fall from a lit top to a darker foot (one ImageData pass)
  const ch = 10;
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const oc = off.getContext('2d')!, id = oc.createImageData(W, H), D = id.data;
  const put = (x: number, y: number, col: number) => { const i = (y * W + x) * 4; D[i] = (col >> 16) & 255; D[i + 1] = (col >> 8) & 255; D[i + 2] = col & 255; D[i + 3] = 255; };
  for (let y = 0; y < H - 5; y++) {
    const cut = y < ch ? ch - y : y > H - 6 - ch ? y - (H - 6 - ch) : 0;
    for (let x = cut; x < W - 4 - cut; x++) {
      const edge = y === 0 || y === H - 6 || x === cut || x === W - 5 - cut;
      if (edge) { put(x, y, 0x07080a); continue; }
      const u = y / (H - 6), t = 4.35 - u * 1.1;
      const k = Math.floor(t + (((x * 7 + y * 13) % 16) / 16 - 0.5) * 0.9);
      put(x, y, x === cut + 1 || y === 1 ? GUN[7] : x === W - 6 - cut || y === H - 7 ? GUN[1] : GUN[Math.max(2, Math.min(6, k))]);
    }
  }
  oc.putImageData(id, 0, 0);
  c.drawImage(off, 0, 0);
  rect(c, ch, 1, W - 5 - ch * 2, 1, GUN[8]); rect(c, ch, H - 7, W - 5 - ch * 2, 1, GUN[1]);
  // brushed streaks and handling wear
  let s = W * 7 + H;
  for (let y = 4; y < H - 8; y += 2) { s = (s * 1103515245 + 12345) & 0x7fffffff; if (s % 5 < 2) rect(c, 6 + (s % 30), y, W * 0.25 + (s % Math.max(1, W >> 1)), 1, s & 1 ? GUN[7] : GUN[3], 0.16); }
  // header band, a status lamp, a hazard notch
  rect(c, 8, 6, W - 18, 20, GUN[1]); rect(c, 8, 26, W - 18, 1, GUN[6]);
  rect(c, 11, 12, 5, 7, AMB[3]); rect(c, 11, 12, 5, 3, AMB[5]); rect(c, 11, 12, 2, 1, AMB[6]);
  hazard(c, W - 84, 10, 38, 12, 0xe8b52a, 0x17150f, 6);
  rivet(c, 9, H - 13, 2, true); rivet(c, W - 13, H - 13, 2, true); rivet(c, W - 52, 16, 2, true);
  const pr = el.getBoundingClientRect();
  // the render well: recessed glass with a faint grid and amber corner marks
  const well = el.querySelector('.ip-well') as HTMLElement | null;
  if (well) {
    const wr = well.getBoundingClientRect();
    const wx = Math.round(wr.left - pr.left), wy = Math.round(wr.top - pr.top), ww = Math.round(wr.width), wh = Math.round(wr.height);
    glass(c, wx, wy, ww, wh, 0x0c1210);
    for (let x = wx + 8; x < wx + ww; x += 12) rect(c, x, wy + 1, 1, wh - 2, 0x3ec8da, 0.06);
    for (let y = wy + 8; y < wy + wh; y += 12) rect(c, wx + 1, y, ww - 2, 1, 0x3ec8da, 0.06);
    for (const [x, y, dx, dy] of [[wx + 3, wy + 3, 1, 1], [wx + ww - 4, wy + 3, -1, 1], [wx + 3, wy + wh - 4, 1, -1], [wx + ww - 4, wy + wh - 4, -1, -1]]) { rect(c, Math.min(x, x + dx * 6), y, 7, 1, AMB[4], 0.9); rect(c, x, Math.min(y, y + dy * 6), 1, 7, AMB[4], 0.9); }
    for (let i = 0; i < 6; i++) rect(c, wx + ww / 2 - 30 + i * 4, wy + wh - 18 + i, 60 - i * 8, 1, 0xffd06a, 0.05);
  }
  // a separator above the keys
  const keys = el.querySelector('.ip-keys') as HTMLElement | null;
  if (keys && keys.childElementCount) {
    const ky = Math.round(keys.getBoundingClientRect().top - pr.top) - 7;
    rect(c, 12, ky, W - 26, 1, GUN[1]); rect(c, 12, ky + 1, W - 26, 1, GUN[6], 0.6);
    for (let x = 16; x < W - 18; x += 10) rect(c, x, ky - 3, 4, 1, GUN[5], 0.5);
  }
  if (old) old.replaceWith(cv); else el.prepend(cv);
}

export interface HiKeyOpts { sub?: string; lamp?: Lamp; off?: boolean | string; wide?: boolean; danger?: boolean }
/** a chamfered bone-enamel keycap button (hover glow, pressed state, a recorded clack); call paintKey once it is in the page */
export function hiKey(label: string, run: () => void, o: HiKeyOpts = {}): HTMLButtonElement {
  style();
  const b = document.createElement('button');
  b.className = 'ip-key' + (o.wide ? ' wide' : '') + (o.off ? ' off' : '');
  b.innerHTML = `<span>${label.replace(/[&<>]/g, '')}</span>` + (o.sub || typeof o.off === 'string' ? `<small>${String(typeof o.off === 'string' ? o.off : o.sub).replace(/[&<>]/g, '')}</small>` : '');
  const lamp: Lamp = o.off ? 'stop' : o.lamp ?? (o.danger ? 'warn' : 'go');
  const off = !!o.off;
  const art = (state: 'up' | 'hover' | 'down') => { const r = b.getBoundingClientRect(); return `url(${keyArt(Math.max(40, Math.round(r.width)), Math.max(20, Math.round(r.height)), state, lamp, off)})`; };
  (b as any)._art = art;
  (b as any)._off = off;
  b.addEventListener('pointerenter', () => { if (off) return; b.classList.add('hov'); b.style.backgroundImage = art('hover'); G.audio?.ui?.('mn_hover', 0.12); });
  b.addEventListener('pointerleave', () => { b.classList.remove('hov', 'dn'); b.style.backgroundImage = art(b.classList.contains('foc') ? 'hover' : 'up'); });
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button !== 0) return; if (off) { G.audio?.ui?.('mn_error', 0.3); return; } b.classList.add('dn'); b.style.backgroundImage = art('down'); G.audio?.ui?.('tc_clack', 0.5); });
  b.addEventListener('pointerup', (e) => { e.stopPropagation(); if (e.button !== 0 || off || !b.classList.contains('dn')) return; b.classList.remove('dn'); b.style.backgroundImage = art('hover'); run(); });
  return b;
}
/** paint a key's art for its laid-out size */
export function paintKey(b: HTMLElement, state: 'up' | 'hover' | 'down' = 'up') { const f = (b as any)._art; if (f) b.style.backgroundImage = f(state); }
export function ensureCardStyle() { style(); }

const PANEL = new ItemPanel();
/** open the item card beside a slot (screen rect or point); the same item again closes it */
export function openItemPanel(it: Item, c: Container | null, at: { x: number; y: number; w?: number; h?: number }, group?: Item[]) { PANEL.show(it, c, at, group); }
export function closeItemPanel() { PANEL.close(); }
export function itemPanelOpen(): boolean { return PANEL.open; }
void TAP;
