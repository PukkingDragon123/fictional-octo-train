// A small binary glTF (.glb) reader for the lab's converted props (public/props/lab, made with lowpix from
// Poly Haven's CC0 models). Every file is one mesh, one primitive (POSITION, NORMAL, TEXCOORD_0, indices) and one
// material whose base colour texture is packed inside the glb (PNG or JPEG), so this reads only that much of the
// format and needs no loader dependency. Each file is fetched and decoded once (cached); every placed copy shares
// the geometry and the material.
//   loadProp(url, low)  -> Promise<THREE.Mesh>  (a new mesh on the shared geometry / material)
import * as THREE from 'three';

interface Acc { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }
interface Gltf {
  accessors: Acc[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  materials?: { pbrMetallicRoughness?: { metallicFactor?: number; roughnessFactor?: number }; alphaMode?: string; doubleSided?: boolean }[];
  images?: { bufferView: number; mimeType: string }[];
  samplers?: { magFilter?: number }[];
}
const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

async function parse(buf: ArrayBuffer, low: boolean): Promise<{ geo: THREE.BufferGeometry; mat: THREE.Material }> {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const jsonLen = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as Gltf;
  const binAt = 20 + jsonLen + 8;
  const view = (i: number) => { const v = j.bufferViews[i]; return binAt + (v.byteOffset ?? 0); };
  const read = (ai: number) => {
    const a = j.accessors[ai], n = a.count * SIZE[a.type], off = view(a.bufferView) + (a.byteOffset ?? 0);
    // copy out (the views may not be aligned for a typed array on the whole buffer)
    const bytes = buf.slice(off, off + n * (a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1));
    const arr = a.componentType === 5126 ? new Float32Array(bytes) : a.componentType === 5125 ? new Uint32Array(bytes) : a.componentType === 5123 ? new Uint16Array(bytes) : new Uint8Array(bytes);
    return { arr, size: SIZE[a.type] };
  };
  const prim = j.meshes[0].primitives[0];
  const geo = new THREE.BufferGeometry();
  for (const [name, key] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv']] as const) {
    if (prim.attributes[name] === undefined) continue;
    const { arr, size } = read(prim.attributes[name]);
    geo.setAttribute(key, new THREE.BufferAttribute(arr, size));
  }
  if (prim.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(read(prim.indices).arr, 1));
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  // the texture
  let map: THREE.Texture | null = null;
  const img = j.images?.[0];
  if (img) {
    const v = j.bufferViews[img.bufferView];
    const blob = new Blob([new Uint8Array(buf, view(img.bufferView), v.byteLength)], { type: img.mimeType });
    const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions);
    map = new THREE.Texture(bmp as unknown as HTMLImageElement);
    map.flipY = false;
    map.colorSpace = THREE.SRGBColorSpace;
    const nearest = j.samplers?.[0]?.magFilter === 9728;
    map.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    map.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = !nearest;
    map.anisotropy = 4;
    map.needsUpdate = true;
  }
  const m = j.materials?.[prim.material ?? 0];
  const rough = m?.pbrMetallicRoughness?.roughnessFactor ?? 0.8, metal = m?.pbrMetallicRoughness?.metallicFactor ?? 0;
  const common = { map, side: m?.doubleSided ? THREE.DoubleSide : THREE.FrontSide, alphaTest: m?.alphaMode === 'MASK' ? 0.5 : 0 };
  // lit like the rooms' own kit (scene/pixtex.ts facetMats): standard on the full path, Lambert on the cheap one
  const mat = low ? new THREE.MeshLambertMaterial(common) : new THREE.MeshStandardMaterial({ ...common, roughness: rough, metalness: metal });
  return { geo, mat };
}

const cache = new Map<string, Promise<{ geo: THREE.BufferGeometry; mat: THREE.Material }>>();
/** a new mesh of the prop at `url` (fetched and decoded once) */
export async function loadProp(url: string, low = false): Promise<THREE.Mesh> {
  const key = url + (low ? '#low' : '');
  let p = cache.get(key);
  if (!p) {
    p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + url); return url.endsWith('.txt') ? r.text().then((t) => { const bin = atob(t.trim()); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }) : r.arrayBuffer(); }).then((b) => parse(b, low));
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  const { geo, mat } = await p;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
