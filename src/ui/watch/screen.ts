// What the watch's LCD shows. A cyan-on-black cyberpunk LCD (5x7 font, the
// shared Screen buffer): a header with the function name, research points and
// the clock, a dock of the functions you own, the page, a footer of hints.
// While you move the screen shrinks to a GLANCE: big text, the tracked quest's
// next objective and a bearing to it. Pages register clickable zones in
// screen pixels; the watch maps clicks and taps onto them.
import { G } from '../../game/G';
import { Screen } from '../font5x7';
import { researchPoints, researchNodes, hasUnlock, canBuy, buyNode, type ResearchNode } from '../../game/research';
import { BRANCHES } from './nodes';
import type { Watch } from './watch';
import type { QView } from '../../missions/questRuntime';
import { angleDiff } from '../../core/math';

const C = (h: number) => Screen.c(h);
export const PAL = {
  BG: C(0x05090f), PANEL: C(0x0a1520), FAINT: C(0x0b1c26), DIM: C(0x173847), MID: C(0x2f97ad), HI: C(0xaaf6ff),
  AMB: C(0xffb84a), RED: C(0xff4a5a), MAG: C(0xff5ad8), GRN: C(0x7cff8a), INK: C(0x02060a),
};
const { BG, PANEL, FAINT, DIM, MID, HI, AMB, RED, MAG, GRN, INK } = PAL;
export const TOP = 21, BOT = 125;

// ---------------------------------------------------------------- tiny icons (5x7)
const ICONS: Record<string, string[]> = {
  rp: ['..#..', '.###.', '##.##', '#...#', '##.##', '.###.', '..#..'],
  scrip: ['.###.', '#...#', '#.#.#', '#.#.#', '#.#.#', '#...#', '.###.'],
  check: ['.....', '....#', '...##', '#.##.', '###..', '.#...', '.....'],
  warn: ['..#..', '..#..', '.#.#.', '.#.#.', '#.#.#', '#...#', '#####'],
  lock: ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'],
  up: ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '.....'],
  pin: ['.###.', '#####', '#####', '.###.', '..#..', '..#..', '..#..'],
};
export function icon(s: Screen, k: string, x: number, y: number, c: number, sc = 1) {
  const rows = ICONS[k]; if (!rows) return;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (rows[j][i] === '#') { if (sc === 1) s.px(x + i, y + j, c); else s.rect(x + i * sc, y + j * sc, sc, sc, c); }
}

export type Zone = { x: number; y: number; w: number; h: number; fn: () => void };
export function zone(w: Watch, x: number, y: number, ww: number, h: number, fn: () => void) { (w.st.clickZones as Zone[]).push({ x, y, w: ww, h, fn }); }
export function button(s: Screen, w: Watch, label: string, x: number, y: number, c: number, fn: (() => void) | null, minW = 0) {
  const bw = Math.max(minW, s.textW(label) + 6);
  if (fn) { s.rect(x, y, bw, 11, c === DIM ? PANEL : FAINT); s.frame(x, y, bw, 11, c); zone(w, x, y, bw, 11, fn); }
  else s.frame(x, y, bw, 11, DIM);
  s.text(label, x + 3, y + 2, fn ? c : DIM);
  return bw;
}
export function footer(s: Screen, txt: string) {
  s.rect(0, BOT + 1, s.w, s.h - BOT - 1, BG);
  s.hline(2, s.w - 3, BOT + 1, DIM, 2);
  s.text(txt, 3, BOT + 3, DIM, 1, s.w - 6);
}
const blink = (hz = 2) => Math.floor(G.time * hz) % 2 === 0;
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

