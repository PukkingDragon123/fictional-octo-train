// What the watch's CRT shows: a green phosphor tube with amber highlights,
// typed in the CRT face (the tube-digit face for big digits) through the Tube pen
// (./tube.ts) onto a real tube (src/gfx/crt.ts). A header line
// in inverse video (function, research points, clock), the strip of functions
// you own, the page, a footer of hints that doubles as the teletype line for
// messages. On the move it shrinks to a GLANCE: big type, the tracked quest's
// next objective and a bearing. The research tree prints like a continuous-
// feed listing: punched cards wired together with circuit traces.
// Pages register clickable zones in screen pixels; the watch maps clicks and
// taps (and the CRT's curvature) onto them.
import { G } from '../../game/G';
import type { Tube } from './tube';
import { researchPoints, researchNodes, hasUnlock, canBuy, type ResearchNode } from '../../game/research';
import { BRANCHES } from './nodes';
import type { Watch } from './watch';
import type { QView } from '../../missions/questRuntime';
import { angleDiff } from '../../core/math';

/** colours packed like font5x7's Screen.c (the Tube pen unpacks them) */
const C = (h: number) => (((255 << 24) | ((h & 0xff) << 16) | (h & 0xff00) | ((h >> 16) & 0xff)) >>> 0);
/** phosphor: green P1 with amber for money, warnings and anything that wants your attention */
export const PAL = {
  BG: C(0x041207), PANEL: C(0x07200e), FAINT: C(0x0e3418), DIM: C(0x2f9446), MID: C(0x5ee874), HI: C(0xd0ffc4),
  AMB: C(0xffb030), RED: C(0xff6a3a), MAG: C(0xe4ff74), GRN: C(0xc0ffb4), INK: C(0x041207),
};
const { BG, PANEL, FAINT, DIM, MID, HI, AMB, RED, MAG, GRN, INK } = PAL;
export const TOP = 21, BOT = 125;

// ---------------------------------------------------------------- pixel icons (5x7, the font's cell)
const ICONS: Record<string, string[]> = {
  rp: ['..#..', '.#.#.', '#.#.#', '#####', '#.#.#', '.#.#.', '..#..'],          // a research cog-star
  scrip: ['.###.', '#.#.#', '#.#..', '.###.', '..#.#', '#.#.#', '.###.'],
  check: ['.....', '....#', '...##', '#.##.', '###..', '.#...', '.....'],
  warn: ['..#..', '..#..', '.#.#.', '.#.#.', '#.#.#', '#...#', '#####'],
  lock: ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'],
  up: ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '.....'],
  pin: ['.###.', '#####', '#####', '.###.', '..#..', '..#..', '..#..'],
  // quest givers / categories
  badge: ['#####', '#.#.#', '#####', '#...#', '.#.#.', '.#.#.', '..#..'],          // the Programme's shield
  flask: ['.###.', '..#..', '..#..', '.#.#.', '#...#', '#####', '#####'],          // R&D
  radio: ['#...#', '.#.#.', '..#..', '..#..', '.###.', '.#.#.', '#...#'],          // a mast: the radio
  stamp: ['.###.', '.###.', '..#..', '..#..', '#####', '#...#', '#####'],          // permits
  coin: ['.###.', '#...#', '#.#.#', '#.#.#', '#.#.#', '#...#', '.###.'],           // bribes
  totem: ['.###.', '#.#.#', '.###.', '..#..', '.###.', '..#..', '.#.#.'],          // tribes
  stairs: ['....#', '...##', '..###', '.####', '#####', '#####', '#####'],         // floors
  skull: ['.###.', '#####', '#.#.#', '#####', '.###.', '.#.#.', '.....'],
};
const CAT_ICON: Record<string, string> = { contract: 'badge', research: 'flask', side: 'radio', permit: 'stamp', bribe: 'coin', tribe: 'totem', floors: 'stairs' };
export function icon(s: Tube, k: string, x: number, y: number, c: number, sc = 1) {
  const rows = ICONS[k]; if (!rows) return;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (rows[j][i] === '#') { if (sc === 1) s.px(x + i, y + j, c); else s.rect(x + i * sc, y + j * sc, sc, sc, c); }
}

