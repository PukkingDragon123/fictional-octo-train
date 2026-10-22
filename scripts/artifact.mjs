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
let style = fs.readFileSync(path.join(dist, css), 'utf8');
style = style.replace(/url\((['"]?)\.?\.?\/?fonts\/([^'")]+)\1\)/g, (_, _q, file) => {
  const b = fs.readFileSync(path.join(dist, 'fonts', file));
  return `url(data:font/woff2;base64,${b.toString('base64')})`;
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
console.log(JSON.stringify({ page: 'dist/artifact.html', kb: Math.round(page.length / 1024), entry: js, scripts: assets }, null, 1));
