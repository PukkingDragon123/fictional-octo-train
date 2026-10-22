// Title boot sequence: the subject room's terminal coming up before the
// lights go down, on the same olive phosphor terminal as every other panel.
// Full POST on the first visit of a session, a short flicker after that. Any
// key, click or tap skips it. (No game name here: the room speaks for itself.)
import { h, esc } from './common';
import { sfx } from './sfx';
import { calm } from './settings';
import { terminal } from './terminal';
import { plateBtn } from './btnKit';

const LINES: [string, number][] = [
  ['MERIDIAN INSTITUTE  //  REMITTANCE PROGRAMME  //  SUBJECT ROOM 4', 0],
  ['All subjects are temporary. All debts are not.', 0],
  ['', 0],
  ['ROOM POWER ......... {ok:LOW}', 1],
  ['CHAIR 4 ............ {ok:OCCUPIED}', 1],
  ['ARMS A-D ........... {ok:STOWED}', 1],
  ['PRESS .............. {ok:ARMED}', 1],
  ['SUBJECTS ON FILE ... 4,294,967,295 {hi:(and counting)}', 1],
  ['HATCH 2 ............ {bad:NO SIGNAL}', 2],
  ['HATCH 2 ............ {bad:SOMETHING IS BEHIND IT}', 2],
  ['{hi:>> dimming the lights}', 1],
];

function fmt(s: string) {
  return esc(s).replace(/\{(ok|bad|hi):([^}]*)\}/g, (_, c, t) => `<span class="${c}">${t}</span>`);
}
const plain = (s: string) => s.replace(/\{(ok|bad|hi):([^}]*)\}/g, '$2');

export function runBoot(): Promise<void> {
  let first = true;
  try { first = !sessionStorage.getItem('noclip.booted'); sessionStorage.setItem('noclip.booted', '1'); } catch { /* storage blocked */ }
  return new Promise((resolve) => {
    const el = h('div', 'bt3');
    const t = terminal({ cls: 'bt3-term', model: 'Meridian · Room 4', powerOn: !calm() });
    const pre = h('pre', 'bt3-pre');
    const wake = h('div', 'bt3-wake', 'Wake up<span class="ct-cursor"></span>');
    t.body.append(pre, wake);
    let done = false;
    const skipBtn = plateBtn('Skip', () => finish(true), { finish: 'cream', size: 'md', lamp: false, sound: '' });
    t.keys.append(skipBtn);
    el.append(t.el);
    document.body.append(el);
    const finish = (quick = false) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', skip, true);
      el.removeEventListener('pointerdown', skipP);
      sfx('boot');
      el.classList.add(quick || calm() ? 'out-quick' : 'out');
      setTimeout(() => el.remove(), 460);
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
      // short: the tube comes up, wake up, out
      wake.classList.add('on');
      setTimeout(() => finish(), calm() ? 500 : 1000);
      return;
    }
    let html = '';
    let li = 0;
    const cursor = '<span class="ct-cursor"></span>';
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
      pre.innerHTML = html + `<span class="bt3-bar">${'▮'.repeat(k)}<span class="off">${'▮'.repeat(n - k)}</span></span>  ${String(Math.round(p * 100)).padStart(3, ' ')}%` + cursor;
      if (k % 3 === 0) sfx('tick', 0.6);
      if (p < 1) setTimeout(() => progress(Math.min(1, p + 0.045 + Math.random() * 0.06)), 45);
      else {
        setTimeout(() => {
          if (done) return;
          pre.classList.add('dim');
          wake.classList.add('on');
          sfx('confirm');
          setTimeout(() => finish(), 1150);
        }, 200);
      }
    };
    setTimeout(nextLine, 250);
  });
}
