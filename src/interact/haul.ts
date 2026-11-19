// HANDS FULL (round 19): what the unit carries in its arms rather than its pockets, and what it drags.
//  - picked-up things go to the HOTBAR first: the first free slot (1-6) is bound to them (the binding rides on
//    the item, src/ui/hotbar/hotbar.ts); a full hotbar leaves them in the pack
//  - BULKY things (planks, sheet metal, steel plate, a car battery, anything marked heavy) cannot go in a pocket:
//    picking one up puts it in both arms, held against the belly with the hands under it (pose 'haul',
//    src/entities/motionAnims.ts), the meshes stacked in the arms (never floating), a few planks at once at most.
//    Arms full: no sprint, slower the more it is, nothing else in the hands; G sets the lot down in front
//  - DRAGGING a body: "Drag" on a corpse's right-click menu. The unit takes it by an ankle and leans into the pull
//    (pose 'drag_body'); the body trails on a slack rope behind, swinging round after the unit instead of turning
//    with it, scraping walls; E, G or the menu lets go
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import type { Player } from '../entities/player';
import { itemDef, itemName, type Item } from '../items/item';
import { serializeItem } from '../items/factory';
import { makeHeldMesh } from '../items/itemMeshes';
import { moveCircle } from '../world/collision';
import { dampAngle } from '../core/math';
import { registerContextActions } from './contextMenu';

declare module '../entities/player' {
  interface Player {
    /** bulky things in the arms (also in p.inv, flagged data.arm) */
    armload?: Item[];
    /** the corpse being dragged (local unit) */
    dragging?: any;
  }
}

const BULKY_KEYS = new Set(['plank', 'sheet_metal', 'steel_plate', 'car_battery', 'log', 'door_panel', 'pallet_board', 'lumber']);
/** carried in both arms only (never a pocket, the pack or the hotbar) */
export function isBulky(it: Item | null | undefined): boolean {
  if (!it) return false;
  const d = itemDef(it.key);
  return BULKY_KEYS.has(it.key) || !!d.heavy || !!d.tags?.includes('bulky');
}
/** how many fit in the arms at once */
const ARM_MAX = (it: Item) => (it.key === 'plank' ? 4 : it.key === 'sheet_metal' ? 2 : 1);

const say = (p: Player, s: string) => bus.emit('think', p, s);

// ================================================================== the hotbar first
function autoHot(p: Player, it: Item) {
  const d = itemDef(it.key);
  if ((it.data as { hot?: number } | undefined)?.hot || p.isWorn(it) || d.clothing || d.bag || isBulky(it)) return;
  const used = new Set(p.allItems().map((q) => (q.data as { hot?: number } | undefined)?.hot).filter(Boolean));
  // the same kind already on the bar: it stacks there, no second slot
  if (p.allItems().some((q) => q !== it && q.key === it.key && (q.data as { hot?: number } | undefined)?.hot)) return;
  const n = [1, 2, 3, 4, 5, 6].find((k) => !used.has(k));
  if (!n) return;
  it.data = { ...(it.data || {}), hot: n } as Item['data'];
  bus.emit('inventoryChanged', p);
}

// ================================================================== the armload
const _v = new THREE.Vector3();
class Armload {
  group = new THREE.Group();
  private key = '';
  private on: Player | null = null;
  update(p: Player, dt: number) {
    const load = p.armload ?? [];
    // the load left the unit some other way (dropped from the pack view, used up): forget it
    if (load.length) p.armload = load.filter((it) => p.containerOf(it));
    const k = (p.armload ?? []).map((i) => i.key).join(',');
    if (this.on !== p || k !== this.key) {
      this.key = k; this.on = p;
      this.group.clear();
      this.group.removeFromParent();
      if (k) {
        let y = 0;
        for (const it of p.armload!) {
          const m = makeHeldMesh(it.key);
          if (!m) continue;
          const b = new THREE.Box3().setFromObject(m), s = b.getSize(_v);
          // the long way across the body (left-right), lying flat on the forearms
          const piv = new THREE.Group();
          m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y + y, -(b.min.z + b.max.z) / 2);
          piv.add(m);
          // a long thing turns across the chest; a box sits square
          if (s.z > s.x) piv.rotation.y = Math.PI / 2;
          this.group.add(piv);
          y += Math.max(0.03, s.y) * 0.98;
        }
        p.rig.root.add(this.group);
      }
    }
    if (!k) return;
    // in front of the belly, on the hands (the 'haul' pose reaches its hands to the same points), a little sway
    const s = p.rig.s;
    const ph = p.anim.phase;
    const mv = Math.min(1, p.speed / 2);
    this.group.position.set(Math.sin(ph) * 0.008 * mv * s, (0.96 + Math.abs(Math.cos(ph)) * 0.012 * mv) * s, 0.33 * s);
    this.group.rotation.set(0, Math.sin(ph) * 0.035 * mv, Math.sin(ph) * 0.03 * mv);
    void dt;
  }
}
const armload = new Armload();

