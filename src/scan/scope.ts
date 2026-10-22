// The Phosphor Scope: what a scan looks like in your hands. A cream bakelite
// handheld with a little green tube (src/gfx/crt.ts: curved glass, scanlines,
// bloom), a needle meter and a card slot. It comes up in the corner while you
// sweep (the target's signature traced on the tube, the needle climbing), and
// when the sample is in it types a punch card and feeds it out of the slot:
// what it was, the DATA, the research it paid. In the world: amber brackets
// lock on the target and a faint beam joins you to it.
import * as THREE from 'three';
import { G } from '../game/G';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpBlend } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { crtScreen, phosphorText, type CrtScreen } from '../gfx/crt';
import { PixTex, PAL, flatMat } from './pix';
import { rbox, capsule } from './shapes';
import { StageArms } from './arms';
import { Screen } from '../ui/font5x7';

const CARD_W = 96, CARD_H = 52;
const ease = (k: number) => 1 - Math.pow(1 - k, 3);
const GREEN = '#9dffb5', DIM = 'rgba(110,220,140,0.45)';

export interface ScopeTarget { title: string; cls: string; known: boolean; kind: string }

export class Scope {
  private g: THREE.Group;
  private dev = new THREE.Group();
  private tube: CrtScreen;
  private meter = new PixTex(40, 22, 3);
  private card = new PixTex(CARD_W, CARD_H, 3);
  private needle: THREE.Mesh;
  private cardMesh: THREE.Mesh;
  private lamp: THREE.Mesh;
  private raise = 0;
  private want = false;
  private t: ScopeTarget | null = null;
  private prog = 0;
  private cardT = -1;
  private drawT = 0;
  private owns = false;
  private arms: StageArms;
  private tw = new THREE.Vector3();
  // world marks
  private bracket: THREE.Sprite;
  private beam: THREE.Line;
  private beamPos = new Float32Array(6);

