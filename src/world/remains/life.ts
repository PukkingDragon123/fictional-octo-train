// What lives off the remains (./kit.ts): the larder the Giant Bumble Bees forage
// from (larderNear / nibble, host side), the flies over every body near the
// local unit (a purely local visual: one instanced mesh, a soft buzz), and
// the watch's reading of a scanned body: who it was, how long ago, and what
// did it (named only once that inhabitant is in your records).
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { op } from '../../game/ops';
import type { Zone, TileObject } from '../zone';
import { objDef } from '../objects';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { FLESHED, REMAINS_TAG } from './kit';

// ====================================================================== the larder
const CACHE = new WeakMap<Zone, Set<TileObject>>();
export function isRemains(key: string): boolean {
  if (key === 'skeleton') return true;
  const d = objDef(key);
  return !!d && (d.tags ?? []).includes(REMAINS_TAG);
}
/** every remains prop in a zone (cached; kept current by the object add / remove events) */
export function remainsIn(z: Zone): Set<TileObject> {
  let s = CACHE.get(z);
  if (!s) { s = new Set(); for (const o of z.objects.values()) if (isRemains(o.key)) s.add(o); CACHE.set(z, s); }
  return s;
}
bus.on('objAdded', (z: Zone, o: TileObject) => { const s = CACHE.get(z); if (s && o && isRemains(o.key)) s.add(o); });
bus.on('objRemoved', (z: Zone, o: TileObject) => { CACHE.get(z)?.delete(o); });

/** the middle of an object's footprint */
export function objCentre(o: TileObject): [number, number] {
  const d = objDef(o.key) ?? { w: 1, d: 1 };
  const w = d.w ?? 1, dd = d.d ?? 1;
  const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  return [o.x + rw / 2, o.y + rd / 2];
}

/** something a forager can eat from: a fleshed prop or a creature's corpse */
export interface Larder { id: string; x: number; z: number; obj?: TileObject; cid?: string; left: number; key: string }
/** creatures nobody forages from (and the foragers themselves) */
const NOT_FOOD = new Set(['bumble_bee', 'queen_bee', 'bee_keeper']);

/** host: the nearest remains with soft parts left within r of (x, z) */
export function larderNear(z: Zone, x: number, zz: number, r: number, skip?: (id: string) => boolean): Larder | null {
  let best: Larder | null = null, bd = r;
  for (const o of remainsIn(z)) {
    if (!FLESHED.has(o.key)) continue;
    const e = o.state?.eaten | 0;
    if (e >= 3) continue;
    const [cx, cz] = objCentre(o);
    const d = Math.hypot(cx - x, cz - zz);
    const id = 'o' + o.uid;
    if (d < bd && !skip?.(id)) { bd = d; best = { id, x: cx, z: cz, obj: o, left: 3 - e, key: o.key }; }
  }
  const cs: any = G.creatures;
  if (cs?.creatures) for (const c of cs.creatures.values()) {
    if (!c.dead || c.zoneKey !== z.key || c.butchered || NOT_FOOD.has(c.sp.key) || c.sp.flags?.plush || c.sp.flags?.noCorpse || c.sp.gore?.blood === 'stuffing' || c.sp.gore?.blood === 'plaster') continue;
    const picked = c.mem.picked ?? 0;
    if (picked >= 4) continue;
    const d = Math.hypot(c.x - x, c.z - zz);
    const id = 'c' + c.id;
    if (d < bd && !skip?.(id)) { bd = d; best = { id, x: c.x, z: c.z, cid: c.id, left: 4 - picked, key: c.sp.key }; }
  }
  return best;
}
/** host: one forager's meal off it (two meals take a level of the soft parts off a prop) */
export function nibble(z: Zone, l: Larder) {
  if (l.obj) {
    const o = z.objects.get(l.obj.uid); if (!o) return;
    const bites = (o.state?.bites | 0) + 1, e = o.state?.eaten | 0;
    op('objState', { z: z.key, uid: o.uid, patch: bites >= 2 ? { bites: 0, eaten: Math.min(3, e + 1) } : { bites } });
    return;
  }
  const c = (G.creatures as any)?.creatures?.get(l.cid);
  if (c) { c.mem.picked = (c.mem.picked ?? 0) + 1; if (c.mem.picked >= 4) c.butchered = true; }
}

