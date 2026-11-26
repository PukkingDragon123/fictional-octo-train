// Limbo Phobia: the desktop wrapper (Electron). Loads the built game (game/, from `npm run steam:*`) over a
// private app:// scheme, so it runs fully offline. Steam (steamworks.js) is optional: with Steam running the
// overlay, achievements and the cloud folder work; without it the game runs exactly the same.
//
//   App ID: $STEAM_APPID, else steam_appid.txt beside the executable (or in this folder), else 480 (Spacewar, dev).
//   User data (saves, settings, logs): app.getPath('userData')
//     Windows  %APPDATA%\Limbo Phobia        Linux  ~/.config/Limbo Phobia        macOS  ~/Library/Application Support/Limbo Phobia
//     saves/storage.json  the game's save mirror (Steam Auto-Cloud syncs saves/)
//     display.json        window mode, size, vsync
//     logs/               limbo-YYYY-MM-DD.log (renderer errors, crashes, a lost GPU / renderer)
//   Flags: --dev-tools (or LIMBO_DEVTOOLS=1) opens the inspector; --no-steam skips Steam; --smoke quits after the title loads.
'use strict';
const { app, BrowserWindow, ipcMain, protocol, screen, shell, Menu, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const NAME = 'Limbo Phobia';
app.setName(NAME);
const argv = process.argv.slice(1);
const has = (f) => argv.includes(f);
const SMOKE = has('--smoke');
const DEVTOOLS = has('--dev-tools') || process.env.LIMBO_DEVTOOLS === '1';
const GAME_DIR = path.join(__dirname, 'game');
const exeDir = path.dirname(process.execPath);

// ---------------------------------------------------------------- user data, logs
const userData = app.getPath('userData');
const savesDir = path.join(userData, 'saves');
const logsDir = path.join(userData, 'logs');
for (const d of [savesDir, logsDir]) { try { fs.mkdirSync(d, { recursive: true }); } catch { /* read-only home */ } }
const logFile = () => path.join(logsDir, `limbo-${new Date().toISOString().slice(0, 10)}.log`);
function log(level, text) {
  try { fs.appendFileSync(logFile(), (String(text).startsWith('20') ? text : `${new Date().toISOString()} [${level}] ${text}`) + '\n'); } catch { /* disk full */ }
}
function pruneLogs() {
  try { const fsx = fs.readdirSync(logsDir).filter((f) => f.endsWith('.log')).sort(); for (const f of fsx.slice(0, Math.max(0, fsx.length - 14))) fs.rmSync(path.join(logsDir, f), { force: true }); } catch { /* ignore */ }
}
process.on('uncaughtException', (e) => { log('crash', `main: ${e && e.stack || e}`); });
process.on('unhandledRejection', (e) => { log('crash', `main rejection: ${e && e.stack || e}`); });

// ---------------------------------------------------------------- display settings (before the GPU starts)
const displayFile = path.join(userData, 'display.json');
const DISPLAY_DEF = { mode: 'fullscreen', width: 1600, height: 900, vsync: true };
function readJson(f, d) { try { return { ...d, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return { ...d }; } }
function writeJson(f, o) { try { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); return true; } catch (e) { log('error', `write ${f}: ${e}`); return false; } }
let display = readJson(displayFile, DISPLAY_DEF);
const bootVsync = display.vsync;
if (!display.vsync) { app.commandLine.appendSwitch('disable-gpu-vsync'); app.commandLine.appendSwitch('disable-frame-rate-limit'); }
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ---------------------------------------------------------------- Steam
function appId() {
  const env = Number(process.env.STEAM_APPID || process.env.SteamAppId || 0);
  if (env > 0) return env;
  for (const d of [exeDir, process.cwd(), __dirname, process.resourcesPath || '']) {
    try { const n = Number(fs.readFileSync(path.join(d, 'steam_appid.txt'), 'utf8').trim()); if (n > 0) return n; } catch { /* not here */ }
  }
  return 480;
}
const APP_ID = appId();
let steam = null, steamWhy = '';
if (!has('--no-steam')) {
  try {
    const sw = require('steamworks.js');
    // a real app ID, started outside Steam: Steam relaunches it through itself (DRM-free fallback: if Steam is
    // not installed this returns false and the game simply runs)
    if (APP_ID !== 480 && app.isPackaged && !process.env.LIMBO_NO_RESTART && sw.restartAppIfNecessary(APP_ID)) { app.exit(0); }
    steam = sw.init(APP_ID);
    sw.electronEnableSteamOverlay();
    steam.__sw = sw;
    log('info', `steam on, app ${APP_ID}`);
  } catch (e) {
    steamWhy = String(e && e.message || e).slice(0, 200);
    log('info', `steam off (${steamWhy}); achievements stay local`);
    steam = null;
  }
}

// ---------------------------------------------------------------- the app:// scheme (offline, fetch-friendly)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let win = null;
let quitting = false;

function sizes() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const all = [[1280, 720], [1366, 768], [1600, 900], [1920, 1080], [2560, 1440], [3200, 1800], [3840, 2160]];
  const fit = all.filter(([w, h]) => w <= wa.width && h <= wa.height);
  return fit.length ? fit : [[Math.min(1280, wa.width), Math.min(720, wa.height)]];
}
function info(pending) { return { ...display, sizes: sizes(), pending: !!pending, restartFor: display.vsync !== bootVsync ? ['vsync'] : [] }; }
const frameFor = (mode) => mode === 'windowed';

