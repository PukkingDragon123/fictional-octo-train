// Desktop (Steam) packages: the game built for the Electron wrapper in desktop/, packaged per platform.
//   node scripts/steam.mjs                 Windows x64 + Linux x64   → release/steam/limbo-phobia-<os>-<arch>/
//   node scripts/steam.mjs linux           one platform (linux | win | mac; mac builds x64 and arm64)
//   node scripts/steam.mjs linux --zip     also zip each package (release/steam/*.zip)
//   SKIP_BUILD=1 ...                       reuse dist-desktop/
// Each folder is a SteamPipe content root (upload it as that OS's depot). The first run downloads the
// Electron runtime for each target into the Electron cache; after that it works offline.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const desk = join(root, 'desktop');
const out = join(root, 'release', 'steam');
const web = join(root, 'dist-desktop');
const stage = join(out, '.stage');
const args = process.argv.slice(2);
const zip = args.includes('--zip');
const want = args.filter((a) => !a.startsWith('--'));
const TARGETS = { linux: [['linux', 'x64']], win: [['win32', 'x64']], mac: [['darwin', 'x64'], ['darwin', 'arm64']] };
const targets = (want.length ? want : ['win', 'linux']).flatMap((k) => { if (!TARGETS[k]) throw new Error(`unknown target ${k} (linux | win | mac)`); return TARGETS[k]; });

if (!existsSync(join(desk, 'node_modules', 'electron'))) {
  console.log('desktop/: installing the wrapper\'s dependencies (Electron, steamworks.js, the packager)');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: desk, stdio: 'inherit' });
}

// 1. the game, built for the wrapper (relative base, no sandbox flag: co-op stays available through a typed-in relay)
if (!process.env.SKIP_BUILD) {
  rmSync(web, { recursive: true, force: true });
  execFileSync('npx', ['vite', 'build', '--outDir', web, '--emptyOutDir'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_DESKTOP: '1' } });
  execFileSync('node', [join(root, 'scripts/voicepack.mjs'), web], { cwd: root, stdio: 'inherit' });
  rmSync(join(web, 'brand'), { recursive: true, force: true });
}
// offline check: no CDN, no absolute URL to the internet in the built page
for (const f of readdirSync(join(web, 'assets')).filter((f) => /\.(js|css)$/.test(f)).map((f) => join(web, 'assets', f)).concat([join(web, 'index.html')])) {
  const s = readFileSync(f, 'utf8');
  const m = s.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+|url\(\s*["']?https?:\/\/[^)"']+|@import\s+["']https?:/g);
  if (m) throw new Error(`network dependency in ${f}: ${m.slice(0, 3).join(', ')}`);
}

// 2. the app folder: wrapper + game + steamworks.js + the legal files
rmSync(stage, { recursive: true, force: true });
const app = join(stage, 'app');
mkdirSync(app, { recursive: true });
const pkg = JSON.parse(readFileSync(join(desk, 'package.json'), 'utf8'));
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'limbo-phobia', productName: 'Limbo Phobia', version: rootPkg.version, main: 'main.cjs', description: 'Limbo Phobia', author: 'Limbo Phobia', license: 'SEE LICENSE IN EULA.txt' }, null, 1));
for (const f of ['main.cjs', 'preload.cjs']) copyFileSync(join(desk, f), join(app, f));
cpSync(web, join(app, 'game'), { recursive: true });
cpSync(join(desk, 'node_modules', 'steamworks.js'), join(app, 'node_modules', 'steamworks.js'), { recursive: true });
const icon = join(root, 'public', 'brand', 'emblem-256.png');
if (existsSync(icon)) copyFileSync(icon, join(app, 'icon.png'));
const legal = [['docs/EULA.md', 'EULA.txt'], ['docs/PRIVACY.md', 'PRIVACY.txt'], ['CREDITS.md', 'CREDITS.txt']];

// 3. package each target
const require = createRequire(join(desk, 'package.json'));
const { packager } = require('@electron/packager');
const electronVersion = JSON.parse(readFileSync(join(desk, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
mkdirSync(out, { recursive: true });
const dirSize = (d) => { let n = 0; const w = (p) => { for (const f of readdirSync(p)) { const q = join(p, f); const s = statSync(q, { throwIfNoEntry: false }); if (!s) continue; if (s.isDirectory()) w(q); else n += s.size; } }; w(d); return n; };
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
for (const [platform, arch] of targets) {
  const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
  const name = `limbo-phobia-${os}-${arch}`;
  const dest = join(out, name);
  rmSync(dest, { recursive: true, force: true });
  // only this platform's steamworks binaries go in
  const appT = join(stage, `app-${os}-${arch}`);
  rmSync(appT, { recursive: true, force: true });
  cpSync(app, appT, { recursive: true });
  const swd = join(appT, 'node_modules', 'steamworks.js', 'dist');
  for (const d of readdirSync(swd)) if (d !== { win32: 'win64', linux: 'linux64', darwin: 'osx' }[platform]) rmSync(join(swd, d), { recursive: true, force: true });
  const [made] = await packager({
    dir: appT, out: stage, platform, arch, electronVersion, overwrite: true, prune: false, quiet: true,
    name: 'Limbo Phobia', executableName: platform === 'darwin' ? 'Limbo Phobia' : 'limbo-phobia',
    appBundleId: 'local.limbophobia.game', appCategoryType: 'public.app-category.games', appCopyright: 'Limbo Phobia',
    asar: { unpack: '**/node_modules/steamworks.js/**' },
    ignore: [/\.map$/],
  });
  rmSync(dest, { recursive: true, force: true });
  cpSync(made, dest, { recursive: true, verbatimSymlinks: true });
  rmSync(made, { recursive: true, force: true });
  rmSync(appT, { recursive: true, force: true });
  for (const [src, to] of legal) if (existsSync(join(root, src))) copyFileSync(join(root, src), join(dest, to));
  // Linux: Chromium's setuid sandbox helper cannot be root-owned inside a Steam depot; the launcher passes --no-sandbox
  // (the page itself stays sandboxed by Electron's renderer sandbox and context isolation)
  if (platform === 'linux') {
    writeFileSync(join(dest, 'limbo-phobia.sh'), '#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/limbo-phobia" --no-sandbox "$@"\n');
    chmodSync(join(dest, 'limbo-phobia.sh'), 0o755);
  }
  const size = dirSize(dest);
  let z = '';
  if (zip) { const zf = join(out, name + '.zip'); rmSync(zf, { force: true }); execFileSync('zip', ['-qry9', zf, '.'], { cwd: dest }); z = ` · zip ${mb(statSync(zf).size)}`; }
  console.log(`steam: ${name} → release/steam/${name} (${mb(size)}${z})`);
}
rmSync(stage, { recursive: true, force: true });
