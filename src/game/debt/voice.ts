// Who says what. Dr. Iris Calder (the hologram handler) speaks through
// G.handler (src/game/handler.ts) or the 'handlerSay' bus event; the BAILIFF
// band speaks in 'subtitle' lines styled 'bailiff'. Until somebody renders
// subtitles (the holo-band HUD) the lines fall back to a radio bubble, so
// nothing is ever silent.
import { bus } from '../../core/events';
import { G } from '../G';

function listeners(ev: string): number {
  try { return (bus as any).map?.get?.(ev)?.size ?? 0; } catch { return 0; }
}

/** a line from the handler (Dr. Calder; the function keeps its old name) */
export function voss(text: string, dur?: number) {
  if (!text || !G?.local) return;
  const h = G.handler;
  if (h && typeof h.say === 'function') { try { h.say(text); return; } catch (e) { console.warn('handler.say', e); } }
  if (listeners('handlerSay')) { bus.emit('handlerSay', { text }); return; }
  bus.emit('subtitle', { who: 'DR. CALDER', text, dur: dur ?? 3 + text.length * 0.05, style: 'voss' });
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
  deposit: ['Logged. Thank you, unit.', 'Pressed and sent. That is a start.', 'Good. Bring me another.', 'The ledger likes you a little more.', 'Taken. Again, please.', 'Acceptable. I wrote "acceptable".'],
  depositBig: ['Now THAT is a load. Do it again.', 'Somebody found the good furniture. Keep that energy.', 'A big number. I underlined it.'],
  reject: ['The press does not want that.', 'No value to the Institute. Take it back.', 'It spat that back. I would too.'],
  firstDeposit: 'That is how it works. You bring it to the press, you set it on the plate, you pull the lever. It goes through to the other side and the number goes down. Every load takes the unit closer to zero.',
  lever: 'It will not go through by itself. The lever, on the side of the press. Step off the plate first, please. I like the unit in one piece.',
  installment: (n: number, c: number) => `Installment ${n} of ${c} received. The unit keeps both wrists another day.`,
  installmentBailiff: (n: number) => `INSTALLMENT ${n} CLEARED. SCHEDULE UPDATED.`,
  missed: ['You missed a payment. The unit felt that. So did you, through the link.', 'Late. The Programme charges for late. The band collected in kind.', 'I did not forget. I never forget. The band never forgets either.'],
  missedBailiff: (pen: number) => `INSTALLMENT OVERDUE. PENALTY ${fmt(pen)} SCRIP APPLIED. CORRECTIVE STIMULUS ADMINISTERED.`,
  cleared: 'Balance zero. Hm. Most units never get here. Surplus goes on account. There is a depot. Passage is not free.',
  clearedBailiff: 'LEDGER BALANCE 0. CONTRACT DISCHARGED. SURPLUS CREDITED.',
  defaultLethal: 'Final deadline. Default. I am sorry, unit. I am writing that down.',
  warnSeam: ['Step away from the Seam.', 'That door is shut. Back off, please.', 'Do not test the band. It has no sense of humour.'],
  warnBailiff: ['PERIMETER VIOLATION. RETURN TO THE WORK AREA.', 'ABSCOND ATTEMPT LOGGED. COUNTDOWN INITIATED.', 'STEP BACK.'],
  warnStop: 'COUNTDOWN SUSPENDED.',
  boom: 'ABSCOND CONFIRMED. CHARGE RELEASED.',
  boomVoss: ['I did warn you. I always warn them.', 'That is what the band is for. I am sorry.', 'Get the unit up. It still owes.'],
  tamperStart: 'TAMPER DETECTED.',
  tamperFail: 'TAMPER CONFIRMED.',
  removed: ['...signal is going. Unit? Can you hear me? You have no idea what you have done.', 'I can still see you. Not for long. Get to a press and I will find you.'],
  removedBailiff: 'CARRIER LOST. UNIT FLAGGED: ABSCONDED.',
  lost: 'The band went with the limb. Get to a press. You will be refitted.',
  refit: 'Hold still. New band. Other wrist. I will be quick.',
  kiosk: 'Passage. Pick your ride. They all go somewhere.',
  boarded: 'Sit down. Do not look at the other passengers.',
  leftBehind: 'You missed your ride. Buy another.',
};