export type Zone = { x: number; y: number; w: number; h: number; fn: () => void };
export function zone(w: Watch, x: number, y: number, ww: number, h: number, fn: () => void) { (w.st.clickZones as Zone[]).push({ x, y, w: ww, h, fn }); }
/** a terminal key: inverse video with notched corners; dim and hollow when it cannot be pressed */
export function button(s: Tube, w: Watch, label: string, x: number, y: number, c: number, fn: (() => void) | null, minW = 0) {
  const bw = Math.max(minW, s.textW(label) + 6);
  if (fn) {
    s.rect(x, y, bw, 11, c);
    s.px(x, y, BG); s.px(x + bw - 1, y, BG); s.px(x, y + 10, BG); s.px(x + bw - 1, y + 10, BG);
    s.hline(x + 1, x + bw - 2, y + 11, DIM);
    s.text(label, x + 3, y + 2, BG);
    zone(w, x, y, bw, 12, fn);
  } else {
    s.hline(x + 1, x + bw - 2, y, DIM, 2); s.hline(x + 1, x + bw - 2, y + 10, DIM, 2);
    s.text(label, x + 3, y + 2, DIM);
  }
  return bw;
}
export function footer(s: Tube, txt: string) {
  s.rect(0, BOT + 1, s.w, s.h - BOT - 1, BG);
  s.hline(2, s.w - 3, BOT + 1, DIM, 2);
  s.text(txt, 3, BOT + 3, DIM, 1, s.w - 6);
}
const blink = (hz = 2) => Math.floor(G.time * hz) % 2 === 0;
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const toneCol = (t: string) => (t === 'warn' ? AMB : t === 'rp' ? MAG : HI);

// ================================================================ the frame
export function drawWatch(s: Tube, w: Watch) {
  s.clear(0x041207);
  w.st.clickZones = [] as Zone[];
  if (w.small) { drawGlance(s, w); return; }
  const fn = w.fn();
  // header line, inverse video
  s.rect(0, 0, s.w, 10, MID);
  s.text(fn?.name || 'WATCH', 3, 2, INK, 1, 104);
  const clock = G.clock.timeString();
  s.text(clock, s.w - s.textW(clock) - 3, 2, INK);
  const rp = String(researchPoints());
  const rx = s.w - s.textW(clock) - 12 - s.textW(rp);
  icon(s, 'rp', rx - 7, 2, INK); s.text(rp, rx, 2, INK);
  // the function strip (the dial on the case turns through these)
  let x = 2;
  for (const pg of w.pages) {
    const lb = pg.label, on = pg.key === w.page, bw = s.textW(lb) + 4;
    if (x + bw > s.w) break;
    if (on) { s.rect(x, 11, bw, 9, HI); s.text(lb, x + 2, 12, INK); }
    else s.text(lb, x + 2, 12, MID);
    if (pg.key === 'qst' && w.quests?.fresh.size && blink(3)) s.rect(x + bw - 2, 11, 2, 2, AMB);
    zone(w, x, 10, bw, 11, () => w.press(pg.key));
    x += bw + 3;
    if (x < s.w - 2) s.vline(x - 2, 12, 18, FAINT);
  }
  s.hline(0, s.w - 1, 20, DIM, 2);
  try { fn?.draw(s, w); } catch (e) { s.text('FUNCTION FAULT', 6, 40, RED); console.warn('watch page', e); }
  // the teletype line: a message types itself over the footer
  const m = w.currentMsg();
  if (m) {
    const c = toneCol(m.tone);
    s.rect(0, BOT + 1, s.w, s.h - BOT - 1, c);
    const full = m.title + (m.body ? ' · ' + m.body : '');
    const typed = full.slice(0, Math.floor((G.time - (m.until - 3)) * 40) + 1);
    s.text(typed, 3, BOT + 3, INK, 1, s.w - 6);
  }
  // the simulation's decay: snow on the tube
  const p = G.local;
  const glitch = Math.max(G.collapse, (p?.body.corruption ?? 0) / 100);
  if (glitch > 0.15) for (let i = 0; i < glitch * 30; i++) { const gx = Math.random() * s.w | 0, gy = Math.random() * s.h | 0; s.rect(gx, gy, 1 + (Math.random() * 4 | 0), 1, Math.random() < 0.5 ? HI : BG); }
}

