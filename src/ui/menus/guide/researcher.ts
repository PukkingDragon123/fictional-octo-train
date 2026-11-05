// The guide's body: Dr. Iris Calder, Meridian research. Uses the humans
// worker's createResearcher() (src/entities/researcher.ts) when it exists;
// until then a preview HumanRig dressed for the lab (teal blouse, long lab
// coat, slacks, dress shoes, glasses) with her own secondary motion on top:
// the ponytail swings on a spring driven by the head's acceleration, the ID
// badge swings on its lanyard, a clipboard rides in her left hand.
// Either way the guide drives her through one small interface (GuideRig).
import * as THREE from 'three';
import { createPreviewRig, type HumanRig, type Outfit, type Appearance } from '../../../entities/humanRig';
import { Player } from '../../../entities/player';
import { hasItemDef } from '../../../items/item';
import { DecoBuilder, decoMats, at, cbox, extrude, prism, ngon, printMat, tube } from '../deco/kit';
import { labelCanvas, Spring, type V3 } from '../deco/parts';

export interface GuideInput {
  /** walking speed (m/s) */
  speed: number;
  /** world point to look at (her head turns) */
  look: THREE.Vector3 | null;
  /** world point to point at with the right arm (null = no pointing) */
  point: THREE.Vector3 | null;
  talking: boolean;
}
export interface GuideRig {
  root: THREE.Object3D;
  update(dt: number, inp: GuideInput): void;
  emote(name: string): void;
  /** where her speech cloud hangs (world) */
  head(out: THREE.Vector3): THREE.Vector3;
  /** an invisible body-sized proxy for clicks */
  hitProxy: THREE.Object3D;
  /** a startled hop (clicked) */
  flinch(): void;
  dispose(): void;
}

// the researcher module may not exist yet: a glob import is empty instead of an error
const EXT = import.meta.glob('../../../entities/researcher.ts');

export async function createGuideRig(): Promise<GuideRig> {
  const load = Object.values(EXT)[0];
  if (load) {
    try {
      const m = (await load()) as { createResearcher?: (...a: unknown[]) => unknown };
      if (typeof m.createResearcher === 'function') {
        const r = await Promise.resolve(m.createResearcher());
        const w = wrapExternal(r);
        if (w) return w;
      }
    } catch (e) { console.warn('guide: researcher model failed, using the preview rig', e); }
  }
  return fallbackRig();
}

// ------------------------------------------------------------------ shared helpers
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
function proxy(h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.y = h / 2;
  m.userData.ghost = true;
  m.name = 'guide-hit';
  return m;
}
/** turn a HumanRig's right arm toward a world point (weight w), after its own animation */
function aimArm(rig: { j: Record<string, THREE.Object3D> }, target: THREE.Vector3, w: number) {
  const ua = rig.j.uarmR, fa = rig.j.farmR, hd = rig.j.handR;
  if (!ua || !ua.parent) return;
  ua.updateWorldMatrix(true, false);
  ua.getWorldPosition(_a);
  _b.copy(target).sub(_a).normalize();
  ua.parent.getWorldQuaternion(_q).invert();
  _b.applyQuaternion(_q);
  _q2.setFromUnitVectors(DOWN, _b);
  ua.quaternion.slerp(_q2, w);
  if (fa) fa.quaternion.slerp(_q.identity(), w * 0.85);
  if (hd) hd.quaternion.slerp(_q.identity(), w * 0.6);
}

// ------------------------------------------------------------------ the humans worker's model
function wrapExternal(r: unknown): GuideRig | null {
  if (!r) return null;
  const o = r as Record<string, any>;
  const root: THREE.Object3D | undefined = (r as THREE.Object3D).isObject3D ? (r as THREE.Object3D) : o.root ?? o.group ?? o.object ?? o.rig?.root;
  if (!root || !root.isObject3D) return null;
  const rig = o.rig ?? (o.j ? o : null);
  const hit = proxy(1.75);
  root.add(hit);
  const bump = new Spring(120, 9);
  let prevPoint = 0;
  return {
    root, hitProxy: hit,
    update(dt, inp) {
      try { o.update?.(dt, { speed: inp.speed, stance: 'stand', lookYaw: 0, fidget: true, talking: inp.talking, look: inp.look }); } catch (e) { console.warn('researcher update', e); o.update = undefined; }
      if (typeof o.lookAt === 'function' && inp.look) { try { o.lookAt(inp.look); } catch { /* optional */ } }
      prevPoint += ((inp.point ? 1 : 0) - prevPoint) * Math.min(1, dt * 6);
      if (rig?.j && inp.point && prevPoint > 0.01) aimArm(rig, inp.point, prevPoint);
      root.position.y = Math.max(0, bump.step(dt)) * 0.06;
    },
    emote(n) { try { (o.playEmote ?? rig?.playEmote)?.call(o.playEmote ? o : rig, n); } catch { /* optional */ } },
    head(out) {
      const hb: THREE.Object3D | undefined = rig?.bones?.head ?? rig?.j?.head;
      if (hb) { hb.getWorldPosition(out); out.y += 0.32; return out; }
      return root.getWorldPosition(out).add(_a.set(0, 2.0, 0));
    },
    flinch() { bump.kick(6); try { o.react?.('poke'); } catch { /* optional */ } },
    dispose() { try { o.dispose?.(); } catch { /* ignore */ } root.removeFromParent(); },
  };
}