// ================================================================ the frame
export function drawWatch(s: Screen, w: Watch) {
  s.clear(0x05090f);
  w.st.clickZones = [] as Zone[];
  if (w.small) { drawGlance(s, w); return; }
  const fn = w.fn();
  // header
  s.rect(0, 0, s.w, 10, DIM);
  s.text(fn?.name || 'WATCH', 3, 2, HI, 1, 110);
  const clock = G.clock.timeString();
  s.text(clock, s.w - s.textW(clock) - 3, 2, HI);
  const rp = String(researchPoints());
  const rx = s.w - s.textW(clock) - 12 - s.textW(rp);
  icon(s, 'rp', rx - 7, 2, MAG); s.text(rp, rx, 2, MAG);
  // dock: the functions you own
  let x = 2;
  for (const pg of w.pages) {
    const lb = pg.label, on = pg.key === w.page, bw = s.textW(lb) + 4;
    if (x + bw > s.w) break;
    if (on) s.rect(x, 11, bw, 9, MID);
    s.text(lb, x + 2, 12, on ? INK : MID);
    if (pg.key === 'qst' && w.quests?.fresh.size && blink(3)) s.rect(x + bw - 2, 11, 2, 2, AMB);
    zone(w, x, 10, bw, 11, () => w.press(pg.key));
    x += bw + 2;
  }
  s.hline(0, s.w - 1, 20, DIM);
  try { fn?.draw(s, w); } catch (e) { s.text('FUNCTION FAULT', 6, 40, RED); console.warn('watch page', e); }
  // the simulation's decay bleeds into the display
  const p = G.local;
  const glitch = Math.max(G.collapse, (p?.body.corruption ?? 0) / 100);
  if (glitch > 0.15) for (let i = 0; i < glitch * 30; i++) { const gx = Math.random() * s.w | 0, gy = Math.random() * s.h | 0; s.rect(gx, gy, 1 + (Math.random() * 6 | 0), 1, Math.random() < 0.5 ? HI : BG); }
}

// ================================================================ glance (on the move)
function drawGlance(s: Screen, w: Watch) {
  const Q = w.quests, p = G.local;
  const peek = w.peekKey ? Q?.view(w.peekKey) : null;
  // threat radar takes over when something is close
  const threat = w.threat;
  if (threat && hasUnlock('watch_radar')) {
    s.rect(0, 0, s.w, s.h, blink(4) ? C(0x2a0508) : BG);
    s.frame(0, 0, s.w, s.h, RED); s.frame(1, 1, s.w - 2, s.h - 2, RED);
    icon(s, 'warn', 8, 8, RED, 3);
    s.text('CONTACT', 34, 10, RED, 2);
    s.text(`${threat.n} HOSTILE`, 8, 40, AMB, 2);
    s.text(`${threat.d.toFixed(0)}M ${threat.side}`, 8, 64, HI, 2);
    arrow(s, s.w - 34, 92, 22, threat.rel, RED);
    return;
  }
  // an incoming call
  const sg = w.st.signal;
  if (w.peekKey === '__signal' && sg) {
    s.rect(0, 0, s.w, s.h, blink(3) ? C(0x1a0a20) : BG);
    s.text('INCOMING', 8, 20, MAG, 3);
    s.text(String(sg.from).toUpperCase(), 8, 56, HI, 2, s.w - 16);
    s.text(String(sg.text).toUpperCase(), 8, 82, MID, 2, s.w - 16);
    return;
  }
  const fk = peek ? null : Q?.focus();
  const v = peek || (fk ? Q!.view(fk) : null);
  if (peek) {
    s.rect(0, 0, s.w, 18, blink(3) ? MAG : DIM);
    icon(s, 'up', 4, 2, INK, 2);
    s.text(peek.status === 'done' ? 'COMPLETE' : peek.status === 'ready' ? 'TURN IN' : 'UPLOAD', 20, 2, INK, 2);
  } else {
    s.rect(0, 0, s.w, 18, DIM);
    s.text(v ? 'QUEST' : 'WATCH', 4, 2, HI, 2);
    const rp = String(researchPoints());
    icon(s, 'rp', s.w - 14 - s.textW(rp, 2), 2, MAG, 2);
    s.text(rp, s.w - 2 - s.textW(rp, 2), 2, MAG, 2);
  }
  if (!v) {
    const t = G.clock.timeString();
    s.text(t, (s.w - s.textW(t, 4)) / 2, 44, HI, 4);
    s.text('NO ACTIVE QUEST', (s.w - s.textW('NO ACTIVE QUEST', 1)) / 2, 90, MID);
    return;
  }
  s.text(v.title.toUpperCase(), 4, 24, HI, 2, s.w - 8);
  if (peek && peek.status !== 'act') {
    s.text(peek.giver.toUpperCase(), 4, 44, MID, 2, s.w - 8);
    if (peek.rewardText) s.text(peek.rewardText, 4, 66, MAG, 2, s.w - 8);
    s.text('TAB TO OPEN', 4, 112, DIM, 2);
    return;
  }
  const next = v.objectives.find((o) => !o.done && !o.optional) || v.objectives.find((o) => !o.done);
  if (next) {
    paraBig(s, '▸' + next.text.toUpperCase(), 4, 46, s.w - 8, MID, 2);
    if (next.prog > 0 && next.prog < 1) { s.bar(4, 86, s.w - 8, 8, next.prog, HI, BG); }
  } else if (v.status === 'ready') {
    s.text('READY: ' + v.costText, 4, 50, AMB, 2, s.w - 8);
  }
  // bearing to the objective
  const tg = Q?.target(v.key);
  if (tg && p && tg.zone === p.zoneKey) {
    const d = Math.hypot(tg.x - p.x, tg.z - p.z);
    const rel = angleDiff(p.facing, Math.atan2(tg.z - p.z, tg.x - p.x));
    arrow(s, 20, 114, 14, rel, AMB);
    s.text(`${d.toFixed(0)}M`, 40, 108, AMB, 2);
  }
  const done = v.objectives.filter((o) => o.done && !o.optional).length, tot = v.objectives.filter((o) => !o.optional).length;
  const t = `${done}/${tot}`;
  s.text(t, s.w - 4 - s.textW(t, 2), 108, DIM, 2);
}