// ================================================================ glance (on the move)
function drawGlance(s: Tube, w: Watch) {
  const Q = w.quests, p = G.local;
  // threat radar takes over when something is close
  const threat = w.threat;
  if (threat && hasUnlock('watch_radar') && (!w.peekKey || w.peekKey === '__threat')) {
    if (blink(4)) s.rect(0, 0, s.w, s.h, C(0x2a1206));
    s.frame(1, 1, s.w - 2, s.h - 2, AMB); s.frame(3, 3, s.w - 6, s.h - 6, AMB);
    icon(s, 'skull', 10, 10, AMB, 3);
    s.text('CONTACT', 34, 12, AMB, 2);
    s.text(`${threat.n} HOSTILE`, 10, 42, HI, 2);
    s.text(`${threat.d.toFixed(0)}M ${threat.side}`, 10, 66, HI, 2);
    arrow(s, s.w - 36, 96, 22, threat.rel, AMB);
    return;
  }
  // an incoming call
  const sg = w.st.signal;
  if (w.peekKey === '__signal' && sg) {
    if (blink(3)) s.rect(0, 0, s.w, 30, MID);
    s.text('INCOMING', 8, 6, blink(3) ? INK : HI, 3);
    s.text(String(sg.from).toUpperCase(), 8, 50, HI, 2, s.w - 16);
    s.text(String(sg.text).toUpperCase(), 8, 76, MID, 2, s.w - 16);
    return;
  }
  // a teletype message
  const m = w.currentMsg();
  if (m && (w.peekKey === '__msg' || !w.peekKey)) {
    const c = toneCol(m.tone);
    s.rect(0, 0, s.w, 18, c);
    s.text(m.tone === 'warn' ? 'NOTICE' : m.tone === 'rp' ? 'R&D' : 'MESSAGE', 4, 2, INK, 2);
    paraBig(s, m.title, 4, 26, s.w - 8, c, 2, 2);
    if (m.body) paraBig(s, m.body, 4, 66, s.w - 8, MID, 2, 3);
    return;
  }
  const peek = w.peekKey && !w.peekKey.startsWith('__') ? Q?.view(w.peekKey) : null;
  const fk = peek ? null : Q?.focus();
  const v = peek || (fk ? Q!.view(fk) : null);
  if (peek) {
    s.rect(0, 0, s.w, 18, blink(3) ? HI : MID);
    icon(s, 'up', 4, 2, INK, 2);
    s.text(peek.status === 'done' ? 'COMPLETE' : peek.status === 'ready' ? 'TURN IN' : 'UPLOAD', 20, 2, INK, 2);
  } else {
    s.rect(0, 0, s.w, 18, MID);
    s.text(v ? 'QUEST' : 'WATCH', 4, 2, INK, 2);
    const rp = String(researchPoints());
    icon(s, 'rp', s.w - 14 - s.textW(rp, 2), 2, INK, 2);
    s.text(rp, s.w - 2 - s.textW(rp, 2), 2, INK, 2);
  }
  if (!v) {
    const t = G.clock.timeString();
    s.text(t, 40, 34, HI, 4, 9999, 'nixie');
    s.text('NO ACTIVE QUEST', (s.w - s.textW('NO ACTIVE QUEST', 1)) / 2, 90, MID);
    return;
  }
  icon(s, CAT_ICON[v.category] || 'flask', 4, 24, AMB, 2);
  s.text(v.title.toUpperCase(), 18, 24, HI, 2, s.w - 22);
  if (peek && peek.status !== 'act') {
    s.text(peek.giver.toUpperCase(), 4, 44, MID, 2, s.w - 8);
    if (peek.status === 'done' && peek.rewardText) paraBig(s, peek.rewardText, 4, 66, s.w - 8, MAG, 2, 2);
    else if (peek.status === 'ready') paraBig(s, peek.costText, 4, 66, s.w - 8, AMB, 2, 2);
    else if (peek.rewardText) paraBig(s, peek.rewardText, 4, 66, s.w - 8, MAG, 2, 2);
    s.text('TAB TO OPEN', 4, 112, DIM, 2);
    return;
  }
  const next = v.objectives.find((o) => !o.done && !o.optional) || v.objectives.find((o) => !o.done);
  if (next) {
    paraBig(s, '▸' + next.text.toUpperCase(), 4, 46, s.w - 8, MID, 2, 2);
    if (next.prog > 0 && next.prog < 1) s.bar(4, 86, s.w - 8, 8, next.prog, HI, BG);
  } else if (v.status === 'ready') s.text('READY: ' + v.costText, 4, 50, AMB, 2, s.w - 8);
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

function paraBig(s: Tube, txt: string, x: number, y: number, w: number, c: number, sc: number, maxLines = 2) {
  const words = txt.split(/\s+/); let line = '', n = 0;
  const lh = 8 * sc + 2;
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (s.textW(t, sc) > w && line) { if (n < maxLines) s.text(line, x, y + n * lh, c, sc); n++; line = wd; } else line = t;
  }
  if (line && n < maxLines) s.text(line, x, y + n * lh, c, sc, w);
}

