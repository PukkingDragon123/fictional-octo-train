// DR. IRIS CALDER, IN THE BACKROOMS (round 19): on a first run she comes down the link in person and leads the unit
// through its first steps (src/game/tutorial/firstRun.ts). She is a creature with a human body so the creature system
// moves her (its pathing, doors, stairs), a Researcher HumanRig (src/entities/researcher.ts: the lab coat, the badge,
// the gestures and the talking face) animated by her walking speed. Her brain is the tutorial's: c.mem.goal (a point
// to walk or run to), c.mem.follow (keep near the unit), c.mem.face (a point to face), c.mem.ges (a gesture to play).
// Immortal and peaceful; inhabitants leave her be. Scanning her works (and files her in the codex).
import * as THREE from 'three';
import { G } from '../../game/G';
import { def, type Rig } from '../species';
import type { Creature } from '../creature';
import { Researcher, researcherAppearance, researcherOutfit, type ResearcherGesture } from '../../entities/researcher';

interface CalderRig extends Rig { hr: Researcher | null }
const v = new THREE.Vector3();

function build(): Rig {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const hr = new Researcher(researcherAppearance({}));
  hr.ggOverrides = {
    bust: 0.8, badge: { col: [52, 104, 150], name: 'Dr. Iris Calder' },
    makeup: { liner: 0.45, lash: 0.85, shadow: [176, 132, 136], blush: [228, 132, 136], highlight: 0.35 },
    lipstick: 0xc0586a, blush: 0.32, hairVolume: 1.12, eyeH: 1.08,
    glasses: { kind: 'rect', col: [70, 46, 40], thick: 1 },
  } as never;
  hr.setOutfit(researcherOutfit({ glasses: true }));
  hr.skin.castShadow = true;
  hr.setExpression('smile');
  body.add(hr.root);
  return { root, body, parts: { ...hr.j } as Record<string, THREE.Object3D>, headY: 1.68, hr } as CalderRig;
}

function animate(rig: Rig, c: Creature, _t: number, dt: number) {
  const R = rig as CalderRig, hr = R.hr;
  if (!hr) return;
  const g = c.mem.ges as { name: ResearcherGesture; at?: { x: number; y: number; z: number } } | undefined;
  if (g) {
    c.mem.ges = undefined;
    hr.gesture(g.name, g.at ? { at: new THREE.Vector3(g.at.x, g.at.y, g.at.z) } : {});
  }
  const talk = c.mem.talk as number | undefined;
  if (talk) { c.mem.talk = 0; hr.say(talk); }
  // she looks at the unit when it is near (and at what she points at while she points)
  const p = G.local;
  if (p && p.zoneKey === c.zoneKey && Math.hypot(p.x - c.x, p.z - c.z) < 7) hr.lookAt(v.set(p.x, p.y + 1.55, p.z));
  else hr.lookAt(null);
  hr.update(dt, { speed: c.speed, stance: 'stand', fidget: c.speed < 0.1 } as never);
}

function think(c: Creature, dt: number): boolean {
  const z = G.zones.get(c.zoneKey);
  if (!z) return true;
  const m = c.mem;
  const goal = m.goal as { x: number; z: number; run?: boolean; stop?: number } | null | undefined;
  const p = G.local;
  if (goal) {
    const arrived = G.creatures.moveTo(c, z, goal.x, goal.z, goal.run ? c.sp.run : c.sp.walk, dt, goal.stop ?? 0.5);
    if (arrived) { m.goal = null; m.arrived = (m.arrived ?? 0) + 1; c.speed = 0; }
    c.setState('travel');
    return true;
  }
  if (m.follow && p && p.zoneKey === c.zoneKey) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > 3.2) { G.creatures.moveTo(c, z, p.x, p.z, d > 7 ? c.sp.run : c.sp.walk, dt, 2.2); c.setState('travel'); return true; }
  }
  c.speed = 0;
  c.setState('idle');
  // turn to face what she should (the unit by default)
  const f = (m.face as { x: number; z: number } | null) ?? (p && p.zoneKey === c.zoneKey ? { x: p.x, z: p.z } : null);
  if (f) c.targetFacing = Math.atan2(f.z - c.z, f.x - c.x);
  return true;
}

def({
  key: 'calder_guide', name: 'Dr. Iris Calder', code: 'MIL-STAFF // RESEARCHER', temperament: 'peaceful', threat: 0,
  hp: 999, walk: 1.35, run: 3.6, turn: 8, radius: 0.26, height: 1.7, sight: 12, fov: 1.4, hearing: 1,
  zones: [], weight: 0, diet: 'none',
  flags: { immortal: true, noCorpse: true, companion: true },
  scan: { cls: 'Meridian staff · senior researcher', notes: ['Linked in person for a unit\'s first run. Against regulations, probably.', 'Heart rate elevated. Claims it is the stairs.'] },
  gore: { blood: 'red', gib: false, sever: [] },
  disposition: null,
  build,
  animate,
  think,
});
