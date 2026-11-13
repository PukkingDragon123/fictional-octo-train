// Dr. Calder's lines in the lab menus, as a film subtitle: low and centred at the bottom of the
// picture, her name over the words, the words typed in on her clock (no speech bubbles anywhere).
// The guide (./guide.ts) starts every line through Guide.start(); this only shows it. The API is
// what the guide drives: say() returns a handle (done / typed / close), skip() finishes the typing
// on a click, `talking` drives her mouth while the letters come.
export type Style = 'say' | 'think' | 'shout';

interface Cur { text: string; style: Style; t: number; reveal: number; life: number; shown: number; closing: number; dead: boolean; onChar?: (ch: string) => void; at: number[] }

export class SubLine {
  readonly layer = document.createElement('div');
  private name = document.createElement('b');
  private body = document.createElement('span');
  private cur: Cur | null = null;
  constructor(parent: HTMLElement = document.body, who = 'Dr. Iris Calder') {
    this.layer.className = 'gd-sub';
    this.layer.setAttribute('aria-live', 'polite');
    this.name.textContent = who;
    this.layer.append(this.name, this.body);
    parent.append(this.layer);
  }
  say(text: string, o: { dur?: number; style?: Style; onChar?: (ch: string) => void; cps?: number } = {}) {
    const style = o.style ?? 'say';
    const cps = o.cps ?? (style === 'shout' ? 40 : 34);
    // the typing clock: a beat after sentences, a breath after commas
    const at: number[] = [];
    let t = 0.1;
    for (let i = 0; i < text.length; i++) {
      at.push(t);
      const ch = text[i], next = text[i + 1];
      t += 1 / cps;
      if (next && /[.!?]/.test(ch) && !/[.!?]/.test(next)) t += 0.22;
      else if (next && /[,;:]/.test(ch)) t += 0.1;
    }
    const c: Cur = { text, style, t: 0, reveal: t, life: Math.max(o.dur ?? 1.8 + text.length * 0.06, t + 1.4), shown: 0, closing: -1, dead: false, onChar: o.onChar, at };
    if (this.cur) this.cur.dead = true;
    this.cur = c;
    this.layer.className = 'gd-sub on s-' + style;
    this.body.textContent = '';
    return { close: () => this.close(c), get done() { return c.dead; }, get typed() { return c.t >= c.reveal; } };
  }
  /** still typing (her mouth moves) */
  get talking() { const c = this.cur; return !!c && !c.dead && c.closing < 0 && c.t < c.reveal + 0.05; }
  get open() { return !!this.cur && !this.cur.dead; }
  clear() { if (this.cur) this.close(this.cur); }
  /** a click: the whole line at once */
  skip() { const c = this.cur; if (c && c.closing < 0 && c.t < c.reveal) { c.t = c.reveal; c.life = Math.max(c.life, c.reveal + 1.2); } }
  private close(c: Cur) { if (c.closing < 0 && !c.dead) c.closing = 0; }

  update(dt: number) {
    const c = this.cur;
    if (!c) return;
    if (c.dead) { if (this.cur === c) { this.cur = null; this.layer.classList.remove('on'); } return; }
    c.t += dt;
    let n = c.shown;
    while (n < c.text.length && c.at[n] <= c.t) { c.onChar?.(c.text[n]); n++; }
    if (n !== c.shown) { c.shown = n; this.body.textContent = c.text.slice(0, n); }
    if (c.closing < 0 && c.t > c.life) c.closing = 0;
    if (c.closing >= 0) {
      if (c.closing === 0) this.layer.classList.remove('on');
      c.closing += dt;
      if (c.closing > 0.3) { c.dead = true; this.cur = null; }
    }
  }
  dispose() { this.layer.remove(); this.cur = null; }
}
