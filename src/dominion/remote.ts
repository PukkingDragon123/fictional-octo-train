// The thrall remote: a bakelite control box you hold up in first person when
// you press E on one of your thralls. A green phosphor strip shows the unit
// and its body; bat-handle toggles set FOLLOW / STAY / GUARD / RIDE; a rotary
// selector picks its STATION; a hatch button opens the CARGO; a red SCRAM
// button under a flip cover shuts it down. Everything is clicked or tapped.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { fpGroup, fpClaim, fpRelease, fpCamera, fpBlend } from '../fp/fp';
import { hasUnlock } from '../game/research';
import { shake } from '../gfx/juice';
import { PixTex, PAL, PointerLayer, overlayRay } from '../scan/pix';
import { crtScreen, phosphorText, type CrtScreen } from '../gfx/crt';
import { Shape } from '../craft/shapes';
import { pixMat } from '../craft/fpTex';
import { ink } from '../craft/fpScene';
import { StageArms } from '../scan/arms';
import { Screen } from '../ui/font5x7';
import type { Creature } from '../creatures/creature';
import type { DominionSystem, StationKind } from './dominion';

const PW = 160, PH = 110, M = 1000; // faceplate texels, texels per metre
const at = (tx: number, ty: number) => new THREE.Vector3(tx / M - PW / M / 2, PH / M / 2 - ty / M, 0);
const TOGGLES: { k: string; x: number; label: string }[] = [{ k: 'follow', x: 22, label: 'FOLLOW' }, { k: 'stay', x: 60, label: 'STAY' }, { k: 'guard', x: 98, label: 'GUARD' }, { k: 'ride', x: 136, label: 'RIDE' }];
const STATIONS: (StationKind | null)[] = [null, 'guard', 'haul', 'power', 'farm'];
const ST_LABEL = ['OFF', 'GRD', 'HAUL', 'PWR', 'FARM'];

export class Remote {
  private g: THREE.Group;
  private box = new THREE.Group();
  private plate = new PixTex(PW, PH);
  private lcd: CrtScreen;
  private toggles = new Map<string, THREE.Group>();
  private knob = new THREE.Group();
  private cover = new THREE.Group();
  private cargoBtn: THREE.Mesh;
  private layer: PointerLayer;
  private c: Creature | null = null;
  private raise = 0;
  private sure = false;
  private press = new Map<string, number>();
  private lcdT = 0;
  private arms: StageArms;
  private hoverObj: THREE.Object3D | null = null;
  private pressT = 0;
  private tw = new THREE.Vector3();

