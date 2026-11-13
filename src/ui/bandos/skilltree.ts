// THE SKILL TREE (round 17): the research tree (data: src/game/unitTree.ts) as a board of big 3D models.
// Each node is a little model from the machine kit (src/ui/machine/decor.ts) on a socket: locked ones sit in
// shadow behind a hasp, ones you can buy pulse amber, owned ones burn green. The links between them are
// conduits: dark while the node they come from is not owned, lit (and carrying light) once it is. A node
// that waits on a quest says so on its plate (the quest's title, from the quest runtime).
//
// Two homes:
//   the band desktop's Research app   look over the tree mid-run (research is bought at the lab)
//   the lab's main computer           openSkillTree({ lab: true }) full screen: stage and research; every
//                                     purchase plays the install sequence (./install.ts)
import './bandos.css';
import { G } from '../../game/G';
import { sfx } from '../menus/sfx';
import { mxOk } from '../machine/core';
import { mxIconAnim, type IconKind } from '../machine/decor';
import { BRANCHES, treeNodes, treeNode, treeLanes, rankOf, nodeState, stage, confirmPlan, clearPlan, researchFor, syncTree, type TreeNode } from '../../game/unitTree';
import { researchPoints } from '../../game/research';
import type { QuestRuntime } from '../../missions/questRuntime';
import type { WinApi } from './bandos';
import { installFor } from './install';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const CW = 168, RH = 150, PADX = 150, PADY = 30;

/** which little model a node shows */
export function nodeIcon(n: TreeNode): IconKind {
  const k = (n.icon.kind === 'item' ? n.icon.key : n.key).toLowerCase();
  if (n.icon.kind === 'chip') return 'bolt';
  if (n.icon.kind === 'limb' || n.limb) return 'joystick';
  if (n.icon.kind === 'socket') return 'gear';
  if (n.icon.kind === 'cos' || n.cos) {
    // the unit's looks: eyewear, headgear, and the dyes in their jars
    const t = (n.title + ' ' + n.key).toLowerCase();
    return /visor|glass|goggle|eye|shade|lens/.test(t) ? 'eye' : /helm|hat|cap|crown|cone|hood|head|mask/.test(t) ? 'lamp' : 'jar';
  }
  if (/map|survey|plot/.test(k)) return 'map';
  if (/scan|radio|signal|relay|antenna/.test(k)) return 'radio';
  if (/lamp|light|torch|flash/.test(k)) return 'lamp';
  if (/press|coin|scrip|trade|ledger/.test(k)) return 'coin';
  if (/tape|record|log/.test(k)) return 'tape';
  if (/jar|cook|food|meal|brew|farm|seed|plant|fung/.test(k)) return 'jar';
  if (/knife|blade|spear|club|crow|wrench|tool|axe|saw|hammer/.test(k)) return 'wrench';
  if (/crate|box|bag|pack|shelf|chest|storage|wall|door|floor|base|bp_/.test(k)) return 'crate';
  if (/plug|power|gen|battery|cable|fuse/.test(k)) return 'plug';
  if (/eye|lens|sight/.test(k)) return 'eye';
  const byBranch: Record<string, IconKind> = { design: 'dossier', recipe: 'jar', build: 'crate', device: 'radio', chip: 'bolt', limb: 'joystick' };
  return byBranch[n.branch] ?? 'gear';
}

/** what a node waits on that is not research: a quest (by key, from the quest runtime) or the node's gate hint */
function questReq(n: TreeNode, rank: number): string | null {
  const rn = researchFor(n, rank + 1) as (ReturnType<typeof researchFor> & { quest?: string; reqQuest?: string }) | undefined;
  if (!rn) return null;
  const qk = rn.quest ?? rn.reqQuest;
  if (qk) {
    const Q = G.missions?.quests as QuestRuntime | undefined;
    const v = Q?.view?.(qk);
    const done = v?.status === 'done';
    return done ? null : `QUEST · ${v?.title ?? qk}`;
  }
  if (rn.gate && !rn.gate()) return rn.gateHint ? rn.gateHint : 'QUEST · not yet earned';
  return null;
}

interface NodeEl { n: TreeNode; b: HTMLButtonElement; ic: ReturnType<typeof mxIconAnim>; x: number; y: number }

