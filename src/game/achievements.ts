// COMMENDATIONS: the Meridian Institute's achievements, darkly corporate.
// Earned from events the game already sends (deaths and their causes, the
// press, the scanner, samples and the research lab's benches and codex),
// recorded in the Meridian file (src/game/meridian.ts, `ach` and the `n`
// counters) and paid out at once: research points, a suit colour (profile
// unlock 'cos:<key>', worn into the next intake), or a collectible for the
// menu rooms (the deco store, src/ui/menus/deco).
// Unlocking one shows a small riveted pixel toast in the corner.
import { bus } from '../core/events';
import { G } from './G';
import { unlock } from './profile';
import { grantResearch, researchPoints } from './research';
import { addOwned } from '../ui/menus/deco/store';
import { file, saveFile, bump, counter, runLog, discoveredCount, deathCount } from './meridian';
import { codexStats } from './codex';
import { COSMETIC } from './cosmetics';
import { itemDef, hasItemDef } from '../items/item';
import { sfx } from '../ui/menus/sfx';
import './achievements.css';

export interface Reward { rp?: number; cos?: string; deco?: string }
export interface Achievement { key: string; name: string; text: string; hint: string; reward: Reward }

const A = (key: string, name: string, text: string, hint: string, reward: Reward): Achievement => ({ key, name, text, hint, reward });
export const ACHIEVEMENTS: Achievement[] = [
  A('probation', 'Probationary Period', 'Died inside the first minute of a run. HR has already archived your desk.', 'Do not last very long.', { cos: 'suit_mint' }),
  A('sole', 'Sole Proprietor', 'Fed your own shoe to the Remittance Press. It was valued at almost nothing.', 'The press takes everything. Even footwear.', { cos: 'suit_sole', rp: 3 }),
  A('custody', 'Chain of Custody', 'Banked your first sample. It arrived at the lab smelling of the press.', 'Get a sample back to the lab.', { cos: 'suit_formalin', rp: 3 }),
  A('do_not_tap', 'Please Do Not Tap', 'Tapped the specimen jar until it tapped back. The sign was right there.', 'There is a sign on the jar in the research lab. Ignore it, repeatedly.', { cos: 'suit_glass' }),
  A('compound', 'Compound Interest', 'Died owing more than you started with. The Institute thanks you for your contribution.', 'Miss enough payments that the debt grows.', { cos: 'suit_red_ink', rp: 5 }),
  A('loyalty', 'Brand Loyalty', 'Killed by the same thing three runs in a row. It knows your schedule.', 'Keep going back to the same monster.', { cos: 'suit_loyal', rp: 6 }),
  A('humbled', 'Humbled', 'Killed by something rated harmless. The paperwork will be embarrassing.', 'Die to something the scanner calls harmless.', { rp: 4, deco: 'd_bobble' }),
  A('flattened', 'Flattened Hierarchy', 'Compacted by the Remittance Press. You are now very easy to file.', 'Stand where the press comes down.', { cos: 'suit_flat', rp: 3 }),
  A('terminated', 'Early Termination', 'Detonated by your own BAILIFF band. Contract concluded.', 'Let the band decide.', { rp: 4 }),
  A('hydration', 'Hydration Is Optional', 'Died of thirst. There was almond water in the next room.', 'Forget to drink.', { rp: 3 }),
  A('fasting', 'Intermittent Fasting', 'Starved to death. A wellness programme success story.', 'Forget to eat. For a long time.', { rp: 3 }),
  A('quiet_quit', 'Quiet Quitting', 'Died having walked less than twenty metres.', 'Do not go far.', { rp: 2 }),
  A('hr_compliant', 'HR-Compliant', 'Survived two days without killing anything.', 'Two days, no kills.', { rp: 8, deco: 'd_plant' }),
  A('wage_slave', 'Wage Slave', 'Pressed five valuables in a single run.', 'Feed the press, five times over.', { rp: 6, deco: 'd_jar' }),
  A('open_floor', 'Open Floor Plan', 'Shouted ten times in one run. Everything heard you.', 'Use your outside voice. A lot.', { rp: 3 }),
  A('shock', 'Shock Therapy', 'Got a jolt from your own band. Behaviour corrected.', 'Annoy the BAILIFF band.', { rp: 2 }),
  A('fieldwork', 'Mandatory Fieldwork', 'Discovered ten codex entries. They discovered you too.', 'See ten different kinds of thing.', { cos: 'suit_field', rp: 10 }),
  A('peer_review', 'Peer Reviewed', 'Completed your first codex entry.', 'Research one entry to 100%.', { rp: 5 }),
  A('tenure', 'Tenure Track', 'Completed fifteen codex entries. You are now a permanent fixture.', 'Complete fifteen codex entries.', { cos: 'suit_gold', rp: 20 }),
  A('unethical', 'Unethical Sourcing', 'Took a sample from something that was still breathing. It will grow back. Probably.', 'Sample a creature that is only stunned.', { rp: 4, deco: 'v_hush' }),
  A('butterfingers', 'Butterfingers', 'Spoiled a sample at the bench. The fume hood will never be the same.', 'Fail a bench test badly enough.', { rp: 2 }),
  A('cold_storage', 'Cold Storage', 'Banked twenty-five samples. The fridge hums a little louder.', 'Keep the fridge full.', { rp: 10, deco: 'd_fridge' }),
  A('steady_hands', 'Steady Hands', 'A perfect result at a research bench. The microscope approves.', 'Ace a bench test.', { rp: 6 }),
  A('field_kit', 'Field Kit Certified', 'Collected five samples in a single run.', 'Fill your pockets with vials.', { rp: 6 }),
  A('repeat', 'Repeat Offender', 'Started five runs. The intake desk knows you by name.', 'Keep coming back.', { rp: 5 }),
  A('frequent', 'Frequent Dier', 'Died ten times. Loyalty points do not apply.', 'Die. Often.', { cos: 'suit_hivis', rp: 8 }),
  A('grant', 'Grant Funded', 'Held 100 research points at once.', 'Save up.', { deco: 'd_moth' }),
  A('fire_drill', 'Fire Drill', 'Pulled the fume-hood alarm five times. Nobody evacuated.', 'The red handle by the fume hood.', { rp: 2 }),
  A('noise', 'Noise Complaint', 'Killed a Hush. It was very quiet about it.', 'Silence the silent one.', { rp: 8 }),
];
export const ACH = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));
export function earned(key: string) { return !!file().ach[key]; }
export function earnedCount() { return ACHIEVEMENTS.filter((a) => earned(a.key)).length; }
export function rewardText(r: Reward): string {
  const out: string[] = [];
  if (r.cos) out.push((COSMETIC.get(r.cos)?.name ?? r.cos) + ' suit');
  if (r.deco) out.push('a room collectible');
  if (r.rp) out.push(`+${r.rp} RP`);
  return out.join(' · ');
}

