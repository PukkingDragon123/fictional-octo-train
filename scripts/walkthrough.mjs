// Main-chain walkthrough for the Remittance contract (src/game/debt, src/missions):
//   quick start (band fitted at intake) → smash furniture → pick up a valuable → deposit it in a hopper
//   → pay the installments (scrip topped up through page JS for pacing; one deadline is missed on purpose)
//   → the watch (Tab, first-person stage) and its quests: a paid permit (Survey Licence) that uploads a
//   watch function, a courier run to another level → clear the debt → buy passage at the kiosk
//   → the transport arrives → board → the ending,
// plus the BAILIFF band (warning at the Seam, detonation, a replacement band at a hopper) and, on a
// second page, the side chain (fuses → numbers → render nodes → root key → core → bands unlatch → exit).
// Timed actions and the transport's timeline are fast-forwarded once started.
//   node scripts/walkthrough.mjs [baseUrl] [--main-only]
import { chromium } from 'playwright-core';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:5173';
const mainOnly = process.argv.includes('--main-only');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
let failed = 0;

async function session() {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('  <pageerror>', e.message, (e.stack || '').split('\n')[1] || ''));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  <error>', m.text().slice(0, 200)); });
  await page.goto(base + '/?quick');
  await page.waitForFunction(() => window.__game?.local && window.__game.view, null, { polling: 1000 });
  await page.evaluate(async () => {
    const ev = await import('/src/core/events.ts');
    const wi = await import('/src/items/worldItems.ts');
    const T = window.T = {
      ev, wi,
      get g() { return window.__game; }, get p() { return window.__game.local; }, get D() { return window.__debt; },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      /** wait for a condition; the timeout counts game time (a loaded machine runs the game slowly), with a real-time backstop */
      async until(fn, ms = 120000, what = '') {
        const t = performance.now(), g0 = T.g?.time ?? 0;
        while (!fn()) {
          const real = performance.now() - t, game = ((T.g?.time ?? 0) - g0) * 1000;
          if ((game > ms && real > ms * 0.25) || real > ms * 6) throw new Error('timeout ' + what);
          await T.sleep(200);
        }
      },
      /** throw a press machine's lever (the press agent's G.press.pull, else the hopper system's) */
      pull(o) { const P = T.g.press; return P?.pull ? P.pull(T.p, o) : T.D.hop.pull(T.p, o); },
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
      /** pick an option from the full world menu of an object (interact + mission + contract hooks) */
      async menu(o, label) {
        const opts = T.g.interact.objectOptions(T.p, o);
        const flat = opts.flatMap((q) => [q, ...(q.sub || [])]);
        const op = flat.find((q) => q.label.startsWith(label));
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
      async go(zone, x = 10, y = 10) { if (T.p.zoneKey === zone) return; T.g.travel(T.p, zone, x, y); await T.until(() => T.p.zoneKey === zone && !T.g.transitioning, 90000, 'go ' + zone); await T.sleep(500); },
      take(zone, key) {
        const z = T.g.getZone(zone);
        for (const o of z.objects.values()) { const it = o.inv?.items.find((i) => i.key === key); if (it) { o.inv.remove(it); T.p.inv.add(it); ev.bus.emit('inventoryChanged', T.p); return 'container ' + o.key; } }
        return null;
      },
      takeFloor(zone, key, data) { const z = T.g.getZone(zone); for (const [, w] of wi.floorItems(z)) if (w.item.key === key && (!data || Object.entries(data).every(([k, v]) => w.item.data?.[k] === v))) { wi.removeFloorItem(z, w.item); T.p.inv.add(w.item); T.emitInv(); return [Math.round(w.x), Math.round(w.z)]; } return null; },
      lore(id) { ev.bus.emit('loreRead', T.p, id); },
      flags() { return [...T.g.missions.flags]; },
      has(f) { return T.g.missions.flags.has(f); },
      emitInv() { ev.bus.emit('inventoryChanged', T.p); },
      /** the watch's quest runtime */
      get Q() { return window.__game.missions.quests; },
      /** a quest (or old directive) finished (the host evaluates twice a second of game time) */
      async done(key, ms = 120000) { await T.until(() => T.has('done:' + key), ms, 'done:' + key); },
    };
    // fast-forward any timed action once it has started (walks and the seat aboard excluded)
    setInterval(() => { const a = T.p.actions.current; if (a && a.started && !/Walk|Aboard/.test(a.constructor.name) && a.name !== 'Aboard') a.t = Math.max(a.t, a.effDuration); }, 100);
    // headless software GL runs a few frames a second: keep the slow game-time timers moving
    // (directive checks, the ledger's deadline check, the hopper's 1.5 s weighing)
    setInterval(() => {
      const g = T.g; if (!g) return;
      if (g.missions) g.missions.checkT = 0;
      if (g.debt) g.debt.checkT = 0;
      if (T.D?.hop) T.D.hop.hostT = 0;
      for (const pd of T.D?.hop?.pending?.values?.() || []) pd.since -= 0.5;
    }, 100);
  });
  return page;
}

