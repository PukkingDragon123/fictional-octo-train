// The guide: Dr. Iris Calder walks the player through the menu, the rooms,
// build mode and the commissary in short lines (typed into the subtitle strip
// at the bottom of the picture, ./subline.ts), points at what she is talking
// about (a 3D spot in the room or a key on screen), reacts when she is clicked,
// follows the player from room to room (she walks in from the side), and can be
// muted (the desk telephone key): she says so and steps out until called back.
import * as THREE from 'three';
import type { MenuRoom, MenuRoomId } from '../menuRooms';
import { SubLine, type Style } from './subline';
import { createGuideRig, type GuideRig } from './researcher';
import { flag, setFlag } from '../deco/store';
import { sfx } from '../sfx';
import { Talk } from './talk';
import { tourRunning } from './tour';
import { calderHas, calderSay, calderStop, loadCalderVoice } from '../../../audio/calderVoice';

export type Aim = { el: () => HTMLElement | null } | { at: THREE.Vector3 } | null;
export interface Line { text: string; point?: Aim; look?: Aim; emote?: string; style?: Style; dur?: number; then?: () => void }

export interface GuideHost {
  /** the room the player is looking at */
  room(): MenuRoom | null;
  /** the active room's view rect on screen */
  rect(): DOMRect;
  layer: HTMLElement;
  anchor(k: 'blueprint' | 'shop' | 'guide' | 'tray' | 'menu'): HTMLElement | null;
  /** the 2D UI is hidden (a panel, the creator, the game starting) */
  hidden(): boolean;
}

const ROOM_INTRO: Record<MenuRoomId, string[]> = {
  monitor: ['The monitor room. Every camera in the building ends up on these tubes.', 'Three feeds, three rooms. Pick one and go look. I will come with you.'],
  archive: ['The codex archive. Everything we know about this place is in those cabinets.', 'Pull a file and put it on the table. The projector does the rest.'],
  research: ['The control room. The main computer keeps the research tree.', 'Spend your points on designs, recipes, chips and limbs. The benches are for your samples.'],
  subject: ['Unit room four. The next unit waits in that chair.', 'Tap a part of the unit and we will work on it. Chips and limbs go in here too.'],
};
const ROOM_AGAIN: Record<MenuRoomId, string[]> = {
  monitor: ['Back at the tubes.', 'Feeds are steady tonight.', 'Coffee is cold again. Of course it is.'],
  archive: ['Quiet in the stacks, please.', 'Somebody misfiled the moths again.', 'Every file in here is a unit that came back. Most of one.'],
  research: ['Anything new in the fridge?', 'The tape reader is hungry. Feed it points.', 'Do not tap the jar. I mean it.', 'Every node on that tree is a lesson somebody paid for.'],
  subject: ['The chair again.', 'Somebody always has to sit in it.', 'Smells like ozone in here.'],
};
const POKES: [string, string?][] = [
  ['Yes? I am listening.', 'wave'], ['That is my badge. Please do not.', 'shrug'], ['Careful. I am holding notes.'], ['Personal space, operator.', 'facepalm'],
  ['Still here.', 'bow'], ['Do you poke all the staff?', 'shrug'], ['I am flattered. Now. The menu.', 'point'],
];
const TIPS = [
  'Placed things can be clicked. They like it.',
  'Research points come from missions, scans and learning the rules.',
  'Build mode keeps every room separately. Go wild.',
  'Shelves take the small things. Statues want floor.',
  'The commissary restocks never. Everything is always there.',
];

export class Guide {
  private host: GuideHost;
  /** her lines, in the subtitle strip (no speech bubbles) */
  subs: SubLine;
  private rig: GuideRig | null = null;
  private loading = false;
  private roomId: MenuRoomId | null = null;
  private room: MenuRoom | null = null;
  private queue: Line[] = [];
  private cur: (Line & { h: ReturnType<SubLine['say']>; t: number; hold: number }) | null = null;
  private pos = new THREE.Vector3(); private goal = new THREE.Vector3();
  private walking = false; private yaw = 0;
  private gone = false; // muted and stepped out
  muted = flag<boolean>('guide.muted', false);
  private idleT = 0; private pokeN = 0; private checkT = 0;
  private fill = new THREE.PointLight(0xffd8b0, 0.9, 2.4, 2);
  private chars = 0;
  private v = new THREE.Vector3(); private w = new THREE.Vector3();
  onMute?: (m: boolean) => void;
  /** a conversation with her (clicked): ./talk.ts */
  talk: Talk | null = null;
  private close = false;