/** the tree into a host element; returns what the host drives */
export function buildSkillTree(host: HTMLElement, o: { lab: boolean; onClose?: () => void }) {
  syncTree();
  host.classList.add('st');
  const head = el('div', 'st-head'), tabs = el('div', 'st-tabs'), rp = el('div', 'st-rp');
  head.append(tabs, rp);
  const board = el('div', 'st-board'), layer = el('div', 'st-layer'), cv = document.createElement('canvas');
  cv.className = 'st-links';
  layer.append(cv);
  board.append(layer);
  const side = el('aside', 'st-side');
  const main = el('div', 'st-main');
  main.append(board, side);
  host.append(head, main);
  let branch = BRANCHES[0]?.key ?? '';
  let sel: string | null = null;
  let nodes: NodeEl[] = [];
  let sig = '';
  let t = 0;

  const paintTabs = () => {
    tabs.replaceChildren(...BRANCHES.map((b) => {
      const k = el('button', 'st-tab' + (b.key === branch ? ' on' : ''), `<b>${esc(b.code)}</b><span>${esc(b.name)}</span>`) as HTMLButtonElement;
      k.type = 'button';
      k.addEventListener('click', () => { if (branch === b.key) return; branch = b.key; sel = null; sfx('tick', 0.5); build(); });
      return k;
    }));
    let pts = 0; try { pts = researchPoints(); } catch { /* none */ }
    rp.innerHTML = `<b>${pts}</b><small>RP</small>`;
  };
  const build = () => {
    paintTabs();
    for (const ne of nodes) ne.b.remove();
    for (const l of [...layer.querySelectorAll('.st-lane')]) l.remove();
    nodes = [];
    const list = treeNodes(branch);
    const cols = Math.max(1, ...list.map((n) => n.col + 1)), rows = Math.max(1, ...list.map((n) => n.row + 1));
    const W = PADX + cols * CW + 40, H = PADY + rows * RH * 0.5 + RH;
    layer.style.width = W + 'px'; layer.style.height = H + 'px';
    cv.width = W; cv.height = H;
    for (const ln of treeLanes(branch)) { const d = el('div', 'st-lane', esc(ln.label)); d.style.top = (PADY + ln.row * RH * 0.5 + 40) + 'px'; layer.append(d); }
    for (const n of list) {
      const x = PADX + n.col * CW, y = PADY + n.row * RH * 0.5;
      const b = el('button', 'st-node') as HTMLButtonElement;
      b.type = 'button'; b.dataset.k = n.key;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      const ic = mxOk() ? mxIconAnim(nodeIcon(n), 44) : null;
      const sock = el('span', 'st-sock');
      if (ic) sock.append(ic.cv);
      b.append(sock, el('span', 'st-name', esc(n.title)), el('span', 'st-pips'), el('span', 'st-q'));
      b.addEventListener('click', () => { sel = n.key; sfx('key', 0.5); paint(); });
      b.addEventListener('dblclick', () => { if (o.lab) research(n); });
      b.addEventListener('pointerenter', () => ic?.hot(true));
      b.addEventListener('pointerleave', () => ic?.hot(n.key === sel));
      layer.append(b);
      nodes.push({ n, b, ic, x, y });
    }
    sig = '';
    paint();
  };
  const stateOf = (n: TreeNode) => (rankOf(n) >= n.ranks ? 'max' : rankOf(n) > 0 ? (nodeState(n) === 'locked' ? 'owned' : nodeState(n)) : nodeState(n));
  const paint = () => {
    for (const ne of nodes) {
      const n = ne.n, st = stateOf(n), r = rankOf(n);
      ne.b.className = 'st-node s-' + st + (r > 0 ? ' own' : '') + (n.key === sel ? ' sel' : '');
      (ne.b.querySelector('.st-pips') as HTMLElement).innerHTML = Array.from({ length: n.ranks }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('') + (r < n.ranks ? `<em>${n.costs[r]} RP</em>` : '');
      const q = r < n.ranks ? questReq(n, r) : null;
      const qe = ne.b.querySelector('.st-q') as HTMLElement;
      qe.textContent = q ?? ''; qe.classList.toggle('on', !!q);
      ne.ic?.hot(n.key === sel);
    }
    side.replaceChildren(...detail());
  };
  const detail = (): HTMLElement[] => {
    const n = sel ? treeNode(sel) : null;
    if (!n) return [el('p', 'st-dim', 'Pick a socket to read its file.'), el('p', 'st-dim', o.lab ? 'Double-click (or RESEARCH) to buy it with research points.' : 'Research is bought at the lab\'s main computer, between runs.')];
    const r = rankOf(n), st = stateOf(n);
    const out: HTMLElement[] = [el('h3', 'st-h', esc(n.title) + (n.ranks > 1 ? ` <small>${ROMAN[r] || '0'} / ${ROMAN[n.ranks]}</small>` : '')), el('p', 'st-p', esc(n.desc))];
    const gives = el('ul', 'st-gives');
    n.gives.forEach((g, i) => gives.append(el('li', i < r ? 'on' : '', esc(g))));
    out.push(gives);
    if (n.req.length) out.push(el('p', 'st-dim', 'Needs: ' + n.req.map((k) => esc(treeNode(k)?.title ?? k)).join(', ')));
    const q = r < n.ranks ? questReq(n, r) : null;
    if (q) out.push(el('p', 'st-quest', esc(q)));
    if (r < n.ranks) out.push(el('p', 'st-cost', `${n.costs[r]} RP`));
    if (o.lab && r < n.ranks) {
      const b = el('button', 'st-go' + (st === 'open' ? '' : ' off'), st === 'open' ? 'RESEARCH' : st === 'poor' ? 'NOT ENOUGH RP' : 'LOCKED') as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => research(n));
      out.push(b);
    } else if (!o.lab && r < n.ranks) out.push(el('p', 'st-dim', 'Buy it at the lab\'s main computer.'));
    return out;
  };
  const research = (n: TreeNode) => {
    if (nodeState(n) !== 'open') { sfx('error', 0.5); return; }
    clearPlan();
    if (!stage(n.key)) { sfx('error', 0.5); return; }
    const ne = nodes.find((x) => x.n.key === n.key);
    // the purchase fires 'researchUnlocked': the install sequence (./install.ts) plays with this socket's model
    installFor(ne?.b ?? null, nodeIcon(n), () => { sig = ''; paint(); });
    const done = confirmPlan();
    if (!done.length) { installFor(null, 'gear'); sfx('error', 0.5); return; }
    paint();
  };

  // ---- the conduits: drawn each frame (they carry light)
  const drawLinks = (time: number) => {
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, cv.width, cv.height);
    const at = new Map(nodes.map((ne) => [ne.n.key, ne]));
    for (const ne of nodes) for (const rk of ne.n.req) {
      const from = at.get(rk); if (!from) continue;
      const lit = rankOf(from.n) > 0, live = lit && rankOf(ne.n) > 0;
      const x0 = from.x + 50, y0 = from.y + 40, x1 = ne.x + 50, y1 = ne.y + 40, mx = Math.round((x0 + x1) / 2);
      const path = [[x0, y0], [mx, y0], [mx, y1], [x1, y1]];
      const stroke = (w: number, col: string) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(path[0][0], path[0][1]); for (const p of path.slice(1)) c.lineTo(p[0], p[1]); c.stroke(); };
      stroke(8, '#06080a');
      stroke(4, lit ? (live ? '#2e8a4a' : '#7a5a1a') : '#1c2226');
      if (lit) {
        // light running along the conduit
        const len = Math.abs(mx - x0) + Math.abs(y1 - y0) + Math.abs(x1 - mx);
        c.setLineDash([6, 18]); c.lineDashOffset = -((time / 22) % 24);
        stroke(2, live ? '#9affb8' : '#ffd070');
        c.setLineDash([]);
        void len;
      }
    }
  };

  build();
  const keyer = (e: KeyboardEvent) => {
    if (!host.isConnected) return;
    if (o.lab && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); o.onClose?.(); return; }
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      const i = BRANCHES.findIndex((b) => b.key === branch), j = (i + (e.code === 'KeyE' ? 1 : -1) + BRANCHES.length) % BRANCHES.length;
      if (BRANCHES[j]) { branch = BRANCHES[j].key; sel = null; build(); sfx('tick', 0.5); }
    } else if (e.code === 'KeyR' && o.lab && sel) { const n = treeNode(sel); if (n) research(n); }
  };
  window.addEventListener('keydown', keyer, true);
  return {
    tick(dt: number) {
      t += dt;
      drawLinks(performance.now());
      // research points or quests change under it: repaint now and then
      const s = String(researchPoints()) + ':' + nodes.map((ne) => rankOf(ne.n)).join('');
      if (s !== sig && t > 0.4) { sig = s; t = 0; paintTabs(); paint(); }
    },
    dispose() { window.removeEventListener('keydown', keyer, true); },
  };
}