/** earn an achievement (once): pays the reward, shows the toast */
export function earn(key: string): boolean {
  const a = ACH.get(key);
  const f = file();
  if (!a || f.ach[key]) return false;
  f.ach[key] = Date.now();
  const run = runLog();
  if (run.live) run.ach.push(key);
  saveFile();
  const r = a.reward;
  if (r.cos) unlock('cos:' + r.cos);
  if (r.deco) { try { addOwned(r.deco, 1); } catch { /* storage blocked */ } }
  if (r.rp) grantResearch(r.rp, 'achievement:' + key);
  toast(a);
  bus.emit('achievement', a);
  return true;
}

// ================================================================== the toast
let stack: HTMLElement | null = null;
function medal(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.className = 'ach-ico';
  const c = cv.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  // the ribbon, the rim, the gold, a shine and a skull-ish dent (corporate horror)
  px(4, 0, 3, 6, '#c8283a'); px(9, 0, 3, 6, '#2a6ac8'); px(5, 0, 1, 6, '#ff5a6a'); px(10, 0, 1, 6, '#5a9aff');
  px(4, 5, 8, 10, '#0a0b10'); px(3, 6, 10, 8, '#0a0b10');
  px(5, 6, 6, 8, '#f0b030'); px(4, 7, 8, 6, '#f0b030'); px(5, 7, 2, 2, '#fff2b0'); px(9, 11, 2, 2, '#a06a10');
  px(6, 9, 1, 1, '#5a3a08'); px(9, 9, 1, 1, '#5a3a08'); px(7, 11, 2, 1, '#5a3a08');
  return cv;
}
export function toast(a: { name: string; reward?: Reward }, kicker = 'COMMENDATION') {
  if (typeof document === 'undefined') return;
  if (!stack || !stack.isConnected) { stack = document.createElement('div'); stack.className = 'ach-stack'; document.body.append(stack); }
  const el = document.createElement('div');
  el.className = 'ach-toast';
  const txt = document.createElement('div'); txt.className = 'ach-txt';
  const k = document.createElement('small'); k.textContent = kicker;
  const b = document.createElement('b'); b.textContent = a.name;
  txt.append(k, b);
  const rw = a.reward ? rewardText(a.reward) : '';
  if (rw) { const s = document.createElement('i'); s.textContent = rw; txt.append(s); }
  el.append(medal(), txt);
  stack.append(el);
  requestAnimationFrame(() => el.classList.add('on'));
  try { if (G?.audio?.ui) G.audio.ui('scan_new', 0.5); else sfx('unlock', 0.7); } catch { /* no audio */ }
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 4600);
}

