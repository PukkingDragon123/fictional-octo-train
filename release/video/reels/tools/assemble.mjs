// Full build of one reel: captured game frames (24 fps) + the recruiting screen + the mixed soundtrack.
//   node assemble.mjs <reel> <frames dir: 00000.jpg ...> <audio.wav> [recruiting screen frames dir: 0000.jpg ...]
// Without a screen frames dir the screen is rendered here by the studio (see studiopage.mjs).
// Writes ../<file>.mp4 and build/<reel>.json (frame counts the card re-render needs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { REELS, ROOT, renderEndcard } from './studiopage.mjs';
import { FPS, X264, ff, subs, encodeEnd, probeFrames } from './enc.mjs';

export const FILES = { jelly: 'limbo_phobia_reel_jelly_bear.mp4', bee: 'limbo_phobia_reel_bumble_bee.mp4', keeper: 'limbo_phobia_reel_bee_keeper.mp4' };
const [reel, frames, audio, endDir0] = process.argv.slice(2);
const B = path.join(REELS, 'build');
const plan = JSON.parse(fs.readFileSync(path.join(B, 'plan.json'), 'utf8'))[reel];
const words = JSON.parse(fs.readFileSync(path.join(B, 'words.json'), 'utf8'));
const link = fs.readFileSync(path.join(REELS, 'itch_url.txt'), 'utf8').trim();
const end = plan.shots.find((s) => s.id === 'endcard');
const intro = plan.shots.find((s) => s.id === 'intro');
const nBody = Math.round(end.at * FPS), nEnd = Math.round(end.dur * FPS);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));

// the Institute's lockup flickers on at the top when she names it, and fades before the first cut
const hi = plan.voice[0];
const named = (words[`/${reel}/${hi.key}.wav`] || []).find((w) => /^Meridian/.test(w[2]));
const A = +(hi.at + (named ? named[0] : 2.5) - 0.08).toFixed(2), Z = +(intro.at + intro.dur - 0.3).toFixed(2);
const band = path.join(tmp, 'band.png');
ff(['-f', 'lavfi', '-i', 'color=c=black:s=1080x520:d=1', '-vf', "format=rgba,geq=r=0:g=0:b=0:a='215*pow(1-Y/520\\,1.2)'", '-frames:v', '1', band]);
const logo = path.join(ROOT, 'public/brand/lockup-horizontal@1x.png');
const fade = `fade=t=out:st=${(Z - 0.45).toFixed(2)}:d=0.45:alpha=1`;
const graph = [
  '[0:v]scale=1080:1920:flags=lanczos,unsharp=5:5:0.45[v0]',
  `[1:v]format=rgba,fade=t=in:st=${A}:d=0.3:alpha=1,${fade}[band]`,
  `[2:v]scale=iw*3:ih*3:flags=neighbor,format=rgba,${fade}[logo]`,
  `[v0][band]overlay=0:0:enable='between(t,${A},${Z})'[v1]`,
  `[v1][logo]overlay=(W-w)/2:118:enable='between(t,${A},${Z})*(gte(t,${A + 0.4})+gt(sin((t-${A})*110),0.1))'[v2]`,
  `[v2]${subs(path.join(B, reel + '.ass'))}[out]`,
].join(';');
ff(['-framerate', String(FPS), '-start_number', '0', '-i', path.join(frames, '%05d.jpg'),
  '-loop', '1', '-framerate', String(FPS), '-i', band, '-loop', '1', '-framerate', String(FPS), '-i', logo,
  '-filter_complex', graph, '-map', '[out]', '-frames:v', String(nBody), ...X264, path.join(tmp, 'body.mp4')]);

// the recruiting screen at the end
const endDir = endDir0 || path.join(tmp, 'end');
if (!endDir0) await renderEndcard(reel, end.dur, FPS, endDir, link);
encodeEnd(endDir, nEnd, path.join(B, reel + '_card.ass'), path.join(tmp, 'card.mp4'));
fs.copyFileSync(path.join(endDir, `${String(nEnd - 1).padStart(4, '0')}.jpg`), path.join(B, 'endscreen.jpg'));

fs.writeFileSync(path.join(tmp, 'list.txt'), `file '${path.join(tmp, 'body.mp4')}'\nfile '${path.join(tmp, 'card.mp4')}'\n`);
const out = path.join(REELS, FILES[reel]);
ff(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
const bodyFrames = probeFrames(path.join(tmp, 'body.mp4'));
fs.writeFileSync(path.join(B, reel + '.json'), JSON.stringify({ file: FILES[reel], bodyFrames, cardFrames: nEnd, link }, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(out, fs.statSync(out).size, 'bytes', bodyFrames, '+', nEnd, 'frames');
