// Lab decor: the things that make a room yours. A kilim rug, a snake plant,
// an anatomy chart, a lava lamp, a humming mini fridge, a gas-tube sign, a
// specimen jar, a nodding dog (grinhound edition) and a pinned moth in a
// shadow box. Faceted parts on the pixel textures, printed art painted in
// code, each with its own little life: sway, blobs, flicker, bubbles, nods.
import * as THREE from 'three';
import { DecoBuilder, type DMats, at, along, cbox, prism, lathe, extrude, ngon, tube, hull, jitter, printMat, paintPix, makeRamp } from './kit';
import { ball, limb, knob, leafGeo, labelCanvas, Glint, Spring, scaled, type DecoModel, type V3 } from './parts';
import { bitText, bitMeasure, INK } from '../../../gfx/bitfont';

/** give a built group's glow mesh its own material (so it can flicker alone) */
function ownGlow(g: THREE.Group): THREE.MeshBasicMaterial | null {
  const m = g.getObjectByName('glow') as THREE.Mesh | undefined;
  if (!m) return null;
  m.material = (m.material as THREE.MeshBasicMaterial).clone();
  return m.material as THREE.MeshBasicMaterial;
}

// ------------------------------------------------------------------ rug
export function decoRug(mats: DMats): DecoModel {
  const b = new DecoBuilder();
  const W = 1.5, D = 0.95;
  const art = printMat('rug', () => paintPix(60, 38, (pc, rng) => {
    const red = makeRamp(0x8a2418, 4, { spread: 0.4 }), och = makeRamp(0xc8962e, 4, { spread: 0.4 }), nav = makeRamp(0x1e2a4c, 4, { spread: 0.4 }), cre = makeRamp(0xdcd0ac, 3, { spread: 0.25 });
    for (let y = 0; y < 38; y++) for (let x = 0; x < 60; x++) {
      const bx = Math.min(x, 59 - x), by = Math.min(y, 37 - y), e = Math.min(bx, by);
      let ramp = red, v = 1 + ((x * 7 + y * 3) % 5 === 0 ? -1 : 0);
      if (e < 1) ramp = nav; else if (e < 3) { ramp = cre; v = (x + y) % 4 === 0 ? 0 : 1; } else if (e < 5) { ramp = nav; v = ((x >> 1) + (y >> 1)) % 2 ? 1 : 2; } else if (e < 6) ramp = och;
      else {
        // the field: stepped diamonds
        const cx = ((x - 6) % 16) - 8, cy = ((y - 6) % 13) - 6.5;
        const d = Math.abs(cx) + Math.abs(cy) * 1.25;
        if (d < 2.5) ramp = cre; else if (d < 4.5) { ramp = nav; } else if (d < 6) ramp = och; else ramp = red;
        if (d >= 4.5 && d < 6 && (x + y) % 3 === 0) v = 2;
      }
      pc.set(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, v))]);
    }
    // wear: a worn path and a burn
    for (let i = 0; i < 70; i++) { const x = rng.int(18, 42), y = rng.int(8, 30); pc.blend(x, y, 0xb8a888, 0.25); }
    pc.set(46, 9, 0x2a1a10); pc.set(47, 9, 0x3a2414); pc.set(46, 10, 0x3a2414);
  }, 'rug'), { rough: 0.95 });
  b.print(art, W, D, 0.012, at(0, 0.008, 0, -Math.PI / 2, 0, 0), 0x5a1810);
  for (const s of [-1, 1]) for (let i = 0; i < 18; i++) {
    const x = -W / 2 + 0.05 + i * ((W - 0.1) / 17);
    b.add('cloth', cbox(0.018, 0.006, 0.06, 0.002), 0xd8ccaa, at(x, 0.004, s * (D / 2 + 0.028), 0, (i % 3 - 1) * 0.2, 0));
  }
  const g = b.build(mats);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
  return { obj: g };
}

