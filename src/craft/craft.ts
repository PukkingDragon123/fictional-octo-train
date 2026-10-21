// G.craft: hands-on crafting. Owns the close-up (inspect.ts) and the
// workbench (bench.ts), and opens them from a double-click in the world:
// an item on the floor or a chair comes up close, a workbench puts you at
// the bench. Other systems call inspect(it, c) / workObject(o) / bench(o)
// (the interaction layer's primary verb, touch props).
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Item } from '../items/item';
import type { Container } from '../items/container';
import type { TileObject } from '../world/zone';
import { objDef } from '../world/objects';
import { pick } from '../game/picking';
import { floorContainer } from '../items/worldItems';
import { Inspect } from './inspect';
import { Bench } from './bench';
import { opsForObject, HAND_OPS } from './handOps';
import { syncKnowledge } from './knowledge';
import { registerCraftSounds } from './craftSounds';

const REACH = 2.0;

export class CraftSystem {
  readonly insp = new Inspect();
  readonly benchV = new Bench();
  private synced = false;

  constructor() {
    registerCraftSounds();
    window.addEventListener('dblclick', (e) => this.onDbl(e));
    bus.on('handCrafted', () => { /* quests read the mission flags */ });
  }

  /** something is in your hands right now (no walking) */
  busy() { return this.insp.open || this.benchV.open; }

  /** the close-up on an item; c = the container it is in (null = loose) */
  inspect(it: Item, c: Container | null, opts: { op?: string; bench?: boolean } = {}) {
    this.insp.show({ kind: 'item', it, c }, { op: opts.op, bench: opts.bench });
  }
  /** the close-up on a piece of furniture you can take apart by hand (chairs) */
  workObject(o: TileObject) {
    if (!opsForObject(o).length) return false;
    this.insp.show({ kind: 'obj', o });
    return true;
  }
  /** stand at a workbench */
  bench(o: TileObject | null) { this.benchV.show(o); }
  /** is there a workbench in reach? */
  benchNear(): TileObject | null {
    const p = G.local;
    if (!p) return null;
    for (const o of G.interact?.objectsNear?.(p, 1.8) || []) if (objDef(o.key)?.tags?.includes('workbench')) return o;
    return null;
  }
  /** every hand step (for the watch / codex) */
  steps() { return HAND_OPS; }

  update() {
    if (!this.synced && G.local) { this.synced = true; try { syncKnowledge(); } catch { /* no player yet */ } }
    this.insp.update();
    this.benchV.update();
  }

  private onDbl(e: MouseEvent) {
    const p = G.local;
    if (!p || this.busy() || G.ui?.inventory?.open || G.ui?.menuEl || G.ui?.modal || (e.target as HTMLElement)?.tagName !== 'CANVAS') return;
    let t: any = null;
    try { t = pick(e.clientX, e.clientY); } catch { t = null; }
    if (!t) return;
    const near = (x: number, z: number) => Math.hypot(x - p.x, z - p.z) <= REACH;
    if (t.kind === 'item' && t.wi && near(t.wi.x, t.wi.z)) {
      this.inspect(t.wi.item, floorContainer(G.zone, p.x, p.z, 2.2));
      return;
    }
    if (t.kind === 'object' && t.obj) {
      const o = t.obj as TileObject;
      const d = objDef(o.key);
      if (!near(o.x + 0.5, o.y + 0.5)) { bus.emit('think', p, 'Too far to get my hands on it.'); return; }
      if (d?.tags?.includes('workbench')) { this.bench(o); return; }
      this.workObject(o);
    }
  }
}

let SYS: CraftSystem | null = null;
/** one crafting system per page (sessions come and go; the close-ups and their listeners stay) */
export function craftSystem(): CraftSystem { return SYS || (SYS = new CraftSystem()); }
