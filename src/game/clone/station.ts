// The clone vat as a control room station (round 21, wave 4; built through the lab-from-zero
// fund / build site, src/ui/menus/lab/stations.ts key 'clone'). The vat (./vat.ts) stands against
// the right wall; with a clone banked the medium is full and the spare hangs in it (the last unit's
// own HumanRig, lit green); without one the column is nearly dry, the pilot lamps amber. Press the
// vat to grow the next spare (dollars): the medium fills, the body forms out of the glow.
import * as THREE from 'three';
import type { FMats } from '../../ui/menus/scene/pixtex';
import type { Hot } from '../../ui/menus/monitor/stage';
import { createPreviewRig, randomAppearance, type HumanRig, type Outfit } from '../../entities/humanRig';
import { sfx } from '../../ui/menus/sfx';
import { gameSound } from '../../ui/menus/monitor/props';
import { bus } from '../../core/events';
import { buildVat, type Vat } from './vat';
import { clonesBanked, canGrow, growClone, cloneLook, bankClone, CLONE_COST } from './clone';

// the first spare comes with the station
bus.on('labBuilt', (k: string) => { if (k === 'clone' && clonesBanked() === 0) bankClone(1); });

export class CloneStation {
  readonly group = new THREE.Group();
  private vat: Vat;
  private rig: HumanRig | null = null;
  private form = 0;
  private fill = -1;
  /** Dr. Calder's line (the lab guide's subtitle) */
  say?: (t: string) => void;

  constructor(mats: FMats, hots: Hot[], at: { x: number; z: number; ry?: number; ceiling?: number }) {
    this.vat = buildVat(mats, { ceiling: at.ceiling });
    this.group.add(this.vat.group);
    this.group.position.set(at.x, 0, at.z);
    this.group.rotation.y = at.ry ?? 0;
    this.form = clonesBanked() ? 1 : 0;
    const hot: Hot = {
      key: 'cv:vat', objs: [this.vat.group], label: 'Clone vat',
      press: () => this.press(),
    };
    Object.defineProperty(hot, 'sub', { get: () => (clonesBanked() ? 'a spare body on file' : canGrow() === '' ? `$${CLONE_COST} · grow a spare` : canGrow().startsWith('$') ? `${canGrow()} · not enough dollars` : canGrow()) });
    hots.push(hot);
    bus.on('cloneBank', () => { if (clonesBanked() && this.form < 1 && this.fill < 0) this.fill = 0; if (!clonesBanked()) this.form = 0; });
  }

  private press() {
    if (clonesBanked()) { sfx('tick', 0.5); gameSound('bubble_drift', 0.4); this.say?.('Your spare. It does not dream, I checked.'); return; }
    const why = canGrow();
    if (why) { sfx('error', 0.5); this.say?.(why.startsWith('$') ? 'Growing a body costs money, operator. Bring some back.' : why); return; }
    if (growClone()) { sfx('press', 0.7); gameSound('pour', 0.6, 0.8); this.fill = 0; this.say?.('Growing. It takes the medium a minute to remember a face.'); }
  }

  private body(): HumanRig {
    if (!this.rig) {
      const app = cloneLook() ?? randomAppearance(() => 0.37);
      const outfit = { torso: { tex: (app.bodyShape ?? 0.3) > 0.5 ? 'c_bandeau' : 'c_bare', color: 0xe8e4d8, sleeve: 'none' } } as Outfit;
      this.rig = createPreviewRig(app, outfit, { outline: false });
      this.vat.bay.add(this.rig.root);
    }
    return this.rig;
  }

  update(dt: number, t: number) {
    const v = this.vat;
    if (this.fill >= 0) { this.fill += dt / 2.6; this.form = Math.min(1, this.fill); if (this.fill >= 1) this.fill = -1; }
    const banked = clonesBanked() > 0 || this.fill >= 0;
    v.level = banked ? 0.25 + 0.75 * this.form : 0.08;
    v.mode = this.fill >= 0 ? 1 : banked ? 0 : 1;
    v.update(dt, t);
    const show = banked && this.form > 0.05;
    if (show || this.rig) {
      const r = this.body();
      r.root.visible = show;
      if (show) {
        // forms out of the glow: grows up from the grate, then hangs and drifts
        const k = this.form;
        r.root.scale.setScalar(0.35 + 0.65 * k);
        r.root.position.set(0, 0.06 + 0.24 * k + Math.sin(t * 1.3) * 0.02, 0);
        r.update(dt, { speed: 0, stance: 'stand', full: '', fidget: false } as never);
        const j = r.j, f = Math.sin(t * 0.9);
        j.head.rotation.x += 0.42; j.spine.rotation.x += 0.08;
        j.uarmL.rotation.z += 0.28 + f * 0.06; j.uarmR.rotation.z -= 0.28 + f * 0.06;
        j.farmL.rotation.x -= 0.2; j.farmR.rotation.x -= 0.2;
      }
    }
  }
}
