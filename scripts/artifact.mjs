// Package the production build as a self-contained page for a sandboxed host (claude.ai artifact):
// the page body + inlined CSS with fonts as data URIs; JS chunks stay as separate relative files.
//   VITE_SANDBOXED=1 npx vite build && node scripts/artifact.mjs   →  dist/artifact.html (+ dist/assets/*.js)
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1];
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
if (!css || !js) throw new Error('could not find the built css/js in dist/index.html');

// ---- audio (src/assets/sfx, recorded CC0 samples): Vite emits each as dist/assets/<name>-<hash>.mp3 and
// references it from JS as new URL(`<file>`, import.meta.url). Swap each reference for a data: URI
// (src/audio/samples.ts decodes data: URIs itself, without fetch) so the sandboxed page makes no media
// requests, then drop the inlined files.
const AUDIO_MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' };
const assetDir = path.join(dist, 'assets');
const audioFiles = new Map(fs.readdirSync(assetDir).filter((f) => /\.(mp3|ogg|wav|m4a)$/.test(f)).map((f) => [f, null]));
const audioUsed = new Set();
for (const f of fs.readdirSync(assetDir).filter((n) => n.endsWith('.js'))) {
  const p = path.join(assetDir, f);
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(/(["'`])(?:\.\/)?(?:assets\/)?([\w.-]+\.(?:mp3|ogg|wav|m4a))\1/g, (m, q, file) => {
    if (!audioFiles.has(file)) return m;
    let uri = audioFiles.get(file);
    if (!uri) { uri = `data:${AUDIO_MIME[file.split('.').pop()]};base64,${fs.readFileSync(path.join(assetDir, file)).toString('base64')}`; audioFiles.set(file, uri); }
    audioUsed.add(file);
    return q + uri + q;
  });
  if (out !== src) fs.writeFileSync(p, out);
}
let audioBytes = 0;
for (const f of audioUsed) { audioBytes += fs.statSync(path.join(assetDir, f)).size; fs.rmSync(path.join(assetDir, f)); }

let style = fs.readFileSync(path.join(dist, css), 'utf8');
style = style.replace(/url\((['"]?)\.?\.?\/?fonts\/([^'")]+)\1\)/g, (_, _q, file) => {
  const b = fs.readFileSync(path.join(dist, 'fonts', file));
  const mime = file.endsWith('.ttf') ? 'font/ttf' : file.endsWith('.otf') ? 'font/otf' : 'font/woff2';
  return `url(data:${mime};base64,${b.toString('base64')})`;
});
const page = `<title>Limbo Phobia</title>
<meta name="description" content="An isometric survival sandbox inside a liminal simulation that is coming apart.">
<style>
${style}
html, body { height: 100%; background: #000; }
</style>
<canvas id="view"></canvas>
<div id="ui"></div>
<div id="boot"><div class="boot-text">INITIALISING SIMULATION&hellip;</div></div>
<script type="module" src="./${js}"></script>
`;
fs.writeFileSync(path.join(dist, 'artifact.html'), page);
const assets = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
console.log(JSON.stringify({ page: 'dist/artifact.html', kb: Math.round(page.length / 1024), entry: js, scripts: assets, audioInlined: audioUsed.size, audioKB: Math.round(audioBytes / 1024), scriptsKB: Math.round(assets.reduce((s, f) => s + fs.statSync(path.join(dist, 'assets', f)).size, 0) / 1024) }, null, 1));
