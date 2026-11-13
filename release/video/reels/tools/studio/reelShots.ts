// The three reels, shot by shot, in the Ledge's Honey Pools. Each shot builds
// its actors, then moves them and the camera on shot-local time u (0..dur).
// Durations come from build/plan.json (voice line lengths): the capture script passes them to begin().
import * as THREE from 'three';
import type { Studio } from './reelStudio';
import { Calder, Unit, Gummy, Bee, Queen, Keeper, aim, keys, keysV, V, lerp, smooth, clamp01, filmLights, type Actor } from './reelActors';
import { paperCard } from './paperCard';
import { adScreen, AD_CUES, type QR } from './adScreen';

/** the link on the card (?link=..., from release/video/reels/itch_url.txt) */
export const LINK = new URLSearchParams(location.search).get('link') || 'pukkingdragon.itch.io/limbophobia';

export interface ShotCtx { S: Studio; actors: Actor[]; lights: ReturnType<typeof filmLights>; extra: THREE.Object3D[] }
export interface Shot { id: string; setup(c: ShotCtx, dur: number): (u: number, dt: number) => void }

// ---------------------------------------------------------------- places (tiles = metres)
const OUT = { x: 74.6, z: 90.6 };          // the Meridian field outpost: bench, terminal, specimen tank behind her
const HIVE = { x: 63.5, z: 80.5 };
const REMAINS = { x: 69.5, z: 85.5 };      // rm_unit: what is left of an earlier unit
const PITCH = Math.PI;                      // facing north (-z)

function key(c: ShotCtx, at: THREE.Vector3, i = 1.6, fill = 0.5, fillAt?: THREE.Vector3) {
  c.lights.key.position.copy(at); c.lights.key.intensity = i;
  if (fillAt) c.lights.fill.position.copy(fillAt);
  c.lights.fill.intensity = fill;
}

/** Calder at the outpost greeting the camera, gesturing at the pools: the opening of every reel */
export function intro(id: string): Shot {
  return {
    id, setup(c, dur) {
      const cal = new Calder(c.S, OUT.x, OUT.z, PITCH);
      c.actors.push(cal);
      const r = cal.r;
      const eye = V(OUT.x, 1.55, OUT.z - 3.2);
      let waved = false, pres = false;
      r.say(dur - 0.6, 'smile');
      return (u) => {
        if (!waved && u > 0.25) { waved = true; r.gesture('wave', { dur: 2.2 }); }
        if (!pres && u > dur * 0.62) { pres = true; r.gesture('present', { dur: 2.4, dir: [-0.7, 0.1, 0.7] }); }
        r.lookAt(c.S.cam.position);
        key(c, V(OUT.x + 0.9, 2.3, OUT.z - 2.0), 2.2, 0.8, V(OUT.x - 1.4, 1.6, OUT.z - 1.6));
        const d = keys(u, [[0, 2.5], [dur, 1.95]]);
        aim(c.S, V(OUT.x + keys(u, [[0, 0.3], [dur, 0.12]]), 1.52, OUT.z - d), V(OUT.x, 1.3, OUT.z), 38);
      };
    },
  };
}

/** Calder hands her card to the lens: her arm comes out toward the camera, the camera closes on it, takes it */
export function cardShot(id: string): Shot {
  return {
    id, setup(c, dur) {
      const cal = new Calder(c.S, OUT.x, OUT.z, PITCH);
      c.actors.push(cal);
      const r = cal.r;
      const card = paperCard(LINK);
      c.S.scene.add(card.root); c.extra.push(card.root);
      card.root.scale.setScalar(1.6);
      r.say(Math.min(dur - 0.4, 2.8), 'smile');
      let g = false;
      const hand = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), held = new THREE.Vector3();
      const tTake = dur - 0.55;
      return (u, dt) => {
        // she lifts it from her side and holds it out at chest height, under her face
        if (!g && u > 0.05) { g = true; r.gesture('present', { dur: 99, hold: true, dir: [0.2, -0.5, 1] }); }
        r.lookAt(c.S.cam.position);
        key(c, V(OUT.x + 0.7, 2.0, OUT.z - 1.9), 2.4, 0.9, V(OUT.x - 1.0, 1.5, OUT.z - 1.4));
        // the camera comes in on her hand
        const d = keys(u, [[0, 2.1], [tTake, 1.2], [dur, 1.1]]);
        aim(c.S, V(OUT.x - 0.04, keys(u, [[0, 1.52], [dur, 1.46]]), OUT.z - d), V(OUT.x - 0.03, keys(u, [[0, 1.36], [tTake, 1.36], [dur, 1.32]]), OUT.z - 0.45), 40, 0.45);
        // the card in her fingers, face to the lens; at the end the viewer takes it: it comes up to fill the picture
        r.root.updateMatrixWorld(true);
        r.j.handR.getWorldPosition(hand);
        const toCam = c.S.cam.position.clone().sub(hand).normalize();
        held.copy(hand).addScaledVector(toCam, 0.03).add(V(0, 0.05, 0));
        const k = smooth((u - tTake) / (dur - tTake));
        const near = c.S.cam.position.clone().add(c.S.cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.3)).add(V(0, -0.01, 0));
        card.root.position.lerpVectors(held, near, k);
        m.lookAt(c.S.cam.position, card.root.position, V(0, 1, 0));
        q.setFromRotationMatrix(m);
        card.root.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1 * (1 - k), 0.14 * (1 - k), -0.12 * (1 - k))));
        card.update(u, dt, smooth((u - 0.9) / 0.5));
      };
    },
  };
}

