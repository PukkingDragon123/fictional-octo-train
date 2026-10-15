// Animation lab: survivors driven with a fixed time step in an empty gallery
// room, for frame strips of locomotion, turns, hit reactions, ragdolls and
// actions. Load it on top of a gallery:
//   open ?gallery=humans&zoom=64, then in the page:
//   const lab = await (await import('/src/dev/animLab.ts')).init(window.__gallery)
//   const p = lab.spawn('a', { x: 8, z: 8, facing: 0, wear: ['tshirt', 'jeans', 'sneakers'] })
//   p.ctl = (t, dt, p) => { p.vx = 2; p.vz = 0; }   // per-step controller (optional)
//   lab.step(60, 1 / 60)                             // advance one second
// A minimal stand-in for the game global (zones, players, creatures, time)
// lets floors, walls and look-at targets work the way they do in a run.
import * as THREE from 'three';
import { Player } from '../entities/player';
import { randomAppearance, Appearance } from '../entities/humanRig';
import { createItem } from '../items/factory';
import { hasItemDef } from '../items/item';
import { setGame } from '../game/G';
import { Rng } from '../core/rng';
import { worldMaterial } from '../gfx/materials';

type Ctl = (t: number, dt: number, p: Player) => void;
export interface LabPlayer extends Player { ctl?: Ctl }

export async function init(g: { pr: any; z: any; tgt: THREE.Vector3 }) {
  const fake: any = {
    zones: new Map([[g.z.key, g.z]]), players: new Map<string, Player>(), creatures: { creatures: new Map() },
    time: 0, local: null, handler: null, pr: g.pr, getZone: (k: string) => fake.zones.get(k),
  };
  setGame(fake);
  (window as any).__game = fake;
  const lab = {
    g, fake, t: 0,
    spawn(id: string, o: { x: number; z: number; facing?: number; wear?: string[]; hold?: string; seed?: number; app?: Partial<Appearance>; local?: boolean }): LabPlayer {
      const rng = new Rng(o.seed ?? 7);
      const app = { ...randomAppearance(() => rng.next()), ...(o.app || {}) } as Appearance;
      const p = new Player(id, id, app, o.local ?? true) as LabPlayer;
      for (const k of o.wear ?? ['tshirt', 'jeans', 'sneakers']) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
      if (o.hold && hasItemDef(o.hold)) { const it = createItem(o.hold); p.inv.add(it); p.equip(it, 'R'); }
      p.zoneKey = g.z.key; p.x = o.x; p.z = o.z; p.facing = o.facing ?? 0; p.targetFacing = p.facing;
      p.y = g.z.heightAt(Math.floor(p.x), Math.floor(p.z));
      g.pr.scene.add(p.rig.root);
      fake.players.set(id, p);
      if (!fake.local) fake.local = p;
      p.updateVisual(1 / 60);
      return p;
    },
    /** advance every survivor n fixed steps (controllers move them; the facing follows velocity unless a controller sets it) */
    step(n: number, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        lab.t += dt; fake.time = lab.t;
        for (const p of fake.players.values() as Iterable<LabPlayer>) {
          // controllers set a wanted velocity (tvx, tvz); like the game it is reached with damping
          if (p.ctl) { p.ctl(lab.t, dt, p); }
          const k = 1 - Math.exp(-14 * dt);
          if ((p as any).tvx !== undefined) { p.vx += ((p as any).tvx - p.vx) * k; p.vz += ((p as any).tvz - p.vz) * k; }
          if (!p.body.dead) { p.x += p.vx * dt; p.z += p.vz * dt; }
          p.speed = Math.hypot(p.vx, p.vz);
          const zy = g.z.heightAt(Math.floor(p.x), Math.floor(p.z));
          p.y += (zy - p.y) * (1 - Math.exp(-12 * dt));
          if (p.targetFacing !== undefined) p.turn(dt, p.aiming ? 22 : 12);
          p.updateVisual(dt);
        }
      }
    },
    /** point the camera at a world point */
    look(x: number, z: number, y = 0.9) { g.tgt.set(x, y, z); },
    /** raise a block of floor tiles (steps, ledges) */
    raise(x0: number, y0: number, x1: number, y1: number, h: number) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = g.z.idx(x, y); g.z.setFloor(x, y, g.z.floor[i], h); }
    },
    /** a stand-in creature (look-at target) */
    creature(id: string, x: number, z: number, state = 'chase') {
      const c = { id, x, z, y: 0, zoneKey: g.z.key, dead: false, state, sp: { threat: 4, height: 1.9 }, radius: 0.4 };
      fake.creatures.creatures.set(id, c);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.9, 8), worldMaterial({}));
      m.position.set(x, 0.95, z); g.pr.scene.add(m);
      return { c, m };
    },
    remove(id: string) { const p = fake.players.get(id); if (p) { p.rig.root.removeFromParent(); fake.players.delete(id); } },
  };
  (window as any).__lab = lab;
  return lab;
}