function paraBig(s: Screen, txt: string, x: number, y: number, w: number, c: number, sc: number) {
  const words = txt.split(/\s+/); let line = '', n = 0;
  const lh = 8 * sc + 2;
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (s.textW(t, sc) > w && line) { if (n < 2) s.text(line, x, y + n * lh, c, sc); n++; line = wd; } else line = t;
  }
  if (line && n < 2) s.text(line, x, y + n * lh, c, sc, w);
}

export function arrow(s: Screen, cx: number, cy: number, r: number, rel: number, c: number) {
  s.circle(cx, cy, r, DIM);
  const ex = cx + Math.sin(rel) * r * 0.85, ey = cy - Math.cos(rel) * r * 0.85;
  s.line(cx, cy, ex, ey, c);
  s.disc(ex, ey, 2, c);
}

// ================================================================ QUESTS
const QTABS = ['ACTIVE', 'OFFERS', 'DONE'] as const;
const QTAB_KEYS = ['active', 'offers', 'done'] as const;

export function drawQuests(s: Screen, w: Watch) {
  const Q = w.quests;
  if (!Q) { s.text('NO UPLINK', 6, 30, RED); return; }
  const st = w.st;
  if (st.qOpen) { drawQuestDetail(s, w, st.qOpen); return; }
  const tab = st.qTab ?? 0;
  const lists = QTAB_KEYS.map((k) => Q.list(k));
  let x = 2;
  QTABS.forEach((lb, i) => {
    const n = lists[i].length;
    const t = i < 2 ? `${lb} ${n}` : lb;
    const bw = s.textW(t) + 6, on = tab === i;
    s.rect(x, TOP, bw, 9, on ? DIM : BG);
    s.text(t, x + 3, TOP + 1, on ? HI : MID);
    if (i === 1 && [...Q.fresh].some((k) => Q.status(k) === 'off') && blink(3)) s.rect(x + bw - 2, TOP, 2, 2, AMB);
    zone(w, x, TOP, bw, 9, () => { st.qTab = i; st.sel = 0; });
    x += bw + 2;
  });
  const list = lists[tab];
  if (!list.length) {
    s.para(tab === 0 ? 'NO ACTIVE QUESTS. CHECK OFFERS: THE UPLINK PICKS UP WORK FROM ANYONE WHO KNOWS YOUR NUMBER.' : tab === 1 ? 'NO OFFERS RIGHT NOW. KEEP WORKING. SOMETHING WILL REACH OUT.' : 'NOTHING FINISHED YET.', 6, TOP + 16, s.w - 12, MID);
    footer(s, 'TAB:CLOSE  [ ]:FUNCTION  WHEEL:SELECT');
    return;
  }
  const sel = ((st.sel % list.length) + list.length) % list.length;
  st.sel = sel;
  const rows = 10, start = Math.max(0, Math.min(sel - 4, list.length - rows));
  const focus = tab === 0 ? Q.focus() : null;
  let y = TOP + 12;
  list.slice(start, start + rows).forEach((v, j) => {
    const i = start + j, on = i === sel;
    if (on) s.rect(0, y - 1, s.w, 9, FAINT);
    drawRowGlyph(s, w, v, 3, y, on, focus);
    const tc = v.status === 'decl' ? DIM : on ? HI : v.def.main ? HI : MID;
    const rw = v.def.reward?.rp ? s.textW(`+${v.def.reward.rp}`) + 8 : 0;
    s.text(v.title.toUpperCase(), 12, y, tc, 1, s.w - 16 - rw);
    if (rw) { const t = `+${v.def.reward!.rp}`; s.text(t, s.w - 3 - s.textW(t), y, MAG); icon(s, 'rp', s.w - 10 - s.textW(t), y, MAG); }
    zone(w, 0, y - 1, s.w, 9, () => { if (st.sel === i) w.openQuest(v.key); else st.sel = i; });
    y += 9;
  });
  w.st.qHover = list[sel]?.key;
  footer(s, 'CLICK:OPEN  WHEEL:SELECT  [ ]:FUNCTION');
}

