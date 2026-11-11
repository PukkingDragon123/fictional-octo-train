// THE SUIT LAMP (round 14: the wrist light went with the watch). Every unit's
// helmet carries a small Meridian work lamp on the right temple: a knurled
// gunmetal barrel on a hinged bracket, a faceted reflector, a frosted lens
// and a pilot LED. F (the touch LIGHT button presses the same action) switches
// it; a torch, lantern or glowstick held in a hand wins, and F switches that
// instead. It runs off the suit and never goes flat. The spot light itself is
// the renderer's first flashlight (src/game/game.ts updateLights), moved here
// to leave from the lamp's lens. Keybind only: no HUD, no wrist.
//
//   installSuitLamp()   once per session (src/game/session.ts)
//   G.suitLamp.toggle() the same as pressing F
import * as THREE from 'three';
import { G } from './G';
import { bus } from '../core/events';
import { defItem, itemDef, type Item } from '../items/item';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Player } from '../entities/player';
import { mrtSafe } from '../scan/sweep';

/** the lamp as an item the light code understands (never in an inventory) */
defItem({
  key: 'suit_lamp', name: 'Suit Lamp', cat: 'electronics', weight: 0, value: 0, noStack: true, tags: ['no_deposit', 'builtin'],
  desc: 'The cold LED work lamp on the unit\'s helmet. It runs off the suit and never goes flat.',
  light: { range: 15, intensity: 1.05, color: 0xe6f2ff, drainPerHour: 0, cone: 0.5 },
});

const LAMP: Item = { uid: -77, key: 'suit_lamp', cond: 1, age: 0, uses: 1 } as Item;

let GEO: { body: THREE.BufferGeometry; lens: THREE.BufferGeometry } | null = null;
/** the lamp, in head space (+z forward, +y up; the head is ~0.1 across), facing forward */
function lampGeo() {
  if (GEO) return GEO;
  const mb = new ModelBuilder();
  // the hinged bracket clamped to the helmet shell: a bent strap and two rivets
  mb.box(0, 0, -0.012, 0.006, 0.026, 0.028, 'metal_dark', { color: 0x3a3f44 });
  mb.box(0.004, 0.0, 0.004, 0.012, 0.006, 0.01, 'metal_dark', { color: 0x4a5056 });
  for (const y of [-0.008, 0.008]) mb.box(-0.0035, y, -0.014, 0.002, 0.004, 0.004, 'chrome', { color: 0xc8ccd0 });
  // the barrel: a faceted gunmetal can, knurled rings at both ends, heat fins on the back
  mb.push().translate(0.012, 0.0, 0.006).rotateX(Math.PI / 2);
  mb.cylinder(0, -0.016, 0, 0.0105, 0.03, 10, 'metal_dark', { color: 0x30353a, caps: true } as never);
  for (const y of [-0.016, 0.009]) mb.cylinder(0, y, 0, 0.0118, 0.004, 10, 'metal', { color: 0x6a7076, caps: true } as never);
  for (let i = 0; i < 3; i++) mb.cylinder(0, -0.014 + i * 0.004, 0, 0.0125, 0.0012, 10, 'metal_dark', { color: 0x24282c, caps: true } as never);
  // the bezel: a chrome ring standing proud of the lens
  mb.cylinder(0, 0.013, 0, 0.0122, 0.003, 12, 'chrome', { color: 0xd8dce0, caps: true } as never);
  mb.pop();
  // the pilot LED and the switch on top of the barrel
  mb.box(0.012, 0.0115, -0.004, 0.003, 0.0025, 0.003, 'plastic_black', { color: 0x1a1a1a });
  mb.box(0.012, 0.0108, 0.006, 0.0026, 0.002, 0.0026, 'white', { color: 0x7affa0, emissive: 1 } as never);
  const body = mb.build();
  const lb = new ModelBuilder();
  // the frosted lens (lit when the lamp is on)
  lb.push().translate(0.012, 0.0, 0.0215).rotateX(Math.PI / 2);
  lb.cylinder(0, 0, 0, 0.0095, 0.0015, 12, 'white', { color: 0xeaf6ff, emissive: 1.4, caps: true } as never);
  lb.pop();
  GEO = { body, lens: lb.build() };
  return GEO;
}

interface View { group: THREE.Group; lens: THREE.Mesh; bone: THREE.Object3D; s: number }

export class SuitLamp {
  /** the lamp is switched on (whether it is the light in use depends on what is held) */
  on = false;
  private views = new Map<string, View>();
  private mat: THREE.Material | null = null;
  private lensMat = mrtSafe(new THREE.MeshBasicMaterial({ color: 0x6a7480 }));
  private v = new THREE.Vector3();
  private t = 0;

  constructor() {
    (G as any).suitLamp = this;
    G.addSystem({ name: 'suitLamp', update: (dt: number) => this.frame(dt) });
    // after the game has placed its spot lights: the local unit's leaves from the lamp
    G.pr.beforeRender.push(() => { try { this.aim(); } catch { /* no rig yet */ } });
    bus.on('death', (p: Player) => { if (p === G.local) this.on = false; });
  }

