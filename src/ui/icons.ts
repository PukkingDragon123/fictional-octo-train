import * as THREE from 'three';
import { G } from '../game/G';
import { itemGeometry } from '../items/itemMeshes';
import { worldMaterial, U } from '../gfx/materials';
import { itemDef } from '../items/item';
import { buildObjGeometry } from '../world/objects';

const cache = new Map<string, string>();
let rt: THREE.WebGLRenderTarget | null = null;
let scene: THREE.Scene | null = null;
let cam: THREE.OrthographicCamera | null = null;
const SIZE = 40;

/**
 * Inventory icons are rendered from each item's 3D model with the same
 * pixel-art materials, then outlined and cached as data URLs.
 */
export function itemIcon(key: string, variant = ''): string {
  const ck = key + '|' + variant;
  const hit = cache.get(ck);
  if (hit) return hit;
  const url = renderIcon(key, variant);
  cache.set(ck, url);
  return url;
}

function setup() {
  rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const d = new THREE.DirectionalLight(0xfff4e0, 2.4); d.position.set(-2, 4, 3); scene.add(d);
  const d2 = new THREE.DirectionalLight(0x9ab0ff, 0.8); d2.position.set(3, 1, -2); scene.add(d2);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
}

/** Icon of a furniture/prop model (used for container tabs) */
export function objIcon(key: string): string {
  const ck = 'obj:' + key;
  const hit = cache.get(ck);
  if (hit) return hit;
  const url = renderIcon(key, 'obj');
  cache.set(ck, url);
  return url;
}

function renderIcon(key: string, variant: string): string {
  const g = variant === 'obj' ? buildObjGeometry(key) : itemGeometry(key);
  if (g && !g.boundingBox) g.computeBoundingBox();
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  if (!g || !G?.pr) {
    ctx.fillStyle = '#6a604a'; ctx.fillRect(12, 12, 16, 16);
    return canvas.toDataURL();
  }
  if (!rt) setup();
  const r = G.pr.renderer;
  const mesh = new THREE.Mesh(g, worldMaterial({ noVis: true, noFog: true }));
  const bb = g.boundingBox!;
  const center = new THREE.Vector3(); bb.getCenter(center);
  const size = new THREE.Vector3(); bb.getSize(size);
  mesh.position.copy(center).multiplyScalar(-1);
  const holder = new THREE.Group(); holder.add(mesh);
  scene!.add(holder);
  // isometric-ish view
  const rad = Math.max(size.x, size.y, size.z) * 0.62 + 0.01;
  cam!.left = -rad; cam!.right = rad; cam!.top = rad; cam!.bottom = -rad;
  cam!.position.set(rad * 3, rad * 2.6, rad * 3);
  cam!.lookAt(0, 0, 0);
  cam!.near = 0.001; cam!.far = rad * 20;
  cam!.updateProjectionMatrix();
  // neutralise world-only uniforms during the icon pass
  const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value };
  U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0;
  const prevTarget = r.getRenderTarget();
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, true);
  r.render(scene!, cam!);
  const px = new Uint8Array(SIZE * SIZE * 4);
  r.readRenderTargetPixels(rt!, 0, 0, SIZE, SIZE, px);
  r.setRenderTarget(prevTarget);
  U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs;
  scene!.remove(holder);
  // flip Y, linear->sRGB, add 1px dark outline
  const img = ctx.createImageData(SIZE, SIZE);
  const toS = (v: number) => { v /= 255; v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE) ? 0 : px[((SIZE - 1 - y) * SIZE + x) * 4 + 3];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const si = ((SIZE - 1 - y) * SIZE + x) * 4, di = (y * SIZE + x) * 4;
    if (px[si + 3] > 10) {
      img.data[di] = toS(px[si]); img.data[di + 1] = toS(px[si + 1]); img.data[di + 2] = toS(px[si + 2]); img.data[di + 3] = 255;
    } else if (alpha(x + 1, y) > 10 || alpha(x - 1, y) > 10 || alpha(x, y + 1) > 10 || alpha(x, y - 1) > 10) {
      img.data[di] = 18; img.data[di + 1] = 14; img.data[di + 2] = 8; img.data[di + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  void itemDef;
  return canvas.toDataURL();
}

export function clearIconCache() { cache.clear(); }
