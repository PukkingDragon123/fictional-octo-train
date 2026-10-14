// Main-mission walkthrough: drives the real mission objects and portals zone by zone,
// from the lobby fuses to the ending. Timed actions are fast-forwarded once started.
//   node scripts/walkthrough.mjs [baseUrl]      (needs a running dev server; default http://127.0.0.1:5173)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('  <pageerror>', e.message, (e.stack || '').split('\n')[1] || ''));
page.on('console', (m) => { if (m.type() === 'error') console.log('  <error>', m.text().slice(0, 200)); });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
await page.goto((process.argv[2] || 'http://127.0.0.1:5173') + '/?quick');
await page.waitForFunction(() => window.__game?.local, null, { polling: 1000 });
await page.evaluate(async () => {
  const ev = await import('/src/core/events.ts');
  const T = window.T = {
    get g() { return window.__game; }, get p() { return window.__game.local; },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async until(fn, ms = 90000, what = '') { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) throw new Error('timeout ' + what); await T.sleep(200); } },
    objs(zone, pred) { return [...T.g.getZone(zone).objects.values()].filter(pred); },
    obj(zone, pred, what) { const o = T.objs(zone, pred)[0]; if (!o) throw new Error('no object: ' + what + ' in ' + zone); return o; },
    near(o) { const g = T.g, z = g.getZone(T.p.zoneKey); const [x, y] = g.nearestWalkable(z, o.x, o.y); g.placePlayer(T.p, z.key, x, y, 0); },
    async use(o, label) {
      T.near(o); await T.sleep(300);
      const opts = T.g.missions.objectOptions(T.p, o);
      const op = opts.find((q) => q.label.startsWith(label));
      if (!op) throw new Error(`no option "${label}" on ${o.key}; has ${opts.map((q) => q.label).join(' | ')}`);
      if (op.disabled) throw new Error(`"${label}" disabled: ${op.disabled}`);
      op.action();
    },
    portal(id) { const z = T.g.getZone(T.p.zoneKey); const pt = z.portals.find((q) => q.id === id); if (!pt) throw new Error('no portal ' + id + ' in ' + z.key); return pt; },
    async through(id, expectZone) {
      const pt = T.portal(id);
      if (pt.locked && !T.g.missions.isUnlocked(pt.locked, T.p)) throw new Error(`${id} still locked (${pt.locked})`);
      T.g.usePortal(T.p, pt);
      await T.until(() => T.p.zoneKey === expectZone && !T.g.transitioning, 90000, 'travel ' + id);
      await T.sleep(500);
      const z = T.g.getZone(expectZone), i = z.idx(T.p.tileX(), T.p.tileY());
      return { zone: T.p.zoneKey, at: [T.p.tileX(), T.p.tileY()], walkable: z.floor[i] !== 0 && z.solid[i] !== 1 };
    },
    async go(zone) { if (T.p.zoneKey === zone) return; T.g.travel(T.p, zone, 10, 10); await T.until(() => T.p.zoneKey === zone && !T.g.transitioning, 90000, 'go ' + zone); await T.sleep(500); },
    /** take an item lying on a floor or sitting in a container of this zone */
    take(zone, key) {
      const z = T.g.getZone(zone);
      for (const o of z.objects.values()) { const it = o.inv?.items.find((i) => i.key === key); if (it) { o.inv.remove(it); T.p.inv.add(it); ev.bus.emit('inventoryChanged', T.p); return 'container ' + o.key; } }
      const fl = z.meta.__floor || null; void fl;
      return null;
    },
    lore(id) { ev.bus.emit('loreRead', T.p, id); },
    flags() { return [...T.g.missions.flags]; },
    emitInv() { ev.bus.emit('inventoryChanged', T.p); },
  };
  // fast-forward any timed action once it has started (walks excluded)
  setInterval(() => { const a = T.p.actions.current; if (a && a.started && !/Walk/.test(a.constructor.name)) a.t = Math.max(a.t, a.effDuration); }, 100);
  for (const k of ['screwdriver', 'fuse', 'fuse', 'fuse']) T.p.inv.add(window.__dev.newItem(k));
});
let failed = 0;
const step = async (name, fn) => {
  try { const r = await page.evaluate(fn); log('OK  ', name, r !== undefined ? JSON.stringify(r) : ''); return true; }
  catch (e) { failed++; log('FAIL', name, e.message.split('\n')[0]); return false; }
};
// floor items live in a module map: expose a helper to take them
await page.evaluate(async () => { const wi = await import('/src/items/worldItems.ts'); window.T.takeFloor = (zone, key, data) => { const z = window.T.g.getZone(zone); for (const [, w] of wi.floorItems(z)) if (w.item.key === key && (!data || Object.entries(data).every(([k, v]) => w.item.data?.[k] === v))) { wi.removeFloorItem(z, w.item); window.T.p.inv.add(w.item); window.T.emitInv(); return [Math.round(w.x), Math.round(w.z)]; } return null; }; });