  /** a light source held in a hand (it wins over the suit lamp) */
  private held(p: Player): Item | null {
    return [p.handR, p.handL].find((it) => it && it.key !== 'suit_lamp' && itemDef(it.key).light && (it.uses ?? 1) > 0) ?? null;
  }

  /** F: the held light if there is one, else the suit lamp */
  toggle() {
    const p = G.local; if (!p || p.body.dead) return;
    const h = this.held(p);
    if (h) {
      this.on = false;
      if (p.lightItem !== h) { p.lightItem = h; p.flashlightOn = true; }
      else p.flashlightOn = !p.flashlightOn;
      bus.emit('sound', 'click', p.x, p.z, 0.4);
      return;
    }
    this.on = !this.on;
    p.lightItem = this.on ? LAMP : null;
    p.flashlightOn = this.on;
    G.audio?.at?.('switch', p.x, p.z, 0.45);
    if (this.on) G.missions?.set?.('tut:light');
  }

  private frame(dt: number) {
    this.t += dt;
    const p = G.local;
    if (p) {
      // an old save whose light was the watch's band (worn, not a lamp): that light is the suit lamp now
      if (p.lightItem && p.lightItem !== LAMP && !itemDef(p.lightItem.key).light && p.isWorn(p.lightItem)) {
        this.on = p.flashlightOn;
        p.lightItem = this.on ? LAMP : null;
        if (!this.on) p.flashlightOn = false;
      }
      // the suit lamp stays the light while it is on, unless a light held in hand is lit (equipping clears lightItem: put it back)
      if (this.on && !p.body.dead) {
        const h = this.held(p);
        if (!(h && p.lightItem === h && p.flashlightOn)) { p.lightItem = LAMP; p.flashlightOn = true; }
      } else if (p.lightItem === LAMP) { p.lightItem = null; p.flashlightOn = false; }
    }
    LAMP.uses = 1;
    // the lamp on every unit's helmet
    const seen = new Set<string>();
    for (const q of G.players.values()) {
      const v = this.view(q);
      if (!v) continue;
      seen.add(q.id);
      const lit = q.flashlightOn && q.lightItem?.key === 'suit_lamp';
      v.lens.material = lit ? this.litMat() : this.lensMat;
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.group.parent?.remove(v.group); this.views.delete(id); }
  }

  private lit: THREE.MeshBasicMaterial | null = null;
  private litMat() { return (this.lit ??= mrtSafe(new THREE.MeshBasicMaterial({ color: 0xeaf6ff }))); }

  private view(q: Player): View | null {
    const rig: any = q.rig;
    const bone: THREE.Object3D | undefined = rig?.bones?.head;
    if (!bone) return null;
    const s = rig.s || 1;
    let v = this.views.get(q.id);
    if (v && (v.bone !== bone || Math.abs(v.s - s) > 0.01 || v.group.parent !== bone)) { v.group.parent?.remove(v.group); this.views.delete(q.id); v = undefined; }
    if (!v) {
      const g = lampGeo();
      this.mat ??= worldMaterial({});
      const group = new THREE.Group(); group.name = 'suit_lamp';
      const body = new THREE.Mesh(g.body, this.mat);
      const lens = new THREE.Mesh(g.lens, this.lensMat);
      for (const m of [body, lens]) { m.castShadow = false; m.frustumCulled = false; group.add(m); }
      // on the right temple of the helmet, tipped a little down
      group.position.set(-0.098 * s, 0.135 * s, 0.035 * s);
      group.rotation.set(0.12, -0.08, 0);
      group.scale.setScalar(s * 1.15);
      bone.add(group);
      v = { group, lens, bone, s };
      this.views.set(q.id, v);
    }
    return v;
  }

  /** the local unit's spot leaves from the lens, a cool narrow LED aimed where the unit faces */
  private aim() {
    const p = G.local; if (!p || !p.flashlightOn || p.lightItem !== LAMP || p.body.dead) return;
    const f = (G as any).flashlights?.[0] as THREE.SpotLight | undefined;
    const v = this.views.get(p.id);
    if (!f || !f.visible || !v) return;
    v.lens.getWorldPosition(this.v);
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    f.position.set(this.v.x + fx * 0.04, this.v.y, this.v.z + fz * 0.04);
    f.target.position.set(p.x + fx * 7.5, p.y + 0.1, p.z + fz * 7.5);
    f.target.updateMatrixWorld();
  }
}

/** the lamp as the light item (net mirrors a remote unit's lamp with it) */
export const suitLampItem = () => LAMP;

let installed: SuitLamp | null = null;
export function installSuitLamp(): SuitLamp {
  if (!installed || (G as any).suitLamp !== installed) installed = new SuitLamp();
  return installed;
}
