import { G } from '../../game/G';
import { Screen } from '../font5x7';
import type { Scanner } from './scanner';
import { BODY_PARTS, BodyPart, itemDef, itemName } from '../../items/item';
import { PART_NAMES, INJURY_INFO, Injury } from '../../survival/body';
import { SKILLS, occupationByKey, traitByKey } from '../../survival/traits';
import { Player } from '../../entities/player';
import { angleDiff, clamp } from '../../core/math';
import { allSpecies } from '../../creatures/registry';
import { injuryLabel } from '../../actions/medical';
import { itemMenuOptions } from '../../interact/itemMenu';

export type PageKey = 'stat' | 'scan' | 'sig' | 'map' | 'log' | 'data';
export const PAGES: { key: PageKey; name: string }[] = [
  { key: 'stat', name: 'BIOMONITOR' }, { key: 'scan', name: 'ANOMALY SCAN' }, { key: 'sig', name: 'SIGNAL TRACE' },
  { key: 'map', name: 'CARTOGRAPHY' }, { key: 'log', name: 'DIRECTIVES' }, { key: 'data', name: 'DATABANK' },
];

const C = (h: number) => Screen.c(h);
const BG = C(0x050f08), DIM = C(0x173d1c), MID = C(0x3c9a3a), HI = C(0x9cff8a), AMB = C(0xffb84a), RED = C(0xff5a3a), FAINT = C(0x0d2410);

type Zone = { x: number; y: number; w: number; h: number; fn: () => void };

export function drawPage(s: Screen, sc: Scanner) {
  s.clear(0x050f08);
  sc.st.clickZones = [] as Zone[];
  const p = G.local;
  const page = PAGES.find((x) => x.key === sc.page)!;
  // header
  s.rect(0, 0, s.w, 10, DIM);
  s.text(page.name, 3, 2, HI);
  const clock = G.clock.timeString();
  s.text(clock, s.w - s.textW(clock) - 3, 2, HI);
  s.text('D' + G.clock.day, s.w - s.textW(clock) - 30, 2, MID);
  // page tabs (dots)
  PAGES.forEach((pg, i) => s.rect(70 + i * 7, 4, 4, 3, pg.key === sc.page ? HI : MID));
  switch (sc.page) {
    case 'stat': drawStat(s, sc, sc.healthOf || p); break;
    case 'scan': drawScan(s, sc, p); break;
    case 'sig': drawSig(s, sc, p); break;
    case 'map': drawMap(s, sc, p); break;
    case 'log': drawLog(s, sc, p); break;
    case 'data': drawData(s, sc, p); break;
  }
  // corruption bleeds into the display
  const glitch = Math.max(G.collapse, p.body.corruption / 100);
  if (glitch > 0.15) for (let i = 0; i < glitch * 30; i++) { const x = Math.random() * s.w | 0, y = Math.random() * s.h | 0; s.rect(x, y, 1 + (Math.random() * 6 | 0), 1, Math.random() < 0.5 ? HI : BG); }
}

function footer(s: Screen, txt: string) {
  s.hline(2, s.w - 3, s.h - 11, DIM, 0);
  s.text(txt, 3, s.h - 9, MID, 1, s.w - 6);
}

function zone(sc: Scanner, x: number, y: number, w: number, h: number, fn: () => void) { (sc.st.clickZones as Zone[]).push({ x, y, w, h, fn }); }

// ------------------------------------------------------------------ BIOMONITOR
const PART_RECTS: Record<BodyPart, [number, number, number, number]> = {
  head: [25, 15, 10, 10], neck: [28, 25, 4, 3], torso_u: [20, 28, 20, 13], torso_l: [21, 41, 18, 9], groin: [23, 50, 14, 5],
  uarm_l: [41, 29, 5, 11], farm_l: [42, 40, 5, 11], hand_l: [42, 51, 5, 5],
  uarm_r: [14, 29, 5, 11], farm_r: [13, 40, 5, 11], hand_r: [13, 51, 5, 5],
  thigh_l: [31, 55, 7, 15], shin_l: [31, 70, 6, 15], foot_l: [31, 85, 8, 4],
  thigh_r: [22, 55, 7, 15], shin_r: [23, 70, 6, 15], foot_r: [21, 85, 8, 4],
};

