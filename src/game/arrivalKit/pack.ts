// The issue pack (item key 'iron_cube': the Meridian-issue backpack) is not
// part of the intake kit any more: Staff Sergeant Voss has it sent down a
// chute in the arrival scene (src/game/arrival.ts). Every path that skips the
// arrival (intro skipped, ?quick, free survival, joining a crew, old saves)
// still ends with it on the survivor's back through ensurePack().
import { bus } from '../../core/events';
import { createItem } from '../../items/factory';
import { hasItemDef, type Item } from '../../items/item';
import type { Player } from '../../entities/player';

export const PACK_KEY = 'iron_cube';

type WithIntake = { intakePack?: Item | null };

/** the survivor's pack wherever it is (worn, carried, or held back by the intake) */
function findPack(p: Player): Item | null {
  const back = p.worn.get('back');
  if (back?.key === PACK_KEY) return back;
  const held = (p as unknown as WithIntake).intakePack;
  if (held && held.key === PACK_KEY) return held;
  return p.allItems().find((i) => i.key === PACK_KEY) ?? null;
}

/** make sure the pack is on the survivor's back (creates one if they have none); true when it is */
export function ensurePack(p: Player | null | undefined): boolean {
  if (!p || !hasItemDef(PACK_KEY)) return false;
  try {
    let it = findPack(p);
    if (p.worn.get('back') === it && it) return true;
    if (!it) it = createItem(PACK_KEY, undefined, { pristine: true });
    const w = p as unknown as WithIntake;
    if (w.intakePack === it) w.intakePack = null;
    if (!p.allItems().includes(it)) p.inv.add(it);
    // something else on the back (a job's bag): it goes into the pack's pocket, the pack goes on
    const prev = p.worn.get('back');
    if (prev && prev !== it) { p.unwear(prev); }
    p.wear(it);
    bus.emit('inventoryChanged', p);
    return p.worn.get('back') === it;
  } catch (e) { console.warn('ensurePack', e); return false; }
}

/** take the pack off the survivor for the scene that hands it over (returns it, or a fresh one) */
export function takePack(p: Player): Item | null {
  if (!hasItemDef(PACK_KEY)) return null;
  const w = p as unknown as WithIntake;
  let it = findPack(p);
  if (it) { if (p.allItems().includes(it)) p.removeItem(it); }
  else it = createItem(PACK_KEY, undefined, { pristine: true });
  // (the intake's held pack is ours now: null tells it that it was handed over)
  if ('intakePack' in (p as object) || w.intakePack !== undefined) w.intakePack = null;
  p.outfitDirty = true;
  return it;
}

/** shoulder it: into the inventory and onto the back */
export function givePack(p: Player, it: Item | null) {
  if (!it) { ensurePack(p); return; }
  if (!p.allItems().includes(it)) p.inv.add(it);
  const prev = p.worn.get('back');
  if (prev && prev !== it) p.unwear(prev);
  p.wear(it);
  bus.emit('inventoryChanged', p);
}

/** does the survivor have the pack on */
export function packWorn(p: Player | null | undefined): boolean { return !!p && p.worn.get('back')?.key === PACK_KEY; }
