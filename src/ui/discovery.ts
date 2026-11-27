// THE DISCOVERY MOMENT (round 25): when a find or a scan teaches a schematic (src/craft/stores.ts discoverFrom, bus
// 'discovery'), the lens rises over the unit's head with the thing that taught it and what it makes: the suit
// scanner's lens (the floating icon's own turntable sprite, never the eye), the found item's model icon, a bright
// arc of motes from one to the other, the made thing's icon arriving last and its short name floating under it in
// the world's own extruded letters. No box, no plate: three objects in the air, a glint, a relay tick, gone.
import { bus } from '../core/events';
import { G } from '../game/G';
import { pixSprite } from './floatIcon';
import { itemIcon, iconRes } from './icons';
import { hasItemDef } from '../items/item';
import { recipe } from '../items/recipes';
import './discovery.css';

interface Disc { from: string; how: string; recipes: string[]; names: string[] }
const queue: Disc[] = [];
let busy = false;

function img(key: string, px: number): HTMLImageElement | null {
  if (!key || !hasItemDef(key)) return null;
  const im = document.createElement('img');
  try { im.src = itemIcon(key, '', iconRes(px)); } catch { return null; }
  im.alt = ''; im.draggable = false;
  im.style.width = im.style.height = px * 2 + 'px';
  return im;
}

function play(d: Disc) {
  busy = true;
  const el = document.createElement('div');
  el.className = 'k-disc';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Discovered: ' + d.names.join(', '));
  // the lens, turning
  const lens = document.createElement('span'); lens.className = 'k-disc-lens';
  const spr = pixSprite('lens', 58);
  if (spr) { lens.append(spr.cv); spr.hot(true); }
  // what was found, the motes, what it makes
  const from = document.createElement('span'); from.className = 'k-disc-from';
  const fi = img(d.from, 22); if (fi) from.append(fi);
  const arc = document.createElement('span'); arc.className = 'k-disc-arc';
  for (let i = 0; i < 7; i++) { const m = document.createElement('i'); m.style.setProperty('--i', String(i)); arc.append(m); }
  const outs = document.createElement('span'); outs.className = 'k-disc-out';
  const made = d.recipes.map((k) => recipe(k)?.outputs?.[0]?.item).filter((k): k is string => !!k).slice(0, 2);
  for (const k of made) { const im = img(k, 26); if (im) outs.append(im); }
  const row = document.createElement('span'); row.className = 'k-disc-row';
  row.append(from, arc, outs);
  const name = document.createElement('b'); name.className = 'k-disc-t';
  const title = (made[0] && d.recipes[0] ? recipe(d.recipes[0])?.name : d.names[0]) ?? d.names[0] ?? '';
  name.textContent = title.replace(/^(Make|Pour|Press|Cut|Rivet|Solder|Rebuild|Sew|Spin|Weave|Brew|Steep|Pack|Cure|Carve|Bind|Fill|Build) (an? |the )?/i, '');
  if (d.names.length > 1) { const k = document.createElement('i'); k.textContent = '+' + (d.names.length - 1); name.append(k); }
  el.append(lens, row, name);
  document.body.append(el);
  G.audio?.ui?.('watchTick', 0.35);
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => { el.remove(); busy = false; const n = queue.shift(); if (n) play(n); }, 4300);
}

let wired = false;
export function wireDiscoveryMoment() {
  if (wired) return;
  wired = true;
  bus.on('discovery', (d: Disc) => {
    if (!d || !(d.recipes?.length || d.names?.length)) return;
    if (busy) { if (queue.length < 3) queue.push(d); return; }
    play(d);
  });
}
wireDiscoveryMoment();
