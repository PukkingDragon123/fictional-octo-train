// The bridge between the game page and the desktop wrapper (window.limboDesktop, read by src/platform/desktop.ts).
// Before the page's own scripts run it loads the save mirror (<user data>/saves/storage.json) back into
// localStorage when the file is the newer copy (another PC through Steam Cloud, a cleared browser cache).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

try {
  const file = ipcRenderer.sendSync('store:load');
  const localAt = Number(localStorage.getItem('__lp_at') || 0);
  if (file && file.data && typeof file.data === 'object' && (Number(file.at) || 0) >= localAt) {
    const keep = new Set(Object.keys(file.data));
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && !keep.has(k)) localStorage.removeItem(k); }
    for (const [k, v] of Object.entries(file.data)) localStorage.setItem(k, String(v));
    localStorage.setItem('__lp_at', String(file.at || 0));
  }
} catch (e) { ipcRenderer.send('log', 'error', 'save mirror load: ' + e); }

const willQuit = [];
ipcRenderer.on('app:willQuit', () => { if (willQuit.length) for (const f of willQuit) { try { f(); } catch { /* ignore */ } } else ipcRenderer.send('app:quit'); });
const overlay = [];
ipcRenderer.on('steam:overlay', (_e, on) => { for (const f of overlay) { try { f(!!on); } catch { /* ignore */ } } });

contextBridge.exposeInMainWorld('limboDesktop', {
  version: '1',
  platform: process.platform,
  userData: '',
  storeSave: (json) => ipcRenderer.send('store:save', String(json)),
  storeSaveSync: (json) => ipcRenderer.sendSync('store:saveSync', String(json)),
  log: (level, text) => ipcRenderer.send('log', String(level), String(text).slice(0, 8000)),
  quit: () => ipcRenderer.send('app:quit'),
  displayGet: () => ipcRenderer.invoke('display:get'),
  displaySet: (cfg, opts) => ipcRenderer.invoke('display:set', cfg, opts),
  steamStatus: () => ipcRenderer.invoke('steam:status'),
  steamAchieve: (api) => ipcRenderer.invoke('steam:achieve', String(api)),
  steamSync: (list) => ipcRenderer.invoke('steam:sync', Array.isArray(list) ? list.map(String) : []),
  openExternal: (url) => ipcRenderer.send('open:external', String(url)),
  onWillQuit: (fn) => { if (typeof fn === 'function') willQuit.push(fn); },
  onOverlay: (fn) => { if (typeof fn === 'function') overlay.push(fn); },
});