function drawStat(s: Screen, sc: Scanner, who: Player) {
  const b = who.body;
  const t = G.time;
  const ox = 4, oy = 4;
  const selIdx = ((sc.st.sel % (BODY_PARTS.length + 1)) + BODY_PARTS.length + 1) % (BODY_PARTS.length + 1);
  const selPart: BodyPart | null = selIdx === 0 ? null : BODY_PARTS[selIdx - 1];
  // silhouette
  for (const part of BODY_PARTS) {
    const [x, y, w, h] = PART_RECTS[part];
    const X = x + ox, Y = y + oy;
    const injs = b.parts[part].injuries;
    const dmg = b.partDamage(part) / 100;
    const bleeding = injs.some((i) => b.injuryBleed(i) > 0.02);
    const fract = injs.some((i) => i.type === 'fracture');
    const infected = injs.some((i) => i.infection > 0.15);
    const corrupt = injs.some((i) => i.corrupt);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let c = FAINT;
      if (dmg > 0) c = ((i + j) % 2 === 0 || dmg > 0.5) ? (dmg > 0.5 ? AMB : MID) : FAINT;
      if (bleeding && Math.sin(t * 8) > 0) c = RED;
      if (corrupt && Math.random() < 0.25) c = HI;
      if (infected && (i + j * 2) % 4 === 0) c = AMB;
      s.px(X + i, Y + j, c);
    }
    s.frame(X, Y, w, h, fract ? AMB : part === selPart ? HI : DIM);
    zone(sc, X, Y, w, h, () => { sc.st.sel = BODY_PARTS.indexOf(part) + 1; });
  }
  // vitals column
  const vx = 58;
  let vy = 14;
  const row = (label: string, val: string, color = HI, v?: number) => {
    s.text(label, vx, vy, MID);
    s.text(val, s.w - 4 - s.textW(val), vy, color);
    if (v !== undefined) s.bar(vx, vy + 8, s.w - vx - 4, 3, v, color, BG);
    vy += v !== undefined ? 13 : 9;
  };
  const pulse = Math.round(62 + b.panic * 0.7 + (1 - b.endurance) * 40 + (b.temp > 37.5 ? 12 : 0) - (b.asleep ? 8 : 0));
  row('HEALTH', Math.round(b.health) + '%', b.health < 35 ? RED : HI, b.health / 100);
  row('BLOOD', Math.round(b.blood) + '%', b.blood < 70 ? AMB : HI, b.blood / 100);
  row('TEMP', b.temp.toFixed(1) + '°C', b.temp < 36 || b.temp > 38 ? AMB : HI);
  row('PULSE', pulse + ' BPM', pulse > 120 ? AMB : HI);
  row('LUCIDITY', Math.round(b.lucidity) + '%', b.lucidity < 50 ? AMB : HI);
  if (b.corruption > 0) row('DESYNC', Math.round(b.corruption) + '%', RED);
  // moodles or selected part detail
  vy += 1;
  s.hline(vx, s.w - 4, vy, DIM, 2); vy += 3;
  if (selPart) {
    s.text(PART_NAMES[selPart].toUpperCase(), vx, vy, HI, 1, s.w - vx - 4); vy += 9;
    const injs = b.parts[selPart].injuries;
    if (!injs.length) { s.text('NO DAMAGE', vx, vy, MID); vy += 9; }
    for (const inj of injs.slice(0, 4)) {
      const d = describeInjury(inj);
      s.text(d, vx, vy, b.injuryBleed(inj) > 0.02 ? RED : AMB, 1, s.w - vx - 4); vy += 9;
    }
    // treat button
    const bx = vx, by = s.h - 22;
    s.frame(bx, by, 40, 10, HI); s.text('TREAT', bx + 5, by + 2, HI);
    zone(sc, bx, by, 40, 10, () => openTreatMenu(sc, who, selPart));
  } else {
    const moods = b.moodles(who.heavyLoad()).sort((a, c) => c.level - a.level).slice(0, 6);
    if (!moods.length) { s.text('NOMINAL', vx, vy, MID); }
    for (const m of moods) {
      s.text(m.name.toUpperCase(), vx, vy, m.level >= 3 ? AMB : HI, 1, s.w - vx - 30);
      for (let i = 0; i < 4; i++) s.rect(s.w - 26 + i * 5, vy + 1, 4, 5, i < m.level ? (m.level >= 3 ? AMB : HI) : DIM);
      vy += 9;
    }
  }
  s.text(who === G.local ? 'SELF' : who.name.toUpperCase(), 6, 112, MID, 1, 50);
  s.text(`${b.weight.toFixed(0)}KG`, 6, 121, DIM);
  footer(s, selPart ? 'DIAL:PART  CLICK:SELECT  TREAT' : 'DIAL/CLICK:SELECT BODY PART');
}

