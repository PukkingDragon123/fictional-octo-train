import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(process.argv[2] || 'http://localhost:5173/', { waitUntil: 'load' });
console.log('loaded', Date.now() - t0);
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2000);
  const r = await Promise.race([page.evaluate(() => { const g = window.__game; return g ? { t: g.time.toFixed(2), x: g.local?.x } : 'nogame'; }), new Promise((r) => setTimeout(() => r('EVAL TIMEOUT'), 5000))]);
  console.log(Date.now() - t0, JSON.stringify(r));
}
console.log(logs.filter(l=>!l.includes('vite')&&!l.includes('missing texture')).slice(0, 30).join('\n'));
await browser.close();
