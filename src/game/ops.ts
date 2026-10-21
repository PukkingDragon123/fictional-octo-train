import { G } from './G';

/**
 * World mutations go through named "ops". In solo they apply immediately;
 * as a co-op host they apply and are broadcast to every client (who apply
 * the same deterministic handler); as a client they are sent to the host,
 * which validates, applies and broadcasts. Handlers must be deterministic
 * given their args and must tolerate missing targets (stale requests).
 */
export interface OpCtx { from: string; local: boolean; host: boolean; }
export type OpHandler = (args: any, ctx: OpCtx) => any;

const OPS = new Map<string, OpHandler>();
export function defOp(name: string, h: OpHandler) { OPS.set(name, h); }

/** Ops that only the host may originate (clients never apply them on request) */
export const HOST_ONLY = new Set<string>();

/** every applied world op in order (host/solo): replayed by late joiners and save games */
export const opLog: string[] = [];
/** transient ops that are not worth replaying */
const NOLOG = new Set(['fire', 'openContainer', 'creatureHit', 'cb']);
let replay = false;
/** true while a log is being replayed (handlers must not hand items to the local player again) */
export function isReplaying() { return replay; }

export function op(name: string, args: any): any {
  if (G.role === 'client') {
    G.net?.sendOp(name, args);
    return undefined;
  }
  const rec = NOLOG.has(name) ? null : JSON.stringify([name, args]);
  const r = applyOp(name, args, G.local?.id ?? 'host', true);
  if (rec) opLog.push(rec);
  if (G.role === 'host') G.net?.broadcastOp(name, args);
  return r;
}

/** host: apply an op requested by a client, log it and fan it out */
export function hostApply(name: string, args: any, from: string) {
  const rec = NOLOG.has(name) ? null : JSON.stringify([name, args]);
  applyOp(name, args, from, false);
  if (rec) opLog.push(rec);
  G.net?.broadcastOp(name, args);
}

/** replay a recorded log (late join / loading a save) */
export function replayOps(log: string[]) {
  replay = true;
  try {
    for (const rec of log) {
      try {
        const [name, args] = JSON.parse(rec);
        if (args && typeof args.z === 'string') G.getZone(args.z); // zones referenced by the log must exist
        applyOp(name, args, 'replay', false);
      } catch (e) { console.warn('replay', e); }
    }
  } finally { replay = false; }
}

export function applyOp(name: string, args: any, from: string, local: boolean): any {
  const h = OPS.get(name);
  if (!h) { console.warn('unknown op', name); return undefined; }
  try { return h(args, { from, local, host: G.role !== 'client' }); }
  catch (e) { console.error('op failed', name, e); return undefined; }
}
