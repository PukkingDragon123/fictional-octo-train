// Characters speaking: every spoken line goes out as a 'subtitle' bus event
// (the holo-band HUD draws it where it comes from: Voss's projection, the
// officer, the survivor's head, the corner of the picture for the PA). If
// nothing renders subtitles yet, the line falls back to a speech bubble.
import { bus } from '../core/events';
import { G } from './G';

export type LineStyle = 'voss' | 'bailiff' | 'guard' | 'radio' | 'self';

function listeners(ev: string): number {
  try { return (bus as unknown as { map: Map<string, Set<unknown>> }).map.get(ev)?.size ?? 0; } catch { return 0; }
}

/** reading time for a line (seconds) */
export const readTime = (text: string) => Math.max(1.8, 1.1 + text.length * 0.055);

export function line(who: string, text: string, style: LineStyle, dur = readTime(text), at?: { x: number; y: number; z: number }) {
  if (!text) return;
  bus.emit('subtitle', { who, text, dur, style, ...(at ? { x: at.x, y: at.y, z: at.z } : {}) });
  if (!listeners('subtitle') && G.local) G.ui?.say?.(G.local, (style === 'self' ? '' : who + ': ') + text, style === 'self' ? 'think' : 'radio', dur);
}