// ------------------------------------------------------------------ snake plant
export function decoPlant(mats: DMats): DecoModel {
  const b = new DecoBuilder(), lb = new DecoBuilder();
  // a terracotta pot with a rolled rim, a saucer, dark soil
  b.add('vinyl', lathe([[0.0, 0], [0.13, 0], [0.13, 0.012], [0.11, 0.016]], 8, 0.5), 0x9a4a2a, at(0, 0, 0));
  b.add('card', lathe([[0, 0.016], [0.1, 0.016], [0.135, 0.26], [0.155, 0.27], [0.158, 0.31], [0.14, 0.315], [0.0, 0.29]], 8, 0.5), 0xc06a3a, at(0, 0, 0), { rep: 0.08 });
  b.add('rubber', prism(0.13, 0.02, 8, { c: 0 }), 0x2a1e14, at(0, 0.295, 0));
  for (let i = 0; i < 6; i++) b.add('rubber', cbox(0.02, 0.012, 0.02, 0.004), 0x4a3a28, at(Math.cos(i * 2.3) * 0.08, 0.305, Math.sin(i * 2.3) * 0.08));
  // the blades: tall, banded, twisting
  const blades: { m: THREE.Matrix4 }[] = [];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4, r = 0.02 + (i % 4) * 0.022, len = 0.42 + ((i * 53) % 9) * 0.04;
    const tilt = 0.08 + (i % 3) * 0.08;
    const m = at(Math.cos(a) * r, 0.3, Math.sin(a) * r, Math.sin(a) * tilt, a * 0.7, -Math.cos(a) * tilt);
    lb.add('vinyl', leafGeo(len, 0.065, 0.008, 6), i % 2 ? 0x3a6a2a : 0x2e5a26, m);
    lb.add('vinyl', leafGeo(len * 0.98, 0.075, 0.004, 6), 0xc8c060, m.clone().multiply(at(0, 0, -0.0045, 0, 0, 0, [1, 1, 1])));
    blades.push({ m });
  }
  const root = new THREE.Group();
  root.add(b.build(mats));
  const leaves = lb.build(mats);
  const sway = new THREE.Group();
  sway.position.y = 0.3; leaves.position.y = -0.3;
  sway.add(leaves); root.add(sway);
  const sp = new Spring(30, 3);
  return {
    obj: root,
    update(t, dt) { const k = sp.step(dt); sway.rotation.z = Math.sin(t * 0.7) * 0.025 + k * 0.12; sway.rotation.x = Math.sin(t * 0.53 + 1) * 0.02; },
    poke() { sp.kick(2.5); },
  };
}