/** the end of every reel: the Institute's recruiting screen at the outpost, Dr. Calder in front of it like a
 *  recruiting poster, pointing at the viewer; she turns to the code as she says "scan the code". The camera all
 *  but still, so the QR code can be scanned off the picture. */
export function endcardShot(): Shot {
  return {
    id: 'endcard', setup(c, dur) {
      const qr = (window as unknown as { __qr?: QR }).__qr ?? null;
      const ad = adScreen(LINK, qr);
      const B = V(OUT.x, 2.0, OUT.z + 0.25);
      ad.root.position.copy(B); ad.root.rotation.y = Math.PI;
      c.S.scene.add(ad.root); c.extra.push(ad.root);
      const camP = V(OUT.x, 1.66, B.z - 2.45);
      const cal = new Calder(c.S, OUT.x + 0.2, B.z - 0.3, 0);
      c.actors.push(cal);
      const r = cal.r;
      cal.yaw = cal.yawTo(camP.x, camP.z) + 0.3;
      const C = AD_CUES;
      let step = 0, said = false;
      return (u) => {
        // her line starts 0.6 s in and the screen is held 3 s after it (tools/plan.py: AD_LEAD, AD_HOLD)
        if (!said && u > 0.6) { said = true; r.say(dur - 3.65, 'smile'); }
        // point at the viewer; at "scan the code" a hand to the code; then back at the viewer
        if (step === 0 && u > 1.3) { step = 1; r.gesture('point', { dur: C.qr - 1.3, at: camP.clone().add(V(-0.45, -0.3, 0)) }); }
        if (step === 1 && u > C.qr) { step = 2; r.gesture('present', { dur: C.comment - C.qr + 0.2, at: B.clone().add(V(-0.17, -0.12, 0)) }); }
        if (step === 2 && u > C.comment + 0.1) { step = 3; r.gesture('point', { dur: 99, hold: true, at: camP.clone().add(V(-0.45, -0.3, 0)) }); }
        // a glance at the code, not a turn away from us
        r.lookAt(step === 2 && u < C.qr + 0.9 ? c.S.cam.position.clone().lerp(B.clone().add(V(-0.17, -0.1, 0)), 0.45) : c.S.cam.position);
        // a warm key from the front, the screen's cyan behind her
        key(c, V(OUT.x - 0.9, 2.2, B.z - 1.7), 1.9, 0.7, V(OUT.x + 0.1, 1.9, B.z - 0.15));
        c.lights.fill.color.setHex(0x60e8ff); c.lights.fill.distance = 3;
        ad.update(u);
        aim(c.S, V(camP.x, camP.y, camP.z + keys(u, [[0, 0], [dur, 0.05]])), V(OUT.x, 1.894, B.z), 37.2, 0.08);
      };
    },
  };
}

