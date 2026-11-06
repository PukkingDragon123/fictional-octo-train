// QUESTS AS A BROADCAST (round 12). J (the touch QUESTS button) puts Dr. Iris
// Calder's field broadcast up in front of you: no hands, no wrist. She stands
// on a small Meridian projector puck as cold phosphor light (the menu guide's
// own body, src/game/prologue/calder.ts, on a projection material of this
// file), unfolding from the lens up, and the board hangs in the air beside her
// as layered sheets of light at different depths: the list (ACTIVE / OFFERS /
// DONE), the open quest (brief, objectives with progress, reward and cost, what
// you can do), a LIVE strip along the top and her lower-third caption. It all
// sways a little with the pointer, scans in from the top, flickers at 24 fps
// and tears when the feed glitches. The world keeps running behind it (a
// 'glance' claim on the first-person overlay, src/fp/fp.ts).
//
// Keys: W/S or arrows pick, A/D (Tab, Q) change the channel, E / Enter accepts,
// pays or tracks, X declines (twice abandons a side quest), J / Esc closes.
// Mouse or touch: tap a row to pick it, tap the action to do it, tap outside
// to close; the wheel scrolls.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../../fp/fp';
import { atlas } from '../../gfx/atlas';
import { worldMaterial } from '../../gfx/materials';
import { calderRig } from '../../game/prologue/calder';
import type { Researcher } from '../../entities/researcher';
import type { QuestRuntime, QView } from '../../missions/questRuntime';
import { Plate, PLATE_T, backdrop, lightBlend } from './plate';
import { isTouchMode } from '../touch/mode';

type Tab = 'active' | 'offers' | 'done';
const TABS: Tab[] = ['active', 'offers', 'done'];
const TAB_NAME: Record<Tab, string> = { active: 'ACTIVE', offers: 'OFFERS', done: 'DONE' };
const D = 2.4;
// palette: Meridian projection light
const ICE = '#cfeeff', ICE_D = '#7fb4d4', ICE_DD = '#3f6a86', AMB = '#ffd27a', AMB_D = '#c8933a', OK = '#9ef0b4', BAD = '#ff8f7a';

// ---------------------------------------------------------------- her light
const HU = {
  uUnfold: { value: 0 }, uBase: { value: 0 }, uBright: { value: 1 },
  uTint: { value: new THREE.Color(0x74ccff) }, uWarm: { value: new THREE.Color(0xffa070) },
};
const HOLO_FRAG = /* glsl */`
{
  vec3 alb = diffuseColor.rgb;
  float lum = dot(alb, vec3(0.3, 0.59, 0.11));
  float warm = clamp((alb.r - alb.b) * 2.4 - 0.25, 0.0, 1.0);
  vec3 col = mix(uTint, uWarm, warm * 0.8) * (0.3 + lum * 1.35);
  vec3 vd = normalize(cameraPosition - vWPos);
  float rim = pow(1.0 - abs(dot(normalize(vWNormal), vd)), 2.0);
  col += uTint * rim * 0.7;
  float fr = floor(uT * 24.0);
  float scan = 0.6 + 0.4 * step(0.5, fract(gl_FragCoord.y * 0.5));
  float grain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233)) + fr * 1.618) * 43758.5453);
  float hum = 0.86 + 0.14 * sin(vWPos.y * 34.0 - uT * 2.6);
  col *= scan * hum * (0.84 + grain * 0.32) * (0.88 + 0.12 * fract(sin(fr * 91.7) * 43758.5));
  float cut = vWPos.y - (uBase + uUnfold);
  if (cut > 0.0) discard;
  col += uTint * smoothstep(-0.035, 0.0, cut) * 2.2 * step(uUnfold, 2.0);
  col *= uBright * 0.85;
  gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)) * 1.15, 0.0, 1.0));
}`;
/**
 * The base for her rig (HumanRig only takes a world material as its base: the cache key says so):
 * the world shader without the visibility mask, its lit colour thrown away and redrawn as light.
 * The rig's own material is switched to light blending once it is built.
 */
function holoMat(): THREE.Material {
  const world = worldMaterial({ outline: 0, noFog: true, noVis: true, noGrid: true }) as THREE.MeshLambertMaterial;
  const m = new THREE.MeshLambertMaterial({ map: atlas().texture, vertexColors: true });
  m.onBeforeCompile = (sh, r) => {
    world.onBeforeCompile(sh, r);
    Object.assign(sh.uniforms, HU, { uT: PLATE_T });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uT, uUnfold, uBase, uBright;\nuniform vec3 uTint, uWarm;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + HOLO_FRAG);
  };
  m.customProgramCacheKey = () => 'noclip:bcast1';
  return m;
}

