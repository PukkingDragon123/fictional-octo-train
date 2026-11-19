// THE PRINTER'S CONSOLE (round 20): the press's old shop of patterns (src/game/economy/createScreen.ts) in
// its own olive housing, docked to the side of the screen so the printer itself stays in view. Hold a
// ware: its matter comes off the spools (kilo for kilo) and its dollars go, and the printer on the left
// prints it (./printer.ts). The spools ride along the top as little spools; the bed levelling is the
// press's old plate calibration (a clean run prints a spare).
import { terminal } from '../terminal';
import { plateBtn } from '../btnKit';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { mxArrive } from '../../machine/kit';
import { mxOk } from '../../machine/core';
import { iconKey } from '../iconKey';
import { bus } from '../../../core/events';
import { hasUnlock } from '../../../game/research';
import { hasItemDef } from '../../../items/item';
import { MATS, scaleMatter, type Mat, type Matter } from '../../../game/economy/matter';
import { dollars } from '../../../game/economy/money';
import { PATTERNS, PRESS_UPGRADES, type Pattern } from '../../../game/economy/registry';
import { CreateScreen, type CreateHost } from '../../../game/economy/createScreen';
import { spools, spoolKg, spoolTotal, spoolsCover, drawSpools, FILAMENT } from '../../../game/economy/fab';
import { calibrate } from '../../minigames/calibrate';
import type { Printer3D } from './printer';
import type { FabCtx } from './kit';
import '../../../game/economy/terminal.css';

let calib = 0;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
/** the filament a print is mostly made of (its colour on the bed) */
function mainMat(m: Matter): Mat { let best: Mat = 'polymer', v = -1; for (const q of MATS) { const x = m[q.key] ?? 0; if (x > v) { v = x; best = q.key; } } return best; }

export interface PrintConsole { close(): void; refresh(): void }
export function openPrintConsole(printer: Printer3D, ctx: FabCtx, onClose: () => void): PrintConsole {
  const wrap = document.createElement('div');
  wrap.className = 'ptm fabc';
  // round 21: no words on the head (the printer's state shows as its lamp); the off key is a power bolt
  const t = terminal({ title: '', sub: '', cls: 'ptm-term fabc-term', model: 'Meridian · Fabricator P-3', powerOn: true });
  t.screen.classList.add('amber');
  wrap.append(t.el);
  document.body.append(wrap);
  mxArrive(t.el, 'right', { delay: 60 });
  t.keys.append(mxOk() ? iconKey('bolt', 'Off', () => close(), { w: 70, h: 50, tone: 'red', lamp: 'red', sound: 'relay', hint: 'Esc', nameAt: 'top' }) : plateBtn('Off', () => close(), { finish: 'oxblood', size: 'sm', shape: 'key', tight: true, sound: 'relay' }));
  if (!document.getElementById('fabc-css')) {
    const st = document.createElement('style'); st.id = 'fabc-css';
    st.textContent = `.ptm.fabc { inset: 5vh 2vw 5vh auto; width: min(50vw, 620px); background: none; display: block; animation: none; pointer-events: none; }
.ptm.fabc .fabc-term { width: 100%; height: 100%; pointer-events: auto; }
.ptm.fabc.off { animation: ptm-out 0.16s steps(3) both; }
.pc-spools { display: flex; gap: 4px; align-items: center; }
.pc-sp { display: block; width: 22px; height: 22px; line-height: 0; filter: drop-shadow(0 0 4px var(--glow)); }
.pc-sp svg { width: 100%; height: 100%; }
@media (max-width: 820px), (orientation: portrait) { .ptm.fabc { inset: auto 0 0 0; width: 100vw; height: 54vh; } }`;
    document.head.append(st);
  }
  const make = (q: Pattern, batch: number) => {
    const cost = scaleMatter(q.cost, batch);
    if (printer.busy || !drawSpools(cost, q.tok)) { sfx('error'); return; }
    const spare = calib === 2 ? 1 : 0;
    calib = 0;
    const keys: string[] = Array.from({ length: q.n * batch + spare }, () => q.item);
    sfx('press', 0.5);
    printer.print(keys, FILAMENT[mainMat(cost)], (ks) => { ctx.deliver(ks); bus.emit('printed', { keys: ks }); render(); });
    render();
  };
  let cs: CreateScreen | null = null;
  const render = () => {
    if (!wrap.isConnected) return;
    const batch = hasUnlock('pr_batch') ? 3 : 1;
    const by = new Map<Mat, number>();
    for (const s of spools()) by.set(s.m, (by.get(s.m) ?? 0) + s.kg);
    const host: CreateHost = {
      known: PATTERNS.filter((q) => hasUnlock(q.key) && hasItemDef(q.item)),
      locked: PATTERNS.filter((q) => !hasUnlock(q.key) && hasItemDef(q.item)),
      batch, dollars: dollars(), bankKg: spoolTotal(),
      why: (q) => (!spoolsCover(scaleMatter(q.cost, batch)) ? 'matter' : dollars() < q.tok ? 'dollars' : printer.busy ? 'busy' : ''),
      cost: (q) => scaleMatter(q.cost, batch),
      banked: (m) => spoolKg(m as Mat),
      make: (q) => make(q, batch),
      calib,
      calibrate: async () => {
        const r = await calibrate({ title: 'Level the bed', sub: 'stop each needle in the green · Space / E / click', dials: 3, difficulty: batch > 1 ? 3 : 2 });
        if (!r.cancelled) { calib = r.perfect ? 2 : r.hits >= 2 ? 1 : 0; sfx(r.perfect ? 'unlock' : 'error', 0.6); }
        render();
      },
      upgrades: PRESS_UPGRADES.map((u) => ({ title: u.title, on: hasUnlock(u.key) })),
      spools: [...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, kg]) => ({ color: hex(FILAMENT[m]), kg })),
    };
    t.setHead('', '');
    t.el.classList.toggle('fabc-busy', printer.busy);
    if (!cs) cs = new CreateScreen(host); else cs.setHost(host);
    cs.render(t.body);
  };
  const unsub = [bus.on('fabChanged', render), bus.on('matterChanged', render), bus.on('researchUnlocked', render)];
  const nav = new FocusNav(wrap, { onBack: () => close() });
  let gone = false;
  function close() {
    if (gone) return;
    gone = true;
    nav.destroy();
    for (const u of unsub) u();
    cs?.destroy(); cs = null;
    wrap.classList.add('off');
    setTimeout(() => wrap.remove(), 160);
    sfx('back', 0.5);
    onClose();
  }
  render();
  sfx('relay', 0.6);
  return { close, refresh: render };
}