// ================================================================ THE JELLY BEAR
const BEAR = { x: 70.5, z: 67.5 };
export const JELLY: Shot[] = [
  intro('intro'),
  {
    // wide: Calder in the foreground points across the pools at the bear walking
    id: 'wide', setup(c, dur) {
      const b = new Gummy(c.S, BEAR.x + 1.5, BEAR.z + 0.8, -Math.PI / 2 - 0.3);
      const cal = new Calder(c.S, BEAR.x - 0.55, BEAR.z + 4.3, 0);
      c.actors.push(b, cal);
      b.pose = 'walk';
      let p = false;
      cal.r.say(dur - 0.5);
      return (u) => {
        const bx = keys(u, [[0, BEAR.x + 1.6], [dur, BEAR.x - 0.4]]);
        b.root.position.set(bx, 0, BEAR.z + 0.6 + Math.sin(u * 0.4) * 0.12);
        const toBear = Math.atan2(bx - cal.pos.x, b.root.position.z - cal.pos.z), toCam = Math.atan2(c.S.cam.position.x - cal.pos.x, c.S.cam.position.z - cal.pos.z);
        let dd = toCam - toBear; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
        cal.yaw = toBear + dd * 0.55;
        if (!p && u > 0.9) { p = true; cal.r.gesture('point', { dur: dur - 1.4, at: b.root.position.clone().setY(0.5) }); }
        cal.r.lookAt(u < dur * 0.45 ? c.S.cam.position : b.root.position.clone().setY(0.6));
        key(c, V(BEAR.x - 0.6, 2.4, BEAR.z + 5.4), 1.8, 0.6, V(BEAR.x + 1, 2, BEAR.z + 3));
        const cx = keys(u, [[0, BEAR.x + 0.75], [dur, BEAR.x + 0.45]]);
        aim(c.S, V(cx, 1.45, BEAR.z + 7.5), V(BEAR.x - 0.25, 0.85, BEAR.z + 1.6), 52);
      };
    },
  },
  {
    // close: slow orbit round the body, a bee half digested inside it (its last meal)
    id: 'detail', setup(c, dur) {
      const b = new Gummy(c.S, BEAR.x, BEAR.z, 0.4);
      c.actors.push(b);
      b.pose = 'digest'; b.o = { prey: 0.25 };
      return (u) => {
        b.o.prey = 0.22 + u / dur * 0.25;
        const a = keys(u, [[0, -0.6], [dur, 0.5]]);
        const R = keys(u, [[0, 2.3], [dur, 1.75]]);
        key(c, V(BEAR.x + Math.sin(a + 0.8) * 2, 2.0, BEAR.z + Math.cos(a + 0.8) * 2), 2.0, 0.6, V(BEAR.x - 1.5, 1.2, BEAR.z - 1));
        aim(c.S, V(BEAR.x + Math.sin(a) * R, 0.85, BEAR.z + Math.cos(a) * R), V(BEAR.x, 0.42, BEAR.z), 46, 0.6);
      };
    },
  },
  {
    // side: low dolly along the flank (the paw out of its side, fur islands), it turns its wrong head to look
    id: 'side', setup(c, dur) {
      const b = new Gummy(c.S, BEAR.x, BEAR.z, Math.PI / 2, 1);
      c.actors.push(b);
      b.pose = 'idle';
      return (u) => {
        b.pose = u > dur * 0.55 ? 'warn' : 'idle';
        const x = keys(u, [[0, BEAR.x - 0.8], [dur, BEAR.x + 0.7]]);
        key(c, V(BEAR.x, 1.8, BEAR.z + 1.8), 1.8, 0.5, V(BEAR.x + 1.5, 1, BEAR.z - 1));
        aim(c.S, V(x, 0.5, BEAR.z + 1.9), V(x * 0.4 + BEAR.x * 0.6, 0.42, BEAR.z), 46, 0.5);
      };
    },
  },
  {
    // hunt: a bee bumbles low over the floor; the bear stalks flat, coils, lunges, swallows it
    id: 'hunt', setup(c, dur) {
      const B0 = V(BEAR.x - 0.3, 0, BEAR.z - 2.6), BEE0 = V(BEAR.x + 0.1, 0, BEAR.z + 1.1);
      const b = new Gummy(c.S, B0.x, B0.z, 0.1);
      const bee = new Bee(c.S, BEE0.x, 0, BEE0.z, Math.PI * 0.8, 0, 0.21);
      c.actors.push(b, bee);
      const tCoil = dur - 3.0, tLunge = dur - 2.2, tEng = dur - 1.8;
      return (u) => {
        b.pose = u < tCoil ? 'stalk' : u < tLunge ? 'coil' : u < tEng ? 'lunge' : 'digest';
        b.o = u >= tEng ? { prey: 0.02 + (u - tEng) * 0.06 } : {};
        const bz = u < tCoil ? lerp(B0.z, BEE0.z - 1.5, u / tCoil) : u < tLunge ? BEE0.z - 1.5 : lerp(BEE0.z - 1.5, BEE0.z - 0.35, smooth((u - tLunge) / 0.4));
        b.root.position.set(B0.x + (bz - B0.z) * 0.1, 0, bz);
        b.root.rotation.y = Math.atan2(BEE0.x - b.root.position.x, BEE0.z - b.root.position.z);
        bee.root.visible = u < tEng;
        bee.root.position.set(BEE0.x + Math.sin(u * 0.9) * 0.2, 0, BEE0.z + Math.sin(u * 0.6) * 0.12);
        bee.d.panic = u > tCoil ? 1 : 0;
        key(c, V(BEAR.x + 1.2, 2.2, BEAR.z + 2.5), 1.9, 0.6, V(BEAR.x - 1.5, 1.4, BEAR.z - 1));
        const cz = keys(u, [[0, BEE0.z + 2.6], [tLunge, BEE0.z + 2.1], [dur, BEE0.z + 1.9]]);
        aim(c.S, V(BEAR.x + 0.85, keys(u, [[0, 0.75], [dur, 0.6]]), cz), V(lerp(BEE0.x, b.root.position.x, 0.5), 0.4, lerp(BEE0.z, b.root.position.z, 0.55)), 52, u > tLunge && u < tEng + 0.3 ? 2.5 : 0.7);
      };
    },
  },
  {
    // split: the fed bear pinches itself in two; the camera circles it
    id: 'split', setup(c, dur) {
      const b = new Gummy(c.S, BEAR.x, BEAR.z, -0.3, 2);
      const h1 = new Gummy(c.S, BEAR.x, BEAR.z, -0.3, 2), h2 = new Gummy(c.S, BEAR.x, BEAR.z, -0.3, 0);
      c.actors.push(b, h1, h2);
      b.pose = 'split'; h1.pose = 'walk'; h2.pose = 'idle';
      const tEnd = dur * 0.62;
      return (u) => {
        b.o = { fs: clamp01((u - 0.3) / (tEnd - 0.3)) };
        const two = u > tEnd;
        b.root.visible = !two; h1.root.visible = two; h2.root.visible = two;
        const k = smooth((u - tEnd) / (dur - tEnd));
        h1.root.scale.setScalar(lerp(0.74, 0.8, k)); h2.root.scale.setScalar(lerp(0.74, 0.78, k));
        h1.root.position.set(BEAR.x + 0.28 + k * 0.5, 0, BEAR.z - 0.25 - k * 0.4); h1.root.rotation.y = -0.3 + 0.5 * k;
        h2.root.position.set(BEAR.x - 0.28 - k * 0.3, 0, BEAR.z + 0.25 + k * 0.2); h2.root.rotation.y = -0.3 - 1.2 * k;
        const a = keys(u, [[0, 0.9], [dur, -0.2]]);
        key(c, V(BEAR.x + 1.5, 2.2, BEAR.z + 1.5), 1.9, 0.6, V(BEAR.x - 1.5, 1.2, BEAR.z + 1));
        aim(c.S, V(BEAR.x + Math.sin(a) * 3.3, 1.15, BEAR.z + Math.cos(a) * 3.3), V(BEAR.x, 0.4, BEAR.z), 50, 0.6);
      };
    },
  },
  {
    // approach: over the unit's shoulder, the bear ahead turns to it
    id: 'approach', setup(c, dur) {
      const unit = new Unit(c.S, BEAR.x - 0.6, BEAR.z + 4.2, Math.PI);
      const b = new Gummy(c.S, BEAR.x, BEAR.z, 0.2);
      c.actors.push(unit, b);
      b.pose = 'idle';
      return (u) => {
        unit.pos.z = keys(u, [[0, BEAR.z + 4.4], [dur * 0.75, BEAR.z + 2.6], [dur, BEAR.z + 2.5]]);
        unit.speed = u < dur * 0.75 ? 0.9 : 0;
        unit.input = { lookX: BEAR.x, lookY: 0.5, lookZ: BEAR.z, lookW: 1 };
        b.pose = u > dur * 0.45 ? 'warn' : 'idle';
        key(c, V(BEAR.x - 1, 2.2, BEAR.z + 3), 1.5, 0.5, V(BEAR.x + 1, 1.2, BEAR.z - 1));
        aim(c.S, V(unit.pos.x + 0.85, 1.3, unit.pos.z + 2.5), V(BEAR.x - 0.4, 0.6, BEAR.z + 0.4), 52, 0.8);
      };
    },
  },
  {
    // eaten: the lunge, the unit goes down under the jelly, the bear settles over it; it is visible inside
    id: 'eaten', setup(c, dur) {
      const P = V(BEAR.x - 0.5, 0, BEAR.z + 2.4);
      const unit = new Unit(c.S, P.x, P.z, Math.PI);
      const b = new Gummy(c.S, BEAR.x, BEAR.z + 0.4, 0);
      c.actors.push(unit, b);
      const tL = 0.35, tHit = 0.8, tDown = 1.15;
      return (u) => {
        b.pose = u < tL ? 'coil' : u < tHit + 0.25 ? 'lunge' : 'engulf';
        const k = smooth((u - tL) / (tHit - tL + 0.2));
        // it lands on the unit and flows over its chest
        b.root.position.set(lerp(BEAR.x, P.x, k), 0, lerp(BEAR.z + 0.4, P.z + 0.35 + (u > tDown ? 0.25 : 0), k));
        b.root.rotation.y = Math.atan2(P.x - BEAR.x, P.z - BEAR.z);
        if (u < tHit) { unit.input = { panic: 1, action: 'flinch', actionT: u, actionDur: 0.4 }; unit.pos.set(P.x, 0, P.z); }
        else { unit.input = { full: u < tDown ? 'fall' : 'downed', panic: 1 }; unit.pos.set(P.x, 0, lerp(P.z, P.z + 0.35, smooth((u - tHit) / 0.4))); }
        unit.yaw = Math.PI;
        const shake = u > tHit && u < tHit + 0.7 ? 3.5 : 0.8;
        key(c, V(P.x + 1.3, 2.0, P.z + 1.6), 2.0, 0.6, V(P.x - 1.5, 1.2, P.z - 0.5));
        const cam = keysV(u, [[0, V(P.x + 3.2, 1.1, P.z + 1.2)], [tHit, V(P.x + 2.9, 0.9, P.z + 1.3)], [dur, V(P.x + 2.2, 0.85, P.z + 1.6)]]);
        aim(c.S, cam, V(P.x, keys(u, [[0, 0.75], [tDown, 0.35]]), lerp(P.z - 0.6, P.z + 0.3, smooth(u / tDown))), 54, shake);
      };
    },
  },
  cardShot('card'),
];