  constructor(host: GuideHost) {
    this.host = host;
    this.subs = new SubLine(host.layer);
    this.gone = this.muted;
    this.fill.position.set(0.25, 1.75, 0.75);
    this.fill.castShadow = false;
    void loadCalderVoice();
  }

  // ---------------------------------------------------------------- rooms
  /** the player is now looking at this room: she follows */
  follow(room: MenuRoom | null) {
    if (!room || room.id === this.roomId) return;
    const first = this.roomId === null;
    this.talk?.close();
    this.roomId = room.id; this.room = room;
    this.subs.clear(); this.cur = null;
    this.queue = this.queue.filter((l) => !l.look && !l.point);
    if (!this.rig) { this.ensureRig().then(() => this.arrive(room, first)); return; }
    this.arrive(room, first);
  }
  private async ensureRig() {
    if (this.rig || this.loading) return;
    this.loading = true;
    try { this.rig = await createGuideRig(); } catch (e) { console.warn('guide rig', e); }
    this.loading = false;
  }
  /** where she stands: the room's guide spot if the camera sees her there, else a spot the camera does see (right third, chest up) */
  private spot(room: MenuRoom) {
    const F = room.floor;
    const gs = room.guideSpot;
    const p = gs ? gs.pos.clone() : new THREE.Vector3(F.minX + (F.maxX - F.minX) * 0.22, F.y, F.minZ + (F.maxZ - F.minZ) * 0.7);
    return this.seen(room, p) ? p : this.viewSpot(room) ?? p;
  }
  /** her chest and head both on screen if she stood at p (room space) */
  private seen(room: MenuRoom, p: THREE.Vector3): boolean {
    const cam = room.camera;
    cam.updateMatrixWorld();
    const q = (y: number) => room.deco.localToWorld(this.w.set(p.x, p.y + y, p.z)).project(cam);
    const c = q(1.2);
    if (c.z > 1 || Math.abs(c.x) > 0.92 || c.y < -0.95 || c.y > 0.9) return false;
    const h = q(1.75);
    return h.z <= 1 && Math.abs(h.x) < 0.95 && h.y < 0.95 && h.y > -0.9;
  }
  private viewSpot(room: MenuRoom): THREE.Vector3 | null {
    const cam = room.camera;
    const F = room.floor;
    const o = cam.getWorldPosition(new THREE.Vector3());
    for (const D of [2.3, 1.9, 2.8, 1.6, 1.35]) for (const nx of [0.62, 0.52, 0.7, -0.6]) {
      const dir = new THREE.Vector3(nx, 0.1, 0.5).unproject(cam).sub(o).normalize();
      const pt = room.deco.worldToLocal(o.clone().addScaledVector(dir, D));
      const feet = new THREE.Vector3(pt.x, F.y, pt.z);
      if (feet.x < F.minX - 0.5 || feet.x > F.maxX + 0.5 || feet.z < F.minZ - 0.5 || feet.z > F.maxZ + 0.5) continue;
      if (this.seen(room, feet)) return feet;
    }
    return null;
  }
  private arrive(room: MenuRoom, first: boolean) {
    if (!this.rig || this.room !== room) return;
    room.deco.add(this.rig.root);
    // a soft warm fill that travels with her (dark rooms; she should read)
    if (!this.fill.parent || this.fill.parent !== this.rig.root) this.rig.root.add(this.fill);
    this.rig.root.visible = !this.gone;
    this.goal.copy(this.spot(room));
    // she walks in from the side of the view nearest her spot
    const F = room.floor;
    const side = this.goal.x < (F.minX + F.maxX) / 2 ? -1 : 1;
    this.pos.copy(this.goal).add(this.v.set(side * 1.3, 0, 0.25));
    this.pos.x = Math.max(F.minX - 0.6, Math.min(F.maxX + 0.6, this.pos.x));
    this.walking = true;
    this.rig.root.position.copy(this.pos);
    if (this.gone) return;
    if (!flag('guide.met', false)) { this.intro(); return; }
    const key = 'guide.room.' + room.id;
    if (!flag(key, false)) {
      setFlag(key, true);
      this.say(ROOM_INTRO[room.id].map((text, i) => ({ text, look: i === 0 ? { at: this.roomPoint(room) } : undefined, emote: i === 0 && !first ? 'wave' : undefined })));
    } else {
      const pool = ROOM_AGAIN[room.id];
      this.say([{ text: first ? 'Welcome back.' : pool[Math.floor(Math.random() * pool.length)], emote: first ? 'wave' : undefined }]);
    }
  }
  /** something worth looking at in a room: where she is told to look, else the room's middle */
  private roomPoint(room: MenuRoom): THREE.Vector3 {
    const w = room.guideSpot?.look.clone() ?? new THREE.Vector3((room.floor.minX + room.floor.maxX) / 2, 1.2, room.floor.minZ);
    return room.deco.localToWorld(w);
  }

