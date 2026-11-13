import * as THREE from 'three';
import { def, Rig, type SpeciesDef, type Temperament, type GoreBlood } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { hashStr } from '../../core/rng';
import type { Creature } from '../creature';
import type { Zone } from '../../world/zone';
import type { InjuryType } from '../../survival/body';
import { netOf, live, dist, localIn, thinkOnce } from '../behaviors_b';
import { flinchOf } from '../kit/humanoids';
import { lifeModel, lifeRig, lifeAnimate, type LifeGameRig } from '../life/lifeMesh';
import { wildDesign, pheno, type Design, type Kind, type Cover } from '../life/design';
import { GENE } from '../life/genes';
import type { AnimState } from '../life/anim';
import type { Ctx } from '../life/sculpt';
import { ball, hash, addV, scl, type Page, type Region } from '../life/kit';
import { Rand, type Palette } from '../life/rand';
import { mixHex } from '../../gfx/pixel';
import { speciesResolver } from '../registry';
import { addInhabitant, type SinRank } from '../lore';
import { thinkRammer, ramFeedback, type RamCfg } from './battering_hare';

// =====================================================================================
// THE WILDLIFE — every level breeds its own family of animals. The user's creature
// software (src/creatures/life: genes, designer, morph, sculptor) draws them from a
// seed per level: the body plan, how many legs and how long, the joints, the head, the
// tail, the skin (fur, scales, chitin, wet skin), the pattern and the size, coloured
// from the level's own palette and then given the same grotesque realism as the
// hand-made species (mange, sores, cracked plates, blisters, growths). The build picks
// the brain: many small legs swarm, long legs stalk, heavy bodies ram (the Battering
// Hare's brain), coils and spiders wait in ambush, grazers startle, scavengers follow.
// Every one is registered for the scanner, the codex and the lore with a generated
// name and entry. A species is only sculpted the first time one is built (one cached
// geometry and page per species), and its definition can be rebuilt from its key alone
// (`wild_<level>_<n>`), so saves and peers always agree. The hand-made species stay
// the stars: these are the background population, at modest spawn weights.
// =====================================================================================

type Arch = 'swarm' | 'ambush' | 'rammer' | 'stalker' | 'hunter' | 'scavenger' | 'grazer' | 'drifter';
interface Biome { id: string; re: RegExp; kinds: [Kind, number][]; minH: number; maxH: number; pal: Palette; hue: number[]; word: string }
interface WildInfo { zk: string; i: number; d: Design; arch: Arch; scale: number; L: number; mass: number; legs: number; zoneName: string }

