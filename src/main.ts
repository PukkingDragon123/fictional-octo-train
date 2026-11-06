import './ui/fonts.css';
import { registerContent } from './content/index';

const params = new URLSearchParams(location.search);
registerContent();

const gallery = params.get('gallery');
if (gallery) {
  import('./dev/gallery').then((m) => m.runGallery(gallery, params));
} else if (import.meta.env.DEV && params.has('surgery')) {
  // dev: straight onto the operating table
  Promise.all([import('./ui/surgery/surgery'), import('./entities/humanRig'), import('./entities/humanLooks')]).then(([S, R, L]) => {
    const app = { ...R.randomAppearance(Math.random), ...L.randomLooks(Math.random, Math.random() < 0.5) };
    S.startSurgery(app as any, (r) => console.log('surgery done', r), { name: 'UNIT 7719' });
  });
} else if (params.has('sandbox')) {
  import('./dev/sandbox').then((m) => m.runSandbox(params));
} else if (params.has('quick')) {
  // dev: straight into a fresh world
  import('./game/session').then((m) => m.startSolo({ name: 'Survivor', seed: Number(params.get('seed') || 1337) }));
} else {
  import('./game/launch').then(async (L) => {
    const cfg = L.takeLaunch();
    if (cfg) { L.launch(cfg); return; }
    // the first time (or ?prologue): the operator meets Dr. Calder before the menu (src/game/prologue)
    const P = await import('./game/prologue');
    if (P.prologueWanted()) { await P.runPrologue(); return; }
    await import('./ui/menus/title').then((m) => m.showTitle());
    // the way back into it, while the title's menu is up
    try { P.prologueEntry(); } catch (e) { console.warn('prologue entry', e); }
  });
}
