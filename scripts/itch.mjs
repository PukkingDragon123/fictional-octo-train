// itch.io HTML5 upload: a normal relative-base build zipped with index.html at the root.
//   node scripts/itch.mjs            →  release/limbo-phobia-itch.zip (+ release/itch-page/ art if present)
// itch serves the game from a sub-path inside an iframe, so every URL must be relative (vite base './').
// Co-op needs a relay the browser can reach, so the upload is flagged sandboxed (single player, co-op notice shown).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist-itch');
const rel = join(root, 'release');
const zip = join(rel, 'limbo-phobia-itch.zip');

rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_SANDBOXED: '1', VITE_ITCH: '1' } });

// the voice clips go into a few packs (itch caps an upload at 1000 files); the brand art is for the store page, not the game
execFileSync('node', [join(root, 'scripts/voicepack.mjs'), out], { cwd: root, stdio: 'inherit' });
rmSync(join(out, 'brand'), { recursive: true, force: true });

// itch rules: index.html at the root, at most 1000 files, no absolute asset URLs
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(out);
if (!existsSync(join(out, 'index.html'))) throw new Error('no index.html at the build root');
if (files.length > 1000) throw new Error(`${files.length} files: itch allows 1000`);
const abs = [];
for (const f of files.filter((f) => /\.(html|css|js)$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  const m = s.match(/(?:src|href)=["']\/(?!\/)[^"']+|url\(\s*["']?\/(?!\/)[^)"']+/g);
  if (m) abs.push(`${relative(out, f)}: ${[...new Set(m)].slice(0, 4).join(', ')}`);
}
if (abs.length) throw new Error('absolute asset URLs would break on itch:\n' + abs.join('\n'));

mkdirSync(rel, { recursive: true });
rmSync(zip, { force: true });
execFileSync('zip', ['-qr9', zip, '.'], { cwd: out, stdio: 'inherit' });
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const total = files.reduce((a, f) => a + statSync(f).size, 0);
console.log(`itch: ${files.length} files, ${mb(total)} unzipped → ${relative(root, zip)} (${mb(statSync(zip).size)})`);
