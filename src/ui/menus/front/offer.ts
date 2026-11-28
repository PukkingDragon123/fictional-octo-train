// THE OFFER (round 26): a new game's opening. Letterboxed, slow, in the rain: Dr. Iris Calder (HumanRig, the
// guide's own rig, guide/researcher.ts) in her office in the closed wing, by a window striped with the light
// through broken blinds. She turns from the glass and offers the unit the wing: run down, written off, theirs to
// restore and run. The lines go to the subtitle strip (introKit/subs.ts, the intake's own), no bubbles. The
// contract slides across the desk; the unit signs it by hand: press on the paper and write across the line, the
// pen following, the ink going down where it is drawn. Then the paper is taken, and the black comes up.
//   const room = new OfferRoom(mats); stage.add(room); stage.show('offer')
//   await runOffer({ room, root, rayAt })     resolves once signed (and the screen is black)
import * as THREE from 'three';
import type { StageRoom, Hot, Grade } from '../monitor/stage';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, jitter, tube } from '../scene/facet';
import { Dust, leakCards } from '../scene/fx';
import { Dresser } from '../rooms/dress';
import { rainGlass, easeIO, damp, type RainGlass } from './kit';
import { createGuideRig, type GuideRig } from '../guide/researcher';
import { Subs } from '../../../game/introKit/subs';
import { emblemCanvas } from '../../brand/logo';
import { sfx, sample, ambience } from '../sfx';
import '../../../game/intro.css';

const W = 2.6, D = 2.6, H = 3.0;
interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