const step = async (page, name, fn, arg) => {
  try { const r = await page.evaluate(fn, arg); log('OK  ', name, r !== undefined ? JSON.stringify(r) : ''); return true; }
  catch (e) { failed++; log('FAIL', name, e.message.split('\n')[0]); return false; }
};

// ================================================================ main chain: the contract
{
  const page = await session();
  await step(page, 'intake: band fitted, contract running', async () => {
    const T = window.T;
    await T.until(() => T.g.debt?.on, 60000, 'ledger start');
    if (T.g.band.get(T.p.id) !== 'armed') throw new Error('band not armed: ' + T.g.band.get(T.p.id));
    const worn = T.p.worn.get('wrist');
    if (worn?.key !== 'bailiff_band') throw new Error('band not worn');
    await T.until(() => T.has('start:first_haul'), 30000, 'first_haul');
    return { debt: T.g.debt.state(), kit: [...T.p.worn.values()].map((i) => i.key), hopperBeacon: (T.g.getZone('lobby').meta.signals || []).some((s) => s.id === 'hopper_lobby') };
  });
  await step(page, 'band will not come off normally', async () => {
    const T = window.T, it = T.p.worn.get('wrist');
    const { itemMenuOptions } = await import('/src/interact/itemMenu.ts');
    const labels = itemMenuOptions(T.p, it, T.p.inv, [it]).map((o) => o.label);
    if (labels.some((l) => /^(Take off|Drop)/.test(l))) throw new Error('band can be taken off: ' + labels.join(' | '));
    return labels.filter((l) => l !== '-');
  });
  await step(page, 'lobby: smash furniture next to the hopper', async () => {
    const T = window.T, z = T.g.getZone('lobby');
    const h = T.obj('lobby', (o) => o.key === 'hopper', 'hopper');
    // a sofa to wreck, a few tiles in front of the plate; the cushions are guaranteed to hide something today
    const vals = await import('/src/game/debt/values.ts');
    vals.STASH.cushions.chance = 1; vals.STASH.cushions.n = [2, 2];
    vals.STASH.cushions.items = [['wedding_ring', 1], ['cash_roll', 1], ['gold_watch', 1]];
    let spot = null;
    for (let dy = 3; dy < 9 && !spot; dy++) for (let dx = -2; dx < 3 && !spot; dx++) { const x = h.x + dx, y = h.y + dy; if ([0, 1].every((k) => z.floor[z.idx(x + k, y)] && !z.solid[z.idx(x + k, y)] && !z.objectsAt(x + k, y).length)) spot = [x, y]; }
    if (!spot) throw new Error('no space for the sofa');
    const uidv = 970000001;
    window.__dev.op('objAdd', { z: 'lobby', obj: { uid: uidv, key: 'sofa', x: spot[0], y: spot[1], rot: 0, state: {} } });
    T.g.placePlayer(T.p, 'lobby', spot[0], spot[1] + 2, -Math.PI / 2);
    await T.sleep(400);
    T.D.smash(z.objects.get(uidv));
    await T.until(() => T.has('tut:smash'), 60000, 'tut:smash');
    await T.until(() => [...T.wi.floorItems(z).values()].some((w) => ['wedding_ring', 'cash_roll', 'gold_watch'].includes(w.item.key)), 60000, 'valuables spilled');
    return { spilled: [...T.wi.floorItems(z).values()].filter((w) => Math.hypot(w.x - T.p.x, w.z - T.p.z) < 5).map((w) => w.item.key) };
  });
  await step(page, 'pick up a valuable', async () => {
    const T = window.T, z = T.g.getZone('lobby');
    // let the toss land, then pick it up through the real floor → inventory transfer
    // (a valuable that has come to rest: other spilled things may still be bouncing or getting kicked about)
    const VAL = ['wedding_ring', 'cash_roll', 'gold_watch'];
    await T.until(() => [...T.wi.floorItems(z).values()].some((w) => VAL.includes(w.item.key) && w.vy === undefined), 60000, 'landed');
    const w = [...T.wi.floorItems(z).values()].find((q) => VAL.includes(q.item.key) && q.vy === undefined);
    const { transferItem } = await import('/src/game/worldOps.ts');
    const fc = T.wi.floorContainer(z, w.x, w.z, 0.5);
    transferItem(T.p, w.item, fc, T.p.inv);
    await T.until(() => T.has('tut:valuable'), 30000, 'tut:valuable');
    return T.p.allItems().filter((i) => (window.__game.debt.valueOf(i) || 0) >= 100).map((i) => i.key);
  });
  await step(page, 'deposit it in the hopper (hopper menu)', async () => {
    const T = window.T;
    const h = T.obj('lobby', (o) => o.key === 'hopper', 'hopper');
    T.g.placePlayer(T.p, 'lobby', h.x + 1, h.y + 2, -Math.PI / 2);
    await T.sleep(300);
    await T.menu(h, 'Deposit all valuables');
    await T.until(() => T.has('contract:first_deposit'), 120000, 'first deposit');
    await T.done('first_haul');
    return T.g.debt.state();
  });
  await step(page, 'item menu offers "Deposit" at a hopper', async () => {
    const T = window.T;
    const it = window.__dev.newItem('pocket_watch'); T.p.inv.add(it); T.emitInv();
    const { itemMenuOptions } = await import('/src/interact/itemMenu.ts');
    const labels = itemMenuOptions(T.p, it, T.p.inv, [it]).map((o) => o.label);
    const dep = labels.find((l) => /^Deposit in (hopper|press)/.test(l));
    if (!dep) throw new Error('no deposit option: ' + labels.join(' | '));
    return dep;
  });
  await step(page, 'push furniture onto the plate: the hopper takes it', async () => {
    const T = window.T, z = T.g.getZone('lobby');
    const h = T.obj('lobby', (o) => o.key === 'hopper', 'hopper');
    const uidv = 970000050, paid0 = T.g.debt.paid + T.g.debt.surplus;
    window.__dev.op('objAdd', { z: 'lobby', obj: { uid: uidv, key: 'filing_cabinet', x: h.x + 1, y: h.y + 3, rot: 0, state: {} } });
    // the push ends with the cabinet released on the plate (the destruction system's objRelease op)
    window.__dev.op('objRelease', { z: 'lobby', uid: uidv, x: h.x + 1, y: h.y + 1, by: T.p.id });
    // then the lever (the press only goes when somebody pulls it)
    await T.sleep(300);
    // (the lever is locked while the ram from the last deposit is still moving)
    await T.until(() => !(T.g.press ?? T.D.hop).busy(h), 60000, 'press idle');
    if (!T.pull(h)) throw new Error('lever would not pull');
    // (pull again if a cycle ran before the cabinet had settled on the bed)
    let nextPull = T.g.time + 6;
    await T.until(() => { if (!z.objects.has(uidv)) return true; if (T.g.time > nextPull) { nextPull = T.g.time + 6; T.pull(h); } return false; }, 120000, 'cabinet taken');
    await T.until(() => T.g.debt.paid + T.g.debt.surplus > paid0, 30000, 'credited');
    return { credited: T.g.debt.paid + T.g.debt.surplus - paid0 };
  });
  await step(page, 'watch: Tab raises it into first person; quests are listed', async () => {
    const T = window.T, w = T.g.watch, fp = await import('/src/fp/fp.ts');
    w.toggle(true, 'qst');
    await T.until(() => w.raise > 0.5, 60000, 'raised');
    if (fp.fpOwner() !== 'watch') throw new Error('stage owner ' + fp.fpOwner());
    const active = T.Q.list('active').map((v) => v.key), offers = T.Q.list('offers').map((v) => v.key);
    w.toggle(false);
    if (!T.Q.completed('first_haul')) throw new Error('first_haul not completed');
    return { pages: w.pages.map((p) => p.key), active, offers };
  });
  await step(page, 'watch: accept a permit, pay to complete it, a function is uploaded (Survey Licence)', async () => {
    const T = window.T, Q = T.Q, R = await import('/src/game/research.ts');
    await T.until(() => Q.status('rd_licence') === 'off', 30000, 'licence offered');
    const rp0 = R.researchPoints(), owed0 = T.g.debt.owed;
    const e1 = Q.request('rd_licence', 'accept'); if (e1) throw new Error('accept: ' + e1);
    await T.until(() => Q.status('rd_licence') === 'ready', 30000, 'ready to pay');
    const e2 = Q.request('rd_licence', 'pay'); if (e2) throw new Error('pay: ' + e2);
    await T.until(() => Q.status('rd_licence') === 'done', 30000, 'licence done');
    await T.until(() => R.hasUnlock('watch_map'), 10000, 'map uploaded');
    await T.until(() => T.g.watch.pages.some((p) => p.key === 'map'), 10000, 'map function');
    return { rp: R.researchPoints() - rp0, billed: T.g.debt.owed - owed0 };
  });
  await step(page, 'watch: courier run (carry the sealed case to another level, hand it in)', async () => {
    const T = window.T, Q = T.Q;
    const { courierDest } = await import('/src/missions/researchQuests.ts');
    await T.until(() => Q.status('rd_courier') === 'off', 30000, 'courier offered');
    const credit0 = T.g.debt.paid + T.g.debt.surplus;
    const e1 = Q.request('rd_courier', 'accept'); if (e1) throw new Error('accept: ' + e1);
    await T.until(() => Q.status('rd_courier') === 'act' && T.p.allItems().some((i) => i.key === 'sealed_case'), 30000, 'case handed over');
    const dest = courierDest();
    await T.go(dest);
    await T.until(() => Q.status('rd_courier') === 'ready', 60000, 'delivered');
    const e2 = Q.request('rd_courier', 'pay'); if (e2) throw new Error('hand in: ' + e2);
    await T.until(() => Q.status('rd_courier') === 'done', 30000, 'courier done');
    const handed = !T.p.allItems().some((i) => i.key === 'sealed_case');
    await T.go('lobby', 10, 10);
    return { dest, handed, credited: T.g.debt.paid + T.g.debt.surplus - credit0, tally: [...Q.tallies] };
  });
  for (let n = 1; n <= 4; n++) {
    await step(page, `installment ${n}`, async (n) => {
      const T = window.T, d = T.g.debt;
      await T.until(() => T.has('start:installment_' + n), 60000, 'installment directive');
      if (n === 2) {
        // miss this deadline on purpose: penalty, a shock for the band, a fresh period
        const owed = d.owed, before = T.p.body.health;
        T.g.clock.hours = d.s.dueH + 0.05;
        await T.until(() => d.s.missed > 0, 60000, 'missed');
        if (!(d.owed > owed)) throw new Error('no penalty');
        void before;
      }
      d.credit(d.due, 'dev');
      await T.until(() => T.has('contract:installment:' + n), 30000, 'flag');
      await T.done('installment_' + n);
      return { n, paid: d.paid, owed: d.owed, missed: d.s.missed, dueDay: d.dueDay };
    }, n);
  }
  await step(page, 'clear the debt', async () => {
    const T = window.T, d = T.g.debt;
    await T.until(() => T.has('start:clear_debt'), 60000, 'clear_debt directive');
    d.credit(d.remaining + 4000, 'dev'); // the rest, and surplus for the ticket
    await T.done('clear_debt');
    if (!T.has('contract:debt_cleared')) throw new Error('flag');
    return d.state();
  });
  await step(page, 'band: warning at the Seam, detonation, refit', async () => {
    const T = window.T, b = T.g.band;
    const s = T.obj('lobby', (o) => o.key === 'seam_door', 'seam');
    b.graceT = 0;
    const r = s.rot, nx = r === 1 ? -1 : r === 3 ? 1 : 0, nz = r === 0 ? 1 : r === 2 ? -1 : 0;
    const warned = [];
    const off = T.ev.bus.on('bandWarning', (w) => warned.push(w.countdown));
    T.g.placePlayer(T.p, 'lobby', s.x + nx, s.y + nz, 0);
    await T.until(() => b.warn.on, 60000, 'warning');
    // back off: the countdown stops
    T.g.placePlayer(T.p, 'lobby', s.x + nx * 4, s.y + nz * 4, 0);
    await T.until(() => !b.warn.on, 60000, 'stand down');
    // and come back for good
    T.g.placePlayer(T.p, 'lobby', s.x + nx, s.y + nz, 0);
    await T.until(() => b.warn.on, 60000, 'warning again');
    b.warn.countdown = 0.3;
    await T.until(() => b.get(T.p.id) === 'blown', 60000, 'detonation');
    off();
    const sev = [...T.p.body.severed];
    // a replacement band from the hopper
    const h = T.obj('lobby', (o) => o.key === 'hopper', 'hopper');
    T.g.placePlayer(T.p, 'lobby', h.x + 1, h.y + 2, 0);
    await T.sleep(300);
    await T.menu(h, 'Take a replacement band');
    await T.until(() => b.get(T.p.id) === 'armed', 60000, 'refit');
    return { beeps: warned.length, severed: sev, dead: T.p.body.dead, refit: b.get(T.p.id) };
  });
  await step(page, 'passage: reach the kiosk, buy a ticket', async () => {
    const T = window.T;
    await T.until(() => T.has('start:transport'), 60000, 'transport directive');
    const zk = T.D.tr.kioskZone();
    let k = T.objs(zk, (o) => o.key === 'ticket_kiosk')[0];
    if (!k) throw new Error('no kiosk in ' + zk);
    await T.go(zk, k.x, k.y + 1);
    k = T.objs(zk, (o) => o.key === 'ticket_kiosk')[0];
    T.near(k); await T.sleep(300);
    // keep the survivor alive for the ride (the blast took a forearm)
    for (const part of Object.values(T.p.body.parts)) for (const i of part.injuries) { i.bleed = 0; i.bandage = { clean: true, soak: 0, sterile: true }; }
    T.p.body.blood = 100; T.p.body.health = 100;
    await T.menu(k, 'Night Coach 0400');
    await T.until(() => T.D.tr.ride, 60000, 'ride called');
    return { zone: zk, kiosk: [k.x, k.y], ride: T.D.tr.ride.kind, surplus: T.g.debt.surplus, ticket: T.p.allItems().some((i) => i.key === 'passage_ticket') };
  });
  await step(page, 'the coach arrives; board; it leaves; the ending', async () => {
    const T = window.T, tr = T.D.tr;
    // fast-forward the arrival
    const ff = setInterval(() => { const r = tr.ride; if (r && (r.phase === 'arrive' || r.phase === 'depart' || (r.phase === 'wait' && r.boarded.size))) r.t += 0.5; }, 100);
    await T.until(() => tr.ride.phase === 'wait', 120000, 'arrived');
    const [dx, dz] = tr.doorPos(tr.ride);
    T.p.x = dx; T.p.z = dz;
    await T.until(() => tr.ride.boarded.has(T.p.id), 60000, 'boarded');
    await T.until(() => tr.ride.phase === 'depart', 120000, 'departed');
    await T.until(() => document.querySelector('.dbt-end'), 120000, 'ending overlay');
    clearInterval(ff);
    await T.until(() => T.has('contract:transport'), 30000, 'contract:transport');
    await T.done('transport', 60000);
    return { ending: document.querySelector('.dbt-end .l5')?.textContent, flags: T.flags().filter((f) => f.startsWith('contract') || f.startsWith('done:')) };
  });
  await page.screenshot({ path: 'scripts/out/walk_end.png' });
  await page.context().close();
}

