import './ui/fonts.css';
import { registerContent } from './content/index';
import { bootLoader, loaderStage } from './ui/loading';

const params = new URLSearchParams(location.search);
// the painted loading screen goes up first (src/ui/loading.ts)
if (!params.get('gallery') && !params.has('sandbox')) { try { bootLoader(params.has('quick') ? 'Waking the unit' : 'Warming the terminal'); } catch (e) { console.warn('loader', e); } }
registerContent();
loaderStage(0.18, 'Filing the inhabitants');

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
  loaderStage(0.3, 'Loading the level');
  import('./game/session').then((m) => { loaderStage(0.62, 'Building the backrooms'); setTimeout(() => m.startSolo({ name: 'Survivor', seed: Number(params.get('seed') || 1337) }), 30); });
} else {
  loaderStage(0.3, 'Loading the institute');
  import('./game/launch').then(async (L) => {
    loaderStage(0.55, 'Opening the files');
    const cfg = L.takeLaunch();
    if (cfg) { L.launch(cfg); return; }
    // the first time (or ?prologue): straight into the first run (the link, the intake cinematic, the wake in Level 0: src/game/prologue)
    const P = await import('./game/prologue');
    if (P.prologueWanted()) { await P.runPrologue(); return; }
    await import('./ui/menus/title').then((m) => m.showTitle());
    // the way back into it, while the title's menu is up
    try { P.prologueEntry(); } catch (e) { console.warn('prologue entry', e); }
    // the loop's next step (the lab, or a new unit), in the corner of the booth
    import('./game/loop/nextStep').then((m) => m.nextStepHint()).catch((e) => console.warn('next step', e));
  });
}