/** the beam: an open cone, brightest at the lens, scanlined, breathing */
function beamMesh(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.3, 0.045, 1, 28, 6, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: PLATE_T, uShow: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uT, uShow; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float h = vUv.y; float side = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(1.0 - h, 1.7) * 0.55 * (0.35 + 0.65 * (1.0 - side));
        float fr = floor(uT * 24.0);
        a *= 0.8 + 0.2 * fract(sin(fr * 51.3) * 4375.85);
        a *= 0.75 + 0.25 * step(0.5, fract(gl_FragCoord.y * 0.5));
        a *= 0.7 + 0.3 * sin(vUv.x * 60.0 + uT * 1.5);
        a *= uShow;
        gl_FragColor = vec4(vec3(0.45, 0.8, 1.0) * a, a * 0.8);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  lightBlend(mat, true);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 18; m.frustumCulled = false;
  return m;
}

/** the projector puck she stands on: graphite body, knurled ring, amber status LEDs, the lens */
function projector(): { root: THREE.Group; lens: THREE.Mesh; leds: THREE.Mesh[]; ring: THREE.Mesh } {
  const root = new THREE.Group();
  const graph = new THREE.MeshLambertMaterial({ color: 0x2c3036 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x6a717a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 28), graph); body.position.y = 0.025;
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.165, 0.016, 28), steel); lip.position.y = 0.058;
  const knurl = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.008, 4, 40), steel); knurl.rotation.x = Math.PI / 2; knurl.position.y = 0.04;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshBasicMaterial({ color: 0x9fe6ff }));
  lens.rotation.x = -Math.PI / 2; lens.position.y = 0.067;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.11, 32), lightBlend(new THREE.MeshBasicMaterial({ color: 0x3a9ccc, opacity: 0.8 })));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.068;
  root.add(body, lip, knurl, lens, ring);
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 0.006), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    const a = Math.PI / 2 + (i - 1) * 0.16;
    l.position.set(Math.cos(a) * 0.186, 0.03, Math.sin(a) * 0.186); l.rotation.y = -a + Math.PI / 2;
    root.add(l); leds.push(l);
  }
  // a stencilled Meridian tick ring on the top face
  for (let i = 0; i < 24; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, i % 6 === 0 ? 0.022 : 0.012), steel);
    const a = (i / 24) * Math.PI * 2; t.position.set(Math.cos(a) * 0.135, 0.067, Math.sin(a) * 0.135); t.rotation.y = -a;
    root.add(t);
  }
  return { root, lens, leds, ring };
}

interface Hit { kind: 'tab' | 'row' | 'act' | 'decl' | 'close' | 'scroll'; i: number; x: number; y: number; w: number; h: number }

export class QuestBroadcast {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private root = new THREE.Group();
  private rig: Researcher | null = null;
  private beam!: THREE.Mesh;
  private puck!: ReturnType<typeof projector>;
  private back!: THREE.Mesh;
  private list!: Plate; private detail!: Plate; private head!: Plate; private cap!: Plate;
  private motes!: THREE.Points;
  private show = 0;
  private t = 0;
  private tab: Tab = 'active';
  private sel: Record<Tab, number> = { active: 0, offers: 0, done: 0 };
  private scroll = 0;
  private views: QView[] = [];
  private sig = '';
  private refreshT = 0;
  private hitsL: Hit[] = []; private hitsD: Hit[] = []; private hitsH: Hit[] = [];
  private hover = -1;
  private line = ''; private lineShown = ''; private lineT = 0;
  private readSel = ''; private dwell = 0;
  private glitchT = 0; private nextGlitch = 3;
  private detailIn = 1;
  private declArm = '';
  private declT = 0;
  private px = 0; private py = 0; private sx = 0; private sy = 0;
  private rc = new THREE.Raycaster();
  private tmpV = new THREE.Vector3();
  private closing = false;

