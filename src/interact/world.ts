import { G } from '../game/G';
import type { MenuOption } from '../ui/ui';
import type { Player } from '../entities/player';
import { PickTarget, targetPos, targetName } from '../game/picking';
import { objDef } from '../world/objects';
import { TileObject, Zone, TF } from '../world/zone';
import { Item, itemDef, itemName, FluidType } from '../items/item';
import { queueAt, DrinkFromSourceAction, FillAction, WalkToAction } from '../actions/basic';
import { DoorAction, BarricadeAction, UnbarricadeAction, WindowAction, ClimbAction, SearchAction, SitAction, SleepAction, DisassembleAction, SwitchAction, UseObjectAction, DigAction, ForageAction, MarkAction, ButcherAction, VendAction, noise } from '../actions/world';
import { queueTransfers } from '../actions/transfer';
import { floorContainer } from '../items/worldItems';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { lineOfSight } from '../world/collision';
import { lore } from '../content/loreRegistry';
import { TimedAction } from '../actions/action';
import { createItem } from '../items/factory';
import { primaryVerb, LootAction } from './verbs';

/**
 * World interactions as data: the ordered verbs of furniture, doors, windows,
 * floor items, creatures, teammates and bare floor tiles (no popup menus: a
 * right click / E / the USE cap does the first one, src/interact/verbs.ts and
 * grab.ts reach the rest), and helper queries (water, heat, power).
 */
export class Interact {
  constructor() {
    G.interact = this;
  }

