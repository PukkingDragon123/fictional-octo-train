// The watch's unlockable functions, ported from the old SEER-9 scanner's pages
// and extended: CARTOGRAPHY (map), ANOMALY SCAN (radar, creature scans,
// anomaly logging), SIGNAL TRACE (radio), BIOMONITOR (vitals; calories, blood
// pressure, the diagnosis AI and the mind monitor as further research),
// LOGBOOK (skills, codex, file), TOOL (the multi-tool) and FAB (field crafting).
import { G } from '../../game/G';
import type { Tube } from './tube';
import { BODY_PARTS, BodyPart, itemDef, itemName } from '../../items/item';
import { PART_NAMES, INJURY_INFO, Injury } from '../../survival/body';
import { SKILLS, occupationByKey, traitByKey, PERKS } from '../../survival/traits';
import type { Player } from '../../entities/player';
import { angleDiff, clamp } from '../../core/math';
import { allSpecies } from '../../creatures/registry';
import { injuryLabel, stumpLabel } from '../../actions/medical';
import { lossSummary } from '../../survival/limbs';
import { itemMenuOptions } from '../../interact/itemMenu';
import { ensureMind, conditions, medsLines, moodGlyph, breathState, breathRate, topTrigger, ssriEffect } from '../../survival/mind';
import { startBreathing } from '../../survival/mindSystem';
import { paintBody, partAt, drawMoodleGlyph, BODY_W, BODY_H } from '../moodles';
import { hasUnlock } from '../../game/research';
import { checkRecipe } from '../../interact/crafting';
import { floorItems } from '../../items/worldItems';
import { PAL, TOP, BOT, zone, footer, button, icon, wrap } from './screen';
import type { Watch } from './watch';

const { BG, PANEL, FAINT, DIM, MID, HI, AMB, RED, MAG, GRN } = PAL;
const blink = (hz = 2) => Math.floor(G.time * hz) % 2 === 0;

function tabs(s: Tube, w: Watch, key: string, labels: string[], avail: boolean[]) {
  let x = 2;
  const cur = ((w.st[key] ?? 0) % labels.length + labels.length) % labels.length;
  labels.forEach((lb, i) => {
    const bw = s.textW(lb) + 6, on = i === cur;
    s.rect(x, TOP, bw, 9, on ? DIM : BG);
    s.text(lb, x + 3, TOP + 1, !avail[i] ? FAINT : on ? HI : MID);
    if (avail[i]) zone(w, x, TOP, bw, 9, () => { w.st[key] = i; w.st.sel = 0; });
    x += bw + 2;
  });
  return cur;
}

// ================================================================ CARTOGRAPHY
export function drawMap(s: Tube, w: Watch) {
  const p = G.local, z = G.getZone(p.zoneKey);
  const zoom = w.st.mapZoom as number;
  const vw = s.w - 8, vh = BOT - TOP - 2;
  const ox = 4, oy = TOP;
  const tx0 = Math.floor(p.x - vw / zoom / 2), ty0 = Math.floor(p.z - vh / zoom / 2);
  const cols = Math.ceil(vw / zoom), rows = Math.ceil(vh / zoom);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = tx0 + i, y = ty0 + j;
    if (!z.inb(x, y)) continue;
    const k = z.idx(x, y);
    if (!z.explored[k]) continue;
    const sx = ox + i * zoom, sy = oy + j * zoom;
    if (z.floor[k]) s.rect(sx, sy, zoom, zoom, z.solid[k] === 1 || z.solid[k] === 3 ? DIM : z.floorAt(x, y)?.water ? MID : FAINT);
    if (z.wallN[k]) s.hline(sx, sx + zoom - 1, sy, z.edge(x, y, 0) ? AMB : MID);
    if (z.wallW[k]) s.vline(sx, sy, sy + zoom - 1, z.edge(x, y, 1) ? AMB : MID);
  }
  const toS = (wx: number, wz: number) => [ox + (wx - tx0) * zoom, oy + (wz - ty0) * zoom];
  const inView = (x: number, y: number) => x >= ox && y >= oy && x < ox + vw && y < oy + vh;
  for (const pt of z.portals) { if (pt.kind === 'loop' || (pt as any).hidden || !z.explored[z.idx(pt.x, pt.y)]) continue; const [x, y] = toS(pt.x + 0.5, pt.y + 0.5); if (inView(x, y)) s.text('*', x - 2, y - 3, HI); }
  for (const o of G.players.values()) { if (o === p || o.zoneKey !== p.zoneKey) continue; const [x, y] = toS(o.x, o.z); if (inView(x, y)) s.text('+', x - 2, y - 3, HI); }
  const markers: { x: number; z: number }[] = (z.meta.markers as any) || [];
  for (const m of markers) { const [x, y] = toS(m.x, m.z); if (inView(x, y)) s.text('×', x - 2, y - 3, AMB); }
  // the tracked quest's target
  const Q = w.quests, tg = Q?.target(Q.focus());
  if (tg && tg.zone === p.zoneKey) {
    const [x, y] = toS(tg.x, tg.z);
    const cx = clamp(x, ox + 3, ox + vw - 4), cy = clamp(y, oy + 3, oy + vh - 4);
    if (blink(3)) { s.frame(cx - 3, cy - 3, 7, 7, MAG); s.px(cx, cy, MAG); }
  }
  // you
  const [px, py] = toS(p.x, p.z);
  for (let r = 0; r < 5; r++) s.px(px + Math.cos(p.facing) * r, py + Math.sin(p.facing) * r, HI);
  s.disc(px, py, 1, HI);
  zone(w, ox, oy, vw, vh, () => {
    const hit = w.lastHit;
    if (!hit) return;
    const wx = tx0 + (hit.x - ox) / zoom, wz = ty0 + (hit.y - oy) / zoom;
    const near = markers.findIndex((m) => Math.hypot(m.x - wx, m.z - wz) < 2);
    if (near >= 0) markers.splice(near, 1); else markers.push({ x: wx, z: wz });
    z.meta.markers = markers;
  });
  footer(s, `${(z.name || z.key).toUpperCase()}  X${p.tileX()} Y${p.tileY()}  Z${zoom}${hasUnlock('watch_survey') ? '  SONAR' : ''}`);
}