  private intro() {
    setFlag('guide.met', true);
    if (this.room) setFlag('guide.room.' + this.room.id, true);
    const r = this.room!;
    this.say([
      { text: 'Oh, you are up. Dr. Iris Calder, Meridian research.', emote: 'wave' },
      { text: 'I will show you around. Click me if you need anything.' },
      { text: 'Your options float over there. New unit starts the contract.', point: { el: () => this.host.anchor('menu') } },
      ...ROOM_INTRO[r.id].map((text, i) => ({ text, look: i === 0 ? { at: this.roomPoint(r) } : undefined } as Line)),
      { text: 'See the little blueprint? Build mode. Make these rooms yours.', point: { el: () => this.host.anchor('blueprint') } },
      { text: 'The commissary sells figures and lab decor, for dollars: the Institute pays you for every load your units remit.', point: { el: () => this.host.anchor('shop') } },
      { text: 'I left two things in your tray. A plant. And a figure of me. For morale.', emote: 'shrug', then: () => this.onGift?.() },
      { text: 'The telephone up there puts me on hold if you want me quiet.', point: { el: () => this.host.anchor('guide') } },
    ]);
  }
  onGift?: () => void;

  // ---------------------------------------------------------------- talking
  say(lines: Line[], interrupt = false) {
    if (this.gone) return;
    if (interrupt) { this.queue = []; this.subs.clear(); this.cur = null; }
    this.queue.push(...lines);
    this.idleT = 0;
  }
  /** say a line now, dropping the rest of the queue */
  now(text: string, o: Partial<Line> = {}) { this.say([{ text, ...o }], true); }
  get talking() { return !!this.cur; }

  /** something happened in the menus (build mode, the shop, a purchase...) */
  event(kind: 'build' | 'shop' | 'buy' | 'poor' | 'place' | 'remove' | 'free', extra = '') {
    if (this.gone) return;
    const once = (k: string, lines: Line[]) => { if (flag('guide.' + k, false)) return false; setFlag('guide.' + k, true); this.say(lines, true); return true; };
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    switch (kind) {
      case 'build':
        if (!once('build', [
          { text: 'Build mode. Pick something from the tray along the bottom.', point: { el: () => this.host.anchor('tray') } },
          { text: 'Set it on the floor or a shelf. Q and E turn it. Z takes it back.' },
          { text: 'Click anything you placed to move it. The bin sends it back to the tray.' },
        ])) this.now(pick(['Redecorating?', 'Make it yours.', 'Mind the cables.']));
        break;
      case 'shop':
        if (!once('shop', [
          { text: 'The commissary. Headcases, statuettes, a fridge that hums.' },
          { text: 'Prices are in research points. You earn those out there.' },
        ])) this.now(pick(['Browsing again?', 'The vinyl ones are the good ones.', 'Something for the shelf?']));
        break;
      case 'buy': this.now(pick(['Good choice.', 'That one is my favourite. Do not tell the others.', 'It is in your tray.', 'Delivered.']), { emote: Math.random() < 0.4 ? 'clap' : undefined }); break;
      case 'free': this.now('That one is on me.'); break;
      case 'poor': this.now(pick(['Not enough research points. Missions, scans and the rules all pay.', 'Short on points. The Institute pays for knowledge.']), { emote: 'shrug' }); break;
      case 'place': if (Math.random() < 0.35) this.now(pick(['Oh, that works there.', 'Very homely. For a research facility.', 'Nice.', extra ? `The ${extra} suits the room.` : 'Lovely.'])); break;
      case 'remove': if (Math.random() < 0.25) this.now(pick(['Back in the tray it goes.', 'Fair. It was a lot.'])); break;
    }
  }

