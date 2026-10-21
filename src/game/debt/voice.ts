// Who says what. Staff Sergeant Voss (the hologram handler) speaks through
// G.handler (src/game/handler.ts) or the 'handlerSay' bus event; the BAILIFF
// band speaks in 'subtitle' lines styled 'bailiff'. Until somebody renders
// subtitles (the holo-band HUD) the lines fall back to a radio bubble, so
// nothing is ever silent.
import { bus } from '../../core/events';
import { G } from '../G';

function listeners(ev: string): number {
  try { return (bus as any).map?.get?.(ev)?.size ?? 0; } catch { return 0; }
}

/** a line from the handler */
export function voss(text: string, dur?: number) {
  if (!text || !G?.local) return;
  const h = G.handler;
  if (h && typeof h.say === 'function') { try { h.say(text); return; } catch (e) { console.warn('handler.say', e); } }
  if (listeners('handlerSay')) { bus.emit('handlerSay', { text }); return; }
  bus.emit('subtitle', { who: 'SSGT. VOSS', text, dur: dur ?? 3 + text.length * 0.05, style: 'voss' });
  if (!listeners('subtitle')) { G.ui?.say?.(G.local, text, 'radio', dur ?? 4 + text.length * 0.03); G.audio?.ui?.('static_burst', 0.2); }
}

/** a line from the band: cold, clipped, corporate */
export function bailiff(text: string, dur?: number) {
  if (!text || !G?.local) return;
  bus.emit('subtitle', { who: 'BAILIFF', text, dur: dur ?? 2.5 + text.length * 0.04, style: 'bailiff' });
  if (!listeners('subtitle')) G.ui?.say?.(G.local, text, 'radio', dur ?? 3 + text.length * 0.03);
}

/** the survivor's own thought */
export function selfThought(text: string) {
  if (!G?.local) return;
  bus.emit('think', G.local, text);
}

/** pick one line (stable-ish variety) */
export function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

/** scrip with thousands separators */
export function fmt(n: number) { return Math.round(n).toLocaleString('en-GB'); }

// ---------------------------------------------------------------- lines
export const L = {
  deposit: ['Logged. Keep it moving, convict.', 'Pressed and sent. That is a start.', 'That will do. Bring me more.', 'Good. The ledger likes you a little more.', 'Taken. Again.', 'Acceptable. Barely.'],
  depositBig: ['Now THAT is a haul. Do it again.', 'Somebody found the good drawer. Keep that energy.', 'Big number. Don\'t let it go to your head.'],
  reject: ['That is worth nothing to me.', 'No resale value. Take it back.', 'The press spat that back. So would I.'],
  firstDeposit: 'That is how it works. You find it, you put it on the plate, you pull the lever. It goes through to the other side and your number goes down. Every load takes you closer to zero.',
  lever: 'It does not go through by itself, debtor. The lever. On the side of the press. Pull it. And get off the plate first.',
  installment: (n: number, c: number) => `Installment ${n} of ${c} received. You get to keep both wrists another day.`,
  installmentBailiff: (n: number) => `INSTALLMENT ${n} CLEARED. SCHEDULE UPDATED.`,
  missed: ['You missed a payment. You felt that. Next time it will be worse.', 'Late. The Programme charges for late. You just paid in kind.', 'Did you think I would forget? I never forget.'],
  missedBailiff: (pen: number) => `INSTALLMENT OVERDUE. PENALTY ${fmt(pen)} SCRIP APPLIED. CORRECTIVE STIMULUS ADMINISTERED.`,
  cleared: 'Balance zero. Huh. Most of them never get here. Surplus goes on your account. There is a depot. Passage is not free.',
  clearedBailiff: 'LEDGER BALANCE 0. CONTRACT DISCHARGED. SURPLUS CREDITED.',
  defaultLethal: 'Final deadline. Default. I am sorry, convict. No, I am not.',
  warnSeam: ['Step away from the Seam.', 'That door is shut, convict. Back off.', 'Do not test me.'],
  warnBailiff: ['PERIMETER VIOLATION. RETURN TO THE WORK AREA.', 'ABSCOND ATTEMPT LOGGED. COUNTDOWN INITIATED.', 'STEP BACK.'],
  warnStop: 'COUNTDOWN SUSPENDED.',
  boom: 'ABSCOND CONFIRMED. CHARGE RELEASED.',
  boomVoss: ['I warned you. I always warn them.', 'That is what the band is for.', 'Get up. You still owe.'],
  tamperStart: 'TAMPER DETECTED.',
  tamperFail: 'TAMPER CONFIRMED.',
  removed: ['...signal lost. Convict? CONVICT. You have no idea what you have done.', 'I can still see you. Not for long. You will come crawling back to a press.'],
  removedBailiff: 'CARRIER LOST. SUBJECT FLAGGED: ABSCONDED.',
  lost: 'Unit lost with the limb. Get to a press. You will be refitted.',
  refit: 'Hold still. New unit. Other wrist. Don\'t make me do it twice.',
  kiosk: 'Passage. Pick your ride. They all go somewhere.',
  boarded: 'Sit down. Don\'t look at the other passengers.',
  leftBehind: 'You missed your ride, convict. Buy another.',
};
