// Procedural sounds for the iron cube and hands-on crafting.
import { defSound, kit } from '../audio/sounds';
import { Buf, noise, osc, lowpass, bandpass, highpass, decay, rnd } from '../audio/synth';

let done = false;
export function registerCraftSounds() {
  if (done) return;
  done = true;
  // a heavy iron box landing in your hands
  defSound('cube_clunk', () => {
    const b = new Buf(0.4);
    b.mix(kit.thump(0.3, 120, 48, 12), 0, 0.9);
    const ring = osc(0.35, 'sine', 410).env(decay(14)); ring.mix(osc(0.35, 'sine', 643).env(decay(18)), 0, 0.5);
    b.mix(ring, 0.005, 0.25);
    b.mix(kit.burst(0.05, 'pink', 2500, 300, 60), 0, 0.4);
    return b.normalize(0.6);
  });
  defSound('cube_beep', () => osc(0.08, 'square', 1680).env((t) => (t < 0.07 ? 1 : 0)).normalize(0.22));
  defSound('cube_ok', () => {
    const b = new Buf(0.24);
    b.mix(osc(0.08, 'square', 1320).env((t) => (t < 0.07 ? 1 : 0)), 0, 0.5);
    b.mix(osc(0.1, 'square', 1980).env((t) => (t < 0.09 ? 1 : 0)), 0.11, 0.5);
    lowpass(b, 5000);
    return b.normalize(0.24);
  });
  // the reader's relays pulling in: two hard clacks and a coil buzz
  defSound('cube_relay', () => {
    const b = new Buf(0.2);
    b.mix(kit.clickS(1400 + rnd() * 300, 0.012), 0, 0.7);
    b.mix(kit.thump(0.05, 260, 120, 60), 0, 0.4);
    const hum = osc(0.08, 'square', 100); lowpass(hum, 600); hum.env(decay(30));
    b.mix(hum, 0.01, 0.25);
    b.mix(kit.clickS(1100 + rnd() * 300, 0.012), 0.06, 0.55);
    return b.normalize(0.4);
  });
  defSound('cube_deny', () => { const b = osc(0.3, 'saw', (t) => 220 - t * 80); lowpass(b, 1200); b.env(decay(8)); return b.normalize(0.3); });
  // a bolt snapping back into its housing
  defSound('cube_bolt', () => {
    const b = new Buf(0.16);
    b.mix(kit.clickS(2400 + rnd() * 400, 0.01), 0, 0.6);
    b.mix(kit.thump(0.1, 300, 140, 40), 0.004, 0.5);
    const n = noise(0.08, 'white'); highpass(n, 2500); n.env(decay(60)); b.mix(n, 0, 0.35);
    return b.normalize(0.42);
  });
  // the seal breaking and the lid swinging back on its hinge
  defSound('cube_hiss', () => {
    const b = new Buf(0.7);
    const h = noise(0.5, 'white'); bandpass(h, (t) => 4200 - t * 3000, 1.2); h.env((t) => Math.exp(-t * 7) * Math.min(1, t * 60));
    b.mix(h, 0, 0.5);
    const cr = osc(0.4, 'saw', (t) => 70 + Math.sin(t * 40) * 12 + t * 30); lowpass(cr, 900); cr.env((t) => Math.sin(Math.PI * Math.min(1, t / 0.4)) * 0.6);
    b.mix(cr, 0.18, 0.35);
    return b.normalize(0.4);
  });
  defSound('cube_shut', () => {
    const b = new Buf(0.4);
    b.mix(kit.thump(0.3, 150, 55, 14), 0, 0.9);
    b.mix(osc(0.3, 'sine', 520).env(decay(16)), 0.004, 0.2);
    return b.normalize(0.55);
  });
  // something set down on iron
  defSound('cube_place', () => {
    const b = new Buf(0.18);
    b.mix(kit.thump(0.12, 230, 90, 34), 0, 0.7);
    b.mix(osc(0.12, 'sine', 880 + rnd() * 200).env(decay(40)), 0.002, 0.12);
    b.mix(kit.burst(0.05, 'pink', 2400, 300, 80), 0, 0.3);
    return b.normalize(0.36);
  });
  // ---- hands-on crafting
  defSound('craft_saw', () => {
    const L = 0.28;
    const b = noise(L, 'white');
    bandpass(b, (t) => 1800 + Math.sin(t * 90) * 600 + rnd() * 300, 2.2);
    b.env((t) => Math.sin(Math.PI * Math.min(1, t / L)) * (0.7 + 0.3 * Math.sin(t * 160)));
    return b.normalize(0.4);
  });
  defSound('craft_grind', () => {
    const L = 0.3;
    const b = noise(L, 'white'); bandpass(b, (t) => 5200 + Math.sin(t * 70) * 800, 3.5);
    b.env((t) => Math.sin(Math.PI * Math.min(1, t / L)));
    return b.normalize(0.32);
  });
  defSound('craft_clang', () => {
    const b = new Buf(0.6);
    const f = 900 + rnd() * 300;
    b.mix(osc(0.6, 'sine', f).env(decay(9)), 0, 0.45);
    b.mix(osc(0.6, 'sine', f * 2.76).env(decay(14)), 0, 0.25);
    b.mix(osc(0.6, 'sine', f * 5.4).env(decay(22)), 0, 0.12);
    b.mix(kit.burst(0.04, 'white', 9000, 1500, 90), 0, 0.6);
    b.mix(kit.thump(0.1, 200, 90, 40), 0, 0.4);
    return b.normalize(0.5);
  });
  defSound('craft_thud', () => { const b = new Buf(0.2); b.mix(kit.thump(0.18, 160, 70, 22), 0, 0.8); b.mix(kit.burst(0.06, 'brown', 900, 60, 50), 0, 0.5); return b.normalize(0.4); });
  defSound('craft_crack', () => {
    const b = new Buf(0.35);
    for (let i = 0; i < 6; i++) b.mix(kit.burst(0.04, 'white', 5000, 600, 70), i * 0.025 + rnd() * 0.01, 0.6 - i * 0.07);
    b.mix(kit.thump(0.2, 140, 60, 18), 0.02, 0.6);
    return b.normalize(0.5);
  });
  defSound('craft_tear', () => {
    const L = 0.38;
    const b = new Buf(L);
    let t = 0;
    while (t < L - 0.02) { const n = noise(0.012, 'white'); bandpass(n, 2600 + rnd() * 2400, 1.6); n.env(decay(200)); b.mix(n, t, 0.5 + rnd() * 0.5); t += 0.004 + rnd() * 0.01; }
    const body = noise(L, 'pink'); bandpass(body, 1200, 0.8); body.env((tt) => Math.sin(Math.PI * Math.min(1, tt / L)) * 0.5);
    b.mix(body, 0, 0.6);
    return b.normalize(0.45);
  });
  defSound('craft_wrap', () => {
    const b = noise(0.22, 'pink'); bandpass(b, (t) => 700 + t * 1800, 1.4);
    b.env((t) => Math.sin(Math.PI * Math.min(1, t / 0.22)));
    b.mix(kit.clickS(900, 0.02), 0.18, 0.2);
    return b.normalize(0.3);
  });
  defSound('craft_done', () => {
    const b = new Buf(0.6);
    for (const [f, at] of [[523, 0], [659, 0.07], [784, 0.14], [1046, 0.21]] as [number, number][]) b.mix(osc(0.35, 'square', f).env(decay(9)), at, 0.22);
    lowpass(b, 3800);
    return b.normalize(0.32);
  });
}