  setMuted(m: boolean) {
    if (m === this.muted) return;
    this.muted = m;
    setFlag('guide.muted', m);
    this.onMute?.(m);
    if (m) {
      this.queue = []; this.subs.clear(); this.cur = null;
      this.gone = false;
      this.say([{ text: 'I will be quiet. Pick up the telephone if you need me.', emote: 'bow', then: () => { this.gone = true; } }], true);
    } else {
      this.gone = false;
      if (this.rig) this.rig.root.visible = true;
      if (this.room) { this.roomId = null; const r = this.room; this.room = null; this.follow(r); }
      this.say([{ text: 'Back. Did you miss me?', emote: 'wave' }], true);
    }
  }

  // ---------------------------------------------------------------- clicks
  /** a press on the room: true if it hit her */
  press(cx: number, cy: number): boolean {
    const rig = this.rig, room = this.room;
    if (!rig || !room || this.gone || !rig.root.visible) return false;
    const r = this.host.rect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), room.camera);
    if (!ray.intersectObject(rig.hitProxy, false).length) return false;
    if (this.talk) { if (this.cur && !this.cur.h.typed) this.subs.skip(); return true; }
    rig.flinch();
    if (this.cur && !this.cur.h.typed) { this.subs.skip(); return true; }
    if (this.cur || this.queue.length) { this.next(); return true; }
    // a click when she is free: a conversation (the odd poke still gets a word first)
    if (this.pokeN++ % 5 === 4) { const [text, emote] = POKES[(this.pokeN / 5 | 0) % POKES.length]; this.now(text, { emote }); sfx('tick', 0.5); return true; }
    this.openTalk();
    return true;
  }
  /** over her (for the cursor) */
  over(cx: number, cy: number): boolean {
    const rig = this.rig, room = this.room;
    if (!rig || !room || this.gone || !rig.root.visible) return false;
    const r = this.host.rect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), room.camera);
    return ray.intersectObject(rig.hitProxy, false).length > 0;
  }
  private next() {
    if (this.cur) { this.cur.h.close(); this.cur.then?.(); this.cur = null; }
  }

  /** open a conversation with her (also the lab menu's "Talk" key) */
  openTalk() {
    if (this.talk || !this.rig || !this.room || this.gone || tourRunning()) return;
    this.queue = []; if (this.cur) { this.cur.h.close(); this.cur = null; }
    this.talk = new Talk({
      layer: this.host.layer,
      speak: (lines, done) => this.say(lines.map((l, i) => ({ text: l.text, emote: l.emote, then: i === lines.length - 1 ? done : undefined })), true),
      twoShot: (on) => { this.close = on; this.checkT = 99; if (this.room) { const s = on ? this.closeSpot(this.room) : this.spot(this.room); if (s) { this.goal.copy(s); this.walking = true; } } },
      closed: () => { this.talk = null; },
    });
  }
  /** the two-shot: close to the lens, off centre, chest and head in the picture */
  private closeSpot(room: MenuRoom): THREE.Vector3 | null {
    const cam = room.camera, F = room.floor;
    const o = cam.getWorldPosition(new THREE.Vector3());
    for (const D of [1.3, 1.5, 1.15, 1.75, 2.0]) for (const nx of [-0.42, -0.5, -0.34, 0.42]) {
      const dir = new THREE.Vector3(nx, 0.05, 0.5).unproject(cam).sub(o).normalize();
      const pt = room.deco.worldToLocal(o.clone().addScaledVector(dir, D));
      const feet = new THREE.Vector3(pt.x, F.y, pt.z);
      if (feet.x < F.minX - 0.3 || feet.x > F.maxX + 0.3 || feet.z < F.minZ - 0.3 || feet.z > F.maxZ + 0.3) continue;
      if (this.seen(room, feet)) return feet;
    }
    return this.viewSpot(room);
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const rig = this.rig, room = this.room;
    if (!rig || !room) return;
    const hide = this.host.hidden();
    this.subs.layer.style.visibility = hide ? 'hidden' : '';
    // gone (muted): walk out of the picture, then vanish
    if (this.gone && rig.root.visible) {
      const F = room.floor;
      this.goal.set(this.pos.x < (F.minX + F.maxX) / 2 ? F.minX - 1.4 : F.maxX + 1.4, F.y, this.pos.z);
      this.walking = true;
      if (Math.abs(this.pos.x - this.goal.x) < 0.1) rig.root.visible = false;
    }
    // walking
    let speed = 0;
    const d = this.v.copy(this.goal).sub(this.pos); d.y = 0;
    const dist = d.length();
    if (this.walking && dist > 0.04) {
      speed = Math.min(1.15, dist * 2.2 + 0.3);
      const step = Math.min(dist, speed * dt);
      this.pos.addScaledVector(d.normalize(), step);
      this.turnTo(Math.atan2(d.x, d.z), dt, 8);
    } else {
      this.walking = false;
      // face the camera (the player), easing
      const cam = room.camera;
      cam.getWorldPosition(this.w);
      room.deco.worldToLocal(this.w);
      this.turnTo(Math.atan2(this.w.x - this.pos.x, this.w.z - this.pos.z), dt, 3);
    }
    rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    rig.root.rotation.y = this.yaw;
    // the camera moved (a dive, a reframe): step back into the picture
    this.checkT += dt;
    if (this.checkT > 1.2 && !this.walking && !this.gone && !this.close) {
      this.checkT = 0;
      if (!this.seen(room, this.pos)) { const s = this.viewSpot(room); if (s && s.distanceTo(this.pos) > 0.2) { this.goal.copy(s); this.walking = true; } }
    }
    // the line being said; the next one when it is done
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.h.done) { const c = this.cur; this.cur = null; c.then?.(); }
    }
    if (!this.cur && this.queue.length && (!this.walking || this.talk) && !hide) this.start(this.queue.shift()!);
    // idle chatter, rarely
    this.idleT += dt;
    if (!this.cur && !this.queue.length && !this.gone && !this.talk && this.idleT > 45 && !hide) { this.idleT = 0; this.say([{ text: TIPS[Math.floor(Math.random() * TIPS.length)] }]); }
    // where she looks / points
    const ln = this.cur;
    const point = ln?.point && ln.t > 0.25 && ln.t < ln.hold ? this.aim(ln.point, room) : null;
    const look = point ?? (ln?.look ? this.aim(ln.look, room) : null) ?? room.camera.getWorldPosition(this.w);
    rig.update(dt, { speed: this.walking ? speed : 0, look, point, talking: this.subs.talking });
    this.subs.update(dt);
  }
  private turnTo(a: number, dt: number, k: number) {
    let da = a - this.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.yaw += da * Math.min(1, dt * k);
  }
  private start(l: Line) {
    const rig = this.rig!;
    this.chars = 0;
    // the one place a line starts (a recorded voice for the line hooks in here)
    // her recorded voice where the line has one (public/voice/calder), the typewriter otherwise
    calderStop();
    const voiced = calderHas(l.text) && calderSay(l.text, { vol: 0.9 }) !== null;
    const h = this.subs.say(l.text, {
      style: l.style, dur: l.dur,
      onChar: (ch) => { if (!voiced && ch !== ' ' && (this.chars++ & 1) === 0) sfx('type', 0.12); },
    });
    if (l.emote) rig.emote(l.emote);
    this.cur = { ...l, h, t: 0, hold: 1.6 + l.text.length * 0.06 };
  }
  /** a world point for an aim */
  private aim(a: Aim, room: MenuRoom): THREE.Vector3 | null {
    if (!a) return null;
    if ('at' in a) return a.at;
    const el = a.el();
    if (!el || !el.isConnected) return null;
    const br = el.getBoundingClientRect();
    if (br.width < 1) return null;
    const r = this.host.rect();
    const nx = ((br.left + br.width / 2 - r.left) / r.width) * 2 - 1, ny = -((br.top + br.height / 2 - r.top) / r.height) * 2 + 1;
    // at the depth of her shoulder, so the arm points across the screen at the key
    const rig = this.rig!;
    rig.head(this.v);
    this.v.project(room.camera);
    return new THREE.Vector3(Math.max(-1.2, Math.min(1.2, nx)), Math.max(-1.2, Math.min(1.2, ny)), this.v.z).unproject(room.camera);
  }

  dispose() { this.talk?.close(); this.rig?.dispose(); this.rig = null; this.subs.dispose(); }
}
