// Still Life props: replicas of people the place made from memory, posed in
// the homes it copies. Static furniture (chunk-meshed, no draw calls of their
// own), baked from the same wax-cast HumanRigs as the live still_life species
// (src/creatures/kit/replica.ts), so a prop at the table and one that turns
// its head are indistinguishable.
//
// state (all optional):
//   v     memory index 0..6 (see MEMORIES; 4 is the child). Missing: picked
//         per object from its tile when the zone is generated (deterministic).
//   pose  'sit' | 'sit_table' | 'stand' | 'lie' | 'kneel' (defaults per key)
//   seat  replica_seated: a chair key it sits on ('chair_wood' default), or
//         'none' to sit on whatever is already there (a sofa, a bench)
//   bed   replica_lying: 'bed_single' (default), 'bed_double', or 'none'
//         (lies on the floor / on a surface: use state.y)
import * as THREE from 'three';
import { defObj, objDef, buildObjGeometry } from '../../world/objects';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { bus } from '../../core/events';
import type { Zone } from '../../world/zone';
import { bakeReplica, replicaPose, ReplicaPose, ADULT_MEMORIES, CHILD_MEMORY, MEMORY_COUNT } from '../../creatures/kit/replica';

const KEYS = ['replica_seated', 'replica_standing', 'replica_lying', 'replica_child'];
export const REPLICA_KEYS = new Set(KEYS);

function seatUnder(mb: ModelBuilder, key: string | undefined, fallback: string) {
  const k = key ?? fallback;
  if (!k || k === 'none' || !objDef(k)) return;
  const g = buildObjGeometry(k);
  if (g) mb.appendGeometry(g, new THREE.Matrix4());
}
/** seat heights of the chairs replicas are put on (unknown chairs: a dining chair's) */
const SEAT_H: Record<string, number> = { chair_wood: 0.475, chair_plastic: 0.44, chair_folding: 0.45, chair_office: 0.5, chair_stack: 0.45, zw_highchair: 0.72, stool: 0.62, none: 0.45 };
const BED_H: Record<string, number> = { bed_single: 0.6, bed_double: 0.62, bed_hospital: 0.68, bunk_bed: 0.42, crafted_bed: 0.36 };
const seatH = (k: string | undefined) => SEAT_H[k ?? 'none'] ?? objDef(k ?? '')?.surface ?? 0.47;
const mi = (s: Record<string, any>, def: number) => (typeof s.v === 'number' ? ((Math.floor(s.v) % MEMORY_COUNT) + MEMORY_COUNT) % MEMORY_COUNT : def);
const TR = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

const DESC = 'Someone, almost. The skin is wax, still faintly warm. It is wearing clothes you have seen before.';

defObj({
  key: 'replica_seated', name: 'Still Life', w: 1, d: 1, height: 1.32, block: 'solid', movable: 52, hp: 45,
  sound: 'flesh', flammable: 0.7, desc: DESC, tags: ['replica', 'still_life', 'home', 'sit'],
  variant: (s) => `${mi(s, 2)}|${s.pose ?? 'sit'}|${s.seat ?? 'chair_wood'}`,
  model: (mb, s) => {
    const seat = s.seat ?? 'chair_wood';
    seatUnder(mb, seat, 'chair_wood');
    const pose = (s.pose as ReplicaPose) ?? 'sit';
    // hips just in front of the backrest; on 'none' (sofa) a little deeper
    bakeReplica(mb, mi(s, 2), replicaPose(pose === 'sit_table' || pose === 'kneel' || pose === 'stand' ? pose : 'sit', mi(s, 2) * 7 + 1), TR(0, pose === 'stand' || pose === 'kneel' ? 0 : seatH(seat) - 0.475, seat === 'none' ? -0.12 : -0.07));
  },
});

defObj({
  key: 'replica_standing', name: 'Still Life', w: 1, d: 1, height: 1.8, block: 'solid', movable: 58, hp: 45,
  sound: 'flesh', flammable: 0.7, desc: DESC, tags: ['replica', 'still_life', 'home'],
  variant: (s) => `${mi(s, 0)}|${s.pose ?? 'stand'}`,
  model: (mb, s) => {
    const pose = (s.pose as ReplicaPose) ?? 'stand';
    bakeReplica(mb, mi(s, 0), replicaPose(pose, mi(s, 0) * 7 + 2), TR(0, 0, 0), mi(s, 0) === CHILD_MEMORY);
  },
});

defObj({
  key: 'replica_lying', name: 'Still Life', w: 1, d: 2, height: 0.9, block: 'low', movable: 70, hp: 45,
  sound: 'flesh', flammable: 0.7, desc: DESC, tags: ['replica', 'still_life', 'home', 'bed'],
  variant: (s) => `${mi(s, 3)}|${s.bed ?? 'bed_single'}`,
  model: (mb, s) => {
    const bed = s.bed ?? 'bed_single';
    seatUnder(mb, bed, 'bed_single');
    const top = bed === 'none' || !objDef(bed) ? 0 : (BED_H[bed] ?? objDef(bed)!.surface ?? 0.55);
    // feet toward the foot of the bed (+z), head on the pillow (-z)
    bakeReplica(mb, mi(s, 3), replicaPose('lie', mi(s, 3) * 7 + 3), TR(0, top - 0.02, 0.86));
  },
});

defObj({
  key: 'replica_child', name: 'Still Life', w: 1, d: 1, height: 1.15, block: 'solid', movable: 22, hp: 25,
  sound: 'flesh', flammable: 0.7, desc: 'A child, almost. It is holding its hands together as if it is carrying something. There is nothing there.', tags: ['replica', 'still_life', 'home'],
  variant: (s) => `${mi(s, CHILD_MEMORY)}|${s.pose ?? 'child'}|${s.seat ?? 'none'}`,
  model: (mb, s) => {
    const pose = (s.pose as ReplicaPose) ?? 'child';
    const seated = pose === 'sit' || pose === 'sit_table';
    if (seated) seatUnder(mb, s.seat, 'none');
    // a seated child sits up on the chair (its hips are 0.29 m up at child scale)
    bakeReplica(mb, mi(s, CHILD_MEMORY), replicaPose(pose, 31), TR(0, seated ? seatH(s.seat) - 0.47 * 0.62 : 0, seated ? -0.05 : 0), true);
  },
});

/** pick a remembered person per prop when the generator did not say (same on every peer: from the tile) */
function hashTile(zk: string, x: number, y: number) {
  let h = 2166136261;
  const s = zk + ':' + x + ':' + y;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
bus.on('zoneGenerated', (z: Zone) => {
  for (const o of z.objects.values()) {
    if (!REPLICA_KEYS.has(o.key)) continue;
    const s = (o.state = o.state || {});
    if (typeof s.v === 'number') continue;
    if (o.key === 'replica_child') { s.v = CHILD_MEMORY; continue; }
    s.v = ADULT_MEMORIES[Math.floor(hashTile(z.key, o.x, o.y) * ADULT_MEMORIES.length)];
  }
});
