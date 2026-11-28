// THE TITLE'S FRONT (round 26): what floats over the hall (front/hall.ts). The crest comes up out of the dark,
// then LIMBO PHOBIA resolves letter by letter in Alagard (bone white, cut in relief, a phosphor fringe and fine
// scan lines, a slow light passing over it), the sky flashes as the last letter lands, the logo lifts away (no logo
// on the menu screen: it is a boot reveal only) and the four choices drift in over the hall: plain floating words, slightly raised, no icons and no frames. Hover or arrow onto one and it
// leans out of the line and warms, with a relay tick. A film layer (grain, vignette, thin letterbox) sits over
// the whole screen. Any key or click skips the reveal. QUIT on the web fades the wing out to the crest alone.
//   const f = new FrontEnd(root, { strike })
//   f.setItems([{ key, label, act }])   f.reveal(quick)   f.leave() -> Promise   f.back()   f.powerDown()
import { emblemCanvas } from '../../brand/logo';
import { sfx, sample } from '../sfx';
import { calm } from '../settings';
import './front.css';

export interface FrontItem { key: string; label: string; act: () => void }

export class FrontEnd {
  readonly el = document.createElement('div');
  readonly menu = document.createElement('nav');
  private logo = document.createElement('div');
  private film = document.createElement('canvas');
  private bars = document.createElement('div');
  private off = document.createElement('div');
  private raf = 0;
  private shown = false;
  private revealT: number[] = [];
  private ptx = 0; private pty = 0; private px = 0; private py = 0;
  constructor(parent: HTMLElement, private o: { strike?: (k: number) => void } = {}) {
    this.el.className = 'fr';
    this.menu.className = 'fr-menu';
    this.logo.className = 'fr-logo';
    const crest = emblemCanvas(64);
    const cv = document.createElement('canvas');
    cv.width = crest.width; cv.height = crest.height;
    cv.getContext('2d')!.drawImage(crest, 0, 0);
    cv.className = 'fr-crest';
    const word = (t: string, cls: string) => {
      const w = document.createElement('div');
      w.className = 'fr-word ' + cls;
      w.dataset.t = t;
      [...t].forEach((ch, i) => { const s = document.createElement('span'); s.textContent = ch; s.style.setProperty('--i', String(i + (cls === 'b' ? 5 : 0))); w.append(s); });
      return w;
    };
    const title = document.createElement('div');
    title.className = 'fr-title';
    title.setAttribute('aria-label', 'Limbo Phobia');
    title.append(word('LIMBO', 'a'), word('PHOBIA', 'b'));
    const rule = document.createElement('i');
    rule.className = 'fr-rule';
    title.append(rule);
    this.logo.append(cv, title);
    this.film.className = 'fr-film';
    this.film.width = 480; this.film.height = 270;
    this.bars.className = 'fr-bars';
    this.bars.innerHTML = '<i></i><i></i>';
    this.off.className = 'fr-off';
    const oc = emblemCanvas(64);
    oc.className = 'fr-crest';
    this.off.append(oc);
    this.el.append(this.logo, this.menu, this.film, this.bars, this.off);
    parent.append(this.el);
    this.grain();
    // parallax: the logo and each word sit at their own depth over the hall and drift against it with the pointer
    window.addEventListener('pointermove', (e) => { this.ptx = (e.clientX / innerWidth) * 2 - 1; this.pty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  }

  setItems(items: FrontItem[]) {
    this.menu.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fr-item';
      b.dataset.k = it.key;
      b.style.setProperty('--n', String(i));
      b.innerHTML = `<span class="fr-p"><span class="fr-t" data-t="${it.label}">${it.label}</span></span>`;
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) b.focus({ preventScroll: true }); });
      b.addEventListener('focus', () => { if (this.shown) { sfx('tick', 0.5); } });
      b.addEventListener('click', () => {
        if (this.el.classList.contains('picked')) return;
        sfx('confirm', 0.8);
        b.classList.add('hit');
        it.act();
      });
      this.menu.append(b);
    });
  }
  focusFirst() { requestAnimationFrame(() => (this.menu.querySelector('.fr-item') as HTMLElement | null)?.focus({ preventScroll: true })); }

  /** the logo's reveal, then the choices (quick: all at once) */
  reveal(quick = false) {
    for (const t of this.revealT) clearTimeout(t);
    this.revealT = [];
    this.el.classList.remove('gone', 'picked', 'dark');
    this.el.classList.add('on');
    if (quick || calm()) { this.el.classList.add('crest', 'lit', 'menu', 'quick'); this.shown = true; this.focusFirst(); return; }
    this.el.classList.remove('crest', 'lit', 'menu', 'quick');
    const at = (ms: number, f: () => void) => this.revealT.push(window.setTimeout(f, ms));
    at(900, () => { this.el.classList.add('crest'); sample('sting_low', 0.5); });
    at(2600, () => { this.el.classList.add('lit'); });
    at(4300, () => { this.o.strike?.(1); sample('dread_hit', 0.4); this.el.classList.add('flash'); });
    at(4700, () => this.el.classList.remove('flash'));
    at(6000, () => { this.el.classList.add('menu'); this.shown = true; this.focusFirst(); });
    // a key or a click skips to the end
    const skip = (e: Event) => {
      if (this.el.classList.contains('menu')) return;
      e.preventDefault(); e.stopPropagation();
      window.removeEventListener('keydown', skip, true); window.removeEventListener('pointerdown', skip, true);
      this.reveal(true);
    };
    window.addEventListener('keydown', skip, true);
    window.addEventListener('pointerdown', skip, true);
    at(6100, () => { window.removeEventListener('keydown', skip, true); window.removeEventListener('pointerdown', skip, true); });
  }
  /** the words and the logo go (a choice was made); resolves when they are out */
  leave(): Promise<void> {
    this.el.classList.add('picked');
    return new Promise((r) => setTimeout(() => { this.el.classList.add('gone'); this.el.classList.remove('on'); r(); }, calm() ? 200 : 900));
  }
  /** back on the title (from the facility, a panel): no second reveal */
  back() { this.el.classList.remove('gone', 'picked'); this.el.classList.add('on', 'crest', 'lit', 'menu', 'quick'); this.shown = true; this.focusFirst(); }
  hide() { this.el.classList.remove('on'); this.el.classList.add('gone'); }
  /** QUIT on the web: the wing fades out to the crest alone; any key or click brings it back */
  powerDown(onWake: () => void) {
    this.el.classList.add('dark');
    sample('tape_stop', 0.5);
    const wake = (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      window.removeEventListener('keydown', wake, true); window.removeEventListener('pointerdown', wake, true);
      this.el.classList.remove('dark');
      sfx('hum', 0.4);
      onWake();
      setTimeout(() => this.focusFirst(), 600);
    };
    setTimeout(() => { window.addEventListener('keydown', wake, true); window.addEventListener('pointerdown', wake, true); }, 1200);
  }
  /** film grain: a tiny noise frame redrawn at 24 fps, blown up and laid over the picture */
  private grain() {
    const c = this.film.getContext('2d')!;
    const id = c.createImageData(this.film.width, this.film.height);
    let last = 0;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      if (!this.el.isConnected || !this.el.classList.contains('on')) return;
      // the parallax eases toward the pointer (and breathes a little on its own)
      const t = now / 1000;
      this.px += (this.ptx + Math.sin(t * 0.21) * 0.15 - this.px) * 0.06; this.py += (this.pty + Math.sin(t * 0.17) * 0.1 - this.py) * 0.06;
      this.el.style.setProperty('--px', this.px.toFixed(4)); this.el.style.setProperty('--py', this.py.toFixed(4));
      if (now - last < 42) return;
      last = now;
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      c.putImageData(id, 0, 0);
    };
    this.raf = requestAnimationFrame(tick);
  }
  dispose() { cancelAnimationFrame(this.raf); this.el.remove(); }
}
