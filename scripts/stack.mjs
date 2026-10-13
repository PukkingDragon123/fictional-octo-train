// Pause a hung page and print the JS call stack (debug helper).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const client = await page.context().newCDPSession(page);
await client.send('Debugger.enable');
client.on('Debugger.paused', (ev) => {
  console.log('PAUSED:', ev.reason);
  for (const f of ev.callFrames.slice(0, 15)) console.log('  at', f.functionName || '(anon)', f.url.replace(/.*\/src\//, 'src/'), f.location.lineNumber + 1);
  client.send('Debugger.resume').catch(() => {});
});
await page.goto(process.argv[2] || 'http://localhost:5173/', { waitUntil: 'load' });
await page.waitForTimeout(Number(process.argv[3] || 6000));
await client.send('Debugger.pause');
await page.waitForTimeout(1500);
await client.send('Debugger.pause').catch(()=>{});
await page.waitForTimeout(1500);
await browser.close();