export class OfferRoom implements StageRoom {
  id = 'offer';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.03, 40);
  hots: Hot[] = [];
  grade: Grade = {
    exposure: 1.7, lift: [0.9, 0.93, 1.0], gain: [1.07, 1.0, 0.9], vig: 0.6, sat: 1.0, contrast: 1.26, side: [1, 0, 0.05, 0.35],
    haze: 0.2, hazeColor: 0x4a4038, ao: 1.0, aoRad: 0.45, scatter: 0.65, bounce: 0.34,
    shafts: [new THREE.Vector3(-0.4, 1.9, -D - 0.2), new THREE.Vector3(0.35, 1.25, -0.55)], shaftK: 0.5, shaftColor: 0xb0c4ff,
  };
  calder: GuideRig | null = null;
  /** the contract on the desk and its ink canvas */
  paper: THREE.Mesh;
  pen = new THREE.Group();
  private ink: CanvasRenderingContext2D;
  private inkTex: THREE.CanvasTexture;
  private glass: RainGlass;
  private winLight = new THREE.SpotLight(0x8aa8ff, 13, 12, 0.55, 0.5, 1.4);
  private lamp = new THREE.SpotLight(0xffc070, 3.2, 4, 0.8, 0.8, 1.8);
  private lampFill = new THREE.PointLight(0xffb870, 1.4, 4, 2);
  private roomFill = new THREE.PointLight(0xffd8b0, 2.5, 9, 1.5);
  private pendant = new THREE.PointLight(0xffb870, 3.4, 6, 1.6);
  private sconce = new THREE.PointLight(0xffa860, 7, 4.5, 1.7);
  private wallFill = new THREE.PointLight(0xffd0a0, 6, 5, 1.6);
  private hemi = new THREE.HemisphereLight(0x8a92a8, 0x3a2a18, 0.75);
  private leak: ReturnType<typeof leakCards>;
  private dust = new Dust(220, new THREE.Box3(new THREE.Vector3(-W + 0.2, 0.2, -D + 0.2), new THREE.Vector3(W - 0.2, H - 0.3, D - 0.3)));
  private dress: Dresser;
  private cur: Pose = { pos: new THREE.Vector3(1.9, 1.7, 2.6), look: new THREE.Vector3(-0.6, 1.5, -1.8), fov: 40 };
  private flight: { from: Pose; to: Pose; t: number; dur: number; res: () => void } | null = null;
  private flash = 0; private nextFlash = 6; private thunderAt = -1;
  /** Calder's turn from the window (0 = facing the glass, 1 = facing the unit) and her walk to the desk */
  turn = 0; turnTo = 0; walkTo: THREE.Vector3 | null = null;
  talking = false;
  /** the paper's slide across the desk (0 her side, 1 in front of the unit) and the take-away at the end */
  slide = 0; slideTo = 0;
  private penRest = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private t = 0;

  constructor(private mats: FMats) {
    const S = this.scene;
    S.background = new THREE.Color(0x040507);
    this.dress = new Dresser(mats);
    this.glass = rainGlass(2.4, 1.6, { seed: 4.2, bright: 0.9 });
    this.room();
    const pc = document.createElement('canvas'); pc.width = 420; pc.height = 560;
    this.ink = pc.getContext('2d')!;
    this.drawContract();
    this.inkTex = new THREE.CanvasTexture(pc);
    this.inkTex.colorSpace = THREE.SRGBColorSpace; this.inkTex.anisotropy = 4;
    const pg = new THREE.PlaneGeometry(0.21, 0.28, 4, 4);
    const pp = pg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.pow(Math.abs(pp.getX(i)) / 0.105, 3) * 0.003);
    pg.computeVertexNormals();
    this.paper = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: this.inkTex, color: 0xa29d92, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    this.paper.rotation.x = -Math.PI / 2;
    this.paper.receiveShadow = true;
    this.paper.userData.noGlow = true;
    S.add(this.paper);
    this.buildPen();
    this.leak = leakCards(this.blindGaps(), new THREE.Vector3(0.12, -0.75, 1), 2.6);
    this.leak.u.uInt.value = 0.022;
    S.add(this.leak.mesh);
    this.winLight.position.set(-0.4, 2.4, -D - 1.6); this.winLight.target.position.set(0.2, 0.6, 0.4);
    this.winLight.castShadow = true; this.winLight.shadow.mapSize.set(1024, 1024); this.winLight.shadow.bias = -0.0008;
    this.lamp.position.set(0.42, 1.03, -0.62); this.lamp.target.position.set(0.3, 0.78, -0.7);
    this.lamp.castShadow = true; this.lamp.shadow.mapSize.set(1024, 1024); this.lamp.shadow.bias = -0.0006;
    this.lampFill.position.set(0.4, 1.15, -0.5);
    this.roomFill.position.set(0.6, H - 0.4, 0.8);
    this.pendant.position.set(-0.75, H - 1.12, 0.35); this.pendant.castShadow = true; this.pendant.shadow.mapSize.set(512, 512); this.pendant.shadow.bias = -0.002;
    this.sconce.position.set(W - 0.25, 1.9, -0.6);
    S.add(this.pendant, this.sconce);
    this.wallFill.position.set(-2.1, 2.1, 0.6);
    S.add(this.roomFill, this.wallFill);
    S.add(this.winLight, this.winLight.target, this.lamp, this.lamp.target, this.lampFill, this.hemi, this.dust.points);
    S.add(this.dress.done());
    this.setSlide(0);
  }
  /** the guide's rig (async: the humans worker's model when there is one) */
  private loading: Promise<void> | null = null;
  load(): Promise<void> { return (this.loading ??= this.loadRig()); }
  private async loadRig() {
    try {
      const r = await createGuideRig();
      this.calder = r;
      r.root.position.set(0.02, 0, -2.0);
      r.root.rotation.y = Math.PI;
      r.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.scene.add(r.root);
    } catch (e) { console.warn('offer: no Calder rig', e); }
  }

  // ------------------------------------------------------------------ the office
  private room() {
    const b = new FacetBuilder();
    b.add('wood', cbox(W * 2, 0.1, D * 2, 0.01), 0x5a4430, at(0, -0.05, 0), { rep: 0.4, grain: 'z' });
    b.add('sponge', jitter(cbox(2.6, 0.015, 2.0, 0.004), 0.004, 3), 0x5a2a22, at(0.1, 0.008, -0.2));
    // walls: dark panelling to the dado, a sick green paint above, peeling
    for (const [m, len] of [[at(-W - 0.06, 0, 0), D * 2], [at(W + 0.06, 0, 0), D * 2], [at(0, 0, D + 0.06, 0, Math.PI / 2, 0), W * 2]] as [THREE.Matrix4, number][]) {
      b.add('wood', cbox(0.12, 1.1, len, 0.01), 0x4a3424, new THREE.Matrix4().multiplyMatrices(m, at(0, 0.55, 0)), { grain: 'y' });
      b.add('paint', cbox(0.12, H - 1.1, len, 0.01), 0x6a7458, new THREE.Matrix4().multiplyMatrices(m, at(0, 1.1 + (H - 1.1) / 2, 0)), { ao: 2 });
    }
    // the window wall: a wide window behind her desk, its sill, its frame
    const wz = -D - 0.06, wy0 = 1.0, wy1 = 2.6, wx = 1.2;
    b.add('wood', cbox(W * 2, wy0, 0.12, 0.01), 0x4a3424, at(0, wy0 / 2, wz));
    b.add('paint', cbox(W * 2, H - wy1, 0.12, 0.01), 0x6a7458, at(0, wy1 + (H - wy1) / 2, wz));
    for (const s of [-1, 1]) b.add('paint', cbox(W - wx, wy1 - wy0, 0.12, 0.01), 0x6a7458, at(s * (W + wx) / 2, (wy0 + wy1) / 2, wz));
    b.add('paint', cbox(0.06, wy1 - wy0, 0.08, 0.01), 0x2e3428, at(0, (wy0 + wy1) / 2, wz + 0.02));
    b.add('wood', cbox(wx * 2 + 0.2, 0.05, 0.3, 0.01), 0x6a5038, at(0, wy0, wz + 0.12));
    this.glass.mesh.position.set(0, (wy0 + wy1) / 2, wz - 0.02);
    this.scene.add(this.glass.mesh);
    // the blinds: slats, some hanging askew, the cord
    for (let i = 0; i < 22; i++) {
      const y = wy1 - 0.05 - i * 0.068;
      if (y < wy0 + 0.35 && i % 2) continue;
      const tilt = i > 15 ? 0.4 + (i - 15) * 0.1 : 0.55;
      const sk = i === 9 ? 0.25 : i === 12 ? -0.15 : 0;
      b.add('enamel', cbox(wx * 2 - 0.05, 0.006, 0.05, 0.002), 0xd8d0b8, at(0, y, wz + 0.09, tilt, 0, sk));
    }
    b.add('rubber', prism(0.003, 1.4, 4), 0xd8d0b8, at(wx - 0.1, 2.0, wz + 0.12));
    // ceiling, a dead trough, a stain
    b.add('concrete', cbox(W * 2 + 0.3, 0.15, D * 2 + 0.3, 0.01), 0x6a6862, at(0, H + 0.07, 0));
    b.add('rubber', prism(0.006, 1.0, 4), 0x2a2420, at(-0.75, H - 0.5, 0.35));
    b.add('paint', lathe([[0.03, 0], [0.06, -0.03], [0.17, -0.1], [0.22, -0.16]], 12), 0x2e5a3a, at(-0.75, H - 1.0, 0.35), { rep: 0.2 });
    b.add('enamel', lathe([[0.21, -0.158], [0.16, -0.104], [0.055, -0.034], [0.028, -0.004]], 12), 0xf0e8d0, at(-0.75, H - 1.0, 0.35));
    b.add('lamp', lathe([[0, 0], [0.03, -0.02], [0.034, -0.06], [0, -0.075]], 8), 0xfff0c8, at(-0.75, H - 1.06, 0.35));
    b.add('brass', cbox(0.08, 0.14, 0.04, 0.01), 0xffffff, at(W - 0.03, 1.85, -0.6));
    b.add('wood', lathe([[0.06, 0], [0.11, -0.2], [0, -0.2]], 8).scale(1, -1, 1), 0xe8d4a8, at(W - 0.14, 1.93, -0.6));
    b.add('lamp', lathe([[0, 0], [0.04, 0.02], [0, 0.06]], 6), 0xffe0a8, at(W - 0.14, 1.87, -0.6));
    // her desk: oak, a leather top, drawers; the banker's lamp, files, a telephone, an ashtray, a framed photo face down
    const dz = -0.55;
    b.add('wood', cbox(1.7, 0.06, 0.85, 0.012), 0x6a4426, at(0, 0.76, dz), { grain: 'x' });
    b.add('leather', cbox(1.2, 0.006, 0.55, 0.002), 0x2a4a3a, at(-0.05, 0.792, dz + 0.05));
    for (const s of [-1, 1]) b.add('wood', cbox(0.5, 0.72, 0.8, 0.012), 0x5a3a20, at(s * 0.58, 0.36, dz));
    b.add('wood', cbox(0.7, 0.6, 0.04, 0.01), 0x4a3018, at(0, 0.42, dz - 0.36));
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.add('brass', cbox(0.08, 0.016, 0.02, 0.004), 0xffffff, at(s * 0.58, 0.62 - i * 0.22, dz + 0.41));
    b.add('brass', lathe([[0, 0], [0.09, 0], [0.09, 0.02], [0.02, 0.04], [0.015, 0.32], [0, 0.32]], 10), 0xffffff, at(0.42, 0.79, dz - 0.15));
    b.add('glass', lathe([[0, 0], [0.12, 0], [0.13, 0.04], [0.06, 0.09], [0, 0.1]], 10), 0x2a8a4a, at(0.42, 1.05, dz - 0.07, 0, 0, 0));
    b.add('paint', cbox(0.26, 0.05, 0.11, 0.02), 0x1e5a32, at(0.42, 1.1, dz - 0.07));
    b.add('lamp', cbox(0.2, 0.01, 0.06, 0.004), 0xa89060, at(0.42, 1.075, dz - 0.07));
    for (let i = 0; i < 5; i++) b.add('wood', cbox(0.24, 0.025, 0.32, 0.004), [0xc8b07a, 0xd8c08a, 0xa89060][i % 3], at(-0.55, 0.8 + i * 0.026, dz - 0.15, 0, (i - 2) * 0.06, 0));
    b.add('bakelite', cbox(0.2, 0.08, 0.16, 0.03), 0xffffff, at(-0.25, 0.83, dz - 0.25, 0, 0.3, 0));
    b.add('bakelite', cbox(0.22, 0.04, 0.05, 0.02), 0xffffff, at(-0.25, 0.9, dz - 0.25, 0, 0.3, 0));
    b.add('chrome', lathe([[0, 0], [0.06, 0], [0.065, 0.02], [0, 0.015]], 8), 0xffffff, at(0.65, 0.79, dz + 0.2));
    b.add('wood', cbox(0.14, 0.012, 0.18, 0.004), 0x3a2a18, at(-0.65, 0.795, dz + 0.22, 0, 0.5, 0));
    // her chair, pushed back; a filing cabinet, a coat stand with her umbrella, boxes, a dead plant
    b.add('leather', cbox(0.55, 0.1, 0.5, 0.04), 0x3a2418, at(-0.85, 0.5, dz - 0.8, 0, 0.7, 0));
    b.add('leather', cbox(0.55, 0.7, 0.1, 0.04), 0x3a2418, at(-0.98, 0.95, dz - 1.0, 0, 0.7, 0));
    b.add('chrome', prism(0.025, 0.45, 6), 0x9a9ea2, at(-0.85, 0.25, dz - 0.8));
    b.add('wood', prism(0.025, 1.8, 6), 0x4a3018, at(1.9, 0.9, -1.9));
    b.add('sponge', jitter(cbox(0.4, 0.9, 0.2, 0.06, 0.2), 0.02, 3), 0x2a2a30, at(1.9, 1.3, -1.8));
    b.add('rubber', tube([[1.75, 0.0, -1.75], [1.8, 0.8, -1.82]], 0.02, 2, 6, false), 0x1a1a1a);
    b.add('rubber', lathe([[0, 0], [0.16, 0], [0.2, 0.36], [0, 0.36]], 8), 0x6a4a34, at(-2.1, 0, 1.8));
    for (let i = 0; i < 5; i++) b.add('wood', prism(0.01, 0.5, 4), 0x5a4a30, at(-2.1 + Math.sin(i) * 0.06, 0.6, 1.8 + Math.cos(i) * 0.06, Math.sin(i * 2) * 0.4, 0, Math.cos(i * 3) * 0.5));
    this.scene.add(b.build(this.mats));
    this.dress.filing(at(-W + 0.35, 0, -1.2, 0, Math.PI / 2, 0), { open: 1, seed: 7, color: 0x5a6656 });
    this.dress.boxes(at(-W + 0.3, 0, 0.4, 0, Math.PI / 2 + 0.2, 0), 3, { seed: 13 });
    this.dress.streaks(at(0, 2.9, -D + 0.01), 2.4, 0.9, 0.5);
    this.dress.clock(at(W - 0.01, 2.2, 0.5, 0, -Math.PI / 2, 0), 0.16);
    // the Institute's crest, framed on the right wall
    const cc = emblemCanvas(64);
    const ct = new THREE.CanvasTexture(cc); ct.magFilter = ct.minFilter = THREE.NearestFilter; ct.generateMipmaps = false; ct.colorSpace = THREE.SRGBColorSpace;
    const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: ct, transparent: true, alphaTest: 0.5, roughness: 0.5 }));
    crest.position.set(W - 0.005, 1.75, -1.2); crest.rotation.y = -Math.PI / 2;
    this.scene.add(crest);
  }
  private blindGaps(): [THREE.Vector3, THREE.Vector3][] {
    const out: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < 18; i += 1) { const y = 2.55 - i * 0.068 - 0.03; if (i === 9 || i === 12) continue; out.push([new THREE.Vector3(-1.1, y, -D + 0.02), new THREE.Vector3(1.1, y, -D + 0.02)]); }
    return out;
  }
  private buildPen() {
    const b = new FacetBuilder();
    // a fountain pen: black resin body, brass bands and clip, a steel nib; its tip at the origin, the body along +Y
    b.add('chrome', lathe([[0, 0], [0.003, 0.004], [0.0045, 0.018], [0, 0.02]], 6), 0xe0e0d8);
    b.add('bakelite', lathe([[0.004, 0.016], [0.0055, 0.03], [0.0058, 0.1], [0.005, 0.12], [0, 0.125]], 10), 0x18161a);
    b.add('brass', lathe([[0.006, 0], [0.0062, 0], [0.0062, 0.004], [0.006, 0.004]], 10), 0xffffff, at(0, 0.03, 0));
    b.add('brass', lathe([[0.0061, 0], [0.0063, 0], [0.0063, 0.003], [0.0061, 0.003]], 10), 0xffffff, at(0, 0.098, 0));
    b.add('brass', cbox(0.002, 0.045, 0.003, 0.0008), 0xffffff, at(0.0065, 0.08, 0));
    this.pen.add(b.build(this.mats));
    this.pen.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    this.scene.add(this.pen);
  }
  /** the contract: the Institute's head, four clauses, the line to sign on */
  private drawContract() {
    const c = this.ink, Wc = 420, Hc = 560;
    c.fillStyle = '#ece4cf'; c.fillRect(0, 0, Wc, Hc);
    let s = 3;
    const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 9000; i++) { c.fillStyle = R() < 0.5 ? 'rgba(120,96,60,0.08)' : 'rgba(255,255,245,0.12)'; c.fillRect(R() * Wc, R() * Hc, 1, 1); }
    // a coffee ring and a fold
    c.strokeStyle = 'rgba(110,70,30,0.16)'; c.lineWidth = 5; c.beginPath(); c.arc(330, 470, 34, 0.3, 5.6); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, Hc / 2, Wc, 2);
    c.drawImage(emblemCanvas(32), Wc / 2 - 32, 22, 64, 64);
    c.fillStyle = '#23242a'; c.textAlign = 'center';
    c.font = '16px Alagard, serif';
    c.fillText('MERIDIAN INSTITUTE OF LIMINALITY', Wc / 2, 110);
    c.font = '16px Alagard, serif';
    c.fillText('Deed of custody  ·  Wing C', Wc / 2, 134);
    c.fillRect(60, 146, Wc - 120, 1);
    c.textAlign = 'left';
    const clauses = ['I. The Institute grants the Operator custody', '   of Wing C, and all that remains in it.', 'II. The Operator restores the wing at the', '   Operator\'s own expense and risk.', 'III. What is restored remains the Institute\'s.', '   Its use is the Operator\'s.', 'IV. The Institute is not answerable for', '   what the Operator finds in it.'];
    clauses.forEach((l, i) => { c.fillStyle = '#2a2b32'; c.fillText(l, 36, 180 + i * 26); });
    for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(42,43,50,0.45)'; for (let x = 36; x < Wc - 40 - (i === 3 ? 120 : 0); x += 6 + Math.floor(R() * 5)) c.fillRect(x, 400 + i * 14, 3 + Math.floor(R() * 5), 2); }
    c.fillStyle = '#2a2b32'; c.fillRect(60, 508, 230, 1);
    c.font = '16px Alagard, serif'; c.fillText('x', 44, 505);
  }

  // ------------------------------------------------------------------ the paper and the pen
  /** the paper's place on the desk: her side (0) to the unit's (1) */
  private setSlide(k: number) {
    const e = easeIO(k);
    this.paper.position.set(THREE.MathUtils.lerp(-0.25, 0.02, e), 0.799, THREE.MathUtils.lerp(-0.75, -0.2, e));
    this.paper.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.lerp(0.8, -0.06, e));
    // the pen lies beside the paper
    this.penRest.compose(new THREE.Vector3(0.2, 0.806, -0.16), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.06, 0, -0.5 + Math.PI)), new THREE.Vector3(1, 1, 1));
  }
  /** ink a stroke between two paper-uv points */
  inkStroke(a: THREE.Vector2, b: THREE.Vector2) {
    const c = this.ink;
    c.strokeStyle = '#141c3a'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 2.2 + Math.random() * 0.8;
    c.beginPath(); c.moveTo(a.x * 420, (1 - a.y) * 560); c.lineTo(b.x * 420, (1 - b.y) * 560); c.stroke();
    this.inkTex.needsUpdate = true;
  }
  /** where the pen's tip is (world), and whether it is down on the paper (null: lying at rest) */
  penAt: THREE.Vector3 | null = null; penDown = false;

  // ------------------------------------------------------------------ the camera
  shot(pos: THREE.Vector3, look: THREE.Vector3, fov: number, ms: number): Promise<void> {
    this.flight?.res();
    if (ms <= 0) { this.cur.pos.copy(pos); this.cur.look.copy(look); this.cur.fov = fov; this.flight = null; return Promise.resolve(); }
    return new Promise((res) => { this.flight = { from: { pos: this.cur.pos.clone(), look: this.cur.look.clone(), fov: this.cur.fov }, to: { pos: pos.clone(), look: look.clone(), fov }, t: 0, dur: ms / 1000, res }; });
  }
  strike(k = 1) { this.flash = Math.max(this.flash, k); this.thunderAt = 1.0 + Math.random() * 1.2; }
  frame(aspect: number, portrait: boolean) {
    const c = this.cam;
    c.aspect = aspect; c.fov = this.cur.fov * (portrait ? 1.45 : 1); c.updateProjectionMatrix();
  }

  update(dt: number, t: number, full: boolean) {
    this.t += dt;
    const fl = this.flight;
    if (fl) {
      fl.t += dt;
      const e = easeIO(fl.t / fl.dur);
      this.cur.pos.lerpVectors(fl.from.pos, fl.to.pos, e); this.cur.look.lerpVectors(fl.from.look, fl.to.look, e);
      this.cur.fov = THREE.MathUtils.lerp(fl.from.fov, fl.to.fov, e);
      if (fl.t >= fl.dur) { this.flight = null; fl.res(); }
    }
    // a held camera: it breathes
    const tt = this.t;
    this.cam.position.copy(this.cur.pos).add(this.v.set(Math.sin(tt * 0.37) * 0.008, Math.sin(tt * 0.51) * 0.006, 0));
    this.cam.lookAt(this.cur.look);
    this.cam.rotateZ(Math.sin(tt * 0.29) * 0.004);
    // Calder: her turn from the window, her steps to the desk
    const r = this.calder;
    if (r) {
      this.turn = damp(this.turn, this.turnTo, 1.6, dt);
      let speed = 0;
      if (this.walkTo) {
        const p = r.root.position, d = this.v.copy(this.walkTo).sub(p); d.y = 0;
        const dist = d.length();
        if (dist > 0.02) { speed = Math.min(0.7, dist * 1.6 + 0.15); p.addScaledVector(d.normalize(), Math.min(dist, speed * dt)); } else this.walkTo = null;
      }
      r.root.rotation.y = THREE.MathUtils.lerp(Math.PI, 0.25, easeIO(this.turn));
      r.update(dt, { speed, look: this.turn > 0.5 ? this.cam.position : null, point: null, talking: this.talking });
    }
    // the paper's slide
    this.slide = damp(this.slide, this.slideTo, 2.4, dt);
    if (this.slideTo === 2) { this.paper.position.z -= dt * 0.25; this.paper.position.x -= dt * 0.15; this.paper.position.y = 0.8 + Math.max(0, this.slide - 1) * 0.2; }
    else this.setSlide(Math.min(1, this.slide));
    // the pen: at rest, or riding the pointer with its tip on the paper (lifted while it is not pressed)
    if (this.penAt) {
      this.pen.position.copy(this.penAt); this.pen.position.y += this.penDown ? 0.0 : 0.012;
      this.pen.rotation.set(-0.55, 0.3, -0.35);
    } else {
      this.pen.matrix.copy(this.penRest); this.pen.matrix.decompose(this.pen.position, this.pen.quaternion, this.pen.scale);
      this.pen.position.y += Math.max(0, Math.sin(tt * 2.4)) * 0.0;
    }
    // the storm
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) { this.strike(0.5 + Math.random() * 0.5); this.nextFlash = 12 + Math.random() * 14; }
    if (this.thunderAt > 0) { this.thunderAt -= dt; if (this.thunderAt <= 0) sample('leviathan_rumble', 0.5, 0.85); }
    const f = this.flash > 0.02 ? this.flash * (0.55 + 0.45 * Math.max(0, Math.sin(tt * 51))) : 0;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.winLight.intensity = 13 + f * 50;
    this.leak.u.uInt.value = 0.022 * (1 + f * 1.5);
    this.glass.u.uT.value = tt; this.glass.u.uFlash.value = f;
    this.lamp.intensity = 3.2 * (0.97 + 0.03 * Math.sin(tt * 31));
    if (full) { this.dress.update(t); this.dust.update(tt, this.winLight.position, this.v.copy(this.winLight.target.position).sub(this.winLight.position).normalize(), Math.cos(0.55), Math.cos(0.25), 40, new THREE.Color(0xc8d8ff), 0.12); }
  }
}