// ================================================================ THE BUMBLE BEE
export const BEE: Shot[] = [
  intro('intro'),
  {
    // close: the bee hangs in front of the lens, labouring
    id: 'hover', setup(c, dur) {
      const P = V(70.5, 0, 72.5);
      const bee = new Bee(c.S, P.x, 0.15, P.z, Math.PI - 0.5, 0, 0.11);
      c.actors.push(bee);
      return (u) => {
        bee.root.position.set(P.x + Math.sin(u * 0.7) * 0.12, 0.15 + Math.sin(u * 0.5) * 0.05, P.z);
        key(c, V(P.x + 1.2, 2, P.z - 1.8), 2.2, 0.7, V(P.x - 1.5, 1, P.z - 1));
        const d = keys(u, [[0, 2.2], [dur, 1.35]]);
        aim(c.S, V(P.x - 0.35, 0.95, P.z - d), V(P.x, 0.82, P.z), 40, 0.6);
      };
    },
  },
  {
    // the bee blunders into a wax column, sags, and gives up: sits on the floor panting
    id: 'bonk', setup(c, dur) {
      const P = V(71.4, 0, 65.6);          // the wax column at (71, 65)
      const bee = new Bee(c.S, P.x - 1.6, 0, P.z + 0.6, Math.PI / 2, 1, 0.42);
      c.actors.push(bee);
      const tB = dur * 0.3, tSit = dur * 0.55;
      return (u) => {
        const x = u < tB ? lerp(P.x - 1.9, P.x - 0.7, u / tB) : lerp(P.x - 0.7, P.x - 1.15, smooth((u - tB) / 0.6));
        bee.root.position.set(x, 0, P.z + 0.6);
        bee.d.bonk = u > tB ? Math.max(0, 1 - (u - tB) * 1.6) : 0;
        bee.d.fly = u < tSit ? 1 : Math.max(0, 1 - (u - tSit) * 1.5);
        bee.d.panic = u > tB && u < tSit ? 0.6 : 0;
        key(c, V(P.x - 1, 2.2, P.z + 2.6), 1.8, 0.6);
        aim(c.S, V(keys(u, [[0, P.x - 1.6], [dur, P.x - 1.3]]), 0.95, P.z + 3.6), V(x + 0.15, 0.45, P.z + 0.5), 46, 0.7);
      };
    },
  },
  {
    // macro on the soft stub of a sting, then rack along to the old remains behind it
    id: 'stub', setup(c, dur) {
      const bee = new Bee(c.S, REMAINS.x - 1.2, 0, REMAINS.z - 1.6, Math.PI * 0.75, 2, 0.6);
      c.actors.push(bee);
      bee.d.fly = 0;
      return (u) => {
        const b = bee.root.position;
        key(c, V(b.x - 1, 1.6, b.z - 1.3), 1.9, 0.6, V(REMAINS.x + 1, 1.2, REMAINS.z + 0.5));
        const tgt = keysV(u, [[0, V(b.x - 0.15, 0.3, b.z - 0.25)], [dur * 0.45, V(b.x - 0.15, 0.3, b.z - 0.25)], [dur, V(REMAINS.x, 0.2, REMAINS.z)]]);
        const cam = keysV(u, [[0, V(b.x - 0.95, 0.42, b.z - 1.0)], [dur * 0.45, V(b.x - 0.8, 0.45, b.z - 0.85)], [dur, V(b.x - 1.2, 1.0, b.z - 1.0)]]);
        aim(c.S, cam, tgt, 40, 0.5);
      };
    },
  },
  {
    // feeding: sat on the remains, head down, chewing; then up, heavy, a ball of meat in its jaws
    id: 'chew', setup(c, dur) {
      const bee = new Bee(c.S, REMAINS.x, 0.05, REMAINS.z - 0.2, Math.PI * 0.9, 0, 0.77);
      const bee2 = new Bee(c.S, REMAINS.x - 0.7, 0, REMAINS.z + 0.5, Math.PI * 0.4, 1, 0.12);
      c.actors.push(bee, bee2);
      const tUp = dur * 0.55;
      return (u) => {
        bee.d.chew = u < tUp ? 1 : 0; bee.d.fly = u < tUp ? 0 : clamp01((u - tUp) * 1.2); bee.d.load = u < tUp ? 0 : 1;
        bee.root.position.set(lerp(REMAINS.x, REMAINS.x - 2.6, smooth((u - tUp - 0.4) / 2.6)), 0.05, lerp(REMAINS.z - 0.2, REMAINS.z - 2.2, smooth((u - tUp - 0.4) / 2.6)));
        bee.root.rotation.y = u < tUp ? Math.PI * 0.9 : lerp(Math.PI * 0.9, Math.PI * 1.25, smooth((u - tUp) / 0.8));
        bee2.d.chew = 1; bee2.d.fly = 0;
        key(c, V(REMAINS.x + 1.3, 2.1, REMAINS.z - 1.4), 2.0, 0.6);
        const bp = bee.root.position;
        aim(c.S, V(lerp(REMAINS.x + 1.5, bp.x + 1.6, smooth((u - tUp) / 2)), keys(u, [[0, 0.85], [dur, 1.0]]), lerp(REMAINS.z - 1.8, bp.z - 1.5, smooth((u - tUp) / 2))), V(lerp(REMAINS.x - 0.2, bp.x, 0.75), 0.45, lerp(REMAINS.z, bp.z, 0.75)), 46, 0.6);
      };
    },
  },
  {
    // the reveal: the queen in her bowl of comb, Calder (foreground) pointing; a loaded bee flies in
    id: 'queen', setup(c, dur) {
      const q = new Queen(c.S, HIVE.x, HIVE.z, Math.PI / 2);
      const cal = new Calder(c.S, HIVE.x + 6.0, HIVE.z + 2.2, 0);
      const bee = new Bee(c.S, HIVE.x + 4.5, 0.2, HIVE.z - 1.5, -Math.PI / 2, 0, 0.5);
      c.actors.push(q, cal, bee);
      bee.d.load = 1;
      cal.face(0, 0.01, cal.yawTo(HIVE.x, HIVE.z));
      cal.r.say(dur - 0.5);
      let p = false;
      return (u) => {
        q.pose = u > dur * 0.6 ? 'fed' : 'idle';
        bee.root.position.set(lerp(HIVE.x + 4.5, HIVE.x + 1.9, smooth(u / dur)), 0.25, lerp(HIVE.z - 1.5, HIVE.z - 0.2, smooth(u / dur)));
        const toQ = Math.atan2(HIVE.x - cal.pos.x, HIVE.z - cal.pos.z), toCam = Math.atan2(c.S.cam.position.x - cal.pos.x, c.S.cam.position.z - cal.pos.z);
        let dd = toCam - toQ; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
        cal.yaw = toQ + dd * 0.55;
        if (!p && u > 0.8) { p = true; cal.r.gesture('point', { dur: dur - 1.2, at: V(HIVE.x + 0.5, 1.2, HIVE.z) }); }
        cal.r.lookAt(u < dur * 0.4 ? c.S.cam.position : V(HIVE.x, 1.2, HIVE.z));
        key(c, V(HIVE.x + 4.5, 3.0, HIVE.z + 1.5), 2.4, 0.8, V(HIVE.x + 7, 1.8, HIVE.z + 4));
        const cam = keysV(u, [[0, V(HIVE.x + 8.4, 1.0, HIVE.z + 3.8)], [dur, V(HIVE.x + 7.6, 1.3, HIVE.z + 3.3)]]);
        aim(c.S, cam, V(HIVE.x + 1.6, 1.0, HIVE.z + 0.3), 44, 0.7);
      };
    },
  },
  {
    // feeding the open stomach: a bee at the maw, the belly churning with what she has eaten
    id: 'feed', setup(c, dur) {
      const q = new Queen(c.S, HIVE.x, HIVE.z, Math.PI / 2);
      const bee = new Bee(c.S, HIVE.x + 1.6, 0.1, HIVE.z + 0.3, -Math.PI / 2, 1, 0.33);
      const bee2 = new Bee(c.S, HIVE.x + 2.2, 0.5, HIVE.z - 0.9, -Math.PI / 2 - 0.4, 2, 0.81);
      c.actors.push(q, bee, bee2);
      q.pose = 'churn'; q.gut = ['b:1', 'o:chair_office', 'i:flashlight', 'o:filing_cabinet'];
      bee.d.load = 1;
      return (u) => {
        q.pose = u < dur * 0.5 ? 'fed' : 'churn';
        bee.root.position.set(HIVE.x + 1.6 + Math.sin(u) * 0.08, 0.1, HIVE.z + 0.3);
        key(c, V(HIVE.x + 3, 2.6, HIVE.z + 2.5), 2.4, 0.8, V(HIVE.x + 3, 1.2, HIVE.z - 2));
        const a = keys(u, [[0, 1.15], [dur, 0.75]]);
        aim(c.S, V(HIVE.x + Math.sin(a) * 3.6, 0.9, HIVE.z + Math.cos(a) * 3.6), V(HIVE.x + 0.5, 0.75, HIVE.z), 42, 0.6);
      };
    },
  },
  {
    // the unit wanders into the pools; the queen's front legs rake the floor
    id: 'rake', setup(c, dur) {
      const q = new Queen(c.S, HIVE.x, HIVE.z, Math.PI / 2);
      const unit = new Unit(c.S, HIVE.x + 4.5, HIVE.z + 1.6, -Math.PI / 2);
      c.actors.push(q, unit);
      return (u) => {
        unit.pos.x = keys(u, [[0, HIVE.x + 4.6], [dur, HIVE.x + 2.7]]);
        unit.pos.z = HIVE.z + 1.2;
        unit.speed = 0.9;
        unit.input = { lookX: HIVE.x, lookY: 1, lookZ: HIVE.z, lookW: 0.6 };
        q.pose = u > dur * 0.5 ? 'suck' : 'idle';
        key(c, V(HIVE.x + 3, 2.6, HIVE.z + 3), 2.2, 0.7);
        aim(c.S, V(unit.pos.x + 1.6, 1.15, unit.pos.z + 2.6), V(HIVE.x + 1.6, 0.8, HIVE.z + 0.4), 44, 0.8);
      };
    },
  },
  {
    // swallowed: dragged in, the gulp, then the unit turning over inside her belly
    id: 'swallow', setup(c, dur) {
      const q = new Queen(c.S, HIVE.x, HIVE.z, Math.PI / 2);
      const unit = new Unit(c.S, HIVE.x + 2.7, HIVE.z + 1.2, -Math.PI / 2);
      c.actors.push(q, unit);
      const tPull = 0.2, tGulp = 1.35;
      let inside = false;
      const mini = new Unit(c.S, HIVE.x + 1, HIVE.z, 0, 0.37);
      c.actors.push(mini);
      mini.root.visible = false;
      return (u) => {
        q.pose = u < tGulp ? 'suck' : u < tGulp + 0.8 ? 'gulp' : 'churn';
        q.gut = u > tGulp + 0.4 ? ['o:chair_office', 'i:flashlight'] : [];
        if (u < tGulp) {
          const k = smooth((u - tPull) / (tGulp - tPull));
          unit.pos.set(lerp(HIVE.x + 2.7, HIVE.x + 1.2, k), 0, lerp(HIVE.z + 1.2, HIVE.z + 0.1, k));
          unit.input = { full: 'downed', panic: 1 }; unit.speed = 0;
        } else unit.root.visible = false;
        if (u > tGulp + 0.3 && !inside) { inside = true; mini.root.visible = true; mini.root.scale.setScalar(0.55); }
        if (inside) {
          // deep in the open stomach, turning over, seen through the maw
          const a = (u - tGulp) * 0.7, sink = smooth((u - tGulp - 0.3) / 3);
          mini.pos.set(HIVE.x + lerp(1.05, 0.7, sink), 0.32 + Math.sin(a * 1.3) * 0.05, HIVE.z + Math.sin(a) * 0.08);
          mini.yaw = -Math.PI / 2 + a * 0.6;
          mini.root.rotation.x = Math.sin(a) * 0.5; mini.root.rotation.z = Math.PI / 2 + Math.sin(a * 0.8) * 0.4;
          mini.input = { full: 'downed', panic: 1 };
        }
        key(c, V(HIVE.x + 3, 2.5, HIVE.z + 2.5), 2.6, 0.9, V(HIVE.x + 2.5, 1.2, HIVE.z - 2));
        const cam = keysV(u, [[0, V(HIVE.x + 4.2, 0.7, HIVE.z + 2.8)], [tGulp, V(HIVE.x + 3.6, 0.8, HIVE.z + 2.4)], [dur, V(HIVE.x + 2.9, 1.1, HIVE.z + 1.9)]]);
        aim(c.S, cam, V(HIVE.x + 0.6, 0.75, HIVE.z + 0.1), 42, u > tGulp && u < tGulp + 0.7 ? 2.5 : 0.7);
      };
    },
  },
  cardShot('card'),
];

