// Crash and error logger. Uncaught errors, unhandled promise rejections and console.error / console.warn
// lines go to a small ring buffer; on desktop they are also appended to <user data>/logs/limbo-<date>.log by
// the wrapper (the main process logs its own crashes and a lost renderer there too). In a browser the last
// lines are kept in localStorage ('noclip.errlog') so a player can copy them into a bug report.
// Release builds also quieten console.log / console.debug (dev spam); warnings and errors still reach the log.
import { desktopLog, isDesktop } from './desktop';

const RING: string[] = [];
const MAX = 200;
let quiet = false;

function fmt(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? '\n' + a.stack.split('\n').slice(1, 8).join('\n') : ''}`;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a)?.slice(0, 600) ?? String(a); } catch { return String(a); }
}
function note(level: string, parts: unknown[]) {
  const line = `${new Date().toISOString()} [${level}] ${parts.map(fmt).join(' ')}`.slice(0, 4000);
  RING.push(line); if (RING.length > MAX) RING.shift();
  if (isDesktop()) desktopLog(level, line);
  else if (level === 'error' || level === 'crash') {
    try { const old = JSON.parse(localStorage.getItem('noclip.errlog') || '[]') as string[]; localStorage.setItem('noclip.errlog', JSON.stringify([...old, line].slice(-40))); } catch { /* storage blocked */ }
  }
}
/** the recent log lines (newest last) */
export function recentLog(): string[] { return [...RING]; }

let installed = false;
export function installErrorLog() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => { if (!quiet) note('crash', [e.error ?? e.message, `${e.filename ?? ''}:${e.lineno ?? 0}`]); });
  window.addEventListener('unhandledrejection', (e) => note('crash', ['unhandled rejection', (e as PromiseRejectionEvent).reason]));
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  for (const level of ['error', 'warn'] as const) {
    const orig = c[level].bind(console);
    c[level] = (...a: unknown[]) => { note(level, a); orig(...a); };
  }
  // release builds: no console chatter (dev builds keep it; ?debug keeps it in a release too)
  if (!import.meta.env.DEV && !/[?&]debug\b/.test(location.search)) {
    c.log = () => {}; c.debug = () => {}; c.info = () => {};
  }
  note('info', [`start ${isDesktop() ? 'desktop' : 'browser'} ${navigator.userAgent}`]);
}
export function setLogQuiet(v: boolean) { quiet = v; }
