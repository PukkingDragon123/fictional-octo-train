import { Item, itemDef, itemName, itemWeight, freshness, fluidName, BodyPart } from '../items/item';
import { escapeHtml } from './ui';
import { PART_NAMES } from '../survival/body';
import { itemIconFor } from './icons';

const CAT_LABEL: Record<string, string> = {
  food: 'Food', drink: 'Drink', medical: 'Medical', weapon: 'Weapon', tool: 'Tool', clothing: 'Clothing', bag: 'Bag', material: 'Material', electronics: 'Electronics',
  literature: 'Reading', misc: 'Item', ammo: 'Ammunition', key: 'Key', seed: 'Seeds', fuel: 'Fuel', light: 'Light', container: 'Container', lore: 'Document', trap: 'Trap', corpse: 'Remains', anomaly: 'Anomaly',
};

const pct = (v: number) => Math.round(v * 100);

/** Terminal readout describing an item in Project Zomboid depth (phosphor bars, theme colours). */
export function itemTooltip(it: Item, count = 1): string {
  const d = itemDef(it.key);
  const rows: string[] = [];
  const row = (a: string, b: string, cls = '') => rows.push(`<div class="row ${cls}"><span>${a}</span><span>${b}</span></div>`);
  const bar = (v: number, color = 'var(--ph)') => rows.push(`<div class="bar"><i style="width:${pct(Math.max(0, Math.min(1, v)))}%;background:${color}"></i></div>`);
  row('Weight', (itemWeight(it) * count).toFixed(2) + ' kg');
  if (d.durability || d.weapon || d.clothing) { row('Condition', pct(it.cond) + '%'); bar(it.cond, it.cond > 0.6 ? 'var(--ph)' : it.cond > 0.25 ? 'var(--warn)' : 'var(--danger)'); }
  if (d.food) {
    const f = d.food;
    const fr = freshness(it);
    if (fr !== 'none') row('Freshness', fr === 'fresh' ? 'Fresh' : fr === 'stale' ? 'Stale' : 'Rotten', fr === 'rotten' ? 'warn' : '');
    if (f.canned && !it.opened) row('Sealed', 'needs opening');
    const left = 1 - (it.eaten ?? 0);
    row('Hunger', '-' + Math.round(f.hunger * left));
    if (f.thirst) row('Thirst', (f.thirst > 0 ? '-' : '+') + Math.abs(Math.round(f.thirst * left)));
    row('Calories', Math.round(f.calories * left) + ' kcal');
    if (f.unhappy) row('Mood', f.unhappy > 0 ? 'unpleasant' : 'comforting', f.unhappy > 0 ? 'warn' : '');
    if (f.raw && !(it.cooked && it.cooked >= 1)) row('Raw', 'cook first', 'warn');
    if (it.cooked !== undefined && it.cooked > 0 && it.cooked < 1) { row('Cooking', pct(it.cooked) + '%'); bar(it.cooked, 'var(--warn)'); }
    if (f.lucidity) row('Lucidity', '+' + f.lucidity);
  }
  if (d.fluidCap) {
    const amt = it.fluid?.amount ?? 0;
    row('Contents', it.fluid && amt > 0.001 ? `${fluidName(it.fluid.type)}` : 'Empty');
    row('Volume', `${amt.toFixed(2)} / ${d.fluidCap} L`);
    bar(amt / d.fluidCap, it.fluid?.type === 'tainted' ? '#b5c94a' : '#5ec8ff');
  }
  if (d.uses !== undefined || d.light || d.battery) { const u = it.uses ?? 1; row(d.light || d.battery ? 'Battery' : 'Remaining', pct(u) + '%'); bar(u, 'var(--warn)'); }
  if (d.weapon) {
    const w = d.weapon;
    row('Damage', `${w.dmg[0]}–${w.dmg[1]}`);
    row('Reach', w.range.toFixed(1) + ' m');
    row('Speed', w.speed.toFixed(1) + '/s');
    if (w.mag) row('Loaded', `${it.ammo ?? 0}/${w.mag}`);
    if (w.twoHanded) row('Grip', 'Two-handed');
    row('Noise', w.noise > 20 ? 'Very loud' : w.noise > 8 ? 'Loud' : 'Quiet');
  }
  if (d.clothing) {
    const c = d.clothing;
    row('Insulation', pct(c.insulation) + '%');
    if (c.scratch) row('Scratch prot.', c.scratch + '%');
    if (c.bite) row('Bite prot.', c.bite + '%');
    if (c.water) row('Waterproof', pct(c.water) + '%');
    if ((it.wet ?? 0) > 0.05) row('Wet', pct(it.wet!) + '%', 'warn');
    rows.push(`<div class="desc">Covers: ${c.covers.map((p) => PART_NAMES[p as BodyPart]).filter(Boolean).slice(0, 4).join(', ')}${c.covers.length > 4 ? '…' : ''}</div>`);
  }
  if (d.bag && it.inv) {
    row('Capacity', `${it.inv.contentWeight().toFixed(1)} / ${d.bag.capacity}`);
    row('Weight reduction', pct(d.bag.reduction) + '%');
  }
  if (d.medical) row('Use', d.medical.type);
  if (d.literature?.skill) row('Teaches', d.literature.skill + (d.literature.mult ? ` ×${d.literature.mult}` : ''));
  if (d.literature?.recipes?.length) row('Schematics', String(d.literature.recipes.length));
  if (d.light) row('Light', `${d.light.range} m beam`);
  if (d.radio) row('Radio', `${d.radio.channels} ch, ${d.radio.range} m`);
  const tags = (d.tags || []).filter((t) => !t.startsWith('_')).slice(0, 6);
  if (tags.length) rows.push(`<div class="desc">${tags.map((t) => '#' + t).join(' ')}</div>`);
  if (d.desc) rows.push(`<div class="desc">${escapeHtml(d.desc)}</div>`);
  let coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* ignore */ }
  if (coarse) rows.push('<div class="tap">double-tap: move · hold: actions</div>');
  // the portrait sits beside the first readouts; the rest run full width below
  const split = rows.findIndex((r) => r.startsWith('<div class="desc"'));
  const head = rows.slice(0, Math.min(split < 0 ? rows.length : split, 4));
  const rest = rows.slice(head.length);
  let icon = '';
  try { icon = itemIconFor(it, 40); } catch { /* no renderer yet */ }
  const hero = `<div class="tip-hero">${icon ? `<img src="${icon}" alt="">` : ''}<div class="tip-rows"><div class="tip-cat">${escapeHtml(CAT_LABEL[d.cat] || d.cat)}</div>${head.join('')}</div></div>`;
  return `<h4>${escapeHtml(itemName(it))}${count > 1 ? ' ×' + count : ''}</h4>${hero}${rest.join('')}`;
}