  // ---------------- queries ----------------
  objPowered(o: TileObject): boolean {
    const z = G.getZone(G.local.zoneKey);
    const d = objDef(o.key);
    if (!d?.power) return true;
    const room = z.roomAt(o.x, o.y);
    if (z.circuitPowered(room.circuit)) return true;
    return !!G.items?.generatorPowers?.(z, o.x, o.y);
  }
  hasPower(p: Player): boolean {
    const z = G.getZone(p.zoneKey);
    const r = z.roomAt(p.tileX(), p.tileY());
    return z.circuitPowered(r.circuit) || !!G.items?.generatorPowers?.(z, p.tileX(), p.tileY());
  }
  objectsNear(p: Player, r = 1.8): TileObject[] {
    const z = G.getZone(p.zoneKey);
    const out: TileObject[] = [];
    const seen = new Set<number>();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const o of z.objectsAt(p.tileX() + dx, p.tileY() + dy)) {
      if (seen.has(o.uid)) continue; seen.add(o.uid);
      const d = objDef(o.key); if (!d) continue;
      const w = d.w ?? 1, dd = d.d ?? 1; const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
      const nx = Math.max(o.x, Math.min(p.x, o.x + rw)), nz = Math.max(o.y, Math.min(p.z, o.y + rd));
      if (Math.hypot(nx - p.x, nz - p.z) <= r) out.push(o);
    }
    return out;
  }
  nearTag(p: Player, tag: string): TileObject | null { return this.objectsNear(p).find((o) => objDef(o.key)?.tags?.includes(tag)) || null; }
  nearHeat(p: Player): { o: TileObject; kind: string } | null {
    for (const o of this.objectsNear(p, 2)) {
      const d = objDef(o.key);
      if (!d?.heat) continue;
      if (d.heat === 'fire' || d.heat === 'grill') { if (o.state.lit || d.tags?.includes('lit')) return { o, kind: d.heat }; continue; }
      if (o.state.on && this.objPowered(o)) return { o, kind: d.heat };
    }
    return null;
  }
  /** water source near the player: taps (need water main), toilets, pools, rain barrels */
  nearWater(p: Player): { name: string; fluid: FluidType; available: number; take?: (l: number) => void } | null {
    const z = G.getZone(p.zoneKey);
    for (const o of this.objectsNear(p, 1.8)) {
      const d = objDef(o.key);
      if (!d?.water) continue;
      if (d.water.tap && z.waterOn) return { name: d.name, fluid: d.water.tainted ? 'tainted' : 'water', available: Infinity };
      const stored = o.state.water ?? (d.water.tap ? d.water.capacity * 0.5 : d.water.capacity * 0.6);
      if (stored > 0.05) return { name: d.name, fluid: d.water.tainted || !d.water.tap ? (o.state.boiled ? 'water' : 'tainted') : 'water', available: stored, take: (l) => op('objState', { z: z.key, uid: o.uid, patch: { water: Math.max(0, stored - l) } }) };
    }
    // standing next to pool water
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const f = z.floorAt(p.tileX() + dx, p.tileY() + dy);
      if (f?.water) return { name: f.name, fluid: f.tainted ? 'tainted' : 'water', available: Infinity };
    }
    return null;
  }
  medicalTargets(p: Player): Player[] {
    const out = [p];
    for (const o of G.players.values()) if (o !== p && o.zoneKey === p.zoneKey && Math.hypot(o.x - p.x, o.z - p.z) < 1.8) out.push(o);
    return out;
  }

  /** Space near a window / low obstacle: climb or vault over it */
  tryVault(p: Player): boolean {
    const z = G.getZone(p.zoneKey);
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    const tx = p.tileX(), ty = p.tileY();
    // edge in front
    const ax = Math.abs(fx) > Math.abs(fz);
    const dx = ax ? Math.sign(fx) : 0, dy = ax ? 0 : Math.sign(fz);
    const ex = dx === 1 ? tx + 1 : tx, ey = dy === 1 ? ty + 1 : ty;
    const side: 0 | 1 = dx !== 0 ? 1 : 0;
    const distToEdge = dx !== 0 ? Math.abs(ex - p.x) : Math.abs(ey - p.z);
    if (distToEdge < 0.8) {
      const e = z.edge(ex, ey, side);
      if (e && e.kind === 'window' && (e.open || e.glass !== 'intact') && !e.barricade) { this.climbThrough(p, ex, ey, side); return true; }
      const w = side === 0 ? z.wallNAt(ex, ey) : z.wallWAt(ex, ey);
      if (w?.low && !e) {
        const nx = p.x + dx * 1.1, nz = p.z + dy * 1.1;
        p.actions.clear(); p.actions.add(new ClimbAction(p, nx, nz)); return true;
      }
    }
    // low furniture (tables, counters) right ahead
    const ftx = Math.floor(p.x + fx * 0.8), fty = Math.floor(p.z + fz * 0.8);
    if (z.inb(ftx, fty) && z.solid[z.idx(ftx, fty)] === 2) {
      const nx = ftx + 0.5 + Math.sign(fx) * (Math.abs(fx) > 0.5 ? 1 : 0), nz = fty + 0.5 + Math.sign(fz) * (Math.abs(fz) > 0.5 ? 1 : 0);
      if (z.inb(Math.floor(nx), Math.floor(nz)) && !z.solid[z.idx(Math.floor(nx), Math.floor(nz))]) { p.actions.clear(); p.actions.add(new ClimbAction(p, nx, nz)); return true; }
    }
    return false;
  }

  // ---------------- doors ----------------
  openDoor(p: Player, x: number, y: number, side: 0 | 1, auto = false) {
    const a = new DoorAction(p, x, y, side, 'toggle');
    if (auto) { a.perform(); return; }
    queueAt(p, side === 0 ? x + 0.5 : x, side === 0 ? y : y + 0.5, a, 1.4);
  }

  // ---------------- default interaction (right click / E / USE): the primary verb ----------------
  defaultAction(p: Player, t: PickTarget) {
    const v = primaryVerb(p, t);
    if (v) { v.run(); return; }
    this.legacyDefault(p, t);
  }
  private legacyDefault(p: Player, t: PickTarget) {
    const pos = targetPos(t);
    switch (t.kind) {
      case 'edge': {
        const e = t.edge;
        if (e.portal && (e.kind === 'door')) { this.enterPortal(p, e.portal, pos); return; }
        if (e.kind === 'door' || e.kind === 'gate') this.openDoor(p, t.x, t.y, t.side);
        else if (e.kind === 'window') {
          if (e.open || e.glass !== 'intact') this.climbThrough(p, t.x, t.y, t.side);
          else queueAt(p, pos.x, pos.z, new WindowAction(p, t.x, t.y, t.side, 'toggle'), 1.3);
        }
        return;
      }
      case 'object': {
        const d = objDef(t.obj.key);
        if (!d) return;
        if (d.tags?.includes('portal')) { this.usePortalObject(p, t.obj); return; }
        if (t.obj.inv) { queueAt(p, pos.x, pos.z, new LootAction(p, t.obj.inv, t.obj), 1.5); return; }
        const opts = this.objectOptions(p, t.obj);
        const first = opts.find((o) => o.action && !o.disabled);
        first?.action?.();
        return;
      }
      case 'item':
        queueAt(p, t.wi.x, t.wi.z, new PickupAction(p, t.wi.item), 1.2, false);
        return;
      case 'creature':
        if (t.c.dead) { G.ui?.inventory?.toggle(true); return; }
        return;
      case 'vehicle': {
        const first = ((G as any).vehicles?.menuOptions?.(p, t.v) || []).find((o: MenuOption) => o.action && !o.disabled);
        first?.action?.();
        return;
      }
      case 'player':
        return;
      case 'tile':
        return;
    }
  }

  // ---------------- context menu ----------------
  menu(p: Player, t: PickTarget): { title: string; opts: MenuOption[] } {
    const pos = targetPos(t);
    const opts: MenuOption[] = [];
    const z = G.getZone(p.zoneKey);
    switch (t.kind) {
      case 'object': opts.push(...this.objectOptions(p, t.obj)); break;
      case 'edge': opts.push(...this.edgeOptions(p, t.x, t.y, t.side)); break;
      case 'item': {
        const it = t.wi.item;
        opts.push({ label: 'Pick up ' + itemName(it), action: () => queueAt(p, t.wi.x, t.wi.z, new PickupAction(p, it), 1.2, false) });
        const here = floorContainer(z, t.wi.x, t.wi.z, 1.0);
        if (here.items.length > 1) opts.push({ label: `Pick up all here (${here.items.length})`, action: () => { queueAt(p, t.wi.x, t.wi.z, new WalkToAction(p, Math.floor(t.wi.x), Math.floor(t.wi.z), false, 1), 1.2, false); queueTransfers(p, here.items, here, p.inv); } });
        if (it.inv) opts.push({ label: 'Look inside', action: () => { G.ui?.inventory?.focus(it.inv); } });
        break;
      }
      case 'creature': opts.push(...(G.creatures?.menuOptions?.(p, t.c) || [])); break;
      case 'vehicle': opts.push(...((G as any).vehicles?.menuOptions?.(p, t.v) || [])); break;
      case 'player': opts.push(...this.playerOptions(p, t.p)); break;
      case 'tile': opts.push(...this.tileOptions(p, t.x, t.y)); break;
    }
    // mission / system hooks may add options
    bus.emit('worldMenu', p, t, opts);
    if (t.kind !== 'tile') {
      const tile = { x: Math.floor(pos.x), y: Math.floor(pos.z) };
      const tileOpts = this.tileOptions(p, tile.x, tile.y).filter((o) => o.label === 'Walk here');
      if (tileOpts.length) { opts.push({ label: '-' }); opts.push(...tileOpts); }
    }
    return { title: targetName(t), opts };
  }

  objectOptions(p: Player, o: TileObject): MenuOption[] {
    const d = objDef(o.key);
    if (!d) return [];
    const z = G.getZone(p.zoneKey);
    const w = d.w ?? 1, dd = d.d ?? 1; const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    const cx = o.x + rw / 2, cz = o.y + rd / 2;
    const at = (a: TimedAction, reach = 1.5) => () => queueAt(p, cx, cz, a, reach);
    const out: MenuOption[] = [];
    const tags = d.tags || [];
    const powered = this.objPowered(o);
    if (o.state.mission || o.state.code || tags.includes('node') || tags.includes('keycard') || tags.includes('keypad') || o.key === 'keycard_reader') {
      const mo: MenuOption[] = G.missions?.objectOptions?.(p, o) || [];
      if (mo.length) return mo;
    }
    if (tags.includes('portal')) out.push({ label: portalVerb(o.key), action: () => this.usePortalObject(p, o) });
    // levers (press machines: their pull() sends the goods across)
    if (tags.includes('lever') || ((G as any).press?.pull && (tags.includes('press') || o.key.includes('press')))) out.push({ label: 'Pull the lever', action: at(new UseObjectAction(p, 'Pull', 0.6, 'drag', () => this.pullLever(p, o)), 1.4) });
    const seated = p.sittingOn === o.uid && p.actions.current?.name === 'Sit';
    if (d.sit && !seated) out.push({ label: 'Sit', action: at(new SitAction(p, o), 1.6) });
    if (d.sleep) {
      const tired = p.body.fatigue >= 30;
      if (tired || !d.sit) out.push({ label: 'Sleep', action: at(new SleepAction(p, o, d.sleep), 1.6), disabled: !tired ? 'not tired' : false });
    }
    if (o.inv) {
      const locked = o.inv.locked;
      const hasKey = locked && !!o.state.keyId && !!p.findItem((i) => i.data?.keyId === o.state.keyId);
      out.push({ label: locked ? 'Search (locked)' : 'Search ' + d.name, disabled: hasKey ? 'locked' : false, action: at(new LootAction(p, o.inv, o)) });
      if (locked) {
        // a matching key, a crowbar, or something heavy enough to break the lock
        const keyId = o.state.keyId as string | undefined;
        const key = keyId ? p.findItem((i) => i.data?.keyId === keyId) : null;
        const unlock = (how: string) => this.unlockObj(p, o, how);
        if (key) out.push({ label: 'Unlock with ' + itemName(key), action: at(new UseObjectAction(p, 'Unlock', 1.5, 'craft', () => { G.audio?.at?.('lock', cx, cz, 0.6); unlock('Unlocked.'); })) });
        const bar = p.findTool('#crowbar');
        out.push({ label: 'Pry it open', disabled: !bar ? 'needs a crowbar' : false, action: at(new UseObjectAction(p, 'Pry open', 7, 'push', () => {
          noise(p, cx, cz, 10, 'pry');
          G.audio?.at?.('break', cx, cz, 0.8);
          if (bar) bar.cond = Math.max(0, bar.cond - 0.02);
          op('objState', { z: z.key, uid: o.uid, patch: { pried: true } });
          unlock('The lock gives.');
        })) });
        const hw = p.handR ? itemDef(p.handR.key).weapon : undefined;
        const heavy = p.handR && hw && (hw.kind === 'blunt' || hw.kind === 'axe') && itemDef(p.handR.key).weight >= 1.2 ? p.handR : null;
        if (heavy) out.push({ label: 'Smash the lock', danger: true, action: at(new UseObjectAction(p, 'Smash lock', 4, 'hammer', () => {
          noise(p, cx, cz, 22, 'smash');
          G.audio?.at?.('metal_clank', cx, cz, 1);
          heavy.cond = Math.max(0, heavy.cond - 0.06);
          if (Math.random() < 0.6) unlock('The lock snaps.');
          else bus.emit('think', p, 'It held. Again.');
        })) });
      }
    }
    if (tags.includes('vending')) {
      out.push({ label: 'Insert coins', disabled: !p.findTool('coins') ? 'no coins' : false, action: at(new VendAction(p, o, false)) });
      if (!o.state.broken) out.push({ label: 'Smash the glass', action: at(new VendAction(p, o, true)) });
    }
    if (d.water) {
      const src = this.waterOf(z, o);
      if (src) {
        out.push({ label: 'Drink', action: at(new DrinkFromSourceAction(p, src.fluid, src.take)) });
        const vessels = p.allItems().filter((i) => itemDef(i.key).fluidCap && (i.fluid?.amount ?? 0) < (itemDef(i.key).fluidCap ?? 0) - 0.01);
        if (vessels.length) out.push({ label: 'Fill', sub: vessels.slice(0, 10).map((v) => ({ label: itemName(v), action: at(new FillAction(p, v, src.fluid, src.available, src.take)) })) });
        out.push({ label: 'Wash yourself', action: at(new UseObjectAction(p, 'Wash', 6, 'craft', () => { for (const w of p.worn.values()) w.bloody = 0; bus.emit('think', p, 'A little cleaner.'); p.body.unhappy = Math.max(0, p.body.unhappy - 4); })) });
      } else out.push({ label: 'Drink', disabled: d.water.tap ? 'water is off' : 'empty' });
    }
    if (tags.includes('switch')) {
      const room = z.room[z.idx(o.x, o.y + (o.rot === 0 ? 0 : 0))];
      const anyOn = z.lights.some((l) => z.inb(Math.floor(l.x), Math.floor(l.z)) && z.room[z.idx(Math.floor(l.x), Math.floor(l.z))] === room && l.on);
      out.push({ label: anyOn ? 'Turn lights off' : 'Turn lights on', action: at(new SwitchAction(p, () => { op('roomLights', { z: z.key, room, on: !anyOn }); G.audio?.at?.('switch', cx, cz); }, 'Light switch'), 1.4) });
    }
    if (tags.includes('tv') || tags.includes('radio') && !tags.includes('mission')) {
      out.push({ label: o.state.on ? 'Turn off' : 'Turn on', disabled: !powered ? 'no power' : false, action: at(new SwitchAction(p, () => op('objState', { z: z.key, uid: o.uid, patch: { on: !o.state.on } }))) });
    }
    if (tags.includes('terminal') || tags.includes('computer')) {
      out.push({ label: 'Use computer', disabled: !powered ? 'no power' : false, action: at(new UseObjectAction(p, 'Use computer', 2.5, 'type', () => this.useTerminal(p, o))) });
    }
    if (d.heat) {
      if (d.heat === 'fire' || d.heat === 'grill') {
        if (o.state.lit) out.push({ label: 'Put out fire', action: at(new SwitchAction(p, () => op('objState', { z: z.key, uid: o.uid, patch: { lit: false } }), 'Extinguish')) });
        else {
          const igniter = p.findTool('#lighter') || p.findTool('#matches');
          const fuel = p.findItem((i, dd) => !!dd.burn);
          out.push({ label: 'Light fire', disabled: !igniter ? 'needs lighter/matches' : !fuel && !(o.state.fuel > 0) ? 'needs fuel' : false, action: at(new UseObjectAction(p, 'Light fire', 4, 'craft', () => G.items?.lightFire?.(p, o, igniter, fuel))) });
        }
        const fuels = p.allItems().filter((i) => itemDef(i.key).burn);
        if (fuels.length) out.push({ label: 'Add fuel', sub: fuels.slice(0, 8).map((f) => ({ label: itemName(f), action: at(new UseObjectAction(p, 'Add fuel', 1.5, 'craft', () => { p.removeItem(f); this.addFuel(p, o, f); })) })) });
      } else {
        out.push({ label: o.state.on ? 'Turn off' : 'Turn on', disabled: !powered ? 'no power' : false, action: at(new SwitchAction(p, () => op('objState', { z: z.key, uid: o.uid, patch: { on: !o.state.on } }))) });
      }
      const cookables = p.allItems().filter((i) => itemDef(i.key).food?.cookable && !((i.cooked ?? 0) >= 1));
      if (cookables.length) out.push({ label: 'Cook', sub: cookables.slice(0, 10).map((f) => ({ label: itemName(f), action: () => this.cook(p, f, { o, kind: d.heat! }) })) });
    }
    if (tags.includes('generator')) out.push(...(G.items?.generatorOptions?.(p, o) || []));
    if (tags.includes('breaker') || tags.includes('fusebox')) out.push(...(G.items?.breakerOptions?.(p, o) || []));
    if (tags.includes('piano')) out.push({ label: 'Play piano', action: at(new UseObjectAction(p, 'Play', 8, 'type', () => { p.body.boredom = Math.max(0, p.body.boredom - 20); p.body.unhappy = Math.max(0, p.body.unhappy - 8); }, () => { if (Math.random() < 0.15) { G.audio?.piano?.(cx, cz); noise(p, cx, cz, 12, 'music'); } })) });
    if (tags.includes('mirror')) out.push({ label: 'Look in the mirror', action: at(new UseObjectAction(p, 'Look', 2, 'hold_item', () => G.creatures?.mirrorEvent?.(p, o) ?? bus.emit('think', p, ['Is that... me?', 'I look tired.', 'My reflection blinked late.'][Math.floor(Math.random() * 3)]))) });
    if (tags.includes('phone')) out.push({ label: o.state.ringing ? 'Answer the phone' : 'Pick up the phone', action: at(new UseObjectAction(p, 'Phone', 3, 'hold_item', () => bus.emit('phone', p, o))) });
    if (tags.includes('pushable')) out.push({ label: o.state.pushedBy ? 'Let go' : 'Push', action: () => G.items?.togglePush?.(p, o) });
    if (tags.includes('trap')) out.push(...(G.items?.trapOptions?.(p, o) || []));
    if (tags.includes('farm') || o.state.crop) out.push(...(G.items?.farmOptions?.(p, o) || []));
    if (tags.includes('rain')) out.push({ label: `Rain barrel: ${(o.state.water ?? 0).toFixed(1)} / ${d.water?.capacity ?? 40} L`, disabled: true });
    if (d.lore || o.state.lore) out.push({ label: 'Read', action: at(new UseObjectAction(p, 'Read', 1.5, 'read', () => this.readLoreId(p, o.state.lore || d.lore!))) });
    if (d.movable && !o.inv?.items.length) out.push({ label: 'Pick up', disabled: d.movable > p.capacity() * 1.6 ? 'too heavy' : false, action: at(new UseObjectAction(p, 'Pick up', 2.5, 'pickup', () => G.items?.pickupFurniture?.(p, o))) });
    if (d.movable) out.push({ label: 'Rotate', action: at(new UseObjectAction(p, 'Rotate', 1.2, 'push', () => op('objMove', { z: z.key, uid: o.uid, x: o.x, y: o.y, rot: ((o.rot + 1) % 4) as any }))) });
    if (d.disassemble) {
      const missing = d.disassemble.tools.filter((t) => !p.findTool(t));
      out.push({ label: 'Disassemble', disabled: missing.length ? 'needs ' + missing.map((m) => m.replace('#', '')).join(', ') : false, action: at(new DisassembleAction(p, o)) });
    }
    bus.emit('objectMenu', p, o, out);
    return out;
  }

  /** what water an object gives right now (taps need the water main) */
  waterOf(z: Zone, o: TileObject) {
    const d = objDef(o.key)!;
    if (d.water!.tap && z.waterOn) return { name: d.name, fluid: (d.water!.tainted ? 'tainted' : 'water') as FluidType, available: Infinity, take: undefined as any };
    const stored = o.state.water ?? (d.water!.capacity * 0.6);
    if (stored <= 0.05) return null;
    return { name: d.name, fluid: (d.water!.tainted || !d.water!.tap ? 'tainted' : 'water') as FluidType, available: stored, take: (l: number) => op('objState', { z: z.key, uid: o.uid, patch: { water: Math.max(0, stored - l) } }) };
  }

  edgeOptions(p: Player, x: number, y: number, side: 0 | 1): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    const e = z.edge(x, y, side); if (!e) return [];
    const px = side === 0 ? x + 0.5 : x, pz = side === 0 ? y : y + 0.5;
    const at = (a: TimedAction) => () => queueAt(p, px, pz, a, 1.4);
    const out: MenuOption[] = [];
    if (e.kind === 'door' || e.kind === 'gate') {
      if (e.portal) out.push({ label: 'Go through', action: () => this.enterPortal(p, e.portal!, { x: px, z: pz }) });
      const key = e.keyId ? p.findItem((i) => i.data?.keyId === e.keyId || i.key === 'keyring') : null;
      if (e.locked && key) out.push({ label: 'Unlock', action: at(new DoorAction(p, x, y, side, 'unlock')) });
      out.push({ label: e.open ? 'Close' : 'Open', action: at(new DoorAction(p, x, y, side, 'toggle')), disabled: e.barricade ? 'barricaded' : false });
      if (e.locked && !key) out.push({ label: 'Unlock', disabled: 'no key', action: at(new DoorAction(p, x, y, side, 'unlock')) });
      else if (!e.open) out.push({ label: 'Lock', disabled: !key && e.keyId ? 'no key' : false, action: at(new DoorAction(p, x, y, side, 'lock')) });
      out.push({ label: 'Knock', action: at(new DoorAction(p, x, y, side, 'knock')) });
      if (e.locked && !e.open) out.push({ label: 'Kick down', danger: true, action: at(new DoorAction(p, x, y, side, 'kick')) });
    }
    if (e.kind === 'window') {
      if (e.glass === 'intact') out.push({ label: e.open ? 'Close window' : 'Open window', action: at(new WindowAction(p, x, y, side, 'toggle')) });
      if (e.open || e.glass !== 'intact') out.push({ label: 'Climb through', action: () => this.climbThrough(p, x, y, side), disabled: e.barricade ? 'barricaded' : false });
      if (e.glass === 'intact') out.push({ label: 'Smash window', danger: true, action: at(new WindowAction(p, x, y, side, 'smash')) });
      if (e.glass === 'broken') out.push({ label: 'Remove broken glass', action: at(new WindowAction(p, x, y, side, 'clearGlass')) });
      if (e.curtains && e.curtains !== 'none') out.push({ label: e.curtains === 'open' ? 'Close curtains' : 'Open curtains', action: at(new WindowAction(p, x, y, side, 'curtains')) });
      else out.push({ label: 'Hang a sheet as curtain', disabled: !(p.findTool('#sheet') || p.findTool('bedsheet')) ? 'needs sheet' : false, action: at(new WindowAction(p, x, y, side, 'addCurtains')) });
    }
    const hasHammer = !!p.findTool('#hammer');
    if (e.barricade < 4 && e.kind !== 'arch') {
      const planks = !!p.findTool('plank'), nails = !!p.findTool('#nails');
      out.push({ label: 'Barricade (plank)', disabled: !hasHammer ? 'needs hammer' : !planks ? 'needs plank' : !nails ? 'needs nails' : false, action: at(new BarricadeAction(p, x, y, side)) });
      if (p.findTool('sheet_metal')) out.push({ label: 'Barricade (metal sheet)', disabled: !hasHammer ? 'needs hammer' : !p.findTool('#screws') ? 'needs screws' : false, action: at(new BarricadeAction(p, x, y, side, true)) });
    }
    if (e.barricade > 0) out.push({ label: 'Remove barricade', disabled: !(hasHammer || p.findTool('#crowbar')) ? 'needs hammer or crowbar' : false, action: at(new UnbarricadeAction(p, x, y, side)) });
    return out;
  }

  climbThrough(p: Player, x: number, y: number, side: 0 | 1) {
    const z = G.getZone(p.zoneKey);
    const e = z.edge(x, y, side); if (!e) return;
    if (e.barricade) { bus.emit('think', p, "It's barricaded."); return; }
    // which side is the player on?
    let tx: number, tz: number, sx: number, sz: number;
    if (side === 0) { const before = p.z < y; sx = x + 0.5; sz = before ? y - 0.45 : y + 0.45; tx = x + 0.5; tz = before ? y + 0.55 : y - 0.55; }
    else { const before = p.x < x; sx = before ? x - 0.45 : x + 0.45; sz = y + 0.5; tx = before ? x + 0.55 : x - 0.55; tz = y + 0.5; }
    p.actions.clear();
    if (Math.hypot(sx - p.x, sz - p.z) > 0.6) p.actions.add(new WalkToAction(p, Math.floor(sx), Math.floor(sz), false, 0.5, { x: sx, z: sz }));
    p.actions.add(new ClimbAction(p, tx, tz, e.glass === 'broken'));
  }

  playerOptions(p: Player, o: Player): MenuOption[] {
    const out: MenuOption[] = [];
    const at = (a: TimedAction) => () => queueAt(p, o.x, o.z, a, 1.4, false);
    if (o.body.downed || o.remote?.state?.down) {
      out.push({ label: 'Revive', action: at(new UseObjectAction(p, 'Revive', 6, 'bandage', () => G.net?.revive?.(o.id))) });
      out.push({ label: p.carrying === o.id ? 'Put down' : 'Carry over shoulder', action: () => G.net?.toggleCarry?.(o.id) });
    }
    out.push({ label: 'Check health', action: () => ((G as any).watch?.showHealthOf ? (G as any).watch.showHealthOf(o) : G.ui?.scanner?.showHealthOf?.(o)) });
    const meds = p.allItems().filter((i) => itemDef(i.key).medical);
    if (meds.length) out.push({ label: 'Treat wounds…', action: () => ((G as any).watch?.showHealthOf ? (G as any).watch.showHealthOf(o) : G.ui?.scanner?.showHealthOf?.(o)) });
    const gives = p.allItems().filter((i) => !p.isWorn(i)).slice(0, 14);
    if (gives.length) out.push({ label: 'Give', sub: gives.map((i) => ({ label: itemName(i), action: at(new UseObjectAction(p, 'Give', 1, 'hold_item', () => G.net?.giveItem?.(o.id, i))) })) });
    return out;
  }

  tileOptions(p: Player, x: number, y: number): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    const out: MenuOption[] = [];
    const f = z.floorAt(x, y);
    if (!f) return out;
    out.push({ label: 'Walk here', action: () => { p.actions.clear(); p.actions.add(new WalkToAction(p, x, y, false, 0.3)); } });
    if (f.diggable) out.push({ label: 'Dig a furrow', disabled: !(p.findTool('#shovel') || p.findTool('#trowel')) ? 'needs shovel/trowel' : false, action: () => queueAt(p, x + 0.5, y + 0.5, new DigAction(p, x, y), 1.3) });
    if (f.forage) out.push({ label: 'Forage here', action: () => queueAt(p, x + 0.5, y + 0.5, new ForageAction(p, x, y, f.forage!), 1.0) });
    if (z.flags[z.idx(x, y)] & TF.FURROW || f.farmable) out.push(...(G.items?.soilOptions?.(p, x, y) || []));
    const marker = p.findItem((i) => ['spray_paint', 'chalk', 'glow_paint', 'marker'].includes(i.key) && (i.uses ?? 1) > 0.01);
    if (marker) out.push({ label: 'Mark the floor', sub: [
      { label: 'Arrow →', action: () => queueAt(p, x + 0.5, y + 0.5, new MarkAction(p, marker, x + 0.5, y + 0.5, marker.key === 'glow_paint' ? 'decal_glow_paint' : 'decal_arrow_floor'), 1.3) },
      { label: 'X mark', action: () => queueAt(p, x + 0.5, y + 0.5, new MarkAction(p, marker, x + 0.5, y + 0.5, 'decal_mark_x'), 1.3) },
    ] });
    out.push({ label: 'Sit on the floor', action: () => { p.actions.clear(); p.actions.add(new SitAction(p, null)); } });
    out.push({ label: 'Sleep on the floor', disabled: p.body.fatigue < 30 ? 'not tired' : false, action: () => { p.actions.clear(); p.actions.add(new SleepAction(p, null, 0.15)); } });
    const buildOpts = G.items?.buildOptions?.(p, x, y) || [];
    if (buildOpts.length) out.push({ label: 'Build', sub: buildOpts });
    return out;
  }

  // ---------------- portals ----------------
  enterPortal(p: Player, portalId: string, pos: { x: number; z: number }) {
    const z = G.getZone(p.zoneKey);
    const portal = z.portals.find((q) => q.id === portalId);
    if (!portal) return;
    queueAt(p, pos.x, pos.z, new UseObjectAction(p, portal.label || 'Enter', 0.5, 'hold_item', () => G.usePortal(p, portal)), 1.4);
  }
  usePortalObject(p: Player, o: TileObject) {
    const z = G.getZone(p.zoneKey);
    const portal = z.portals.find((q) => q.id === o.state.portal) || z.portals.find((q) => Math.abs(q.x - o.x) <= 1 && Math.abs(q.y - o.y) <= 1);
    if (!portal) { bus.emit('think', p, 'It leads nowhere. Yet.'); return; }
    queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, portal.label || 'Go', 0.8, 'hold_item', () => G.usePortal(p, portal)), 1.5);
  }

  // ---------------- terminals & lore ----------------
  useTerminal(p: Player, o: TileObject) {
    const id = o.state.lore || pickTerminalLore(G.getZone(p.zoneKey), o);
    const entry = lore(id);
    G.ui?.read(entry?.title || 'TERMINAL', entry?.text || 'NO DATA. THE DRIVE HUMS QUIETLY.', 'terminal');
    bus.emit('loreRead', p, id);
  }
  readLoreId(p: Player, id: string) {
    const entry = lore(id);
    G.ui?.read(entry?.title || 'Note', entry?.text || '(illegible)', entry?.style === 'terminal' ? 'terminal' : 'paper');
    bus.emit('loreRead', p, id);
  }
  readLore(p: Player, it: Item) {
    const id = it.data?.lore || itemDef(it.key).lore || 'note_generic';
    this.readLoreId(p, id);
  }

  // ---------------- cooking ----------------
  cook(p: Player, it: Item, heat: { o: TileObject; kind: string } | null) {
    if (!heat) { bus.emit('think', p, 'I need a fire or a stove.'); return; }
    const d = itemDef(it.key);
    const mins = d.food?.cookMins ?? 20;
    const secs = Math.min(30, 3 + mins * 0.35) * (heat.kind === 'microwave' ? 0.4 : 1);
    const ho = heat.o;
    queueAt(p, ho.x + 0.5, ho.y + 0.5, new UseObjectAction(p, 'Cook ' + d.name, secs, 'craft', () => {
      const skill = p.body.skill('cooking');
      it.cooked = Math.random() < 0.1 - skill * 0.01 ? 1.7 : 1;
      p.body.addXp('cooking', 6);
      bus.emit('halo', p, it.cooked >= 1.6 ? 'Burnt!' : 'Cooked', it.cooked >= 1.6 ? 'bad' : 'good');
      bus.emit('inventoryChanged', p);
    }, () => { if (Math.random() < 0.05) G.audio?.at?.('sizzle', ho.x, ho.y); }), 1.5);
  }

  addFuel(p: Player, o: TileObject, f: Item) {
    op('objState', { z: p.zoneKey, uid: o.uid, patch: { fuel: (o.state.fuel ?? 0) + (itemDef(f.key).burn ?? 0.5) } });
    G.audio?.at?.('fire_crackle', o.x + 0.5, o.y + 0.5, 0.5);
  }
  unlockObj(p: Player, o: TileObject, how = 'Unlocked.') {
    op('invLock', { z: p.zoneKey, uid: o.uid, locked: false });
    bus.emit('think', p, how);
  }
  /** a lever: a press machine's own pull() when it has one; everyone hears it either way */
  pullLever(p: Player, o: TileObject) {
    G.audio?.at?.('metal_clank', o.x + 0.5, o.y + 0.5, 0.8);
    if ((G as any).press?.pull) (G as any).press.pull(p, o);
    bus.emit('leverPull', p, o);
  }

  startPlacing(p: Player, it: Item) { G.items?.startPlacing?.(p, it); }
  plantMode(p: Player, it: Item) { G.items?.plantMode?.(p, it); }
  markMode(p: Player, it: Item) {
    const x = Math.floor(p.x + Math.cos(p.facing)), y = Math.floor(p.z + Math.sin(p.facing));
    p.actions.add(new MarkAction(p, it, x + 0.5, y + 0.5, it.key === 'glow_paint' ? 'decal_glow_paint' : 'decal_arrow_floor'));
  }
  entertain(p: Player, it: Item) {
    p.actions.add(new UseObjectAction(p, 'Play', 20, 'read', () => { p.body.boredom = Math.max(0, p.body.boredom - 25); p.body.unhappy = Math.max(0, p.body.unhappy - 10); }, () => { if (G.survival) G.survival.entertained = 1; if (it.uses !== undefined) it.uses = Math.max(0, it.uses - 0.0005); }));
  }
  reload(p: Player, it: Item) {
    const d = itemDef(it.key); const w = d.weapon!;
    const ammo = p.findItem((x) => x.key === w.ammo); if (!ammo) return;
    p.actions.add(new UseObjectAction(p, 'Reload', w.reload ?? 2.5, 'reload', () => {
      const need = (w.mag ?? 0) - (it.ammo ?? 0);
      const have = ammo.data?.count ?? itemDef(ammo.key).ammoCount ?? 1;
      const take = Math.min(need, have);
      it.ammo = (it.ammo ?? 0) + take;
      ammo.data = { ...(ammo.data || {}), count: have - take };
      if (have - take <= 0) p.removeItem(ammo);
      G.audio?.at?.('reload', p.x, p.z);
      bus.emit('inventoryChanged', p);
    }));
  }
  radioMenu(p: Player, it: Item) { G.net?.radioMenu?.(p, it) ?? G.ui?.scanner?.toggle?.(true, 'radio'); }
}

function portalVerb(key: string) {
  if (key.includes('staircase_up') || key.includes('ladder')) return 'Climb up';
  if (key.includes('staircase_down') || key.includes('manhole') || key.includes('hole')) return 'Go down';
  if (key.includes('elevator')) return 'Call the elevator';
  if (key.includes('exit')) return 'Step through';
  return 'Go through';
}

function pickTerminalLore(z: Zone, o: TileObject): string {
  const pool = z.meta.terminalLore as string[] | undefined;
  if (pool?.length) return pool[o.uid % pool.length];
  return 'terminal_generic';
}

/** Picking up an item lying on the floor */
export class PickupAction extends TimedAction {
  constructor(p: Player, public it: Item) { super(p); this.name = 'Pick up'; this.duration = 0.5; this.anim = 'pickup'; this.showBar = false; }
  perform() {
    const z = G.getZone(this.p.zoneKey);
    const fc = floorContainer(z, this.p.x, this.p.z, 2.0);
    if (!fc.items.includes(this.it)) return;
    queueTransfers(this.p, [this.it], fc, this.p.inv);
    G.audio?.itemSound?.(this.it.key, 'pick', this.p);
  }
}

export { createItem, lineOfSight };