function pal(key: string, grass: number, soil: number, rock: number, foliage: number[], bloom: number[]): Palette {
  return {
    key, name: key, grass, grassDry: mixHex(grass, soil, 0.5), soil, rock, sand: mixHex(soil, 0xe8d8b0, 0.4), mud: mixHex(soil, 0x201810, 0.5), clay: mixHex(soil, 0xa85a3a, 0.3),
    snow: 0xe8e8f0, basalt: mixHex(rock, 0x101014, 0.6), ore: 0x8a6a3a, crystal: bloom[0], water: 0x3a5a6a, waterDeep: 0x1a2a3a, foam: 0xd8e0e0,
    foliage, bark: [0x4a3a2a, 0x3a2e24], bloom, fungus: [0xc8b890, 0x8a6a8a], sky: 0x808890, horizon: 0xa0a8b0, fog: 0x707880, sun: 0xfff0d8, ambient: 0x606870, groundLight: 0x504840, star: 0xffffff,
  };
}
const BIOMES: Biome[] = [
  { id: 'damp', re: /pool|undercroft|tunnel|subway|depot|stair|parking|sewer|drain|wet|fungus|sea/i, word: 'damp',
    kinds: [['newt', 3], ['frog', 2], ['snail', 2.5], ['worm', 2], ['crab', 2], ['mite', 2], ['monitor', 1], ['stalker', 1], ['tortoise', 0.6]],
    minH: 0.22, maxH: 1.7, pal: pal('damp', 0x4a5a40, 0x3a3428, 0x5a5e60, [0x3a4a30, 0x2e3a2a, 0x5a6a48], [0xb8c070, 0x8ab0a0, 0xc89878]), hue: [0x5a6450, 0x6a6058, 0x4a5458, 0x7a7060] },
  { id: 'clinic', re: /hospital|lab|server|clinic|ward|core|annex/i, word: 'sterile',
    kinds: [['mite', 2], ['worm', 2], ['newt', 2], ['stalker', 1.5], ['snail', 1], ['beetle', 1], ['monitor', 1]],
    minH: 0.22, maxH: 1.6, pal: pal('clinic', 0x8a9488, 0x9a8a84, 0xa8aca8, [0x8a9a90, 0x7a8478], [0xd8b8b0, 0xc8d0a0, 0xb0c0c8]), hue: [0xb8a8a0, 0x9aa098, 0xc0b0a8, 0x8a8478] },
  { id: 'open', re: /field|meadow|homestead|farm|garden|suburb|park|playground|grass|ledge/i, word: 'open-ground',
    kinds: [['grazer', 3], ['elk', 2], ['ram', 2], ['boar', 2], ['tank', 1.5], ['tortoise', 1], ['bear', 1], ['lion', 1], ['stalker', 1.5], ['sailback', 1], ['mite', 1.5], ['frog', 1]],
    minH: 0.25, maxH: 3.4, pal: pal('open', 0x6a7a40, 0x5a4a34, 0x7a746a, [0x4a5a30, 0x5a6a3a, 0x3a4a2a], [0xd8c050, 0xc87050, 0xe8e0c0]), hue: [0x7a6a4e, 0x6a5a44, 0x8a7a60, 0x5a5040] },
  { id: 'moon', re: /moon|lunar|crater/i, word: 'lunar',
    kinds: [['tortoise', 2], ['crab', 2], ['mite', 2], ['sailback', 1], ['frog', 1], ['beetle', 1]],
    minH: 0.25, maxH: 2.2, pal: pal('moon', 0x8a8a8a, 0x6a6a6a, 0x9a9a9a, [0x7a7a80, 0x6a6a70], [0xc0c8d0, 0xa8b0b8]), hue: [0x9a9a9a, 0x7a7a80, 0x8a8478] },
  { id: 'board', re: /chess|board/i, word: 'boxwood',
    kinds: [['beetle', 2], ['crab', 2], ['mite', 2], ['frillneck', 1], ['stalker', 1]],
    minH: 0.22, maxH: 1.6, pal: pal('board', 0x8a6a40, 0x4a3420, 0x2a2420, [0x6a4a2a, 0x3a2a1a], [0xe8d8b0, 0x201814]), hue: [0x8a6a40, 0x3a2a1a, 0xd8c8a0] },
  { id: 'wrong', re: /corrupt|reality|exit|void|dream|wrong|ball/i, word: 'unrendered',
    kinds: [['mite', 1], ['crab', 1], ['beetle', 1], ['worm', 1], ['newt', 1], ['frog', 1], ['stalker', 1], ['monitor', 1], ['frillneck', 1], ['snail', 1], ['boar', 1]],
    minH: 0.22, maxH: 1.8, pal: pal('wrong', 0x5a4a6a, 0x3a3040, 0x6a6070, [0x4a3a5a, 0x5a4a6a], [0xc8a0d8, 0xa0d8c8, 0xd8d0a0]), hue: [0x6a5a70, 0x5a6a6a, 0x7a6a5a] },
  // the default: furnished, carpeted, lit by tubes (the lobby, offices, the mall, the school, houses)
  { id: 'indoor', re: /./, word: 'carpet',
    kinds: [['mite', 3], ['beetle', 2], ['crab', 1], ['worm', 1.5], ['stalker', 1.5], ['grazer', 1], ['newt', 1], ['monitor', 1], ['boar', 0.7], ['frog', 0.6]],
    minH: 0.22, maxH: 1.7, pal: pal('indoor', 0x8a7a50, 0x6a5a3a, 0x8a8478, [0x7a6a40, 0x6a6040, 0x8a7a50], [0xd8c870, 0xb8a080, 0xc87a5a]), hue: [0x5a5048, 0x6a5a4a, 0x4a4440, 0x6a4a40] },
];
/** set pieces and special floors keep only their own */
const SKIP = /^(exit|ledge|meridian|title|tutorial|intro|void)$/i;

