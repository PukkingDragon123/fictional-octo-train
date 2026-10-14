// Directives, flags, signals and the collapse of the simulation.
//
// All mission progress is a set of string flags ("read:note_wake",
// "node:SRV-1", "visit:office", ...) plus the replicated world state (power,
// objects). Flags travel through the op layer, so co-op peers and save games
// only ever need the flag set. Directives are data: each objective is a
// predicate over flags/world, evaluated twice a second by the host.
import { bus } from '../core/events';
import { G } from '../game/G';
import { defOp, op } from '../game/ops';
import { U } from '../gfx/materials';
import { clamp } from '../core/math';
import { lore } from '../content/loreRegistry';
import { objDef } from '../world/objects';
import { itemDef } from '../items/item';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import type { TileObject, Zone } from '../world/zone';
import type { MenuOption } from '../ui/ui';

export interface Objective {
  id: string;
  text: string;
  check: (m: MissionSystem) => boolean;
  optional?: boolean;
}
export interface SignalDef {
  id: string; zone: string; freq: number; name: string;
  x?: number; z?: number;
  /** resolved from zone.meta.anchors when x/z are not given */
  anchor?: string;
  range?: number;
  text?: string;
}
export interface DirectiveDef {
  key: string;
  title: string;
  desc: string;
  from?: string;
  main?: boolean;
  after?: string[];
  when?: (m: MissionSystem) => boolean;
  objectives: Objective[];
  signals?: SignalDef[];
  /** radio line printed when the directive arrives */
  intro?: string;
  outro?: string;
  onStart?: (m: MissionSystem) => void;
  onDone?: (m: MissionSystem) => void;
}

const DEFS: DirectiveDef[] = [];
export function defDirective(d: DirectiveDef) { DEFS.push(d); return d; }
export function directiveDefs() { return DEFS; }

/** helpers for objective predicates */
export const has = (f: string) => (m: MissionSystem) => m.flags.has(f);
export const count = (prefix: string, n: number) => (m: MissionSystem) => { let k = 0; for (const f of m.flags) if (f.startsWith(prefix)) k++; return k >= n; };

const NODE_IDS = ['SRV-1', 'SRV-2', 'SRV-3'];
const COLLAPSE_AT = [0, 0.22, 0.45, 0.78];

// flag replication
defOp('mflag', (a: { k: string; on?: boolean }) => {
  const m = G.missions as MissionSystem | null;
  if (!m) return;
  if (a.on === false) m.flags.delete(a.k); else m.flags.add(a.k);
  bus.emit('flag', a.k, a.on !== false);
});

export class MissionSystem implements GameSystem {
  name = 'missions';
  flags = new Set<string>();
  /** species unlocked in the codex by reading research notes */
  codex: string[] = [];
  /** directives on (story mode) or off (free survival) */
  enabled = true;
  unread = false;
  private checkT = 0;
  private notified = new Set<string>();
  private glitchT = 20;
  private roomKey = '';
  private endingStarted = false;

  constructor() {
    bus.on('loreRead', (p: Player, id: string) => this.onLore(p, id));
    bus.on('scanned', (c: any) => { if (c?.sp?.key) this.set('scan:' + c.sp.key); });
    bus.on('enterZone', (z: Zone, p: Player) => { if (p?.isLocal) { this.set('visit:' + z.key); this.zoneBlurb(z); } });
    bus.on('inventoryChanged', (p: Player) => { if (p?.isLocal) this.scanInventory(p); });
    bus.on('crafted', (p: Player, r: any) => { const k = typeof r === 'string' ? r : r?.key; if (p?.isLocal && k) this.set('craft:' + k); });
    bus.on('tamed', (c: any) => { if (c?.sp?.key) this.set('tamed:' + c.sp.key); });
    bus.on('sleepEnd', (p: Player) => { if (p?.isLocal) this.set('tut:slept'); });
    bus.on('consumed', (p: Player, key: string) => {
      if (!p?.isLocal) return;
      const d = itemDef(key);
      if (d.cat === 'drink' || d.fluidCap) this.set('tut:drink');
      if (d.cat === 'food') this.set('tut:eat');
    });
    bus.on('creatureKilled', (c: any, killer: any) => { if (killer?.isLocal && c?.sp?.key) this.set('kill:' + c.sp.key); });
  }