/** pick a bulky thing up into the arms (it is already in p.inv) */
function takeIntoArms(p: Player, it: Item) {
  const load = (p.armload ??= []);
  if (load.length && (load[0].key !== it.key || load.length >= ARM_MAX(it))) {
    // arms full: it goes back down where it was
    say(p, load[0].key !== it.key ? 'My arms are full.' : `I can carry ${ARM_MAX(it)} at most.`);
    setDown(p, [it]);
    return;
  }
  // both hands go to it: whatever was held is put away
  if (p.handR) p.equip(null, 'R');
  if (p.handL) p.equip(null, 'L');
  it.data = { ...(it.data || {}), arm: true } as Item['data'];
  delete (it.data as { hot?: number }).hot;
  load.push(it);
  G.audio?.itemSound?.(it.key, 'pick', p);
  bus.emit('inventoryChanged', p);
}

/** set things from the arms down in front of the unit */
export function setDown(p: Player, items = p.armload ?? []) {
  if (!items.length) return;
  const z = G.getZone(p.zoneKey);
  const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
  items.forEach((it, i) => {
    const c = p.containerOf(it);
    if (c) c.remove(it);
    const d = { ...(it.data || {}) } as Record<string, unknown>; delete d.arm; it.data = d as Item['data'];
    op('dropFloor', { z: z.key, item: serializeItem(it), x: p.x + fx * 0.6, zz: p.z + fz * 0.6, y: 0.35 + i * 0.05, v: [fx * 0.4, 0.3, fz * 0.4] });
  });
  p.armload = (p.armload ?? []).filter((it) => !items.includes(it));
  G.audio?.at?.(items[0].key === 'plank' ? 'dmg_hit_wood' : 'thud_soft', p.x, p.z, 0.5);
  bus.emit('inventoryChanged', p);
}

/** arms full: how much slower (1 = not at all) */
export function haulSlow(p: Player): number {
  const n = p.armload?.length ?? 0;
  if (p.dragging) return 0.58;
  if (!n) return 1;
  const w = p.armload!.reduce((s, it) => s + (itemDef(it.key).weight ?? 1), 0);
  return Math.max(0.5, 0.82 - n * 0.04 - Math.max(0, w - 4) * 0.02);
}
/** arms full or dragging: no sprinting */
export function haulBusy(p: Player): boolean { return !!p.armload?.length || !!p.dragging; }

