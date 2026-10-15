// Title boot sequence: the security desk's monitor warming up and a tape
// going into the deck, over the attract-mode world. Full POST on the first visit of a session, a short
// flicker after that. Any key, click or tap skips it.
import { h, esc } from './common';
import { sfx } from './sfx';
import { calm } from './settings';
import { logoCanvas } from '../pixelart';
import { toUrl } from '../pixelkit';

const LINES: [string, number][] = [
  ['MERIDIAN INSTITUTE  //  SECURITY DESK B  //  M-14 MONITOR', 0],
  ['PROPERTY OF THE REMITTANCE OFFICE. DO NOT REMOVE TAPES.', 0],
  ['', 0],
  ['TAPE 07 ............. {ok:INSERTED}', 1],
  ['TRACKING ............ {ok:AUTO}', 1],
  ['CAM 03 PROCESSING ... {ok:SIGNAL}', 1],
  ['DEBTORS ON FILE ..... 4,294,967,295 {hi:(AND COUNTING)}', 1],
  ['CAM 09 THE SEAM ..... {bad:[ NO SIGNAL ]}', 2],
  ['CAM 09 THE SEAM ..... {bad:[ SOMETHING IS IN FRONT OF THE LENS ]}', 2],
  ['{hi:>> REWINDING}', 1],
  ['', 0],
  ['PLAY ▶  SP', 0],
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
    const logo = h('div', 't-boot-logo');
    {
      const pc = logoCanvas();
      const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pxn')) || 2;
      const k = Math.max(px, Math.min(px * 2, Math.floor((window.innerWidth * 0.8) / pc.w)));
      const img = new Image(); img.src = toUrl(pc); img.alt = 'NOCLIP'; img.style.width = pc.w * k + 'px'; img.style.height = pc.h * k + 'px';
      logo.append(img);
    }
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
      pre.innerHTML = html + `[${'<i class="pb on"></i>'.repeat(k)}${'<i class="pb"></i>'.repeat(n - k)}] ${String(Math.round(p * 100)).padStart(3, ' ')}%` + cursor;
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
