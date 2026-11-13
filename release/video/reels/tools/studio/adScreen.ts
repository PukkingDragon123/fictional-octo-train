// The Institute's recruiting screen, the end of every reel: a clean monitor in a graphite housing with a green
// light strip round the glass, on two posts, its dark glass lit with the Institute's lockup, NOW RECRUITING UNITS, a QR code to the game's page
// with the link under it, and the call to comment. The type comes on like the reel's captions: letter by
// letter with a phosphor bloom, the key words in the accent colour with a chromatic split. Scanlines and a
// slow sweep run over the glass; the QR panel itself stays clean so it scans.
//
//   const ad = adScreen(link, qr)   ad.root (glass 0.76 x 1.06 m, centre at the origin, face +z)   ad.update(u)
//   qr: { size, bits } module matrix (row-major, 1 = dark), made by tools/studiopage.mjs with the qrcode package
import * as THREE from 'three';
import { worldMaterial } from '/src/gfx/materials';
import { texMat, attrs, canvasTex, greenLight, img, whenLoaded } from './paperCard';

export const GW = 0.76, GH = 1.06;
const BX = 0.07, BT = 0.07, BB = 0.09, DEPTH = 0.08;
const CW = 760, CH = 1060;                       // the glass picture: 1 px = 1 mm
const ACC = '#d8ff4a', CYAN = '#86ffb4', INK = '#03140a';

/** when things come on (shot time, s), timed to her line: "...now recruiting units. Scan the code, or comment 'unit', to enlist." */
export const AD_CUES = { power: 0, logo: 0.25, recruiting: 1.5, units: 2.4, qr: 3.5, link: 3.95, comment: 4.7, unit: 5.05, enlist: 5.3, glyphs: 5.85 };

export interface QR { size: number; bits: number[] }
export interface AdScreen { root: THREE.Group; update(u: number): void }

const smooth = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

/** a line of type coming on letter by letter: each letter flashes white and settles to its colour, with a bloom */
function typeOn(x: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, font: string, col: string, t0: number, u: number,
  o: { per?: number; pop?: boolean; split?: boolean; glow?: string; weight?: string } = {}) {
  if (u < t0) return;
  const per = o.per ?? 0.045;
  x.font = `${o.weight ?? ''} ${px}px ${font}`; x.textBaseline = 'middle'; x.textAlign = 'left';
  const w = x.measureText(text).width;
  let lx = cx - w / 2;
  const pop = o.pop ? 1 + 0.18 * (1 - smooth((u - t0) / 0.28)) : 1;
  x.save();
  if (pop !== 1) { x.translate(cx, cy); x.scale(pop, pop); x.translate(-cx, -cy); }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], a = u - (t0 + i * per), cw = x.measureText(ch).width;
    if (a >= 0 && ch !== ' ') {
      const fl = a < 0.05 ? 0.45 : a < 0.1 ? 1 : a < 0.14 ? 0.7 : 1;          // a tube catching
      const hot = Math.max(0, 1 - a / 0.18);
      if (o.split) {
        const s = 2 + 5 * Math.max(0, 1 - a / 0.5);
        x.globalAlpha = 0.55 * fl; x.fillStyle = '#2aff8a'; x.fillText(ch, lx - s, cy);
        x.fillStyle = '#f2ff6a'; x.fillText(ch, lx + s, cy);
      }
      x.globalAlpha = fl;
      x.shadowColor = o.glow ?? col; x.shadowBlur = 16 + 18 * hot;
      x.fillStyle = hot > 0.4 ? '#ffffff' : col;
      x.fillText(ch, lx, cy);
      x.shadowBlur = 0;
    }
    lx += cw;
  }
  x.restore();
  x.globalAlpha = 1;
}

