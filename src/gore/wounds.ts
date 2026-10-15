// Wounds that stay on a body: gashes, cleaves, bullet holes, bite marks,
// crush bruises, and on a bad enough death a torso opened to the ribs with
// loops of gut hanging out. Each wound is a small cut-out card glued to the
// nearest bone of the creature's rig where the blow landed, facing the way
// it came from, so it moves with the body, stays on the corpse, and goes
// flying with a limb that is cut off. Applied on every peer from the same
// gore events (the cards are cosmetic; no extra state is replicated).
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Creature } from '../creatures/creature';
import type { BloodKind } from './kinds';

const MAX_WOUNDS = 9;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();
const geoCache = new Map<string, THREE.BufferGeometry>();
let mat: THREE.Material | null = null;

/** wound texture for a blow of kind hk on a body of blood kind K */
export function woundTex(K: BloodKind, hk: string, big: boolean): string {
  switch (K.key) {
    case 'stuffing': return big ? 'dmg_tear_fabric_b' : 'dmg_tear_fabric';
    case 'plaster': case 'shell': return big ? 'dmg_crack_hard_b' : 'dmg_crack_hard';
    case 'glass': return 'dmg_crack_glass';
    case 'oil': return big ? 'dmg_dent_metal_b' : 'dmg_dent_metal';
    case 'static': return 'gore_static_bits';
    case 'none': return '';
  }
  if (hk === 'firearm' || hk === 'spear') return 'gore_wound_hole';
  if (hk === 'bite' || hk === 'claw') return hk === 'bite' ? 'gore_wound_bite' : 'gore_wound_gash';
  if (hk === 'axe') return 'gore_wound_cleave';
  if (hk === 'blade') return big ? 'gore_wound_cleave' : 'gore_wound_gash';
  if (hk === 'blunt' || hk === 'unarmed' || hk === 'vehicle' || hk === 'thrown') return 'gore_wound_crush';
  return 'gore_wound_gash';
}

function cardGeo(tex: string, w: number, h: number, tint: number): THREE.BufferGeometry {
  const key = tex + '|' + w.toFixed(2) + '|' + h.toFixed(2) + '|' + tint;
  let g = geoCache.get(key);
  if (g) return g;
  const mb = new ModelBuilder();
  // a slightly bent card so it hugs a rounded limb a little better
  const hw = w / 2, hh = h / 2, b = Math.min(w, h) * 0.12;
  mb.quadRaw([[-hw, -hh, -b], [0, -hh, 0], [0, hh, 0], [-hw, hh, -b]], [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], tex, tint, 1, 0, 0, [0, 0, 1]);
  mb.quadRaw([[0, -hh, 0], [hw, -hh, -b], [hw, hh, -b], [0, hh, 0]], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]], tex, tint, 1, 0, 0, [0, 0, 1]);
  g = mb.build();
  geoCache.set(key, g);
  return g;
}

/** guts: a few fat loops hanging from a wound (gravity is the bone's down: good enough while it lies there) */
function gutsGeo(): THREE.BufferGeometry {
  let g = geoCache.get('guts');
  if (g) return g;
  const mb = new ModelBuilder();
  const segs = 7;
  let x = 0, y = 0, z = 0.02;
  for (let i = 0; i < segs; i++) {
    const nx = x + Math.sin(i * 1.7) * 0.05, ny = y - 0.035 - (i % 3) * 0.01, nz = z + 0.025;
    mb.push().translate((x + nx) / 2, (y + ny) / 2, (z + nz) / 2).rotateZ(Math.atan2(nx - x, ny - y)).rotateX(0.4);
    mb.cylinder(0, -0.03, 0, 0.022 - i * 0.0012, 0.06, 6, 'gore_guts', { caps: true });
    mb.pop();
    x = nx; y = ny; z = nz;
  }
  g = mb.build();
  geoCache.set('guts', g);
  return g;
}