function createWindow() {
  const d = display;
  const b = screen.getPrimaryDisplay().bounds;
  const opts = {
    title: NAME, backgroundColor: '#000000', show: false, autoHideMenuBar: true, useContentSize: true,
    frame: frameFor(d.mode), fullscreen: d.mode === 'fullscreen',
    width: d.mode === 'windowed' ? d.width : b.width, height: d.mode === 'windowed' ? d.height : b.height,
    x: d.mode === 'borderless' ? b.x : undefined, y: d.mode === 'borderless' ? b.y : undefined,
    icon: fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, devTools: DEVTOOLS || !app.isPackaged, spellcheck: false },
  };
  win = new BrowserWindow(opts);
  if (d.mode === 'borderless') win.setBounds(b);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.loadURL('app://game/index.html' + (SMOKE ? '?smoke' : ''));
  // links (the business card's itch page, the credits) open in the OS browser; the game never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, inp) => {
    if (inp.type !== 'keyDown') return;
    if (inp.key === 'F11' || (inp.alt && inp.key === 'Enter')) { e.preventDefault(); setMode(win.isFullScreen() ? 'windowed' : 'fullscreen', false); }
    if (inp.key === 'F12' && (DEVTOOLS || !app.isPackaged)) win.webContents.toggleDevTools();
  });
  win.webContents.on('render-process-gone', (_e, det) => {
    log('crash', `renderer gone: ${det.reason} (${det.exitCode})`);
    if (!quitting && det.reason !== 'clean-exit') setTimeout(() => { try { win.reload(); } catch { /* window gone */ } }, 600);
  });
  win.webContents.on('unresponsive', () => log('error', 'renderer unresponsive'));
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) log('error', `console: ${message}`); });
  win.on('close', (e) => {
    if (quitting) return;
    // let the page write its save mirror first (it answers with app:quit); a stuck page still closes
    e.preventDefault();
    quitting = true;
    try { win.webContents.send('app:willQuit'); } catch { /* gone */ }
    setTimeout(() => { try { win.destroy(); } catch { /* gone */ } app.quit(); }, 2500);
  });
  if (steam) {
    try {
      const sw = steam.__sw;
      sw.callback?.register?.(sw.SteamCallback.GameOverlayActivated, (v) => { try { win.webContents.send('steam:overlay', !!(v && (v.active ?? v))); } catch { /* gone */ } });
    } catch (e) { log('info', `overlay callback: ${e}`); }
  }
  if (SMOKE) {
    win.webContents.once('did-finish-load', () => log('info', 'smoke: page loaded'));
  }
}

function setMode(mode, reload) {
  const cur = display.mode;
  display.mode = mode;
  writeJson(displayFile, display);
  if (!win) return info(false);
  if (frameFor(mode) !== frameFor(cur)) {
    // the window frame cannot change on a live window: a new window when allowed (the title), else next launch
    if (reload) { const old = win; quitting = true; createWindow(); quitting = false; old.destroy(); return info(false); }
    if (mode === 'fullscreen' || mode === 'borderless') win.setFullScreen(true); else win.setFullScreen(false);
    return info(true);
  }
  if (mode === 'fullscreen') win.setFullScreen(true);
  else if (mode === 'borderless') { win.setFullScreen(false); win.setBounds(screen.getDisplayMatching(win.getBounds()).bounds); }
  else { win.setFullScreen(false); win.setContentSize(display.width, display.height); win.center(); }
  return info(false);
}