// ------------------------------------------------------------------ anatomy chart
export function decoPoster(mats: DMats): DecoModel {
  const b = new DecoBuilder();
  const W = 0.62, H = 0.86;
  const art = printMat('poster-anat', () => {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const pc = paintPix(96, 128, (pc, rng) => {
      const paper = makeRamp(0xd8cca4, 4, { spread: 0.3 });
      pc.fillRamp(paper, (x, y) => 0.6 + (rng.next() - 0.5) * 0.18 - (y > 90 ? 0.2 : 0), 0.6);
      // the specimen: head with ears and eyes, small body, its bundle
      const C = 48, Y = 66;
      pc.ellipse(C, Y - 6, 17, 14, 0x8a6a62); pc.ellipse(C, Y - 6, 16, 13, 0xc8aaa2); pc.ellipse(C - 3, Y - 10, 8, 5, 0xd8bcb4);
      pc.ellipse(C - 19, Y - 1, 6, 13, 0x9a5a58); pc.ellipse(C - 19, Y - 1, 5, 12, 0xc07a78); pc.ellipse(C + 19, Y - 1, 6, 13, 0x9a5a58); pc.ellipse(C + 19, Y - 1, 5, 12, 0xc07a78);
      for (const [x, y, r] of [[-6, -6, 3], [6, -6, 3], [0, -13, 1.8], [-11, -13, 1.5], [11, -13, 1.5], [0, 0, 1.5]]) { pc.ellipse(C + x, Y + y, r, r * 1.2, 0x141010); pc.set(C + x - 1, Y + y - 1, 0xffffff); }
      pc.rect(C - 8, Y + 8, 16, 16, 0xc0a098); pc.rect(C - 7, Y + 24, 5, 8, 0xb89890); pc.rect(C + 2, Y + 24, 5, 8, 0xb89890);
      pc.ellipse(C, Y + 15, 8, 6, 0x8a7a5a); pc.ellipse(C, Y + 14, 7, 5, 0xa08a6a);
      // callout lines to the notes
      const ink = 0x2a2420;
      for (const [x0, y0, x1, y1] of [[C - 20, Y - 6, 8, Y - 24], [C + 6, Y - 6, 86, Y - 28], [C + 20, Y + 2, 86, Y + 12], [C, Y + 15, 10, Y + 34]]) { pc.line(x0, y0, x1, y1, ink); pc.hline(x1 - 4, x1 + 4, y1, ink); }
      for (const [x, y] of [[3, Y - 27], [76, Y - 31], [76, Y + 9], [3, Y + 37]]) for (let i = 0; i < 3; i++) pc.hline(x, x + 14 - i * 3, y + i * 2 - 2, 0x6a6050);
      // tape at the corners, a coffee ring, the stamp
      for (const [x, y] of [[0, 0], [86, 0], [0, 121], [86, 121]]) pc.rectBlend(x, y, 10, 7, 0xe8e0c0, 0.7);
      for (let a = 0; a < 50; a++) pc.blend(72 + Math.cos(a / 8) * 9, 104 + Math.sin(a / 8) * 8, 0x8a5a30, 0.4);
      pc.strokeRect(60, 112, 28, 11, 0x9a2a20); pc.hline(62, 85, 117, 0x9a2a20);
      pc.strokeRect(0, 0, 96, 128, 0x6a5a40);
    }, 'anat');
    ctx.putImageData(pc.toImageData(), 0, 0);
    const t = 'SPECIMEN 02';
    bitText(ctx, t, 48 - Math.round(bitMeasure(t) / 2), 4, { color: '#2a2018', outline: null });
    bitText(ctx, 'cowerling', 48 - Math.round(bitMeasure('cowerling') / 2), 18, { color: '#7a2a20', outline: null });
    return cv;
  }, { rough: 0.85 });
  // the frame (four mitred bars), the print behind glass, a foot block; leaning back on the wall
  const fr = new DecoBuilder();
  const T = 0.035;
  fr.add('wood', cbox(W + T * 2, T, 0.03, 0.008), 0x3a2414, at(0, H / 2 + T / 2, 0), { grain: 'x' });
  fr.add('wood', cbox(W + T * 2, T, 0.03, 0.008), 0x3a2414, at(0, -H / 2 - T / 2, 0), { grain: 'x' });
  for (const s of [-1, 1]) fr.add('wood', cbox(T, H, 0.03, 0.008), 0x3a2414, at(s * (W / 2 + T / 2), 0, 0));
  fr.print(art, W, H, 0.01, at(0, 0, -0.004), 0x2a2018);
  fr.add('glass', cbox(W, H, 0.004, 0.001), 0xd0e0e8, at(0, 0, 0.008));
  const lean = new THREE.Group();
  lean.add(fr.build(mats));
  lean.rotation.x = -0.16;
  lean.position.set(0, (H / 2 + T) * Math.cos(0.16) + 0.004, -0.1);
  b.add('wood', cbox(0.7, 0.03, 0.06, 0.01), 0x2a1a10, at(0, 0.015, 0.02));
  const root = new THREE.Group();
  root.add(b.build(mats), lean);
  const glint = new Glint([[0.2, 0.75, -0.04], [-0.18, 0.4, 0.0], [0.1, 0.2, 0.02]], 0.12, 5);
  root.add(glint.sprite);
  return { obj: root, update(_t, dt) { glint.update(dt); } };
}