  constructor() {
    (G as any).broadcast = this;
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => { this.px = e.clientX; this.py = e.clientY; if (this.open) this.onMove(); }, true);
    window.addEventListener('wheel', (e) => { if (!this.open) return; e.preventDefault(); e.stopPropagation(); this.pick(Math.sign(e.deltaY)); }, { capture: true, passive: false });
    bus.on('fpLost', (n: string) => { if (n === 'broadcast' && this.open) this.close(true); });
    G.addSystem({ name: 'broadcast', update: (dt: number) => this.frame(dt) });
    // built early and hidden, so the renderer's warm-up compiles its shaders before the first open
    setTimeout(() => { try { this.build(); } catch (e) { console.warn('prebuild', e); } }, 2500);
  }

  get quests(): QuestRuntime | null { return (G.missions?.quests as QuestRuntime | undefined) ?? null; }

  toggle(v?: boolean) { const want = v ?? !this.open; if (want) this.openUp(); else this.close(); }

  private openUp() {
    if (this.open) return;
    const p = G.local; const g: any = G;
    if (!p || p.body.dead || g.intro?.running) return;
    if (!this.quests) { bus.emit('think', p, 'No feed from the Institute here.'); return; }
    if (fpOwner() === 'watch') g.watch?.toggle?.(false);
    if (fpOwner() === 'self') { g.selfInspect?.close?.(true); fpRelease('self'); }
    if (fpOwner() && fpOwner() !== 'broadcast') return;
    this.build();
    if (!fpClaim('broadcast', 4, { cinematic: 'glance' })) return;
    this.open = true; this.closing = false;
    this.show = 0; this.t = 0; this.sig = ''; this.refreshT = 0;
    HU.uUnfold.value = 0;
    // start on whatever needs you: something to pay, new offers, else your active work
    const Q = this.quests!;
    const act = Q.list('active'), off = Q.list('offers');
    if (act.some((v) => v.status === 'ready')) { this.tab = 'active'; this.sel.active = act.findIndex((v) => v.status === 'ready'); }
    else if (!act.length && off.length) this.tab = 'offers';
    else if (Q.fresh.size && off.some((v) => Q.fresh.has(v.key))) { this.tab = 'offers'; this.sel.offers = Math.max(0, off.findIndex((v) => Q.fresh.has(v.key))); }
    else { this.tab = 'active'; const f = Q.focus(); this.sel.active = Math.max(0, act.findIndex((v) => v.key === f)); }
    this.say(act.some((v) => v.status === 'ready') ? 'One of yours is ready to settle. Pay it and I will release the reward.'
      : off.some((v) => Q.fresh.has(v.key)) ? 'New work came down the line. Have a look before somebody else takes it.'
        : act.length ? 'Your board, unit. Carry, find, scan. In that order, ideally.'
          : 'Nothing on the board. Enjoy it. It will not last.');
    this.readSel = this.cur()?.key ?? ''; this.dwell = -1.5;
    this.rig?.gesture('present', { dur: 2.2 });
    G.audio?.ui?.('static_burst', 0.35);
    G.audio?.ui?.('questChime', 0.3);
    G.hudBody?.setHidden?.('broadcast', true);
    G.missions?.set?.('watch:broadcast');
  }

  close(lost = false) {
    if (!this.open) return;
    this.open = false;
    this.closing = !lost;
    G.hudBody?.setHidden?.('broadcast', false);
    G.audio?.ui?.('watchTick', 0.4);
    if (lost) { this.closing = false; this.g.visible = false; }
  }

  // ================================================================ building
  private build() {
    if (this.built) return;
    this.built = true;
    const g = this.g = fpGroup('broadcast');
    g.add(this.root);
    g.add(new THREE.HemisphereLight(0xb8d8f0, 0x101418, 0.9));
    const key = new THREE.DirectionalLight(0x9fd8ff, 1.2); key.position.set(-0.4, 1.4, 0.6); g.add(key);
    this.back = backdrop(); this.back.position.z = -4.2; g.add(this.back);
    this.puck = projector(); this.root.add(this.puck.root);
    this.beam = beamMesh(); this.root.add(this.beam);
    try {
      const r = this.rig = calderRig(holoMat());
      lightBlend(r.material, true); r.material.needsUpdate = true;
      r.skin.castShadow = false; r.skin.receiveShadow = false;
      r.root.traverse((o) => { o.castShadow = false; o.receiveShadow = false; (o as THREE.Mesh).renderOrder = 20; o.frustumCulled = false; });
      this.root.add(r.root);
    } catch (e) { console.warn('broadcast: Calder', e); this.rig = null; }
    this.list = new Plate(168, 176); this.detail = new Plate(184, 196); this.head = new Plate(320, 16, { scan: 0.15 }); this.cap = new Plate(220, 34);
    for (const pl of [this.list, this.detail, this.head, this.cap]) this.root.add(pl.mesh);
    // dust in the beam
    const n = 26, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.3; pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, lightBlend(new THREE.PointsMaterial({ color: 0xa8e4ff, size: 2, sizeAttenuation: false, opacity: 0.7 })));
    this.motes.renderOrder = 19; this.motes.frustumCulled = false;
    this.root.add(this.motes);
  }

  /** place everything for the screen's shape */
  private layout() {
    const cam = fpCamera();
    const asp = cam.aspect;
    const hh = Math.tan((cam.fov * Math.PI) / 360) * D, hw = hh * asp;
    this.back.scale.set(hw * 2 * 1.9, hh * 2 * 1.9, 1);
    const wide = asp >= 1.15;
    // the plates: world width from the screen, texel resolution fixed
    const put = (pl: Plate, x: number, y: number, z: number, wWorld: number, ry: number, rx = 0) => {
      pl.scaleTo(wWorld / pl.w); pl.mesh.position.set(x, y, -D + z); pl.mesh.rotation.set(rx, ry, 0);
    };
    let fx: number, fy: number, s: number;
    if (wide) {
      fx = -0.7 * hw; fy = -0.5 * hh; s = Math.min(0.5, hh * 1.05 / 1.75);
      put(this.list, -0.13 * hw, 0.04 * hh, 0.05, 0.56 * hw, 0.14);
      put(this.detail, 0.5 * hw, 0.0, 0.18, 0.56 * hw, -0.2);
      put(this.head, 0.0, 0.84 * hh, 0.02, 1.56 * hw, 0, 0.05);
      put(this.cap, -0.12 * hw, -0.76 * hh, 0.25, 0.6 * hw, 0.1, -0.06);
    } else {
      fx = -0.55 * hw; fy = 0.22 * hh; s = Math.min(0.3, hh * 0.55 / 1.75);
      put(this.list, 0.3 * hw, 0.5 * hh, 0.05, 1.12 * hw, -0.1);
      put(this.detail, 0.02 * hw, -0.38 * hh, 0.18, 1.86 * hw, 0.04);
      put(this.head, 0, 0.93 * hh, 0.02, 1.9 * hw, 0, 0.05);
      put(this.cap, -0.42 * hw, 0.08 * hh, 0.25, 1.05 * hw, 0.06, -0.06);
    }
    this.puck.root.position.set(fx, fy - 0.07, -D + 0.1);
    this.puck.root.scale.setScalar(wide ? 1 : 0.7);
    this.beam.position.set(fx, fy, -D + 0.1);
    this.beam.scale.set(wide ? 1 : 0.7, s * 1.85, wide ? 1 : 0.7);
    this.motes.position.set(fx, fy, -D + 0.1);
    this.motes.scale.set(1, s * 1.8, 1);
    if (this.rig) {
      this.rig.root.position.set(fx, fy, -D + 0.1);
      this.rig.root.scale.setScalar(s);
      this.rig.root.rotation.y = 0.35;
    }
    HU.uBase.value = fy - 0.01;
  }

  // ================================================================ data
  private views0(tab: Tab): QView[] { try { return this.quests?.list(tab) ?? []; } catch { return []; } }
  private cur(): QView | null { const v = this.views; if (!v.length) return null; const i = Math.max(0, Math.min(v.length - 1, this.sel[this.tab])); return v[i]; }

  private refresh(force = false) {
    const Q = this.quests; if (!Q) return;
    this.views = this.views0(this.tab);
    this.sel[this.tab] = Math.max(0, Math.min(this.views.length - 1, this.sel[this.tab]));
    const c = this.cur();
    const counts = TABS.map((t) => (t === this.tab ? this.views.length : this.views0(t).length)).join(',');
    const sig = [this.tab, this.sel[this.tab], this.scroll, this.hover, counts, Q.tracked, this.declArm, isTouchMode() ? 'T' : 'D',
      ...this.views.map((v) => v.key + v.status + (Q.fresh.has(v.key) ? '*' : '')), c ? c.objectives.map((o) => Math.round(o.prog * 20)).join('') + c.payNote + c.affordable : ''].join('|');
    if (!force && sig === this.sig) return;
    const selChanged = this.sig.split('|').slice(0, 2).join('|') !== sig.split('|').slice(0, 2).join('|');
    this.sig = sig;
    this.drawList(counts.split(',').map(Number));
    this.drawDetail();
    if (selChanged) { this.detailIn = 0.25; this.glitchT = 0.12; }
  }

  private drawList(counts: number[]) {
    const P = this.list, W = P.w, H = P.h, Q = this.quests!;
    const hits: Hit[] = this.hitsL = [];
    P.clear();
    P.grad(0, 0, W, H, 'rgba(14,40,60,0.72)', 'rgba(6,18,30,0.6)');
    P.frame(0, 0, W, H, 'rgba(120,200,240,0.35)');
    P.corners(1, 1, W - 2, H - 2, ICE, 7);
    // channel tabs
    let x = 6;
    TABS.forEach((t, i) => {
      const on = t === this.tab;
      const label = TAB_NAME[t] + (counts[i] ? ' ' + counts[i] : '');
      const w = P.measure(label, 8) + 8;
      if (on) { P.rect(x - 2, 3, w, 13, 'rgba(255,200,110,0.18)'); P.rect(x - 2, 15, w, 1, AMB); }
      P.text(label, x + 2, 5, on ? AMB : ICE_D, 8);
      hits.push({ kind: 'tab', i, x: x - 2, y: 2, w, h: 15 });
      x += w + 4;
    });
    P.rect(4, 19, W - 8, 1, 'rgba(120,200,240,0.3)');
    // the rows
    const ROW = 15, top = 23, rows = Math.floor((H - top - 18) / ROW);
    const sel = this.sel[this.tab];
    if (sel < this.scroll) this.scroll = sel;
    if (sel >= this.scroll + rows) this.scroll = sel - rows + 1;
    this.scroll = Math.max(0, Math.min(Math.max(0, this.views.length - rows), this.scroll));
    if (!this.views.length) {
      P.para(this.tab === 'active' ? 'No active work. Take an offer, or carry something heavy to the press.' : this.tab === 'offers' ? 'No offers on this channel. They come down the line as you work.' : 'Nothing finished yet.', 8, top + 8, W - 16, ICE_D, 8, 11, 5);
    }
    for (let r = 0; r < rows; r++) {
      const i = this.scroll + r, v = this.views[i]; if (!v) break;
      const y = top + r * ROW, on = i === sel, hov = i === this.hover;
      if (on) { P.rect(3, y - 1, W - 6, ROW - 1, 'rgba(255,196,96,0.2)'); P.rect(3, y - 1, 2, ROW - 1, AMB); }
      else if (hov) P.rect(3, y - 1, W - 6, ROW - 1, 'rgba(120,200,240,0.12)');
      const mark = v.status === 'ready' ? '$' : v.status === 'done' ? '+' : v.def.main ? '>' : v.status === 'decl' ? 'x' : Q.fresh.has(v.key) ? '*' : '-';
      const mcol = v.status === 'ready' ? AMB : v.status === 'done' ? OK : v.status === 'decl' ? ICE_DD : Q.fresh.has(v.key) ? AMB : ICE_D;
      P.text(mark, 9, y + 2, mcol, 8);
      const tag = v.status === 'ready' ? 'READY' : v.def.main ? 'MAIN' : Q.tracked === v.key ? 'TRACK' : Q.fresh.has(v.key) ? 'NEW' : '';
      const tw = tag ? P.measure(tag, 8) + 6 : 0;
      P.text(P.fit(v.title.toUpperCase(), W - 30 - tw, 8), 19, y + 2, on ? AMB : v.status === 'decl' ? ICE_DD : ICE, 8);
      if (tag) P.text(tag, W - 7, y + 2, tag === 'READY' || tag === 'NEW' ? AMB : ICE_D, 8, 'right');
      hits.push({ kind: 'row', i, x: 3, y: y - 1, w: W - 6, h: ROW });
    }
    if (this.views.length > rows) {
      const bh = Math.max(8, (rows / this.views.length) * (rows * ROW)), by = top + (this.scroll / this.views.length) * (rows * ROW);
      P.rect(W - 3, top, 1, rows * ROW, 'rgba(120,200,240,0.2)'); P.rect(W - 3, by, 1, bh, ICE);
    }
    P.rect(4, H - 16, W - 8, 1, 'rgba(120,200,240,0.3)');
    P.text(isTouchMode() ? 'TAP A ROW  ·  TAP OUTSIDE TO CLOSE' : 'W S PICK  ·  A D CHANNEL  ·  J CLOSE', W / 2, H - 12, ICE_DD, 8, 'center');
    P.commit();
  }

  private drawDetail() {
    const P = this.detail, W = P.w, H = P.h, Q = this.quests!;
    const hits: Hit[] = this.hitsD = [];
    P.clear();
    P.grad(0, 0, W, H, 'rgba(16,44,64,0.78)', 'rgba(6,18,30,0.66)');
    P.frame(0, 0, W, H, 'rgba(120,200,240,0.4)');
    P.corners(1, 1, W - 2, H - 2, AMB_D, 8);
    const v = this.cur();
    if (!v) {
      P.text('NO SIGNAL', W / 2, H / 2 - 12, ICE_DD, 16, 'center');
      P.text('CHANNEL ' + TAB_NAME[this.tab], W / 2, H / 2 + 8, ICE_DD, 8, 'center');
      P.commit(); return;
    }
    let y = 6;
    const cat = (v.def.main ? 'CONTRACT' : v.category.toUpperCase()) + '  ·  ' + v.giver.toUpperCase();
    P.text(P.fit(cat, W - 12, 8), 7, y, ICE_D, 8); y += 12;
    const tl = P.wrap(v.title.toUpperCase(), W - 14, 16).slice(0, 2);
    tl.forEach((l, i) => P.text(l, 7, y + i * 15, AMB, 16)); y += tl.length * 15 + 3;
    y += P.para(v.desc, 7, y, W - 14, ICE, 8, 10, 4) * 10 + 4;
    P.rect(6, y, W - 12, 1, 'rgba(120,200,240,0.3)'); y += 4;
    for (const o of v.objectives) {
      if (y > H - 46) { P.text('…', 9, y, ICE_D, 8); y += 10; break; }
      const box = o.done ? '[x]' : '[ ]';
      P.text(box, 7, y, o.done ? OK : ICE_D, 8);
      const n = P.para(o.text, 25, y, W - 34, o.done ? OK : ICE, 8, 10, 2);
      if (!o.done && o.prog > 0) { P.rect(25, y + n * 10, W - 34, 2, 'rgba(120,200,240,0.2)'); P.rect(25, y + n * 10, (W - 34) * o.prog, 2, AMB); y += 4; }
      y += n * 10 + 1;
    }
    // what it pays / costs
    let by = H - 34;
    const rew = v.rewardText ? 'REWARD  ' + v.rewardText : '';
    const cost = v.costText ? 'COST  ' + v.costText : '';
    if (rew) { P.text(P.fit(rew.toUpperCase(), W - 14, 8), 7, by - 12, OK, 8); }
    if (cost) { P.text(P.fit(cost.toUpperCase() + (v.payNote ? '  ·  ' + v.payNote : ''), W - 14, 8), 7, by - (rew ? 22 : 12), v.affordable ? ICE_D : BAD, 8); }
    // the action
    const touch = isTouchMode();
    const act = v.status === 'off' || v.status === 'decl' ? 'ACCEPT' : v.status === 'ready' ? (v.affordable ? 'PAY AND COMPLETE' : 'CANNOT PAY') : v.status === 'act' ? (Q.tracked === v.key ? 'TRACKED ON THE WATCH' : 'TRACK ON THE WATCH') : '';
    by = H - 22;
    if (act) {
      const label = (touch ? '' : 'E  ') + act;
      const w = Math.min(W - 70, P.measure(label, 8) + 16);
      const dim = act === 'CANNOT PAY' || act === 'TRACKED ON THE WATCH';
      P.rect(7, by, w, 15, dim ? 'rgba(120,200,240,0.12)' : 'rgba(255,190,90,0.28)');
      P.frame(7, by, w, 15, dim ? ICE_DD : AMB);
      P.text(label, 7 + w / 2, by + 4, dim ? ICE_D : AMB, 8, 'center');
      if (!dim) hits.push({ kind: 'act', i: 0, x: 7, y: by, w, h: 15 });
    }
    const canDecl = (v.status === 'off') || (v.status === 'act' && !v.def.main);
    if (canDecl) {
      const lab = v.status === 'off' ? 'DECLINE' : this.declArm === v.key ? 'SURE? ABANDON' : 'ABANDON';
      const label = (touch ? '' : 'X  ') + lab;
      const w = P.measure(label, 8) + 12;
      P.frame(W - 7 - w, by, w, 15, this.declArm === v.key ? BAD : ICE_DD);
      P.text(label, W - 7 - w / 2, by + 4, this.declArm === v.key ? BAD : ICE_D, 8, 'center');
      hits.push({ kind: 'decl', i: 0, x: W - 7 - w, y: by, w, h: 15 });
    }
    P.commit();
  }

  private drawHead() {
    const P = this.head, W = P.w, H = P.h;
    P.clear();
    P.grad(0, 0, W, H, 'rgba(10,30,46,0.7)', 'rgba(6,18,30,0.5)', false);
    P.rect(0, H - 1, W, 1, 'rgba(120,200,240,0.45)');
    const live = Math.floor(this.t * 1.6) % 2 === 0;
    P.rect(6, 5, 6, 6, live ? '#ff5a4a' : '#5a2420');
    P.text('LIVE', 16, 4, live ? '#ff8a7a' : ICE_DD, 8);
    const unit = String((G.local as any)?.prisonerNo ?? '').replace(/^\D*/, '') || '0000';
    const h = G.clock?.hours ?? 0, hh = Math.floor(h % 24), mm = Math.floor((h % 1) * 60);
    const close = isTouchMode() ? 'CLOSE  X' : 'J  CLOSE';
    P.text(close, W - 6, 4, AMB, 8, 'right');
    const cw = P.measure(close, 8);
    const clock = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    P.text(clock, W - 16 - cw, 4, ICE_D, 8, 'right');
    const left = W - 16 - cw - P.measure(clock, 8) - 10 - 44;
    P.text(P.fit('MERIDIAN FIELD BROADCAST  ·  UNIT ' + unit, left, 8), 44, 4, ICE, 8);
    this.hitsH = [{ kind: 'close', i: 0, x: W - 10 - cw, y: 0, w: cw + 10, h: H }];
    P.commit();
  }

  private drawCap() {
    const P = this.cap, W = P.w, H = P.h;
    P.clear();
    P.grad(0, 0, W, H, 'rgba(8,24,38,0.82)', 'rgba(8,24,38,0.35)', false);
    P.rect(0, 0, 2, H, AMB);
    P.text('DR. IRIS CALDER', 7, 3, AMB, 8);
    P.text('RESEARCH LEAD', 7 + P.measure('DR. IRIS CALDER  ', 8), 3, ICE_DD, 8);
    P.para(this.lineShown, 7, 13, W - 12, ICE, 8, 10, 2);
    P.commit();
  }

  private say(text: string) {
    this.line = text; this.lineShown = ''; this.lineT = 0;
    this.rig?.talk(Math.min(6, 0.8 + text.length * 0.045));
  }

  // ================================================================ input
  private pick(d: number) {
    const n = this.views.length; if (!n) return;
    this.sel[this.tab] = Math.max(0, Math.min(n - 1, this.sel[this.tab] + d));
    this.declArm = '';
    G.audio?.ui?.('hover', 0.3);
    this.refresh();
  }
  private setTab(i: number) {
    this.tab = TABS[((i % 3) + 3) % 3];
    this.scroll = 0; this.declArm = ''; this.hover = -1;
    G.audio?.ui?.('tab', 0.35);
    this.glitchT = 0.15;
    this.refresh(true);
  }
  private act() {
    const Q = this.quests, v = this.cur(); if (!Q || !v) return;
    if (v.status === 'act') {
      Q.track(Q.tracked === v.key ? null : v.key);
      if (Q.tracked === v.key) { this.say('Tracking it. Follow the arrow on your watch.'); this.rig?.gesture('nod', { dur: 1.2 }); }
      G.audio?.ui?.('watchTick', 0.5); this.refresh(true); return;
    }
    const what = v.status === 'off' || v.status === 'decl' ? 'accept' : v.status === 'ready' ? 'pay' : '';
    if (!what) return;
    const err = Q.request(v.key, what);
    if (err) { G.audio?.ui?.('watchDeny'); this.say(err.charAt(0).toUpperCase() + err.slice(1).toLowerCase() + '.'); this.rig?.gesture('shrug', { dur: 1.5 }); this.glitchT = 0.3; return; }
    if (what === 'accept') {
      Q.track(v.key); Q.fresh.delete(v.key);
      G.audio?.ui?.('questChime', 0.5);
      this.say(v.def.main ? 'Good. The contract comes first. I will be watching the feed.' : 'Accepted. It is on your wrist now. Do not make me chase it.');
      this.rig?.gesture('nod', { dur: 1.4 });
      this.tab = 'active';
    } else {
      G.audio?.ui?.('hopper_tally', 0.5);
      this.say('Settled. The Institute thanks you, in its way.');
      this.rig?.gesture('present', { dur: 1.6 });
    }
    this.glitchT = 0.2;
    this.refresh(true);
  }
  private decline() {
    const Q = this.quests, v = this.cur(); if (!Q || !v) return;
    if (v.status === 'off') { Q.request(v.key, 'decline'); this.say('Declined. Somebody else will want it.'); G.audio?.ui?.('watchTick', 0.4); this.refresh(true); return; }
    if (v.status === 'act' && !v.def.main) {
      if (this.declArm !== v.key) { this.declArm = v.key; this.declT = 2; G.audio?.ui?.('watchDeny', 0.4); this.refresh(true); return; }
      Q.request(v.key, 'abandon'); this.declArm = '';
      this.say('Abandoned. I will make a note of it.'); this.rig?.gesture('think', { dur: 1.6 });
      this.refresh(true);
    }
  }

  private onKey(e: KeyboardEvent) {
    if (G.input?.textFocus) return;
    if (!this.open) {
      if (e.code !== 'KeyJ' || e.repeat || e.ctrlKey || e.metaKey) return;
      const g: any = G;
      if (g.paused || G.ui?.modal || G.ui?.menuEl || G.ui?.readerEl || g.transitioning) return;
      this.toggle(true);
      if (this.open) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (/^F\d+$/.test(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    switch (e.code) {
      case 'Escape': case 'KeyJ': case 'Backspace': this.close(); break;
      case 'ArrowUp': case 'KeyW': this.pick(-1); break;
      case 'ArrowDown': case 'KeyS': this.pick(1); break;
      case 'ArrowLeft': case 'KeyA': case 'KeyQ': this.setTab(TABS.indexOf(this.tab) - 1); break;
      case 'ArrowRight': case 'KeyD': case 'Tab': this.setTab(TABS.indexOf(this.tab) + 1); break;
      case 'Enter': case 'KeyE': case 'Space': this.act(); break;
      case 'KeyX': case 'Delete': this.decline(); break;
    }
  }

  /** which plate element is under the pointer */
  private hitAt(x: number, y: number): { plate: 'list' | 'detail' | 'head'; h: Hit | null } | null {
    if (!this.built) return null;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.rc.setFromCamera(ndc, fpCamera());
    const plates: [Plate, 'list' | 'detail' | 'head', Hit[]][] = [[this.detail, 'detail', this.hitsD], [this.list, 'list', this.hitsL], [this.head, 'head', this.hitsH]];
    const hits = this.rc.intersectObjects(plates.map((q) => q[0].mesh), false);
    if (!hits.length || !hits[0].uv) return null;
    const P = plates.find((q) => q[0].mesh === hits[0].object)!;
    const u = hits[0].uv.x * P[0].w, v = (1 - hits[0].uv.y) * P[0].h;
    const h = P[2].find((q) => u >= q.x && u <= q.x + q.w && v >= q.y && v <= q.y + q.h) ?? null;
    return { plate: P[1], h };
  }
  private onDown(e: PointerEvent) {
    if (!this.open) return;
    // the touch buttons (QUESTS closes it again) keep their own taps
    if ((e.target as Element | null)?.closest?.('.nc-btn')) return;
    e.preventDefault(); e.stopPropagation();
    const r = this.hitAt(e.clientX, e.clientY);
    if (!r) { this.close(); return; }
    const h = r.h; if (!h) return;
    if (h.kind === 'tab') this.setTab(h.i);
    else if (h.kind === 'row') { if (this.sel[this.tab] === h.i && isTouchMode()) this.act(); else { this.sel[this.tab] = h.i; this.declArm = ''; G.audio?.ui?.('hover', 0.3); this.refresh(); } }
    else if (h.kind === 'act') this.act();
    else if (h.kind === 'decl') this.decline();
    else if (h.kind === 'close') this.close();
  }
  private onMove() {
    if (isTouchMode()) return;
    const r = this.hitAt(this.px, this.py);
    const hv = r?.plate === 'list' && r.h?.kind === 'row' ? r.h.i : -1;
    if (hv !== this.hover) { this.hover = hv; this.refresh(); }
    document.body.style.cursor = r?.h ? 'pointer' : '';
  }

  // ================================================================ frame
  private frame(dt: number) {
    if (!this.built || (!this.open && !this.closing && this.show <= 0)) return;
    const p = G.local;
    if (this.open && (!p || p.body.dead || fpOwner() !== 'broadcast')) { this.close(true); return; }
    dt = Math.min(dt, 0.05);
    this.t += dt;
    PLATE_T.value = performance.now() / 1000;
    this.show = Math.max(0, Math.min(1, this.show + (this.open ? dt / 0.55 : -dt / 0.3)));
    if (!this.open && this.show <= 0) {
      this.closing = false;
      fpRelease('broadcast');
      document.body.style.cursor = '';
      return;
    }
    this.layout();
    // the data
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 0.3; this.refresh(); }
    if (this.declT > 0) { this.declT -= dt; if (this.declT <= 0 && this.declArm) { this.declArm = ''; this.refresh(true); } }
    // she reads the quest you rest on
    const c = this.cur();
    if (c && c.key !== this.readSel) { this.readSel = c.key; this.dwell = 0; }
    if (c && this.dwell >= 0) {
      this.dwell += dt;
      if (this.dwell > 0.7) {
        this.dwell = -1;
        const first = (c.desc.match(/^[^.!?]*[.!?]/)?.[0] ?? c.desc).trim();
        this.say(first.length > 120 ? first.slice(0, 117) + '…' : first || c.title + '.');
      }
    }
    // her caption types on
    if (this.lineShown !== this.line) {
      this.lineT += dt * 60;
      const n = Math.min(this.line.length, Math.floor(this.lineT));
      if (n !== this.lineShown.length) { this.lineShown = this.line.slice(0, n); this.drawCap(); }
    } else if (this.t < dt * 1.5) this.drawCap();
    if (Math.floor(this.t * 1.6) !== Math.floor((this.t - dt) * 1.6) || this.t < dt * 1.5) this.drawHead();
    // the feed: scan-in, glitches, sway
    const s = this.show;
    const e = s * s * (3 - 2 * s);
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0) { this.nextGlitch = 2.5 + Math.random() * 5; this.glitchT = 0.08 + Math.random() * 0.1; }
    this.glitchT = Math.max(0, this.glitchT - dt);
    const gl = this.glitchT > 0 ? 0.6 + Math.random() * 0.4 : 0;
    this.detailIn = Math.min(1, this.detailIn + dt / 0.28);
    const stag = (d: number) => Math.max(0, Math.min(1, (e - d) / (1 - d)));
    this.head.show = stag(0); this.list.show = stag(0.15); this.detail.show = stag(0.3) * this.detailIn; this.cap.show = stag(0.4);
    for (const pl of [this.head, this.list, this.detail, this.cap]) pl.glitch = gl;
    this.list.mesh.position.y += Math.sin(this.t * 0.9) * 0.006;
    this.detail.mesh.position.y += Math.sin(this.t * 0.8 + 1.3) * 0.008;
    this.cap.mesh.position.y += Math.sin(this.t * 1.1 + 2) * 0.004;
    // sway with the pointer
    const tx = isTouchMode() ? 0 : (this.px / Math.max(1, window.innerWidth) - 0.5), ty = isTouchMode() ? 0 : (this.py / Math.max(1, window.innerHeight) - 0.5);
    this.sx += (tx - this.sx) * Math.min(1, dt * 3); this.sy += (ty - this.sy) * Math.min(1, dt * 3);
    this.root.rotation.set(this.sy * 0.06 + (1 - e) * 0.12, this.sx * 0.09, 0);
    this.root.position.set(0, (1 - e) * -0.06, (1 - e) * -0.3);
    (this.back.material as THREE.MeshBasicMaterial).opacity = e * 0.92;
    // her light
    const her = this.rig;
    HU.uUnfold.value = this.open ? (e < 0.999 ? Math.max(0, (e - 0.1) / 0.9) * 1.05 : 5) : e * 1.05;
    HU.uBright.value = (0.75 + 0.25 * e) * (gl ? 0.75 : 1);
    (this.beam.material as THREE.ShaderMaterial).uniforms.uShow.value = e;
    this.puck.lens.scale.setScalar(0.85 + 0.15 * e + Math.sin(this.t * 7) * 0.02);
    (this.puck.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.4 * e + Math.sin(this.t * 3) * 0.1;
    this.puck.leds.forEach((l, i) => ((l.material as THREE.MeshBasicMaterial).color.setHex(Math.floor(this.t * 3 + i) % 3 === 0 ? 0xffd070 : 0x6a3a10)));
    const mp = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i++) { let y = mp.getY(i) + dt * (0.05 + (i % 5) * 0.02); if (y > 1) y -= 1; mp.setY(i, y); mp.setX(i, Math.sin(this.t * 0.7 + i) * 0.04 * (1 + y) + ((i * 37) % 11 - 5) * 0.012 * y); }
    mp.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).opacity = 0.7 * e;
    if (her) {
      her.root.updateMatrixWorld(true);
      this.tmpV.set(0, 0, 0);
      her.lookAt(this.tmpV);
      her.update(dt, { fidget: true } as never);
    }
  }
}
