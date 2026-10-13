import { registerContent } from './content/index';

const params = new URLSearchParams(location.search);
registerContent();

const gallery = params.get('gallery');
if (gallery) {
  import('./dev/gallery').then((m) => m.runGallery(gallery, params));
} else if (params.has('sandbox')) {
  import('./dev/sandbox').then((m) => m.runSandbox(params));
} else if (params.has('quick')) {
  // dev: straight into a fresh world
  import('./game/session').then((m) => m.startSolo({ name: 'Survivor', seed: Number(params.get('seed') || 1337) }));
} else {
  import('./game/launch').then((L) => {
    const cfg = L.takeLaunch();
    if (cfg) L.launch(cfg);
    else import('./ui/menus/title').then((m) => m.showTitle());
  });
}
