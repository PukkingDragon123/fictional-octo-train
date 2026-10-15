// co-op mirror check for limb loss: a host and a client in one browser; the host's hound tears
// the client's hand off; both screens are captured; the host then tourniquets the client.
import { chromium } from 'playwright-core';
const URL = 'http://127.0.0.1:5199/?intro=0';
const OUT = 'scripts/out/limbs/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const logs = [];
const mk = async (tag) => {
  const pg = await browser.newPage({ viewport: { width: 760, height: 480 } });
  pg.setDefaultTimeout(180000);
  pg.on('console', (m) => { logs.push(`[${tag} ${m.type()}] ${m.text()}`); });
  pg.on('pageerror', (e) => logs.push(`[${tag} pageerror] ${e.message}`));
  await pg.goto(URL, { waitUntil: 'load' });
  return pg;
};
const app = { skin: 0xd39b6c, hair: 0x3b2a1e, hairStyle: 'short', face: 1, build: 'average', height: 1 };
const host = await mk('host');
await host.evaluate((a) => { window.name = 'noclip.launch:' + JSON.stringify({ mode: 'host', server: 'ws://127.0.0.1:8787/ws', roomName: 'limbs', public: false, pass: '', sandbox: {}, seed: 1337, directives: false, name: 'Hosty', app: a, occupation: 'unemployed', traits: [] }); location.reload(); }, app);
await host.waitForFunction(() => window.__game?.net?.room, null, { timeout: 120000 });
const room = await host.evaluate(() => window.__game.net.room);
console.log('room', room);
await host.waitForTimeout(4000);
const client = await mk('client');
await client.evaluate(([a, r]) => { window.name = 'noclip.launch:' + JSON.stringify({ mode: 'join', server: 'ws://127.0.0.1:8787/ws', room: r, pass: '', name: 'Clienta', app: { ...a, hairStyle: 'long', hair: 0x8a3a1c }, occupation: 'unemployed', traits: [] }); location.reload(); }, [app, room]);
await host.bringToFront();
await host.waitForTimeout(8000);
console.log('host sees', await host.evaluate(() => ({ n: window.__game.players.size, peers: [...window.__game.net.peers.keys()] })));
await client.bringToFront();
try { await client.waitForFunction(() => window.__game?.local && window.__game.players.size >= 2, null, { timeout: 90000 }); }
catch (e) { console.log('manual join', await client.evaluate(async (r) => { const { Net } = await import('/src/net/net.ts'); try { const res = await Promise.race([Net.join('ws://127.0.0.1:8787/ws', r, { name: 'T', app: null, occupation: 'unemployed', traits: [] }), new Promise((_, rej) => setTimeout(() => rej(new Error('t/o')), 15000))]); return 'ok ' + res.net.id; } catch (e) { return 'fail ' + e.message; } }, room));
  console.log('ws probe', await client.evaluate(() => new Promise((res) => { const w = new WebSocket('ws://127.0.0.1:8787/ws'); w.onopen = () => res('open'); w.onerror = () => res('error'); setTimeout(() => res('state ' + w.readyState), 4000); })));
  console.log('JOIN FAILED', await client.evaluate(() => ({ boot: document.getElementById('boot')?.innerText, g: !!window.__game, n: window.__game?.players?.size, name: window.name.slice(0, 60) }))); console.log(logs.filter((l) => !/preload/.test(l)).slice(-20).join('\n')); process.exit(1); }
await host.waitForFunction(() => window.__game.players.size >= 2, null, { timeout: 60000 });
await client.waitForTimeout(6000);
// both survivors next to each other in the host's view
const pos = await host.evaluate(() => { const g = window.__game; const me = g.local; const o = [...g.players.values()].find((p) => !p.isLocal); return { me: [me.x, me.z, me.zoneKey], o: o && [o.x, o.z, o.zoneKey] }; });
console.log('positions', JSON.stringify(pos));
// the host's hound tears the client's left hand off
console.log('tear', await host.evaluate(() => {
  const g = window.__game; const o = [...g.players.values()].find((p) => !p.isLocal);
  const c = g.creatures.spawn('grinhound', o.zoneKey, o.x + 1.0, o.z + 0.2); window.__c = c; c.hp = 500;
  return g.creatures.forceTear(c.id, o.id, 'hand_l', 0.8);
}));
await host.waitForTimeout(5000);
await host.screenshot({ path: OUT + 'coop_host_pull.png' });
for (let i = 0; i < 40; i++) { const done = await client.evaluate(() => window.__game.local.body.severed.length > 0); if (done) break; await client.waitForTimeout(1500); }
await host.bringToFront();
await host.evaluate(() => { const g = window.__game; if (window.__c) g.creatures.remove(window.__c); g.pr.pxSizeTarget = 1 / 120; const o = [...g.players.values()].find((p) => !p.isLocal); g.local.facing = g.local.targetFacing = Math.atan2(o.z - g.local.z, o.x - g.local.x); });
await client.waitForTimeout(4000);
console.log('client', await client.evaluate(() => { const p = window.__game.local; return { sev: p.body.severed, inj: p.body.allInjuries().map((i) => i.type + ':' + i.part + ':' + (i.tq ?? '-')) }; }));
await host.bringToFront();
console.log('host mirror', await host.evaluate(() => { const g = window.__game; const o = [...g.players.values()].find((p) => !p.isLocal); const z = g.getZone(o.zoneKey); const items = [...(z.meta.floorItems?.values?.() || [])].filter((w) => w.item.key.startsWith('limb_')).map((w) => w.item.name); return { sev: o.body.severed, cond: o.rig.outfit.cond?.stump, mirrorInj: o.body.allInjuries().map((i) => i.type + ':' + i.part), limbItems: items }; }));
await host.screenshot({ path: OUT + 'coop_host_after.png' });
await client.bringToFront();
await client.evaluate(() => { window.__game.pr.pxSizeTarget = 1 / 120; });
await client.waitForTimeout(3000);
await client.screenshot({ path: OUT + 'coop_client_after.png' });
await host.bringToFront();
// the host puts a tourniquet on the client's stump through the world menu
console.log('treat', await host.evaluate(async () => {
  const g = window.__game; const me = g.local; const o = [...g.players.values()].find((p) => !p.isLocal);
  me.x = o.x - 0.8; me.z = o.z;
  me.inv.add(window.__dev.newItem('tourniquet'));
  const { bus } = await import('/src/core/events.ts');
  const opts = []; bus.emit('worldMenu', me, { kind: 'player', p: o }, opts);
  const sc = opts.find((x) => /stump care/.test(x.label));
  if (!sc) return 'no menu ' + opts.map((x) => x.label).join('|');
  const tq = sc.sub[0].sub.find((x) => x.label === 'Apply tourniquet');
  tq.action();
  const a = me.actions.list[me.actions.list.length - 1]; a.perform(); me.actions.clear();
  return sc.label + ' / ' + sc.sub[0].label;
}));
await client.bringToFront();
await client.waitForTimeout(3000);
console.log('client after treatment', await client.evaluate(() => { const p = window.__game.local; return p.body.allInjuries().map((i) => i.type + ':' + i.part + ' tq=' + i.tq + ' bleed=' + p.body.injuryBleed(i).toFixed(3)); }));
await host.bringToFront();
await host.waitForTimeout(5000);
await host.screenshot({ path: OUT + 'coop_host_tq.png' });
console.log(logs.filter((l) => !/favicon|debug|vite/i.test(l)).slice(0, 30).join('\n'));
await browser.close();