const LEGS: Record<string, number> = { hexapod: 6, octopod: 8, quadruped: 4, biped: 2, hexapodV: 6, serpent: 0, gastropod: 0, hominid: 2 };
const FAM = new Map<string, WildInfo[]>();
const pretty = (k: string) => k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
function biomeOf(zk: string, name = ''): Biome { const id = zk + ' ' + name; return BIOMES.find((b) => b.re.test(id))!; }

/** the level's family: three or four species, drawn from its seed */
export function familyOf(zk: string, zoneName?: string): WildInfo[] {
  const hit = FAM.get(zk); if (hit) return hit;
  const B = biomeOf(zk, zoneName);
  const r = new Rand(hashStr('wild:' + zk) >>> 0);
  const n = B.id === 'open' ? 4 : 3;
  // the family resemblance: one hue and one pattern scale run through all of them
  const hue = r.pick(B.hue), patK = r.range(0.7, 1.4);
  const used = new Set<Kind>(), names = new Set<string>();
  const out: WildInfo[] = [];
  for (let i = 0; i < n; i++) {
    let kind = r.weighted(B.kinds);
    for (let k = 0; k < 4 && used.has(kind); k++) kind = r.weighted(B.kinds);
    used.add(kind);
    const d = wildDesign(kind, B.pal, (hashStr(zk + ':' + i) >>> 0) || 1);
    // realism over candy: pull the colours toward the family's earth and take some of the saturation out
    const tame = (c: number, k: number) => mixHex(mixHex(c, hue, k), 0x6a665e, 0.2);
    d.colors = { base: tame(d.colors.base, 0.52), belly: tame(d.colors.belly, 0.3), pattern: tame(d.colors.pattern, 0.35), accent: tame(d.colors.accent, 0.4), eye: d.colors.eye };
    d.patScale *= patK;
    if (names.has(d.name)) d.name = d.name + ' ' + ['Minor', 'Major', 'Lesser', 'Greater'][i % 4];
    names.add(d.name);
    const ph = pheno(d);
    const natH = Math.max(0.05, ph.height);
    const scale = Math.min(B.maxH, Math.max(B.minH, natH)) / natH;
    const L = ph.length * scale, mass = ph.stats.mass * scale * scale * scale, legs = LEGS[d.plan] ?? 4;
    const carn = ph.diet === 'carn' || ph.diet === 'omni';
    const arch: Arch = legs >= 6 && L < 1.3 ? 'swarm'
      : d.plan === 'serpent' || d.plan === 'octopod' ? 'ambush'
      : d.plan === 'gastropod' ? 'drifter'
      : mass > 320 && legs >= 4 ? 'rammer'
      : carn && (d.legLen > 0.55 || ph.stats.speed > 6) ? 'stalker'
      : carn ? 'hunter'
      : ph.diet === 'scav' ? 'scavenger' : 'grazer';
    out.push({ zk, i, d, arch, scale, L, mass, legs, zoneName: zoneName || pretty(zk) });
  }
  FAM.set(zk, out);
  for (const w of out) register(w);
  return out;
}