// ------------------------------------------------------------------ the preview-rig fallback
function outfitOf(keys: string[]): Outfit {
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false };
  for (const k of keys) { if (!hasItemDef(k)) continue; try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ } }
  try { return Player.prototype.computeOutfit.call(fake); } catch { return {}; }
}
export const CALDER: Appearance = {
  skin: 0xf0c8a8, hair: 0x7a2e14, hairStyle: 'ponytail', face: 4, build: 'slim', height: 1.0, beard: false,
  bodyShape: 0.9, eyeColor: 0x3a8a5a, facialHair: 'none', freckles: 0.3, scars: 0, age: 0.12,
  ...({ jaw: 4, eyeShape: 2, brows: 2, nose: 1, mouth: 0 } as Partial<Appearance>),
};

function fallbackRig(): GuideRig {
  let outfit = outfitOf(['shirt_office', 'lab_coat', 'slacks', 'dress_shoes']);
  if (outfit.torso) outfit.torso = { ...outfit.torso, color: 0x2a7a7a };
  if (!outfit.torsoOuter) outfit = { ...outfit, torsoOuter: { tex: 'c_labcoat', color: 0xeceae2, sleeve: 'long' } };
  const rig: HumanRig = createPreviewRig(CALDER, outfit, { outline: false });
  rig.skin.castShadow = true;
  const root = new THREE.Group();
  root.name = 'guide';
  root.add(rig.root);
  const mats = decoMats();
  // ---- glasses (thin faceted frames on the head bone)
  const gb = new DecoBuilder();
  for (const s of [-1, 1]) {
    gb.add('rubber', extrude(ngon(0.026, 6, 0.5, 1.25, 0.85), 0.006, 0, [ngon(0.02, 6, 0.5, 1.25, 0.85).reverse()]), 0x2a1a14, at(s * 0.034, 0, 0));
    gb.add('rubber', cbox(0.006, 0.006, 0.09, 0.002), 0x2a1a14, at(s * 0.068, 0.004, -0.045));
  }
  gb.add('rubber', cbox(0.018, 0.005, 0.005, 0.001), 0x2a1a14, at(0, 0.006, 0));
  gb.add('glass', extrude(ngon(0.021, 6, 0.5, 1.25, 0.85), 0.002, 0), 0xc8e0f0, at(-0.034, 0, 0));
  gb.add('glass', extrude(ngon(0.021, 6, 0.5, 1.25, 0.85), 0.002, 0), 0xc8e0f0, at(0.034, 0, 0));
  const glasses = gb.build(mats, false);
  glasses.position.set(0, 0.095, 0.098);
  rig.bones.head.add(glasses);
  // ---- the lanyard and the ID badge (a pendulum on the chest)
  const lb = new DecoBuilder();
  const strap: V3[] = [[-0.06, 0.2, -0.02], [-0.05, 0.12, 0.07], [0, 0.03, 0.105]];
  lb.add('cloth', tube(strap, 0.004, 8, 3), 0x2a5a9a);
  lb.add('cloth', tube(strap.map(([x, y, z]) => [-x, y, z] as V3), 0.004, 8, 3), 0x2a5a9a);
  const lanyard = lb.build(mats, false);
  rig.bones.chest.add(lanyard);
  const badgeB = new DecoBuilder();
  badgeB.add('metal', cbox(0.012, 0.016, 0.004, 0.002), 0xb0b4b8, at(0, -0.006, 0));
  badgeB.add('glass', cbox(0.05, 0.07, 0.006, 0.002), 0xe0e8f0, at(0, -0.05, 0));
  badgeB.print(printMat('calder-badge', () => labelCanvas('CALDER', 0xe8ecf0, '#1a3a6a', 46)), 0.046, 0.046 * 18 / 46, 0.003, at(0, -0.055, 0.002));
  badgeB.add('vinyl', cbox(0.03, 0.022, 0.004, 0.001), 0xd06a3a, at(0, -0.03, 0.002));
  const badge = new THREE.Group();
  badge.add(badgeB.build(mats, false));
  badge.position.set(0, 0.03, 0.105);
  rig.bones.chest.add(badge);
  // ---- a clipboard in the left hand
  const cb = new DecoBuilder();
  cb.add('wood', cbox(0.2, 0.28, 0.01, 0.003), 0x8a5a30, at(0, 0, 0));
  cb.add('metal', cbox(0.07, 0.03, 0.016, 0.004), 0xb8bcc0, at(0, 0.13, 0.006));
  cb.print(printMat('clip-paper2', () => {
    const c = document.createElement('canvas'); c.width = 14; c.height = 18;
    const x = c.getContext('2d')!; x.fillStyle = '#f0ecdc'; x.fillRect(0, 0, 14, 18); x.fillStyle = '#5a6070';
    for (let y = 3; y < 17; y += 2) x.fillRect(1, y, 6 + ((y * 7) % 6), 1);
    return c;
  }), 0.17, 0.22, 0.004, at(0, -0.02, 0.006));
  const clip = cb.build(mats, false);
  rig.hold('L', clip, 'raw');
  clip.position.set(0.0, -0.1, 0.06); clip.rotation.set(0.2, 0.3, 1.45);
  const hit = proxy(1.75);
  root.add(hit);
  // secondary motion
  const hairX = new Spring(38, 3.2), hairZ = new Spring(38, 3.2), badgeS = new Spring(60, 3.5), badgeR = new Spring(55, 3.5), hop = new Spring(140, 10);
  const prev = new THREE.Vector3(), vel = new THREE.Vector3(), pv = new THREE.Vector3();
  let first = true, pointW = 0, t = 0, yawPrev = 0;
  const hair = (rig as unknown as { extra?: { hair: THREE.Object3D } }).extra?.hair ?? null;
  return {
    root, hitProxy: hit,
    update(dt, inp) {
      t += dt;
      // the head turns toward what she is looking at (relative to her facing)
      let lookYaw = 0;
      if (inp.look) {
        root.updateWorldMatrix(true, false);
        _a.copy(inp.look); root.worldToLocal(_a);
        lookYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(_a.x, _a.z)));
      }
      rig.update(dt, { speed: inp.speed, stance: 'stand', lookYaw, fidget: !inp.point && !inp.talking } as any);
      // a nod of the head while she talks
      if (inp.talking) rig.j.head.rotation.x += Math.sin(t * 9) * 0.03 + Math.sin(t * 3.7) * 0.02;
      pointW += ((inp.point ? 1 : 0) - pointW) * Math.min(1, dt * 5);
      if (inp.point && pointW > 0.01) aimArm(rig as any, inp.point, pointW);
      // ponytail and badge: springs driven by how the head and chest accelerate
      rig.bones.head.getWorldPosition(pv);
      if (first) { prev.copy(pv); first = false; }
      const v = _b.copy(pv).sub(prev).divideScalar(Math.max(1e-3, dt));
      const acc = _a.copy(v).sub(vel).divideScalar(Math.max(1e-3, dt));
      vel.copy(v); prev.copy(pv);
      root.updateWorldMatrix(true, false);
      root.getWorldQuaternion(_q).invert();
      acc.applyQuaternion(_q).clampLength(0, 30);
      const yaw = root.rotation.y, dYaw = (yaw - yawPrev) / Math.max(1e-3, dt); yawPrev = yaw;
      const hx = hairX.step(dt, -acc.z * 0.012 + Math.sin(t * 1.3) * 0.03), hz = hairZ.step(dt, acc.x * 0.012 - dYaw * 0.04 + Math.sin(t * 0.9) * 0.025);
      if (hair) hair.rotation.set(hx, 0, hz);
      const bs = badgeS.step(dt, -acc.z * 0.01), br = badgeR.step(dt, acc.x * 0.01 - dYaw * 0.03);
      badge.rotation.set(Math.max(-0.4, bs) - rig.j.chest.rotation.x * 0.8, 0, br);
      root.position.y = Math.max(0, hop.step(dt)) * 0.05;
    },
    emote(n) { rig.playEmote(n); },
    head(out) { rig.bones.head.getWorldPosition(out); out.y += 0.34; return out; },
    flinch() { hop.kick(7); hairX.kick(3); badgeS.kick(4); badgeR.kick((Math.random() - 0.5) * 6); },
    dispose() { root.removeFromParent(); rig.dispose(); },
  };
}
