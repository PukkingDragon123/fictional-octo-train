// The way out you are allowed to take: once the crew's debt reads zero,
// surplus scrip buys passage at the depot's kiosk ('ticket_kiosk' at the
// depot's 'ticket_kiosk' anchor; without a depot zone, next to the Lobby
// hopper). The transport pulls in at the 'transport_bay' anchor, opens up and
// waits; walk into its door to board. It leaves when everybody in the zone is
// aboard (or when the wait runs out: whoever is not aboard is left behind),
// and the ones aboard get the ending. Sets 'contract:transport'.
import * as THREE from 'three';
import { bus } from '../../core/events';
import { G } from '../G';
import { defOp, op, isReplaying } from '../ops';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { TimedAction } from '../../actions/action';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import { addStat } from '../profile';
import { coachModel, carriageModel, cageModel } from '../../content/furniture/zd_contract';
import { zoneSpec } from '../../world/worldGraph';
import type { GameSystem } from '../game';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../../world/zone';
import type { MenuOption } from '../../ui/ui';
import { voss, bailiff, fmt, L } from './voice';

export interface TransportDef {
  key: 'cage' | 'coach' | 'carriage';
  name: string;
  price: number;
  blurb: string;
  /** half-length along the vehicle's axis, door offset along it, door side distance */
  len: number; door: number; side: number;
  ending: string[];
}
export const TRANSPORTS: TransportDef[] = [
  {
    key: 'cage', name: 'Freight Lift 9', price: 1500, len: 1.5, door: 0, side: 1.5,
    blurb: 'An open freight cage. Standing room. The operator\'s sheet says it goes UP. The cables say otherwise.',
    ending: ['The cage drops. The light from the depot shrinks to a coin, a star, nothing.', 'You go down for a long time. Floors pass: carpet, tile, carpet, water, carpet, your own front hallway, carpet.', 'DESCENT LOGGED. DEBTOR RELEASED TO LOWER SERVICE.', 'You stopped counting the floors. The cage is still going.', 'GOING DOWN'],
  },
  {
    key: 'coach', name: 'Night Coach 0400', price: 3500, len: 5.2, door: 3.9, side: 1.25,
    blurb: 'A late-night coach with its windows painted black from the outside. Forty seats. The driver does not stop and does not turn around.',
    ending: ['The doors fold shut. The engine note never changes. Nobody on the coach speaks.', 'Through a scratch in the black paint: a motorway at night, orange lights, the same sign every minute. Then a sign with your street on it.', 'PASSAGE COMPLETE. DEBTOR ARCHIVED. ACCOUNT CLOSED.', 'The coach stops. The doors open on cold air and rain on a car park in summer.', 'OUTSIDE'],
  },
  {
    key: 'carriage', name: 'The Quiet Car', price: 8000, len: 6, door: 0, side: 1.35,
    blurb: 'A single railway carriage with no engine and no rails, lit warm inside. Every window seat is taken. One seat by the door is kept for you.',
    ending: ['The carriage moves without a sound. The passengers look straight ahead. They look a little like people you have met.', 'The window shows a field at dusk, a house with a red door, a girl on a swing who waves. You wave back. You remember her name.', 'REMITTANCE COMPLETE. WITH THANKS FROM THE MERIDIAN INSTITUTE.', 'When the carriage stops you are the only one left in it. Your seat is warm. The door opens onto morning.', 'HOME'],
  },
];
export const transportDef = (k: string) => TRANSPORTS.find((t) => t.key === k);

const WAIT_SECS = 60;
type Phase = 'arrive' | 'wait' | 'depart' | 'gone';
interface Ride {
  kind: TransportDef['key'];
  zone: string;
  x: number; z: number; heading: number; flip: number;
  phase: Phase; t: number;
  boarded: Set<string>;
  group: THREE.Group | null; mesh: THREE.Mesh | null; open: boolean;
  by: string;
  departSent: boolean;
  hornT: number;
}
interface TOp { k: 'buy' | 'call' | 'board' | 'depart'; kind?: string; by?: string; id?: string; ids?: string[]; zone?: string; x?: number; z?: number; h?: number; f?: number }

defOp('transport', (a: TOp, ctx) => { (G.debt?.transport as TransportSystem | undefined)?.onOp(a, ctx); });