// ------------------------------------------------------------------ lava lamp
export function decoLava(mats: DMats): DecoModel {
  const b = new DecoBuilder(), gl = new DecoBuilder();
  b.add('metal', lathe([[0, 0], [0.13, 0], [0.12, 0.03], [0.07, 0.2], [0.075, 0.21], [0, 0.21]], 8, 0.5), 0x9a6a3a, at(0, 0, 0));
  b.add('brass', prism(0.13, 0.015, 8, { c: 0.004 }), 0xc89a4a, at(0, 0.008, 0));
  b.add('metal', lathe([[0, 0.48], [0.055, 0.48], [0.04, 0.56], [0, 0.565]], 8, 0.5), 0x9a6a3a, at(0, 0, 0));
  gl.add('glass', lathe([[0.075, 0.205], [0.1, 0.28], [0.085, 0.4], [0.06, 0.48]], 8, 0.5), 0xffd0a0, at(0, 0, 0));
  const root = new THREE.Group();
  root.add(b.build(mats));
  const glass = gl.build(mats, false);
  root.add(glass);
  // the liquid: warm, see-through, lit from the bulb in the base
  const liquid = new THREE.MeshBasicMaterial({ color: 0xc8401c, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const lq = new THREE.Mesh(lathe([[0, 0.21], [0.07, 0.21], [0.092, 0.28], [0.078, 0.4], [0.055, 0.475], [0, 0.475]], 8, 0.5), liquid);
  lq.renderOrder = 3;
  root.add(lq);
  // the wax: faceted blobs that rise, stretch and sink
  const blobMat = new THREE.MeshBasicMaterial({ color: 0xffb048, toneMapped: false });
  const blobs: { m: THREE.Mesh; ph: number; sp: number; r: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ball(1, 6), blobMat);
    root.add(m);
    blobs.push({ m, ph: i * 1.7, sp: 0.18 + i * 0.05, r: 0.022 + (i % 2) * 0.012 });
  }
  const light = new THREE.PointLight(0xff7a30, 0.7, 1.8, 2);
  light.position.set(0, 0.34, 0);
  root.add(light);
  return {
    obj: root, light,
    update(t) {
      for (const bl of blobs) {
        const u = (Math.sin(t * bl.sp + bl.ph) * 0.5 + 0.5);
        const y = 0.23 + u * 0.22;
        const w = 0.085 - Math.abs(y - 0.3) * 0.25;
        bl.m.position.set(Math.sin(t * 0.3 + bl.ph) * w * 0.35, y, Math.cos(t * 0.27 + bl.ph) * w * 0.3);
        const st = 1 + Math.cos(t * bl.sp + bl.ph) * 0.35;
        bl.m.scale.set(bl.r / Math.sqrt(st), bl.r * st, bl.r / Math.sqrt(st));
      }
      liquid.opacity = 0.5 + Math.sin(t * 0.9) * 0.05;
      light.intensity = 0.6 + Math.sin(t * 0.9) * 0.08;
    },
  };
}

// ------------------------------------------------------------------ mini fridge
export function decoFridge(mats: DMats): DecoModel {
  const b = new DecoBuilder();
  const W = 0.5, H = 0.82, D = 0.5, cream = 0xd8d0b8;
  b.add('gloss', cbox(W, H - 0.04, D, 0.04), cream, at(0, 0.04 + (H - 0.04) / 2, 0));
  for (const x of [-1, 1]) for (const z of [-1, 1]) b.add('rubber', cbox(0.05, 0.04, 0.05, 0.01), 0x1a1a1a, at(x * 0.19, 0.02, z * 0.19));
  // the door: a seam, a chrome handle, the freezer line, magnets, a sticker, the thermostat lamp
  b.add('gloss', cbox(W - 0.02, H - 0.1, 0.03, 0.012), 0xe0d8c2, at(0, 0.04 + (H - 0.04) / 2, D / 2 + 0.008));
  b.add('rubber', cbox(W - 0.02, 0.012, 0.012, 0.003), 0x2a2620, at(0, 0.62, D / 2 + 0.022));
  b.add('metal', cbox(0.03, 0.22, 0.03, 0.008), 0xd8dce0, at(W / 2 - 0.07, 0.45, D / 2 + 0.04));
  for (const y of [0.35, 0.56]) b.add('metal', cbox(0.03, 0.02, 0.04, 0.006), 0xb0b4b8, at(W / 2 - 0.07, y, D / 2 + 0.028));
  for (const [x, y, c] of [[-0.14, 0.72, 0xd8402a], [-0.06, 0.69, 0x2a6ad8], [0.02, 0.74, 0xe8c020], [-0.16, 0.5, 0x3a9a4a]] as [number, number, number][]) b.add('gloss', cbox(0.04, 0.04, 0.02, 0.008), c, at(x, y, D / 2 + 0.03, 0, 0, (x * 13) % 0.4));
  b.print(printMat('fridge-note', () => paintPix(16, 20, (pc) => { pc.fill(0xf0e890); for (let y = 4; y < 18; y += 3) pc.hline(2, 8 + ((y * 5) % 6), y, 0x3a4a8a); pc.ellipse(11, 3, 2, 2, 0xd04030); })), 0.1, 0.125, 0.004, at(-0.08, 0.36, D / 2 + 0.026, 0, 0, 0.06));
  b.print(printMat('fridge-sticker', () => labelCanvas('NO SAMPLES', 0x9a2a20, '#f8f0e0', 70)), 0.18, 0.18 * 18 / 70, 0.004, at(0.0, 0.2, D / 2 + 0.026, 0, 0, -0.03));
  b.add('metal', cbox(W - 0.08, 0.05, 0.02, 0.006), 0x3a3a3a, at(0, 0.07, D / 2 + 0.01));
  for (let i = 0; i < 6; i++) b.add('rubber', cbox(0.04, 0.008, 0.012, 0.002), 0x111111, at(-0.14 + i * 0.056, 0.07, D / 2 + 0.022));
  b.add('glow', cbox(0.014, 0.014, 0.01, 0.003), 0x6aff7a, at(-0.19, 0.12, D / 2 + 0.03));
  const g = b.build(mats);
  const led = ownGlow(g);
  const root = new THREE.Group();
  root.add(g);
  const glint = new Glint([[0.18, 0.78, 0.2], [-0.2, 0.6, 0.26], [0.17, 0.45, 0.29]], 0.12, 9);
  root.add(glint.sprite);
  let shake = 0, next = 6;
  return {
    obj: root,
    update(t, dt) {
      glint.update(dt);
      // the compressor kicks in now and then: a shudder
      if (t > next) { shake = 0.6; next = t + 9 + Math.random() * 8; }
      shake = Math.max(0, shake - dt);
      g.position.x = shake > 0 ? Math.sin(t * 90) * 0.002 * shake : 0;
      if (led) led.color.setScalar(shake > 0 ? 1.6 : 0.8 + 0.2 * Math.sin(t * 3));
    },
    poke() { shake = 0.5; },
  };
}

// ------------------------------------------------------------------ gas-tube sign (an eye)
export function decoNeon(mats: DMats): DecoModel {
  const b = new DecoBuilder(), tb = new DecoBuilder();
  // the bakelite plinth with its transformer, the tube supports
  b.add('gloss', cbox(0.56, 0.06, 0.16, 0.015), 0x1a120c, at(0, 0.03, 0));
  b.add('metal', cbox(0.16, 0.07, 0.1, 0.01), 0x3a3e42, at(0.15, 0.095, -0.01));
  for (let i = 0; i < 4; i++) b.add('rubber', cbox(0.12, 0.004, 0.102, 0.001), 0x1a1c1e, at(0.15, 0.07 + i * 0.015, -0.01));
  for (const x of [-0.2, 0, 0.2]) { b.add('metal', prism(0.008, 0.18, 6), 0x7a7e82, at(x, 0.15, -0.03)); b.add('glass', prism(0.016, 0.03, 6), 0xd0e8f0, at(x, 0.24, -0.02)); }
  // the tube: an almond eye with an iris, bent glass
  const up: V3[] = [], lo: V3[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, x = -0.26 + t * 0.52, y = 0.36; up.push([x, y + Math.sin(t * Math.PI) * 0.13, 0]); lo.push([x, y - Math.sin(t * Math.PI) * 0.1, 0]); }
  tb.add('glow', tube(up, 0.012, 24, 5), 0xff8a6a);
  tb.add('glow', tube(lo, 0.012, 24, 5), 0xff8a6a);
  const iris: V3[] = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; iris.push([Math.cos(a) * 0.065, 0.37 + Math.sin(a) * 0.065, 0.01]); }
  tb.add('glow', tube(iris, 0.011, 24, 5, false), 0x6ae0ff);
  tb.add('glow', lathe([[0, 0], [0.024, 0.005], [0.02, 0.02], [0, 0.024]], 6, 0.5), 0x6ae0ff, at(0, 0.37, 0.0, Math.PI / 2, 0, 0));
  for (const x of [-0.26, 0.26]) tb.add('glass', prism(0.016, 0.03, 6), 0x8a8a8a, at(x, 0.36, 0, 0, 0, Math.PI / 2));
  const root = new THREE.Group();
  root.add(b.build(mats));
  const tubeG = tb.build(mats, false);
  root.add(tubeG);
  const glow = ownGlow(tubeG);
  const light = new THREE.PointLight(0xff9a7a, 0.6, 2, 2);
  light.position.set(0, 0.37, 0.15);
  root.add(light);
  let flick = 0;
  return {
    obj: root, light,
    update(t, dt) {
      // a tired transformer: a stutter every so often
      if (Math.random() < dt * 0.18) flick = 0.35;
      flick = Math.max(0, flick - dt);
      const on = flick > 0 ? (Math.floor(t * 30) % 3 ? 0.25 : 1) : 1;
      if (glow) glow.color.setScalar(on * (0.96 + Math.sin(t * 50) * 0.03));
      light.intensity = 0.55 * on;
    },
    poke() { flick = 0.6; },
  };
}

