// Title boot sequence: a Meridian continuity terminal powering up over the
// attract-mode world. Full POST on the first visit of a session, a short
// flicker after that. Any key, click or tap skips it.
import { h, esc } from './common';
import { sfx } from './sfx';
import { calm } from './settings';

const LINES: [string, number][] = [
  ['MERIDIAN INSTITUTE  //  CONTINUITY TERMINAL  MK-IV', 0],
  ['(C) 1987 MERIDIAN INSTITUTE. PROPERTY OF THE FIELD OFFICE.', 0],
  ['', 0],
  ['CORE MEMORY ......... 655360 WORDS {ok:OK}', 1],
  ['PHOSPHOR ............ {ok:WARM}', 1],
  ['SEER LINK ........... {ok:ESTABLISHED}', 1],
  ['ROOM BUFFER ......... 4,294,967,295 ROOMS {hi:(AND COUNTING)}', 1],
  ['REALITY ANCHOR ...... {bad:[ FAILED ]}', 2],
  ['RETRY ............... {bad:[ FAILED ]}', 2],
  ['{hi:>> PROCEEDING WITHOUT AN EXIT}', 1],
  ['', 0],
  ['MOUNTING CONTINUITY.SIM', 0],
];

function fmt(s: string) {
  return esc(s).replace(/\{(ok|bad|hi):([^}]*)\}/g, (_, c, t) => `<span class="${c}">${t}</span>`);
}
const plain = (s: string) => s.replace(/\{(ok|bad|hi):([^}]*)\}/g, '$2');

export function runBoot(): Promise<void> {
  let first = true;
  try { first = !sessionStorage.getItem('noclip.booted'); sessionStorage.setItem('noclip.booted', '1'); } catch { /* storage blocked */ }
  return new Promise((resolve) => {
    const el = h('div', 't-boot');
    const scr = h('div', 't-boot-scr');
    const pre = h('pre');
    const logo = h('div', 't-boot-logo', 'NOCLIP');
    scr.append(pre, logo, h('div', 'crt-fx'));
    el.append(scr, h('div', 't-boot-skip', 'press any key'));
    document.body.append(el);
    let done = false;
    const finish = (quick = false) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', skip, true);
      el.removeEventListener('pointerdown', skipP);
      sfx('boot');
      el.classList.add(quick || calm() ? 'out-quick' : 'out');
      setTimeout(() => el.remove(), 420);
      resolve();
    };
    const skip = (e: KeyboardEvent) => {
      e.stopPropagation(); e.preventDefault();
      // the release of the skipping key must not also press the menu button that gets focus next
      const code = e.code;
      const eat = (u: KeyboardEvent) => { if (u.code !== code) return; u.stopPropagation(); u.preventDefault(); window.removeEventListener('keyup', eat, true); };
      window.addEventListener('keyup', eat, true);
      setTimeout(() => window.removeEventListener('keyup', eat, true), 1500);
      finish(true);
    };
    const skipP = () => finish(true);
    window.addEventListener('keydown', skip, true);
    el.addEventListener('pointerdown', skipP);

    if (!first || calm()) {
      // short: logo flash and out
      logo.classList.add('on');
      setTimeout(() => finish(), calm() ? 500 : 900);
      return;
    }
    let html = '';
    let li = 0;
    const cursor = '<span class="cur"></span>';
    const nextLine = () => {
      if (done) return;
      if (li >= LINES.length) { progress(0); return; }
      const [raw, pause] = LINES[li++];
      const text = plain(raw);
      let i = 0;
      const typeTick = () => {
        if (done) return;
        i = Math.min(text.length, i + 3);
        pre.innerHTML = html + esc(text.slice(0, i)) + cursor;
        if (i % 6 === 0) sfx('type', 0.4);
        if (i < text.length) setTimeout(typeTick, 12);
        else { html += fmt(raw) + '\n'; pre.innerHTML = html + cursor; if (pause === 2) sfx('error', 0.35); setTimeout(nextLine, 60 + pause * 170); }
      };
      typeTick();
    };
    const progress = (p: number) => {
      if (done) return;
      const n = 24;
      const k = Math.round(p * n);
      pre.innerHTML = html + `[${'█'.repeat(k)}${'·'.repeat(n - k)}] ${String(Math.round(p * 100)).padStart(3, ' ')}%` + cursor;
      if (k % 3 === 0) sfx('tick', 0.6);
      if (p < 1) setTimeout(() => progress(Math.min(1, p + 0.045 + Math.random() * 0.06)), 45);
      else {
        setTimeout(() => {
          if (done) return;
          pre.style.opacity = '0.25';
          logo.classList.add('on');
          sfx('confirm');
          setTimeout(() => finish(), 1150);
        }, 200);
      }
    };
    setTimeout(nextLine, 250);
  });
}
