// THE WORKS CREW (round 26, part B): the Institute's maintenance crew for a room's cinematic stages (repair,
// clean): HumanRig people (src/entities/humanRig.ts, dressed by the game's own rules: scene/staff.ts outfitOf)
// who come in through the room's door, walk to their work, do it with the game's own action loops and tools in
// hand (a hammer, a welding torch, a mop, a broom), and walk out again. Room-local coordinates (the diorama's).
//   const crew = new Crew(parent)        crew.hire(items, tool, at, seed) -> Hand
//   await crew.walk(h, to)  crew.work(h, action, dur, face)  crew.update(dt)  crew.dispose()
import * as THREE from 'three';
import { createPreviewRig, randomAppearance, type HumanRig } from '../../../../entities/humanRig';
import { randomLooks } from '../../../../entities/humanLooks';
import type { ActionAnim } from '../../../../entities/humanAnim';
import { makeHeldMesh } from '../../../../items/itemMeshes';
import { outfitOf } from '../../scene/staff';

export interface Hand {
  rig: HumanRig; pos: THREE.Vector3; yaw: number; goal: THREE.Vector3 | null; speed: number;
  action: ActionAnim; dur: number; done: (() => void) | null; face: number | null;
}

export class Crew {
  readonly group = new THREE.Group();
  private hands: Hand[] = [];
  constructor(parent: THREE.Object3D) { parent.add(this.group); this.group.name = 'crew'; }

  /** a worker in these clothes with this tool in the right hand, standing at `at` */
  hire(items: string[], tool: string | null, at: THREE.Vector3, seed: number): Hand {
    let s = seed;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const app = { ...randomAppearance(rnd), ...randomLooks(rnd, rnd() < 0.4) };
    const rig = createPreviewRig(app, outfitOf(items), { outline: false });
    (rig as unknown as { setLod?: (n: number) => void }).setLod?.(1);
    rig.skin.castShadow = true;
    if (tool) { const m = makeHeldMesh(tool); if (m) rig.hold('R', m); }
    rig.root.position.copy(at);
    this.group.add(rig.root);
    const h: Hand = { rig, pos: at.clone(), yaw: 0, goal: null, speed: 1.3, action: '', dur: 1, done: null, face: null };
    this.hands.push(h);
    return h;
  }
  /** walk to a point (resolves on arrival) */
  walk(h: Hand, to: THREE.Vector3, speed = 1.3): Promise<void> {
    h.done?.();
    h.goal = to.clone(); h.speed = speed; h.action = ''; h.face = null;
    return new Promise((res) => { h.done = res; });
  }
  /** stand and work (an action loop), facing a point */
  work(h: Hand, action: ActionAnim, dur: number, face?: THREE.Vector3) {
    h.goal = null; h.action = action; h.dur = dur;
    h.face = face ? Math.atan2(face.x - h.pos.x, face.z - h.pos.z) : null;
  }
  /** jump everyone to where they were going (a skipped cinematic) */
  arrive() { for (const h of this.hands) if (h.goal) { h.pos.copy(h.goal); h.goal = null; const d = h.done; h.done = null; d?.(); } }
  update(dt: number) {
    for (const h of this.hands) {
      let speed = 0;
      if (h.goal) {
        const d = new THREE.Vector3().subVectors(h.goal, h.pos); d.y = 0;
        const L = d.length();
        if (L < 0.04) { h.pos.copy(h.goal); h.goal = null; const r = h.done; h.done = null; r?.(); }
        else { const step = Math.min(L, h.speed * dt); h.pos.addScaledVector(d.normalize(), step); speed = h.speed; turn(h, Math.atan2(d.x, d.z), dt); }
      } else if (h.face !== null) turn(h, h.face, dt);
      h.rig.root.position.copy(h.pos);
      h.rig.root.rotation.y = h.yaw;
      h.rig.update(dt, { speed, stance: 'stand', action: speed ? '' : h.action, actionDur: h.dur, fidget: !h.action } as never);
    }
  }
  dispose() { for (const h of this.hands) { h.done?.(); h.rig.dispose(); } this.hands = []; this.group.removeFromParent(); this.group.clear(); }
}
function turn(h: Hand, want: number, dt: number) {
  const d = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw));
  h.yaw += d * Math.min(1, dt * 8);
}