  constructor() {
    this.g = fpGroup('scope');
    this.g.add(new THREE.AmbientLight(0xc8c0b0, 0.7));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.2); key.position.set(-0.4, 0.8, 1); this.g.add(key);
    this.g.add(this.dev);
    this.arms = new StageArms(this.g);
    this.arms.right.root.visible = false;
    const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
    // body: cream bakelite with a brown belly band, chrome trim and a carrying handle
    const mb = new ModelBuilder();
    rbox(mb, 0, -0.15, 0, 0.13, 0.15, 0.04, 'plastic_beige', { color: 0xe2d4b4 }, 0.014, 3);
    rbox(mb, 0, -0.132, 0, 0.134, 0.03, 0.044, 'plastic_beige', { color: 0x5a3a22 }, 0.01, 2);
    rbox(mb, 0, -0.004, 0, 0.12, 0.008, 0.042, 'chrome', {}, 0.003, 2);
    rbox(mb, 0.0, 0.002, 0.0, 0.07, 0.004, 0.01, 'metal_dark', {}, 0.0015, 1); // card slot
    rbox(mb, -0.022, -0.096, 0.016, 0.088, 0.072, 0.012, 'chrome', {}, 0.008, 2); // tube bezel
    rbox(mb, -0.022, -0.092, 0.022, 0.078, 0.064, 0.004, 'plastic_black', {}, 0.006, 2);
    rbox(mb, 0.042, -0.042, 0.018, 0.038, 0.026, 0.008, 'metal_dark', {}, 0.004, 2); // meter housing
    for (const [x, y] of [[0.045, -0.095], [0.045, -0.118]]) { mb.push().translate(x, y, 0.021).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.008, 0.01, 8, 'plastic_black'); mb.pop(); }
    capsule(mb, [0.025, -0.124, 0.022], [0.025, -0.112, 0.028], 0.0022, 'chrome', {}, 6); // toggle
    rbox(mb, -0.068, -0.13, 0, 0.012, 0.12, 0.03, 'rubber_black', {}, 0.005, 2); // grip strap
    for (const x of [-0.05, 0.05]) capsule(mb, [x, 0.0, 0], [x, 0.028, 0], 0.004, 'chrome', {}, 6);
    capsule(mb, [-0.05, 0.034, 0], [0.05, 0.034, 0], 0.007, 'leather_black', {}, 8); // handle
    this.dev.add(new THREE.Mesh(mb.build(), mat));
    // the tube
    this.tube = crtScreen(0.072, 0.056, { res: [216, 168], tint: 0x9cffb0, curvature: 0.24, glow: 1.0, noise: 0.05 });
    this.tube.mesh.position.set(-0.022, -0.061, 0.0262); this.dev.add(this.tube.mesh);
    // the meter
    const met = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.018), flatMat(this.meter.tex));
    met.position.set(0.042, -0.028, 0.0245); this.dev.add(met);
    this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.014, 0.0005), new THREE.MeshBasicMaterial({ color: 0x1a1008 }));
    this.needle.geometry.translate(0, 0.007, 0);
    this.needle.position.set(0.042, -0.036, 0.0252); this.dev.add(this.needle);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5a2a10 }));
    this.lamp.position.set(0.055, -0.124, 0.025); this.dev.add(this.lamp);
    // the punch card that feeds out of the slot
    this.cardMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.052), flatMat(this.card.tex));
    this.cardMesh.visible = false; this.dev.add(this.cardMesh);
    this.drawMeter();
    // world: the bracket sprite and the beam
    const br = new PixTex(32, 32, 1);
    const a = Screen.c(PAL.amber), d = Screen.c(PAL.amberDk);
    for (const [x, y, sx, sy] of [[1, 1, 1, 1], [30, 1, -1, 1], [1, 30, 1, -1], [30, 30, -1, -1]] as const) for (let k = 0; k < 8; k++) { br.s.px(x + sx * k, y, a); br.s.px(x, y + sy * k, a); br.s.px(x + sx * k, y + sy, d); br.s.px(x + sx, y + sy * k, d); }
    br.tex.magFilter = THREE.NearestFilter; br.tex.minFilter = THREE.NearestFilter; br.tex.generateMipmaps = false;
    br.flush();
    this.bracket = new THREE.Sprite(new THREE.SpriteMaterial({ map: br.tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    this.bracket.renderOrder = 998; this.bracket.visible = false; G.pr.scene.add(this.bracket);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(this.beamPos, 3));
    this.beam = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: PAL.amber, transparent: true, opacity: 0.5, depthTest: false, fog: false }));
    this.beam.renderOrder = 997; this.beam.frustumCulled = false; this.beam.visible = false; G.pr.scene.add(this.beam);
  }

  /** a sweep started / continues */
  sweep(t: ScopeTarget, prog: number) {
    this.t = t; this.prog = prog; this.want = true;
    if (!this.owns) { this.owns = fpOwner() === 'scope' || fpClaim('scope', 1, { cinematic: 'glance' }); if (this.owns) this.tube.power(true); }
  }
  /** the sweep ended without a result */
  drop() { if (this.cardT < 0) this.want = false; this.bracket.visible = false; this.beam.visible = false; }
  /** a finished scan: type the card, feed it out */
  result(r: { title: string; kind: string; data: number; rp: number; first: boolean; total: number }) {
    const c = this.card;
    c.reset();
    c.paper(0, 0, CARD_W, CARD_H, PAL.card, r.data + r.title.length);
    // punched columns down the left: a code for the kind
    const code = [...(r.kind + r.title)].map((ch) => ch.charCodeAt(0));
    for (let col = 0; col < 6; col++) for (let row = 0; row < 6; row++) if ((code[col % code.length] >> row) & 1) c.hole(3 + col * 3, 5 + row * 7, 2, 4);
    c.s.hline(24, CARD_W - 3, 13, Screen.c(PAL.inkRed));
    c.typed(r.first ? 'NEW SPECIMEN' : 'RE-SAMPLE', 24, 3, r.first ? PAL.inkRed : PAL.ink, 8, CARD_W - 27);
    c.typed(r.title.toUpperCase(), 24, 15, PAL.ink, 8, CARD_W - 27);
    c.typed(r.kind, 24, 24, PAL.inkBlue, 7, CARD_W - 27);
    c.typed(`DATA +${r.data}`, 24, 33, PAL.ink, 8, CARD_W - 27);
    if (r.rp) c.pen(`+${r.rp} R.P.!`, 24, 41, PAL.inkRed, 10);
    else c.typed(`TOTAL ${r.total}`, 24, 42, PAL.ink, 7, CARD_W - 27);
    c.flush();
    this.cardT = 0; this.want = true; this.prog = 1;
    if (!this.owns) { this.owns = fpOwner() === 'scope' || fpClaim('scope', 1, { cinematic: 'glance' }); if (this.owns) this.tube.power(true); }
    this.bracket.visible = false; this.beam.visible = false;
  }

  /** world marks for the target being swept */
  mark(x: number, y: number, z: number, size: number, from: { x: number; y: number; z: number } | null) {
    const pulse = 1 + Math.sin(G.time * 9) * 0.06;
    this.bracket.position.set(x, y, z);
    this.bracket.scale.set(size * pulse, size * pulse, 1);
    this.bracket.visible = true;
    if (from) {
      this.beamPos.set([from.x, from.y, from.z, x, y, z]);
      this.beam.geometry.attributes.position.needsUpdate = true;
      (this.beam.material as THREE.LineBasicMaterial).opacity = 0.25 + Math.abs(Math.sin(G.time * 14)) * 0.35;
      this.beam.visible = true;
    }
  }

  update(dt: number) {
    if (this.cardT >= 0) {
      this.cardT += dt;
      if (this.cardT > 3.2) { this.cardT = -1; this.want = false; }
    }
    // the device rides up from below the frame
    const target = this.want ? 1 : 0;
    this.raise += (target - this.raise) * Math.min(1, dt * 9);
    if (this.raise < 0.01 && !this.want) {
      if (this.owns) { fpRelease('scope'); this.owns = false; this.tube.power(false, true); }
      return;
    }
    if (!this.owns) return;
    const k = ease(Math.min(1, this.raise, Math.max(fpBlend(), this.want ? 0 : 1)));
    const bob = G.local && G.local.speed > 0.2 ? Math.sin(G.time * 7) * 0.003 : 0;
    this.dev.position.set(-0.115, -0.035 - (1 - k) * 0.25 + bob, -0.5);
    this.dev.rotation.set(-0.12 + (1 - k) * 0.6, 0.28, 0.05);
    // held in the left hand by its strap
    this.dev.updateMatrixWorld(true);
    this.arms.aim('left', 'grip', 'grip', this.dev.localToWorld(this.tw.set(-0.072, -0.075, 0.004)), [-0.36, -0.46, -0.36], [1, 0.15, 0.25]);
    this.arms.left.update(dt);
    // needle: signal strength rides the progress, with a nervous flutter
    const v = Math.min(1, this.prog) * 0.85 + (this.cardT < 0 && this.want ? Math.sin(G.time * 23) * 0.04 : 0);
    this.needle.rotation.z = 0.9 - v * 1.8;
    (this.lamp.material as THREE.MeshBasicMaterial).color.setHex(this.prog >= 1 || (this.want && Math.sin(G.time * 12) > 0) ? 0xffa040 : 0x4a2a10);
    // the card feeds out of the slot, hangs a moment, then is torn off
    if (this.cardT >= 0) {
      const f = Math.min(1, this.cardT / 0.6), out = this.cardT > 2.6 ? (this.cardT - 2.6) / 0.6 : 0;
      this.cardMesh.visible = true;
      this.cardMesh.position.set(-0.004 + out * 0.12, 0.005 + ease(f) * 0.03 + out * 0.06, 0.004);
      this.cardMesh.rotation.set(0, 0, out * 0.6);
    } else this.cardMesh.visible = false;
    this.drawT -= dt;
    if (this.drawT <= 0) { this.drawT = 1 / 12; this.drawTube(); }
  }

  /** the tube: a rotating sweep, the target's trace sharpening as the sample comes in */
  private drawTube() {
    const { ctx, canvas } = this.tube, W = canvas.width, H = canvas.height, t = this.t, tm = G.time;
    ctx.fillStyle = '#020803'; ctx.fillRect(0, 0, W, H);
    if (!t) { this.tube.flush(); return; }
    const cx = W / 2, cy = H * 0.56, r = H * 0.3, q = Math.min(1, this.prog);
    ctx.strokeStyle = DIM; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    const a = tm * 4;
    ctx.strokeStyle = GREEN; ctx.lineWidth = 2.5; ctx.shadowColor = GREEN; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const u = (i / 48) * Math.PI * 2, n = Math.sin(u * 5 + tm * 2) * (1 - q) * 9 + Math.sin(u * 3) * 4;
      const x = cx + Math.cos(u) * (r * 0.45 + n), y = cy + Math.sin(u) * (r * 0.36 + n * 0.6);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    const title = this.cardT >= 0 ? 'SAMPLED' : t.known ? t.title.toUpperCase() : 'UNKNOWN SIGNATURE';
    phosphorText(ctx, title.length > 18 ? title.slice(0, 17) + '…' : title, cx, 8, { size: 17, align: 'center' });
    // progress along the bottom
    ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.strokeRect(24, H - 20, W - 48, 10);
    ctx.fillStyle = GREEN; ctx.fillRect(27, H - 17, (W - 54) * q, 4);
    this.tube.flush();
  }

  private drawMeter() {
    const p = this.meter, s = p.s;
    p.reset(0xe8dcb8);
    for (let i = 0; i <= 10; i++) { const a = -0.9 + (i / 10) * 1.8, x = 20 + Math.sin(a) * 16, y = 20 - Math.cos(a) * 16; s.px(x, y, Screen.c(i > 7 ? PAL.inkRed : PAL.ink)); if (i % 5 === 0) s.px(x, y + 1, Screen.c(PAL.ink)); }
    p.sign('SIG', 20, 11, PAL.ink, 6, { align: 'center' });
    p.flush();
  }
}