// ------------------------------------------------------------------ the grotesque pass over a generated body
function rot(w: WildInfo) {
  return (S: Ctx, page: Page) => {
    const r = new Rand(w.d.seed ^ 0x5bd1e995), cover = w.d.cover as Cover;
    for (const name of ['BODY', 'HEAD', 'LIMB']) {
      const R = page.regs.get(name); if (!R) continue;
      paintRot(R, cover, r.int(1, 999));
    }
    // growths: tumours and cysts riding the spine, veined and shiny
    const sp = S.spine;
    if (sp && sp.pts.length > 6) {
      const GROW = S.fixed('WL_GROW', 12, 12);
      const n = r.int(1, 3);
      for (let k = 0; k < n; k++) {
        const j = Math.floor(sp.pts.length * r.range(0.25, 0.8)), f = sp.fr[j];
        const side = r.sign() * r.range(0.2, 0.8);
        const at = addV(addV(sp.pts[j], scl(f.u, sp.ru[j] * 0.75)), scl(f.v, sp.rv[j] * side));
        const rad = Math.max(sp.ru[j], sp.rv[j]) * r.range(0.22, 0.42);
        ball(S.B, GROW, S.gid(), at, f.u, [rad, rad * 0.8, rad * 1.1], sp.w[j], { n: 8, rings: 5, bump: (a, t) => 0.12 * Math.sin(a * 3 + t * 5) });
      }
      const skin = mixHex(w.d.colors.belly, 0xc89088, 0.55);
      for (let y = 0; y < GROW.h; y++) for (let x = 0; x < GROW.w; x++) GROW.set(x, y, mixHex(skin, 0xf0d8d0, Math.max(0, Math.cos(GROW.th(x))) * 0.35 + (hash(x, y) - 0.5) * 0.1));
      for (let i = 0; i < 6; i++) GROW.line(hash(i, 1) * GROW.w, 0, hash(i, 2) * GROW.w, GROW.h, 0x6a2a4a, 0.5);
    }
  };
}
function paintRot(R: Region, cover: Cover, seed: number) {
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
    const m = R.fbm(x, y, 5, 2, seed), h = hash(x * 3 + seed, y * 7);
    if (cover === 'fur') {
      if (m > 0.74) R.set(x, y, h < 0.22 ? 0x5a1a14 : mixHex(0xb08a84, 0xd0a8a0, hash(x * 5, y))); // mange, scabs
      else if (m < 0.17) R.blend(x, y, 0x1e1812, 0.5); // matted, filthy
    } else if (cover === 'scales' || cover === 'chitin') {
      if (m > 0.78) R.set(x, y, h < 0.3 ? 0x2a1a10 : h < 0.5 ? 0xb89a3a : 0xc88a80); // cracked plates, weeping, raw under
      else if (m > 0.72) R.blend(x, y, 0x1a120c, 0.6);
    } else {
      if (h < 0.018) R.set(x, y, 0xe8d0c0); // blisters
      else if (h < 0.03) R.blend(x, y, 0x4a1a1a, 0.6);
      if (m > 0.76) R.blend(x, y, 0x7a2a3a, 0.35); // raw patches and veins
      else if (m < 0.2) R.blend(x, y, 0xf0f0e8, 0.12); // wet sheen
    }
  }
}