// ------------------------------------------------------------------ specimen jar
export function decoJar(mats: DMats): DecoModel {
  const b = new DecoBuilder(), gb = new DecoBuilder(), cb = new DecoBuilder();
  b.add('brass', prism(0.13, 0.03, 8, { c: 0.008 }), 0x8a6a3a, at(0, 0.015, 0));
  b.add('brass', lathe([[0, 0.43], [0.115, 0.43], [0.12, 0.455], [0.1, 0.47], [0, 0.475]], 8, 0.5), 0xb08a3a, at(0, 0, 0));
  b.add('metal', cbox(0.04, 0.02, 0.04, 0.008), 0x8a8e92, at(0, 0.48, 0));
  b.print(printMat('jar-label', () => labelCanvas('E-31', 0xe8dcb8, '#2a2018', 30)), 0.09, 0.054, 0.003, at(0, 0.12, 0.112));
  gb.add('glass', lathe([[0.11, 0.03], [0.12, 0.06], [0.12, 0.4], [0.105, 0.43]], 8, 0.5), 0xd8f0e8, at(0, 0, 0));
  gb.add('glass', lathe([[0, 0.035], [0.11, 0.035], [0.115, 0.06], [0.115, 0.38], [0, 0.38]], 8, 0.5), 0x4a9a6a, at(0, 0, 0));
  // the thing inside: curled, pale, many-eyed, its ears folded over
  cb.add('vinyl', ball(0.05, 7), 0xd8c0b0, at(0, 0, 0, 0, 0, 0, [1, 0.9, 0.9]));
  cb.add('vinyl', ball(0.035, 6), 0xd0b4a4, at(0.0, -0.05, 0.02));
  limb(cb, 'vinyl', [0.02, -0.07, 0], [0.05, -0.1, -0.02], 0.014, 0.006, 0xd0b4a4, 5);
  for (const s of [-1, 1]) cb.add('vinyl', leafGeo(0.07, 0.04, 0.006, 4), 0xc88a86, at(s * 0.045, 0.02, 0, 0, 0, s * 2.3));
  for (const [x, y] of [[-0.018, 0.01], [0.018, 0.01], [0, 0.03]]) cb.add('gloss', cbox(0.012, 0.012, 0.01, 0.003), 0x101010, at(x, y, 0.046));
  const root = new THREE.Group();
  root.add(b.build(mats));
  const thing = new THREE.Group();
  thing.add(cb.build(mats, false));
  thing.position.set(0, 0.22, 0);
  root.add(thing);
  root.add(gb.build(mats, false));
  const bubMat = new THREE.MeshBasicMaterial({ color: 0xc8ffe0, toneMapped: false });
  const bubGeo = cbox(0.01, 0.01, 0.01, 0.003);
  const bubs: { m: THREE.Mesh; t: number; x: number; z: number }[] = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(bubGeo, bubMat); root.add(m); bubs.push({ m, t: i * 0.37, x: (i % 3 - 1) * 0.05, z: ((i * 7) % 3 - 1) * 0.04 }); }
  const glint = new Glint([[0.08, 0.38, 0.1], [-0.09, 0.25, 0.1]], 0.1, 13);
  root.add(glint.sprite);
  const sp = new Spring(20, 2);
  return {
    obj: root,
    update(t, dt) {
      const k = sp.step(dt);
      thing.position.y = 0.22 + Math.sin(t * 0.7) * 0.012;
      thing.rotation.y = t * 0.12 + k;
      thing.rotation.z = Math.sin(t * 0.5) * 0.1;
      for (const bu of bubs) { const u = ((t * 0.35 + bu.t) % 1); bu.m.position.set(bu.x + Math.sin(u * 9) * 0.006, 0.05 + u * 0.32, bu.z); bu.m.visible = u < 0.97; }
      glint.update(dt);
    },
    poke() { sp.kick(3); },
  };
}