// ==================================================================== the sequence
export interface OfferHost {
  room: OfferRoom;
  /** where the cinematic's letterbox and lines go */
  root: HTMLElement;
  rayAt: (x: number, y: number) => THREE.Ray | null;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const LINES: [string, number][] = [
  ['Eleven years this wing has been closed.', 3.2],
  ['Power, water, the lot. Meridian wrote it off.', 3.4],
  ['They would rather not pay anyone to bring it back.', 3.4],
  ['So they are offering it to you.', 2.8],
  ['The rooms. The equipment. Whatever still works.', 3.4],
  ['Restore it, and the wing is yours to run.', 3.2],
  ['Sign, operator.', 2.0],
  ['Welcome to the Meridian Institute of Liminality.', 3.2],
];

export async function runOffer(h: OfferHost): Promise<void> {
  const R = h.room;
  await R.load();
  const el = document.createElement('div');
  el.className = 'ix-root of-root';
  el.innerHTML = '<div class="ix-shade of-shade"></div><div class="ix-bar top"></div><div class="ix-bar bot"></div>';
  h.root.append(el);
  const shade = el.querySelector('.of-shade') as HTMLElement;
  shade.style.transition = 'opacity 2.4s ease';
  const subs = new Subs(el);
  let raf = 0, last = performance.now();
  const loop = (now: number) => { raf = requestAnimationFrame(loop); subs.update(Math.min(0.1, (now - last) / 1000)); last = now; };
  raf = requestAnimationFrame(loop);
  const auto = !!navigator.webdriver && !/[?&]sign\b/.test(location.search);
  // Esc (or a second key) hurries the lines along
  let hurry = false;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { hurry = true; e.preventDefault(); e.stopPropagation(); } };
  window.addEventListener('keydown', onKey, true);
  const wait = (s: number) => new Promise<void>((res) => { const t0 = performance.now(); const tick = () => { if (hurry || performance.now() - t0 > s * 1000) res(); else setTimeout(tick, 50); }; tick(); });
  const say = async (i: number) => {
    hurry = false;
    const [text, dur] = LINES[i];
    R.talking = true;
    subs.show('Dr. Calder', text, { mute: true, hold: dur });
    await wait(dur + text.length * 0.035);
    R.talking = false;
    subs.clear();
    await wait(0.5);
  };
  ambience('hall');
  try {
    // 1: the black lifts on the office; she is at the window, her back to the unit
    shade.style.opacity = '1';
    await R.shot(V(1.75, 1.62, 2.45), V(-0.5, 1.45, -1.9), 38, 0);
    requestAnimationFrame(() => { el.classList.add('letterbox'); shade.style.opacity = '0'; });
    sample('dread_swell', 0.35);
    void R.shot(V(1.5, 1.6, 2.2), V(-0.25, 1.45, -1.9), 34, 9000);
    await wait(2.4);
    R.strike(0.8);
    await say(0);
    // 2: she turns from the glass
    R.turnTo = 1;
    void R.shot(V(0.35, 1.36, 1.3), V(-0.05, 1.42, -1.8), 30, 5200);
    await wait(1.2);
    await say(1);
    await say(2);
    // 3: she comes to the desk; the paper slides over
    R.walkTo = V(0.05, 0, -1.34);
    void R.shot(V(0.25, 1.34, 1.05), V(0.0, 1.2, -1.1), 36, 3600);
    await say(3);
    R.slideTo = 1; sample('paper', 0.5);
    await say(4);
    void R.shot(V(0.12, 1.3, 0.8), V(0.02, 1.42, -1.2), 30, 3000);
    await say(5);
    // 4: down to the paper; the unit signs it
    R.grade.exposure = 1.35;
    await R.shot(V(0.05, 1.2, 0.26), V(0.03, 0.8, -0.24), 36, 2200);
    await say(6);
    await sign(h, auto);
    // 5: she takes it; the welcome; the black comes up
    sample('paper', 0.6);
    R.slideTo = 2;
    R.grade.exposure = 1.5;
    void R.shot(V(0.3, 1.38, 1.1), V(0.02, 1.38, -1.3), 34, 2600);
    await wait(1.4);
    await say(7);
    shade.style.opacity = '1';
    await wait(2.4);
  } finally {
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
    subs.destroy();
    el.classList.remove('letterbox');
    setTimeout(() => el.remove(), 1200);
  }
}