export function arrow(s: Tube, cx: number, cy: number, r: number, rel: number, c: number) {
  s.circle(cx, cy, r, DIM);
  const ex = cx + Math.sin(rel) * r * 0.85, ey = cy - Math.cos(rel) * r * 0.85;
  s.line(cx, cy, ex, ey, c);
  s.disc(ex, ey, 2, c);
}

// ================================================================ QUESTS
const QTABS = ['ACTIVE', 'OFFERS', 'DONE'] as const;
const QTAB_KEYS = ['active', 'offers', 'done'] as const;

export function drawQuests(s: Tube, w: Watch) {
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
    if (on) { s.rect(x, TOP, bw, 9, DIM); s.text(t, x + 3, TOP + 1, HI); }
    else s.text(t, x + 3, TOP + 1, MID);
    if (i === 1 && [...Q.fresh].some((k) => Q.status(k) === 'off') && blink(3)) s.rect(x + bw - 2, TOP, 2, 2, AMB);
    zone(w, x, TOP, bw, 9, () => { st.qTab = i; st.sel = 0; });
    x += bw + 2;
  });
  const list = lists[tab];
  if (!list.length) {
    s.para(tab === 0 ? 'NO ACTIVE QUESTS. CHECK OFFERS: THE UPLINK PICKS UP WORK FROM ANYONE WHO KNOWS YOUR NUMBER.' : tab === 1 ? 'NO OFFERS RIGHT NOW. KEEP WORKING. SOMETHING WILL REACH OUT.' : 'NOTHING FINISHED YET.', 6, TOP + 16, s.w - 12, MID);
    footer(s, 'TAB:LOWER  DIAL:FUNCTION  WHEEL:SELECT');
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
    icon(s, CAT_ICON[v.category] || 'flask', 11, y, v.def.main ? AMB : DIM);
    const tc = v.status === 'decl' ? DIM : on ? HI : v.def.main ? HI : MID;
    const rw = v.def.reward?.rp ? s.textW(`+${v.def.reward.rp}`) + 8 : 0;
    s.text(v.title.toUpperCase(), 19, y, tc, 1, s.w - 23 - rw);
    if (rw) { const t = `+${v.def.reward!.rp}`; s.text(t, s.w - 3 - s.textW(t), y, MAG); icon(s, 'rp', s.w - 10 - s.textW(t), y, MAG); }
    zone(w, 0, y - 1, s.w, 9, () => { if (st.sel === i) w.openQuest(v.key); else st.sel = i; });
    y += 9;
  });
  w.st.qHover = list[sel]?.key;
  footer(s, 'CLICK:OPEN  WHEEL:SELECT  DIAL:FUNCTION');
}

function drawRowGlyph(s: Tube, w: Watch, v: QView, x: number, y: number, on: boolean, focus: string | null) {
  const Q = w.quests!;
  if (v.status === 'ready') { icon(s, 'scrip', x, y, AMB); return; }
  if (v.status === 'done') { icon(s, 'check', x, y, GRN); return; }
  if (v.status === 'decl') { s.text('×', x, y, DIM); return; }
  if (Q.fresh.has(v.key) && blink(3)) { s.text('!', x, y, AMB); return; }
  if (focus === v.key && v.status === 'act') { icon(s, 'pin', x, y, AMB); return; }
  s.text(on ? '▸' : '•', x, y, on ? HI : MID);
}