/**
 * Glue a wound onto a creature where a blow from (fx, fz) landed at height hy.
 * `big` = a killing or crushing blow; `open` = the torso is opened (ribs, guts).
 */
export function addWound(c: Creature, K: BloodKind, hk: string, dx: number, dz: number, hy: number, big: boolean, open = false, tint = 0xffffff): void {
  const rig = c.rig; if (!rig) return;
  const tex = open ? 'gore_wound_open' : woundTex(K, hk, big);
  if (!tex) return;
  // the hit point: on the body's surface toward the attacker
  const r = Math.max(0.12, c.radius * 0.85);
  const hp = v1.set(c.x - dx * r, hy, c.z - dz * r);
  rig.root.updateWorldMatrix(true, true);
  // nearest bone
  let best: THREE.Object3D | null = null, bestKey = '', bd = Infinity;
  for (const name in rig.parts) {
    const p = rig.parts[name];
    if (!p || !p.parent || !p.visible) continue;
    p.getWorldPosition(v2);
    const d = v2.distanceToSquared(hp);
    if (d < bd) { bd = d; best = p; bestKey = name; }
  }
  const bone = best ?? rig.body;
  const s = open ? 0.34 : big ? 0.19 : hk === 'firearm' ? 0.09 : 0.13;
  // place in bone space, facing out along the blow (toward the attacker)
  const pos = bone.worldToLocal(hp.clone());
  const out = v2.set(-dx, 0.15, -dz).normalize();
  bone.getWorldQuaternion(q1).invert();
  out.applyQuaternion(q1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (Math.random() - 0.5) * 1.6));
  pos.addScaledVector(out, 0.012);
  const rec: WoundRec = { bone: best ? bestKey : '', p: [pos.x, pos.y, pos.z], q: [q.x, q.y, q.z, q.w], tex, w: s, h: open ? s * 0.9 : s * (tex.includes('gash') || tex.includes('cleave') ? 0.8 : 1), tint, guts: open && K.liquid };
  const recs: WoundRec[] = c.mem.woundRecs ?? (c.mem.woundRecs = []);
  recs.push(rec);
  // keep a body's wound count sane: the oldest goes
  const list: THREE.Object3D[] = c.mem.wounds ?? (c.mem.wounds = []);
  while (recs.length > MAX_WOUNDS) { recs.shift(); list.shift()?.removeFromParent(); }
  list.push(place(bone, rec));
}

interface WoundRec { bone: string; p: number[]; q: number[]; tex: string; w: number; h: number; tint: number; guts: boolean }

function place(bone: THREE.Object3D, r: WoundRec): THREE.Object3D {
  mat ??= worldMaterial({ alphaTest: 0.5 });
  const card = new THREE.Mesh(cardGeo(r.tex, r.w, r.h, r.tint), mat);
  card.name = 'gore_wound';
  card.castShadow = false;
  card.position.set(r.p[0], r.p[1], r.p[2]);
  card.quaternion.set(r.q[0], r.q[1], r.q[2], r.q[3]);
  if (r.guts) {
    const g = new THREE.Mesh(gutsGeo(), worldMaterial({}));
    g.name = 'gore_wound';
    g.position.set(0, -r.w * 0.15, 0.02);
    card.add(g);
  }
  bone.add(card);
  return card;
}

/** a rig was (re)built for this creature: scrub cards a pooled rig still carries, then put this body's wounds back */
export function restoreWounds(c: Creature) {
  const rig = c.rig; if (!rig) return;
  const stale: THREE.Object3D[] = [];
  rig.root.traverse((o) => { if (o.name === 'gore_wound' && o.parent?.name !== 'gore_wound') stale.push(o); });
  for (const o of stale) o.removeFromParent();
  const list: THREE.Object3D[] = c.mem.wounds = [];
  for (const r of (c.mem.woundRecs ?? []) as WoundRec[]) {
    const bone = r.bone ? rig.parts[r.bone] : rig.body;
    if (bone) list.push(place(bone, r));
  }
}
