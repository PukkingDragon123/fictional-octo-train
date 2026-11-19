// WHICH APPS THE BAND HAS (round 19): on a first run the wrist terminal starts with ONE app (Tasks); the others are
// installed as the run goes (src/game/tutorial/firstRun.ts installs the Scanner and the Map; the first deposit brings
// Status, the first scan the Codex, the first paper read Mail), each with the install cinematic (./install.ts).
// Kept in the run's mission flags: 'apps:limit' marks a limited band, 'app:<key>' an installed app. A save without the
// limit (every older save, the lab between runs, scripted test runs) has every app.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { playInstall } from './install';
import type { IconKind } from '../machine/decor';

type Flags = { flags?: Set<string> };
const flags = () => (G as unknown as { missions?: Flags }).missions?.flags;

/** is this app on the band */
export function appInstalled(key: string): boolean {
  const f = flags();
  if (!f || !f.has('apps:limit')) return true;
  return f.has('app:' + key);
}
/** a first run: the band keeps only these apps for now */
export function limitApps(keys: string[]) {
  const f = flags();
  if (!f) return;
  f.add('apps:limit');
  for (const k of keys) f.add('app:' + k);
  bus.emit('bandApps');
}
const META: Record<string, { title: string; icon: IconKind; gives: string }> = {
  scanner: { title: 'Suit scanner', icon: 'eye', gives: 'hold Q: sweep, scan, find signals' },
  map: { title: 'Map', icon: 'map', gives: 'the survey plotter on the band' },
  status: { title: 'Status', icon: 'eye', gives: 'the unit, the debt, the crew' },
  codex: { title: 'Codex', icon: 'clipboard', gives: 'everything you scan, on file' },
  mail: { title: 'Mail', icon: 'radio', gives: 'my lines and the papers you read' },
  settings: { title: 'Settings', icon: 'wrench', gives: 'sound, picture, keys' },
  term: { title: 'Terminal', icon: 'radio', gives: 'the band\'s radio shell' },
  tasks: { title: 'Tasks', icon: 'clipboard', gives: 'the work in hand' },
};
/** install an app (with the install cinematic unless quiet); resolves when the cinematic is done */
export function installApp(key: string, quiet = false): Promise<void> {
  const f = flags();
  if (!f || !f.has('apps:limit') || f.has('app:' + key)) return Promise.resolve();
  f.add('app:' + key);
  bus.emit('bandApps');
  const m = META[key];
  if (quiet || !m) return Promise.resolve();
  return new Promise((res) => playInstall({ title: m.title, icon: m.icon, gives: m.gives, key: 'app:' + key, onDone: () => res() }));
}

// progress installs the rest (each once, with its install moment)
let hooked = false;
export function hookAppInstalls() {
  if (hooked) return;
  hooked = true;
  bus.on('deposited', () => void installApp('status'));
  bus.on('scanEntry', () => void installApp('codex'));
  bus.on('read', () => void installApp('mail'));
}