function describeInjury(inj: Injury): string {
  let t = INJURY_INFO[inj.type].name.toUpperCase();
  if (inj.bandage) t += inj.bandage.clean ? ' [BAND]' : ' [DIRTY]';
  if (inj.stitched) t += ' [STITCH]';
  if (inj.splinted) t += ' [SPLINT]';
  if (inj.foreign) t += ' [SHARD]';
  if (inj.infection > 0.15) t += ' [INFECT]';
  return t;
}

function openTreatMenu(sc: Scanner, who: Player, part: BodyPart) {
  const p = G.local;
  const meds = p.allItems().filter((i) => itemDef(i.key).medical);
  const injs = who.body.parts[part].injuries;
  const opts: any[] = [];
  for (const it of meds) {
    const sub = itemMenuOptions(p, it, p.containerOf(it)!, [it]).filter((o) => o.sub && /bandage|disinfect|stitch|splint|shard/i.test(o.label));
    for (const o of sub) {
      const filtered = (o.sub || []).filter((x) => injs.some((inj) => x.label.includes(injuryLabel(inj).split(':')[1]?.trim().split(',')[0] || '')) && (who === p ? !x.label.includes(' — ') : x.label.startsWith(who.name)));
      if (filtered.length) opts.push({ label: `${o.label} (${itemName(it)})`, sub: filtered });
    }
  }
  if (!opts.length) opts.push({ label: 'No usable medical supplies', disabled: true });
  G.ui.openMenu(G.input.mouseX, G.input.mouseY, 'Treat ' + PART_NAMES[part], opts);
  void sc;
}

