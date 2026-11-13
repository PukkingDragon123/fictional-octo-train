// One command to change the link on the reels' recruiting screen: edit release/video/reels/itch_url.txt, then
//   node release/video/reels/tools/endcard.mjs          (BASE=http://127.0.0.1:5199 to use a running vite)
// The screen is rendered again by the studio in the game's renderer (tools/studio/adScreen.ts: a new QR code
// and the link under it) and swapped into every reel: the footage before it is copied untouched and the
// soundtrack is kept as it is.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { REELS, renderEndcard } from './studiopage.mjs';
import { FPS, encodeEnd, ff, probeFrames } from './enc.mjs';

const B = path.join(REELS, 'build');
const link = fs.readFileSync(path.join(REELS, 'itch_url.txt'), 'utf8').trim();
const plan = JSON.parse(fs.readFileSync(path.join(B, 'plan.json'), 'utf8'));
console.log('link:', link);
const reels = ['jelly', 'bee', 'keeper'].filter((r) => fs.existsSync(path.join(B, r + '.json')));
if (!reels.length) throw new Error('no reel built yet (assemble.mjs first)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-'));
// the recruiting screen is the same shot in every reel: render it once
const dur = plan[reels[0]].shots.find((s) => s.id === 'endcard').dur;
const n = await renderEndcard(reels[0], dur, FPS, path.join(tmp, 'frames'), link);
fs.copyFileSync(path.join(tmp, 'frames', `${String(n - 1).padStart(4, '0')}.jpg`), path.join(B, 'endscreen.jpg'));
for (const reel of reels) {
  const metaFile = path.join(B, reel + '.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const mp4 = path.join(REELS, meta.file);
  // the footage before the screen, bit for bit (the screen's segment starts on its own keyframe)
  ff(['-i', mp4, '-map', '0:v', '-c', 'copy', '-frames:v', String(meta.bodyFrames), path.join(tmp, 'head.mp4')]);
  if (probeFrames(path.join(tmp, 'head.mp4')) !== meta.bodyFrames) throw new Error('could not cut the footage of ' + reel);
  encodeEnd(path.join(tmp, 'frames'), n, path.join(B, reel + '_card.ass'), path.join(tmp, 'card.mp4'));
  fs.writeFileSync(path.join(tmp, 'list.txt'), `file '${path.join(tmp, 'head.mp4')}'\nfile '${path.join(tmp, 'card.mp4')}'\n`);
  const out = path.join(tmp, 'new.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-i', mp4, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', out]);
  fs.copyFileSync(out, mp4);
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, cardFrames: n, link }, null, 1));
  console.log('updated', mp4);
}
fs.rmSync(tmp, { recursive: true, force: true });
