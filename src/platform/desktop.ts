// The desktop build's bridge (desktop/preload.cjs exposes window.limboDesktop when the game runs in the
// Electron wrapper; in a browser every call here is a quiet no-op and the game behaves as before).
//
//   isDesktop()                  inside the wrapper
//   desktopQuit()                save everything, then close the program
//   displayGet() / displaySet()  window mode, size, vsync (src/ui/menus/display.ts)
//   steamAchieve(api)            unlock a Steam achievement (src/platform/steam.ts keeps the local record)
//
// Saves: every localStorage write is mirrored to <user data>/saves/storage.json through the wrapper
// (the preload loads that file back into localStorage before the page starts, so the file wins, and Steam
// Cloud syncs that folder). localStorage stays the working copy and the browser fallback.

export interface DisplayCfg { mode: 'windowed' | 'borderless' | 'fullscreen'; width: number; height: number; vsync: boolean }
export interface DisplayInfo extends DisplayCfg { sizes: [number, number][]; pending?: boolean; restartFor?: string[] }
export interface SteamStatus { on: boolean; appId: number; name?: string; deck?: boolean; why?: string }
interface Bridge {
  version: string;
  platform: string;
  userData: string;
  storeSave(json: string): void;
  storeSaveSync(json: string): void;
  log(level: string, text: string): void;
  quit(): void;
  displayGet(): Promise<DisplayInfo>;
  displaySet(cfg: Partial<DisplayCfg>, opts: { reload?: boolean }): Promise<DisplayInfo>;
  steamStatus(): Promise<SteamStatus>;
  steamAchieve(api: string): Promise<boolean>;
  steamSync(apis: string[]): Promise<number>;
  openExternal(url: string): void;
  onWillQuit(fn: () => void): void;
  onOverlay(fn: (on: boolean) => void): void;
}

const bridge: Bridge | null = (typeof window !== 'undefined' && (window as unknown as { limboDesktop?: Bridge }).limboDesktop) || null;
export function isDesktop(): boolean { return !!bridge; }
export function desktopBridge(): Bridge | null { return bridge; }

// ---------------------------------------------------------------- storage mirror
/** the unpatched setItem (the mirror's own stamp must not schedule another write) */
let rawSet: ((this: Storage, k: string, v: string) => void) | null = null;
function snapshot(): string {
  const at = Date.now();
  // the stamp lets the preload tell which copy is newer at the next start (the file, or this browser storage)
  try { rawSet?.call(localStorage, '__lp_at', String(at)); } catch { /* storage blocked */ }
  const o: Record<string, string> = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k != null) o[k] = localStorage.getItem(k) ?? ''; } } catch { /* storage blocked */ }
  return JSON.stringify({ v: 1, at, data: o });
}
let flushT = 0;
let dirty = false;
function scheduleFlush() {
  dirty = true;
  if (flushT) return;
  flushT = window.setTimeout(() => { flushT = 0; flushNow(false); }, 600);
}
/** write the mirror now (sync on quit / unload so nothing is lost) */
export function flushNow(sync = true) {
  if (!bridge || !dirty) return;
  dirty = false;
  if (flushT) { clearTimeout(flushT); flushT = 0; }
  try { if (sync) bridge.storeSaveSync(snapshot()); else bridge.storeSave(snapshot()); } catch (e) { dirty = true; console.warn('save mirror', e); }
}

function installMirror() {
  if (!bridge) return;
  const P = Storage.prototype;
  const set = P.setItem, rem = P.removeItem, clr = P.clear;
  rawSet = set;
  const isLocal = (s: Storage) => { try { return s === window.localStorage; } catch { return false; } };
  P.setItem = function (this: Storage, k: string, v: string) { set.call(this, k, v); if (isLocal(this)) scheduleFlush(); };
  P.removeItem = function (this: Storage, k: string) { rem.call(this, k); if (isLocal(this)) scheduleFlush(); };
  P.clear = function (this: Storage) { clr.call(this); if (isLocal(this)) scheduleFlush(); };
  window.addEventListener('pagehide', () => flushNow(true));
  window.addEventListener('beforeunload', () => flushNow(true));
  bridge.onWillQuit(() => { dirty = true; flushNow(true); bridge.quit(); });
  // the first launch after an update (or with no file yet): write the file once
  dirty = true; scheduleFlush();
}

// ---------------------------------------------------------------- calls
export function desktopQuit() {
  if (!bridge) { try { window.close(); } catch { /* a browser tab */ } return; }
  dirty = true; flushNow(true);
  bridge.quit();
}
export async function displayGet(): Promise<DisplayInfo | null> { try { return bridge ? await bridge.displayGet() : null; } catch { return null; } }
export async function displaySet(cfg: Partial<DisplayCfg>, reload = false): Promise<DisplayInfo | null> { try { return bridge ? await bridge.displaySet(cfg, { reload }) : null; } catch { return null; } }
export async function steamStatus(): Promise<SteamStatus> { try { return bridge ? await bridge.steamStatus() : { on: false, appId: 0, why: 'browser' }; } catch { return { on: false, appId: 0, why: 'error' }; } }
export async function steamAchieve(api: string): Promise<boolean> { try { return bridge ? await bridge.steamAchieve(api) : false; } catch { return false; } }
export async function steamSync(apis: string[]): Promise<number> { try { return bridge ? await bridge.steamSync(apis) : 0; } catch { return 0; } }
export function desktopLog(level: string, text: string) { try { bridge?.log(level, text); } catch { /* ignore */ } }
/** links leave the game window: the OS browser on desktop, a new tab in a browser */
export function openLink(url: string) {
  if (bridge) { bridge.openExternal(url); return; }
  try { window.open(url, '_blank', 'noopener'); } catch { /* blocked */ }
}

/** browser fullscreen (the desktop wrapper uses its own window modes) */
export function browserFullscreen(on?: boolean): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element };
  const cur = !!(d.fullscreenElement || d.webkitFullscreenElement);
  const want = on ?? !cur;
  try { if (want && !cur) void document.documentElement.requestFullscreen?.(); else if (!want && cur) void document.exitFullscreen?.(); } catch { /* not allowed */ }
  return want;
}

if (bridge) {
  installMirror();
  document.documentElement.classList.add('desktop');
}
