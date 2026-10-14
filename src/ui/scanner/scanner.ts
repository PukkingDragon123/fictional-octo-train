import * as THREE from 'three';
import { G } from '../../game/G';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { Screen } from '../font5x7';
import { bus } from '../../core/events';
import { damp, clamp } from '../../core/math';
import { Player } from '../../entities/player';
import './textures';
import { drawPage, PAGES, PageKey } from './pages';

export const SCR_W = 192, SCR_H = 144;

const SCREEN_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SCREEN_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScreen;
uniform float uTime;
uniform float uPower;
uniform float uGlitch;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + 0.035 * r2);
  // power-on: picture grows from a horizontal line
  float open = smoothstep(0.0, 1.0, uPower);
  float band = abs(uv.y - 0.5) * 2.0;
  if (band > open * 1.02 + 0.01) { gl_FragColor = vec4(0.012, 0.022, 0.014, 1.0); return; }
  if (uGlitch > 0.0) { float row = floor(uv.y * 144.0); if (h(vec2(row, floor(uTime * 15.0))) < uGlitch * 0.2) uv.x += (h(vec2(floor(uTime * 15.0), row)) - 0.5) * 0.05; }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.01, 0.02, 0.012, 1.0); return; }
  vec3 col = texture2D(tScreen, vec2(uv.x, 1.0 - uv.y)).rgb;
  col *= 1.0 - r2 * 1.1;
  col *= 0.96 + 0.04 * sin(uTime * 55.0);
  col += (h(floor(uv * vec2(192.0, 144.0)) + fract(uTime * 7.0)) - 0.5) * 0.035;
  col = mix(col, vec3(0.75, 1.0, 0.7), (1.0 - open) * 0.6 * step(band, 0.04));
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Btn { mesh: THREE.Object3D; page: PageKey; press: number; }

/**
 * SEER-9 Field Scanner — the main interface. A physical handheld device the
 * survivor raises into view: worn enamel casing, rubber bumpers, a rotary
 * dial, six stencilled buttons, antenna, status LEDs and a curved green CRT.
 * Rendered in the pixel overlay pass so it shares the world's look; its
 * screen maps 1:1 onto low-res pixels so the 5x7 font stays crisp.
 */