  // ---------------------------------------------------------------- flags
  set(k: string) { if (!this.flags.has(k)) op('mflag', { k }); }
  clear(k: string) { if (this.flags.has(k)) op('mflag', { k, on: false }); }
  /** servers disabled so far */
  get stage() { let n = 0; for (const id of NODE_IDS) if (this.flags.has('node:' + id)) n++; return n; }
  get collapse() { return G.collapse; }

  // ---------------------------------------------------------------- locks
  isUnlocked(req: string, p?: Player): boolean {
    if (!req) return true;
    if (req.startsWith('any:')) return req.slice(4).split('|').some((r) => this.isUnlocked(r, p));
    const [kind, ...rest] = req.split(':');
    const arg = rest.join(':');
    switch (kind) {
      case 'power': {
        const [zk, c] = arg.split(':');
        const z = G.zones.get(zk);
        if (!z) return false;
        return z.circuitPowered(Number(c)) || !!G.items?.circuitOnGenerator?.(z, Number(c));
      }
      case 'flag': return this.flags.has(arg);
      case 'stage': return this.stage >= Number(arg);
      case 'item': return !!p?.findItem((i) => i.key === arg);
      case 'never': return false;
      default: return true;
    }
  }
  lockText(req: string): string {
    if (req.startsWith('any:')) return this.lockText(req.slice(4).split('|')[0]);
    if (req.startsWith('power:')) return 'Dead. No power reaches it.';
    if (req.startsWith('item:keycard')) return 'A card reader blinks red.';
    if (req.startsWith('item:')) return `It needs something. (${itemDef(req.slice(5)).name})`;
    if (req === 'flag:lab_code') return 'A keypad. Six digits. I don\'t know them.';
    if (req.startsWith('flag:')) return 'It won\'t open. Not yet.';
    if (req.startsWith('stage:')) return 'The way is shut. The simulation is still holding it together.';
    return 'It won\'t budge.';
  }

  // ---------------------------------------------------------------- signals
  signalsFor(zoneKey: string) {
    const z = G.zones.get(zoneKey);
    const out: { id: string; freq: number; x: number; z: number; range: number; name: string; text?: string }[] = [];
    for (const s of (z?.meta.signals as any[]) || []) out.push(s);
    for (const d of this.active()) for (const s of d.signals || []) {
      if (s.zone !== zoneKey || !z) continue;
      const a = s.anchor ? z.meta.anchors?.[s.anchor] : null;
      const x = s.x ?? (a ? a[0] + 0.5 : NaN), zz = s.z ?? (a ? a[1] + 0.5 : NaN);
      if (Number.isNaN(x)) continue;
      out.push({ id: s.id, freq: s.freq, x, z: zz, range: s.range ?? 120, name: s.name, text: s.text });
    }
    return out;
  }
  onSignalLock(sig: any) { if (sig?.id) this.set('sig:' + sig.id); }
  onScan(c: any) { if (c?.sp?.key) this.set('scan:' + c.sp.key); }

  // ---------------------------------------------------------------- directives
  started(d: DirectiveDef) { return this.flags.has('start:' + d.key); }
  done(d: DirectiveDef) { return this.flags.has('done:' + d.key); }
  active() { return DEFS.filter((d) => this.started(d) && !this.done(d)); }
  /** directives shown on the LOG page: active first, then the latest finished */
  visible() {
    const act = this.active().sort((a, b) => Number(!!b.main) - Number(!!a.main));
    const fin = DEFS.filter((d) => this.done(d)).reverse().slice(0, 3);
    return [...act, ...fin].map((d) => ({
      key: d.key, title: d.title, desc: d.desc, from: d.from, done: this.done(d), main: d.main,
      objectives: d.objectives.map((o) => ({ text: o.text + (o.optional ? ' (optional)' : ''), done: this.done(d) || this.objDone(d, o) })),
    }));
  }
  private objDone(d: DirectiveDef, o: Objective) { try { return this.flags.has(`obj:${d.key}:${o.id}`) || o.check(this); } catch { return false; } }