  constructor(private d: DominionSystem) {
    this.g = fpGroup('remote');
    this.g.add(new THREE.HemisphereLight(0xd0c8b8, 0x3a3028, 0.7));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.3); key.position.set(-0.3, 0.9, 1); this.g.add(key);
    const rimL = new THREE.DirectionalLight(0x9ab0c8, 0.5); rimL.position.set(0.6, 0.3, -0.8); this.g.add(rimL);
    this.g.add(this.box);
    this.arms = new StageArms(this.g);
    // the box: brown bakelite shell, a cream faceplate screwed on, a lug to hold it by, a whip aerial
    const shell = new Shape(8), chrome = new Shape(9), black = new Shape(9), red = new Shape(9);
    shell.jbox(0, -PH / M - 0.006, -0.018, PW / M + 0.012, PH / M + 0.012, 0.032, 0xffffff, 0.0012, 3);
    shell.jbox(0, -PH / M / 2 - 0.035, -0.045, 0.05, 0.07, 0.022, 0xd8c8b8, 0.0012, 5);
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) chrome.dome(x * (PW / M / 2 - 0.004), y * (PH / M / 2 - 0.004) - PH / M / 2, 0.0005, 0.0026, 0xffffff);
    chrome.rod([-0.06, 0.004, -0.02], [-0.064, 0.07, -0.022], 0.0025, 0xffffff, 5);
    chrome.gem(-0.064, 0.072, -0.022, 0.004, 0xffffff, 0.1);
    this.box.add(new THREE.Mesh(shell.build(), pixMat('bakelite')));
    this.box.add(new THREE.Mesh(chrome.build(), pixMat('chrome')));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PW / M, PH / M), new THREE.MeshStandardMaterial({ map: this.plate.tex, roughness: 0.5, metalness: 0.05, transparent: true, alphaTest: 0.4 }));
    face.position.set(0, -PH / M / 2, 0.0005); this.box.add(face);
    this.lcd = crtScreen(0.098, 0.018, { res: [294, 54], tint: 0x9cffb0, curvature: 0.12, glow: 0.9 });
    this.lcd.mesh.position.copy(at(80, 15)).add(new THREE.Vector3(0, -PH / M / 2, 0.001)); this.box.add(this.lcd.mesh);
    // bat-handle toggles on hex bosses
    const tb = new Shape(9);
    tb.cyl(0, 0, 0, 0.007, 0.004, 0xffffff, 6);
    tb.cyl(0, 0.002, 0, 0.0018, 0.016, 0xffffff, 6, undefined, 0.0013);
    tb.gem(0, 0.018, 0, 0.0028, 0xffffff, 0.08);
    const lg = tb.build();
    for (const t of TOGGLES) {
      const tg = new THREE.Group(); tg.name = 'tg:' + t.k;
      const lever = new THREE.Mesh(lg, pixMat('chrome')); lever.name = 'tg:' + t.k;
      lever.rotation.x = Math.PI / 2;
      tg.add(lever);
      tg.position.copy(at(t.x, 44)).add(new THREE.Vector3(0, -PH / M / 2, 0.002));
      this.box.add(tg); this.toggles.set(t.k, tg);
    }
    // the station selector: a fluted octagonal knob with a cream pointer
    const kb = new Shape(9);
    kb.lathe(0, 0, 0, [[0, 0], [0.013, 0], [0.0135, 0.003], [0.012, 0.009], [0.009, 0.011], [0, 0.011]], 0xffffff, 8);
    kb.box(0, 0.011, 0.007, 0.003, 0.002, 0.01, 0xf0e6d0, 0.0008);
    const knobM = new THREE.Mesh(kb.build(), pixMat('bakelite', { color: 0x8a7060 })); knobM.name = 'knob'; knobM.rotation.x = Math.PI / 2;
    this.knob.add(knobM); this.knob.position.copy(at(34, 86)).add(new THREE.Vector3(0, -PH / M / 2, 0.003)); this.box.add(this.knob);
    // the cargo hatch button: a square black key
    black.box(0, 0, 0, 0.018, 0.007, 0.018, 0xffffff, 0.002);
    this.cargoBtn = new THREE.Mesh(black.build(), pixMat('rubber')); this.cargoBtn.name = 'cargo'; this.cargoBtn.rotation.x = Math.PI / 2;
    this.cargoBtn.position.copy(at(84, 84)).add(new THREE.Vector3(0, -PH / M / 2, 0.002)); this.box.add(this.cargoBtn);
    // SCRAM: a red faceted mushroom under a hinged clear guard
    red.cyl(0, 0, 0, 0.004, 0.006, 0xc8c8c8, 6); red.lathe(0, 0.006, 0, [[0.004, 0], [0.011, 0.001], [0.012, 0.004], [0.009, 0.008], [0, 0.009]], 0xffffff, 8);
    const scram = new THREE.Mesh(red.build(), pixMat('enamelRed')); scram.name = 'scram'; scram.rotation.x = Math.PI / 2;
    scram.position.copy(at(132, 84)).add(new THREE.Vector3(0, -PH / M / 2, 0.002)); this.box.add(scram);
    const cvg = new Shape(9); cvg.box(0, -0.032, -0.0005, 0.034, 0.032, 0.016, 0xffffff, 0.003);
    const cv = new THREE.Mesh(cvg.build(), new THREE.MeshStandardMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.35, roughness: 0.1, flatShading: true }));
    cv.name = 'scram'; this.cover.add(cv);
    this.cover.position.copy(at(132, 69)).add(new THREE.Vector3(0, -PH / M / 2, 0.003)); this.box.add(this.cover);
    ink(this.box, 0.0009);
    this.drawPlate();
    this.layer = new PointerLayer('remote', { down: (e) => this.click(e), move: (e) => { const h = overlayRay(e.clientX, e.clientY, fpCamera()).intersectObject(this.box, true)[0]; let o: THREE.Object3D | null = h?.object ?? null; while (o && !o.name) o = o.parent; this.hoverObj = o && o !== this.box ? o : null; } });
    window.addEventListener('keydown', (e) => { if (this.c && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
  }

  get open() { return !!this.c; }
  get forId() { return this.c?.id ?? null; }

  show(c: Creature) {
    // stand and give the order: into the eyes, the unit in front of you, the box in your hands
    if (!fpClaim('remote', 4, { cinematic: 'full', eyePitch: 14 })) return;
    this.c = c; this.sure = false; this.raise = 0;
    this.arms.dress();
    this.lcd.power(true);
    this.layer.on = true;
    this.lcdT = 0;
    G.audio?.ui?.('dom_order', 0.5);
  }
  close() {
    if (!this.c) return;
    this.c = null; this.layer.on = false;
    fpRelease('remote');
  }

  private click(e: PointerEvent) {
    const c = this.c; if (!c) return;
    const hit = overlayRay(e.clientX, e.clientY, fpCamera()).intersectObject(this.box, true)[0];
    if (!hit) { this.close(); return; }
    let o: THREE.Object3D | null = hit.object, name = '';
    while (o && !name) { name = o.name; o = o.parent; }
    if (!name) return;
    const r = this.d.rec(c); if (!r) return this.close();
    const p = G.local!;
    this.press.set(name, 0.18);
    this.pressT = 0.22; this.hoverObj = hit.object;
    G.audio?.ui?.('click', 0.7);
    if (name.startsWith('tg:')) {
      const k = name.slice(3);
      if (k === 'follow') this.d.command(c.id, 'follow');
      else if (k === 'stay') this.d.command(c.id, 'stay', { x: c.x, z: c.z });
      else if (k === 'guard') this.d.command(c.id, 'guard', { x: p.x, z: p.z });
      else if (k === 'ride') {
        if (!this.d.canRide(c) && !r.rider) { bus.emit('think', p, hasUnlock('tame_ride') ? 'Too small to carry me.' : 'I would need a saddle protocol for that.'); return; }
        this.d.ride(c.id, !r.rider); this.close(); bus.emit('think', p, r.rider ? 'Off.' : 'Up I go.'); return;
      }
    } else if (name === 'knob') {
      if (!hasUnlock('tame_station')) { bus.emit('think', p, 'The selector is wired shut. It needs the labour directive.'); return; }
      const i = STATIONS.indexOf(r.station?.kind ?? null);
      this.d.assign(c.id, STATIONS[(i + 1) % STATIONS.length]);
    } else if (name === 'cargo') {
      this.close();
      const inv = c.inv; if (inv) { if (G.pack?.focus) G.pack.focus(inv); else G.ui?.inventory?.focus?.(inv); }
      return;
    } else if (name === 'scram') {
      if (!this.sure) { this.sure = true; return; }
      shake(0.2);
      this.d.release(c.id); this.close();
      bus.emit('think', p, 'The valves go dark behind its eyes. The cortex should still be in there.');
      return;
    }
    this.lcdT = 0;
  }

  update(dt: number) {
    const c = this.c, p = G.local;
    if (!c) return;
    if (!p || c.dead || c.zoneKey !== p.zoneKey || Math.hypot(c.x - p.x, c.z - p.z) > 5 || !this.d.rec(c)) { this.close(); return; }
    const r = this.d.rec(c)!;
    this.raise = Math.min(1, this.raise + dt * 5);
    const k = Math.min(1 - Math.pow(1 - this.raise, 3), fpBlend());
    const asp = innerWidth / Math.max(1, innerHeight);
    const nar = asp < 1.2;
    this.box.position.set(0.0, (nar ? -0.02 : 0.03) - (1 - k) * 0.2, -0.45);
    this.box.scale.setScalar(nar ? Math.max(0.55, asp * 1.35) : 1);
    this.box.rotation.set(-0.35 + (1 - k) * 0.5, -0.05, 0.02);
    // the toggles show the order it is under; pressed things dip
    for (const [key, tg] of this.toggles) {
      const on = key === 'ride' ? !!r.rider : r.mode === key && !r.rider;
      const want = on ? -0.55 : 0.55;
      tg.rotation.x += (want - tg.rotation.x) * Math.min(1, dt * 20);
    }
    const si = STATIONS.indexOf(r.station?.kind ?? null);
    const wantK = -(-1.1 + si * 0.55);
    this.knob.rotation.z += (wantK - this.knob.rotation.z) * Math.min(1, dt * 14);
    this.cover.rotation.x += ((this.sure ? -1.9 : 0) - this.cover.rotation.x) * Math.min(1, dt * 14);
    for (const [n, t] of this.press) { const v = Math.max(0, t - dt); this.press.set(n, v); if (n === 'cargo') this.cargoBtn.position.z = at(84, 84).z + 0.002 - v * 0.02; }
    // the left hand holds it by the lug; the right forefinger hovers over the controls and presses them
    const A = this.arms, kk = Math.min(1, dt * 12);
    this.box.updateMatrixWorld(true);
    A.aim('left', 'grip', 'grip', this.box.localToWorld(this.tw.set(0, -PH / M - 0.02, -0.04)), [-0.12, -0.46, -0.26], [0.2, 0.4, 1], kk);
    const tgt = this.hoverObj ?? this.toggles.get('follow')!;
    tgt.getWorldPosition(this.tw); this.tw.z += this.pressT > 0 ? 0.004 : 0.022; this.tw.y -= 0.004;
    A.aim('right', this.pressT > 0 ? 'press' : 'point', 'tip', this.tw, [0.28, -0.46, -0.28], [0, -0.55, -0.8], kk);
    this.pressT -= dt;
    A.update(dt);
    this.lcdT -= dt;
    if (this.lcdT <= 0) { this.lcdT = 0.25; this.drawLcd(c, r); }
  }

  private drawLcd(c: Creature, r: any) {
    const { ctx, canvas } = this.lcd, W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#020803'; ctx.fillRect(0, 0, W, H);
    const hp = Math.round((c.hp / c.sp.hp) * 100);
    const mode = r.rider ? 'RIDDEN' : r.mode === 'station' && r.station ? 'STATION ' + r.station.kind.toUpperCase() : r.mode.toUpperCase();
    phosphorText(ctx, r.name, 10, 6, { size: 20 });
    phosphorText(ctx, `BODY ${hp}%`, W - 10, 6, { size: 20, align: 'right', color: hp < 35 ? '#ffc070' : '#9dffb5' });
    phosphorText(ctx, mode + (Math.sin(G.time * 6) > 0 ? ' _' : ''), 10, 30, { size: 16, color: '#6fd88a' });
    this.lcd.flush();
  }

  private drawPlate() {
    const p = this.plate, s = p.s;
    p.reset(0xd8ccb0);
    p.paper(0, 0, PW, PH, 0xd8ccb0, 11);
    // enamel wear: grime in the corners, the paint rubbed through by thumbs round the controls
    const C = (c: number) => Screen.c(c);
    for (let i = 0; i < 260; i++) { const x = (i * 53) % PW, y = (i * 29 + (i >> 3)) % PH; if ((x < 10 || x > PW - 10 || y < 8 || y > PH - 8) || i % 7 === 0) s.px(x, y, C(i % 3 ? 0xb8a888 : 0x8a7a5a)); }
    for (let i = 0; i < 40; i++) s.px(14 + (i * 7) % 20, 70 + (i * 3) % 30, C(0x6a5a40));
    // a black outline round the plate and its four screws' sinks
    s.frame(0, 0, PW, PH, C(0x1a140c));
    for (const [x, y] of [[4, 4], [PW - 5, 4], [4, PH - 5], [PW - 5, PH - 5]]) { s.rect(x - 1, y - 1, 3, 3, C(0x5a4a30)); s.px(x, y, C(0x1a140c)); }
    // the LCD bezel
    s.rect(28, 4, 104, 22, C(0x2a1a10)); s.frame(27, 3, 106, 24, C(0x8a7a5a)); s.frame(26, 2, 108, 26, C(0x1a140c));
    // toggle labels on embossed tape, hex bosses round each toggle
    const hex = (cx: number, cy: number, r: number, c: number) => { for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2; s.line(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, c); } };
    for (const t of TOGGLES) {
      const w = t.label.length * 6 + 4;
      s.rect(t.x - (w >> 1), 54, w, 10, C(0x1a1a18)); s.hline(t.x - (w >> 1), t.x + (w >> 1) - 1, 54, C(0x3a3a36));
      p.sign(t.label, t.x, 55, 0xf0ece0, 7, { align: 'center' });
      hex(t.x, 44, 8, C(0x6a5e48)); hex(t.x, 44, 7, C(0xb8ac90));
      s.px(t.x, 34, C(0x1a140c)); p.sign('ON', t.x + 11, 33, 0x4a3a20, 5, { align: 'center' });
    }
    // the station dial: an octagonal scale plate with ticks
    const oct = (cx: number, cy: number, r: number, c: number) => { for (let i = 0; i < 8; i++) { const a0 = Math.PI / 8 + (i / 8) * Math.PI * 2, a1 = Math.PI / 8 + ((i + 1) / 8) * Math.PI * 2; s.line(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, c); } };
    oct(34, 86, 19, C(PAL.ink)); oct(34, 86, 18, C(0xe8dcb8));
    ST_LABEL.forEach((l, i) => { const a = -1.1 + i * 0.55 - Math.PI / 2; const x = 34 + Math.cos(a) * 24, y = 86 + Math.sin(a) * 24; s.line(34 + Math.cos(a) * 15, 86 + Math.sin(a) * 15, 34 + Math.cos(a) * 19, 86 + Math.sin(a) * 19, C(PAL.ink)); p.sign(l, x, y - 4, PAL.ink, 6, { align: 'center' }); });
    p.typed('STATION', 14, 101, PAL.ink, 7);
    // cargo: a square well; scram: a hazard-striped square frame
    s.rect(75, 75, 19, 19, C(0x3a3a38)); s.frame(74, 74, 21, 21, C(0x1a140c));
    p.typed('CARGO', 70, 98, PAL.ink, 7);
    for (let i = 0; i < 26; i++) { const c = ((i >> 1) & 1) ? 0x17150f : 0xe8b52a; s.px(119 + i, 71, C(c)); s.px(119 + i, 72, C(c)); s.px(119 + i, 96, C(c)); s.px(119 + i, 97, C(c)); s.px(119, 71 + i, C(c)); s.px(120, 71 + i, C(c)); s.px(144, 71 + i, C(c)); s.px(145, 71 + i, C(c)); }
    p.sign('SCRAM', 132, 99, PAL.inkRed, 8, { align: 'center' });
    p.flush();
  }
}
