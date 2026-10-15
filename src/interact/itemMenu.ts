import { G } from '../game/G';
import { MenuOption } from '../ui/ui';
import type { Player } from '../entities/player';
import { Item, itemDef, itemName, freshness } from '../items/item';
import { Container } from '../items/container';
import { EatAction, DrinkAction, WearAction, EquipAction, ReadAction, OpenCanAction, RipAction, PourAction, FillAction } from '../actions/basic';
import { BandageAction, DisinfectAction, StitchAction, SplintAction, RemoveForeignAction, PillAction, injuryLabel, RemoveBandageAction } from '../actions/medical';
import { queueTransfers } from '../actions/transfer';
import { floorContainer } from '../items/worldItems';
import { isWorldContainer } from '../game/worldOps';
import { bus } from '../core/events';
import { craftOptionsForItem } from './crafting';
import { itemMenuHook } from '../game/debt';

const hasTag = (it: Item, t: string) => (itemDef(it.key).tags || []).includes(t) || itemDef(it.key).key === t;

/**
 * Right-click options for an item in any container — the heart of Project
 * Zomboid's "you can do almost anything" feel.
 */
export function itemMenuOptions(p: Player, it: Item, c: Container, group: Item[]): MenuOption[] {
  const d = itemDef(it.key);
  const o: MenuOption[] = [];
  const inWorld = isWorldContainer(c) || c.kind === 'floor';
  const mine = !inWorld;
  // ---- moving
  if (inWorld) {
    o.push({ label: group.length > 1 ? `Grab (×1)` : 'Grab', action: () => queueTransfers(p, [it], c, p.inv) });
    if (group.length > 1) o.push({ label: `Grab all (×${group.length})`, action: () => queueTransfers(p, group, c, p.inv) });
  } else {
    if (c.kind !== 'floor') o.push({ label: 'Drop', action: () => queueTransfers(p, [it], c, floorContainer(G.zone, p.x, p.z)) });
    if (group.length > 1) o.push({ label: `Drop all (×${group.length})`, action: () => queueTransfers(p, group.filter((i) => !p.isWorn(i)), c, floorContainer(G.zone, p.x, p.z)) });
    const bags = p.containers().filter((b) => b !== c);
    if (bags.length) o.push({ label: 'Move to', sub: bags.map((b) => ({ label: b === p.inv ? 'Pockets' : b.name, action: () => queueTransfers(p, [it], c, b) })) });
  }
  const pre = (fn: () => void) => () => { if (inWorld) queueTransfers(p, [it], c, p.inv); fn(); };

  // ---- equipping & wearing
  if (d.clothing || d.bag) {
    if (mine && p.isWorn(it)) o.push({ label: 'Take off', action: () => p.actions.add(new WearAction(p, it, true)) });
    else o.push({ label: d.bag ? 'Wear on back' : 'Wear', action: pre(() => p.actions.add(new WearAction(p, it))), disabled: d.bag && d.bag.slot === 'hand' ? 'carry in hand' : false });
  }
  if (d.weapon || d.light || (d.tags || []).length || d.bag?.slot === 'hand' || d.heavy || d.radio) {
    if (p.handR === it || p.handL === it) o.push({ label: 'Unequip', action: () => p.actions.add(new EquipAction(p, null, p.handR === it ? 'R' : 'L')) });
    else {
      if (d.weapon?.twoHanded) o.push({ label: 'Equip two-handed', action: pre(() => p.actions.add(new EquipAction(p, it, 'R'))) });
      else {
        o.push({ label: 'Equip primary', action: pre(() => p.actions.add(new EquipAction(p, it, 'R'))) });
        o.push({ label: 'Equip secondary', action: pre(() => p.actions.add(new EquipAction(p, it, 'L'))) });
      }
    }
  }
  if (d.light) {
    const on = p.lightItem === it && p.flashlightOn;
    o.push({ label: on ? 'Turn off' : 'Turn on', action: () => { if (p.handR !== it && p.handL !== it) p.equip(it, p.handR ? 'L' : 'R'); p.lightItem = it; p.flashlightOn = !on; G.audio?.at?.('click', p.x, p.z); }, disabled: (it.uses ?? 1) <= 0 ? 'no power' : false });
    const bat = p.findTool('#battery');
    if (d.battery !== false) o.push({ label: 'Replace battery', disabled: !bat ? 'needs battery' : false, action: () => { if (!bat) return; const old = it.uses ?? 0; it.uses = bat.uses ?? 1; bat.uses = old; if (old <= 0.02) p.removeItem(bat); bus.emit('inventoryChanged', p); G.audio?.at?.('click', p.x, p.z); } });
  }

  // ---- food & drink
  if (d.food) {
    const f = d.food;
    if (f.canned && !it.opened && !f.openedInto?.includes?.('?')) {
      const opener = p.findTool('#canopener') || null;
      const knife = opener ? null : p.findTool('#knife') || null;
      o.push({ label: 'Open', action: pre(() => p.actions.add(new OpenCanAction(p, it, opener || knife))) });
      o.push({ label: 'Eat', disabled: 'sealed' });
    } else {
      const rotten = freshness(it) === 'rotten';
      const raw = f.raw && !((it.cooked ?? 0) >= 1);
      const lbl = f.pills ? 'Take' : 'Eat';
      const warn = rotten ? ' (rotten!)' : raw ? ' (raw!)' : '';
      // medicine is taken one dose at a time through its medical option below
      if (f.pills) { if (!d.medical) o.push({ label: lbl, action: pre(() => p.actions.add(new EatAction(p, it, 1))) }); }
      else o.push({
        label: lbl + warn, sub: [
          { label: 'All', action: pre(() => p.actions.add(new EatAction(p, it, 1))) },
          { label: 'Half', action: pre(() => p.actions.add(new EatAction(p, it, 0.5))) },
          { label: 'Quarter', action: pre(() => p.actions.add(new EatAction(p, it, 0.25))) },
        ],
      });
    }
    if (f.cookable && !((it.cooked ?? 0) >= 1)) {
      const heat = G.interact?.nearHeat?.(p);
      o.push({ label: 'Cook', disabled: !heat ? 'needs a heat source' : false, action: pre(() => G.interact?.cook?.(p, it, heat)) });
    }
  }
  if (d.fluidCap) {
    const fl = it.fluid;
    if (fl && fl.amount > 0.01) {
      const can = Math.min(fl.amount, 1);
      o.push({ label: 'Drink', sub: [
        { label: `Sip (0.1 L)`, action: pre(() => p.actions.add(new DrinkAction(p, it, Math.min(0.1, fl.amount)))) },
        { label: `Gulp (${Math.min(0.25, can).toFixed(2)} L)`, action: pre(() => p.actions.add(new DrinkAction(p, it, Math.min(0.25, fl.amount)))) },
        { label: `Until full`, action: pre(() => p.actions.add(new DrinkAction(p, it, Math.min(fl.amount, Math.max(0.1, p.body.thirst / 48))))) },
      ] });
      const others = p.allItems().filter((x) => x !== it && itemDef(x.key).fluidCap && (x.fluid?.amount ?? 0) < (itemDef(x.key).fluidCap ?? 0) - 0.01);
      if (others.length) o.push({ label: 'Pour into', sub: others.slice(0, 10).map((x) => ({ label: itemName(x), action: () => p.actions.add(new PourAction(p, it, x)) })) });
      o.push({ label: 'Pour out', action: () => p.actions.add(new PourAction(p, it, null)) });
    }
    const src = G.interact?.nearWater?.(p);
    if (src) o.push({ label: `Fill (${src.name})`, action: pre(() => p.actions.add(new FillAction(p, it, src.fluid, src.available, src.take))) });
  }

  // ---- medical
  if (d.medical) {
    const m = d.medical;
    const targets = G.interact?.medicalTargets?.(p) || [p];
    const injOpts = (filter: (inj: any) => boolean, mk: (t: Player, inj: any) => any) => {
      const subs: MenuOption[] = [];
      for (const t of targets) for (const inj of t.body.allInjuries()) if (filter(inj)) subs.push({ label: (t === p ? '' : t.name + ' — ') + injuryLabel(inj), action: pre(() => p.actions.add(mk(t, inj))) });
      return subs;
    };
    if (m.type === 'bandage') {
      const subs = injOpts((inj) => inj.type !== 'bruise', (t, inj) => new BandageAction(p, t, inj, it));
      o.push({ label: 'Apply bandage', sub: subs, disabled: subs.length ? false : 'no wounds' });
    } else if (m.type === 'disinfect') {
      const subs = injOpts((inj) => inj.type !== 'bruise' && inj.type !== 'fracture', (t, inj) => new DisinfectAction(p, t, inj, it));
      o.push({ label: 'Disinfect', sub: subs, disabled: subs.length ? false : 'no wounds' });
    } else if (m.type === 'suture') {
      const thread = p.findTool('#thread') || null;
      const subs = injOpts((inj) => (inj.type === 'deep' || inj.type === 'laceration' || inj.type === 'bite') && !inj.stitched && !inj.foreign, (t, inj) => new StitchAction(p, t, inj, it, thread));
      o.push({ label: 'Stitch', sub: subs, disabled: subs.length ? false : 'nothing to stitch' });
    } else if (m.type === 'splint') {
      const subs = injOpts((inj) => inj.type === 'fracture' && !inj.splinted, (t, inj) => new SplintAction(p, t, inj, it));
      o.push({ label: 'Apply splint', sub: subs, disabled: subs.length ? false : 'no fractures' });
    } else if (m.type === 'tweezers') {
      const subs = injOpts((inj) => inj.foreign, (t, inj) => new RemoveForeignAction(p, t, inj, it));
      o.push({ label: 'Remove shard', sub: subs, disabled: subs.length ? false : 'nothing lodged' });
    } else {
      o.push({ label: 'Take', action: pre(() => p.actions.add(new PillAction(p, it))) });
    }
    if (m.type === 'bandage') {
      const subs = injOpts((inj) => !!inj.bandage, (t, inj) => new RemoveBandageAction(p, t, inj));
      if (subs.length) o.push({ label: 'Remove bandage', sub: subs });
    }
  }

  // ---- reading
  if (d.literature || d.lore) {
    o.push({ label: d.lore ? 'Read' : 'Read', action: pre(() => {
      if (d.lore && !d.literature) G.interact?.readLore?.(p, it);
      else p.actions.add(new ReadAction(p, it));
    }) });
  }
  // ---- clothing ripping
  if (d.clothing?.rip && mine && !p.isWorn(it)) o.push({ label: 'Rip into ' + itemDef(d.clothing.rip).name.toLowerCase() + 's', action: () => p.actions.add(new RipAction(p, it)) });

  // ---- placeables & specials
  if (d.place || (it.key === 'furniture' && it.data?.obj)) o.push({ label: 'Place', action: pre(() => G.interact?.startPlacing?.(p, it)) });
  if (d.seed) o.push({ label: 'Plant', action: pre(() => G.interact?.plantMode?.(p, it)) });
  if (d.radio) o.push({ label: 'Radio…', action: () => G.interact?.radioMenu?.(p, it) });
  if (hasTag(it, 'entertain') || ['mp3_player', 'handheld_game', 'deck_of_cards', 'comic'].includes(it.key)) {
    o.push({ label: it.key === 'deck_of_cards' ? 'Play solitaire' : 'Use', action: pre(() => G.interact?.entertain?.(p, it)) });
  }
  if (hasTag(it, 'spray') || hasTag(it, 'chalk') || it.key === 'glow_paint' || it.key === 'marker') o.push({ label: 'Mark surface', action: pre(() => G.interact?.markMode?.(p, it)) });
  if (d.weapon?.mag) {
    const ammo = d.weapon.ammo ? p.findItem((x) => x.key === d.weapon!.ammo) : undefined;
    o.push({ label: 'Reload', disabled: !ammo ? 'no ammo' : (it.ammo ?? 0) >= d.weapon.mag ? 'full' : false, action: () => G.interact?.reload?.(p, it) });
  }
  if (d.weapon?.kind === 'thrown' || d.weapon?.fire) o.push({ label: 'Throw (aim + click)', action: pre(() => p.actions.add(new EquipAction(p, it, 'R'))) });
  if (d.anomaly) o.push({ label: 'Study with scanner', action: () => G.ui?.scanner?.studyItem?.(it) });

  // ---- crafting
  const crafts = craftOptionsForItem(p, it);
  if (crafts.length) o.push({ label: 'Craft', sub: crafts });

  // the debt contract: deposit at a hopper, the band that does not come off (src/game/debt)
  itemMenuHook(p, it, c, o, inWorld);

  o.push({ label: '-' });
  o.push({ label: 'Inspect', action: () => G.ui?.read(itemName(it), inspectText(it)) });
  return o;
}

function inspectText(it: Item): string {
  const d = itemDef(it.key);
  const lines = [d.desc || 'Nothing remarkable about it.', '', `Category: ${d.cat}`, `Weight: ${d.weight} kg`];
  if (d.tags?.length) lines.push(`Useful as: ${d.tags.join(', ')}`);
  return lines.join('\n');
}