function drawQuestDetail(s: Tube, w: Watch, key: string) {
  const Q = w.quests!, st = w.st;
  const v = Q.view(key);
  if (!v || !v.rec) { st.qOpen = null; return; }
  Q.fresh.delete(key);
  button(s, w, '←', 2, TOP - 1, MID, () => { st.qOpen = null; });
  icon(s, CAT_ICON[v.category] || 'flask', 19, TOP, v.def.main ? AMB : MID);
  s.text((v.category || '').toUpperCase(), 27, TOP + 1, v.def.main ? AMB : DIM);
  s.text(v.giver.toUpperCase(), s.w - 3 - Math.min(s.textW(v.giver), 120), TOP + 1, DIM, 1, 120);
  // the body scrolls with the wheel
  const bodyTop = TOP + 12, bodyBot = BOT - 14;
  let y = bodyTop - (st.dScroll ?? 0) * 9;
  const put = (fn: (yy: number) => void, h = 9) => { if (y >= bodyTop && y + 7 <= bodyBot) fn(y); y += h; };
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
  // the keys
  const by = BOT - 12;
  s.rect(0, by - 2, s.w, 14, BG);
  s.hline(0, s.w - 1, by - 2, DIM, 2);
  let x = 3;
  const act = (label: string, c: number, fn: (() => void) | null) => { x += button(s, w, label, x, by, c, fn) + 4; };
  switch (v.status) {
    case 'off': case 'decl':
      act('ACCEPT', HI, () => w.questAct(key, 'accept'));
      if (v.status === 'off' && !v.def.main) act('DECLINE', DIM, () => w.questAct(key, 'decline'));
      if (v.def.cost?.payOnAccept) s.text(v.payNote, x, by + 2, v.affordable ? DIM : RED, 1, s.w - x - 3);
      break;
    case 'act': {
      const pinned = Q.focus() === key;
      act(pinned ? 'TRACKED' : 'TRACK', MID, pinned ? null : () => Q.track(key));
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

export function wrap(s: Tube, txt: string, w: number): string[] {
  const out: string[] = []; let line = '';
  for (const wd of txt.split(/\s+/)) {
    const t = line ? line + ' ' + wd : wd;
    if (s.textW(t) > w && line) { out.push(line); line = wd; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// ================================================================ RESEARCH: a punched-card listing
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
  // children sit level with their first parent where they can
  const order = [...nodes].sort((a, b) => dep(a) - dep(b));
  const rowOf = new Map<string, number>();
  for (const n of order) {
    const col = dep(n);
    const parent = (n.requires || []).map((r) => rowOf.get(r)).find((r) => r !== undefined);
    const row = Math.max(rows[col] ?? 0, parent ?? 0);
    rows[col] = row + 1;
    rowOf.set(n.key, row);
    laid.push({ n, col, row });
  }
  laid.sort((a, b) => a.col - b.col || a.row - b.row);
  layCache = { sig, laid };
  return laid;
}

const CARD_W = 21, CARD_H = 11, COL_W = 37, ROW_H = 14, GX = 9;

/** a punched card: clipped corner, two rows of punched holes, the node's code; owned cards are solid */
function card(s: Tube, x: number, y: number, code: string, fg: number, solid: boolean, seed: number) {
  s.rect(x, y, CARD_W, CARD_H, solid ? fg : FAINT);
  if (!solid) s.frame(x, y, CARD_W, CARD_H, fg);
  // the clipped corner
  s.rect(x, y, 3, 1, BG); s.rect(x, y + 1, 2, 1, BG); s.px(x, y + 2, BG);
  // punched holes (a pattern from the key), top and bottom rows
  const hole = solid ? BG : DIM;
  for (let i = 0; i < 6; i++) { if ((seed >> i) & 1) s.rect(x + 3 + i * 3, y + 1, 2, 1, hole); if ((seed >> (i + 6)) & 1) s.rect(x + 3 + i * 3, y + CARD_H - 2, 2, 1, hole); }
  if (code) s.text(code, x + Math.floor((CARD_W - s.textW(code)) / 2) + 1, y + 2, solid ? BG : fg);
}

export function drawResearch(s: Tube, w: Watch) {
  const st = w.st;
  const bi = ((st.branch ?? 0) % BRANCHES.length + BRANCHES.length) % BRANCHES.length;
  const br = BRANCHES[bi];
  // branch tabs, like listing headers
  let x = 2;
  BRANCHES.forEach((b, i) => {
    const on = i === bi, bw = s.textW(b.label) + 4;
    if (on) { s.rect(x, TOP, bw, 9, DIM); s.text(b.label, x + 2, TOP + 1, HI); }
    else s.text(b.label, x + 2, TOP + 1, researchNodes(b.key).length ? MID : FAINT);
    zone(w, x, TOP, bw, 9, () => { st.branch = i; st.rSel = 0; st.rScroll = 0; });
    x += bw + 2;
  });
  const rp = String(researchPoints());
  icon(s, 'rp', s.w - 10 - s.textW(rp), TOP + 1, MAG); s.text(rp, s.w - 3 - s.textW(rp), TOP + 1, MAG);
  const laid = layoutBranch(br.key);
  const gTop = TOP + 11, gBot = BOT - 34;
  // the continuous-feed paper: tractor holes down both margins, greenbar bands
  const feed = Math.floor((G.time * 3) % 6);
  for (let yy = gTop; yy < gBot; yy++) if (Math.floor((yy - gTop + (st.rScroll ?? 0) * ROW_H) / ROW_H) % 2 === 0) s.hline(GX - 1, s.w - GX, yy, FAINT, 0);
  for (let yy = gTop + 3 - feed % 6; yy < gBot - 1; yy += 6) { if (yy < gTop + 1) continue; for (const hx of [3, s.w - 4]) { s.disc(hx, yy, 1.4, DIM); s.px(hx, yy, BG); } }
  s.vline(GX - 2, gTop, gBot, DIM); s.vline(s.w - GX + 1, gTop, gBot, DIM);
  if (!laid.length) {
    s.text(br.name, GX + 2, gTop + 3, HI);
    s.para('NO RESEARCH FILED IN THIS BRANCH YET. MERIDIAN PRINTS NEW SCHEMATICS AS THE PROGRAMME GROWS.', GX + 2, gTop + 15, s.w - GX * 2 - 4, MID);
    footer(s, 'DIAL:FUNCTION  CLICK:BRANCH');
    return;
  }
  const sel = ((st.rSel ?? 0) % laid.length + laid.length) % laid.length;
  st.rSel = sel;
  const cur = laid[sel];
  // keep the selection on the paper
  const visRows = Math.floor((gBot - gTop) / ROW_H);
  const maxCol = Math.max(...laid.map((l) => l.col));
  let scroll = st.rScroll ?? 0;
  if (cur.row < scroll) scroll = cur.row; else if (cur.row >= scroll + visRows) scroll = cur.row - visRows + 1;
  st.rScroll = scroll;
  let colX = st.rColX ?? 0;
  const visCols = Math.floor((s.w - GX * 2) / COL_W);
  if (cur.col < colX) colX = cur.col; else if (cur.col >= colX + visCols) colX = cur.col - visCols + 1;
  st.rColX = colX;
  const pos = (l: Laid) => ({ x: GX + 2 + (l.col - colX) * COL_W, y: gTop + 2 + (l.row - scroll) * ROW_H });
  const vis = (y: number) => y >= gTop && y + CARD_H <= gBot;
  const where = new Map(laid.map((l) => [l.n.key, l]));
  const clip = (yy: number) => Math.max(gTop, Math.min(gBot - 1, yy));
  // circuit traces first, with solder pads where they meet
  for (const l of laid) for (const r of l.n.requires || []) {
    const p = where.get(r); if (!p) continue;
    const a = pos(p), b = pos(l);
    if (a.x > s.w - GX || b.x < GX) continue;
    const live = hasUnlock(r);
    const c = live ? MID : DIM;
    const x0 = a.x + CARD_W, y0 = a.y + (CARD_H >> 1), x1 = b.x - 1, y1 = b.y + (CARD_H >> 1), mx = x0 + 5;
    if (vis(a.y)) { s.hline(x0, mx, y0, c); s.rect(x0, y0 - 1, 2, 3, c); }
    s.vline(mx, clip(Math.min(y0, y1)), clip(Math.max(y0, y1)), c);
    if (vis(a.y) && vis(b.y)) s.rect(mx - 1, y0 - 1, 3, 3, c);
    if (vis(b.y)) { s.hline(mx, x1, y1, c, live ? 0 : 2); s.rect(x1 - 1, y1 - 1, 2, 3, c); }
  }
  // the cards
  laid.forEach((l, i) => {
    const { x: nx, y: ny } = pos(l);
    if (!vis(ny) || nx > s.w - GX - CARD_W || nx < GX) return;
    const n = l.n, own = hasUnlock(n.key), buy = canBuy(n.key);
    const reqOk = !(n.requires || []).some((r) => !hasUnlock(r));
    const gated = !!n.gate && !safeGate(n);
    const fg = own ? HI : buy ? (blink(2) ? HI : MID) : gated ? AMB : reqOk ? MID : DIM;
    if (!reqOk && !own) { card(s, nx, ny, '', DIM, false, hashKey(n.key)); icon(s, 'lock', nx + 8, ny + 2, DIM); }
    else card(s, nx, ny, glyph(n), fg, own, hashKey(n.key));
    if (i === sel) { const c = blink(3) ? AMB : MID; s.frame(nx - 2, ny - 2, CARD_W + 4, CARD_H + 4, c); }
    zone(w, nx - 1, ny - 1, CARD_W + 2, CARD_H + 2, () => { if (st.rSel === i) w.buyResearch(n.key); else st.rSel = i; });
  });
  if (laid.some((l) => l.row >= scroll + visRows)) s.text('↓', s.w - GX - 7, gBot - 8, MID);
  if (scroll > 0) s.text('↑', s.w - GX - 7, gTop + 1, MID);
  if (maxCol >= colX + visCols) s.text('→', s.w - GX - 7, gTop + 20, MID);
  // the selected card, typed out below
  const n = cur.n, own = hasUnlock(n.key), buy = canBuy(n.key);
  const iy = gBot + 2;
  s.rect(0, iy, s.w, BOT - iy + 1, PANEL);
  s.hline(0, s.w - 1, iy, DIM, 2);
  s.text(n.title.toUpperCase(), 4, iy + 3, own ? GRN : HI, 1, s.w - 60);
  if (own) { icon(s, 'check', s.w - 46, iy + 3, GRN); s.text('OWNED', s.w - 36, iy + 3, GRN); }
  else { const t = `${n.cost}`; icon(s, 'rp', s.w - 12 - s.textW(t), iy + 3, MAG); s.text(t, s.w - 4 - s.textW(t), iy + 3, MAG); }
  s.para(n.desc.toUpperCase(), 4, iy + 12, s.w - 8, MID, 8, 2);
  const missing = (n.requires || []).filter((r) => !hasUnlock(r));
  const denied = st.denyT && G.time - st.denyT < 0.6;
  if (!own) {
    if (buy) button(s, w, 'RESEARCH', s.w - 62, BOT - 12, AMB, () => w.buyResearch(n.key), 58);
    else if (missing.length) s.text('NEEDS ' + missing.map((r) => (researchNodes().find((q) => q.key === r)?.title || r).toUpperCase()).join(', '), 4, BOT - 9, denied ? RED : AMB, 1, s.w - 8);
    else if (n.gate && !safeGate(n)) s.text((n.gateHint || 'NOT YET AVAILABLE').toUpperCase(), 4, BOT - 9, AMB, 1, s.w - 8);
    else s.text(`NEED ${n.cost - researchPoints()} MORE RP: DO QUESTS, SCAN THINGS`, 4, BOT - 9, denied ? RED : DIM, 1, s.w - 8);
  }
  footer(s, 'CLICK:SELECT  AGAIN:RESEARCH  ←→:BRANCH');
}

function hashKey(k: string) { let h = 7; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) & 0xfff; return h | 0x41; }
function safeGate(n: ResearchNode) { try { return !!n.gate!(); } catch { return false; } }
function glyph(n: ResearchNode) {
  const i = (n.icon || '').toUpperCase();
  if (i && /^[A-Z0-9]{1,2}$/.test(i)) return i;
  const words = n.title.toUpperCase().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
}
