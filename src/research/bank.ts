// Getting samples home. The rule: a sample counts once it reaches the lab.
//   · feed it to a Remittance Press: it is pneumatic-tubed to the research lab
//     and banked at once (src/game/debt/hopper.ts emits 'samplesPressed')
//   · walk out of the building with it (the 'escaped' ending): everything you
//     carry is banked
//   · die with it on you: it is lost (the death report counts it)
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { Item } from '../items/item';
import { bankSample, type SampleKind } from '../game/codex';

export const isSample = (it: Item | null | undefined) => !!it && it.key.startsWith('sample_') && !!it.data?.src;
/** samples on a survivor */
export function carriedSamples(p: Player): Item[] { return p.allItems().filter(isSample); }
function bankItem(it: Item) { bankSample((it.data!.kind ?? it.key.slice(7)) as SampleKind, String(it.data!.src), Number(it.data!.q ?? 0.5)); }

let wired = false;
/** the local survivor's samples reach the lab (installed once per page) */
export function wireSampleBank() {
  if (wired) return;
  wired = true;
  bus.on('samplesPressed', (e: { by?: string; items?: Item[] }) => {
    if (!e?.items?.length || !G.local || (e.by && e.by !== G.local.id)) return;
    for (const it of e.items) if (isSample(it)) bankItem(it);
    bus.emit('halo', G.local, `${e.items.length} sample${e.items.length > 1 ? 's' : ''} tubed to the lab`, 'good');
  });
  bus.on('flag', (k: string, on: boolean) => {
    const p = G.local as Player | undefined;
    if (k !== 'escaped' || !on || !p) return;
    const s = carriedSamples(p);
    for (const it of s) { bankItem(it); p.removeItem(it); }
    if (s.length) bus.emit('inventoryChanged', p);
  });
}