// ====================================================================== flies
const NF = 72, PER = 6;
interface Swarm { x: number; z: number; y: number; r: number; seed: number; key: string }
class Flies {
  mesh: THREE.InstancedMesh | null = null;
  swarms: Swarm[] = [];
  private scanT = 0;
  private buzzT = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private t = 0;
  private ensure() {
    if (this.mesh || !G.pr?.scene) return;
    // a fly: a black glossy body, a red-brown head, two pale smoky wings held in a V
    const mb = new ModelBuilder();
    mb.sphere(0, 0, 0, 0.012, 6, 4, 'rm_rubber', { color: 0x2a2a30, sy: 0.75 });
    mb.sphere(0.012, 0.002, 0, 0.007, 5, 3, 'rm_marrow', { color: 0x8a3020 });
    mb.quadRaw([[-0.004, 0.006, 0], [0.006, 0.006, 0], [-0.008, 0.012, 0.022], [-0.016, 0.009, 0.018]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'white', 0xc8ccd8, 1, 0.2);
    mb.quadRaw([[-0.004, 0.006, 0], [-0.016, 0.009, -0.018], [-0.008, 0.012, -0.022], [0.006, 0.006, 0]], [[0, 0], [0, 1], [1, 1], [1, 0]], 'white', 0xc8ccd8, 1, 0.2);
    this.mesh = new THREE.InstancedMesh(mb.build(), worldMaterial({}), NF);
    this.mesh.frustumCulled = false; this.mesh.name = 'remainsFlies'; this.mesh.castShadow = false;
    G.pr.scene.add(this.mesh);
  }
  clear() { this.swarms.length = 0; if (this.mesh) { this.m4.makeScale(0, 0, 0); for (let i = 0; i < NF; i++) this.mesh.setMatrixAt(i, this.m4); this.mesh.instanceMatrix.needsUpdate = true; } }
  update(dt: number) {
    const p: any = G.local, z: Zone | undefined = G.view?.zone;
    if (!p || !z || p.zoneKey !== z.key) return;
    this.ensure();
    const m = this.mesh; if (!m) return;
    this.t += dt;
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.6;
      const near: (Swarm & { d: number })[] = [];
      for (const o of remainsIn(z)) {
        const [cx, cz] = objCentre(o);
        const d = Math.hypot(cx - p.x, cz - p.z);
        if (d > 15) continue;
        const fleshy = FLESHED.has(o.key) && (o.state?.eaten | 0) < 3;
        near.push({ x: cx, z: cz, y: o.key === 'rm_bones' || o.key === 'skeleton' ? 0.12 : 0.28, r: o.key === 'rm_carcass' || o.key === 'rm_unit' ? 0.6 : 0.35, seed: o.uid % 97, key: fleshy ? 'f' : 'b', d: d - (fleshy ? 3 : 0) });
      }
      const cs: any = G.creatures;
      if (cs?.creatures) for (const c of cs.creatures.values()) {
        if (!c.dead || c.zoneKey !== z.key || c.sp.flags?.plush || c.sp.flags?.noCorpse) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 15) near.push({ x: c.x, z: c.z, y: Math.min(0.5, c.height * 0.35), r: Math.min(0.8, c.radius + 0.2), seed: (c.id.charCodeAt(1) ?? 3) % 97, key: 'f', d });
      }
      near.sort((a, b) => a.d - b.d);
      this.swarms = near.slice(0, Math.floor(NF / PER));
    }
    let i = 0, closest = 99;
    const t = this.t;
    for (const s of this.swarms) {
      const n = s.key === 'f' ? PER : 3;
      closest = Math.min(closest, Math.hypot(s.x - p.x, s.z - p.z));
      for (let k = 0; k < n && i < NF; k++, i++) {
        const sd = s.seed * 13 + k * 7.31;
        // most circle in lazy loops over it; one or two settle and crawl, then lift off again
        const landed = Math.sin(t * 0.37 + sd) > 0.55;
        const a = t * (1.6 + (k % 3) * 0.7) + sd, b = t * (2.3 + (k % 2)) + sd * 1.7;
        let x: number, y: number, zz: number;
        if (landed) { x = s.x + Math.cos(sd) * s.r * 0.5 + Math.sin(t * 0.8 + k) * 0.03; zz = s.z + Math.sin(sd * 1.3) * s.r * 0.5; y = s.y * 0.6 + 0.01; }
        else {
          x = s.x + Math.cos(a) * s.r * (0.6 + 0.4 * Math.sin(b * 0.5)) + Math.sin(t * 17 + sd) * 0.02;
          zz = s.z + Math.sin(a * 1.13) * s.r * (0.6 + 0.4 * Math.cos(b * 0.4)) + Math.cos(t * 19 + sd) * 0.02;
          y = s.y + 0.15 + Math.sin(b) * 0.18 + Math.sin(t * 23 + sd) * 0.015;
        }
        const yaw = landed ? sd : -a - Math.PI / 2;
        this.e.set(0, yaw, 0);
        this.q.setFromEuler(this.e);
        const wing = landed ? 1 : 0.7 + 0.3 * Math.sin(t * 90 + k);
        this.s.set(1, wing, 1);
        this.m4.compose(this.v.set(x, (z.heightAt(Math.floor(x), Math.floor(zz)) ?? 0) + y, zz), this.q, this.s);
        m.setMatrixAt(i, this.m4);
      }
    }
    this.m4.makeScale(0, 0, 0);
    for (; i < NF; i++) m.setMatrixAt(i, this.m4);
    m.instanceMatrix.needsUpdate = true;
    // the buzz, close up
    if ((this.buzzT -= dt) <= 0 && closest < 4) { this.buzzT = 5 + Math.random() * 4; G.audio?.at?.('limb_flies', p.x + 0.5, p.z, 0.22); }
  }
}

