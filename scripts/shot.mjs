// Headless screenshot harness: node scripts/shot.mjs [url] [out.png] [waitMs] [script]
// Starts nothing itself; expects a dev/preview server to be running.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'scripts/out/shot.png';
const wait = Number(process.argv[4] || 4000);
const scriptFile = process.argv[5];
fs.mkdirSync('scripts/out', { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
if (scriptFile) {
  const steps = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  for (const s of steps) {
    if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.ms || 500); await page.keyboard.up(s.key); }
    if (s.press) await page.keyboard.press(s.press);
    if (s.click) await page.mouse.click(s.click[0], s.click[1], { button: s.button || 'left' });
    if (s.move) await page.mouse.move(s.move[0], s.move[1]);
    if (s.eval) logs.push('[eval] ' + JSON.stringify(await page.evaluate(s.eval)));
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.shot) await page.screenshot({ path: s.shot });
  }
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