function drawRowGlyph(s: Screen, w: Watch, v: QView, x: number, y: number, on: boolean, focus: string | null) {
  const Q = w.quests!;
  if (v.status === 'ready') { icon(s, 'scrip', x, y, AMB); return; }
  if (v.status === 'done') { icon(s, 'check', x, y, GRN); return; }
  if (v.status === 'decl') { s.text('×', x, y, DIM); return; }
  if (Q.fresh.has(v.key) && blink(3)) { s.text('!', x, y, AMB); return; }
  if (focus === v.key && v.status === 'act') { icon(s, 'pin', x, y, AMB); return; }
  s.text(on ? '▸' : '•', x, y, on ? HI : MID);
}

function drawQuestDetail(s: Screen, w: Watch, key: string) {
  const Q = w.quests!, st = w.st;
  const v = Q.view(key);
  if (!v || !v.rec) { st.qOpen = null; return; }
  Q.fresh.delete(key);
  button(s, w, '←', 2, TOP - 1, MID, () => { st.qOpen = null; });
  const cat = (v.category || '').toUpperCase();
  s.text(cat, 18, TOP + 1, v.def.main ? AMB : DIM);
  s.text(v.giver.toUpperCase(), s.w - 3 - Math.min(s.textW(v.giver), 120), TOP + 1, DIM, 1, 120);
  // body scrolls with the wheel
  const bodyTop = TOP + 12, bodyBot = BOT - 14;
  let y = bodyTop - (st.dScroll ?? 0) * 9;
  const put = (fn: (yy: number) => void, h = 9) => { if (y >= bodyTop && y + 7 <= bodyBot) fn(y); y += h; };
  // title (wrapped, up to two lines)
  for (const ln of wrap(s, v.title.toUpperCase(), s.w - 8).slice(0, 2)) put((yy) => s.text(ln, 4, yy, HI));
  y += 1;
  for (const o of v.objectives) {
    const lines = wrap(s, o.text.toUpperCase(), s.w - 28);
    lines.forEach((ln, k) => put((yy) => {
      if (k === 0) { if (o.done) icon(s, 'check', 5, yy, GRN); else s.frame(4, yy, 7, 7, o.optional ? DIM : HI); }
      s.text(ln, 15, yy, o.done ? DIM : o.optional ? MID : HI);
      if (k === lines.length - 1 && !o.done && o.prog > 0) s.bar(s.w - 26, yy + 1, 22, 5, o.prog, AMB, BG);
    }));
  }
  y += 2;
  if (v.rewardText) put((yy) => { s.text('REWARD', 4, yy, DIM); s.text(v.rewardText, 46, yy, MAG, 1, s.w - 50); });
  if (v.costText) put((yy) => { s.text('COST', 4, yy, DIM); s.text(v.costText, 46, yy, AMB, 1, s.w - 50); });
  if (v.costText && v.payNote) put((yy) => s.text(v.payNote, 46, yy, v.affordable ? DIM : RED, 1, s.w - 50));
  y += 2;
  for (const ln of wrap(s, v.desc, s.w - 8)) put((yy) => s.text(ln, 4, yy, MID), 8);
  const total = Math.ceil((y + (st.dScroll ?? 0) * 9 - bodyTop) / 9);
  st.dMax = Math.max(0, total - Math.floor((bodyBot - bodyTop) / 9));
  if (st.dMax > 0) { const k = (st.dScroll ?? 0) / st.dMax; s.vline(s.w - 1, bodyTop, bodyBot, FAINT); s.rect(s.w - 2, bodyTop + Math.round(k * (bodyBot - bodyTop - 8)), 2, 8, MID); }
  // actions
  const by = BOT - 12;
  s.rect(0, by - 2, s.w, 14, BG);
  s.hline(0, s.w - 1, by - 2, DIM);
  let x = 3;
  const act = (label: string, c: number, fn: (() => void) | null) => { x += button(s, w, label, x, by, c, fn) + 4; };
  switch (v.status) {
    case 'off': case 'decl':
      act('ACCEPT', GRN, () => w.questAct(key, 'accept'));
      if (v.status === 'off' && !v.def.main) act('DECLINE', DIM, () => w.questAct(key, 'decline'));
      if (v.def.cost?.payOnAccept) s.text(v.payNote, x, by + 2, v.affordable ? DIM : RED, 1, s.w - x - 3);
      break;
    case 'act': {
      const pinned = Q.focus() === key;
      act(pinned ? 'TRACKED' : 'TRACK', pinned ? AMB : MID, pinned ? null : () => Q.track(key));
      if (!v.def.main) act('ABANDON', DIM, () => w.questAct(key, 'abandon'));
      const done = v.objectives.filter((o) => o.done && !o.optional).length, tot = v.objectives.filter((o) => !o.optional).length;
      s.text(`${done}/${tot}`, s.w - 4 - s.textW(`${done}/${tot}`), by + 2, DIM);
      break;
    }
    case 'ready':
      act(v.def.cost?.scrip ? `PAY ${fmt(v.def.cost.scrip)} & FINISH` : 'HAND IN', AMB, v.affordable ? () => w.questAct(key, 'pay') : null);
      if (!v.affordable) s.text(v.payNote, x, by + 2, RED, 1, s.w - x - 3);
      break;
    case 'done':
      icon(s, 'check', x, by + 2, GRN); s.text(v.rec.n > 1 ? `COMPLETED ×${v.rec.n}` : 'COMPLETED', x + 8, by + 2, GRN);
      if (v.def.repeatable) s.text('REPEATS', s.w - 46, by + 2, DIM);
      break;
  }
  st.dAct = v.status;
}