  private available(d: DirectiveDef) {
    if (!this.enabled && d.main) return false;
    if (!this.enabled) return false;
    if (d.after && !d.after.every((k) => this.flags.has('done:' + k))) return false;
    return d.when ? d.when(this) : true;
  }

  private evaluate() {
    for (const d of DEFS) {
      if (!this.started(d)) {
        if (!this.available(d)) continue;
        this.set('start:' + d.key);
        d.onStart?.(this);
        continue;
      }
      if (this.done(d)) continue;
      let all = true;
      for (const o of d.objectives) {
        const ok = this.objDone(d, o);
        if (ok && !this.flags.has(`obj:${d.key}:${o.id}`)) this.set(`obj:${d.key}:${o.id}`);
        if (!ok && !o.optional) all = false;
      }
      if (all) { this.set('done:' + d.key); d.onDone?.(this); }
    }
  }

  /** local presentation of flag changes (toasts, chirps, radio lines) */
  private present() {
    for (const d of DEFS) {
      const sk = 'start:' + d.key, dk = 'done:' + d.key;
      if (this.flags.has(sk) && !this.notified.has(sk)) {
        this.notified.add(sk);
        if (this.flags.has(dk)) { this.notified.add(dk); for (const o of d.objectives) this.notified.add(`obj:${d.key}:${o.id}`); continue; }
        this.unread = true;
        G.ui?.toast?.(d.main ? 'NEW DIRECTIVE' : 'SIDE DIRECTIVE', d.title, 4.5);
        G.audio?.ui?.('radarPing');
        if (d.intro) this.radio(d.intro, 7);
      }
      for (const o of d.objectives) {
        const ok = `obj:${d.key}:${o.id}`;
        if (this.flags.has(ok) && !this.notified.has(ok)) { this.notified.add(ok); if (!this.flags.has(dk)) { G.ui?.toast?.('✓ ' + o.text, '', 2.8); G.audio?.ui?.('scanDone'); } }
      }
      if (this.flags.has(dk) && !this.notified.has(dk)) {
        this.notified.add(dk);
        G.ui?.toast?.('DIRECTIVE COMPLETE', d.title, 4.5);
        G.audio?.ui?.('scanDone');
        if (d.outro) setTimeout(() => this.radio(d.outro!, 8), 2500);
      }
    }
  }

  radio(text: string, secs = 6) {
    if (!G.local) return;
    G.ui?.say?.(G.local, text, 'radio', secs);
    G.audio?.ui?.('static_burst', 0.25);
  }

  markRead() { this.unread = false; }