// ------------------------------------------------------------------ ANOMALY SCAN
function drawScan(s: Screen, sc: Scanner, p: Player) {
  const cx = 62, cy = 74, R = 56, RANGE = 24;
  const k = R / RANGE;
  const t = G.time;
  s.circle(cx, cy, R, MID);
  s.circle(cx, cy, R * 2 / 3, DIM, 4);
  s.circle(cx, cy, R / 3, DIM, 4);
  s.hline(cx - R, cx + R, cy, FAINT, 2); s.vline(cx, cy - R, cy + R, FAINT);
  // north tick
  const na = -Math.PI / 2 - p.facing - Math.PI / 2;
  s.text('N', cx + Math.cos(na) * (R + 1) - 2, cy + Math.sin(na) * (R + 1) - 3, MID);
  const sweepA = (t * 2.4) % (Math.PI * 2);
  for (let r = 4; r < R; r++) s.px(cx + Math.sin(sweepA) * r, cy - Math.cos(sweepA) * r, r % 3 === 0 ? HI : MID);
  // collect contacts
  const z = G.getZone(p.zoneKey);
  const contacts: { x: number; z: number; kind: string; c?: any; label?: string }[] = [];
  for (const c of G.creatures?.creatures.values() || []) {
    const cc: any = c;
    if (cc.zoneKey !== p.zoneKey || cc.dead) continue;
    if (Math.hypot(cc.x - p.x, cc.z - p.z) > RANGE) continue;
    if (cc.sp.flags?.watcher && Math.random() < 0.6) continue; // watchers barely register
    contacts.push({ x: cc.x, z: cc.z, kind: cc.tamedBy ? 'ally' : cc.sp.threat >= 3 ? 'hostile' : 'bio', c: cc });
  }
  for (const o of G.players.values()) if (o !== p && o.zoneKey === p.zoneKey) contacts.push({ x: o.x, z: o.z, kind: 'player', label: o.name[0] });
  for (const a of (z.meta.anomalies as any[]) || []) contacts.push({ x: a.x, z: a.z, kind: 'anomaly' });
  // blips light up as the sweep passes
  for (const ct of contacts) {
    const dx = ct.x - p.x, dz = ct.z - p.z, d = Math.hypot(dx, dz);
    const rel = Math.atan2(dz, dx) - p.facing;
    const bx = cx + Math.sin(rel) * d * k, by = cy - Math.cos(rel) * d * k;
    const ba = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const since = ((sweepA - ba) + Math.PI * 4) % (Math.PI * 2);
    const fade = 1 - since / (Math.PI * 2);
    const bright = fade > 0.65 ? HI : fade > 0.3 ? MID : DIM;
    if (ct.kind === 'player') { s.text('+', bx - 2, by - 3, HI); if (ct.label) s.text(ct.label, bx + 3, by - 3, MID); }
    else if (ct.kind === 'anomaly') { s.px(bx, by - 2, bright); s.px(bx - 2, by, bright); s.px(bx + 2, by, bright); s.px(bx, by + 2, bright); }
    else if (ct.kind === 'ally') s.disc(bx, by, 1, MID);
    else { s.disc(bx, by, ct.kind === 'hostile' ? 2 : 1, ct.kind === 'hostile' && fade > 0.6 ? AMB : bright); }
    if (ct.c) zone(sc, bx - 4, by - 4, 9, 9, () => G.ui.scanner.scanCreature(ct.c));
  }
  s.text('▲', cx - 2, cy - 3, HI);
  // side panel
  const px = 124;
  s.vline(px - 3, 13, s.h - 14, DIM);
  const bio = contacts.filter((c) => c.c);
  s.text('CONTACTS', px, 14, MID); s.text(String(bio.length), s.w - 4 - s.textW(String(bio.length)), 14, HI);
  bio.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  let y = 26;
  for (const ct of bio.slice(0, 4)) {
    const c = ct.c;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    const name = c.scanned ? c.sp.name.toUpperCase() : 'UNKNOWN';
    s.text(name, px, y, c.sp.threat >= 3 ? AMB : HI, 1, s.w - px - 3);
    s.text(`${d.toFixed(0)}M ${bearing(p, c.x, c.z)}`, px, y + 8, MID);
    zone(sc, px, y, s.w - px, 16, () => G.ui.scanner.scanCreature(c));
    y += 19;
  }
  if (sc.scanTarget) {
    s.text('SCANNING', px, s.h - 34, HI);
    s.bar(px, s.h - 25, s.w - px - 4, 6, sc.scanProgress, HI, BG);
  } else if (sc.st.lastScanned) {
    s.text('ID: ' + sc.st.lastScanned.sp.code.split('//')[0].trim(), px, s.h - 30, MID, 1, s.w - px - 3);
  }
  footer(s, 'CLICK CONTACT TO SCAN  RANGE 24M');
}

function bearing(p: Player, x: number, z: number) {
  const rel = angleDiff(p.facing, Math.atan2(z - p.z, x - p.x));
  const deg = Math.round((rel * 180) / Math.PI);
  return deg > 15 ? 'R' + deg : deg < -15 ? 'L' + (-deg) : 'AHEAD';
}

// ------------------------------------------------------------------ SIGNAL TRACE
export function signalStrength(p: Player, freq: number) {
  const sigs = (G.missions?.signalsFor?.(p.zoneKey) || (G.getZone(p.zoneKey).meta.signals as any[]) || []) as { freq: number; x: number; z: number; range: number; name: string; text?: string; id: string }[];
  let best = 0, bestSig: any = null, dir = 0;
  for (const sg of sigs) {
    const fm = clamp(1 - Math.abs(freq - sg.freq) / 0.6, 0, 1);
    if (fm <= 0) continue;
    const d = Math.hypot(sg.x - p.x, sg.z - p.z);
    const df = clamp(1 - d / (sg.range || 80), 0, 1);
    const ang = Math.atan2(sg.z - p.z, sg.x - p.x);
    const face = 0.5 + 0.5 * Math.cos(angleDiff(p.facing, ang));
    const st = fm * (0.15 + 0.85 * df) * (0.55 + 0.45 * face);
    if (st > best) { best = st; bestSig = sg; dir = angleDiff(p.facing, ang); }
  }
  return { strength: best, sig: bestSig, dir };
}