await step('lobby: fit fuse 1', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Fit a fuse'); await T.until(() => o.state.fuses >= 1); });
await step('lobby: fit fuse 2', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Fit a fuse'); await T.until(() => o.state.fuses >= 2); });
await step('lobby: fit fuse 3', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Fit a fuse'); await T.until(() => o.state.fuses >= 3); });
await step('lobby: main switch', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Throw the main switch'); await T.until(() => T.g.getZone('lobby').circuitPowered(99)); return T.flags().includes('first_light'); });
await step('lobby → office (elevator)', async () => window.T.through('p_office', 'office'));
await step('office: numbers terminal', async () => { const T = window.T, o = T.obj('office', (o) => o.state.lore === 'terminal_numbers', 'numbers terminal'); T.near(o); T.lore('terminal_numbers'); return [o.key, o.x, o.y]; });
await step('office: facilities keycard', async () => { const T = window.T; const r = T.take('office', 'keycard_facilities') || T.takeFloor('office', 'keycard_facilities'); if (!r) throw new Error('keycard not found'); await T.sleep(1500); return [r, T.flags().includes('got:keycard_facilities')]; });
await step('office: swipe server closet reader', async () => { const T = window.T, o = T.obj('office', (o) => o.state.card === 'keycard_facilities', 'reader'); await T.use(o, 'Swipe a card'); const d = o.state.door; await T.until(() => !T.g.getZone('office').edge(d[0], d[1], d[2])?.locked); });
await step('office: disable SRV-1', async () => { const T = window.T, o = T.obj('office', (o) => o.state.node === 'SRV-1', 'SRV-1'); await T.use(o, 'Disable node SRV-1'); await T.until(() => T.flags().includes('node:SRV-1')); return { stage: T.g.missions.stage, collapse: +T.g.collapse.toFixed(2) }; });
await step('office → stairwell → lobby', async () => { const T = window.T; const a = await T.through('p_office_stair', 'stairwell'); const b = await T.through('r_stair_lobby', 'lobby').catch(async () => T.through('p_stair', 'lobby')); return [a, b]; });
await step('lobby → fields → house', async () => { const T = window.T; const a = await T.through('p_fields', 'fields'); const b = await T.through('p_fields_house', 'house'); return [a, b]; });
await step('house: attic key + birthday card → lab code', async () => { const T = window.T; const k = T.takeFloor('fields', 'house_key') || T.take('fields', 'house_key'); const card = T.takeFloor('house', 'note', { lore: 'card_birthday' }) || T.objs('house', (o) => o.state.lore === 'card_birthday').length; T.lore('card_birthday'); return { key: !!k, card: !!card, lab_code: T.flags().includes('lab_code') }; });
await step('house: basement keypad', async () => { const T = window.T, o = T.obj('house', (o) => o.state.codeFlag === 'lab_code', 'keypad'); await T.use(o, 'Enter the code'); const d = o.state.door; if (d) await T.until(() => !T.g.getZone('house').edge(d[0], d[1], d[2])?.locked); return d; });
await step('house → lab (basement stairs)', async () => window.T.through('p_house_lab', 'lab'));
await step('lab: director\'s log', async () => { const T = window.T, o = T.objs('lab', (o) => o.state.lore === 'log_director')[0]; T.lore('log_director'); return o ? [o.key, o.x, o.y] : 'no object with log_director (lore emitted anyway)'; });
await step('lab: lab keycard', async () => { const T = window.T; const r = T.take('lab', 'keycard_lab') || T.takeFloor('lab', 'keycard_lab'); if (!r) throw new Error('keycard_lab not found'); return r; });
await step('lab: swipe SRV-2 reader', async () => { const T = window.T, o = T.obj('lab', (o) => o.state.card === 'keycard_lab', 'reader'); await T.use(o, 'Swipe a card'); const d = o.state.door; if (d) await T.until(() => !T.g.getZone('lab').edge(d[0], d[1], d[2])?.locked); });
await step('lab: disable SRV-2', async () => { const T = window.T, o = T.obj('lab', (o) => o.state.node === 'SRV-2', 'SRV-2'); await T.use(o, 'Disable node SRV-2'); await T.until(() => T.flags().includes('node:SRV-2')); return { stage: T.g.missions.stage, collapse: +T.g.collapse.toFixed(2) }; });
await step('lab → tunnels (airlock)', async () => { const T = window.T; return T.through('r_tunnels_lab', 'tunnels').catch(() => T.through('p_lab_tunnels', 'tunnels')); });
await step('tunnels → lab again (blast door)', async () => window.T.through('p_tunnels_lab', 'lab'));
await step('lab → stairwell landing 13 → corrupt', async () => { const T = window.T; await T.go('stairwell'); return T.through('p_stair_13', 'corrupt'); });
await step('corrupt: root key', async () => { const T = window.T; const r = T.takeFloor('corrupt', 'root_key') || T.take('corrupt', 'root_key'); if (!r) throw new Error('root_key not found'); await T.sleep(1500); return [r, T.flags().includes('got:root_key')]; });
await step('corrupt → lab → core (freight elevator)', async () => { const T = window.T; await T.go('lab'); return T.through('p_lab_core', 'server'); });
await step('server: disable SRV-3', async () => { const T = window.T, o = T.obj('server', (o) => o.state.node === 'SRV-3', 'SRV-3'); await T.use(o, 'Disable node SRV-3'); await T.until(() => T.flags().includes('node:SRV-3')); return { stage: T.g.missions.stage, collapse: +T.g.collapse.toFixed(2) }; });
await step('server → exit', async () => window.T.through('p_core_exit', 'exit'));
await step('exit → the ending', async () => { const T = window.T; const pt = T.portal('p_exit_final'); T.g.usePortal(T.p, pt); await T.sleep(1500); return { escaped: T.flags().includes('escaped'), overlay: !!document.querySelector('.k-ending') }; });
await step('directives state', async () => { const T = window.T; return T.flags().filter((f) => !f.startsWith('room:') && !f.startsWith('visit:') && !f.startsWith('read:')); });
await page.screenshot({ path: 'scripts/out/walk_end.png' });
await browser.close();
console.log(failed ? `${failed} step(s) failed` : 'walkthrough complete');
process.exit(failed ? 1 : 0);