// ------------------------------------------------------------------ build and drive
function buildWild(w: WildInfo): LifeGameRig {
  const model = lifeModel(key(w), w.d, rot(w));
  return lifeRig(model, w.scale, model.rig.height * w.scale);
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function animateWild(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as LifeGameRig, w = (c.sp as any).wild as WildInfo, n = netOf(c);
  const p = live() ? G.local : null;
  const d = p && p.zoneKey === c.zoneKey ? dist(p, c) : 99;
  const md = n.md as string | undefined;
  const state: AnimState = c.dead ? 'dead' : c.attackPhase > 0 ? 'attack' : md === 'dazed' ? 'stunned'
    : (c.state === 'graze' || c.state === 'eat') && c.speed < 0.1 ? 'eat' : c.speed > 0.1 ? 'move' : 'idle';
  const act = c.attackPhase > 0 ? 1 - Math.min(1, c.attackPhase / 0.38) : 0;
  if (lifeAnimate(R, dt, { speed: (c.dead ? 0 : c.speed) / w.scale, state, act }, 0, d > 30)) {
    const L = R.life, lr = L.model.rig, B = L.bones, ud = L.m as Record<string, number>;
    // the ram: head down and in, then a dead straight run
    const low = (ud.low = (ud.low ?? 0) + (((md === 'scrape' || md === 'charge') ? 1 : 0) - (ud.low ?? 0)) * (1 - Math.exp(-6 * dt)));
    if (low > 0.01 && lr.neck.length && lr.neck[0] >= 0) { _q.setFromEuler(_e.set(0.5 * low, 0, 0)); B[lr.neck[0]].quaternion.premultiply(_q); }
    const fl = flinchOf(c);
    if (fl > 0) B[lr.root].position.x += Math.sin(t * 60) * 0.02 * fl;
    L.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  }
  if (w.arch === 'rammer') ramFeedback(rig, c, t, d);
  const lp = localIn(c);
  if (lp && !c.dead && c.visibleToLocal && d < 14) thinkOnce(lp, 'wild_' + c.sp.key, firstLook(w), 400);
}
function firstLook(w: WildInfo): string {
  const noun = w.d.name.split(' ').slice(-1)[0].toLowerCase();
  const r = new Rand(w.d.seed);
  return w.arch === 'swarm' ? r.pick([`Little ${noun}s. A lot of legs. They are all turning to face me.`, `There is never just one of those ${noun}s.`])
    : w.arch === 'rammer' ? r.pick([`That ${noun} is the size of a car. If it puts its head down, I move.`, `Heavy. Heavy enough to go through a wall.`])
    : w.arch === 'stalker' ? r.pick([`That one has long legs and it is keeping pace with me. Not closing. Pacing.`, `It is following me. It stops when I stop.`])
    : w.arch === 'ambush' ? r.pick([`Something coiled in the corner. Do not go near the corners.`, `It is not moving. It is waiting.`])
    : w.arch === 'hunter' ? r.pick([`Teeth. That ${noun} has seen me.`, `Something that lives here and eats meat. I am meat.`])
    : w.arch === 'scavenger' ? r.pick([`It is sniffing at me. Checking whether I am dead yet.`, `A ${noun}, picking at something on the floor.`])
    : r.pick([`Some kind of ${noun}. It lives here. It has sores all over it.`, `Never seen one of those. Not in any book.`]);
}

// ------------------------------------------------------------------ registration: species, scan notes, lore
const key = (w: WildInfo) => `wild_${w.zk}_${w.i}`;
const SIZE_W = (L: number) => L < 0.5 ? 'cat-sized' : L < 1 ? 'dog-sized' : L < 2 ? 'pony-sized' : L < 3.5 ? 'cattle-sized' : 'huge';
const PLAN_W: Record<string, string> = { hexapod: 'six-legged crawler', octopod: 'eight-legged spinner', quadruped: 'four-legged animal', biped: 'two-legged runner', hexapodV: 'six-legged beast', serpent: 'legless coiler', gastropod: 'single-footed glider', hominid: 'upright walker' };
const COVER_W: Record<string, string> = { fur: 'a mangy, matted coat', scales: 'cracked, weeping scales', chitin: 'a split chitin shell', skin: 'bare, blistered skin', slime: 'wet, veined skin' };
const ARCH: Record<Arch, { temp: Temperament; rank: SinRank; danger: number; threat: number; weight: number; group: [number, number]; max: number; behave: string }> = {
  swarm: { temp: 'hostile', rank: 'gluttony', danger: 5, threat: 3, weight: 0.35, group: [3, 6], max: 9, behave: 'They live in loose swarms and come at anything warm all at once, from every side, many small bites rather than one big one. Kill one and the rest hesitate for a moment; keep moving.' },
  ambush: { temp: 'ambush', rank: 'greed', danger: 5, threat: 3, weight: 0.3, group: [1, 1], max: 2, behave: 'It waits in corners and under things, perfectly still, and strikes at whatever passes within reach. It will not chase far.' },
  rammer: { temp: 'territorial', rank: 'wrath', danger: 6, threat: 4, weight: 0.2, group: [1, 1], max: 1, behave: 'Heavy enough to go through walls, and it does: it lowers its head, scrapes, and charges in a dead straight line at anything it sees or hears close by. It cannot turn once it has started, and it is dazed for a moment if it hits something that will not break.' },
  stalker: { temp: 'stalker', rank: 'greed', danger: 6, threat: 4, weight: 0.3, group: [1, 1], max: 2, behave: 'Long-legged and quick, it follows a unit at a distance, matching pace, and closes when it is turned away or hurt. Facing it and standing your ground makes it hesitate.' },
  hunter: { temp: 'hostile', rank: 'wrath', danger: 5, threat: 3, weight: 0.3, group: [1, 2], max: 2, behave: 'A meat-eater that attacks on sight, bites and holds on. It gives up once it is badly hurt.' },
  scavenger: { temp: 'curious', rank: 'gluttony', danger: 2, threat: 1, weight: 0.5, group: [1, 2], max: 3, behave: 'It eats the dead and follows the living around in case they become the dead. It keeps its distance and only bites what is down.' },
  grazer: { temp: 'skittish', rank: 'sloth', danger: 1, threat: 0, weight: 0.6, group: [1, 3], max: 4, behave: 'It grazes on whatever grows here, carpet included, and startles and bolts from anything that comes near. Cornered, it kicks.' },
  drifter: { temp: 'peaceful', rank: 'sloth', danger: 1, threat: 0, weight: 0.45, group: [1, 2], max: 3, behave: 'It glides slowly over the floor on its one wet foot, grazing the mould and the dust, and does not seem to notice anything else.' },
};
function register(w: WildInfo) {
  const k = key(w), d = w.d, ph = pheno(d), A = ARCH[w.arch], s = w.scale;
  const carn = ph.diet === 'carn' || ph.diet === 'omni' || w.arch === 'swarm' || w.arch === 'ambush' || w.arch === 'stalker' || w.arch === 'hunter';
  const run = Math.min(10, Math.max(1.2, ph.stats.speed * Math.sqrt(s) * (w.arch === 'stalker' ? 1.25 : w.arch === 'swarm' ? 1.15 : 1)));
  const radius = Math.min(1.5, Math.max(0.12, w.L * 0.3));
  const height = Math.min(4, Math.max(0.15, ph.height * s));
  const atk = Math.min(30, Math.max(3, ph.stats.attack * Math.sqrt(s) * 2.2));
  const kinds: InjuryType[] = carn ? ['bite', 'laceration'] : ['bruise', 'scratch'];
  const blood: GoreBlood = d.lineage === 'arthropod' ? 'dark' : d.lineage === 'annelid' || d.lineage === 'mollusc' ? 'pale' : 'red';
  const big = w.L > 1.2;
  const sounds = d.lineage === 'arthropod' ? { idle: 'ventling_chitter', alert: 'swivel_skitter', hurt: 'ventling_squeal', death: 'creature_death', step: 'plenum_skitter' }
    : d.cover === 'slime' || d.plan === 'serpent' || d.plan === 'gastropod' ? { idle: 'tc_squish', alert: 'underlay_hiss', hurt: 'cy_squeal', death: 'creature_death' }
    : big ? { idle: 'hound_huff', alert: 'dog_growl', attack: 'tithe_growl', hurt: 'creature_hurt', death: 'hound_death', step: 'strider_land' }
    : { idle: 'gloam_hiss', alert: 'gloam_hiss', hurt: 'creature_hurt', death: 'creature_death' };
  const genes = d.genes.map((g) => GENE[g]?.name).filter(Boolean).slice(0, 5) as string[];
  const summary = `A ${SIZE_W(w.L)} ${PLAN_W[d.plan] ?? 'animal'} with ${COVER_W[d.cover] ?? 'a sore-covered hide'}${d.pattern !== 'plain' ? `, ${d.pattern} under the filth` : ''}. ${w.legs ? `${w.legs} legs` : 'No legs'}, ${d.legLen > 0.6 ? 'long and many-jointed' : d.legLen < 0.35 ? 'short and splayed' : 'thick at the joint'}; ${d.tail > 0.6 ? 'a long tail' : d.tail < 0.25 ? 'barely a tail' : 'a stub of a tail'}. Growths ride its back.`;
  const sp: SpeciesDef = {
    key: k, name: d.name, code: `WF-${(hashStr(k) >>> 0) % 9000 + 1000} // FAUNA, ${(PLAN_W[d.plan] ?? 'animal').toUpperCase()} (${w.zoneName.toUpperCase()} LINEAGE)`,
    temperament: A.temp, threat: A.threat,
    hp: Math.round(Math.min(420, Math.max(8, ph.stats.hp * s * s * 0.6))), walk: Math.min(2.4, Math.max(0.35, run * 0.3)), run, turn: big ? 3 : 7,
    radius, height, sight: Math.min(24, Math.max(6, ph.stats.sight * 1.3)), fov: 1.4, hearing: 1 + ph.stats.smell * 0.05, smell: ph.stats.smell > 6,
    attack: { dmg: carn ? [Math.round(atk), Math.round(atk * 1.8)] : [2, 5], range: radius + 0.55, cooldown: Math.min(3, Math.max(0.8, 1.6 / ph.stats.attackRate)), kinds, corrupt: 0, knock: Math.min(2.2, 0.3 + w.mass / 400) },
    zones: [w.zk], weight: A.weight, group: A.group, maxPerZone: A.max,
    diet: ph.diet === 'herb' ? 'grass' : 'meat',
    meat: big ? [['meat_raw', Math.max(1, Math.round(w.L * 1.5))]] : [['small_meat_raw', 1]],
    flags: w.arch === 'swarm' ? { pack: true } : undefined,
    sounds,
    rule: w.arch === 'rammer' ? { name: 'IT RAMS IN A STRAIGHT LINE', text: 'It lowers its head, scrapes and charges in a dead straight line through what is in the way. It cannot turn once it has started; step out of the line. Something solid behind you leaves it dazed.', tell: 'Head down. Scraping. Lined up on me.' } : undefined,
    gore: { blood, flesh: d.lineage === 'arthropod' ? 0x8a8a5a : 0xa84a4a },
    scan: {
      cls: `Fauna / ${PLAN_W[d.plan] ?? 'animal'} (native to ${w.zoneName})`,
      notes: [summary, `Build: ${genes.join(', ')}. About ${Math.max(1, Math.round(w.mass))} kg.`, A.behave, `Found only on ${w.zoneName}: every level breeds its own.`],
    },
    build: () => buildWild(w), animate: animateWild,
    think: w.arch === 'rammer' ? thinkRammer : undefined,
  };
  (sp as any).wild = w;
  if (w.arch === 'rammer') (sp as any).ram = { v: Math.min(12, Math.max(7, run * 1.3)), max: 24, dmg: [Math.round(atk), Math.round(atk * 1.6) + 10], cdmg: 45, scrape: 1.6, sight: 20, wander: 14 } as RamCfg;
  const S = def(sp);
  S.animateGallery = (rig: Rig, t: number) => {
    const R = rig as LifeGameRig, q = new URLSearchParams(location.search).get('pose');
    const mv = q ? q === 'move' : Math.floor(t / 3) % 2 === 1;
    lifeAnimate(R, 1 / 60, { speed: mv ? Math.min(3, run) / w.scale : 0, state: mv ? 'move' : 'idle' }, 0, false);
  };
  addInhabitant({
    id: k, name: d.name, rank: A.rank, class: w.arch === 'swarm' ? 'Swarm' : 'Fauna', danger: A.danger,
    summary,
    biology: `${d.latin}. ${genes.length ? 'Its build: ' + genes.join(', ').toLowerCase() + '.' : ''} ${ph.diet === 'herb' ? 'A grazer.' : ph.diet === 'scav' ? 'A scavenger.' : 'A meat-eater.'} About ${Math.max(1, Math.round(w.mass))} kg and ${w.L.toFixed(1)} m long. Like everything bred here it is sick: the sores and growths on it are not injuries, they are how its skin grows.`,
    behaviour: A.behave,
    habitat: `${w.zoneName}, and nowhere else. Every level breeds its own family of animals out of what it has; this is one of ${w.zoneName}'s.`,
    lore: `The Institute's field teams catalogue the native families level by level and stopped naming them after people a long time ago. This one is filed as ${d.latin}, the ${d.name}. ${new Rand(d.seed).pick(['Nobody has found a young one.', 'The growths on its back are warm to the touch.', 'The units on the survey teams say it smells of wet carpet.', 'Two survey teams describe it differently. Both may be right.', 'It is the commonest thing on its level, after the dust.'])}`,
    harvest: [{ item: big ? 'meat_raw' : 'small_meat_raw', how: 'Butcher the carcass. Cook it through: nothing that grows here is clean.' }],
  });
}

// ------------------------------------------------------------------ into the levels
bus.on('zoneGenerated', (z: Zone) => {
  if (!Array.isArray(z.spawnTable) || !z.spawnTable.length || SKIP.test(z.key)) return;
  for (const w of familyOf(z.key, z.name)) {
    const k = key(w);
    if (!z.spawnTable.some(([s]) => s === k)) z.spawnTable.push([k, ARCH[w.arch].weight]);
  }
});
// a key alone (a save, a peer's spawn) rebuilds its level's family
speciesResolver((k) => { const m = /^wild_(.+)_(\d+)$/.exec(k); if (m) familyOf(m[1]); });
// the creature gallery: ?gallery=creatures&filter=wild_<level>
try {
  const q = new URLSearchParams(location.search);
  const f = q.get('filter') || '';
  if (q.get('gallery') === 'creatures' && f.startsWith('wild')) {
    const m = /^wild_([a-z]+)/.exec(f);
    for (const zk of m ? [m[1]] : ['lobby', 'pools', 'fields', 'hospital']) familyOf(zk);
  }
} catch { /* no location (tests) */ }
