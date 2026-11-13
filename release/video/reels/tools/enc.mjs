// Shared encoder settings: every segment of a reel (the in-game footage and the card close-up) is encoded
// with exactly these, so the segments join without re-encoding (endcard.mjs swaps the card alone).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './studiopage.mjs';

export const FPS = 24;
export const FONTS = path.join(ROOT, 'public/fonts');
export const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '4800k', '-bufsize', '9600k',
  '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), '-keyint_min', String(FPS),
  '-bf', '2', '-x264-params', 'open-gop=0:scenecut=0', '-video_track_timescale', '12288', '-an'];

export function ff(args, quiet = true) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', quiet ? 'error' : 'info', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}
export function probeFrames(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]);
  return Number(String(r.stdout).trim());
}
/** subtitles filter argument (escaped for the filter graph) */
export function subs(ass) { return `subtitles='${ass.replace(/'/g, "\\'").replace(/:/g, '\\:')}':fontsdir='${FONTS.replace(/:/g, '\\:')}'`; }

/** the card close-up: encode rendered frames (dir/NNNN.jpg, 540 x 960, exactly 2x up) with the card captions */
export function encodeEnd(dir, n, assFile, outMp4) {
  const vf = `scale=1080:1920:flags=neighbor${assFile ? ',' + subs(assFile) : ''}`;
  ff(['-framerate', String(FPS), '-start_number', '0', '-i', path.join(dir, '%04d.jpg'), '-frames:v', String(n), '-vf', vf, ...X264, outMp4]);
}
