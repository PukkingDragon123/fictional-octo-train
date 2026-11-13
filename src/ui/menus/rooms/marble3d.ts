// The talent marbles as real glass: a thin shell that reflects the room's lamps
// (sharp highlights, a fresnel rim, a fake sky caught in the curve) round what
// is poured inside: cat's-eye vanes, helix ribbons, an opaque onionskin core,
// agate bands, smoke, frost cracks, a hollow void, wobbling jelly; trapped air
// bubbles, metallic flecks that glint as it turns, and a tiny figure set in the
// glass (a gear, a moth, an eye, a coin, a bone...). Every marble is seeded by
// its key, so the same marble always has the same swirl.
//   const m = buildMarble(MARBLE.get('lens')!, 0.016);  scene.add(m.group);  m.update(t, dt, spin)
import * as THREE from 'three';
import type { Marble, MarbleLook, Inclusion } from '../../../survival/talents';

function rngOf(key: string) { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const col = (c: number) => new THREE.Color(c);

// ------------------------------------------------------------------ the glass
const glassMats = new Map<string, THREE.MeshPhongMaterial>();
function glassMat(look: MarbleLook): THREE.MeshPhongMaterial {
  const k = look.glass + ':' + look.cloud.toFixed(2);
  let m = glassMats.get(k);
  if (m) return m;
  m = new THREE.MeshPhongMaterial({ color: look.glass, specular: 0xffffff, shininess: 160, transparent: true, opacity: 0.1 + look.cloud * 0.72, depthWrite: false });
  const cloud = look.cloud;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        vec3 vd = normalize(vViewPosition);
        vec3 nn = normalize(normal);
        float fr = pow(1.0 - clamp(abs(dot(nn, vd)), 0.0, 1.0), 2.4);
        vec3 rf = reflect(-vd, nn);
        // a bright sky above, a window glint up and to the left, a floor bounce below
        float sky = smoothstep(0.15, 0.95, rf.y) * 0.32;
        float win = pow(max(dot(rf, normalize(vec3(-0.45, 0.62, 0.64))), 0.0), 42.0) * 2.2;
        float flo = smoothstep(-0.2, -0.9, rf.y) * 0.08;
        outgoingLight += (sky + flo) * mix(vec3(1.0), diffuseColor.rgb, 0.35) + win * vec3(1.0, 0.98, 0.94) + fr * mix(diffuseColor.rgb, vec3(1.0), 0.45) * 0.55;
        diffuseColor.a = clamp(diffuseColor.a + fr * ${(0.55 - cloud * 0.3).toFixed(2)} + win * 0.6 + sky * 0.35, 0.0, 1.0);
      }
      #include <opaque_fragment>`);
  };
  glassMats.set(k, m);
  return m;
}