// ---------------------------------------------------------------- IPC
ipcMain.on('store:load', (e) => {
  const f = path.join(savesDir, 'storage.json');
  let out = null;
  for (const c of [f, f + '.bak']) { try { out = JSON.parse(fs.readFileSync(c, 'utf8')); break; } catch { /* missing or torn */ } }
  e.returnValue = out;
});
function storeWrite(json) {
  const f = path.join(savesDir, 'storage.json');
  try { JSON.parse(json); } catch { return false; }
  try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch { /* ignore */ }
  try { const t = f + '.tmp'; fs.writeFileSync(t, json); fs.renameSync(t, f); return true; } catch (err) { log('error', `save: ${err}`); return false; }
}
ipcMain.on('store:save', (_e, json) => { storeWrite(json); });
ipcMain.on('store:saveSync', (e, json) => { e.returnValue = storeWrite(json); });
ipcMain.on('log', (_e, level, text) => log(level, text));
ipcMain.on('app:quit', () => { quitting = true; setTimeout(() => app.quit(), 30); });
ipcMain.on('open:external', (_e, url) => { if (/^https?:\/\//.test(String(url))) void shell.openExternal(String(url)); });
ipcMain.handle('display:get', () => info(false));
ipcMain.handle('display:set', (_e, cfg, opts) => {
  const c = cfg || {};
  if (typeof c.vsync === 'boolean') { display.vsync = c.vsync; writeJson(displayFile, display); }
  if (c.width && c.height) {
    display.width = Math.max(960, Math.min(7680, c.width | 0)); display.height = Math.max(540, Math.min(4320, c.height | 0));
    writeJson(displayFile, display);
    if (win && display.mode === 'windowed') { win.setContentSize(display.width, display.height); win.center(); }
  }
  if (c.mode && c.mode !== display.mode) return setMode(c.mode, !!(opts && opts.reload));
  return info(false);
});
ipcMain.handle('steam:status', () => {
  if (!steam) return { on: false, appId: APP_ID, why: steamWhy || 'not started' };
  let name = '', deck = false;
  try { name = steam.localplayer.getName(); } catch { /* offline */ }
  try { deck = steam.utils.isSteamRunningOnSteamDeck(); } catch { /* old client */ }
  return { on: true, appId: APP_ID, name, deck };
});
function achieve(api) {
  if (!steam) return false;
  try { const ok = steam.achievement.isActivated(api) || steam.achievement.activate(api); try { steam.stats.store(); } catch { /* stored by activate */ } return !!ok; } catch (e) { log('error', `achievement ${api}: ${e}`); return false; }
}
ipcMain.handle('steam:achieve', (_e, api) => achieve(String(api)));
ipcMain.handle('steam:sync', (_e, list) => { let n = 0; for (const a of Array.isArray(list) ? list : []) if (achieve(String(a))) n++; return n; });

// ---------------------------------------------------------------- start
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    pruneLogs();
    log('info', `start ${NAME} ${app.getVersion()} electron ${process.versions.electron} ${process.platform}-${process.arch} app ${APP_ID}`);
    Menu.setApplicationMenu(null);
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(GAME_DIR, rel));
      if (!file.startsWith(GAME_DIR)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    // offline by design: nothing loads from the internet. Only co-op (a relay the player types) may reach out.
    const ses = require('electron').session.defaultSession;
    ses.webRequest.onBeforeRequest((det, cb) => {
      const ok = /^(app|devtools|data|blob|chrome-extension):/.test(det.url) || /^wss?:/.test(det.url) || (/^https?:/.test(det.url) && det.resourceType === 'xhr' && /\/(rooms|floors|health)(\?|$)/.test(det.url));
      if (!ok) log('info', `blocked ${det.resourceType} ${det.url.slice(0, 160)}`);
      cb({ cancel: !ok });
    });
    // photo mode's captures land in Pictures/Limbo Phobia (no save dialog)
    ses.on('will-download', (_e, item) => { const d = path.join(app.getPath('pictures'), NAME); try { fs.mkdirSync(d, { recursive: true }); } catch { /* ignore */ } item.setSavePath(path.join(d, item.getFilename())); });
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen' || perm === 'pointerLock'));
    createWindow();
    if (SMOKE) setTimeout(async () => {
      // the smoke test: is the title up? (a screenshot too, when LIMBO_SMOKE_SHOT names a file)
      let r = 'no window';
      try {
        r = await win.webContents.executeJavaScript(`JSON.stringify({ title: !!document.querySelector('.ft-menu, .tt4-gear, .nx-over'), desktop: document.documentElement.classList.contains('desktop'), err: (window.__bootErr || '') })`);
        if (process.env.LIMBO_SMOKE_SHOT) { const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.LIMBO_SMOKE_SHOT, img.toPNG()); }
      } catch (e) { r = 'error ' + e; }
      log('info', `smoke: ${r}`);
      process.stdout.write(`SMOKE ${r}\n`);
      quitting = true; app.quit();
    }, Number(process.env.LIMBO_SMOKE_MS || 25000));
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; });
}
