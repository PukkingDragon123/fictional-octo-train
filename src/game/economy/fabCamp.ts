// THE FAB MACHINES AT A CAMP (round 20): the filament maker and the printer as build pieces (build mode, B),
// their blueprints researched on the lab's lattice (Build · Fabrication). Raised and welded like any machine;
// once built, the context menu steps up to it (src/ui/menus/fab/camp.ts: the same machine as the lab's, on a
// small stage of its own). The models standing in the level are src/content/furniture/zb_fab.ts.
import { bus } from '../../core/events';
import { defPiece, type Piece } from '../../build/pieces';
import { treeOffers } from '../treeData';
import { G } from '../G';
import { objDef } from '../../world/objects';
import type { Player } from '../../entities/player';
import type { TileObject } from '../../world/zone';
import type { MenuOption } from '../../ui/ui';

export const FAB_PIECES: Piece[] = [
  { key: 'fab_filament', name: 'Filament Maker', cat: 'machine', kind: 'obj', obj: 'bld_filament', w: 2, d: 1, h: 1.7, cost: [['steel_frame', 1], ['motor', 1], ['pipe', 2], ['wire', 2], ['sheet_metal', 1]], weld: 10, node: 'bp_filament', stats: { power: -1 }, station: 'forge', desc: 'A hopper over two cutter shafts, a heated barrel and a screw, a water bath, a winder. Scrap in, a spool of filament out.' },
  { key: 'fab_printer', name: 'Printer', cat: 'machine', kind: 'obj', obj: 'bld_printer', h: 1.75, cost: [['steel_frame', 2], ['motor', 1], ['electronics_scrap', 2], ['glass_pane', 1], ['wire', 2]], weld: 12, node: 'bp_printer', stats: { power: -1 }, station: 'forge', desc: 'A glazed fabricator: a bed that drops a layer at a time under a travelling head. Prints researched patterns from spools.' },
];
for (const p of FAB_PIECES) defPiece(p);
treeOffers([
  { key: 'bp_filament', category: 'build', lane: 'Fabrication', title: 'Filament Maker', cost: 4, item: 'plastic_scrap', alt: ['scrap_metal'], desc: FAB_PIECES[0].desc, gives: 'blueprint: Filament Maker' },
  { key: 'bp_printer', category: 'build', lane: 'Fabrication', title: 'Printer', cost: 6, requires: ['bp_filament'], item: 'electronics_scrap', alt: ['scrap_metal'], desc: FAB_PIECES[1].desc, gives: 'blueprint: Printer' },
]);

let wired = false;
export function wireFabCamp() {
  if (wired) return;
  wired = true;
  const kindOf = (o: TileObject) => (o.key === 'bld_filament' ? 'filament' : o.key === 'bld_printer' ? 'printer' : null);
  // (too frightened to work a machine mid-run: src/game/panic.ts, loaded when it is used)
  const go = (kind: 'filament' | 'printer', o: TileObject, p: Player) => { void import('../panic').then((pm) => { if (pm.panicLocks('press')) { pm.panicFumble('press'); return; } return import('../../ui/menus/fab/camp').then((m) => m.openCampFab(kind, o, p)); }); };
  bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => {
    const kind = kindOf(o);
    if (!kind || o.state?.built === false) return;
    out.unshift({ label: kind === 'filament' ? 'Work the filament maker' : 'Use the printer', action: () => go(kind, o, p) });
  });
  // the hands' label over a camp machine: [E] Use (src/ui/hotbar/context.ts reads G.ctxHooks; it heads the label, before Grip)
  const g = G as unknown as { ctxHooks?: ((p: Player, touch: boolean) => unknown[])[] };
  (g.ctxHooks ||= []).push((p: Player) => {
    if (p.body.dead || (G as unknown as { build?: { active?: boolean } }).build?.active) return [];
    for (const o of ((G as unknown as { interact?: { objectsNear?: (p: Player, r: number) => TileObject[] } }).interact?.objectsNear?.(p, 1.8) || [])) {
      const kind = kindOf(o);
      if (!kind || o.state?.built === false) continue;
      const d = objDef(o.key);
      const at = { x: o.x + (d?.w ?? 1) / 2, y: (p.y ?? 0) + Math.min(2, d?.height ?? 1) + 0.3, z: o.y + (d?.d ?? 1) / 2 };
      return [{ id: 'fab_use', label: kind === 'filament' ? 'Work it' : 'Print', icon: 'open', key: 'E', run: () => go(kind, o, p), tgt: 'o:' + o.uid, name: d?.name ?? 'Machine', head: 'Use', anchor: () => at }];
    }
    return [];
  });
}