// ================================================================ side chain: the way out they don't want you to find
if (!mainOnly) {
  const page = await session();
  await page.evaluate(() => { for (const k of ['screwdriver', 'fuse', 'fuse', 'fuse']) window.T.p.inv.add(window.__dev.newItem(k)); });
  await step(page, 'side: First Haul done (the side chain hangs off it)', async () => {
    const T = window.T;
    await T.until(() => T.has('start:first_haul'), 60000, 'first_haul');
    for (const f of ['tut:smash', 'tut:valuable', 'contract:first_deposit']) T.g.missions.set(f);
    await T.done('first_haul');
    // the side chain's first quest is offered on the watch and has to be accepted
    await T.until(() => T.Q.status('first_light') === 'off', 30000, 'side chain offered');
    T.Q.request('first_light', 'accept');
    await T.until(() => T.has('start:first_light'), 30000, 'side chain');
  });
  const S = (name, fn) => step(page, 'side: ' + name, fn);
  await S('lobby: fit fuse 1', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Fit a fuse'); await T.until(() => o.state.fuses >= 1); });
  await S('lobby: fit fuse 2', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Fit a fuse'); await T.until(() => o.state.fuses >= 2); });
  await S('lobby: fit fuse 3', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Fit a fuse'); await T.until(() => o.state.fuses >= 3); });
  await S('lobby: main switch', async () => { const T = window.T, o = T.obj('lobby', (o) => o.state.mission === 'first_light', 'panel'); await T.use(o, 'Throw the main switch'); await T.until(() => T.g.getZone('lobby').circuitPowered(99)); return T.has('first_light'); });
  await S('lobby → office (elevator)', async () => window.T.through('p_office', 'office'));
  await S('office: numbers terminal', async () => { const T = window.T, o = T.obj('office', (o) => o.state.lore === 'terminal_numbers', 'numbers terminal'); T.near(o); T.lore('terminal_numbers'); return [o.key, o.x, o.y]; });
  await S('office: facilities keycard', async () => { const T = window.T; const r = T.take('office', 'keycard_facilities') || T.takeFloor('office', 'keycard_facilities'); if (!r) throw new Error('keycard not found'); await T.sleep(1500); return [r, T.has('got:keycard_facilities')]; });
  await S('office: swipe server closet reader', async () => { const T = window.T, o = T.obj('office', (o) => o.state.card === 'keycard_facilities', 'reader'); await T.use(o, 'Swipe a card'); const d = o.state.door; await T.until(() => !T.g.getZone('office').edge(d[0], d[1], d[2])?.locked); });
  await S('office: disable SRV-1', async () => { const T = window.T, o = T.obj('office', (o) => o.state.node === 'SRV-1', 'SRV-1'); await T.use(o, 'Disable node SRV-1'); await T.until(() => T.has('node:SRV-1')); return { stage: T.g.missions.stage }; });
  await S('fields → house: attic key + birthday card → lab code', async () => { const T = window.T; await T.go('house'); const k = T.takeFloor('fields', 'house_key') || T.take('fields', 'house_key'); T.lore('card_birthday'); return { key: !!k, lab_code: T.has('lab_code') }; });
  await S('house: basement keypad', async () => { const T = window.T, o = T.obj('house', (o) => o.state.codeFlag === 'lab_code', 'keypad'); await T.use(o, 'Enter the code'); const d = o.state.door; if (d) await T.until(() => !T.g.getZone('house').edge(d[0], d[1], d[2])?.locked); return d; });
  await S('house → lab (basement stairs)', async () => window.T.through('p_house_lab', 'lab'));
  await S('lab: director\'s log + keycard', async () => { const T = window.T; T.lore('log_director'); const r = T.take('lab', 'keycard_lab') || T.takeFloor('lab', 'keycard_lab'); if (!r) throw new Error('keycard_lab not found'); return r; });
  await S('lab: swipe SRV-2 reader', async () => { const T = window.T, o = T.obj('lab', (o) => o.state.card === 'keycard_lab', 'reader'); await T.use(o, 'Swipe a card'); const d = o.state.door; if (d) await T.until(() => !T.g.getZone('lab').edge(d[0], d[1], d[2])?.locked); });
  await S('lab: disable SRV-2', async () => { const T = window.T, o = T.obj('lab', (o) => o.state.node === 'SRV-2', 'SRV-2'); await T.use(o, 'Disable node SRV-2'); await T.until(() => T.has('node:SRV-2')); return { stage: T.g.missions.stage }; });
  await S('stairwell landing 13 → corrupt: root key', async () => { const T = window.T; await T.go('stairwell'); await T.through('p_stair_13', 'corrupt'); const r = T.takeFloor('corrupt', 'root_key') || T.take('corrupt', 'root_key'); if (!r) throw new Error('root_key not found'); await T.sleep(1500); return [r, T.has('got:root_key')]; });
  await S('lab → core: disable SRV-3, the bands go dead', async () => { const T = window.T; await T.go('lab'); await T.through('p_lab_core', 'server'); const o = T.obj('server', (o) => o.state.node === 'SRV-3', 'SRV-3'); await T.use(o, 'Disable node SRV-3'); await T.until(() => T.has('node:SRV-3')); await T.until(() => T.has('band:removed'), 60000, 'band:removed'); return { band: T.g.band.get(T.p.id), cut: T.p.allItems().some((i) => i.key === 'bailiff_band_cut') }; });
  await S('server → exit → the ending (no band, no detonation)', async () => { const T = window.T; await T.through('p_core_exit', 'exit'); const pt = T.portal('p_exit_final'); T.g.usePortal(T.p, pt); await T.sleep(1500); return { escaped: T.has('escaped'), overlay: !!document.querySelector('.k-ending'), band: T.g.band.get(T.p.id) }; });
  await page.context().close();
}

await browser.close();
console.log(failed ? `${failed} step(s) failed` : 'walkthrough complete');
process.exit(failed ? 1 : 0);