// ====================================================================== the watch reads a body
/** what killed them, by zone: the wound the watch describes, the inhabitant it points to */
const CAUSES: Record<string, { k: string; wound: string }[]> = {
  lobby: [
    { k: 'driller', wound: 'The legs are gone below the knee, sheared in a ring, and the carpet under it is torn open in a circle. It was eaten from underneath.' },
    { k: 'strider', wound: 'Both shoulders dislocated, the feet clear of the floor in the bruising. It was lifted up to the ceiling tiles and dropped.' },
    { k: 'whip_rat', wound: 'Welts in long stripes across the face and hands, and the eyes taken. Small teeth did the rest, in the dark.' },
  ],
  ledge: [
    { k: 'gummy_bear', wound: 'The skin is burned off in a sheet, sweet-smelling. Something swallowed it whole and gave up halfway.' },
    { k: 'queen_bee', wound: 'Acid-etched to the bone, the suit dissolved in a ring at the waist. It was swallowed, partly digested, and brought back up.' },
    { k: '', wound: 'No wound. The suit has run like the carpet. It sat down in the heat and did not get up.' },
  ],
  tunnels: [
    { k: 'driller', wound: 'Bitten through at the waist in one mouthful. A ragged hole in the concrete next to it, still warm, still trickling grit.' },
    { k: 'whip_rat', wound: 'Torn open in a long run of small bites. The welts on the arms are in sets of three, from the whips.' },
    { k: 'hum_possum', wound: 'An old death. The pockets are turned out and the soft parts picked at by something small and polite.' },
  ],
  undercroft: [
    { k: 'king_in_yellow', wound: 'There is not a mark on it. The eyes are open and the face is turned up at something.' },
    { k: 'seated', wound: 'Seated, hands folded. It stopped breathing in the middle of answering a question.' },
    { k: 'mulcher', wound: 'Riddled with small round holes, each with a shed skin in it. Something laid in it while it was still warm.' },
  ],
};
const GENERIC = [{ k: '', wound: 'Bite marks everywhere, all of them small. Many mouths, over many days. The bees have been at it.' }];
export function causesFor(zoneKey: string) { return CAUSES[zoneKey] ?? GENERIC; }
const NAMES: Record<string, string> = {
  grinhound: 'Grinhound', underlay: 'Underlay', stammer: 'Stammer', gummy_bear: 'Gummy Bear', queen_bee: 'the Queen', gloam: 'Gloam', surveyor: 'Surveyor',
  king_in_yellow: 'the King in Yellow', seated: 'the Seated', mulcher: 'Mulchers',
};

function readBody(key: string) {
  const p: any = G.local, z: Zone | undefined = G.view?.zone;
  if (!p || !z) return;
  let best: TileObject | null = null, bd = 22;
  for (const o of remainsIn(z)) { if (o.key !== key) continue; const [cx, cz] = objCentre(o); const d = Math.hypot(cx - p.x, cz - p.z); if (d < bd) { bd = d; best = o; } }
  if (!best) return;
  const s = best.state ?? {};
  const list = causesFor(z.key);
  const c = list[(s.cause ?? best.uid) % list.length];
  const days = s.days ?? (3 + (best.uid % 40));
  const eaten = s.eaten | 0;
  const known = !!c.k && !!(G as any).scan?.known?.('creature', c.k);
  const who = key === 'rm_unit' ? `Unit ${1000 + ((best.uid * 7919) % 8999)}-${'KLMRSTVX'[best.uid % 8]}, sending ${2 + (best.uid % 11)} cycles back.` : key === 'rm_carcass' ? (['A Stilt Doe.', 'A Grinhound.', 'A Giant Bumble Bee, drained.'][(s.v ?? 0) % 3]) : key === 'rm_gore_pile' ? 'Not one body. Parts of two, maybe three.' : 'Adult. Old.';
  const age = days < 5 ? `Dead about ${days} days.` : days < 20 ? `Dead ${days} days, give or take.` : 'Dead longer than the watch can say.';
  const bees = FLESHED.has(key) ? (eaten >= 2 ? ' The soft parts are mostly gone: bee mandibles, thousands of small bites.' : eaten === 1 ? ' Bees have started on it.' : '') : '';
  const culprit = c.k ? (known ? ` Consistent with ${NAMES[c.k] ?? c.k}.` : ' Cause: an inhabitant not yet in your records.') : '';
  bus.emit('subtitle', { who: 'WATCH // REMAINS', text: `${who} ${age} ${c.wound}${culprit}${bees}`, style: 'radio', dur: 9 });
}
bus.on('scanEntry', (s: { kind?: string; key?: string }) => {
  if (!s?.key || (s.kind !== 'object' && s.kind !== 'anomaly') || !isRemains(s.key)) return;
  try { readBody(s.key); } catch (e) { console.warn('remains clue', e); }
});

// ====================================================================== install (once a session has a scene)
let flies: Flies | null = null;
bus.on('enterZone', () => {
  if (flies) { flies.clear(); return; }
  const g: any = G;
  if (!g?.addSystem || !g.pr?.scene) return;
  flies = new Flies();
  g.addSystem({ name: 'remainsFlies', update: (dt: number) => { try { flies!.update(dt); } catch (e) { console.warn('flies', e); } }, onZoneChange: () => flies?.clear() });
});