/** the signature: press on the paper and write; the pen follows, the ink goes down; enough ink and it is signed */
function sign(h: OfferHost, auto: boolean): Promise<void> {
  const R = h.room;
  return new Promise((res) => {
    let inked = 0, down = false, lastUv: THREE.Vector2 | null = null, scratch = 0, done = false;
    const hit = (x: number, y: number) => {
      const ray = h.rayAt(x, y);
      if (!ray) return null;
      const rc = new THREE.Raycaster(ray.origin, ray.direction);
      const i = rc.intersectObject(R.paper, false)[0];
      if (i?.uv) return { p: i.point, uv: i.uv.clone() };
      // off the paper: the pen rides the desk top
      const p = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8), new THREE.Vector3());
      return p ? { p, uv: null } : null;
    };
    const move = (e: PointerEvent) => {
      const q = hit(e.clientX, e.clientY);
      if (!q) return;
      R.penAt = q.p; R.penDown = down && !!q.uv;
      if (down && q.uv) {
        if (lastUv) { const d = lastUv.distanceTo(q.uv); if (d > 0.002 && d < 0.2) { R.inkStroke(lastUv, q.uv); inked += d; scratch += d; if (scratch > 0.05) { scratch = 0; sample('dmg_scrape_soft', 0.25, 1.6); } } }
        lastUv = q.uv;
      } else lastUv = null;
    };
    const press = (e: PointerEvent) => { down = true; move(e); sfx('tick', 0.3); };
    const lift = () => { down = false; lastUv = null; R.penDown = false; if (inked > 0.55) finish(); };
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', press); window.removeEventListener('pointerup', lift);
      R.penAt = null; R.penDown = false;
      sample('paper', 0.5);
      setTimeout(res, 700);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerdown', press); window.addEventListener('pointerup', lift);
    // a scripted browser (and a hand that does nothing) gets a signature written for it
    const writeFor = () => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 60; i++) { const k = i / 60; pts.push(new THREE.Vector2(0.16 + k * 0.5, 0.1 + 0.035 * Math.sin(k * 19) + 0.02 * Math.sin(k * 7) + (k < 0.15 ? (0.15 - k) * 0.5 : 0))); }
      let i = 1;
      const step = () => {
        if (done) return;
        if (i >= pts.length) { finish(); return; }
        R.inkStroke(pts[i - 1], pts[i]);
        R.penAt = R.paper.localToWorld(new THREE.Vector3((pts[i].x - 0.5) * 0.21, (pts[i].y - 0.5) * 0.28, 0.002)); R.penDown = true;
        if (i % 6 === 0) sample('dmg_scrape_soft', 0.2, 1.6);
        i++; setTimeout(step, 28);
      };
      step();
    };
    if (auto) setTimeout(writeFor, 600);
    else setTimeout(() => { if (!done && inked < 0.05) writeFor(); }, 30000);
  });
}
