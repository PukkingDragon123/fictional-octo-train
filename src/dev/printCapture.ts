// dev only (not imported by the game): renders HumanRigs and inhabitants on a transparent ground for the print art
import * as THREE from 'three';
import { HumanRig } from '../entities/humanRig';
import { stockLook } from '../entities/portrait';
import { worldMaterial } from '../gfx/materials';
import { allSpecies } from '../creatures/registry';
import { createResearcher } from '../entities/researcher';

let R: THREE.WebGLRenderer | null = null;
function renderer(w: number, h: number) {
  if (!R) {
    R = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1; R.setPixelRatio(1);
  }
  R.setSize(w, h, false); R.setClearColor(0, 0); R.clear();
  return R;
}
function lit(scene: THREE.Scene, k = 1) {
  scene.add(new THREE.HemisphereLight(0xe8eef8, 0x4a4038, 1.1 * k));
  for (const [c, i, p] of [[0xfff2e0, 2.4, [-1.2, 1.6, 2.2]], [0xc8d8ff, 0.8, [1.6, 0.5, 1.8]], [0xffffff, 1.5, [0.6, 1.6, -2.2]]] as [number, number, number[]][]) {
    const d = new THREE.DirectionalLight(c, i * k); d.position.set(p[0], p[1], p[2]); scene.add(d);
  }
}

export function humanShot(o: { seed?: number; calder?: boolean; shirt?: number; w?: number; h?: number; full?: boolean; yaw?: number; expr?: string } = {}): string {
  const w = o.w ?? 512, h = o.h ?? 768;
  const scene = new THREE.Scene(); lit(scene);
  const rig = o.calder ? createResearcher({ glasses: true, name: 'Dr. Iris Calder' }) : new HumanRig(stockLook(o.seed ?? 3), worldMaterial({ noVis: true, noFog: true, noGrid: true }), { secondary: true, hd: true });
  if (!o.calder) rig.setOutfit({ torso: { tex: 'c_jumpsuit', color: o.shirt ?? 0xc87a2a, sleeve: 'long' } } as never);
  scene.add(rig.root);
  if (o.expr) rig.setExpression(o.expr, 99);
  for (let i = 0; i < 4; i++) rig.update(1 / 30);
  rig.root.rotation.y = o.yaw ?? 0;
  rig.root.updateMatrixWorld(true);
  const head = rig.jointWorld('head');
  const cam = new THREE.PerspectiveCamera(o.full ? 24 : 16, w / h, 0.05, 40);
  if (o.full) { const top = head.y + 0.3, mid = top / 2; const dist = (top / 2 + 0.1) / Math.tan(THREE.MathUtils.degToRad(12)); cam.position.set(0, mid + 0.1, dist); cam.lookAt(0, mid, 0); }
  else { cam.position.set(head.x, head.y - 0.05, head.z + 2.6); cam.lookAt(head.x, head.y - 0.12, head.z); }
  const r = renderer(w, h); r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  rig.dispose?.();
  return url;
}

export function creatureShot(key: string, o: { w?: number; h?: number; yaw?: number; pitch?: number; fill?: number; t?: number; light?: number } = {}): string {
  const w = o.w ?? 768, h = o.h ?? 768;
  const s = allSpecies().find((x) => x.key === key);
  if (!s) return '';
  const scene = new THREE.Scene(); lit(scene, o.light ?? 1.2);
  const rig = s.build();
  scene.add(rig.root);
  try { s.animateGallery?.(rig, o.t ?? 1.3); } catch { /* still */ }
  rig.root.rotation.y = o.yaw ?? 0.5;
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root);
  const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const rad = Math.max(sz.x, sz.y, sz.z) * 0.62 / (o.fill ?? 1);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 200);
  const p = o.pitch ?? 0.18;
  const dist = rad / Math.tan(THREE.MathUtils.degToRad(15)) * (w < h ? h / w : 1);
  cam.position.set(c.x, c.y + Math.sin(p) * dist, c.z + Math.cos(p) * dist); cam.lookAt(c);
  const r = renderer(w, h); r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}
export function speciesKeys(): string[] { return allSpecies().map((s) => s.key); }