// ------------------------------------------------------------------ nodding grinhound
export function decoBobble(mats: DMats): DecoModel {
  const b = new DecoBuilder(), hb = new DecoBuilder();
  const hide = 0x8a6a52, bone = 0xd8ccb0;
  b.add('gloss', prism(0.15, 0.03, 8, { c: 0.008 }), 0x1a1a1e, at(0, 0.015, 0));
  b.print(printMat('bob-label', () => labelCanvas('GOOD BOY', 0x1a1a1e, '#e8c070', 60)), 0.2, 0.06, 0.004, at(0, 0.015, 0.142));
  // the seated body: haunches, ribs pressing through, forelegs
  b.add('vinyl', jitter(hull([[-0.08, 0.03, -0.1], [0.08, 0.03, -0.1], [-0.09, 0.03, 0.02], [0.09, 0.03, 0.02], [-0.06, 0.2, -0.02], [0.06, 0.2, -0.02], [-0.05, 0.25, 0.06], [0.05, 0.25, 0.06], [0, 0.1, 0.09]]), 0.008, 4), hide, at(0, 0, 0));
  for (let i = 0; i < 4; i++) b.add('vinyl', cbox(0.11 - i * 0.008, 0.008, 0.02, 0.003), bone, at(0, 0.11 + i * 0.03, 0.08 - i * 0.006, -0.3, 0, 0));
  for (const s of [-1, 1]) {
    limb(b, 'vinyl', [s * 0.04, 0.2, 0.05], [s * 0.045, 0.04, 0.09], 0.018, 0.013, hide, 5);
    b.add('vinyl', cbox(0.03, 0.02, 0.05, 0.008), bone, at(s * 0.045, 0.04, 0.1));
    b.add('vinyl', ball(0.05, 6), hide, at(s * 0.07, 0.07, -0.05, 0, 0, 0, [0.8, 1, 1.2]));
  }
  limb(b, 'vinyl', [0, 0.06, -0.11], [0.07, 0.04, -0.17], 0.012, 0.006, hide, 5);
  // the head on its spring: a long grinning skull-ish muzzle, the grin
  hb.add('vinyl', jitter(hull([[-0.06, -0.04, -0.06], [0.06, -0.04, -0.06], [-0.065, 0.05, -0.05], [0.065, 0.05, -0.05], [-0.05, 0.06, 0.04], [0.05, 0.06, 0.04], [-0.035, -0.03, 0.16], [0.035, -0.03, 0.16], [-0.03, 0.02, 0.16], [0.03, 0.02, 0.16]]), 0.006, 6), hide, at(0, 0, 0));
  hb.add('vinyl', cbox(0.075, 0.012, 0.11, 0.004), 0xe8e0c8, at(0, -0.022, 0.1));
  for (let i = 0; i < 6; i++) hb.add('gloss', lathe([[0.005, 0], [0, -0.014]], 4, 0.5), 0xf0ead8, at(-0.028 + i * 0.011, -0.025, 0.155 - Math.abs(i - 2.5) * 0.006));
  hb.add('gloss', cbox(0.03, 0.022, 0.02, 0.008), 0x1a1010, at(0, 0.01, 0.165));
  for (const s of [-1, 1]) {
    hb.add('gloss', cbox(0.02, 0.014, 0.01, 0.004), 0xe8d870, at(s * 0.04, 0.035, 0.07));
    hb.add('vinyl', leafGeo(0.07, 0.045, 0.008, 4), hide, at(s * 0.05, 0.05, -0.03, -0.3, 0, s * -0.5));
  }
  const root = new THREE.Group();
  root.add(b.build(mats));
  const head = new THREE.Group();
  head.add(hb.build(mats));
  head.position.set(0, 0.28, 0.06);
  // the spring
  const coil: V3[] = [];
  for (let i = 0; i <= 18; i++) { const a = i * 0.9; coil.push([Math.cos(a) * 0.012, 0.25 + i * 0.002, 0.06 + Math.sin(a) * 0.012]); }
  const sb = new DecoBuilder();
  sb.add('metal', tube(coil, 0.003, 36, 4), 0xc0c4c8);
  root.add(sb.build(mats, false));
  root.add(head);
  const nod = new Spring(40, 1.6), yaw = new Spring(30, 1.4);
  nod.kick(2);
  return {
    obj: scaled(root, 1.4),
    update(t, dt) {
      if (Math.random() < dt * 0.15) nod.kick(1.2);
      head.rotation.x = nod.step(dt) * 0.35 + Math.sin(t * 2.2) * 0.02;
      head.rotation.y = yaw.step(dt) * 0.3;
    },
    poke() { nod.kick(5); yaw.kick((Math.random() - 0.5) * 6); },
  };
}

