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

/**
 * The same facts written on a manila luggage tag (backpack inventory): name,
 * kind / weight / footprint line, a few readouts with ink bars, and the first
 * sentence of the description. `hint` is the handling line at the bottom.
 */
export function itemTag(it: Item, count = 1, foot?: [number, number], hint = ''): string {
  const d = itemDef(it.key);
  const rows: string[] = [];
  const row = (a: string, b: string, warn = false) => rows.push(`<div class="r${warn ? ' warn' : ''}"><span>${a}</span><span>${b}</span></div>`);
  const bar = (v: number, color: string) => rows.push(`<div class="bar"><i style="width:${pct(Math.max(0, Math.min(1, v)))}%;background:${color}"></i></div>`);
  if (d.durability || d.weapon || d.clothing) { row('Condition', pct(it.cond) + '%', it.cond < 0.25); bar(it.cond, it.cond > 0.6 ? '#4a7a3a' : it.cond > 0.25 ? '#a8822e' : '#8a1a14'); }
  if (d.food) {
    const f = d.food;
    const fr = freshness(it);
    if (fr !== 'none') row('Fresh', fr === 'fresh' ? 'yes' : fr === 'stale' ? 'stale' : 'ROTTEN', fr === 'rotten');
    if (f.canned && !it.opened) row('Sealed', 'needs opening');
    const left = 1 - (it.eaten ?? 0);
    row('Hunger', '-' + Math.round(f.hunger * left));
    if (f.thirst) row('Thirst', (f.thirst > 0 ? '-' : '+') + Math.abs(Math.round(f.thirst * left)));
    if (f.raw && !(it.cooked && it.cooked >= 1)) row('Raw', 'cook it', true);
  }
  if (d.fluidCap) {
    const amt = it.fluid?.amount ?? 0;
    row(it.fluid && amt > 0.001 ? fluidName(it.fluid.type) : 'Empty', `${amt.toFixed(2)}/${d.fluidCap} L`, it.fluid?.type === 'tainted');
    bar(amt / d.fluidCap, it.fluid?.type === 'tainted' ? '#7a8a2a' : '#2a6a9a');
  }
  if (d.uses !== undefined || d.light || d.battery) { const u = it.uses ?? 1; row(d.light || d.battery ? 'Battery' : 'Left', pct(u) + '%', u < 0.15); }
  if (d.weapon) {
    const w = d.weapon;
    row('Damage', `${w.dmg[0]}-${w.dmg[1]}`);
    if (w.mag) row('Loaded', `${it.ammo ?? 0}/${w.mag}`);
    if (w.twoHanded) row('Grip', 'two hands');
  }
  if (d.clothing && d.clothing.covers.length) { row('Warmth', pct(d.clothing.insulation) + '%'); if (d.clothing.bite) row('Bite', d.clothing.bite + '%'); }
  if (d.bag && it.inv) row('Holds', `${it.inv.contentWeight().toFixed(1)}/${d.bag.capacity} kg`);
  if (d.medical) row('Use', d.medical.type);
  if (d.literature?.skill) row('Teaches', d.literature.skill);
  const kind = (CAT_LABEL[d.cat] || d.cat) + ' · ' + (itemWeight(it) * count).toFixed(count > 1 || itemWeight(it) < 1 ? 2 : 1) + ' kg' + (foot ? ` · ${foot[0]}x${foot[1]}` : '');
  const desc = d.desc ? escapeHtml(d.desc.split(/(?<=[.!?])\s/)[0].slice(0, 120)) : '';
  const value = d.value && d.value > 1 ? `<div class="v">≈ ${Math.round(d.value * count)} scrip at the hopper</div>` : '';
  return `<h5>${escapeHtml(itemName(it))}${count > 1 ? ' ×' + count : ''}</h5><div class="k">${escapeHtml(kind)}</div>${rows.join('')}${value}${desc ? `<div class="d">${desc}</div>` : ''}${hint ? `<div class="h">${escapeHtml(hint)}</div>` : ''}`;
}
