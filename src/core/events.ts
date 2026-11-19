type Handler = (...args: any[]) => void;

/** Minimal typed-ish event bus used across systems. */
export class Emitter {
  private map = new Map<string, Set<Handler>>();
  private gates = new Map<string, Set<(...args: any[]) => boolean>>();
  /** a gate runs before the handlers: when it returns true the event is held back (the clone vat takes a death, src/game/clone) */
  gate(ev: string, fn: (...args: any[]) => boolean): () => void {
    let s = this.gates.get(ev);
    if (!s) { s = new Set(); this.gates.set(ev, s); }
    s.add(fn);
    return () => s!.delete(fn);
  }
  on(ev: string, fn: Handler): () => void {
    let s = this.map.get(ev);
    if (!s) { s = new Set(); this.map.set(ev, s); }
    s.add(fn);
    return () => s!.delete(fn);
  }
  once(ev: string, fn: Handler) {
    const off = this.on(ev, (...a) => { off(); fn(...a); });
    return off;
  }
  emit(ev: string, ...args: any[]) {
    const gs = this.gates.get(ev);
    if (gs) for (const g of [...gs]) { try { if (g(...args)) return; } catch (e) { console.error(`[gate ${ev}]`, e); } }
    const s = this.map.get(ev);
    if (!s) return;
    for (const fn of [...s]) {
      try { fn(...args); } catch (e) { console.error(`[event ${ev}]`, e); }
    }
  }
}

export const bus = new Emitter();
