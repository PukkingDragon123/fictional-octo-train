// Meridian staff at work in the subject room: a technician typing at the console, an orderly
// writing on a clipboard by the chair, a janitor mopping, a guard by the door. Cheap preview
// rigs (coarse LOD, no hull outline: the room draws its own edges) running the game's own
// action loops, each with a little drift and a glance at the subject now and then.
import * as THREE from 'three';
import { createPreviewRig, randomAppearance, type HumanRig, type Outfit } from '../../../entities/humanRig';
import { randomLooks } from '../../../entities/humanLooks';
import { Player } from '../../../entities/player';
import { hasItemDef } from '../../../items/item';
import type { ActionAnim } from '../../../entities/humanAnim';

interface Worker { rig: HumanRig; action: ActionAnim; dur: number; base: THREE.Vector3; yaw: number; look: number; t: number; sway: number }

/** what a set of worn items looks like, by the game's own dressing rules */
function outfitOf(keys: string[]): Outfit {
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false };
  for (const k of keys) { if (!hasItemDef(k)) continue; try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ } }
  try { return Player.prototype.computeOutfit.call(fake); } catch { return {}; }
}

const CREW: { items: string[]; action: ActionAnim; dur: number; at: [number, number]; face: [number, number]; seed: number }[] = [
  // technician at the tele-diagnostic set, right of the chair
  { items: ['lab_coat', 'slacks', 'dress_shoes'], action: 'type', dur: 1.6, at: [1.42, 0.82], face: [2.1, 0.7], seed: 11 },
  // orderly with the subject's clipboard, left of the chair
  { items: ['scrubs_top', 'scrubs_pants', 'sneakers', 'gloves_rubber'], action: 'read', dur: 4, at: [-0.98, 0.42], face: [0, -0.45], seed: 23 },
  // janitor working the drain in the floor
  { items: ['janitor_uniform', 'boots_work', 'gloves_work'], action: 'dig', dur: 1.8, at: [2.35, 2.2], face: [1.7, 1.5], seed: 37 },
  // guard by the hatch, watching
  { items: ['guard_uniform', 'boots_work'], action: '', dur: 1, at: [-1.55, -1.55], face: [0, 0.6], seed: 53 },
];

export class Staff {
  readonly group = new THREE.Group();
  private crew: Worker[] = [];
  private built = false;

  /** build the crew (once); safe to call before the item catalogue is ready (they are dressed when it is) */
  build() {
    if (this.built) return;
    this.built = true;
    for (const c of CREW) {
      let s = c.seed;
      const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
      const app = { ...randomAppearance(rnd), ...randomLooks(rnd, rnd() < 0.4) };
      const rig = createPreviewRig(app, outfitOf(c.items), { outline: false });
      (rig as unknown as { setLod?: (n: number) => void }).setLod?.(1);
      rig.skin.castShadow = true;
      const base = new THREE.Vector3(c.at[0], 0, c.at[1]);
      const yaw = Math.atan2(c.face[0] - c.at[0], c.face[1] - c.at[1]);
      rig.root.position.copy(base);
      rig.root.rotation.y = yaw;
      this.group.add(rig.root);
      this.crew.push({ rig, action: c.action, dur: c.dur, base, yaw, look: 0, t: rnd() * 10, sway: rnd() * 6 });
    }
  }

  /** run the work loops; `glanceAt` is where the subject is (they look over now and then) */
  update(dt: number, glanceAt?: THREE.Vector3) {
    if (!this.group.visible) return;
    for (const w of this.crew) {
      w.t += dt;
      // every so often a glance at the subject
      let look = 0;
      if (glanceAt) {
        const phase = (w.t + w.sway * 3) % 11;
        if (phase < 1.6) {
          const want = Math.atan2(glanceAt.x - w.base.x, glanceAt.z - w.base.z) - w.yaw;
          look = Math.atan2(Math.sin(want), Math.cos(want)) * Math.sin((phase / 1.6) * Math.PI) * 0.8;
        }
      }
      w.look += (look - w.look) * Math.min(1, dt * 4);
      w.rig.root.position.x = w.base.x + Math.sin(w.t * 0.37 + w.sway) * 0.03;
      w.rig.update(dt, { speed: 0, stance: 'stand', action: w.action, actionDur: w.dur, lookYaw: w.look, fidget: true } as any);
    }
  }

  dispose() { for (const w of this.crew) w.rig.dispose(); this.crew = []; this.group.clear(); }
}