function drawSig(s: Screen, sc: Scanner, p: Player) {
  const f = sc.st.freq as number;
  const { strength, sig, dir } = signalStrength(p, f);
  sc.st.sigStrength = strength;
  G.audio?.radioStatic?.(sc.open ? strength : -1, sig, f);
  const ft = f.toFixed(1).padStart(5, '0');
  s.text(ft, 8, 16, HI, 3);
  s.text('MHz', 8 + s.textW(ft, 3) + 4, 30, MID);
  // waveform
  const wy = 52, wh = 26;
  s.frame(4, wy, s.w - 8, wh, DIM);
  for (let x = 6; x < s.w - 6; x++) {
    const n = (Math.random() - 0.5) * (1 - strength) * wh * 0.8;
    const sine = Math.sin(x * 0.35 + G.time * 9) * strength * wh * 0.38 * (sig?.pattern === 'pulse' ? (Math.sin(G.time * 3) > 0 ? 1 : 0.2) : 1);
    const y = wy + wh / 2 + n * 0.6 + sine;
    s.px(x, y, strength > 0.6 ? HI : MID);
  }
  // strength meter
  s.text('STRENGTH', 4, 84, MID);
  for (let i = 0; i < 20; i++) s.rect(60 + i * 6, 84, 4, 7, i / 20 < strength ? (i > 14 ? AMB : HI) : DIM);
  // bearing
  if (strength > 0.22) {
    const ax = 30, ay = 110;
    s.circle(ax, ay, 12, DIM);
    const ex = ax + Math.sin(dir) * 10, ey = ay - Math.cos(dir) * 10;
    s.line(ax, ay, ex, ey, HI);
    s.disc(ex, ey, 1, HI);
    s.text(Math.abs(dir) < 0.3 ? 'ON BEARING' : dir > 0 ? 'TURN RIGHT' : 'TURN LEFT', 50, 100, Math.abs(dir) < 0.3 ? HI : MID);
    s.text(sig && strength > 0.7 ? (sig.name || 'UNKNOWN').toUpperCase() : 'UNRESOLVED', 50, 110, strength > 0.7 ? AMB : MID, 1, s.w - 54);
    if (sig && strength > 0.7) { G.missions?.onSignalLock?.(sig, p); const known: Set<string> = (p as any).knownSignals || ((p as any).knownSignals = new Set()); known.add(sig.id); }
  } else {
    s.text('NO CARRIER', 50, 106, DIM);
  }
  // transcript when locked
  if (sig && strength > 0.85 && sig.text) {
    const msg = sig.text as string;
    const off = Math.floor(G.time * 6) % (msg.length + 30);
    s.rect(4, 120, s.w - 8, 11, FAINT);
    s.text(msg.slice(Math.max(0, off - 30), off), 6, 122, HI, 1, s.w - 12);
  }
  footer(s, 'DIAL:TUNE  FACE THE SOURCE');
}