// ================================================================ ANOMALY SCAN
export interface Contact { x: number; z: number; kind: string; c?: any; label?: string; it?: any; id?: string }

/** what the scanner sees: entities, crew, anomalous objects on the floor */
export function contacts(w: Watch, p: Player, range: number): Contact[] {
  const z = G.getZone(p.zoneKey);
  const out: Contact[] = [];
  for (const c of G.creatures?.creatures.values() || []) {
    const cc: any = c;
    if (cc.zoneKey !== p.zoneKey || cc.dead) continue;
    if (Math.hypot(cc.x - p.x, cc.z - p.z) > range) continue;
    if (cc.sp.flags?.watcher && Math.random() < 0.6) continue; // watchers barely register
    out.push({ x: cc.x, z: cc.z, kind: cc.tamedBy ? 'ally' : cc.sp.threat >= 3 ? 'hostile' : 'bio', c: cc });
  }
  for (const o of G.players.values()) if (o !== p && o.zoneKey === p.zoneKey) out.push({ x: o.x, z: o.z, kind: 'player', label: o.name[0] });
  try {
    for (const [, fi] of floorItems(z)) {
      if (Math.hypot(fi.x - p.x, fi.z - p.z) > range * 0.6) continue;
      if (!itemDef(fi.item.key).tags?.includes('anomalous')) continue;
      out.push({ x: fi.x, z: fi.z, kind: 'anomaly', it: fi.item, id: `${z.key}:${fi.item.uid}` });
    }
  } catch { /* zone without floor items */ }
  return out;
}

export function drawScan(s: Tube, w: Watch) {
  const p = G.local;
  const range = w.scanRange();
  const cx = 62, cy = 74, R = 50;
  const k = R / range;
  const t = G.time;
  s.circle(cx, cy, R, MID);
  s.circle(cx, cy, R * 2 / 3, DIM, 4);
  s.circle(cx, cy, R / 3, DIM, 4);
  s.hline(cx - R, cx + R, cy, FAINT, 2); s.vline(cx, cy - R, cy + R, FAINT);
  const na = -Math.PI / 2 - p.facing - Math.PI / 2;
  s.text('N', cx + Math.cos(na) * (R + 1) - 2, cy + Math.sin(na) * (R + 1) - 3, MID);
  const sweepA = (t * 2.4) % (Math.PI * 2);
  for (let k2 = 0; k2 < 5; k2++) { const a = sweepA - k2 * 0.07; s.line(cx, cy, cx + Math.sin(a) * R, cy - Math.cos(a) * R, k2 ? (k2 < 3 ? MID : DIM) : HI); }
  const list = contacts(w, p, range);
  const logged: Set<string> = w.logged;
  for (const ct of list) {
    const dx = ct.x - p.x, dz = ct.z - p.z, d = Math.hypot(dx, dz);
    const rel = Math.atan2(dz, dx) - p.facing;
    const bx = cx + Math.sin(rel) * d * k, by = cy - Math.cos(rel) * d * k;
    const ba = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const since = ((sweepA - ba) + Math.PI * 4) % (Math.PI * 2);
    const fade = 1 - since / (Math.PI * 2);
    const bright = fade > 0.65 ? HI : fade > 0.3 ? MID : DIM;
    if (ct.kind === 'player') { s.text('+', bx - 2, by - 3, HI); if (ct.label) s.text(ct.label, bx + 3, by - 3, MID); }
    else if (ct.kind === 'anomaly') {
      const c = logged.has(ct.id!) ? DIM : MAG;
      s.px(bx, by - 2, c); s.px(bx - 2, by, c); s.px(bx + 2, by, c); s.px(bx, by + 2, c);
      if (!logged.has(ct.id!)) zone(w, bx - 4, by - 4, 9, 9, () => w.scanAnomaly(ct));
    }
    else if (ct.kind === 'ally') s.disc(bx, by, 1, MID);
    else s.disc(bx, by, ct.kind === 'hostile' ? 2 : 1, ct.kind === 'hostile' && fade > 0.6 ? AMB : bright);
    if (ct.c) zone(w, bx - 4, by - 4, 9, 9, () => w.scanCreature(ct.c));
  }
  s.text('▸', cx - 2, cy - 3, HI);
  // side panel
  const px = 124;
  s.vline(px - 3, TOP, BOT, DIM);
  const bio = list.filter((c) => c.c || (c.kind === 'anomaly' && !logged.has(c.id!)));
  s.text('CONTACTS', px, TOP + 1, MID); s.text(String(bio.length), s.w - 4 - s.textW(String(bio.length)), TOP + 1, HI);
  bio.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  let y = TOP + 12;
  for (const ct of bio.slice(0, 4)) {
    const d = Math.hypot(ct.x - p.x, ct.z - p.z);
    if (ct.c) {
      const c = ct.c;
      s.text(c.scanned ? c.sp.name.toUpperCase() : 'UNKNOWN', px, y, c.sp.threat >= 3 ? AMB : HI, 1, s.w - px - 3);
      zone(w, px, y, s.w - px, 16, () => w.scanCreature(c));
    } else {
      s.text('ANOMALY', px, y, MAG, 1, s.w - px - 3);
      zone(w, px, y, s.w - px, 16, () => w.scanAnomaly(ct));
    }
    s.text(`${d.toFixed(0)}M ${bearing(p, ct.x, ct.z)}`, px, y + 8, MID);
    y += 19;
  }
  if (w.scanTarget) {
    s.text(w.scanTarget.kind === 'anomaly' ? 'LOGGING' : 'SCANNING', px, BOT - 20, HI);
    s.bar(px, BOT - 11, s.w - px - 4, 6, w.scanProgress, HI, BG);
  } else if (w.st.lastScanned) {
    s.text('ID: ' + w.st.lastScanned, px, BOT - 16, MID, 1, s.w - px - 3);
  }
  footer(s, `CLICK A CONTACT TO SCAN  RANGE ${range}M${hasUnlock('tool_beam') ? ' BEAM' : ''}`);
}

