// Captures the in-game footage of one reel from the studio (tools/studio/), 405 x 720 at 24 fps.
//   node capture.mjs <reel> <out dir> [shot,shot,...]      (BASE=http://127.0.0.1:5199 to use a running vite)
// Frames are numbered on the reel's clock (out/NNNNN.jpg), so single shots can be redone in place.
// The card close-up is not captured here: assemble.mjs / endcard.mjs render it at 540 x 960.
import fs from 'node:fs';
import path from 'node:path';
import { REELS, openStudio } from './studiopage.mjs';

const [reel, out, only] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(path.join(REELS, 'build/plan.json'), 'utf8'))[reel];
const link = fs.readFileSync(path.join(REELS, 'itch_url.txt'), 'utf8').trim();
fs.mkdirSync(out, { recursive: true });
const st = await openStudio(link, { w: 405, h: 720 });
try {
  for (const sh of plan.shots) {
    if (sh.id === 'endcard' || (only && !only.split(',').includes(sh.id))) continue;
    await st.begin(reel, sh.id, sh.dur);
    const f0 = Math.round(sh.at * plan.fps), f1 = Math.round((sh.at + sh.dur) * plan.fps);
    for (let f = f0; f < f1; f++) fs.writeFileSync(path.join(out, `${String(f).padStart(5, '0')}.jpg`), await st.step(1 / plan.fps));
    console.log(reel, sh.id, f1 - f0, 'frames');
  }
} finally { await st.close(); }
