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

export function op(name: string, args: any): any {
  if (G.role === 'client') {
    G.net?.sendOp(name, args);
    return undefined;
  }
  const r = applyOp(name, args, G.local?.id ?? 'host', true);
  if (G.role === 'host') G.net?.broadcastOp(name, args);
  return r;
}

export function applyOp(name: string, args: any, from: string, local: boolean): any {
  const h = OPS.get(name);
  if (!h) { console.warn('unknown op', name); return undefined; }
  try { return h(args, { from, local, host: G.role !== 'client' }); }
  catch (e) { console.error('op failed', name, e); return undefined; }
}