export function bearing(p: Player, x: number, z: number) {
  const rel = angleDiff(p.facing, Math.atan2(z - p.z, x - p.x));
  const deg = Math.round((rel * 180) / Math.PI);
  return deg > 15 ? 'R' + deg : deg < -15 ? 'L' + (-deg) : 'AHEAD';
}

// ================================================================ SIGNAL TRACE
export function signalStrength(p: Player, freq: number) {
  const sigs = (G.missions?.signalsFor?.(p.zoneKey) || (G.getZone(p.zoneKey).meta.signals as any[]) || []) as { freq: number; x: number; z: number; range: number; name: string; text?: string; id: string; pattern?: string }[];
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

const WAVE: number[] = [];
export function drawSig(s: Tube, w: Watch) {
  const p = G.local;
  const f = w.st.freq as number;
  const { strength, sig, dir } = signalStrength(p, f);
  w.st.sigStrength = strength;
  G.audio?.radioStatic?.(w.open ? strength : -1, sig, f);
  const ft = f.toFixed(1).padStart(5, '0');
  s.text(ft, 8, TOP + 3, HI, 3);
  s.text('MHz', 8 + s.textW(ft, 3) + 4, TOP + 17, MID);
  // presets: the press beacon and whatever you've locked before
  const known: string[] = ['77.7', ...[...((p as any).knownSignals || [])].slice(0, 2).map((id: string) => { const sg = (G.missions?.signalsFor?.(p.zoneKey) || []).find((q: any) => q.id === id); return sg ? sg.freq.toFixed(1) : ''; }).filter(Boolean)];
  let bx = 150;
  for (const k of [...new Set(known)].slice(0, 3)) { const fq = Number(k); bx += 0; button(s, w, k, s.w - 40, TOP + 1 + known.indexOf(k) * 12, MID, () => { w.st.freq = fq; }, 36); }
  void bx;
  const wy = TOP + 31, wh = 24;
  s.frame(4, wy, s.w - 8, wh, DIM);
  const wave = WAVE;
  wave.length = 0;
  for (let x = 6; x < s.w - 6; x += 2) {
    const n = (Math.random() - 0.5) * (1 - strength) * wh * 0.8;
    const sine = Math.sin(x * 0.35 + G.time * 9) * strength * wh * 0.38 * (sig?.pattern === 'pulse' ? (Math.sin(G.time * 3) > 0 ? 1 : 0.2) : 1);
    wave.push(x, wy + wh / 2 + n * 0.6 + sine);
  }
  s.poly(wave, strength > 0.6 ? HI : MID);
  s.text('STRENGTH', 4, wy + 28, MID);
  for (let i = 0; i < 20; i++) s.rect(60 + i * 7, wy + 28, 5, 7, i / 20 < strength ? (i > 14 ? AMB : HI) : DIM);
  const ay = wy + 52;
  if (strength > 0.22) {
    s.circle(22, ay, 11, DIM);
    const ex = 22 + Math.sin(dir) * 9, ey = ay - Math.cos(dir) * 9;
    s.line(22, ay, ex, ey, HI); s.disc(ex, ey, 1, HI);
    s.text(Math.abs(dir) < 0.3 ? 'ON BEARING' : dir > 0 ? 'TURN RIGHT' : 'TURN LEFT', 40, ay - 8, Math.abs(dir) < 0.3 ? HI : MID);
    s.text(sig && strength > 0.7 ? (sig.name || 'UNKNOWN').toUpperCase() : 'UNRESOLVED', 40, ay + 2, strength > 0.7 ? AMB : MID, 1, s.w - 44);
    if (sig && strength > 0.7) { G.missions?.onSignalLock?.(sig, p); const kn: Set<string> = (p as any).knownSignals || ((p as any).knownSignals = new Set()); kn.add(sig.id); }
  } else s.text('NO CARRIER', 40, ay - 3, DIM);
  if (sig && strength > 0.85 && sig.text) {
    const msg = sig.text as string;
    const off = Math.floor(G.time * 6) % (msg.length + 30);
    s.rect(4, BOT - 11, s.w - 8, 10, FAINT);
    s.text(msg.slice(Math.max(0, off - 30), off), 6, BOT - 10, HI, 1, s.w - 12);
  }
  footer(s, 'WHEEL:TUNE  FACE THE SOURCE');
}

// ================================================================ BIOMONITOR
const BODY_X = 6, BODY_Y = TOP + 12;

export function drawBio(s: Tube, w: Watch) {
  const who: Player = w.healthOf || G.local;
  const self = who === G.local;
  const diag = hasUnlock('watch_diag'), mind = hasUnlock('watch_mind') && self;
  const tab = tabs(s, w, 'bioTab', ['VITALS', 'DIAGNOSIS', 'MIND'], [true, diag, mind]);
  if (tab === 1 && diag) { drawDiag(s, w, who); return; }
  if (tab === 2 && mind) { drawMind(s, w, who); return; }
  const b = who.body;
  let y = TOP + 13;
  const row = (label: string, val: string, color = HI, v?: number, x0 = 4, x1 = s.w - 4) => {
    s.text(label, x0, y, MID);
    s.text(val, x1 - s.textW(val), y, color);
    if (v !== undefined) s.bar(x0, y + 8, x1 - x0, 3, v, color, BG);
    y += v !== undefined ? 13 : 9;
  };
  const pulse = pulseOf(who);
  // left column: the basics
  const L = 4, R = 108;
  row('HEALTH', Math.round(b.health) + '%', b.health < 35 ? RED : HI, b.health / 100, L, R);
  row('BLOOD', Math.round(b.blood) + '%', b.blood < 70 ? AMB : HI, b.blood / 100, L, R);
  row('TEMP', b.temp.toFixed(1) + '°C', b.temp < 36 || b.temp > 38 ? AMB : HI, undefined, L, R);
  row('PULSE', pulse + ' BPM', pulse > 120 ? AMB : HI, undefined, L, R);
  row('LUCIDITY', Math.round(b.lucidity) + '%', b.lucidity < 50 ? AMB : HI, undefined, L, R);
  if (b.corruption > 0) row('DESYNC', Math.round(b.corruption) + '%', RED, undefined, L, R);
  const lost = (b as any).severed?.length ? lossSummary((b as any).severed) : '';
  if (lost && y < BOT - 10) { s.text('LOST ' + lost.toUpperCase(), L, y, AMB, 1, R - L); y += 9; }
  // right column: research upgrades
  s.vline(R + 4, TOP + 12, BOT - 2, DIM);
  let ry = TOP + 13;
  const rrow = (label: string, val: string, color = HI) => { s.text(label, R + 8, ry, MID); s.text(val, s.w - 4 - s.textW(val), ry, color); ry += 9; };
  if (hasUnlock('watch_calories')) {
    const hunger = b.hunger, thirst = b.thirst;
    rrow('STORED', `${Math.round(b.calories)} KCAL`, b.calories < 400 ? AMB : HI);
    rrow('HUNGER', `${Math.round(hunger)}%`, hunger > 60 ? AMB : HI);
    rrow('THIRST', `${Math.round(thirst)}%`, thirst > 60 ? AMB : HI);
    rrow('BURN', `${Math.round(burnRate(who))}/H`, MID);
    rrow('WEIGHT', `${b.weight.toFixed(1)} KG`, MID);
  } else lockedRow(s, R + 8, ry, 'CALORIE COUNT'), ry += 18;
  ry += 2;
  if (hasUnlock('watch_bp')) {
    const [sys, dia] = bloodPressure(who);
    const shock = sys < 90;
    rrow('BP', `${sys}/${dia}`, shock ? (blink(3) ? RED : AMB) : sys > 150 ? AMB : HI);
    if (shock) { s.text('SHOCK RISK', R + 8, ry, RED); ry += 9; }
  } else lockedRow(s, R + 8, ry, 'BLOOD PRESSURE'), ry += 18;
  // worst moodles at the bottom left
  const moods = b.moodles(who.heavyLoad()).sort((a: any, c: any) => c.level - a.level).slice(0, Math.max(0, Math.floor((BOT - 2 - y) / 9)));
  for (const m of moods) {
    drawMoodleGlyph(s as any, m.key, L, y, m.level >= 3 ? AMB : m.good ? MID : HI);
    s.text(m.name.toUpperCase(), L + 10, y, m.level >= 3 ? AMB : HI, 1, R - L - 32);
    for (let i = 0; i < 4; i++) s.rect(R - 20 + i * 5, y + 1, 4, 5, i < m.level ? (m.level >= 3 ? AMB : HI) : DIM);
    y += 9;
  }
  footer(s, self ? 'BIOMONITOR  · RESEARCH MORE SENSORS ON R&D' : 'READING ' + who.name.toUpperCase());
}

function lockedRow(s: Tube, x: number, y: number, name: string) { icon(s, 'lock', x, y, DIM); s.text(name, x + 8, y, FAINT); s.text('RESEARCH ON R&D', x, y + 9, FAINT); }

export function pulseOf(who: Player) {
  const b = who.body;
  return Math.round(who === G.local ? ((G.survival as any)?.mind?.bpm ?? 70) : 62 + b.panic * 0.7 + (1 - b.endurance) * 40 + (b.temp > 37.5 ? 12 : 0) - (b.asleep ? 8 : 0));
}
/** a plausible cuff reading from blood volume, pulse, panic, pain and drugs */
export function bloodPressure(who: Player): [number, number] {
  const b = who.body as any;
  const pulse = pulseOf(who);
  const vol = clamp(b.blood / 100, 0, 1);
  const sys = Math.round(clamp(118 * (0.45 + 0.55 * vol) + (pulse - 70) * 0.35 + b.panic * 0.15 + (b.stress ?? 0) * 0.1 - (b.sedated ?? 0) * 8 + (b.adrenaline ?? 0) * 10, 50, 220));
  const dia = Math.round(clamp(sys * 0.64 + (vol < 0.7 ? -6 : 0), 30, 130));
  return [sys, dia];
}
function burnRate(who: Player) { return 70 + (who.running ? 380 : who.speed > 0.2 ? 160 : 0) + (who.body.temp < 36 ? 60 : 0); }

/** DIAGNOSIS AI: body map, per-part findings and the AI's triage advice, TREAT */
function drawDiag(s: Tube, w: Watch, who: Player) {
  const b = who.body, t = G.time;
  const selIdx = ((w.st.sel % (BODY_PARTS.length + 1)) + BODY_PARTS.length + 1) % (BODY_PARTS.length + 1);
  const selPart: BodyPart | null = selIdx === 0 ? null : BODY_PARTS[selIdx - 1];
  paintBody((x, y, c) => s.px(BODY_X + x, BODY_Y + y, c), b, { faint: FAINT, dim: DIM, mid: MID, hi: HI, amb: AMB, red: RED, bg: BG }, selPart, t);
  zone(w, BODY_X, BODY_Y, BODY_W, BODY_H, () => {
    const hit = w.lastHit; if (!hit) return;
    const part = partAt(hit.x - BODY_X, hit.y - BODY_Y);
    if (part) w.st.sel = BODY_PARTS.indexOf(part) + 1;
  });
  const vx = 58;
  let vy = TOP + 13;
  if (selPart) {
    s.text(PART_NAMES[selPart].toUpperCase(), vx, vy, HI, 1, s.w - vx - 4); vy += 10;
    const injs = b.parts[selPart].injuries;
    const gone = !!((b as any).isSevered?.(selPart) ?? (b as any).severed?.includes?.(selPart));
    if (gone && !injs.length) { s.text('LIMB LOST', vx, vy, AMB); vy += 9; }
    else if (!injs.length) { s.text('NO DAMAGE', vx, vy, MID); vy += 9; }
    for (const inj of injs.slice(0, 3)) { s.text(describeInjury(inj), vx, vy, b.injuryBleed(inj) > 0.02 ? RED : AMB, 1, s.w - vx - 4); vy += 9; }
    button(s, w, 'TREAT', vx, BOT - 13, HI, () => openTreatMenu(who, selPart));
  }
  // the AI's advice: the worst problem first
  const adv = advice(who);
  vy += 3;
  s.rect(vx - 2, vy - 1, s.w - vx, 9, PANEL);
  s.text('AI TRIAGE', vx, vy, MAG); vy += 10;
  for (const ln of wrap(s, adv.toUpperCase(), s.w - vx - 4).slice(0, selPart ? 3 : 7)) { s.text(ln, vx, vy, HI); vy += 8; }
  footer(s, selPart ? 'WHEEL:PART  CLICK:SELECT  TREAT' : 'WHEEL/CLICK: SELECT A BODY PART');
}

function advice(who: Player): string {
  const b = who.body as any;
  let worst: { part: string; inj: Injury; bleed: number } | null = null;
  for (const part of BODY_PARTS) for (const inj of b.parts[part].injuries as Injury[]) {
    const bl = b.injuryBleed(inj);
    if (!worst || bl > worst.bleed) worst = { part, inj, bleed: bl };
  }
  if (worst && worst.bleed > 0.05) return `${PART_NAMES[worst.part as BodyPart]} is bleeding${worst.bleed > 0.3 ? ' heavily' : ''}. ${worst.inj.type === 'amputation' ? 'Tourniquet above the stump, then cauterise or stitch.' : 'Apply pressure and a clean bandage now.'}`;
  if (b.blood < 60) return 'Blood volume critical. Lie down, stay warm, drink fluids. Do not run.';
  for (const part of BODY_PARTS) for (const inj of b.parts[part].injuries as Injury[]) {
    if (inj.infection > 0.15) return `Infection in the ${PART_NAMES[part].toLowerCase()}. Disinfect and change the dressing; antibiotics if you have them.`;
    if (inj.foreign) return `Foreign body in the ${PART_NAMES[part].toLowerCase()}. Remove it with tweezers before you bandage.`;
    if (inj.type === 'fracture' && !inj.splinted) return `Suspected fracture: ${PART_NAMES[part].toLowerCase()}. Splint it.`;
    if (inj.bandage && !inj.bandage.clean) return `Dressing on the ${PART_NAMES[part].toLowerCase()} is dirty. Change it.`;
  }
  if (b.temp > 38.3) return 'Fever. Rest, fluids, and something for it.';
  if (b.temp < 35.8) return 'Hypothermia setting in. Get dry, get warm, eat.';
  if (b.thirst > 70) return 'Dehydrated. Drink before you do anything else.';
  if (b.hunger > 75) return 'Running on empty. Eat.';
  if (b.panic > 50) return 'Panic response. Breathe in for four, hold for four, out for four.';
  return 'No acute findings. Keep it that way.';
}

function describeInjury(inj: Injury): string {
  if (inj.type === 'amputation') { try { return 'STUMP: ' + stumpLabel(inj).toUpperCase(); } catch { /* fall through */ } }
  let t = INJURY_INFO[inj.type].name.toUpperCase();
  if (inj.bandage) t += inj.bandage.clean ? ' [BAND]' : ' [DIRTY]';
  if (inj.stitched) t += ' [STITCH]';
  if (inj.splinted) t += ' [SPLINT]';
  if (inj.foreign) t += ' [SHARD]';
  if ((inj as any).tq != null) t += ' [TQ]';
  if ((inj as any).caut) t += ' [SEARED]';
  if (inj.infection > 0.15) t += ' [INFECT]';
  return t;
}

function openTreatMenu(who: Player, part: BodyPart) {
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
}

/** MIND MONITOR: heart, breathing, mood, conditions, medication, triggers, the breathing coach */
function drawMind(s: Tube, w: Watch, who: Player) {
  const b = who.body, m = ensureMind(b);
  const mind = (G.survival as any)?.mind;
  const breathing = !!mind?.breathing;
  const vx = 62;
  let vy = TOP + 13;
  const pulse = pulseOf(who);
  const br = breathState(b, who.running, breathing);
  const kv = (k: string, v: string, c: number) => { s.text(k, vx, vy, MID); s.text(v, s.w - 4 - s.textW(v), vy, c); vy += 9; };
  kv('PULSE', `${pulse} BPM`, pulse > 125 ? AMB : HI);
  kv('BREATH', `${br} ${breathRate(br)}`, br === 'CALM' || br === 'SLOW' || br === 'DEEP' ? HI : AMB);
  const g = moodGlyph(b);
  const mood = ({ ok: 'STEADY', meh: 'FLAT', sad: 'DOWN', low: 'LOW', fear: 'AFRAID', attack: 'PANIC ATTACK', dissoc: 'UNREAL', sleep: 'ASLEEP', lonely: 'LONELY', tense: 'TENSE' } as Record<string, string>)[g];
  kv('MOOD', mood, g === 'attack' || g === 'fear' ? (blink(3) ? AMB : RED) : HI);
  vy += 1; s.hline(vx, s.w - 4, vy, DIM, 2); vy += 3;
  if (m.attack > 0) { s.text('PANIC ATTACK', vx, vy, blink(3) ? RED : AMB); vy += 9; s.para('IT WILL PASS. BREATHE SLOWLY.', vx, vy, s.w - vx - 4, HI, 8, 2); vy += 17; }
  const conds = conditions(b);
  if (!conds.length && m.attack <= 0) { s.text('NO LASTING STRAIN', vx, vy, MID); vy += 9; }
  const sel = conds.length ? ((w.st.sel % conds.length) + conds.length) % conds.length : 0;
  conds.slice(0, 4).forEach((c, i) => {
    s.text(c.name.toUpperCase(), vx, vy, i === sel ? HI : c.level >= 3 ? AMB : MID, 1, s.w - vx - 30);
    for (let k = 0; k < 4; k++) s.rect(s.w - 26 + k * 5, vy + 1, 4, 5, k < c.level ? (c.level >= 3 ? AMB : HI) : DIM);
    zone(w, vx, vy - 1, s.w - vx, 9, () => { w.st.sel = i; });
    vy += 9;
  });
  for (const ml of medsLines(b).slice(0, 1)) { if (vy < BOT - 24) { s.text(ml, vx, vy, ssriEffect(m) > 0.5 && ml.startsWith('SSRI') ? HI : MID, 1, s.w - vx - 4); vy += 9; } }
  const trig = topTrigger(m);
  if (trig && vy < BOT - 24) { s.text('TRIGGER: ' + trig[0].toUpperCase().replace('_', ' '), vx, vy, AMB, 1, s.w - vx - 4); }
  drawFace(s, g, 10, TOP + 14, 4, g === 'attack' || g === 'fear' ? AMB : HI);
  const cur = conds[sel];
  if (cur) { s.text('HELPS:', 4, TOP + 54, DIM); cur.tips.slice(0, 4).forEach((tp, i) => s.text(tp, 4, TOP + 63 + i * 9, MID, 1, 54)); }
  const bx = vx, by = BOT - 13;
  if (breathing) {
    const tt = mind.breathT as number, ph = Math.floor(tt / 4) % 4;
    s.frame(bx, by, 64, 11, HI);
    s.text(`${['IN', 'HOLD', 'OUT', 'HOLD'][ph]} ${4 - Math.floor(tt % 4)}`, bx + 4, by + 2, HI);
  } else button(s, w, 'BREATHE', bx, by, m.attack > 0 && blink(3) ? AMB : HI, () => { if (who === G.local) startBreathing(who); }, 64);
  footer(s, 'H:BREATHE  JOURNAL: NOTEBOOK + PEN');
}

const FACE_RING = ['..#####..', '.#.....#.', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '.#.....#.', '..#####..'];
const FACE_FEATURES: Record<string, [number, number][]> = {
  ok: [[3, 3], [5, 3], [2, 5], [3, 6], [4, 6], [5, 6], [6, 5]], meh: [[3, 3], [5, 3], [3, 6], [4, 6], [5, 6]],
  sad: [[3, 3], [5, 3], [3, 5], [4, 5], [5, 5], [2, 6], [6, 6]], low: [[2, 3], [3, 3], [5, 3], [6, 3], [3, 6], [4, 5], [5, 6], [6, 4]],
  fear: [[3, 2], [3, 3], [5, 2], [5, 3], [4, 5], [3, 6], [5, 6], [4, 7]], attack: [[3, 3], [5, 3], [3, 5], [4, 5], [5, 5], [3, 6], [5, 6], [4, 6]],
  dissoc: [[2, 3], [3, 2], [3, 4], [5, 3], [6, 2], [6, 4], [3, 6], [4, 6], [5, 6]], sleep: [[2, 4], [3, 4], [5, 4], [6, 4], [4, 6]],
  lonely: [[3, 3], [5, 3], [6, 4], [6, 5], [3, 6], [4, 6]], tense: [[3, 3], [5, 3], [2, 6], [3, 5], [4, 6], [5, 5], [6, 6], [7, 2], [7, 3]],
};
function drawFace(s: Tube, g: string, x: number, y: number, sc: number, c: number) {
  const dot = (i: number, j: number) => s.rect(x + i * sc, y + j * sc, sc - 1, sc - 1, c);
  FACE_RING.forEach((r, j) => { for (let i = 0; i < 9; i++) if (r[i] === '#') dot(i, j); });
  for (const [i, j] of FACE_FEATURES[g] || []) dot(i, j);
}

// ================================================================ LOGBOOK
export function drawLog(s: Tube, w: Watch) {
  const p = G.local;
  const tab = tabs(s, w, 'dataTab', ['SKILLS', 'CODEX', 'FILE'], [true, true, true]);
  let y = TOP + 13;
  if (tab === 0) {
    const sel = Math.max(0, w.st.sel % SKILLS.length);
    const start = Math.max(0, Math.min(Math.max(0, sel - 5), SKILLS.length - 11));
    for (const sk of SKILLS.slice(start, start + 11)) {
      const v = p.body.skills[sk.key];
      s.text(sk.name.toUpperCase(), 6, y, MID);
      for (let i = 0; i < 10; i++) s.rect(110 + i * 9, y, 7, 6, i < v.level ? HI : DIM);
      y += 9;
    }
  } else if (tab === 1) {
    const known = [...new Set([...(G.creatures?.creatures.values() || [])].filter((c: any) => c.scanned).map((c: any) => c.sp.key)), ...(G.missions?.codex || []), ...[...(G.missions?.flags || [])].filter((f: string) => f.startsWith('scan:')).map((f: string) => f.slice(5))];
    const list = allSpecies().filter((sp: any) => known.includes(sp.key)) as any[];
    if (!list.length) { s.para('NO SPECIMENS CATALOGUED. SCAN CREATURES WITH THE ANOMALY SCAN FUNCTION.', 6, y, s.w - 12, MID); }
    else {
      const sel = ((w.st.sel % list.length) + list.length) % list.length;
      const sp = list[sel];
      s.text(`${sel + 1}/${list.length}`, s.w - 30, y, MID);
      s.text(sp.name.toUpperCase(), 6, y, HI, 1, s.w - 40); y += 9;
      s.text(sp.code, 6, y, MID, 1, s.w - 12); y += 9;
      s.text('CLASS: ' + sp.scan.cls.toUpperCase(), 6, y, MID, 1, s.w - 12); y += 9;
      s.text('THREAT', 6, y, MID); for (let i = 0; i < 5; i++) s.rect(50 + i * 7, y, 5, 6, i < sp.threat ? (sp.threat >= 3 ? AMB : HI) : DIM); y += 11;
      for (const n of sp.scan.notes) { y += s.para('- ' + n, 6, y, s.w - 12, HI, 8, 4) * 8 + 1; if (y > BOT - 10) break; }
    }
  } else {
    const occ = occupationByKey(p.occupation);
    s.text(p.name.toUpperCase(), 6, y, HI); y += 9;
    s.text('ROLE: ' + occ.name.toUpperCase(), 6, y, MID, 1, s.w - 12); y += 9;
    const traits = [...p.body.traits].map((t) => traitByKey(t)?.name || t).join(', ') || 'NONE';
    y += s.para('TRAITS: ' + traits.toUpperCase(), 6, y, s.w - 12, MID, 8, 3) * 8 + 2;
    const perks = [...p.body.perks].map((k) => PERKS[k]).filter(Boolean).join(', ');
    if (perks) y += s.para('PERKS: ' + perks.toUpperCase(), 6, y, s.w - 12, DIM, 8, 2) * 8 + 2;
    s.text(`SURVIVED ${Math.floor(G.clock.hours / 24)}D ${Math.floor(G.clock.hours % 24)}H`, 6, y, HI); y += 9;
    s.text(`ENTITIES DOWNED: ${p.kills}`, 6, y, MID); y += 9;
    s.text(`CARRY ${p.carriedWeight().toFixed(1)}/${p.capacity().toFixed(0)} KG`, 6, y, MID);
  }
  footer(s, 'WHEEL:SCROLL  CLICK TABS');
}

// ================================================================ TOOL (the multi-tool)
export function drawTool(s: Tube, w: Watch) {
  const L = w.laser;
  let y = TOP + 2;
  s.text('MULTI-TOOL', 4, y, HI);
  s.text('CHARGE', s.w - 98, y, MID);
  s.bar(s.w - 54, y, 50, 7, L.charge / L.capacity(), L.charge < 0.15 * L.capacity() ? (blink(3) ? RED : AMB) : GRN, BG);
  y += 12;
  const mods: [string, string, string][] = [
    ['tool_torch', 'TORCH', 'F TOGGLES THE BEZEL LED'],
    ['tool_beam', 'BEAM', 'SCAN RANGE X2, SPEED X2'],
    ['tool_laser', 'CUTTER', 'ARM, POINT, CLICK: CUTS'],
    ['tool_weld', 'WELDER', 'LOW POWER ARC: JOINS METAL'],
    ['tool_cell', 'CELL', 'DOUBLE CHARGE'],
    ['tool_fab', 'FAB', 'FIELD CRAFTING (FAB)'],
  ];
  for (const [key, name, desc] of mods) {
    const own = hasUnlock(key);
    if (own) icon(s, 'check', 4, y, GRN); else icon(s, 'lock', 4, y, DIM);
    s.text(name, 12, y, own ? HI : FAINT);
    s.text(own ? desc : 'RESEARCH ON R&D', 64, y, own ? MID : FAINT, 1, s.w - 68);
    y += 9;
  }
  y += 3;
  s.hline(2, s.w - 3, y, DIM, 2); y += 4;
  let x = 4;
  const modeBtn = (mode: 'cut' | 'weld', label: string, key: string) => {
    if (!hasUnlock(key)) return;
    const on = L.armed && L.mode === mode;
    x += button(s, w, on ? label + ' ON' : label, x, y, on ? RED : HI, () => { if (on) L.arm(false); else { L.mode = mode; L.arm(true); } }) + 4;
  };
  modeBtn('cut', 'ARM CUTTER', 'tool_laser');
  modeBtn('weld', 'ARM WELDER', 'tool_weld');
  if (hasUnlock('tool_torch')) {
    const on = !!G.local?.flashlightOn && w.torchOwned();
    x += button(s, w, on ? 'TORCH ON' : 'TORCH', x, y, on ? AMB : HI, () => w.toggleTorch()) + 4;
  }
  if (x === 4) s.para('NO MODULES YET. THE R&D TREE TURNS THIS WATCH INTO A MULTI-TOOL: TORCH, SCANNER BEAM, LASER CUTTER, WELDER, FABRICATOR.', 4, y, s.w - 8, MID, 8, 3);
  footer(s, L.armed ? 'ARMED: CLICK THE WORLD TO FIRE  TAB:LOWER' : 'MULTI-TOOL  · MODULES FROM R&D');
}

// ================================================================ FAB (field crafting)
export function drawFab(s: Tube, w: Watch) {
  const p = G.local;
  const list = w.fab.list();
  if (!list.length) { s.para('NO FIELD PATTERNS LOADED. RECIPES THE FABRICATOR CAN FOLD APPEAR HERE.', 6, TOP + 6, s.w - 12, MID); footer(s, 'FAB'); return; }
  const sel = ((w.st.sel % list.length) + list.length) % list.length;
  w.st.sel = sel;
  const start = Math.max(0, Math.min(sel - 3, list.length - 7));
  let y = TOP + 2;
  list.slice(start, start + 7).forEach((r, j) => {
    const i = start + j, on = i === sel;
    const chk = checkRecipe(p, r);
    if (on) s.rect(0, y - 1, s.w, 9, FAINT);
    s.text(on ? '▸' : '•', 3, y, on ? HI : MID);
    s.text(r.name.toUpperCase(), 12, y, chk.ok ? (on ? HI : MID) : DIM, 1, s.w - 40);
    if (chk.ok) icon(s, 'check', s.w - 10, y, GRN);
    zone(w, 0, y - 1, s.w, 9, () => { if (w.st.sel === i && chk.ok) w.fab.craft(r); else w.st.sel = i; });
    y += 9;
  });
  const r = list[sel], chk = checkRecipe(p, r);
  const iy = BOT - 34;
  s.rect(0, iy, s.w, BOT - iy, PANEL); s.hline(0, s.w - 1, iy, DIM);
  const needs = r.inputs.map((inp) => `${inp.count && inp.count > 1 ? inp.count + '× ' : ''}${inp.item.startsWith('#') ? inp.item.slice(1) : itemName({ key: inp.item } as any)}${inp.keep ? ' (TOOL)' : ''}`).join(', ');
  s.para(('NEEDS: ' + needs).toUpperCase(), 4, iy + 3, s.w - 8, chk.ok ? MID : AMB, 8, 2);
  if (chk.ok) button(s, w, 'FABRICATE', 4, BOT - 13, GRN, () => w.fab.craft(r));
  else s.text(('MISSING ' + chk.missing.slice(0, 2).join(', ')).toUpperCase(), 4, BOT - 10, RED, 1, s.w - 8);
  s.text('CHARGE ' + Math.round(w.laser.charge / w.laser.capacity() * 100) + '%', s.w - 70, BOT - 10, MAG);
  footer(s, 'CLICK TWICE / FABRICATE  WHEEL:SELECT');
}
