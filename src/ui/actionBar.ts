// The timed-action plate (round 13): what the unit is busy doing, shown as one
// clean, detailed bar over its head instead of the old tally ring on the floor.
// A small riveted gunmetal plate drawn in high-resolution pixel art
// (src/ui/hiPixel.ts): hazard-striped end caps, the action's name in Alagard,
// a percentage readout, and a recessed glass channel whose amber cells light
// up as the work goes on, a glint running along them.
import { bevel, rivet, hazard, drawBar, GUN, AMB, GRN, RED, rect, crispCanvas } from './hiPixel';

const W0 = 156, H = 40;
let meas: CanvasRenderingContext2D | null = null;
/** the plate grows to fit a long name (Alagard 16px), within reason */
function plateWidth(label: string): number {
  try {
    meas ??= document.createElement('canvas').getContext('2d');
    if (!meas) return W0;
    meas.font = '16px Alagard, serif';
    return Math.max(W0, Math.min(320, Math.ceil(meas.measureText(label).width) + 72));
  } catch { return W0; }
}
/** "Search" → "Searching", "Eat apple" → "Eating apple" (a few common verbs; anything else as written) */
const ING: Record<string, string> = {
  search: 'Searching', eat: 'Eating', drink: 'Drinking', read: 'Reading', fill: 'Filling', pour: 'Pouring', wear: 'Putting on', take: 'Taking',
  transfer: 'Moving', 'pick up': 'Picking up', climb: 'Climbing', barricade: 'Barricading', forage: 'Foraging', butcher: 'Butchering', dig: 'Digging',
  disassemble: 'Taking apart', smash: 'Smashing', chop: 'Chopping', kick: 'Kicking', sleep: 'Sleeping', sit: 'Sitting', equip: 'Equipping', unequip: 'Unequipping',
  bandage: 'Bandaging', stitch: 'Stitching', disinfect: 'Disinfecting', mark: 'Marking', 'take sample': 'Taking a sample', 'open can': 'Opening the can',
  'rip clothing': 'Ripping cloth', 'clear debris': 'Clearing debris', nail: 'Nailing', weld: 'Welding', 'insert coins': 'Feeding coins', 'smash glass': 'Smashing glass',
};
export function actionLabel(name: string): string {
  const n = (name || '').trim();
  if (!n) return 'Working';
  const low = n.toLowerCase();
  for (const k of Object.keys(ING).sort((a, b) => b.length - a.length)) {
    if (low === k) return ING[k];
    if (low.startsWith(k + ' ')) return ING[k] + n.slice(k.length);
  }
  return n;
}

export class ActionPlate {
  readonly el: HTMLDivElement;
  private c: CanvasRenderingContext2D;
  private nameEl: HTMLElement;
  private pctEl: HTMLElement;
  private label = '';
  private shownPct = -1;
  /** last whole fifth reached (for the tick sound) */
  step = -1;
  w = W0; readonly h = H;
  private cv: HTMLCanvasElement;
  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'w-act';
    el.setAttribute('aria-hidden', 'true');
    const { cv, c } = crispCanvas(W0, H);
    this.c = c; this.cv = cv;
    this.nameEl = document.createElement('b'); this.nameEl.className = 'wa-n';
    this.pctEl = document.createElement('i'); this.pctEl.className = 'wa-p';
    el.append(cv, this.nameEl, this.pctEl);
  }
  /** draw at progress k (0..1); t = seconds for the glint; drain: k is the time left (red when it runs low, never 'done' green) */
  update(name: string, k: number, t: number, drain = false) {
    const label = actionLabel(name);
    if (label !== this.label) {
      this.label = label; this.nameEl.textContent = label;
      const w = plateWidth(label);
      if (w !== this.w) {
        this.w = w;
        const k = crispCanvas(w, H); this.cv.replaceWith(k.cv); this.cv = k.cv; this.c = k.c;
        this.el.style.width = w + 'px'; this.nameEl.style.width = (w - 64) + 'px';
      }
    }
    const W = this.w;
    const pct = Math.floor(Math.max(0, Math.min(1, k)) * 100);
    if (pct !== this.shownPct) { this.shownPct = pct; this.pctEl.textContent = pct + '%'; }
    const c = this.c;
    c.clearRect(0, 0, W, H);
    // the plate: gunmetal, chamfered, a soft drop shadow under it
    rect(c, 3, H - 2, W - 4, 2, 0x000000, 0.35);
    bevel(c, 1, 1, W - 3, H - 4, GUN.slice(2, 9), { chamfer: 3 });
    // brushed grain on the face
    for (let y = 4; y < H - 6; y += 3) for (let x = 6 + (y % 7); x < W - 8; x += 11) rect(c, x, y, 4, 1, GUN[6], 0.22);
    // the engraved line under the name
    rect(c, 9, 18, W - 20, 1, GUN[1]); rect(c, 9, 19, W - 20, 1, GUN[7], 0.6);
    // hazard end caps beside the channel
    hazard(c, 5, 22, 4, 9, 0xe8b52a, 0x17150f, 4);
    hazard(c, W - 11, 22, 4, 9, 0xe8b52a, 0x17150f, 4, 2);
    rect(c, 4, 21, 6, 1, GUN[1]); rect(c, 4, 31, 6, 1, GUN[6]); rect(c, W - 12, 21, 6, 1, GUN[1]); rect(c, W - 12, 31, 6, 1, GUN[6]);
    // rivets
    rivet(c, 6, 6, 2, true); rivet(c, W - 8, 6, 2, true); rivet(c, 6, H - 8, 1); rivet(c, W - 8, H - 8, 1);
    // the channel and its cells (green once done)
    drawBar(c, 13, 22, W - 28, 9, k, { ramp: drain ? (k < 0.3 ? RED : AMB) : k >= 0.999 ? GRN : AMB, t, cell: 5, gap: 1 });
    // a status lamp before the name
    const on = Math.floor(t * (drain && k < 0.3 ? 8 : 3)) % 2 === 0 || (!drain && k >= 0.999);
    const lamp = drain ? (k < 0.3 ? RED : AMB) : k >= 0.999 ? GRN : AMB;
    rect(c, 12, 8, 6, 6, 0x07060a); rect(c, 13, 9, 4, 4, on ? lamp[4] : lamp[1]); rect(c, 13, 9, 2, 1, on ? lamp[6] : lamp[2]); rect(c, 13, 12, 4, 1, on ? lamp[3] : lamp[0]);
  }
}
