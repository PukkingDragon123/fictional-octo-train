// The suit scanner's sweep, in the world (round 14: the wrist watch is gone).
// While a scan runs (hold N, src/scan/scan.ts) a cone of cold Meridian light
// opens from the emitter on the unit's visor to the target, its scanlines
// streaming toward it; a bright band of light rides up and down the target
// like a photocopier's bar; and a graduated ring on the floor under it fills
// as the sample comes in. Lost signal (out of range, behind a wall of another
// zone) makes it all stutter and dim. The progress itself is on the action
// plate over the unit's head (src/ui/actionBar.ts via ScanSystem.plate()).
import * as THREE from 'three';
import { G } from '../game/G';

const ICE = new THREE.Color(0x9fe8ff), WARM = new THREE.Color(0xffd27a);

/** additive light that never writes depth (it should glow over the room, not hide it). The main pass draws
 *  into two targets (colour + the normal buffer, src/gfx/materials.ts): every shader writes both, the normal
 *  buffer left as it was (alpha 0 blends away) */
function lightMat(frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  frag = 'layout(location = 1) out highp vec4 gNormal;\n' + frag.replace(/\}\s*$/, '  gNormal = vec4(0.0);\n}\n');
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: frag,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
  });
}

/** a built-in material made safe for the two-target main pass */
export function mrtSafe<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => { sh.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\n' + sh.fragmentShader.replace(/\}\s*$/, '  gNormal = vec4(0.0);\n}\n'); };
  m.customProgramCacheKey = () => 'scan-mrt-' + m.type;
  return m;
}

const CONE_FRAG = /* glsl */`
uniform float uT, uShow, uProg, uLost; uniform vec3 uCol;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  // v runs 1 at the emitter to 0 at the target (CylinderGeometry uv)
  float along = 1.0 - vUv.y;
  float side = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(1.0 - side, 1.6);
  // scanlines streaming from the visor to the target, and a slow twist round the cone
  float lines = 0.55 + 0.45 * step(0.5, fract(along * 26.0 - uT * 3.2));
  float twist = 0.75 + 0.25 * sin(vUv.x * 37.7 + uT * 2.1 + along * 6.0);
  float a = (0.16 + 0.55 * edge) * lines * twist;
  a *= smoothstep(0.0, 0.08, along) * (0.55 + 0.45 * smoothstep(1.0, 0.25, along));
  // the frame stutters while the signal is lost
  float fr = floor(uT * 24.0);
  a *= mix(1.0, step(0.45, fract(sin(fr * 51.3) * 4375.85)) * 0.6, uLost);
  a *= uShow * (0.65 + 0.35 * uProg);
  gl_FragColor = vec4(uCol * a, a);
}`;

const BAND_FRAG = /* glsl */`
uniform float uT, uShow, uLost; uniform vec3 uCol;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  // a thin hot line in the middle of a soft halo, ticked like a ruler
  float d = abs(vUv.y - 0.5) * 2.0;
  float core = smoothstep(0.22, 0.0, d), halo = pow(1.0 - d, 2.2) * 0.45;
  float ticks = 0.7 + 0.3 * step(0.5, fract(vUv.x * 48.0 + uT * 0.6));
  float side = abs(dot(normalize(vN), normalize(vV)));
  float a = (core * 1.3 + halo) * ticks * (0.45 + 0.55 * (1.0 - side));
  float fr = floor(uT * 24.0);
  a *= mix(1.0, step(0.5, fract(sin(fr * 17.1) * 9137.3)) * 0.5, uLost);
  a *= uShow;
  gl_FragColor = vec4(uCol * a, a);
}`;

