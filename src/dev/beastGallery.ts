// Dev contact sheets for creature animation: several copies of one species,
// each simulated to a later moment of the same gallery pose, laid out in a
// row across the screen. Load an empty gallery, then in the page:
//   await (await import('/src/dev/beastGallery.ts')).filmstrip(window.__gallery, 'grinhound', 6, 0.12)
// with ?pose=<walk|gallop|stalk|warn|attack|idle|sleep|dead...> in the URL (species-specific).
import * as THREE from 'three';
import { species } from '../creatures/registry';

export function filmstrip(gal: { pr: { scene: THREE.Scene }; tgt: THREE.Vector3 }, key: string, n = 6, step = 0.12, spacing = 1.1, t0 = 0) {
  const sp: any = species(key);
  if (!sp) return 'no species ' + key;
  const out: THREE.Object3D[] = [];
  // screen-right for the current camera yaw
  const yaw = (gal.pr as any).yaw ?? Math.PI / 4;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const rig = sp.build();
    const x = gal.tgt.x + (i - (n - 1) / 2) * spacing * rx, z = gal.tgt.z + (i - (n - 1) / 2) * spacing * rz;
    rig.root.position.set(x, 0, z);
    gal.pr.scene.add(rig.root);
    // simulate up to this frame's time at 60 Hz so gait state evolves as in play
    const T = t0 + i * step;
    for (let t = 0; t <= T + 1e-6; t += 1 / 60) sp.animateGallery?.(rig, t);
    rig.root.position.set(x, rig.root.position.y, z);
    out.push(rig.root);
  }
  return out.length;
}
