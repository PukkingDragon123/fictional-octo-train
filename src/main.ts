import { registerContent } from './content/index';

const params = new URLSearchParams(location.search);
registerContent();

const gallery = params.get('gallery');
if (gallery) {
  import('./dev/gallery').then((m) => m.runGallery(gallery, params));
} else {
  import('./dev/sandbox').then((m) => m.runSandbox(params));
}