const RING_FRAG = /* glsl */`
uniform float uT, uShow, uProg; uniform vec3 uCol, uWarm;
varying vec2 vUv;
void main(){
  // RingGeometry: uv is the planar projection; work it back into angle and radius
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), ang = atan(p.y, p.x) / 6.28318 + 0.5;
  float band = smoothstep(0.80, 0.84, r) * smoothstep(1.0, 0.96, r);
  float inner = smoothstep(0.66, 0.68, r) * smoothstep(0.72, 0.70, r);
  // graduations: 60 small ticks, every fifth long
  float tk = step(0.82, fract(ang * 60.0)) * smoothstep(0.70, 0.72, r) * smoothstep(0.80, 0.78, r);
  float big = step(0.9, fract(ang * 12.0)) * smoothstep(0.62, 0.64, r) * smoothstep(0.80, 0.78, r);
  float filled = step(ang, uProg);
  vec3 col = mix(uCol * 0.35, mix(uCol, uWarm, step(0.999, uProg)), filled);
  float a = band * (0.3 + 0.7 * filled) + inner * 0.45 + (tk * 0.5 + big * 0.8) * (0.4 + 0.6 * filled);
  // a sweep hand going round
  float hand = smoothstep(0.03, 0.0, abs(fract(ang - uT * 0.35) - 0.5) - 0.47) * smoothstep(0.2, 0.3, r) * smoothstep(1.0, 0.9, r);
  a += hand * 0.25;
  a *= uShow;
  gl_FragColor = vec4(col * a, a);
}`;

export class ScanSweep {
  private root = new THREE.Group();
  private cone: THREE.Mesh;
  private band: THREE.Mesh;
  private ring: THREE.Mesh;
  private dot: THREE.Mesh;
  private U = { uT: { value: 0 }, uShow: { value: 0 }, uProg: { value: 0 }, uLost: { value: 0 }, uCol: { value: ICE.clone() }, uWarm: { value: WARM.clone() } };
  private show = 0;
  private want = false;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private size = 0.9;
  private height = 1.6;
  private ground = 0;
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const coneGeo = new THREE.CylinderGeometry(0.012, 1, 1, 40, 1, true);
    coneGeo.translate(0, -0.5, 0); // the tip (emitter) at the origin, the mouth down -Y
    this.cone = new THREE.Mesh(coneGeo, lightMat(CONE_FRAG, this.U));
    this.band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), lightMat(BAND_FRAG, this.U));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 96, 1), lightMat(RING_FRAG, this.U));
    this.ring.rotation.x = -Math.PI / 2;
    // the emitter's own small glint on the visor
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mrtSafe(new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    for (const m of [this.cone, this.band, this.ring, this.dot]) { m.frustumCulled = false; m.renderOrder = 19; this.root.add(m); }
    this.root.visible = false;
    G.pr.scene.add(this.root);
  }

  /** this frame: from the emitter to the target (size = its width, height = how tall the band rides) */
  aim(from: THREE.Vector3, to: { x: number; y: number; z: number }, size: number, height: number, ground: number, prog: number, lost: boolean) {
    this.want = true;
    this.from.copy(from); this.to.set(to.x, to.y, to.z);
    this.size = size; this.height = height; this.ground = ground;
    this.U.uProg.value = Math.max(0, Math.min(1, prog));
    this.U.uLost.value += ((lost ? 1 : 0) - this.U.uLost.value) * 0.2;
  }
  /** the sweep ended (done or dropped): it fades */
  drop() { this.want = false; }

  update(dt: number) {
    this.U.uT.value += dt;
    this.show += ((this.want ? 1 : 0) - this.show) * Math.min(1, dt * (this.want ? 10 : 6));
    this.want = false;
    if (this.show < 0.01) { this.root.visible = false; return; }
    this.root.visible = true;
    this.U.uShow.value = this.show;
    // the cone: tip at the visor, mouth round the target
    const d = this.v.subVectors(this.to, this.from);
    const len = Math.max(0.05, d.length());
    this.q.setFromUnitVectors(this.up, d.clone().normalize().negate());
    this.cone.position.copy(this.from);
    this.cone.quaternion.copy(this.q);
    const r = this.size * 0.55;
    this.cone.scale.set(r, len, r);
    this.dot.position.copy(this.from);
    this.dot.scale.setScalar(0.7 + Math.sin(this.U.uT.value * 18) * 0.15);
    // the band rides up and down the target's body
    const t = this.U.uT.value;
    const h = Math.max(0.25, this.height);
    const k = 0.5 + 0.5 * Math.sin(t * 2.6);
    this.band.position.set(this.to.x, this.ground + 0.04 + k * h, this.to.z);
    const br = this.size * 0.62 * (0.85 + 0.15 * Math.sin(k * Math.PI));
    this.band.scale.set(br, 0.07, br);
    // the ring on the floor, a little wider than the target
    this.ring.position.set(this.to.x, this.ground + 0.03, this.to.z);
    const rr = Math.max(0.45, this.size * 0.75);
    this.ring.scale.set(rr, rr, rr);
    this.ring.rotation.z = t * 0.2;
  }
}