  // ---------------------------------------------------------------- events
  private onLore(p: Player, id: string) {
    if (!p?.isLocal) return;
    this.set('read:' + id);
    const e: any = lore(id);
    if (!e) return;
    for (const f of e.sets || []) this.set(f);
    for (const sp of e.codex || []) if (!this.codex.includes(sp)) { this.codex.push(sp); G.ui?.toast?.('CODEX UPDATED', '', 2.5); }
  }
  private scanInventory(p: Player) {
    for (const it of p.allItems()) {
      const d = itemDef(it.key);
      if (d.tags?.includes('mission') || d.tags?.includes('keycard') || d.tags?.includes('key')) this.set('got:' + it.key);
      if (it.key === 'flashlight' || d.light) this.set('got:light');
    }
  }
  private zoneBlurb(z: Zone) {
    if (this.flags.has('visit:' + z.key) && this.notified.has('blurb:' + z.key)) return;
    this.notified.add('blurb:' + z.key);
    if (z.key === 'lobby' && G.clock.hours < 9.5) return;
    G.ui?.toast?.(z.name.toUpperCase(), (z.meta.blurb as string) || '', 4.5);
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const p = G.local;
    // tutorial flags read from local state
    if (p) {
      if (p.scannerOpen) this.set('tut:scanner');
      if (p.flashlightOn) this.set('tut:light');
      const z = G.zones.get(p.zoneKey);
      if (z) {
        const r = z.roomAt(p.tileX(), p.tileY());
        const rk = `room:${z.key}:${r.type}`;
        if (rk !== this.roomKey) { this.roomKey = rk; if (r.id) this.set(rk); }
      }
    }
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      if (G.role !== 'client') this.evaluate();
      this.present();
    }
    this.updateCollapse(dt);
  }

  private updateCollapse(dt: number) {
    const days = G.clock.hours / 24;
    const drift = Math.min(0.12, days * 0.004 * (G.sandbox.collapseSpeed ?? 1));
    const target = clamp(COLLAPSE_AT[this.stage] + drift, 0, 1);
    G.collapse += clamp(target - G.collapse, -dt * 0.02, dt * 0.02);
    const zoneResist = G.zone?.env.collapseResist ?? 0;
    U.uCollapse.value = Math.max(0, G.collapse - zoneResist) * 0.7;
    // reality hiccups: short tearing bursts, more often as it unravels
    this.glitchT -= dt;
    if (this.glitchT <= 0) {
      this.glitchT = (45 - this.stage * 11) * (0.5 + Math.random());
      if (G.collapse > 0.08) {
        const amt = 0.3 + G.collapse * 0.9;
        const fx = G.pr.fx;
        fx.glitch = Math.max(fx.glitch, amt);
        G.audio?.ui?.('static_burst', 0.12 + G.collapse * 0.2);
        setTimeout(() => { fx.glitch = Math.max(0, fx.glitch - amt); }, 160 + Math.random() * 260);
      }
    }
  }

  // ---------------------------------------------------------------- mission objects
  objectOptions(p: Player, o: TileObject): MenuOption[] {
    const d = objDef(o.key);
    const tags = d?.tags || [];
    const z = G.getZone(p.zoneKey);
    const out: MenuOption[] = [];
    const cx = o.x + 0.5, cz = o.y + 0.5;
    const act = (name: string, secs: number, anim: string, fn: () => void, tick?: (dt: number) => void) => () => queueAt(p, cx, cz, new UseObjectAction(p, name, secs, anim as any, fn, tick), 1.6);
    // ---- the lobby fuse panel (FIRST LIGHT)
    if (o.state.mission === 'first_light') {
      const fuses = o.state.fuses ?? 0;
      const need = 3;
      out.push({ label: 'Inspect the panel', action: act('Inspect', 1.2, 'hold_item', () => bus.emit('think', p, fuses >= need ? 'All fuses seated. The main switch is down.' : `${need - fuses} fuse slot${need - fuses > 1 ? 's are' : ' is'} empty. Circuit 99 is labelled ELEVATOR.`)) });
      if (fuses < need) {
        const fuse = p.findItem((i) => i.key === 'fuse');
        out.push({ label: 'Fit a fuse', disabled: !fuse ? 'needs a fuse' : false, action: act('Fit fuse', 2.5, 'craft', () => {
          const f = p.findItem((i) => i.key === 'fuse'); if (!f) return;
          p.removeItem(f);
          op('objState', { z: z.key, uid: o.uid, patch: { fuses: (o.state.fuses ?? 0) + 1 } });
          G.audio?.at?.('lock', cx, cz);
          bus.emit('inventoryChanged', p);
          if ((o.state.fuses ?? 0) >= need) this.set('fuses_fitted');
        }) });
      } else if (!z.circuitPowered(99)) {
        out.push({ label: 'Throw the main switch', action: act('Throw switch', 1.4, 'push', () => {
          op('circuit', { z: z.key, c: 99, on: true });
          this.set('first_light');
          bus.emit('noise', { x: cx, z: cz, radius: 30, kind: 'power', zone: z.key, by: p.id });
        }) });
      } else out.push({ label: 'Circuit 99 is live', disabled: true });
      return out;
    }
    // ---- pool pump plant (PRESSURE)
    if (o.state.mission === 'valve') {
      const open = !!o.state.open;
      out.push({ label: open ? `Close valve ${o.state.valve}` : `Open valve ${o.state.valve}`, action: act(open ? 'Close valve' : 'Open valve', 3.5, 'push', () => {
        op('objState', { z: z.key, uid: o.uid, patch: { open: !open } });
        G.audio?.at?.('metal_clank', cx, cz, 0.7);
      }) });
      return out;
    }
    if (o.state.mission === 'pump_start') {
      const valves = [...z.objects.values()].filter((q) => q.state.mission === 'valve');
      const allOpen = valves.length > 0 && valves.every((q) => q.state.open);
      if (this.flags.has('pumps_on')) { out.push({ label: 'Pressure 3.2 bar. Running.', disabled: true }); return out; }
      out.push({ label: 'Press START', disabled: allOpen ? false : 'valves are closed', action: act('Start pumps', 2, 'push', () => {
        this.set('pumps_on');
        G.audio?.at?.('power_on', cx, cz);
        bus.emit('noise', { x: cx, z: cz, radius: 35, kind: 'machine', zone: z.key, by: p.id });
      }) });
      return out;
    }
    // ---- render nodes (SRV-1..3)
    if (tags.includes('node')) {
      const id = (o.state.node as string) || 'SRV-?';
      const down = !!o.state.down || this.flags.has('node:' + id);
      out.push({ label: `Read the node display`, action: act('Read', 1.5, 'read', () => G.ui?.read?.(`RENDER NODE ${id}`, nodeText(id, down, this), 'terminal')) });
      if (down) return out;
      const tool = p.findTool('#screwdriver');
      const needsRoot = id === 'SRV-3';
      const root = p.findItem((i) => i.key === 'root_key');
      const blocked = !tool ? 'needs a screwdriver' : needsRoot && !root ? 'refuses without a root key' : false;
      const secs = id === 'SRV-1' ? 18 : id === 'SRV-2' ? 26 : 40;
      let pulse = 0;
      out.push({ label: `Disable node ${id}`, danger: true, disabled: blocked, action: act(`Disable ${id}`, secs, 'craft', () => {
        op('objState', { z: z.key, uid: o.uid, patch: { down: true, on: false } });
        this.set('node:' + id);
        G.audio?.at?.('power_off', cx, cz);
        G.pr.fx.glitch = 1; setTimeout(() => { G.pr.fx.glitch = 0; }, 900);
        bus.emit('noise', { x: cx, z: cz, radius: 60, kind: 'node', zone: z.key, by: p.id });
      }, (dt) => {
        // the simulation fights back while you work
        pulse -= dt;
        if (pulse <= 0) {
          pulse = 2.5 + Math.random() * 2;
          G.pr.fx.glitch = 0.5; setTimeout(() => { G.pr.fx.glitch = 0; }, 200);
          G.audio?.at?.('static_burst', cx, cz, 0.6);
          bus.emit('noise', { x: cx, z: cz, radius: 25, kind: 'node', zone: z.key, by: p.id });
        }
      }) });
      return out;
    }
    // ---- keycard readers: unlock the door they guard
    if (tags.includes('keycard') || o.key === 'keycard_reader') {
      const card = o.state.card as string | undefined;
      const door = o.state.door as [number, number, 0 | 1] | undefined;
      const has = card ? p.findItem((i) => i.key === card) : null;
      const e = door ? z.edge(door[0], door[1], door[2]) : null;
      if (e && !e.locked) { out.push({ label: 'The reader glows green', disabled: true }); return out; }
      out.push({ label: 'Swipe a card', disabled: !has ? `needs ${card ? itemDef(card).name : 'a keycard'}` : false, action: act('Swipe card', 1, 'hold_item', () => {
        if (door) op('edge', { z: z.key, x: door[0], y: door[1], side: door[2], patch: { locked: false, open: true } });
        G.audio?.at?.('beep', cx, cz);
        this.set('unlock:' + (o.state.unlocks || card));
      }) });
      return out;
    }
    // ---- keypads (codes learned from lore)
    if (tags.includes('keypad') || o.state.code) {
      const flag = o.state.codeFlag as string;
      const door = o.state.door as [number, number, 0 | 1] | undefined;
      const known = !flag || this.flags.has(flag);
      out.push({ label: known ? `Enter the code (${o.state.code})` : 'Enter a code', disabled: known ? false : 'you don\'t know it', action: act('Enter code', 2, 'type', () => {
        if (door) op('edge', { z: z.key, x: door[0], y: door[1], side: door[2], patch: { locked: false, open: true } });
        if (o.state.unlocks) this.set(o.state.unlocks);
        G.audio?.at?.('beep', cx, cz);
      }) });
      return out;
    }
    return out;
  }

  // ---------------------------------------------------------------- the end
  ending(p: Player) {
    if (this.endingStarted || !p.isLocal) return;
    this.endingStarted = true;
    this.set('escaped');
    G.audio?.flat?.('choir', 'music', 0.4, 1, 0, 60);
    const ui = G.ui;
    const days = Math.floor(G.clock.hours / 24), hrs = Math.floor(G.clock.hours % 24);
    const el = document.createElement('div');
    el.className = 'k-ending';
    el.innerHTML = `<div class="k-ending-inner">
      <p class="k-end-1">The light is warm. It smells like rain on a car park in summer.</p>
      <p class="k-end-2">Somewhere a monitor shows a flat green line, then a pulse.</p>
      <p class="k-end-3">CONTINUITY SESSION TERMINATED.<br>SUBJECT RESPONSIVE.</p>
      <p class="k-end-4">${escapeHtml(p.name)} — ${days} days, ${hrs} hours inside.</p>
      <p class="k-end-5">NOCLIP</p>
      <button class="k-end-btn">Wake up again</button>${G.net ? '<button class="k-end-btn k-end-stay">Stay until the others are out</button>' : ''}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    el.querySelector('button')?.addEventListener('click', () => location.reload());
    // co-op: the host leaving would end everyone's session, so you can linger at the door
    el.querySelector('.k-end-stay')?.addEventListener('click', () => { el.remove(); G.audio?.flat?.('choir', 'music', 0, 1, 0, 1); });
    if (G.net) G.net.chat(`${p.name} stepped through the door.`);
    void ui;
  }

  // ---------------------------------------------------------------- persistence
  serialize() { return { flags: [...this.flags], codex: this.codex, enabled: this.enabled }; }
  load(s: any) {
    if (!s) return;
    this.flags = new Set(s.flags || []);
    this.codex = s.codex || [];
    this.enabled = s.enabled ?? true;
    for (const f of this.flags) this.notified.add(f);
  }
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

function nodeText(id: string, down: boolean, m: MissionSystem) {
  if (down) return `${id} :: OFFLINE\n\nRENDER LOAD REDISTRIBUTED TO ${m.stage >= 3 ? 'NOTHING' : 'REMAINING NODES'}.\nINTEGRITY ${Math.round((1 - G.collapse) * 100)}%`;
  const lines: Record<string, string> = {
    'SRV-1': 'RENDER NODE SRV-1 :: LEVELS 0-2 (LOBBY / OFFICE / STAIRS)\nUPTIME 14,610 DAYS\nACTIVE OCCUPANTS: 3 (2 UNRESPONSIVE)\n\nNOTE PINNED BY D.HALE:\n"If you are reading this you are inside. Pull the node and the floors above you will start to slip. That is the point."',
    'SRV-2': 'RENDER NODE SRV-2 :: RESIDENTIAL / RECREATION / MEDICAL\nMEMORY SOURCE: HALE, M. (AGE 7)\nUPTIME 14,610 DAYS\n\nWARNING: DISABLING THIS NODE WILL RELEASE THE MEMORY ARCHIVE.\nTHE FIELDS WILL NOT BE KEPT.',
    'SRV-3': 'CORE NODE SRV-3 :: CONTINUITY KERNEL\nROOT LOCK ENGAGED\nCUSTODIAN PROCESS: ACTIVE\n\n> the kernel asks you not to.\n> the kernel asks you why.\n> the kernel says it kept everyone safe.',
  };
  return lines[id] || `${id} :: ONLINE`;
}
