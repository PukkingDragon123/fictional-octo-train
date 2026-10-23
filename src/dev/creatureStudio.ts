// Creature studio: species placed in a dim lobby-style room and drawn by the
// game's own renderer (light grid, fog, outlines, grade), each driven by its
// real animate() with a stand-in creature in a chosen state.
//   open ?gallery=creatures&filter=__none__ then in the page:
//   (await import('/src/dev/creatureStudio.ts')).creatureStudio({ keys: ['grinhound'], zoom: 90, states: ['idle'] })
// states: idle | wander | chase | attack | dead | hurt (per creature, cycled over keys if fewer)
import * as THREE from 'three';
import { PixelRenderer } from '../gfx/renderer';
import { atlas } from '../gfx/atlas';
import { U } from '../gfx/materials';
import { Zone } from '../world/zone';
import { ZoneBuilder } from '../world/gen/builder';
import { ZoneRenderer } from '../world/zoneRenderer';
import { LightGrid } from '../world/lighting';
import { Rng } from '../core/rng';
import { Creature } from '../creatures/creature';
import { species } from '../creatures/registry';
import { setGame } from '../game/G';

export interface StudioOpts {
  keys: string[]; states?: string[]; zoom?: number; spacing?: number; cols?: number; yaw?: number; light?: number;
  facing?: number; floor?: string; wall?: string; freeze?: number; seed?: number; dt?: number;
}