// ------------------------------------------------------------------ CARTOGRAPHY
function drawMap(s: Screen, sc: Scanner, p: Player) {
  const z = G.getZone(p.zoneKey);
  const zoom = sc.st.mapZoom as number;
  const vw = s.w - 8, vh = s.h - 26;
  const ox = 4, oy = 12;
  const tx0 = Math.floor(p.x - vw / zoom / 2), ty0 = Math.floor(p.z - vh / zoom / 2);
  const cols = Math.ceil(vw / zoom), rows = Math.ceil(vh / zoom);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = tx0 + i, y = ty0 + j;
    if (!z.inb(x, y)) continue;
    const k = z.idx(x, y);
    if (!z.explored[k]) continue;
    const sx = ox + i * zoom, sy = oy + j * zoom;
    if (z.floor[k]) {
      const water = z.floorAt(x, y)?.water;
      for (let b = 0; b < zoom; b++) for (let a = 0; a < zoom; a++) if (((a + b + x + y) & 1) === 0 || zoom === 1) s.px(sx + a, sy + b, water ? MID : FAINT);
      if (z.solid[k] === 1 || z.solid[k] === 3) s.rect(sx, sy, zoom, zoom, DIM);
    }
    if (z.wallN[k]) s.hline(sx, sx + zoom - 1, sy, z.edge(x, y, 0) ? AMB : MID);
    if (z.wallW[k]) s.vline(sx, sy, sy + zoom - 1, z.edge(x, y, 1) ? AMB : MID);
  }
  const toS = (wx: number, wz: number) => [ox + (wx - tx0) * zoom, oy + (wz - ty0) * zoom];
  for (const pt of z.portals) { if (!z.explored[z.idx(pt.x, pt.y)]) continue; const [x, y] = toS(pt.x + 0.5, pt.y + 0.5); s.text('*', x - 2, y - 3, HI); }
  for (const o of G.players.values()) { if (o === p || o.zoneKey !== p.zoneKey) continue; const [x, y] = toS(o.x, o.z); s.text('+', x - 2, y - 3, HI); }
  const markers: { x: number; z: number }[] = (z.meta.markers as any) || [];
  for (const m of markers) { const [x, y] = toS(m.x, m.z); s.text('×', x - 2, y - 3, AMB); }
  // player arrow
  const [px, py] = toS(p.x, p.z);
  const a = p.facing;
  for (let r = 0; r < 5; r++) s.px(px + Math.cos(a) * r, py + Math.sin(a) * r, HI);
  s.disc(px, py, 1, HI);
  zone(sc, ox, oy, vw, vh, () => {
    // click: toggle marker at the clicked tile
    const mx = (G.input.mouseX), my = (G.input.mouseY);
    const hit = G.ui.scanner.hitTest(mx, my);
    if (!hit || hit.kind !== 'screen') return;
    const sxp = hit.u! * s.w, syp = hit.v! * s.h;
    const wx = tx0 + (sxp - ox) / zoom, wz = ty0 + (syp - oy) / zoom;
    const near = markers.findIndex((m) => Math.hypot(m.x - wx, m.z - wz) < 2);
    if (near >= 0) markers.splice(near, 1); else markers.push({ x: wx, z: wz });
    z.meta.markers = markers;
  });
  s.rect(0, s.h - 12, s.w, 12, BG);
  footer(s, `${(z.name || z.key).toUpperCase()}  X${p.tileX()} Y${p.tileY()}  Z${zoom}`);
}

// ------------------------------------------------------------------ DIRECTIVES
function drawLog(s: Screen, sc: Scanner, p: Player) {
  const ms = G.missions;
  ms?.markRead?.();
  const list: any[] = ms?.visible?.() || [];
  if (!list.length) {
    s.para('NO DIRECTIVES RECEIVED. KEEP THE SCANNER CLOSE. SOMETHING WILL REACH OUT.', 6, 18, s.w - 12, MID);
    footer(s, 'DIAL:SELECT');
    return;
  }
  const sel = ((sc.st.sel % list.length) + list.length) % list.length;
  let y = 14;
  list.slice(0, 5).forEach((m, i) => {
    const mark = m.done ? '█' : i === sel ? '▸' : '•';
    s.text(mark, 4, y, m.done ? DIM : HI);
    s.text(m.title.toUpperCase(), 12, y, i === sel ? HI : m.done ? DIM : MID, 1, s.w - 16);
    zone(sc, 0, y - 1, s.w, 9, () => { sc.st.sel = i; });
    y += 9;
  });
  s.hline(4, s.w - 5, y + 1, DIM, 2);
  y += 5;
  const m = list[sel];
  const used = s.para(m.desc || '', 4, y, s.w - 8, MID, 8, 5);
  y += used * 8 + 2;
  for (const o of (m.objectives || []).slice(0, 5)) {
    s.text(o.done ? '[X]' : '[ ]', 4, y, o.done ? DIM : HI);
    s.text(o.text.toUpperCase(), 24, y, o.done ? DIM : HI, 1, s.w - 28);
    y += 9;
  }
  footer(s, `COLLAPSE ${(G.collapse * 100).toFixed(0)}%  DIAL:SELECT`);
  void p;
}

