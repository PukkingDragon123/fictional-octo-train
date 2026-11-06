// Dr. Calder's notices (round 14). What the wrist watch used to chime about
// and type on its tube is now said by her, in her voice on the subtitle strip
// (G.handler.say: her line queue, with cooldowns so nothing nags):
//
//   quests      a new offer (batched: "two new jobs on the board"), work ready
//               to sign off and pay, a quest filed, an objective done; the
//               board itself is the J broadcast (src/ui/broadcast/broadcast.ts)
//   tracking    a tracked quest's next objective in this level gets her floor
//               chevrons (G.handler.guide), re-laid when you change level
//   uploads     research arriving mid-run (a permit's reward): "Uploaded: ..."
//   rules       an inhabitant's rule learned (scanning, watching, surviving)
//   signals     radio carriers on a level (quest telemetry, beacons): she picks
//               them up as the unit walks near and reads them out; close in,
//               they lock (mission flag 'sig:<id>', as the old SIGNAL TRACE did)
//
// Nothing speaks while her staged tutorial or the intro runs. Installed once
// per session (src/game/session.ts: installNotices()).
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { researchNode } from '../../game/research';
import { TUT } from '../../game/tutorial/state';
import { voss } from '../../game/debt/voice';
import type { QuestRuntime } from '../../missions/questRuntime';
import { isTouchMode } from '../touch/mode';

const Q = () => G.missions?.quests as QuestRuntime | undefined;
const busy = () => TUT.running || !!(G as any).intro?.running || !G.local || !!G.local.body?.dead;
const board = () => (isTouchMode() ? 'QUESTS' : 'J');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** a line from her (key + cooldown: said at most once per cd seconds) */
function say(text: string, key?: string, cd?: number) {
  if (!text || !G.local) return;
  const h = G.handler as { say?: (t: string, o?: { key?: string; cd?: number }) => void } | undefined;
  if (h?.say) h.say(text, key ? { key, cd } : {});
  else voss(text);
}

// ================================================================ tracking
let guided = '';
/** pin a quest (or unpin: null) and lay her chevrons to its next objective here */
export function trackQuest(k: string | null) { Q()?.track(k); guideTracked(true); }
function guideTracked(force = false) {
  const q = Q(), p = G.local, h = G.handler as { guide?: (t: { x: number; z: number } | null) => void } | undefined;
  if (!q || !p || !h?.guide || TUT.running) return;
  const k = q.tracked;
  const s = k ? q.status(k) : null;
  const t = k && (s === 'act' || s === 'ready') ? q.target(k) : null;
  const sig = t && t.zone === p.zoneKey ? `${k}:${t.zone}:${Math.round(t.x)}:${Math.round(t.z)}` : '';
  if (sig === guided && !force) return;
  const was = guided;
  guided = sig;
  if (sig) h.guide({ x: t!.x, z: t!.z });
  else if (was) h.guide(null);
}

// ================================================================ quests
let offers: string[] = [];
let offerT = 0;
function onQuest(e: { key: string; kind: 'offer' | 'ready' | 'done' | 'objective'; title: string; text?: string; intro?: boolean; outro?: boolean }) {
  if (!e?.key || busy()) return;
  switch (e.kind) {
    case 'offer':
      // her own briefing for the quest says it already; otherwise she points at the board (batched)
      if (e.intro) return;
      offers.push(e.title); offerT = 1.6;
      break;
    case 'ready': say(`${e.title}: that is done. Sign it off on the board, ${board()}.`, 'qready:' + e.key, 30); break;
    case 'done': if (!e.outro) say(`${e.title}. Filed.`, 'qdone:' + e.key, 30); break;
    case 'objective': if (e.text) say(`Done: ${e.text.replace(/\s*\([^)]*\)\s*$/, '')}.`, 'qobj', 4); break;
  }
}
function flushOffers() {
  if (!offers.length) return;
  const list = offers; offers = [];
  if (busy()) return;
  if (list.length === 1) say(`New work on the board: ${list[0]}. ${board()} to look.`, 'qoffer', 6);
  else say(`${list.length === 2 ? 'Two' : list.length === 3 ? 'Three' : 'Several'} new jobs on the board. ${board()} to look.`, 'qoffer', 6);
}

// ================================================================ signals
const heard = new Set<string>();
const locked = new Set<string>();
let sigT = 0;
function signals() {
  const p = G.local, m = G.missions as any;
  if (!p || busy() || !m?.signalsFor) return;
  let list: { id: string; freq: number; x: number; z: number; range: number; name: string; text?: string }[] = [];
  try { list = m.signalsFor(p.zoneKey) || []; } catch { return; }
  for (const s of list) {
    if (!s?.id || typeof s.x !== 'number') continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z), R = s.range || 80;
    const fq = Number(s.freq || 0).toFixed(1);
    if (!heard.has(s.id) && d < R * 0.8) {
      heard.add(s.id);
      G.audio?.ui?.('static_burst', 0.25);
      say(`A carrier on ${fq}. ${cap(String(s.name || 'something').toLowerCase())}. Faint. Walk toward it and I will clean it up.`, 'sig:' + s.id, 120);
    }
    if (!locked.has(s.id) && d < Math.max(10, R * 0.3)) {
      locked.add(s.id);
      m.onSignalLock?.(s, p);
      const kn: Set<string> = (p as any).knownSignals || ((p as any).knownSignals = new Set());
      kn.add(s.id);
      G.audio?.ui?.('static_burst', 0.3);
      say(s.text ? `Locked on ${fq}. ${String(s.name || '').toUpperCase()}: ${s.text}` : `Locked on ${fq}. ${s.name}. It is close.`, 'siglock:' + s.id, 120);
    }
  }
}

// ================================================================ install
let installed = false;
export function installNotices() {
  if (installed) return;
  installed = true;
  bus.on('questNotice', onQuest);
  // research arriving mid-run (a permit's reward, a bounty's firmware); the lab's purchases happen with no unit in play
  bus.on('researchUnlocked', (key: string) => {
    if (busy()) return;
    const n = researchNode(key);
    G.audio?.ui?.('nodeUnlock', 0.5);
    say(`Uploaded: ${n?.title ? cap(n.title.toLowerCase()) : key}.${n?.desc ? ' ' + n.desc : ''}`, 'up:' + key, 60);
  });
  bus.on('ruleLearned', (r: { key?: string; species?: string; name?: string; text?: string }) => {
    if (busy() || !r?.name) return;
    say(`${r.species ?? 'It'} has a rule. ${r.name}: ${r.text ?? ''}`.trim(), 'rule:' + (r.key ?? r.name), 600);
  });
  G.addSystem({ name: 'notices', update: (dt: number) => {
    if (offerT > 0) { offerT -= dt; if (offerT <= 0) flushOffers(); }
    sigT -= dt;
    if (sigT <= 0) {
      sigT = 0.5;
      try { signals(); } catch (e) { console.warn('signals', e); }
      try { guideTracked(); } catch (e) { console.warn('guide', e); }
    }
  } });
}