/** the band desktop's Research app */
export function skillTreeApp(w: WinApi) {
  const t = buildSkillTree(w.body, { lab: false });
  return { tick: (dt: number) => t.tick(dt), dispose: () => t.dispose() };
}

/** the lab's main computer: the tree full screen, research bought here */
export function openSkillTree(o: { onClose?: () => void } = {}) {
  const veil = el('div', 'st-veil');
  const frame = el('div', 'st-full');
  const bar = el('div', 'st-bar', '<b>RESEARCH</b><small>main computer · control room C-1</small>');
  const x = el('button', 'st-x', 'LOG OFF') as HTMLButtonElement;
  x.type = 'button';
  bar.append(x);
  frame.append(bar);
  veil.append(frame);
  document.body.append(veil);
  requestAnimationFrame(() => veil.classList.add('on'));
  sfx('boot', 0.5);
  let raf = 0, last = performance.now();
  const close = () => { cancelAnimationFrame(raf); t.dispose(); veil.classList.remove('on'); setTimeout(() => veil.remove(), 200); sfx('back', 0.6); o.onClose?.(); };
  const t = buildSkillTree(frame, { lab: true, onClose: close });
  x.addEventListener('click', close);
  const loop = (now: number) => { const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now; t.tick(dt); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return { close };
}