// ------------------------------------------------------------------ canvas skins for the cores (equirectangular)
function skin(w: number, h: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void, r: () => number): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c, r);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 2;
  return t;
}
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
/** onionskin: streaks running pole to pole, wavering */
function onionTex(colors: number[], r: () => number) {
  return skin(128, 64, (c) => {
    c.fillStyle = hex(colors[1] ?? colors[0]); c.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 46; i++) {
      const x0 = r() * 128, w = 1 + r() * 4, ph = r() * 6, amp = 2 + r() * 6;
      c.fillStyle = hex(colors[i % colors.length]); c.globalAlpha = 0.55 + r() * 0.45;
      for (let y = 0; y < 64; y++) c.fillRect(x0 + Math.sin(y * 0.1 + ph) * amp, y, w, 1);
    }
    c.globalAlpha = 1;
  }, r);
}
/** agate / clay bands: wavy horizontal layers */
function bandTex(colors: number[], r: () => number) {
  return skin(128, 64, (c) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x += 2) {
      const v = y + Math.sin(x * 0.098 + y * 0.05) * 5 + Math.sin(x * 0.049 * 3 + 1.7) * 3;
      const k = Math.floor(Math.abs(v) / 5) % colors.length;
      c.fillStyle = hex(colors[k]); c.fillRect(x, y, 2, 1);
    }
    for (let i = 0; i < 120; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'; c.fillRect(r() * 128, r() * 64, 1 + r() * 3, 1); }
  }, r);
}
/** smoke: soft wisps with holes (alpha) */
function smokeTex(color: number, r: () => number) {
  return skin(128, 64, (c) => {
    c.clearRect(0, 0, 128, 64);
    for (let i = 0; i < 26; i++) {
      const x = r() * 128, y = 8 + r() * 48, rr = 6 + r() * 16;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      const cc = col(color);
      g.addColorStop(0, `rgba(${(cc.r * 255) | 0},${(cc.g * 255) | 0},${(cc.b * 255) | 0},${0.35 + r() * 0.35})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      // wrap the edge so the seam does not show
      c.fillRect(x - rr - 128, y - rr, rr * 2, rr * 2); c.fillRect(x - rr + 128, y - rr, rr * 2, rr * 2);
    }
  }, r);
}

// ------------------------------------------------------------------ swirl geometry
/** cat's-eye vanes: curved, twisted petals through the middle */
function vanes(R: number, colors: number[], r: () => number): THREE.Mesh {
  const n = Math.max(3, Math.min(5, colors.length > 2 ? colors.length : 3 + Math.floor(r() * 2)));
  const pos: number[] = [], cols: number[] = [], idx: number[] = [];
  const U = 14, V = 5, tw = 1.2 + r() * 1.4;
  for (let p = 0; p < n; p++) {
    const a0 = (p / n) * Math.PI * 2 + r() * 0.3, cc = col(colors[p % colors.length]);
    const base = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const u = (i / U) * 2 - 1, y = u * R * 0.78, rr = Math.sqrt(Math.max(0, 1 - u * u)) * R * 0.74;
      const a = a0 + tw * u;
      for (let j = 0; j <= V; j++) {
        const v = j / V, rad = rr * Math.pow(v, 0.9), cup = Math.sin(v * Math.PI) * R * 0.06;
        pos.push(Math.cos(a) * rad - Math.sin(a) * cup, y, Math.sin(a) * rad + Math.cos(a) * cup);
        const k = 0.75 + v * 0.35; cols.push(cc.r * k, cc.g * k, cc.b * k);
      }
    }
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) { const a = base + i * (V + 1) + j, b = a + V + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.05, emissive: col(colors[0]).multiplyScalar(0.12) }));
}
/** helix ribbons wound round inside the glass */
function ribbons(R: number, colors: number[], r: () => number): THREE.Mesh {
  const n = Math.min(3, colors.length), pos: number[] = [], cols: number[] = [], idx: number[] = [];
  const S = 90, turns = 1.6 + r() * 1.2;
  for (let k = 0; k < n; k++) {
    const cc = col(colors[k]), ph = (k / n) * Math.PI * 2, base = pos.length / 3, rad = R * (0.66 - k * 0.07), wid = R * (0.16 - k * 0.03);
    for (let i = 0; i <= S; i++) {
      const t = i / S, y = (t * 2 - 1) * rad * 0.92, rr = Math.sqrt(Math.max(0, rad * rad - y * y)), a = ph + t * turns * Math.PI * 2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      // the ribbon's width runs along the meridian
      const ny = rr / rad, nr = -y / rad;
      for (const s of [-1, 1]) { pos.push(x + Math.cos(a) * nr * wid * 0.5 * s, y + ny * wid * 0.5 * s, z + Math.sin(a) * nr * wid * 0.5 * s); cols.push(cc.r, cc.g, cc.b); }
    }
    for (let i = 0; i < S; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.25, metalness: colors[0] === 0xd8dce0 ? 0.85 : 0.1, emissive: col(colors[0]).multiplyScalar(0.1) }));
}
/** frost cracks: thin shards at every angle */
function cracks(R: number, colors: number[], r: () => number): THREE.Mesh {
  const pos: number[] = [], cols: number[] = [];
  for (let i = 0; i < 26; i++) {
    const c0 = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(R * 0.9);
    const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), bx = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().cross(ax).normalize();
    const s = R * (0.25 + r() * 0.35), cc = col(colors[i % colors.length]);
    const p0 = c0.clone().addScaledVector(ax, s), p1 = c0.clone().addScaledVector(ax, -s * 0.6).addScaledVector(bx, s * 0.5), p2 = c0.clone().addScaledVector(bx, -s * 0.7);
    for (const p of [p0, p1, p2]) { const q = p.length() > R * 0.9 ? p.setLength(R * 0.9) : p; pos.push(q.x, q.y, q.z); cols.push(cc.r, cc.g, cc.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75, depthWrite: false, emissive: col(colors[0]).multiplyScalar(0.25) }));
}

// ------------------------------------------------------------------ the little figures (sulphides)
function inclusion(kind: Inclusion, s: number, color: number): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: kind === 'gear' || kind === 'coin' || kind === 'key' || kind === 'rivet' ? 0.75 : 0.05, side: THREE.DoubleSide });
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, m: THREE.Material = mat) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  switch (kind) {
    case 'gear': {
      const sh = new THREE.Shape(); const T = 10;
      for (let i = 0; i < T * 2; i++) { const a = (i / (T * 2)) * Math.PI * 2, rr = i % 2 ? s * 0.78 : s; const a2 = a + Math.PI / (T * 2); if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); sh.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr); }
      const hole = new THREE.Path(); hole.absarc(0, 0, s * 0.28, 0, Math.PI * 2, true); sh.holes.push(hole);
      add(new THREE.ExtrudeGeometry(sh, { depth: s * 0.22, bevelEnabled: false, curveSegments: 6 }), 0, 0, -s * 0.11);
      break;
    }
    case 'moth': {
      const wm = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
      add(new THREE.CapsuleGeometry(s * 0.12, s * 0.7, 3, 6), 0, 0, 0, new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 }));
      for (const sx of [-1, 1]) for (const [y, w, h] of [[s * 0.12, s * 0.75, s * 0.5], [-s * 0.25, s * 0.5, s * 0.36]] as [number, number, number][]) {
        const wg = new THREE.CircleGeometry(1, 12); wg.scale(w, h, 1);
        const o = add(wg, sx * w * 0.9, y, 0, wm); o.rotation.y = sx * 0.35;
      }
      for (const sx of [-1, 1]) { const ant = add(new THREE.CylinderGeometry(s * 0.015, s * 0.015, s * 0.45, 3), sx * s * 0.1, s * 0.6, 0); ant.rotation.z = -sx * 0.5; }
      break;
    }
    case 'eye': {
      add(new THREE.SphereGeometry(s * 0.72, 20, 14), 0, 0, 0, new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 0.2 }));
      const iris = add(new THREE.CircleGeometry(s * 0.36, 20), 0, 0, s * 0.715, new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: col(color).multiplyScalar(0.25) }));
      void iris;
      add(new THREE.CircleGeometry(s * 0.16, 16), 0, 0, s * 0.72, new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 }));
      // red veins
      for (let i = 0; i < 5; i++) { const a = i * 1.3; const v = add(new THREE.CylinderGeometry(s * 0.012, s * 0.012, s * 0.5, 3), Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, s * 0.42, new THREE.MeshBasicMaterial({ color: 0xc83a3a })); v.rotation.z = a + Math.PI / 2; v.rotation.x = 0.6; }
      break;
    }
    case 'crescent': {
      const sh = new THREE.Shape(); sh.absarc(0, 0, s, 0.3 * Math.PI, 1.7 * Math.PI, false); sh.absarc(s * 0.38, 0, s * 0.78, 1.62 * Math.PI, 0.38 * Math.PI, true);
      add(new THREE.ExtrudeGeometry(sh, { depth: s * 0.2, bevelEnabled: false, curveSegments: 12 }), 0, 0, -s * 0.1, new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: col(color).multiplyScalar(0.35) }));
      break;
    }
    case 'bone': {
      add(new THREE.CylinderGeometry(s * 0.14, s * 0.14, s * 1.3, 6));
      for (const y of [-1, 1]) for (const x of [-1, 1]) add(new THREE.SphereGeometry(s * 0.22, 8, 6), x * s * 0.16, y * s * 0.68, 0);
      g.rotation.z = 0.7;
      break;
    }
    case 'tooth': add(new THREE.LatheGeometry([0, 0.3, 0.42, 0.45, 0.4, 0.2, 0].map((rr, i) => new THREE.Vector2(rr * s, (i / 6) * s * 1.5 - s * 0.75)), 10)); break;
    case 'key': {
      add(new THREE.TorusGeometry(s * 0.35, s * 0.09, 6, 14), 0, s * 0.55, 0);
      add(new THREE.BoxGeometry(s * 0.14, s * 1.0, s * 0.1), 0, -s * 0.2, 0);
      add(new THREE.BoxGeometry(s * 0.3, s * 0.12, s * 0.1), s * 0.15, -s * 0.6, 0); add(new THREE.BoxGeometry(s * 0.22, s * 0.12, s * 0.1), s * 0.11, -s * 0.38, 0);
      break;
    }
    case 'cross': {
      const m2 = new THREE.MeshStandardMaterial({ color: 0xf8f4ee, roughness: 0.5 });
      add(new THREE.BoxGeometry(s * 1.3, s * 0.4, s * 0.16), 0, 0, 0, m2); add(new THREE.BoxGeometry(s * 0.4, s * 1.3, s * 0.16), 0, 0, 0, m2);
      add(new THREE.BoxGeometry(s * 1.0, s * 0.18, s * 0.17), 0, 0, 0); add(new THREE.BoxGeometry(s * 0.18, s * 1.0, s * 0.17), 0, 0, 0);
      break;
    }
    case 'feather': { const fg = new THREE.CircleGeometry(1, 14); fg.scale(s * 0.3, s, 1); add(fg); add(new THREE.CylinderGeometry(s * 0.02, s * 0.02, s * 2.1, 3)); break; }
    case 'drop': add(new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return new THREE.Vector2(Math.sin(t * Math.PI) * (1 - t * 0.55) * s * 0.6, (t - 0.5) * s * 1.6 * -1); }), 12), 0, 0, 0, new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, emissive: col(color).multiplyScalar(0.3) })); break;
    case 'coin': {
      const c = add(new THREE.CylinderGeometry(s * 0.8, s * 0.8, s * 0.14, 20)); c.rotation.x = Math.PI / 2;
      const rim = add(new THREE.TorusGeometry(s * 0.72, s * 0.05, 4, 20), 0, 0, s * 0.07); void rim;
      break;
    }
    case 'rivet': { add(new THREE.SphereGeometry(s * 0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, s * 0.1, 0); add(new THREE.CylinderGeometry(s * 0.22, s * 0.22, s * 0.9, 8), 0, -s * 0.35, 0); break; }
  }
  return g;
}

// ------------------------------------------------------------------ the marble
export interface Marble3D {
  key: string;
  group: THREE.Group;
  /** the glass shell (the pointer's target) */
  shell: THREE.Mesh;
  /** what turns inside */
  core: THREE.Group;
  R: number;
  update(t: number, dt: number, spin?: number): void;
  setLocked(on: boolean): void;
}
export function buildMarble(m: Marble, R = 0.016): Marble3D {
  const r = rngOf(m.key);
  const L = m.look;
  const group = new THREE.Group(); group.name = 'marble:' + m.key;
  const core = new THREE.Group();
  group.add(core);
  let jelly: THREE.Mesh | null = null;
  switch (L.swirl) {
    case 'vane': core.add(vanes(R, L.colors, r)); break;
    case 'ribbon': core.add(ribbons(R, L.colors, r)); break;
    case 'onion': core.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.72, 24, 16), new THREE.MeshStandardMaterial({ map: onionTex(L.colors, r), roughness: 0.4 }))); break;
    case 'banded': core.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.93, 28, 18), new THREE.MeshStandardMaterial({ map: bandTex(L.colors, r), roughness: 0.3, metalness: 0.05 }))); break;
    case 'smoke':
      for (let i = 0; i < 3; i++) {
        const sm = new THREE.Mesh(new THREE.SphereGeometry(R * (0.82 - i * 0.18), 20, 14), new THREE.MeshStandardMaterial({ map: smokeTex(L.colors[i % L.colors.length], r), transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide }));
        sm.rotation.set(r() * 3, r() * 3, r() * 3); core.add(sm);
      }
      break;
    case 'crack': core.add(cracks(R, L.colors, r)); break;
    case 'void': {
      core.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 18, 12), new THREE.MeshBasicMaterial({ color: 0x020202 })));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, R * 0.06, 6, 28), new THREE.MeshStandardMaterial({ color: L.colors[1] ?? 0x8a5a2a, roughness: 0.4, emissive: col(L.colors[1] ?? 0x8a5a2a).multiplyScalar(0.2) }));
      ring.rotation.x = 1.2; core.add(ring);
      break;
    }
    case 'jelly': {
      jelly = new THREE.Mesh(new THREE.SphereGeometry(R * 0.8, 20, 14), new THREE.MeshStandardMaterial({ color: L.colors[0], transparent: true, opacity: 0.6, roughness: 0.15, emissive: col(L.colors[1] ?? L.colors[0]).multiplyScalar(0.25), depthWrite: false }));
      core.add(jelly);
      break;
    }
    case 'fleck': {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, 16, 12), new THREE.MeshStandardMaterial({ color: L.colors[0], transparent: true, opacity: 0.35, depthWrite: false, emissive: col(L.colors[0]).multiplyScalar(0.3) }));
      core.add(halo);
      break;
    }
  }
  // the little figure, set in the middle (slightly off, the way the glass took it)
  if (L.inc) {
    const f = inclusion(L.inc, R * (L.inc === 'eye' ? 0.5 : 0.42), L.incColor ?? 0xffffff);
    f.position.set((r() - 0.5) * R * 0.1, (r() - 0.5) * R * 0.1, (r() - 0.5) * R * 0.1);
    f.rotation.y += (r() - 0.5) * 0.6;
    core.add(f);
  }
  // trapped air
  if (L.bubbles) {
    const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 200, transparent: true, opacity: 0.55, depthWrite: false }), L.bubbles);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < L.bubbles; i++) {
      v.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(R * (0.3 + r() * 0.6));
      const k = R * (0.02 + r() * 0.05); s.set(k, k, k);
      bm.setMatrixAt(i, mt.compose(v, q, s));
    }
    bm.userData.noGlow = true;
    core.add(bm);
  }
  // metal flecks (they catch the lamps as it turns)
  if (L.flecks) {
    const fm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: L.fleckColor ?? 0xffe0a0, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide, emissive: col(L.fleckColor ?? 0xffe0a0).multiplyScalar(0.15) }), L.flecks);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < L.flecks; i++) {
      v.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(R * Math.pow(r(), 0.5) * 0.85);
      e.set(r() * 6, r() * 6, r() * 6); q.setFromEuler(e);
      const k = R * (0.035 + r() * 0.05); s.set(k, k * (0.6 + r() * 0.6), k);
      fm.setMatrixAt(i, mt.compose(v, q, s));
    }
    core.add(fm);
  }
  // the glass itself, drawn after what is inside it
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 30, 22), glassMat(L));
  shell.renderOrder = 6; shell.name = 'shell';
  shell.userData.noGlow = true;
  group.add(shell);
  core.traverse((o) => { (o as THREE.Mesh).renderOrder = 5; o.userData.noGlow = true; });
  core.rotation.set(r() * 6, r() * 6, r() * 6);
  // a locked marble sits dull under a film of dust
  const dust = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 16, 12), new THREE.MeshStandardMaterial({ color: 0x5a5448, roughness: 1, transparent: true, opacity: 0.86, depthWrite: true }));
  dust.visible = false; dust.renderOrder = 7; group.add(dust);
  const w0 = r() * 6;
  return {
    key: m.key, group, shell, core, R,
    update(t, dt, spin = 0) {
      if (spin) core.rotation.y += dt * spin;
      if (jelly) { const k = 1 + Math.sin(t * 7 + w0) * 0.05; jelly.scale.set(k, 2 - k, k); }
    },
    setLocked(on) { dust.visible = on; },
  };
}