export function wrap(s: Screen, txt: string, w: number): string[] {
  const out: string[] = []; let line = '';
  for (const wd of txt.split(/\s+/)) {
    const t = line ? line + ' ' + wd : wd;
    if (s.textW(t) > w && line) { out.push(line); line = wd; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// ================================================================ RESEARCH (the tree)
interface Laid { n: ResearchNode; col: number; row: number }
let layCache: { sig: string; laid: Laid[] } | null = null;

export function layoutBranch(branch: string): Laid[] {
  const nodes = researchNodes(branch);
  const sig = branch + ':' + nodes.map((n) => n.key).join(',');
  if (layCache?.sig === sig) return layCache.laid;
  const by = new Map(nodes.map((n) => [n.key, n]));
  const depth = new Map<string, number>();
  const dep = (n: ResearchNode, guard = 0): number => {
    if (depth.has(n.key)) return depth.get(n.key)!;
    let d = 0;
    if (guard < 12) for (const r of n.requires || []) { const q = by.get(r); if (q) d = Math.max(d, dep(q, guard + 1) + 1); }
    depth.set(n.key, d); return d;
  };
  const rows: number[] = [];
  const laid: Laid[] = [];
  // children sit next to their first parent where they can
  const order = [...nodes].sort((a, b) => dep(a) - dep(b));
  const rowOf = new Map<string, number>();
  for (const n of order) {
    const col = dep(n);
    const parent = (n.requires || []).map((r) => rowOf.get(r)).find((r) => r !== undefined);
    let row = Math.max(rows[col] ?? 0, parent ?? 0);
    rows[col] = row + 1;
    rowOf.set(n.key, row);
    laid.push({ n, col, row });
  }
  laid.sort((a, b) => a.col - b.col || a.row - b.row);
  layCache = { sig, laid };
  return laid;
}

const NODE_W = 17, NODE_H = 11, COL_W = 36, ROW_H = 14;

export function drawResearch(s: Screen, w: Watch) {
  const st = w.st;
  const bi = ((st.branch ?? 0) % BRANCHES.length + BRANCHES.length) % BRANCHES.length;
  const br = BRANCHES[bi];
  // branch tabs
  let x = 2;
  BRANCHES.forEach((b, i) => {
    const on = i === bi, bw = s.textW(b.label) + 4;
    s.rect(x, TOP, bw, 9, on ? DIM : BG);
    s.text(b.label, x + 2, TOP + 1, on ? HI : researchNodes(b.key).length ? MID : FAINT);
    zone(w, x, TOP, bw, 9, () => { st.branch = i; st.rSel = 0; st.rScroll = 0; });
    x += bw + 2;
  });
  const rp = String(researchPoints());
  icon(s, 'rp', s.w - 10 - s.textW(rp), TOP + 1, MAG); s.text(rp, s.w - 3 - s.textW(rp), TOP + 1, MAG);
  const laid = layoutBranch(br.key);
  const gTop = TOP + 12, gBot = BOT - 34;
  if (!laid.length) {
    s.text(br.name, 6, gTop + 2, HI);
    s.para('NO RESEARCH FILED IN THIS BRANCH YET. MERIDIAN UPLOADS NEW SCHEMATICS AS THE PROGRAMME GROWS.', 6, gTop + 14, s.w - 12, MID);
    footer(s, '[ ]:FUNCTION  CLICK:BRANCH');
    return;
  }
  const sel = ((st.rSel ?? 0) % laid.length + laid.length) % laid.length;
  st.rSel = sel;
  const cur = laid[sel];
  // keep the selection on screen
  const visRows = Math.floor((gBot - gTop) / ROW_H);
  const maxCol = Math.max(...laid.map((l) => l.col));
  let scroll = st.rScroll ?? 0;
  if (cur.row < scroll) scroll = cur.row; else if (cur.row >= scroll + visRows) scroll = cur.row - visRows + 1;
  st.rScroll = scroll;
  let colX = st.rColX ?? 0;
  const visCols = Math.floor((s.w - 4) / COL_W);
  if (cur.col < colX) colX = cur.col; else if (cur.col >= colX + visCols) colX = cur.col - visCols + 1;
  st.rColX = colX;
  const pos = (l: Laid) => ({ x: 4 + (l.col - colX) * COL_W, y: gTop + (l.row - scroll) * ROW_H });
  const vis = (y: number) => y >= gTop - 1 && y + NODE_H <= gBot + 1;
  const where = new Map(laid.map((l) => [l.n.key, l]));
  // connectors first
  for (const l of laid) for (const r of l.n.requires || []) {
    const p = where.get(r); if (!p) continue;
    const a = pos(p), b = pos(l);
    const c = hasUnlock(r) ? MID : DIM;
    const x0 = a.x + NODE_W, y0 = a.y + NODE_H / 2 | 0, x1 = b.x - 1, y1 = b.y + NODE_H / 2 | 0, mx = x0 + 4;
    const clip = (yy: number) => Math.max(gTop, Math.min(gBot, yy));
    if (vis(a.y)) s.hline(x0, mx, y0, c);
    s.vline(mx, clip(Math.min(y0, y1)), clip(Math.max(y0, y1)), c);
    if (vis(b.y)) s.hline(mx, x1, y1, c);
  }
  // nodes
  laid.forEach((l, i) => {
    const { x: nx, y: ny } = pos(l);
    if (!vis(ny) || nx > s.w - NODE_W) return;
    const n = l.n, own = hasUnlock(n.key), buy = canBuy(n.key);
    const reqOk = !(n.requires || []).some((r) => !hasUnlock(r));
    const gated = !!n.gate && !safeGate(n);
    const fg = own ? GRN : buy ? HI : gated ? AMB : reqOk ? MID : DIM;
    s.rect(nx, ny, NODE_W, NODE_H, own ? C(0x0d2a18) : buy ? FAINT : BG);
    s.frame(nx, ny, NODE_W, NODE_H, fg);
    const g = glyph(n);
    if (!reqOk && !own) icon(s, 'lock', nx + 6, ny + 2, DIM);
    else s.text(g, nx + (NODE_W - s.textW(g)) / 2 + 1, ny + 2, fg);
    if (i === sel) { const c = blink(3) ? HI : MID; s.frame(nx - 2, ny - 2, NODE_W + 4, NODE_H + 4, c); }
    zone(w, nx - 1, ny - 1, NODE_W + 2, NODE_H + 2, () => { if (st.rSel === i) w.buyResearch(n.key); else st.rSel = i; });
  });
  if (laid.some((l) => l.row >= scroll + visRows)) s.text('↓', s.w - 8, gBot - 7, MID);
  if (scroll > 0) s.text('↑', s.w - 8, gTop, MID);
  if (maxCol >= colX + visCols) s.text('→', s.w - 8, gTop + 20, MID);
  // the selected node
  const n = cur.n, own = hasUnlock(n.key), buy = canBuy(n.key);
  const iy = gBot + 2;
  s.rect(0, iy, s.w, BOT - iy + 1, PANEL);
  s.hline(0, s.w - 1, iy, DIM);
  s.text(n.title.toUpperCase(), 4, iy + 3, own ? GRN : HI, 1, s.w - 60);
  if (own) { icon(s, 'check', s.w - 46, iy + 3, GRN); s.text('OWNED', s.w - 36, iy + 3, GRN); }
  else { const t = `${n.cost}`; icon(s, 'rp', s.w - 12 - s.textW(t), iy + 3, MAG); s.text(t, s.w - 4 - s.textW(t), iy + 3, MAG); }
  s.para(n.desc.toUpperCase(), 4, iy + 12, s.w - 8, MID, 8, 2);
  const missing = (n.requires || []).filter((r) => !hasUnlock(r));
  if (!own) {
    if (buy) button(s, w, 'RESEARCH', s.w - 62, BOT - 12, GRN, () => w.buyResearch(n.key), 58);
    else if (missing.length) s.text('NEEDS ' + missing.map((r) => (researchNodes().find((q) => q.key === r)?.title || r).toUpperCase()).join(', '), 4, BOT - 9, AMB, 1, s.w - 8);
    else if (n.gate && !safeGate(n)) s.text((n.gateHint || 'NOT YET AVAILABLE').toUpperCase(), 4, BOT - 9, AMB, 1, s.w - 8);
    else s.text(`NEED ${n.cost - researchPoints()} MORE RP: DO QUESTS, SCAN THINGS`, 4, BOT - 9, DIM, 1, s.w - 70);
  }
  footer(s, 'CLICK:SELECT/RESEARCH  WHEEL:NODE  ←→:BRANCH');
}

function safeGate(n: ResearchNode) { try { return !!n.gate!(); } catch { return false; } }
function glyph(n: ResearchNode) {
  const i = (n.icon || '').toUpperCase();
  if (i && /^[A-Z0-9]{1,2}$/.test(i)) return i;
  const words = n.title.toUpperCase().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
}