export async function creatureStudio(o: StudioOpts) {
  for (const el of document.querySelectorAll('body > div')) if ((el as HTMLElement).style.position === 'fixed') (el as HTMLElement).remove();
  const old = document.getElementById('view') as HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.id = 'cstudio';
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:40';
  document.body.appendChild(canvas);
  if (old) old.style.display = 'none';
  const pr = new PixelRenderer(canvas);
  atlas().flush();
  pr.pxSize = pr.pxSizeTarget = 1 / (o.zoom ?? 70);
  if (o.yaw !== undefined) pr.yaw = pr.yawTarget = THREE.MathUtils.degToRad(o.yaw);
  const N = 20;
  const z = new Zone('cstudio', N, N, 1);
  const b = new ZoneBuilder(z, new Rng(o.seed ?? 3));
  b.fillFloor(1, 1, N - 2, N - 2, o.floor || 'carpet_yellow');
  b.paper(0, 0, N - 1, N - 1, o.wall || 'wall_yellow');
  const li = o.light ?? 0.55;
  for (let y = 3; y < N - 2; y += 4) for (let x = 3; x < N - 2; x += 4) b.light(x + 0.5, y + 0.5, 'fluoro', { intensity: li, radius: 6 });
  const zr = new ZoneRenderer(z);
  pr.scene.add(zr.root);
  const lg = new LightGrid(z);
  pr.scene.add(new THREE.AmbientLight(0x8a8a90, 0.25));
  U.uVisOn.value = 0; U.uFogNear.value = 200; U.uFogFar.value = 300; U.uCutOn.value = 0;
  // dynamic point lights requested by creatures (lamps, glowing things): a small pool, refilled every frame
  const pool: THREE.PointLight[] = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffffff, 0, 6, 1.6); pr.scene.add(l); return l; });
  let pn = 0;
  const fake: any = {
    zones: new Map([[z.key, z]]), players: new Map(), creatures: { creatures: new Map() }, time: 0, local: null, pr, getZone: (k: string) => fake.zones.get(k),
    pointLight: (x: number, y: number, zz: number, color: number, intensity: number, dist = 7) => { const l = pool[pn++]; if (!l) return; l.position.set(x, y, zz); l.color.setHex(color); l.intensity = intensity; l.distance = dist; },
  };
  setGame(fake);
  const cols = o.cols ?? Math.min(4, o.keys.length), sp = o.spacing ?? 2.2;
  const rows = Math.ceil(o.keys.length / cols);
  const cx = N / 2 - ((cols - 1) * sp) / 2, cz = N / 2 - ((rows - 1) * sp) / 2;
  const list: { c: Creature; sp: any; st: string }[] = [];
  o.keys.forEach((k, i) => {
    const S = species(k) as any;
    if (!S) { console.warn('no species', k); return; }
    const x = cx + (i % cols) * sp, zz = cz + Math.floor(i / cols) * sp;
    const c = new Creature(S, z.key, x, zz, 'studio' + i);
    c.facing = o.facing ?? Math.PI * 0.25; // toward the camera
    c.targetFacing = c.facing;
    const st = (o.states && o.states[i % o.states.length]) || 'idle';
    c.rig = S.build();
    c.rig!.root.userData.creature = c;
    pr.scene.add(c.rig!.root);
    if (st === 'dead') { c.dead = true; c.state = 'dead'; c.hp = 0; }
    else c.state = (st === 'hurt' ? 'chase' : st) as any;
    if (st === 'attack') { c.attackPhase = 0.3; c.state = 'attack'; }
    if (st === 'chase' || st === 'wander') { c.speed = st === 'chase' ? S.run : S.walk; }
    fake.creatures.creatures.set(c.id, c);
    list.push({ c, sp: S, st });
  });
  const tgt = new THREE.Vector3(N / 2, 0.4, N / 2);
  let t = 0;
  const step = (dt: number) => {
    t += dt; fake.time = t;
    for (const l of pool) l.intensity = 0;
    pn = 0;
    U.uTime.value = t;
    for (const e of list) {
      const c = e.c, rig = c.rig!;
      c.animT += dt;
      if (e.st === 'chase' || e.st === 'wander') { c.phase += (c.speed / Math.max(0.3, c.radius * 2.2)) * Math.PI * dt; c.vx = Math.cos(c.facing) * c.speed; c.vz = Math.sin(c.facing) * c.speed; }
      if (e.st === 'attack') { c.attackT += dt; c.attackPhase = 0.05 + ((t * 0.8) % 0.9); }
      if (e.st === 'hurt' && (Math.floor(t * 0.8) !== Math.floor((t - dt) * 0.8))) c.hitFlash = 0.3;
      if (c.dead) c.deathT += dt;
      rig.root.position.set(c.x, c.y, c.z);
      rig.root.rotation.y = Math.PI / 2 - c.facing;
      try { e.sp.animate(rig, c, c.animT, dt); } catch (err) { console.error('anim', e.sp.key, err); }
      c.hitFlash = Math.max(0, c.hitFlash - dt);
      if (c.dead) {
        const k = Math.min(1, c.deathT * 2);
        const rz = e.sp.flags?.flying ? 0 : Math.PI / 2;
        let restY = rig.root.userData.restY as number | undefined;
        if (restY === undefined) {
          rig.body.rotation.z = rz; rig.body.position.y = 0; rig.root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(rig.body);
          restY = rig.root.userData.restY = box.isEmpty() ? -c.height * 0.25 : Math.min(0.3, rig.root.position.y + 0.015 - box.min.y);
        }
        rig.body.rotation.z = rz * Math.min(1, k + 0.01);
        rig.body.position.y = restY * Math.min(1, k + 0.01);
      }
    }
  };
  const frame = (dt: number) => {
    step(dt);
    pr.target.copy(tgt);
    pr.updateCamera(dt);
    pr.updatePlayerView(tgt);
    lg.update(dt, tgt.x, tgt.z, t);
    zr.update(tgt.x, tgt.z, 40, dt);
    pr.render(dt);
  };
  if (o.freeze !== undefined) {
    // advance to a fixed moment, then keep re-rendering it
    const fdt = o.dt ?? 1 / 30;
    for (let s = 0; s < o.freeze / fdt; s++) step(fdt);
    const still = () => { pr.target.copy(tgt); pr.updateCamera(1 / 60); pr.updatePlayerView(tgt); lg.update(1 / 60, tgt.x, tgt.z, t); zr.update(tgt.x, tgt.z, 40, 1 / 60); pr.render(1 / 60); requestAnimationFrame(still); };
    still();
  } else {
    let last = performance.now();
    const loop = () => { const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); };
    loop();
  }
  (window as any).__cstudio = { pr, list, z };
  return list.length;
}
