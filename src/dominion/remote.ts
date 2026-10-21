// The thrall remote: a bakelite control box you hold up in first person when
// you press E on one of your thralls. A green phosphor strip shows the unit
// and its body; bat-handle toggles set FOLLOW / STAY / GUARD / RIDE; a rotary
// selector picks its STATION; a hatch button opens the CARGO; a red SCRAM
// button under a flip cover shuts it down. Everything is clicked or tapped.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { fpGroup, fpClaim, fpRelease, fpCamera } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { hasUnlock } from '../game/research';
import { shake } from '../gfx/juice';
import { PixTex, PAL, PointerLayer, flatMat, overlayRay } from '../scan/pix';
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
  private lcd = new PixTex(96, 16);
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

  constructor(private d: DominionSystem) {
    this.g = fpGroup('remote');
    this.g.add(new THREE.AmbientLight(0xd0c8b8, 0.75));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.1); key.position.set(-0.3, 0.9, 1); this.g.add(key);
    this.g.add(this.box);
    const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
    const mb = new ModelBuilder();
    mb.box(0, -PH / M - 0.006, -0.018, PW / M + 0.012, PH / M + 0.012, 0.032, 'plastic_black', { color: 0x4a2e1c });
    mb.box(0, -PH / M / 2 + 0.03, -0.034, 0.03, 0.06, 0.02, 'plastic_black', { color: 0x3a2416 }); // handle lug
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) mb.box(x * (PW / M / 2 - 0.004), y * (PH / M / 2 - 0.004) - PH / M / 2 + 0.0, 0.0, 0.004, 0.004, 0.002, 'chrome');
    mb.cylinder(-0.06, 0.004, -0.02, 0.003, 0.06, 5, 'chrome'); // aerial
    this.box.add(new THREE.Mesh(mb.build(), mat));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PW / M, PH / M), flatMat(this.plate.tex));
    face.position.set(0, -PH / M / 2, 0.0005); this.box.add(face);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.016), flatMat(this.lcd.tex, true));
    lcd.position.copy(at(80, 14)).add(new THREE.Vector3(0, -PH / M / 2, 0.001)); this.box.add(lcd);
    // bat-handle toggles
    for (const t of TOGGLES) {
      const tg = new THREE.Group(); tg.name = 'tg:' + t.k;
      const tb = new ModelBuilder();
      tb.cylinder(0, 0, 0, 0.006, 0.004, 8, 'chrome');
      tb.cylinder(0, 0.002, 0, 0.0018, 0.016, 6, 'chrome');
      tb.sphere(0, 0.018, 0, 0.0028, 6, 4, 'chrome');
      const lever = new THREE.Mesh(tb.build(), mat); lever.name = 'tg:' + t.k;
      lever.rotation.x = Math.PI / 2;
      tg.add(lever);
      tg.position.copy(at(t.x, 44)).add(new THREE.Vector3(0, -PH / M / 2, 0.002));
      this.box.add(tg); this.toggles.set(t.k, tg);
    }
    // the station selector
    const kb = new ModelBuilder();
    kb.cylinder(0, 0, 0, 0.013, 0.01, 12, 'plastic_black', { color: 0x2a1a10 });
    kb.box(0, 0.011, 0.007, 0.003, 0.002, 0.01, 'white', { color: 0xf0e6d0 });
    const knobM = new THREE.Mesh(kb.build(), mat); knobM.name = 'knob'; knobM.rotation.x = Math.PI / 2;
    this.knob.add(knobM); this.knob.position.copy(at(34, 86)).add(new THREE.Vector3(0, -PH / M / 2, 0.003)); this.box.add(this.knob);
    // the cargo hatch button
    const cb = new ModelBuilder(); cb.cylinder(0, 0, 0, 0.009, 0.007, 10, 'plastic_black', { color: 0x1a1a1a });
    this.cargoBtn = new THREE.Mesh(cb.build(), mat); this.cargoBtn.name = 'cargo'; this.cargoBtn.rotation.x = Math.PI / 2;
    this.cargoBtn.position.copy(at(84, 84)).add(new THREE.Vector3(0, -PH / M / 2, 0.002)); this.box.add(this.cargoBtn);
    // SCRAM: a red mushroom under a hinged clear cover
    const sb = new ModelBuilder(); sb.cylinder(0, 0, 0, 0.004, 0.006, 8, 'chrome'); sb.sphere(0, 0.007, 0, 0.011, 10, 5, 'plastic_red', { color: 0xc0281a, sy: 0.6 });
    const scram = new THREE.Mesh(sb.build(), mat); scram.name = 'scram'; scram.rotation.x = Math.PI / 2;
    scram.position.copy(at(132, 84)).add(new THREE.Vector3(0, -PH / M / 2, 0.002)); this.box.add(scram);
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.014), new THREE.MeshLambertMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.35 }));
    cv.name = 'scram'; cv.position.set(0, -0.015, 0.007); this.cover.add(cv);
    this.cover.position.copy(at(132, 69)).add(new THREE.Vector3(0, -PH / M / 2, 0.003)); this.box.add(this.cover);
    this.drawPlate();
    this.layer = new PointerLayer('remote', { down: (e) => this.click(e) });
    window.addEventListener('keydown', (e) => { if (this.c && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
  }

  get open() { return !!this.c; }
  get forId() { return this.c?.id ?? null; }

  show(c: Creature) {
    if (!fpClaim('remote', 4)) return;
    this.c = c; this.sure = false; this.raise = 0;
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
    const k = 1 - Math.pow(1 - this.raise, 3);
    this.box.position.set(0.0, -0.02 - (1 - k) * 0.2, -0.42);
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
    this.lcdT -= dt;
    if (this.lcdT <= 0) { this.lcdT = 0.25; this.drawLcd(c, r); }
  }

  private drawLcd(c: Creature, r: any) {
    const p = this.lcd, s = p.s;
    p.crt(0, 0, 96, 16);
    const hp = Math.round((c.hp / c.sp.hp) * 100);
    p.phos(r.name, 3, 1, PAL.phos, 1, 60);
    p.phos(`${hp}%`, 72, 1, hp < 35 ? PAL.amber : PAL.phos, 1, 24);
    const mode = r.rider ? 'RIDDEN' : r.mode === 'station' && r.station ? 'STN ' + r.station.kind : r.mode;
    p.phos(mode, 3, 9 - 1, 0x5ac04a, 1, 92);
    if (Math.sin(G.time * 6) > 0) s.px(93, 2, Screen.c(PAL.phos));
    p.flush();
  }

  private drawPlate() {
    const p = this.plate, s = p.s;
    s.clear(0xd8ccb0);
    p.paper(0, 0, PW, PH, 0xd8ccb0, 11);
    // the LCD bezel
    s.rect(28, 4, 104, 22, Screen.c(0x2a1a10)); s.frame(27, 3, 106, 24, Screen.c(0x8a7a5a));
    // toggle labels on embossed tape
    for (const t of TOGGLES) {
      const w = t.label.length * 6 + 4;
      s.rect(t.x - (w >> 1), 54, w, 10, Screen.c(0x1a1a18));
      s.text(t.label, t.x - (w >> 1) + 2, 55, Screen.c(0xf0ece0));
      s.disc(t.x, 44, 8, Screen.c(0xb8ac90)); s.circle(t.x, 44, 8, Screen.c(0x6a5e48));
    }
    // the station dial ring
    s.disc(34, 86, 19, Screen.c(0xe8dcb8)); s.circle(34, 86, 19, Screen.c(PAL.ink));
    ST_LABEL.forEach((l, i) => { const a = -1.1 + i * 0.55 - Math.PI / 2; const x = 34 + Math.cos(a) * 24, y = 86 + Math.sin(a) * 24; s.line(34 + Math.cos(a) * 15, 86 + Math.sin(a) * 15, 34 + Math.cos(a) * 19, 86 + Math.sin(a) * 19, Screen.c(PAL.ink)); s.text(l, Math.round(x - l.length * 3), Math.round(y - 3), Screen.c(PAL.ink)); });
    p.typed('STATION', 14, 102, PAL.ink, 1, 60, 3);
    // cargo and scram
    s.disc(84, 84, 12, Screen.c(0x3a3a38));
    p.typed('CARGO', 70, 99, PAL.ink, 1, 40, 4);
    for (let a = 0; a < 24; a++) { const u = (a / 24) * Math.PI * 2; s.line(132 + Math.cos(u) * 12, 84 + Math.sin(u) * 12, 132 + Math.cos(u) * 15, 84 + Math.sin(u) * 15, Screen.c(a % 2 ? 0x17150f : 0xe8b52a)); }
    p.typed('SCRAM', 118, 101, PAL.inkRed, 1, 40, 5);
    p.flush();
  }
}
