// A fresh start: the survivor begins play unhurt. The intake's beating, the
// band's bolt and the arrival leave nothing on the body when control comes
// back (the user: "when start you're not hurt yet"): no wounds, no blood on
// the skin or the jumpsuit, full blood and health, no pain or panic.
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';

export function freshStart(p: Player | null | undefined) {
  if (!p) return;
  const b = p.body as unknown as { parts: Record<string, { injuries: unknown[] }>; blood: number; health: number; panic: number; stress: number; maxHealth?: () => number };
  for (const k of Object.keys(b.parts)) b.parts[k].injuries = [];
  b.blood = 100;
  b.health = b.maxHealth ? b.maxHealth() : 100;
  b.panic = 0;
  b.stress = Math.min(b.stress, 10);
  const q = p as unknown as { splash?: Record<string, number>; outfitDirty?: boolean; refreshCondition?: () => void };
  q.splash = {};
  for (const it of p.worn.values()) if ((it as { bloody?: number }).bloody) (it as { bloody?: number }).bloody = 0;
  q.outfitDirty = true;
  q.refreshCondition?.();
  bus.emit('inventoryChanged', p);
}