export class Scanner {
  open = false;
  page: PageKey = 'stat';
  raise = 0;           // 0 hidden .. 1 raised
  power = 0;           // screen power animation
  group = new THREE.Group();
  device = new THREE.Group();
  screen = new Screen(SCR_W, SCR_H);
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  screenMat: THREE.ShaderMaterial;
  screenMesh!: THREE.Mesh;
  dial!: THREE.Object3D;
  dialAngle = 0;
  antenna!: THREE.Object3D;
  leds: Record<string, THREE.Mesh> = {};
  buttons: Btn[] = [];
  drawT = 0;
  /** page-local state */
  st: Record<string, any> = { sel: 0, scroll: 0, mapZoom: 3, freq: 88.0, dataTab: 0, logSel: 0 };
  healthOf: Player | null = null;
  scanTarget: any = null;
  scanProgress = 0;
  sweep = 0;
  blips: { x: number; z: number; t: number; kind: string; id?: string; label?: string }[] = [];
  private ray = new THREE.Raycaster();
  private light: THREE.PointLight;
  private lastScale = 0;
  private wantPage: PageKey | null = null;
  beepT = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCR_W; this.canvas.height = SCR_H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.flipY = false; // the screen shader flips v itself
    this.screenMat = new THREE.ShaderMaterial({
      vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG,
      uniforms: { tScreen: { value: this.tex }, uTime: { value: 0 }, uPower: { value: 0 }, uGlitch: { value: 0 } },
    });
    this.build();
    const s = G.pr.overlayScene;
    s.add(new THREE.AmbientLight(0xd8dcc8, 0.55));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.25); key.position.set(-0.6, 1.2, 1.0); s.add(key);
    const rim = new THREE.DirectionalLight(0x6a8aff, 0.35); rim.position.set(1, -0.3, -0.5); s.add(rim);
    this.light = new THREE.PointLight(0x7cff6a, 0.6, 0.6, 2); s.add(this.light);
    s.add(this.group);
    this.group.add(this.device);
    G.ui.scanner = this;
    window.addEventListener('mousedown', (e) => this.onMouse(e), true);
    window.addEventListener('wheel', (e) => { if (this.open && this.raise > 0.6) { this.turnDial(Math.sign(e.deltaY)); } }, { passive: true });
    bus.on('scanComplete', () => {});
  }

  // ---------------------------------------------------------------- model
  private build() {
    const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
    const glow = worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: true });
    const W = 0.26, H = 0.205, D = 0.055;
    const mb = new ModelBuilder();
    // main body with chamfer strips
    mb.box(0, -H / 2, 0, W, H, D, { all: 'c_scanner_side', south: 'c_scanner_front', north: 'c_scanner_back' }, { fit: true });
    mb.box(0, -H / 2 + 0.006, D / 2 + 0.002, W - 0.02, H - 0.012, 0.004, { all: 'c_scanner_side', south: 'c_scanner_front' }, { fit: true });
    // rubber corner bumpers
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.box(sx * (W / 2 - 0.012), (sy > 0 ? H / 2 - 0.034 : -H / 2 - 0.004), 0, 0.034, 0.038, D + 0.012, 'c_scanner_rubber', { fit: true });
    // side grips
    mb.box(-W / 2 - 0.006, -0.06, 0, 0.012, 0.12, D - 0.01, 'c_scanner_rubber', { fit: true });
    // screen bezel (recessed dark rubber)
    const sw = 0.152, sh = 0.114, sx = -0.022, sy = 0.022;
    mb.box(sx, sy - sh / 2 - 0.012, D / 2 + 0.004, sw + 0.026, sh + 0.024, 0.01, { all: 'c_scanner_rubber', south: 'c_scanner_bezel' }, { fit: { south: true } });
    // speaker grille (left of buttons) & label plates
    mb.box(-0.098, -0.082, D / 2 + 0.005, 0.044, 0.026, 0.004, 'c_scanner_grille', { fit: true });
    mb.box(0.08, -0.092, D / 2 + 0.005, 0.07, 0.016, 0.003, 'c_scanner_label', { fit: true });
    mb.box(sx, sy + sh / 2 + 0.016, D / 2 + 0.005, 0.07, 0.012, 0.003, 'c_scanner_plate', { fit: true });
    // screws
    for (const [x, y] of [[-0.118, 0.088], [0.118, 0.088], [-0.118, -0.09], [0.118, -0.09]]) mb.cylinder(x, y, D / 2 + 0.002, 0.004, 0.004, 6, 'metal_grey');
    // antenna base
    mb.box(0.09, H / 2 - 0.004, -0.008, 0.024, 0.02, 0.024, 'c_scanner_rubber', { fit: true });
    // strap lugs
    mb.box(-0.06, H / 2 - 0.004, -0.02, 0.03, 0.012, 0.012, 'metal_dark');
    mb.box(-0.06, -H / 2 - 0.008, -0.02, 0.03, 0.012, 0.012, 'metal_dark');
    const body = new THREE.Mesh(mb.build(), mat);
    this.device.add(body);
    // screen quad
    const sg = new THREE.PlaneGeometry(sw, sh);
    this.screenMesh = new THREE.Mesh(sg, this.screenMat);
    this.screenMesh.position.set(sx, sy, D / 2 + 0.0102);
    this.device.add(this.screenMesh);
    // glass reflection strip
    const gb = new ModelBuilder(); gb.box(sx - 0.04, sy + 0.02, D / 2 + 0.0108, 0.01, 0.05, 0.0004, 'glass', { color: 0xffffff });
    const glass = new THREE.Mesh(gb.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true, transparent: true, opacity: 0.08, unlit: true }));
    glass.rotation.z = -0.5;
    this.device.add(glass);
    // dial
    const dm = new ModelBuilder();
    dm.cylinder(0, 0, 0, 0.026, 0.022, 14, { sides: 'c_scanner_knob', top: 'c_scanner_knobtop', bottom: 'c_scanner_knob' }, { fit: true });
    this.dial = new THREE.Group();
    const dmesh = new THREE.Mesh(dm.build(), mat);
    dmesh.rotation.x = Math.PI / 2;
    this.dial.add(dmesh);
    this.dial.position.set(0.098, 0.03, D / 2);
    this.device.add(this.dial);
    // dial collar
    const cm = new ModelBuilder(); cm.cylinder(0, 0, 0, 0.032, 0.006, 14, 'metal_dark');
    const collar = new THREE.Mesh(cm.build(), mat); collar.rotation.x = Math.PI / 2; collar.position.set(0.098, 0.03, D / 2 + 0.001);
    this.device.add(collar);
    // buttons
    PAGES.forEach((pg, i) => {
      const bm = new ModelBuilder();
      bm.box(0, -0.007, 0, 0.022, 0.014, 0.01, { all: 'c_scanner_rubber', south: 'c_btn_' + pg.key }, { fit: { south: true } });
      const m = new THREE.Mesh(bm.build(), mat);
      const g = new THREE.Group(); g.add(m);
      g.position.set(-0.07 + i * 0.026, -0.062, D / 2 + 0.006);
      g.userData.page = pg.key;
      this.device.add(g);
      this.buttons.push({ mesh: g, page: pg.key, press: 0 });
    });
    // LEDs
    const ledPos: [string, number, number][] = [['power', 0.072, 0.082], ['alert', 0.086, 0.082], ['signal', 0.1, 0.082]];
    for (const [k, x, y] of ledPos) {
      const lm = new ModelBuilder(); lm.box(0, -0.003, 0, 0.007, 0.006, 0.004, 'c_led_off', { fit: true });
      const m = new THREE.Mesh(lm.build(), glow);
      m.position.set(x, y, D / 2 + 0.004);
      this.device.add(m);
      this.leds[k] = m;
    }
    // antenna (telescopes out on the signal page)
    const am = new ModelBuilder();
    am.cylinder(0, 0, 0, 0.004, 0.16, 6, 'chrome');
    am.sphere(0, 0.162, 0, 0.006, 6, 4, 'chrome');
    this.antenna = new THREE.Mesh(am.build(), mat);
    this.antenna.position.set(0.09, H / 2 + 0.004, -0.008);
    this.device.add(this.antenna);
    this.device.rotation.set(-0.12, 0, 0);
  }

  setLed(k: string, tex: 'c_led_green' | 'c_led_red' | 'c_led_amber' | 'c_led_off') {
    const m = this.leds[k]; if (!m) return;
    if (m.userData.tex === tex) return;
    m.userData.tex = tex;
    const lm = new ModelBuilder(); lm.box(0, -0.003, 0, 0.007, 0.006, 0.004, tex, { fit: true, emissive: tex === 'c_led_off' ? 0 : 1.2 });
    m.geometry.dispose(); m.geometry = lm.build();
  }

  // ---------------------------------------------------------------- control
  toggle(v?: boolean, page?: PageKey) {
    const want = v ?? !this.open;
    if (page) this.wantPage = page;
    if (want && page) this.page = page;
    if (want === this.open) { if (page) this.press(page); return; }
    this.open = want;
    G.local.scannerOpen = want;
    G.audio?.ui?.(want ? 'scannerUp' : 'scannerDown');
    if (!want) { this.healthOf = null; this.scanTarget = null; G.input.pointerOverUI = false; }
  }
  press(page: PageKey) {
    const b = this.buttons.find((x) => x.page === page);
    if (b) b.press = 1;
    if (this.page !== page) { this.page = page; this.st.sel = 0; this.st.scroll = 0; G.audio?.ui?.('scanClick'); }
    else G.audio?.ui?.('scanClick');
    this.drawT = 0;
  }
  turnDial(dir: number) {
    this.dialAngle += dir * 0.35;
    G.audio?.ui?.('dial');
    const st = this.st;
    switch (this.page) {
      case 'sig': st.freq = clamp(Math.round((st.freq + dir * 0.1) * 10) / 10, 60, 140); break;
      case 'map': st.mapZoom = clamp(st.mapZoom + (dir > 0 ? -1 : 1), 1, 4); break;
      default: st.sel = Math.max(0, st.sel + dir); break;
    }
    this.drawT = 0;
  }

  showHealthOf(p: Player) { this.healthOf = p === G.local ? null : p; this.toggle(true, 'stat'); }
  scanCreature(c: any) { this.scanTarget = c; this.scanProgress = 0; this.toggle(true, 'scan'); }
  studyItem(it: any) { this.st.study = it; this.toggle(true, 'data'); }

  private onMouse(e: MouseEvent) {
    if (!this.open || this.raise < 0.7) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    e.stopPropagation(); e.preventDefault();
    if (hit.kind === 'button') this.press(hit.page!);
    else if (hit.kind === 'dial') this.turnDial(e.button === 2 ? -1 : 1);
    else if (hit.kind === 'screen') { this.screenClick(hit.u!, hit.v!, e); }
  }

  hitTest(cssX: number, cssY: number): { kind: 'button' | 'dial' | 'screen' | 'body'; page?: PageKey; u?: number; v?: number } | null {
    const pr = G.pr;
    const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
    const lx = cssX * pr.dpr / pr.scale + pr.margin, ly = (window.innerHeight - cssY) * pr.dpr / pr.scale + pr.margin;
    const ndc = new THREE.Vector2(lx / RW * 2 - 1, ly / RH * 2 - 1);
    this.ray.setFromCamera(ndc, pr.overlayCamera);
    const hits = this.ray.intersectObject(this.device, true);
    if (!hits.length) return null;
    const h = hits[0];
    let o: THREE.Object3D | null = h.object;
    while (o && o !== this.device) { if (o.userData.page) return { kind: 'button', page: o.userData.page }; o = o.parent; }
    if (h.object === this.screenMesh && h.uv) return { kind: 'screen', u: h.uv.x, v: 1 - h.uv.y };
    if (h.object.parent === this.dial) return { kind: 'dial' };
    return { kind: 'body' };
  }

  private screenClick(u: number, v: number, e: MouseEvent) {
    const x = Math.floor(u * SCR_W), y = Math.floor(v * SCR_H);
    const zones: { x: number; y: number; w: number; h: number; fn: () => void }[] = this.st.clickZones || [];
    for (const z of zones) if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) { G.audio?.ui?.('scanClick'); z.fn(); this.drawT = 0; return; }
    void e;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const pr = G.pr;
    const p = G.local;
    if (!p) return;
    const inp = G.input;
    // page keys while open
    if (this.open) {
      for (let i = 0; i < PAGES.length; i++) if (inp.keyHit('Digit' + (i + 1)) || inp.keyHit('F' + (i + 1))) this.press(PAGES[i].key);
      if (inp.keyHit('KeyQ') || inp.keyHit('BracketLeft')) this.cycle(-1);
      if (inp.keyHit('KeyE') || inp.keyHit('BracketRight')) this.cycle(1);
      if (inp.keyHit('ArrowUp')) this.turnDial(-1);
      if (inp.keyHit('ArrowDown')) this.turnDial(1);
    }
    // hovering the device blocks world clicks
    if (this.open && this.raise > 0.5) {
      const over = !!this.hitTest(inp.mouseX, inp.mouseY);
      if (over) inp.pointerOverUI = true;
      else if (!G.ui.inventory?.open && !G.ui.menuEl) inp.pointerOverUI = false;
    }
    this.raise = damp(this.raise, this.open ? 1 : 0, this.open ? 7 : 9, dt);
    this.power = damp(this.power, this.open && this.raise > 0.75 ? 1 : 0, 8, dt);
    pr.overlayEnabled = this.raise > 0.01;
    if (!pr.overlayEnabled) return;
    // placement: screen maps 1:1 onto low-res pixels when fully raised
    const cam = pr.overlayCamera;
    const RH = pr.lowH + pr.margin * 2, RW = pr.lowW + pr.margin * 2;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const sw = 0.152;
    const d = sw * RH / (2 * SCR_W * tanH);
    const mpp = (2 * d * tanH) / RH; // metres per pixel at distance d
    // lower part of the view, leaving the world visible above
    const targetY = -(RH * 0.5 - (SCR_H + 54)) * mpp * 0.98;
    const hiddenY = targetY - 0.32;
    const k = this.raise;
    const ease = 1 - Math.pow(1 - k, 3);
    let y = hiddenY + (targetY - hiddenY) * ease;
    let x = 0.0;
    // walking sway (only while moving so the screen stays pixel-crisp at rest)
    const moving = p.speed > 0.2;
    if (moving) { y += Math.abs(Math.sin(G.time * 7)) * 0.004; x += Math.sin(G.time * 3.5) * 0.004; }
    // pixel-align the screen's top-left corner
    if (k > 0.98 && !moving) {
      const sx0 = (x - 0.022 - sw / 2) / mpp, sy0 = (y + 0.022 + 0.114 / 2) / mpp;
      x += (Math.round(sx0 + RW / 2) - (sx0 + RW / 2)) * mpp;
      y += (Math.round(sy0 + RH / 2) - (sy0 + RH / 2)) * mpp;
    }
    this.group.position.set(x, y, -d);
    this.device.rotation.x = (1 - ease) * -0.9 + (k > 0.98 ? 0 : -0.04);
    this.device.rotation.z = (1 - ease) * 0.25;
    this.light.position.set(x - 0.02, y + 0.02, -d + 0.08);
    this.light.intensity = 0.0025 * this.power; // 1/d² at a few cm: keep it a faint glow
    if (this.lastScale !== RH) { this.lastScale = RH; }
    // buttons spring back, dial rotation, antenna
    for (const b of this.buttons) { b.press = Math.max(0, b.press - dt * 6); b.mesh.position.z = 0.0275 + 0.006 - b.press * 0.004 - (b.page === this.page ? 0.002 : 0); }
    this.dial.rotation.z = -this.dialAngle;
    const ant = this.page === 'sig' ? 1 : 0.15;
    this.antenna.scale.y = damp(this.antenna.scale.y, ant, 6, dt);
    // LEDs
    this.setLed('power', this.power > 0.5 ? 'c_led_green' : 'c_led_off');
    const danger = (G.survival?.threat ?? 0) > 0.2 || p.body.bleedRate() > 0.05;
    this.setLed('alert', danger && Math.sin(G.time * 10) > 0 ? 'c_led_red' : 'c_led_off');
    const sig = this.st.sigStrength ?? 0;
    const unread = !!G.missions?.unread && Math.sin(G.time * 2.5) > 0.55;
    this.setLed('signal', (sig > 0.3 && Math.sin(G.time * (4 + sig * 12)) > 0) || unread ? 'c_led_amber' : 'c_led_off');
    this.screenMat.uniforms.uTime.value = G.time;
    this.screenMat.uniforms.uPower.value = this.power;
    this.screenMat.uniforms.uGlitch.value = Math.max(G.collapse * 0.5, p.body.corruption > 30 ? 0.3 : 0);
    // scanning creatures
    if (this.scanTarget) {
      const c = this.scanTarget;
      const dd = Math.hypot(c.x - p.x, c.z - p.z);
      if (dd > 18 || c.zoneKey !== p.zoneKey) { this.scanProgress = Math.max(0, this.scanProgress - dt); }
      else this.scanProgress += dt / 2.6;
      if (this.scanProgress >= 1) { c.scanned = true; G.missions?.onScan?.(c); bus.emit('scanned', c); G.audio?.ui?.('scanDone'); this.scanTarget = null; this.st.lastScanned = c; }
    }
    // redraw at ~15 fps
    this.drawT -= dt;
    if (this.drawT <= 0 && this.power > 0.05) {
      this.drawT = 1 / 15;
      this.sweep = (this.sweep + dt * 0) % 1;
      drawPage(this.screen, this);
      this.postFx();
      this.canvas.getContext('2d')!.putImageData(this.screen.img, 0, 0);
      this.tex.needsUpdate = true;
    }
    // player holds the device up
    void p;
  }

  cycle(dir: number) {
    const i = PAGES.findIndex((p) => p.key === this.page);
    this.press(PAGES[(i + dir + PAGES.length) % PAGES.length].key);
  }

  /** phosphor glow + interlace dimming done on the CPU buffer */
  private postFx() {
    const d = this.screen.img.data;
    const W = SCR_W, H = SCR_H;
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // cheap bloom from horizontal neighbours
      let g = 0;
      if (x > 0) g += src[i - 4 + 1]; if (x < W - 1) g += src[i + 4 + 1];
      if (y > 0) g += src[i - W * 4 + 1]; if (y < H - 1) g += src[i + W * 4 + 1];
      const bloom = g * 0.06;
      const il = (y & 1) ? 0.84 : 1;
      d[i] = Math.min(255, (src[i] + bloom * 0.6) * il);
      d[i + 1] = Math.min(255, (src[i + 1] + bloom) * il);
      d[i + 2] = Math.min(255, (src[i + 2] + bloom * 0.5) * il);
    }
  }
}