// ================================================================== dragging a body
function canDrag(c: any): string | false {
  if (!c?.dead) return 'not dead';
  const big = (c.radius ?? 0.4) * 2 + (c.height ?? 1) * 0.5;
  return big > 3.2 ? 'far too heavy' : false;
}
export function startDrag(p: Player, c: any) {
  if (p.armload?.length) setDown(p);
  p.dragging = c;
  c.mem = c.mem || {};
  c.mem.draggedBy = p.id;
  p.actions.clear();
  if (p.handR) p.equip(null, 'R');
  G.audio?.at?.('dmg_grab', c.x, c.z, 0.6);
  say(p, ['Got it by the ankle.', 'Heavy.', 'Come on, then.'][Math.floor(Math.random() * 3)]);
}
export function stopDrag(p: Player) {
  const c = p.dragging;
  if (!c) return;
  if (c.mem) delete c.mem.draggedBy;
  p.dragging = null;
  G.audio?.at?.('thud_soft', c.x, c.z, 0.5);
}
function stepDrag(p: Player, dt: number) {
  const c = p.dragging;
  if (!c) return;
  if (!c.dead || c.zoneKey !== p.zoneKey || p.body.dead || p.body.downed || Math.hypot(c.x - p.x, c.z - p.z) > 4) { stopDrag(p); return; }
  const z = G.getZone(p.zoneKey);
  // the grip: a hand's length behind the hips; the body's near end on it, the rest trailing on a slack rope
  const bx = -Math.cos(p.facing), bz = -Math.sin(p.facing);
  const gx = p.x + bx * 0.5, gz = p.z + bz * 0.5;
  const len = Math.max(0.45, (c.height ?? 1) * 0.42 + (c.radius ?? 0.3) * 0.3);
  const dx = c.x - gx, dz = c.z - gz, d = Math.hypot(dx, dz);
  if (d > len) {
    const k = (d - len) / d;
    const m = { x: c.x, z: c.z, radius: Math.max(0.15, (c.radius ?? 0.3) * 0.6) };
    moveCircle(z, m, -dx * k, -dz * k, { ignoreLow: false, creature: true });
    // scraping: the floor drags at it (a smear of noise, a scuff now and then)
    if (Math.random() < dt * 2.5 && p.speed > 0.4) G.audio?.at?.('cloth', c.x, c.z, 0.25);
    c.x = m.x; c.z = m.z;
  }
  // it swings round after the unit (its near end leads), never turned stiffly with it
  const want = Math.atan2(p.z - c.z, p.x - c.x);
  c.facing = dampAngle(c.facing ?? want, want, 2.6, dt);
}

// ================================================================== wiring
let installed = false;
export function installHaul() {
  if (installed) return;
  installed = true;
  bus.on('itemPickedUp', (p: Player, it: Item) => {
    if (!p?.isLocal || !it) return;
    try { if (isBulky(it)) takeIntoArms(p, it); else autoHot(p, it); } catch (e) { console.warn('haul pickup', e); }
  });
  bus.on('travelStart', (p: Player) => { if (p?.isLocal) stopDrag(p); });
  // a thing taken in the hands (the hotbar, the pack) while the arms are full: the armload goes down first
  bus.on('inventoryChanged', (p: Player) => {
    if (!p?.isLocal || !p.armload?.length) return;
    const h = p.handR ?? p.handL;
    if (h && !p.armload.includes(h)) { say(p, 'I put the load down.'); setDown(p); }
  });
  // the right-click menu: drag a body, set down what is in the arms
  registerContextActions('corpse', (t, p) => {
    if (t.kind !== 'creature') return [];
    const c: any = t.c;
    if (p.dragging === c) return [{ label: 'Let go', run: () => stopDrag(p) }];
    return [{ label: 'Drag', enabled: canDrag(c) || true, info: 'Take it by an ankle and pull it after you.', run: () => {
      const reach = Math.hypot(c.x - p.x, c.z - p.z);
      if (reach > 1.6) { G.interact?.walkNear?.(p, c.x, c.z, () => startDrag(p, c)) ?? startDrag(p, c); return; }
      startDrag(p, c);
    } }];
  });
  registerContextActions('self', (_t, p) => (p.armload?.length ? [{ label: `Set down ${p.armload.length > 1 ? `${p.armload.length} × ` : ''}${itemName(p.armload[0])}`, run: () => setDown(p) }] : p.dragging ? [{ label: 'Let go of the body', run: () => stopDrag(p) }] : []));
  G.addSystem({ name: 'haul', update: (dt: number) => {
    const p = G.local;
    if (!p) return;
    try {
      armload.update(p, dt);
      stepDrag(p, dt);
      const inp = G.input;
      const free = !inp.textFocus && !G.ui?.blocksMovement?.();
      if (free && (p.armload?.length || p.dragging) && (inp.hit('grab') || (p.dragging && inp.hit('interact')))) {
        if (p.dragging) { stopDrag(p); for (const c of inp.bindings.interact) inp.pressed.delete(c); }
        else setDown(p);
        for (const c of inp.bindings.grab) inp.pressed.delete(c);
      }
    } catch (e) { console.warn('haul', e); }
  } });
}
