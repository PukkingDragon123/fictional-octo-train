// Every line a character speaks, as free-floating text where it comes from
// (no box: real type with a halo), with an 8-bit voice (src/social:
// chipVoice, floatText). Bus event 'subtitle'
// ({ who, text, dur?, style?, x?, y?, z?, voiced?, pid? }):
//   voss     worn typewriter letters by the sergeant
//   bailiff  the band, voiced here (cold, clipped; glitching when `leak`),
//            the words rising off the survivor's wrist
//   guard    condensed sign capitals near the officer (or off screen)
//   radio    typewriter letters over the survivor, from the radio
//   self     the survivor, out loud, in their own voice
//   pid      any other survivor by player id (co-op), in their voice
// Also the shared builders ui.ts uses for thoughts, speech and shouts: they
// all make floating text now.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { floatText } from '../../social/floatText';
import { playLine, voiceForStyle, voiceFromApp } from '../../social/chipVoice';

interface UiLike { bubbles: any[]; root: HTMLElement }
let uiRef: UiLike | null = null;

/** world position of the handler's projection, if the handler module exposes one */
function handlerPos(out: THREE.Vector3): boolean {
  const h: any = (G as any).handler;
  if (!h) return false;
  try {
    const p = h.worldPos?.() ?? h.pos ?? h.position ?? h.root?.position ?? h.group?.position ?? h.obj?.position ?? h.mesh?.position ?? h.rig?.root?.position;
    if (p && typeof p.x === 'number' && typeof p.z === 'number') {
      if (h.visible === false || h.active === false) return false;
      out.set(p.x, (typeof p.y === 'number' ? p.y : 0) + 2.15, p.z);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ------------------------------------------------------------------ builders (ui.ts)
/** a thought: soft slanted letters fading in */
export function scrawl(text: string, _cls = 'think'): HTMLDivElement { return floatText(text, { kind: 'think' }); }
/** speech: letters popping in on the voice's clock */
export function speech(text: string, _cls: string): HTMLDivElement { return floatText(text, { kind: 'say' }); }
/** shouting: big shaking letters */
export function shout(text: string): HTMLDivElement { return floatText(text, { kind: 'shout' }); }

/** a line from the radio: typed letters over the survivor, in a crackly voice */
export function radioLine(who: string, text: string, secs = 5) {
  const p = G.local;
  const el = floatText(text, { kind: 'radio', name: who || 'RADIO', life: secs });
  playLine(text, voiceForStyle('radio', who), null, { vol: 0.75 });
  G.audio?.ui?.('static_burst', 0.12);
  if (uiRef && p) {
    uiRef.root.appendChild(el);
    uiRef.bubbles.push({ el, target: p, until: G.time + secs, born: G.time, rise: 0, kind: 'radio' });
  } else offscreen(el, secs);
}

function offscreen(el: HTMLDivElement, secs: number) {
  el.classList.add('offscreen');
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, secs * 1000);
  setTimeout(() => el.remove(), secs * 1000 + 600);
}

// ------------------------------------------------------------------ the event
export function initSubtitles(ui: UiLike) {
  uiRef = ui;
  bus.on('subtitle', (s: any) => {
    if (!s || !s.text) return;
    const text = String(s.text);
    const who = String(s.who || '');
    let style: string = s.style || '';
    const speaker = s.pid ? G.players.get(String(s.pid)) : null;
    if (!style) style = speaker ? (speaker.isLocal ? 'self' : 'player') : /bailiff|band/i.test(who) ? 'bailiff' : /voss|sergeant|handler/i.test(who) ? 'voss' : /guard|officer|custody/i.test(who) ? 'guard' : who && G.local && who === G.local.name ? 'self' : 'radio';
    const secs = Number(s.dur) > 0 ? Number(s.dur) : 2.2 + text.length * 0.055;
    // a speaker position: feet (the handler) or already a head height (officers); text hangs just above the head
    let at: { x: number; y: number; z: number } | null = null;
    if (typeof s.x === 'number' && typeof s.z === 'number') {
      let ground = 0;
      try { ground = Number(G.zone?.heightAt?.(Math.floor(s.x), Math.floor(s.z))) || 0; } catch { /* no zone */ }
      const y = typeof s.y === 'number' ? s.y : ground;
      at = { x: s.x, y: y - ground > 1.2 ? y + 0.15 : y + 2.15, z: s.z };
    }
    const push = (el: HTMLDivElement, target: any, kind: string) => { ui.root.appendChild(el); ui.bubbles.push({ el, target, until: G.time + secs, born: G.time, rise: 0, kind }); };
    switch (style) {
      case 'bailiff': {
        // the band on the wrist: a cold, clipped synthetic voice (glitching when it leaks), the words rising off the cuff
        const p = G.local; if (!p) return;
        const leak = !!s.leak || s.voice === 'leak';
        if (!s.voiced) playLine(text, voiceForStyle(leak ? 'bailiff_leak' : 'bailiff'), null, { glitch: leak });
        for (const b of ui.bubbles) if (b.kind === 'bailiff') b.until = 0;
        const wrist = { get x() { return p.x + Math.cos(p.facing + Math.PI / 2) * 0.3; }, get y() { return p.y + 1.05; }, get z() { return p.z + Math.sin(p.facing + Math.PI / 2) * 0.3; } };
        push(floatText(text, { kind: 'bailiff', name: 'BAILIFF', life: secs }), wrist, 'bailiff');
        break;
      }
      case 'radio':
        radioLine(who, text, secs);
        break;
      case 'self': case 'player': {
        const p = speaker || G.local;
        if (!p) return;
        for (const b of ui.bubbles) if (b.target === p && (b.kind === 'think' || b.kind === 'say')) b.until = 0;
        playLine(text, voiceFromApp(p.app, p.id), p.isLocal ? null : { x: p.x, z: p.z });
        push(floatText(text, { kind: 'say', name: p.isLocal ? undefined : p.name, tint: p.isLocal ? undefined : p.id, life: secs }), p, 'say');
        break;
      }
      case 'voss': case 'guard': default: {
        const isGuard = style === 'guard';
        const el = floatText(text, { kind: isGuard ? 'guard' : 'voss', name: isGuard ? (who && !/guard/i.test(who) ? who : '') || undefined : (who || 'SSGT. VOSS'), life: secs });
        // where is the speaker? given position, the handler's projection, or the band (the sergeant projects from it too)
        let target: any = at;
        if (!target && !isGuard) {
          const v = new THREE.Vector3();
          if (handlerPos(v)) target = { x: v.x, y: v.y, z: v.z };
        }
        // the sergeant has his own synthetic voice: the blips only tick under it
        playLine(text, voiceForStyle(isGuard ? 'guard' : 'voss', who), target ? { x: target.x, z: target.z } : null, { vol: isGuard ? 1 : 0.28 });
        if (!target && !isGuard && G.holo?.visible && G.holo.showLine) { G.holo.showLine(text, secs, 'voss', who || 'VOSS'); return; }
        if (!target) { offscreen(el, secs); return; }
        push(el, target, isGuard ? 'guard' : 'voss');
      }
    }
  });
}