// ------------------------------------------------------------------ DATABANK
function drawData(s: Screen, sc: Scanner, p: Player) {
  const tabs = ['SKILLS', 'CODEX', 'PROFILE'];
  const tab = ((sc.st.dataTab % 3) + 3) % 3;
  tabs.forEach((t, i) => {
    const x = 4 + i * 62;
    s.frame(x, 12, 58, 10, i === tab ? HI : DIM);
    s.text(t, x + 4, 14, i === tab ? HI : MID);
    zone(sc, x, 12, 58, 10, () => { sc.st.dataTab = i; sc.st.sel = 0; });
  });
  let y = 26;
  if (tab === 0) {
    const sel = Math.max(0, sc.st.sel % SKILLS.length);
    const start = Math.min(Math.max(0, sel - 5), SKILLS.length - 11);
    for (const sk of SKILLS.slice(Math.max(0, start), Math.max(0, start) + 11)) {
      const v = p.body.skills[sk.key];
      s.text(sk.name.toUpperCase(), 6, y, MID);
      for (let i = 0; i < 10; i++) s.rect(96 + i * 7, y, 5, 6, i < v.level ? HI : DIM);
      y += 9;
    }
  } else if (tab === 1) {
    const known = [...new Set([...(G.creatures?.creatures.values() || [])].filter((c: any) => c.scanned).map((c: any) => c.sp.key)), ...(G.missions?.codex || [])];
    const list = allSpecies().filter((sp: any) => known.includes(sp.key)) as any[];
    if (!list.length) { s.para('NO SPECIMENS CATALOGUED. SCAN CREATURES ON THE ANOMALY PAGE.', 6, y, s.w - 12, MID); }
    else {
      const sel = ((sc.st.sel % list.length) + list.length) % list.length;
      const sp = list[sel];
      s.text(`${sel + 1}/${list.length}`, s.w - 30, y, MID);
      s.text(sp.name.toUpperCase(), 6, y, HI, 1, s.w - 40); y += 9;
      s.text(sp.code, 6, y, MID, 1, s.w - 12); y += 9;
      s.text('CLASS: ' + sp.scan.cls.toUpperCase(), 6, y, MID, 1, s.w - 12); y += 9;
      s.text('THREAT', 6, y, MID); for (let i = 0; i < 5; i++) s.rect(50 + i * 7, y, 5, 6, i < sp.threat ? (sp.threat >= 3 ? AMB : HI) : DIM); y += 11;
      for (const n of sp.scan.notes) { y += s.para('- ' + n, 6, y, s.w - 12, HI, 8, 4) * 8 + 1; if (y > s.h - 20) break; }
    }
  } else {
    const occ = occupationByKey(p.occupation);
    s.text(p.name.toUpperCase(), 6, y, HI); y += 9;
    s.text('ROLE: ' + occ.name.toUpperCase(), 6, y, MID, 1, s.w - 12); y += 9;
    const traits = [...p.body.traits].map((t) => traitByKey(t)?.name || t).join(', ') || 'NONE';
    y += s.para('TRAITS: ' + traits.toUpperCase(), 6, y, s.w - 12, MID, 8, 3) * 8 + 2;
    s.text(`SURVIVED ${Math.floor(G.clock.hours / 24)}D ${Math.floor(G.clock.hours % 24)}H`, 6, y, HI); y += 9;
    s.text(`ENTITIES DOWNED: ${p.kills}`, 6, y, MID); y += 9;
    s.text(`ZONES MAPPED: ${[...G.zones.keys()].length}`, 6, y, MID); y += 9;
    s.text(`CARRY ${p.carriedWeight().toFixed(1)}/${p.capacity().toFixed(0)} KG`, 6, y, MID);
  }
  footer(s, 'DIAL:SCROLL  CLICK TABS');
}
