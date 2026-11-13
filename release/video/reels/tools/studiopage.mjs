// Opens the capture studio (tools/studio/reel.html: the game's own renderer, the Ledge, Dr. Calder, the card)
// in a headless Chromium and steps it frame by frame. The studio is TypeScript, so a vite dev server has to
// serve the repository: pass one with BASE=http://127.0.0.1:5199, or one is started here and stopped after.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REELS = path.resolve(HERE, '..');
export const ROOT = path.resolve(REELS, '../../..');

/** the QR code for the link (qrcode package, in tools/node_modules: `npm install` in tools/): module matrix, 1 = dark */
export function qrFor(link) {
  const QR = createRequire(import.meta.url)('qrcode');
  const q = QR.create(link, { errorCorrectionLevel: 'M' });
  return { size: q.modules.size, bits: Array.from(q.modules.data, (b) => (b ? 1 : 0)) };
}

const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

async function startVite() {
  const port = await freePort();
  const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NOHMR: '1' } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(base + '/')).ok) return { base, stop: () => vite.kill() }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  vite.kill();
  throw new Error('vite did not start');
}

let shared = null;
/** one vite for the whole run (BASE=... uses a running one); stopServer() when done */
export async function server() {
  if (!shared) shared = process.env.BASE ? { base: process.env.BASE.replace(/\/$/, ''), stop() {} } : await startVite();
  return shared;
}
export function stopServer() { if (shared) { shared.stop(); shared = null; } }

/** open the studio at w x h in a zone, with a reel spec (window.__spec, see studio/reelSpec.ts);
 *  returns begin(reel, shot, dur), step(dt, at?) -> jpeg Buffer, close() */
export async function openStudio(link, { w = 540, h = 960, zone = 'ledge', seed = 1337, spec = null } = {}) {
  const own = !shared;
  const srv = await server();
  const pw = await import(path.join(ROOT, 'node_modules/playwright-core/index.mjs'));
  const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const close = async () => { await browser.close(); if (own) stopServer(); };
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', (e) => console.log('[studio]', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('[studio]', m.text().slice(0, 300)); });
    await page.addInitScript(([q, sp]) => { window.__qr = q; if (sp) window.__spec = sp; }, [qrFor(link), spec]);
    await page.goto(`${srv.base}/release/video/reels/tools/studio/reel.html?zone=${zone}&seed=${seed}&q=low&link=${encodeURIComponent(link)}`, { waitUntil: 'load', timeout: 600000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
    return {
      page, close,
      begin: (reel, id, dur) => page.evaluate(([r, id, d]) => window.__reel.begin(r, id, d), [reel, id, dur]),
      stage: () => page.evaluate(() => window.__stage ?? null),
      async step(dt, at) {
        const b64 = await page.evaluate(([dt, at]) => window.__reel.step(dt, true, at ?? undefined), [dt, at ?? null]);
        return Buffer.from(b64.slice(b64.indexOf(',') + 1), 'base64');
      },
    };
  } catch (e) { await close(); throw e; }
}

/** render the card close-up ('endcard' shot) of one reel into dir/NNNN.jpg; returns the frame count */
export async function renderEndcard(reel, dur, fps, dir, link) {
  fs.mkdirSync(dir, { recursive: true });
  const st = await openStudio(link);
  try {
    await st.begin(reel, 'endcard', dur);
    const n = Math.round(dur * fps);
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.jpg`), await st.step(1 / fps));
    return n;
  } finally { await st.close(); }
}