// ================================================================ THE BEE KEEPER
const KP = { x: 71.5, z: 74.5 };
export const KEEPER: Shot[] = [
  intro('intro'),
  {
    // a Still Life the bees have been at: growths coming through it as we watch
    id: 'turning', setup(c, dur) {
      const k = new Keeper(c.S, KP.x, KP.z, -Math.PI / 2 - 0.4);
      const b1 = new Bee(c.S, KP.x - 0.6, 0.6, KP.z + 0.5, Math.PI / 2, 0, 0.2);
      const b2 = new Bee(c.S, KP.x + 0.5, 0.9, KP.z - 0.6, -Math.PI / 2, 1, 0.6);
      c.actors.push(k, b1, b2);
      k.pose = 'idle';
      return (u) => {
        k.o = { growth: lerp(0.05, 1, smooth(u / dur)) };
        b1.root.position.set(KP.x + 0.55 + Math.sin(u) * 0.1, 1.15, KP.z + 0.75);
        b2.root.position.set(KP.x + 0.75, 0.75 + Math.sin(u * 1.3) * 0.08, KP.z - 0.65);
        key(c, V(KP.x - 1.6, 2.4, KP.z + 1.8), 2.0, 0.7, V(KP.x + 1.6, 1.4, KP.z + 1.0));
        const a = keys(u, [[0, -0.25], [dur, 0.25]]);
        aim(c.S, V(KP.x - 2.6 * Math.cos(a), 1.3, KP.z + 2.6 * Math.sin(a) + 0.8), V(KP.x, 1.05, KP.z), 40, 0.6);
      };
    },
  },
  {
    // the face: compound eyes, antennae, mandibles; a slow push in
    id: 'face', setup(c, dur) {
      const k = new Keeper(c.S, KP.x, KP.z, -Math.PI / 2);
      c.actors.push(k);
      k.pose = 'watch';
      return (u) => {
        k.o = { yaw: Math.sin(u * 0.5) * 0.2 };
        key(c, V(KP.x - 1.2, 2.0, KP.z + 0.9), 2.2, 0.7, V(KP.x - 1, 1.5, KP.z - 1));
        const d = keys(u, [[0, 1.5], [dur, 0.95]]);
        aim(c.S, V(KP.x - d, 1.5, KP.z + 0.08), V(KP.x, 1.48, KP.z), 38, 0.4);
      };
    },
  },
  {
    // the rib legs: orbit at chest height
    id: 'legs', setup(c, dur) {
      const k = new Keeper(c.S, KP.x, KP.z, -Math.PI / 2);
      c.actors.push(k);
      k.pose = 'buzz';
      return (u) => {
        const a = keys(u, [[0, -2.2], [dur, -1.2]]);
        key(c, V(KP.x - 1.4, 1.9, KP.z - 0.8), 2.2, 0.7, V(KP.x - 1, 1.2, KP.z + 1.2));
        aim(c.S, V(KP.x + Math.sin(a) * 1.25, 1.2, KP.z + Math.cos(a) * 1.25), V(KP.x, 1.1, KP.z), 38, 0.5);
      };
    },
  },
  {
    // it follows the unit at a polite distance, and copies how it stands
    id: 'follow', setup(c, dur) {
      // both walk toward the lens down the pools, the keeper a polite few metres behind; the unit stops and
      // raises its lamp, and the keeper stops and raises an empty hand the same way
      const X = 70.5;
      const unit = new Unit(c.S, X, 64.5, 0);
      const k = new Keeper(c.S, X + 0.35, 62.0, 0);
      c.actors.push(unit, k);
      const tStop = dur * 0.6;
      return (u) => {
        const uz = keys(u, [[0, 64.6], [tStop, 67.6], [dur, 67.6]]);
        unit.pos.set(X, 0, uz); unit.yaw = 0;
        unit.speed = u < tStop ? 0.95 : 0;
        unit.input = u > tStop ? { action: 'hold_light', actionT: u, actionDur: 9 } : {};
        k.root.position.set(X - 0.85, 0, keys(u, [[0, 62.0], [tStop + 0.5, 65.0], [dur, 65.0]]));
        k.root.rotation.y = 0;
        k.pose = u < tStop + 0.5 ? 'walk' : 'mimic';
        k.o = { mimic: 'torch' };
        key(c, V(X + 1.2, 2.4, uz + 2.2), 1.9, 0.6, V(X - 1, 1.4, uz + 1));
        aim(c.S, V(X + 0.45, 1.45, uz + 3.6), V(X - 0.35, 1.0, uz - 1.2), 48, 0.7);
      };
    },
  },
  {
    // it picks up what the unit put down and turns it over and over
    id: 'inspect', setup(c, dur) {
      const k = new Keeper(c.S, KP.x, KP.z, -Math.PI / 2 - 0.2);
      c.actors.push(k);
      k.pose = 'inspect'; k.o = { item: 'flashlight' };
      return (u) => {
        key(c, V(KP.x - 1.2, 2.0, KP.z + 1.0), 2.2, 0.7, V(KP.x - 1, 1.3, KP.z - 1.2));
        const d = keys(u, [[0, 1.8], [dur, 1.2]]);
        aim(c.S, V(KP.x - d, 1.35, KP.z + 0.55), V(KP.x - 0.2, 1.15, KP.z + 0.05), 38, 0.5);
      };
    },
  },
  {
    // cornered: the unit backs into the outpost bench; it comes on, buzzing
    id: 'corner', setup(c, dur) {
      const U0 = V(74.6, 0, 91.6);
      const unit = new Unit(c.S, U0.x, U0.z - 1.2, PITCH);
      const k = new Keeper(c.S, U0.x - 0.2, U0.z - 4.4, 0);
      c.actors.push(unit, k);
      return (u) => {
        unit.pos.set(U0.x, 0, keys(u, [[0, U0.z - 1.2], [dur * 0.7, U0.z - 0.25], [dur, U0.z - 0.2]]));
        unit.speed = u < dur * 0.7 ? 0.6 : 0;
        unit.yaw = PITCH;
        unit.input = { panic: 1, moveYaw: Math.PI, lookX: k.root.position.x, lookY: 1.6, lookZ: k.root.position.z, lookW: 1 };
        k.root.position.set(U0.x - 0.15, 0, keys(u, [[0, U0.z - 4.4], [dur, U0.z - 1.75]]));
        k.pose = u < dur * 0.5 ? 'walk' : 'buzz';
        key(c, V(U0.x + 1, 2.3, U0.z - 2), 1.8, 0.6, V(U0.x - 1, 1.5, U0.z - 1));
        aim(c.S, V(U0.x + 0.55, 1.6, U0.z - 0.05), V(k.root.position.x, 1.35, k.root.position.z), 40, 1.2);
      };
    },
  },
  {
    // the sting: it lunges, the unit drops
    id: 'sting', setup(c, dur) {
      const U0 = V(74.6, 0, 91.4);
      const unit = new Unit(c.S, U0.x, U0.z, PITCH);
      const k = new Keeper(c.S, U0.x - 0.15, U0.z - 1.55, 0);
      c.actors.push(unit, k);
      const tS = 0.35, tDown = 0.75;
      return (u) => {
        k.pose = u < tDown + 0.6 ? 'sting' : 'watch';
        unit.input = u < tDown ? { panic: 1, action: 'flinch', actionT: u - tS, actionDur: 0.4 } : { full: 'fall', panic: 1 };
        if (u > tDown + 0.9) unit.input = { full: 'dead' };
        key(c, V(U0.x - 1.2, 2.3, U0.z - 1.8), 1.9, 0.6, V(U0.x + 1.2, 1.3, U0.z - 1.0));
        const sh = u > tS && u < tS + 0.6 ? 3.5 : 0.8;
        aim(c.S, keysV(u, [[0, V(U0.x - 3.0, 1.3, U0.z - 0.9)], [dur, V(U0.x - 2.8, 1.1, U0.z - 0.8)]]), V(U0.x - 0.05, keys(u, [[0, 1.1], [dur, 0.6]]), U0.z - 0.75), 50, sh);
      };
    },
  },
  {
    // after: the bees come down on what is left
    id: 'after', setup(c, dur) {
      const U0 = V(74.6, 0, 91.0);
      const unit = new Unit(c.S, U0.x, U0.z, PITCH + 0.3);
      const k = new Keeper(c.S, U0.x + 0.9, U0.z - 2.6, -0.4);
      const bees = [0, 1, 2].map((i) => new Bee(c.S, U0.x - 2 + i, 0.2, U0.z - 2.5, 0.4 + i, i % 3, 0.2 + i * 0.27));
      c.actors.push(unit, k, ...bees);
      unit.input = { full: 'dead' };
      k.pose = 'watch';
      const spots = [V(U0.x - 0.3, 0, U0.z - 0.4), V(U0.x + 0.35, 0, U0.z - 0.1), V(U0.x, 0, U0.z + 0.4)];
      return (u) => {
        bees.forEach((b, i) => {
          const k2 = smooth((u - 0.2 - i * 0.5) / 1.6);
          const from = V(U0.x - 2.2 + i * 1.3, 0, U0.z - 2.8);
          b.root.position.set(lerp(from.x, spots[i].x, k2), lerp(0.5, 0.02, k2), lerp(from.z, spots[i].z, k2));
          b.d.fly = 1 - smooth((u - 1.6 - i * 0.5) / 0.6); b.d.chew = b.d.fly < 0.5 ? 1 : 0;
        });
        key(c, V(U0.x - 1, 2.2, U0.z - 1.8), 1.8, 0.6);
        aim(c.S, keysV(u, [[0, V(U0.x - 2.4, 1.8, U0.z - 2.2)], [dur, V(U0.x - 1.9, 1.4, U0.z - 1.8)]]), V(U0.x, 0.25, U0.z - 0.3), 48, 0.6);
      };
    },
  },
  cardShot('card'),
];

for (const L of [JELLY, BEE, KEEPER]) L.push(endcardShot());
export const REELS: Record<string, Shot[]> = { jelly: JELLY, bee: BEE, keeper: KEEPER };