// ================================================================== tracking
let wired = false;
let runStart = 0;
const perRun = { shouts: 0, samples: 0 };
/** listen to the run's events (installed once per page; the session calls it) */
export function wireAchievements(localId: () => string | undefined) {
  runStart = performance.now();
  perRun.shouts = 0; perRun.samples = 0;
  if (wired) return;
  wired = true;
  const me = (k: any) => !!k && (k === localId() || k.id === localId() || k === G.local);
  bus.on('death', (p: any) => { if (p === G.local && performance.now() - runStart < 60000) earn('probation'); });
  bus.on('runReport', (r: any) => {
    const k = r?.cause?.key;
    if (k === 'harmless') earn('humbled');
    if (k === 'press') earn('flattened');
    if (k === 'band') earn('terminated');
    if (k === 'thirst') earn('hydration');
    if (k === 'hunger') earn('fasting');
    if ((r?.metres ?? 99) < 20) earn('quiet_quit');
    if ((r?.hours ?? 0) >= 48 && (r?.kills ?? 1) === 0) earn('hr_compliant');
    if ((r?.valuables ?? 0) >= 5) earn('wage_slave');
    const d: any = G.debt;
    if (d?.s && d.s.principal > 0 && d.s.owed > d.s.principal) earn('compound');
    // the file has just remembered this cause (noteRunEnd runs on the same event, first)
    const ks = file().killers.slice(-3);
    if (ks.length === 3 && r?.cause?.who && ks.every((x) => x === ks[0]) && (k === 'creature' || k === 'harmless' || k === 'wounds')) earn('loyalty');
    if (deathCount() >= 10) earn('frequent');
  });
  bus.on('deposited', (e: { by?: string; keys?: string[] }) => {
    if (!e || (e.by && e.by !== localId())) return;
    if ((e.keys || []).some((k) => hasItemDef(k) && (itemDef(k) as any).clothing?.slot === 'shoes')) earn('sole');
  });
  bus.on('creatureKilled', (c: any, killer: any) => { if (c?.sp?.key === 'hush' && me(killer)) earn('noise'); });
  bus.on('sampleTaken', (e: { p?: any; alive?: boolean }) => {
    if (!me(e?.p)) return;
    if (e.alive) earn('unethical');
    if (++perRun.samples >= 5) earn('field_kit');
  });
  bus.on('shout', (p: any) => { if (me(p) && ++perRun.shouts >= 10) earn('open_floor'); });
  bus.on('bandShock', (e: { id?: string }) => { if (e?.id && e.id === localId()) earn('shock'); });
  wireMeta();
}
/** the meta layer's own events (menu and game) */
let metaWired = false;
export function wireMeta() {
  if (metaWired) return;
  metaWired = true;
  bus.on('research', () => { if (researchPoints() >= 100) earn('grant'); });
  bus.on('specimenDiscovered', () => { if (discoveredCount() >= 10) earn('fieldwork'); });
  bus.on('codexComplete', () => { const n = codexStats().complete; if (n >= 1) earn('peer_review'); if (n >= 15) earn('tenure'); });
  bus.on('sampleBanked', () => { earn('custody'); if (bump('banked') >= 25) earn('cold_storage'); });
  bus.on('sampleProcessed', (e: { spoiled?: boolean }) => { if (e?.spoiled) earn('butterfingers'); });
  bus.on('benchPerfect', () => earn('steady_hands'));
  bus.on('milestone', (m: { name: string }) => toast({ name: m.name }, 'MILESTONE'));
}
export function runStarted() { if (file().runs >= 5) earn('repeat'); }
/** the research lab's own pokes (the specimen jar, the fume-hood alarm) */
export function menuEvent(k: 'slam' | 'alarm') {
  if (k === 'slam') earn('do_not_tap');
  if (k === 'alarm' && bump('alarms') >= 5) earn('fire_drill');
}
export { counter };