/** seated aboard: the survivor rides along until the end */
class AboardAction extends TimedAction {
  constructor(p: Player) { super(p); this.name = 'Aboard'; this.duration = 99999; this.anim = ''; this.fixedTime = true; this.locks = true; this.showBar = false; }
  perform() { /* never */ }
}

const GEO = new Map<string, THREE.BufferGeometry>();
function vehicleGeo(kind: string, open: boolean) {
  const k = kind + (open ? ':o' : ':c');
  let g = GEO.get(k);
  if (!g) {
    const mb = new ModelBuilder();
    if (kind === 'coach') coachModel(mb, open); else if (kind === 'carriage') carriageModel(mb, open); else cageModel(mb, open);
    g = mb.build();
    GEO.set(k, g);
  }
  return g;
}

export class TransportSystem implements GameSystem {
  name = 'transport';
  ride: Ride | null = null;
  private endingShown = false;
  private v3 = new THREE.Vector3();

  constructor() {
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { if (o.key === 'ticket_kiosk') { try { out.unshift(...this.menu(p, o)); } catch (e) { console.warn('kiosk menu', e); } } });
    bus.on('zoneView', () => this.dropMesh());
  }

  // ---------------------------------------------------------------- where
  kioskZone(): string { return zoneSpec('depot') ? 'depot' : 'lobby'; }
  /** bay for a zone: [tile x, tile y, heading radians, door flip] */
  bay(z: Zone): [number, number, number, number] {
    const a = (z.meta.anchors || {})['transport_bay'] as number[] | undefined;
    const k = [...z.objects.values()].find((o) => o.key === 'ticket_kiosk');
    let x = a?.[0] ?? (k ? k.x : z.W >> 1), y = a?.[1] ?? (k ? k.y + 3 : z.H >> 1);
    // the vehicle lies along the more open axis through the bay
    const run = (dx: number, dy: number) => { let n = 0; for (let i = -6; i <= 6; i++) { const X = x + dx * i, Y = y + dy * i; if (z.inb(X, Y) && z.floor[z.idx(X, Y)] && z.solid[z.idx(X, Y)] !== 1) n++; } return n; };
    let heading = a?.[2] !== undefined ? Number(a[2]) : run(1, 0) >= run(0, 1) ? 0 : Math.PI / 2;
    if (!Number.isFinite(heading)) heading = 0;
    // doors face the kiosk
    let flip = 1;
    if (k) { const nx = -Math.sin(heading), nz = Math.cos(heading); if ((k.x + 0.5 - (x + 0.5)) * nx + (k.y + 0.5 - (y + 0.5)) * nz < 0) flip = -1; }
    void heading;
    return [x, y, heading, flip];
  }
  /** world position of the door (where you board) */
  doorPos(r: Ride): [number, number] {
    const d = transportDef(r.kind)!;
    const [ax, az] = axis(r);
    const nx = -Math.sin(r.heading) * r.flip, nz = Math.cos(r.heading) * r.flip;
    return [r.x + ax * d.door + nx * (d.side + 0.55), r.z + az * d.door + nz * (d.side + 0.55)];
  }

  // ---------------------------------------------------------------- kiosk
  menu(p: Player, o: TileObject): MenuOption[] {
    const out: MenuOption[] = [];
    const debt = G.debt;
    const at = (name: string, secs: number, fn: () => void) => () => queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, name, secs, 'type', fn), 1.5);
    out.push({ label: 'Read the screen', action: at('Read', 1.2, () => G.ui?.read?.('PASSAGE BOOKINGS', kioskText(), 'terminal')) });
    if (!debt?.on) { out.push({ label: 'NO ACCOUNT ON FILE', disabled: true }); return out; }
    const band = G.band?.get?.(p.id);
    const why = !debt.cleared ? `debt not cleared (${fmt(debt.remaining)} owed)` : band === 'removed' ? 'no band, no passage' : this.ride && this.ride.phase !== 'gone' ? 'a transport is already on its way' : '';
    for (const t of TRANSPORTS) {
      const short = debt.cleared && debt.surplus < t.price ? `${fmt(t.price - debt.surplus)} more scrip` : '';
      out.push({ label: `${t.name} — ${fmt(t.price)} scrip`, disabled: why || short || false, action: at('Press the band to the cradle', 2.2, () => this.buy(p, t.key)) });
    }
    return out;
  }
  buy(p: Player, kind: string) {
    G.audio?.at?.('kiosk_accept', p.x, p.z, 0.8);
    op('transport', { k: 'buy', kind, by: p.id, zone: p.zoneKey });
  }

  // ---------------------------------------------------------------- ops
  onOp(a: TOp, ctx: { host: boolean; local: boolean; from: string }) {
    const rep = isReplaying();
    switch (a.k) {
      case 'buy': {
        if (!ctx.host || rep) return;
        const t = transportDef(a.kind || ''); if (!t) return;
        if (this.ride && this.ride.phase !== 'gone') return;
        if (!G.debt?.cleared || !G.debt.spend(t.price, t.key, a.by)) return;
        const z = G.getZone(a.zone || this.kioskZone());
        const [x, y, h, f] = this.bay(z);
        op('transport', { k: 'call', kind: t.key, by: a.by, zone: z.key, x: x + 0.5, z: y + 0.5, h, f });
        return;
      }
      case 'call': {
        if (rep) return;
        const t = transportDef(a.kind || ''); if (!t) return;
        this.dropMesh();
        this.ride = { kind: t.key, zone: a.zone!, x: a.x!, z: a.z!, heading: a.h ?? 0, flip: a.f ?? 1, phase: 'arrive', t: 0, boarded: new Set(), group: null, mesh: null, open: false, by: a.by || '', departSent: false, hornT: 15 };
        G.missions?.set?.('contract:ticket');
        if (a.by === G.local?.id) {
          addStat('transports_bought');
          const tk = createItem('passage_ticket', undefined, { pristine: true });
          tk.name = 'Passage Ticket — ' + t.name; tk.data = { ...(tk.data || {}), kind: t.key };
          G.local.inv.add(tk); bus.emit('inventoryChanged', G.local);
          G.audio?.ui?.('kiosk_print', 0.7);
          bailiff(`PASSAGE ISSUED: ${t.name.toUpperCase()}. PROCEED TO THE BAY.`);
          setTimeout(() => voss(L.kiosk), 2400);
        }
        bus.emit('transportCalled', { kind: t.key, zone: a.zone });
        return;
      }
      case 'board': {
        if (!this.ride || !a.id) return;
        this.ride.boarded.add(a.id);
        return;
      }
      case 'depart': {
        if (rep) { if (ctx.host) G.missions?.set?.('contract:transport'); return; }
        if (!this.ride) return;
        this.ride.phase = 'depart'; this.ride.t = 0;
        for (const id of a.ids || []) this.ride.boarded.add(id);
        if (ctx.host && (a.ids || []).length) G.missions?.set?.('contract:transport');
        const me = G.local;
        if (me && !(a.ids || []).includes(me.id) && me.zoneKey === this.ride.zone && !me.body.dead) setTimeout(() => voss(L.leftBehind), 3000);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- show
  private dropMesh() {
    if (this.ride?.group) { G.pr.scene.remove(this.ride.group); this.ride.group = null; this.ride.mesh = null; }
  }
  private ensureMesh(r: Ride) {
    if (r.group || G.view?.zone.key !== r.zone) return;
    const g = new THREE.Group();
    const m = new THREE.Mesh(vehicleGeo(r.kind, r.open), worldMaterial({ cutout: true }));
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    g.rotation.y = -r.heading + (r.flip < 0 ? Math.PI : 0);
    G.pr.scene.add(g);
    r.group = g; r.mesh = m;
  }
  /** offset of the vehicle from its bay at this moment of its timeline */
  private pose(r: Ride): { ox: number; oy: number; oz: number; vis: boolean } {
    const [ax, az] = axis(r);
    const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    if (r.kind === 'cage') {
      if (r.phase === 'arrive') return { ox: 0, oy: -4.5 * (1 - ease(r.t / 5)), oz: 0, vis: true };
      if (r.phase === 'depart') return { ox: 0, oy: -Math.pow(r.t, 1.6) * 1.2, oz: 0, vis: r.t < 9 };
      return { ox: 0, oy: 0, oz: 0, vis: true };
    }
    let s = 0;
    if (r.phase === 'arrive') s = -(r.kind === 'coach' ? 34 : 40) * (1 - ease(r.t / (r.kind === 'coach' ? 6 : 8)));
    if (r.phase === 'depart') s = Math.pow(Math.max(0, r.t - 1.5), 2) * (r.kind === 'coach' ? 1.4 : 0.8);
    return { ox: s * ax, oy: 0, oz: s * az, vis: s < 60 };
  }

  update(dt: number) {
    const r = this.ride;
    if (!r || r.phase === 'gone') return;
    r.t += dt;
    const here = G.local?.zoneKey === r.zone && G.view?.zone.key === r.zone;
    if (here) this.ensureMesh(r); else this.dropMesh();
    // timeline
    if (r.phase === 'arrive' && r.t >= (r.kind === 'coach' ? 6.5 : r.kind === 'carriage' ? 8.5 : 5.5)) {
      r.phase = 'wait'; r.t = 0; r.open = true;
      if (r.mesh) r.mesh.geometry = vehicleGeo(r.kind, true);
      if (here) {
        G.audio?.play?.(r.kind === 'coach' ? 'coach_doors' : 'metal_clank', r.x, r.z, { vol: 1, range: 30 });
        if (r.kind === 'coach') setTimeout(() => G.audio?.play?.('coach_horn', r.x, r.z, { vol: 1, range: 60 }), 500);
      }
    }
    if (r.phase === 'arrive' && r.t < dt * 1.5 && here) {
      G.audio?.play?.(r.kind === 'coach' ? 'coach_horn' : r.kind === 'cage' ? 'lift_rise' : 'carriage_glide', r.x, r.z, { vol: 1, range: 70 });
    }
    // engine idling while it waits
    if (r.phase === 'wait' && here && r.kind === 'coach' && Math.random() < dt * 0.5) G.audio?.play?.('coach_idle', r.x, r.z, { vol: 0.5, range: 26 });
    // pose
    const ps = this.pose(r);
    const base = G.zones.get(r.zone)?.heightAt(Math.floor(r.x), Math.floor(r.z)) ?? 0;
    if (r.group) { r.group.position.set(r.x + ps.ox, base + ps.oy, r.z + ps.oz); r.group.visible = ps.vis; }
    // lights: headlights / warm windows / the cage's work lamp
    if (here && ps.vis) {
      const lx = r.x + ps.ox, lz = r.z + ps.oz;
      const [ax, az] = axis(r);
      if (r.kind === 'coach') { G.pointLight(lx + ax * 6.5, 1.0, lz + az * 6.5, 0xfff0c0, 2.2, 12); G.pointLight(lx, 2.2, lz, 0x3a3428, 0.6, 6); }
      else if (r.kind === 'carriage') G.pointLight(lx, 1.8, lz, 0xffc070, 1.8, 10);
      else G.pointLight(lx, 2.2 + ps.oy, lz, 0xd8ffe0, 1.4, 7);
    }
    const me = G.local;
    // boarding: walk into the door
    if (r.phase === 'wait' && me && me.zoneKey === r.zone && !me.body.dead && !r.boarded.has(me.id)) {
      const [dx, dz] = this.doorPos(r);
      if (Math.hypot(me.x - dx, me.z - dz) < 1.25) this.boardLocal(r);
    }
    // aboard: ride along (the camera follows the vehicle out)
    if (me && r.boarded.has(me.id) && me.zoneKey === r.zone) {
      const d = transportDef(r.kind)!;
      const [ax, az] = axis(r);
      const seat = r.kind === 'cage' ? 0 : d.door - 0.7;
      me.x = r.x + ps.ox + ax * seat; me.z = r.z + ps.oz + az * seat;
      me.y = base + (r.kind === 'cage' ? ps.oy + 0.12 : 0.6);
      me.vx = me.vz = 0;
    }
    // the horn while it waits
    if (r.phase === 'wait' && here) { r.hornT -= dt; if (r.hornT <= 0) { r.hornT = 15; G.audio?.play?.(r.kind === 'coach' ? 'coach_horn' : 'band_beep', r.x, r.z, { vol: 1, range: 60 }); } }
    // host: when does it leave?
    if (G.role !== 'client' && r.phase === 'wait' && !r.departSent) {
      const here2 = [...G.players.values()].filter((p) => p.zoneKey === r.zone && !p.body.dead);
      const all = here2.length > 0 && here2.every((p) => r.boarded.has(p.id));
      const timeout = r.t > WAIT_SECS;
      if ((all && r.t > 2.5) || timeout) { r.departSent = true; op('transport', { k: 'depart', ids: [...r.boarded].filter(Boolean) }); }
    }
    // the ending for whoever is aboard
    if (r.phase === 'depart' && me && r.boarded.has(me.id) && !this.endingShown && r.t > (r.kind === 'cage' ? 4 : 5)) {
      this.endingShown = true;
      G.missions?.ending?.(me, 'transport:' + r.kind);
    }
    if (r.phase === 'depart' && r.t > 14) { r.phase = 'gone'; this.dropMesh(); }
  }

  private boardLocal(r: Ride) {
    const me = G.local;
    r.boarded.add(me.id);
    me.actions.clear();
    me.actions.add(new AboardAction(me));
    me.flashlightOn = false;
    op('transport', { k: 'board', id: me.id });
    G.audio?.play?.('thud_soft', me.x, me.z, { vol: 0.6 });
    setTimeout(() => voss(L.boarded), 800);
    G.camera?.pushIn?.(0.25, 6, 4);
    bus.emit('think', me, r.kind === 'carriage' ? 'The seat by the door is warm.' : r.kind === 'cage' ? 'The gate rattles shut behind me.' : 'Nobody looks up when I get on.');
  }

  // ---------------------------------------------------------------- the ending overlay
  showEnding(p: Player, kind: string) {
    const t = transportDef(kind) || TRANSPORTS[1];
    const days = Math.floor(G.clock.hours / 24), hrs = Math.floor(G.clock.hours % 24);
    const debt = G.debt;
    const el = document.createElement('div');
    el.className = 'dbt-end';
    const stamp = new Date(1990, 9, 14 + days, 4, 0).toDateString().toUpperCase().slice(4);
    el.innerHTML = `<div class="vhs">PLAY ▶</div><div class="vhs r">${esc(stamp)}  04:00</div><div class="dbt-end-inner">
      <p class="l1">${esc(t.ending[0])}</p>
      <p class="l2">${esc(t.ending[1])}</p>
      <p class="l3">${esc(t.ending[2])}</p>
      <p class="l4">${esc(p.name)} — ${days} days, ${hrs} hours in the Programme. ${fmt(debt?.s?.total ?? 0)} scrip remitted.</p>
      <p class="l5">${esc(t.ending[4])}</p>
      <button class="dbt-end-btn">Wake up again</button>${G.net ? '<button class="dbt-end-btn ghost">Stay and watch</button>' : ''}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    el.querySelector('.dbt-end-btn')?.addEventListener('click', () => location.reload());
    el.querySelector('.dbt-end-btn.ghost')?.addEventListener('click', () => el.remove());
    G.audio?.flat?.(t.key === 'carriage' ? 'carriage_glide' : t.key === 'cage' ? 'lift_rise' : 'coach_idle', 'music', 0.4);
    if (G.net) G.net.chat(`${p.name} left on the ${t.name}.`);
  }

  serialize() { return null; }
}

/** the vehicle's long axis in world space (its local +x after the flip) */
function axis(r: Ride): [number, number] { const k = r.flip < 0 ? -1 : 1; return [Math.cos(r.heading) * k, Math.sin(r.heading) * k]; }

function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }

export function kioskText(): string {
  const d = G.debt;
  const lines = ['MERIDIAN REMITTANCE // PASSAGE BOOKINGS', ''];
  for (const t of TRANSPORTS) lines.push(`${t.name.toUpperCase().padEnd(18)} ${fmt(t.price).padStart(7)}`, `  ${t.blurb}`, '');
  if (!d?.on) lines.push('NO ACCOUNT.');
  else if (!d.cleared) lines.push(`ACCOUNT IN ARREARS: ${fmt(d.remaining)} OWED.`, 'PASSAGE IS SOLD TO DISCHARGED DEBTORS ONLY.');
  else lines.push(`ACCOUNT DISCHARGED. SURPLUS ${fmt(d.surplus)}.`, 'PRESS YOUR BAND TO THE CRADLE TO PURCHASE.');
  lines.push('', 'NO REFUNDS. NO RETURNS. DO NOT SPEAK TO THE OTHER PASSENGERS.');
  return lines.join('\n');
}