/** small pixel glyphs (8 x 8 cells): a heart, a note with lines (comment), an arrow out (share) */
const GLYPHS: Record<string, string[]> = {
  like: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........'],
  comment: ['########', '#......#', '#.####.#', '#......#', '#.###..#', '#......#', '########', '........'],
  share: ['....#...', '....##..', '#######.', '#######.', '#...##..', '#...#...', '#.......', '#######.'],
};
function glyph(x: CanvasRenderingContext2D, g: string[], gx: number, gy: number, cell: number, col: string) {
  x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 10;
  g.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') x.fillRect(gx + c * cell, gy + r * cell, cell, cell); });
  x.shadowBlur = 0;
}

export function adScreen(link: string, qr: QR | null): AdScreen {
  const root = new THREE.Group();
  const W = GW + 2 * BX, H = GH + BT + BB, cy = (BB - BT) / 2;   // the housing, centred under the glass' centre
  // the housing: graphite with a fine brushed grain, a green light strip round the glass, screws, a vent
  const FW = 640, FH = Math.round(FW * H / W);
  const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
  const fx = fc.getContext('2d')!;
  const hg = fx.createLinearGradient(0, 0, 0, FH); hg.addColorStop(0, '#2a312e'); hg.addColorStop(1, '#141917');
  fx.fillStyle = hg; fx.fillRect(0, 0, FW, FH);
  for (let y = 0; y < FH; y += 2) { fx.fillStyle = `rgba(255,255,255,${0.012 + 0.012 * Math.sin(y * 0.37) * Math.sin(y * 0.11)})`; fx.fillRect(0, y, FW, 1); }
  const gx0 = Math.round(FW * BX / W), gx1 = FW - gx0, gy0 = Math.round(FH * BT / H), gy1 = Math.round(FH * (BT + GH) / H);
  fx.fillStyle = '#050807'; fx.fillRect(gx0 - 10, gy0 - 10, gx1 - gx0 + 20, gy1 - gy0 + 20);
  fx.shadowColor = '#6effa0'; fx.shadowBlur = 14; fx.strokeStyle = '#7dffae'; fx.lineWidth = 3;
  fx.strokeRect(gx0 - 16, gy0 - 16, gx1 - gx0 + 32, gy1 - gy0 + 32); fx.shadowBlur = 0;
  fx.strokeStyle = 'rgba(255,255,255,.08)'; fx.lineWidth = 2; fx.strokeRect(6, 6, FW - 12, FH - 12);
  for (let k = 0; k < 9; k++) { fx.fillStyle = 'rgba(0,0,0,.55)'; fx.fillRect(FW / 2 - 120 + k * 28, gy1 + 26, 16, 26); }
  for (const [sx, sy] of [[18, 18], [FW - 18, 18], [18, FH - 18], [FW - 18, FH - 18]]) {
    fx.fillStyle = '#8a948f'; fx.beginPath(); fx.arc(sx, sy, 7, 0, Math.PI * 2); fx.fill();
    fx.strokeStyle = '#3a423e'; fx.lineWidth = 2; fx.beginPath(); fx.moveTo(sx - 4, sy); fx.lineTo(sx + 4, sy); fx.stroke();
  }
  const face = new THREE.Mesh(attrs(new THREE.PlaneGeometry(W, H)), texMat(canvasTex(fc)));
  face.position.set(0, -cy, DEPTH / 2 + 0.0004);
  root.add(face);
  const steel = worldMaterial({ noVis: true, noFog: true, noGrid: true } as never);
  const box = new THREE.Mesh(attrs(new THREE.BoxGeometry(W, H, DEPTH), [0.13, 0.15, 0.14], true), steel);
  box.position.set(0, -cy, 0); root.add(box);
  const postH = 3;  // long enough to reach the floor from any mounting height (the floor hides the rest)
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(attrs(new THREE.BoxGeometry(0.05, postH, 0.05), [0.16, 0.18, 0.17], true), steel);
    p.position.set(sx * (W / 2 - 0.12), -cy - H / 2 - postH / 2 + 0.02, -0.01); root.add(p);
  }

  // the glass
  const gc = document.createElement('canvas'); gc.width = CW; gc.height = CH;
  const x = gc.getContext('2d')!;
  const gtex = canvasTex(gc);
  const glass = new THREE.Mesh(attrs(new THREE.PlaneGeometry(GW, GH)), texMat(gtex, { unlit: true }));
  glass.position.z = DEPTH / 2 + 0.0012;
  root.add(glass);

  // the lockup made into the screen's green light, once
  const logo = img('/brand/lockup-horizontal@4x.png'); let tint: HTMLCanvasElement | null = null;
  whenLoaded(logo, () => { tint = greenLight(logo, '134,255,180'); });

  // the QR panel: dark modules on a pale panel with its quiet zone, drawn once, crisp
  const QX = 372, QY = 404, QS = 340;
  let qrc: HTMLCanvasElement | null = null;
  if (qr) {
    qrc = document.createElement('canvas'); qrc.width = QS; qrc.height = QS;
    const q = qrc.getContext('2d')!;
    q.fillStyle = '#ecfff3'; q.fillRect(0, 0, QS, QS);
    const n = qr.size + 8, m = QS / n;
    q.fillStyle = INK;
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++)
      if (qr.bits[r * qr.size + c]) q.fillRect(Math.floor((c + 4) * m), Math.floor((r + 4) * m), Math.ceil(m), Math.ceil(m));
  } else console.error('ad screen: no QR matrix (window.__qr)');
  const bare = link.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const cut = bare.indexOf('/');
  const linkLines = cut > 0 ? [bare.slice(0, cut), bare.slice(cut)] : [bare];
  const C = AD_CUES;

  const paint = (u: number) => {
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.shadowBlur = 0;
    // the glass: near black teal, a faint grid, HUD corners
    const bg = x.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, '#0a2016'); bg.addColorStop(0.55, '#06140d'); bg.addColorStop(1, '#020805');
    x.fillStyle = bg; x.fillRect(0, 0, CW, CH);
    if (u < C.power) return;
    // power on: a line of light opens into the picture
    const on = smooth((u - C.power) / 0.32);
    if (on < 1) {
      const h = Math.max(2, CH * on * on);
      x.fillStyle = `rgba(200,255,220,${0.9 * (1 - on) + 0.1})`; x.fillRect(0, CH / 2 - h / 2, CW, h);
      return;
    }
    const flick = 0.94 + 0.06 * Math.sin(u * 41) * Math.sin(u * 17);
    x.fillStyle = 'rgba(90,250,150,.06)';
    for (let gx = 10; gx < CW; gx += 20) x.fillRect(gx, 0, 1, CH);
    for (let gy = 10; gy < CH; gy += 20) x.fillRect(0, gy, CW, 1);
    x.strokeStyle = 'rgba(134,255,180,.55)'; x.lineWidth = 4;
    for (const [cx, cy2, dx, dy] of [[14, 14, 1, 1], [CW - 14, 14, -1, 1], [14, CH - 14, 1, -1], [CW - 14, CH - 14, -1, -1]]) {
      x.beginPath(); x.moveTo(cx, cy2 + dy * 34); x.lineTo(cx, cy2); x.lineTo(cx + dx * 34, cy2); x.stroke();
    }
    // the lockup
    if (tint && u >= C.logo) {
      const a = u - C.logo, f = a < 0.35 ? (Math.floor(a * 40) % 3 === 0 ? 0.2 : 0.9) : 1;
      x.globalAlpha = f * flick; x.imageSmoothingEnabled = false;
      x.shadowColor = CYAN; x.shadowBlur = 14;
      const lw = 640, lh = lw * tint.height / tint.width;
      x.drawImage(tint, (CW - lw) / 2, 24, lw, lh);
      x.shadowBlur = 0; x.globalAlpha = 1; x.imageSmoothingEnabled = true;
    }
    // NOW RECRUITING / UNITS
    typeOn(x, 'NOW RECRUITING', CW / 2, 226, 64, 'Alagard, monospace', '#e6ffef', C.recruiting, u, { glow: CYAN });
    typeOn(x, 'UNITS', CW / 2, 322, 124, 'Alagard, monospace', ACC, C.units, u, { per: 0.06, pop: true, split: true });
    // the QR code: drawn in top to bottom by the beam, then left alone
    if (qrc && u >= C.qr) {
      const k = smooth((u - C.qr) / 0.4), h = Math.round(QS * k);
      x.fillStyle = 'rgba(134,255,180,.35)'; x.fillRect(QX - 10, QY - 10, QS + 20, QS + 20);
      x.fillStyle = '#020809'; x.fillRect(QX - 6, QY - 6, QS + 12, QS + 12);
      x.drawImage(qrc, 0, 0, QS, h, QX, QY, QS, h);
      if (k < 1) { x.fillStyle = 'rgba(220,255,230,.9)'; x.fillRect(QX - 6, QY + h - 2, QS + 12, 4); }
    }
    linkLines.forEach((t, i) => typeOn(x, t, QX + QS / 2, 784 + i * 38, 27, '"IBM Plex Mono", monospace', '#e6ffef', C.link + i * 0.35, u, { per: 0.022, glow: CYAN, weight: '600' }));
    // the call to comment, left of the code
    const lx = 196;
    typeOn(x, 'COMMENT', lx, 470, 58, 'Alagard, monospace', '#e6ffef', C.comment, u, { glow: CYAN });
    typeOn(x, '“UNIT”', lx, 548, 76, 'Alagard, monospace', ACC, C.unit, u, { per: 0.05, pop: true, split: true });
    typeOn(x, 'TO ENLIST', lx, 626, 58, 'Alagard, monospace', '#e6ffef', C.enlist, u, { glow: CYAN });
    (['like', 'comment', 'share'] as const).forEach((g, i) => {
      const a = u - (C.glyphs + i * 0.15);
      if (a < 0) return;
      const s = 7 * (1 + 0.3 * (1 - smooth(a / 0.2)));
      glyph(x, GLYPHS[g], lx - 120 + i * 92 + (56 - 8 * s) / 2, 690 + (56 - 8 * s) / 2, s, i === 0 ? '#ff5a6e' : CYAN);
    });
    // the tube: scanlines, a slow sweep, a little breathing in the brightness (the QR panel kept clean)
    x.fillStyle = 'rgba(0,0,0,.22)';
    for (let y = 0; y < CH; y += 4) { if (y > QY - 12 && y < QY + QS + 12) { x.fillRect(0, y, QX - 12, 1.5); x.fillRect(QX + QS + 12, y, CW - QX - QS - 12, 1.5); } else x.fillRect(0, y, CW, 1.5); }
    const sy = ((u * 0.32) % 1.3) * CH - 120;
    const sw = x.createLinearGradient(0, sy - 90, 0, sy + 90);
    sw.addColorStop(0, 'rgba(160,255,200,0)'); sw.addColorStop(0.5, 'rgba(180,255,210,.07)'); sw.addColorStop(1, 'rgba(160,255,200,0)');
    x.fillStyle = sw; x.fillRect(0, sy - 90, CW, 180);
    x.fillStyle = `rgba(0,0,0,${(1 - flick) * 1.5})`; x.fillRect(0, 0, CW, CH);
    // glass glare
    const gl = x.createLinearGradient(0, 0, CW, CH);
    gl.addColorStop(0.18, 'rgba(255,255,255,0)'); gl.addColorStop(0.24, 'rgba(255,255,255,.05)'); gl.addColorStop(0.3, 'rgba(255,255,255,0)');
    x.fillStyle = gl; x.fillRect(0, 0, CW, CH);
  };
  paint(-1); gtex.needsUpdate = true;
  return { root, update(u) { paint(u); gtex.needsUpdate = true; } };
}