// ------------------------------------------------------------------ pinned lumenmoth
export function decoMoth(mats: DMats): DecoModel {
  const b = new DecoBuilder(), mb = new DecoBuilder();
  const W = 0.42, H = 0.5;
  // the shadow box: a deep oak frame, black felt, glass, a typed label; on little easel feet
  const box = new DecoBuilder();
  box.add('wood', cbox(W, H, 0.08, 0.012), 0x5a3a1e, at(0, 0, -0.01));
  box.add('cloth', cbox(W - 0.06, H - 0.06, 0.02, 0.004), 0x121014, at(0, 0, 0.025));
  box.add('glass', cbox(W - 0.04, H - 0.04, 0.004, 0.001), 0x506070, at(0, 0, 0.034));
  box.print(printMat('moth-label', () => labelCanvas('L. pallida', 0xe8dcb8, '#2a2018', 56)), 0.12, 0.12 * 18 / 56, 0.002, at(0, -0.19, 0.037));
  // the moth: furred thorax, four wings with luminous scales, the pin
  mb.add('cloth', lathe([[0, -0.06], [0.014, -0.04], [0.018, 0.0], [0.014, 0.03], [0, 0.04]], 6, 0.5), 0xd8d0c0, at(0, 0, 0));
  for (const s of [-1, 1]) {
    mb.add('vinyl', extrude([[0, 0.02], [s * 0.15, 0.1], [s * 0.17, 0.05], [s * 0.12, -0.01], [0, -0.01]], 0.004, 0), 0xe8e4d8, at(0, 0.0, 0));
    mb.add('vinyl', extrude([[0, -0.01], [s * 0.1, -0.03], [s * 0.11, -0.09], [s * 0.04, -0.08]], 0.004, 0), 0xd8d0c0, at(0, 0.0, 0.001));
    for (const [x, y] of [[0.1, 0.06], [0.13, 0.05], [0.07, -0.05], [0.06, 0.04]]) mb.add('glow', cbox(0.016, 0.016, 0.004, 0.002), 0xbaf0ff, at(s * x, y, 0.005));
    limb(mb, 'rubber', [0, 0.035, 0.005], [s * 0.04, 0.09, 0.008], 0.002, 0.001, 0x6a6050, 3);
  }
  mb.add('metal', prism(0.003, 0.05, 4), 0xd0d0d0, at(0, 0.0, 0.02, Math.PI / 2, 0, 0));
  mb.add('metal', ball(0.006, 4), 0xe0e0e0, at(0, 0.0, 0.045));
  const frame = new THREE.Group();
  frame.add(box.build(mats));
  const moth = mb.build(mats, false);
  moth.position.set(0, 0.03, 0.04);
  frame.add(moth);
  const scales = ownGlow(moth);
  frame.rotation.x = -0.12;
  frame.position.set(0, H / 2 + 0.03, -0.02);
  for (const s of [-1, 1]) b.add('wood', cbox(0.03, 0.03, 0.14, 0.008), 0x3a2414, at(s * 0.15, 0.015, 0.02));
  const root = new THREE.Group();
  root.add(b.build(mats), frame);
  const light = new THREE.PointLight(0x9ae8ff, 0.05, 0.9, 2);
  light.position.set(0, H / 2 + 0.06, 0.3);
  root.add(light);
  return {
    obj: root, light,
    update(t) { if (scales) scales.color.setScalar(0.7 + Math.sin(t * 1.3) * 0.25 + Math.sin(t * 7.1) * 0.05); light.intensity = 0.04 + Math.sin(t * 1.3) * 0.015; },
  };
}

