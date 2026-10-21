// The IV blood bag: health and blood volume as a bag of blood hanging from a
// hook. Every wound is a hole in the bag (placed on the body pictogram printed
// on it) that drips or streams by how hard it bleeds; treated wounds show tape,
// stitches, iodine or a splint. Infection, food poisoning and corruption tint
// the blood. A drip chamber under it holds hydration and drops on every beat.
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import type { BodyPart } from '../../items/item';
import { Pix, mix, shade, bayer, hash, type3, typeW } from './pix';
import { needsCare } from './treat';

export const BAG_W = 46, BAG_H = 84;
/** bag top seam / bottom, half width; the body pictogram starts FY below the seam (the label sits above it) */
const CX = 23, Y0 = 8, Y1 = 64, HW = 16, FY = 14;
const NCOL = HW * 2 + 4;

/** pictogram position of each body part (x from the bag centre, y from the top seam); the survivor faces you */
const PART_AT: Record<BodyPart, [number, number]> = {
  head: [0, 7], neck: [0, 11], torso_u: [0, 15], torso_l: [0, 20], groin: [0, 25],
  uarm_r: [-6, 15], farm_r: [-8, 21], hand_r: [-10, 26], uarm_l: [6, 15], farm_l: [8, 21], hand_l: [10, 26],
  thigh_r: [-3, 30], shin_r: [-3.5, 36], foot_r: [-4, 41], thigh_l: [3, 30], shin_l: [3.5, 36], foot_l: [4, 41],
};

interface Drop { x: number; y: number; vy: number; c: number; on: boolean }
export interface HoleHit { inj: Injury; x: number; y: number }

export class IvBag {
  level = 1;
  private shown = 1;
  private wave = new Float32Array(NCOL);
  private wv = new Float32Array(NCOL);
  private ang = 0; private angV = 0;
  private drops: Drop[] = [];
  private puddle = 0;
  private chamberDrop = -1;
  private flow = 0;
  private pulse = 0;
  private t = 0;
  private tremble = 0;
  private bulge = 0;
  holes: HoleHit[] = [];
  /** blood colours this frame */
  private col = { base: 0x8e0f17, hi: 0xd2343a, dark: 0x4a060c, glow: 0 };
  constructor() { for (let i = 0; i < 48; i++) this.drops.push({ x: 0, y: 0, vy: 0, c: 0, on: false }); }

  slosh(k: number) {
    for (let i = 0; i < NCOL; i++) this.wv[i] += (Math.random() - 0.5) * k * 18;
    this.angV += (Math.random() - 0.5) * k * 3;
  }
  swing(dx: number) { this.angV += dx; }
  beat(k: number) { this.chamberDrop = 0; this.pulse = 0.12 * k; }

  update(dt: number, p: Player) {
    const b = p.body;
    this.t += dt;
    const blood = Math.max(0, Math.min(1, b.blood / 100));
    const hp = Math.max(0, Math.min(1, b.health / 100));
    this.level = b.dead ? 0 : Math.min(blood, hp * 0.9 + 0.1 * blood);
    this.shown += (this.level - this.shown) * Math.min(1, dt * 2.5);
    // the surface: a row of springs
    const w = this.wave, v = this.wv;
    for (let i = 0; i < NCOL; i++) {
      const l = w[i - 1] ?? w[i], r = w[i + 1] ?? w[i];
      v[i] += ((l + r - 2 * w[i]) * 40 - w[i] * 22 - v[i] * 3.2) * dt;
    }
    for (let i = 0; i < NCOL; i++) w[i] = Math.max(-4, Math.min(4, w[i] + v[i] * dt));
    // pendulum off the hook; the fluid leans against the swing
    this.angV += (-this.ang * 26 - this.angV * 2.6) * dt;
    this.ang = Math.max(-0.22, Math.min(0.22, this.ang + this.angV * dt));
    const pain = b.pain();
    this.tremble = pain > 45 ? (pain - 45) / 55 : 0;
    this.pulse = Math.max(0, this.pulse - dt);
    this.bulge = this.shown * 1.4 + this.pulse * 6;
    // colour of the blood: infection greens it, food poisoning muddies it, corruption blackens and sparks
    const fever = b.fever(), sick = b.sickness / 100, cor = b.corruption / 100;
    let base = 0x8e0f17, hi = 0xd2343a, dark = 0x4a060c;
    if (b.blood < 60) { const k = (60 - b.blood) / 60; base = mix(base, 0x5a0a12, k); hi = mix(hi, 0x9a2a32, k); }
    if (sick > 0.05) { base = mix(base, 0x5e6a14, sick * 0.55); hi = mix(hi, 0x9aa832, sick * 0.55); dark = mix(dark, 0x2a3008, sick * 0.5); }
    if (fever > 0.12) { base = mix(base, 0x86a01e, fever * 0.7); hi = mix(hi, 0xc8e050, fever * 0.7); dark = mix(dark, 0x3a4a08, fever * 0.6); }
    if (b.drunk > 30) { base = mix(base, 0x9a3a10, 0.2); }
    if (cor > 0.04) { base = mix(base, 0x10141c, Math.min(1, cor * 1.4)); hi = mix(hi, 0x2a3446, Math.min(1, cor * 1.4)); dark = mix(dark, 0x05060a, cor); }
    this.col.base = base; this.col.hi = hi; this.col.dark = dark; this.col.glow = cor;
    // leaks
    let total = 0;
    for (const inj of b.allInjuries()) {
      const r = b.injuryBleed(inj);
      if (r <= 0.005) continue;
      total += r;
      const at = this.holeAt(inj);
      if (Math.random() < Math.min(0.9, r * 7 * dt + 0.2 * dt)) this.spawn(at[0] + (Math.random() - 0.5), at[1] + 1, 6 + Math.random() * 10, Math.random() < 0.5 ? base : hi);
      if (inj.infection > 0.25 && Math.random() < dt * 0.4) this.spawn(at[0], at[1] + 1, 4, 0xb8c040);
    }
    this.flow = total;
    for (const d of this.drops) {
      if (!d.on) continue;
      d.vy += 120 * dt; d.y += d.vy * dt;
      if (d.y >= BAG_H - 2) { d.on = false; this.puddle = Math.min(1, this.puddle + 0.02); }
    }
    this.puddle = Math.max(0, this.puddle - dt * 0.015);
    if (this.chamberDrop >= 0) { this.chamberDrop += dt * 2.4; if (this.chamberDrop > 1) this.chamberDrop = -1; }
  }
  private spawn(x: number, y: number, vy: number, c: number) {
    for (const d of this.drops) if (!d.on) { d.on = true; d.x = x; d.y = y; d.vy = vy; d.c = c; return; }
  }
  private holeAt(inj: Injury): [number, number] {
    const a = PART_AT[inj.part] || [0, 20];
    const fy = Y0 + FY;
    const ox = Math.round((hash(inj.id, 3) - 0.5) * 3), oy = Math.round((hash(inj.id, 9) - 0.5) * 3);
    return [CX + a[0] + ox, fy + a[1] + oy];
  }
  /** row offset from the swing (pixels) */
  private sx(y: number) { return Math.round(Math.sin(this.ang) * (y - 1) * 0.4); }
  private halfW(y: number): number {
    if (y < Y0 || y > Y1) return 0;
    let hw = HW;
    const top = y - Y0, bot = Y1 - y;
    if (top < 4) hw -= 4 - Math.sqrt(Math.max(0, 16 - (4 - top) * (4 - top)));
    if (bot < 6) hw -= 6 - Math.sqrt(Math.max(0, 36 - (6 - bot) * (6 - bot)));
    hw += Math.sin(Math.PI * (y - Y0) / (Y1 - Y0)) * this.bulge;
    return hw;
  }

  draw(P: Pix, ox: number, oy: number, p: Player, hover: Injury | null) {
    const b = p.body;
    const C = this.col;
    const jit = this.tremble > 0 && Math.random() < this.tremble * 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const X = ox + jit;
    // the chrome IV-stand arm with its clamp, and the steel S-hook the bag swings on
    for (let x = 0; x < BAG_W; x++) { P.set(ox + x, oy, 0x6a727a); P.set(ox + x, oy + 1, x % 9 === 3 ? 0xffffff : 0xdfe6ec); P.set(ox + x, oy + 2, 0x9aa4ac); P.set(ox + x, oy + 3, 0x4a525a); }
    P.rect(ox + 1, oy - 1, 5, 6, 0x3a3228); P.rect(ox + 2, oy, 3, 4, 0x7a5a2a); P.set(ox + 2, oy, 0xc8a050); P.set(ox + 3, oy + 5, 0x2a2420);
    const hk = (y: number) => X + CX + this.sx(y);
    P.set(hk(2) - 1, oy + 2, 0x2a2e33); P.set(hk(2) + 1, oy + 2, 0x2a2e33); P.set(hk(3) + 1, oy + 3, 0xc8ccd2);
    P.vline(hk(4), oy + 4, oy + 6, 0xb8c0c8); P.set(hk(5) + 1, oy + 5, 0x6a727a);
    P.set(hk(6) - 1, oy + 6, 0xe8eef2); P.set(hk(7) - 1, oy + 7, 0x8a9298);
    // bag body
    const lvl = this.shown;
    const span = Y1 - Y0 - 3;
    const surf0 = Y1 - lvl * span;
    const dead = b.dead;
    for (let y = Y0; y <= Y1; y++) {
      let hw = this.halfW(y);
      if (dead) hw -= 2 + Math.round(Math.sin(y * 1.7) * 1.5);
      if (hw <= 0) continue;
      const off = this.sx(y);
      const xl = Math.round(CX - hw), xr = Math.round(CX + hw);
      for (let x = xl; x <= xr; x++) {
        const nx = (x - CX) / hw;
        const col = Math.max(0, Math.min(NCOL - 1, x - (CX - HW - 2)));
        const lean = Math.sin(this.ang) * (x - CX) * 0.6;
        const sy = surf0 + this.wave[col] + lean;
        const px = X + x + off, py = oy + y;
        const edge = x === xl || x === xr;
        if (y > sy && lvl > 0.005) {
          // blood: rounded shading, a highlight strip down the left, dithered depth
          const k = 0.72 + 0.4 * (1 - nx * nx) - (y - sy) * 0.004;
          let c = shade(C.base, k);
          if (nx > -0.7 && nx < -0.45) c = mix(c, C.hi, 0.55);
          if (bayer(x, y) < (y - sy) / 60) c = mix(c, C.dark, 0.35);
          if (y - sy < 1.2) c = mix(C.hi, 0xffffff, 0.15);
          if (C.glow > 0.05 && hash(x, y, (this.t * 12) | 0) < C.glow * 0.06) c = hash(x, y, 5) < 0.5 ? 0x5cf2ff : 0xff4ad8;
          P.set(px, py, edge ? shade(c, 0.6) : c);
        } else {
          // empty plastic: barely there, with a sheen
          let a = edge ? 0.9 : 0.4;
          let c = (y & 1) && bayer(x, y) < 0.25 ? 0xc8d4d8 : 0xe2eaec;
          if (nx > -0.72 && nx < -0.5) { a = 0.55; c = 0xffffff; }
          if (dead && hash(x, y) < 0.15) a += 0.2;
          P.blend(px, py, c, a);
        }
      }
    }
    // heat-sealed top seam with the hanger slot, and the bottom seam
    const so = this.sx(Y0);
    for (let x = CX - HW + 3; x <= CX + HW - 3; x++) { P.set(X + x + so, oy + Y0, 0xcfd6d8); P.set(X + x + so, oy + Y0 + 1, 0xaab3b6); }
    P.set(X + CX + so, oy + Y0, 0x2a2e33); P.set(X + CX + so - 1, oy + Y0, 0x2a2e33); P.set(X + CX + so + 1, oy + Y0, 0x2a2e33);
    // the typed paper label: red cross stamp, contents, volume
    this.drawLabel(P, X, oy);
    // graduation ticks on the right edge
    for (let i = 1; i < 5; i++) { const y = Math.round(Y1 - (span * i) / 5); P.hline(X + CX + HW - 4 + this.sx(y), X + CX + HW - 2 + this.sx(y), oy + y, 0x1a1a1a, 0.45); }
    // the printed body pictogram (faint ink on the plastic; severed parts are a dashed seam)
    this.drawFigure(P, X, oy, b.severed);
    // holes
    this.holes.length = 0;
    for (const inj of b.allInjuries()) {
      const [hx0, hy0] = this.holeAt(inj);
      const hx = X + hx0 + this.sx(hy0), hy = oy + hy0;
      this.holes.push({ inj, x: hx - ox, y: hy - oy });
      this.drawHole(P, hx, hy, inj, inj === hover);
    }
    // streams from the heavy bleeders
    for (const inj of b.allInjuries()) {
      const r = b.injuryBleed(inj);
      if (r < 0.32) continue;
      const [hx0, hy0] = this.holeAt(inj);
      const w = r > 1.2 ? 2 : 1;
      for (let y = hy0 + 1; y < BAG_H - 1; y++) {
        const wob = Math.round(Math.sin(y * 0.5 - this.t * 14 + inj.id) * (r > 1.2 ? 1 : 0.6));
        const x = X + hx0 + this.sx(hy0) + wob;
        const c = y % 3 === Math.floor(this.t * 20) % 3 ? C.hi : C.base;
        P.set(x, oy + y, c); if (w > 1) P.set(x + 1, oy + y, shade(c, 0.8));
      }
    }
    // drops
    for (const d of this.drops) if (d.on) { P.set(X + d.x + this.sx(d.y), oy + d.y, d.c); P.set(X + d.x + this.sx(d.y), oy + d.y - 1, shade(d.c, 0.75)); }
    // port, drip chamber (hydration) and the line down to the arm
    const pxo = this.sx(Y1 + 2);
    P.rect(X + CX - 1 + pxo, oy + Y1 + 1, 3, 3, 0xd8dcdc);
    P.set(X + CX + pxo, oy + Y1 + 2, C.base);
    P.vline(X + CX + pxo, oy + Y1 + 4, oy + 65, 0xa8b8bc);
    // a steel roller clamp on the line, then the glass drip chamber with steel caps
    const cx = X + CX + this.sx(72), top = oy + 69, bot = oy + 78;
    P.rect(cx - 2, top - 3, 5, 2, 0x8a929a); P.hline(cx - 2, cx + 2, top - 3, 0xd8dee4); P.set(cx + 2, top - 2, 0x4a525a);
    const hyd = Math.max(0, Math.min(1, 1 - b.thirst / 100));
    for (let y = top; y <= bot; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      const e = x === cx - 3 || x === cx + 3 || y === top || y === bot;
      const wl = bot - 1 - hyd * (bot - top - 3);
      if (y === top || y === bot) P.set(x, y, x === cx - 2 ? 0xe8eef2 : 0x7a828a);
      else if (e) P.set(x, y, 0xb8c4c8);
      else if (y >= wl) P.set(x, y, mix(hyd < 0.25 ? 0xd8b060 : 0x7ab8d8, 0xffffff, x === cx - 2 ? 0.4 : 0));
      else P.blend(x, y, 0xeef6f8, 0.25);
    }
    if (this.chamberDrop >= 0) P.set(cx, top + 1 + Math.round(this.chamberDrop * (bot - top - 3) * Math.max(0.2, 1 - hyd * 0.7)), hyd < 0.15 ? 0xd8b060 : 0x9ad0f0);
    // the line: little pulses flow down it with the heart
    for (let y = bot + 1; y < oy + BAG_H; y++) {
      const fl = ((y - this.t * 30) % 6 + 6) % 6 < 1;
      P.set(cx, y, fl ? 0xe8f0f2 : 0xa8b8bc);
    }
    // a puddle where the drops land
    if (this.puddle > 0.02) {
      const pw = Math.round(2 + this.puddle * 10);
      const hx = X + CX + this.sx(BAG_H);
      P.hline(hx - pw, hx + pw, oy + BAG_H - 1, C.base);
      P.hline(hx - pw + 2, hx + pw - 3, oy + BAG_H - 2, C.hi, 0.6);
    }
  }

  private drawLabel(P: Pix, X: number, oy: number) {
    const x0 = CX - 15, x1 = CX + 14, y0 = Y0 + 3, y1 = Y0 + 16;
    for (let y = y0; y <= y1; y++) {
      const o = this.sx(y);
      for (let x = x0; x <= x1; x++) {
        let c = 0xeee4c6;
        if (y === y0 || y === y1) c = 0xc8b890;
        else if (hash(x, y, 4) < 0.08) c = 0xe0d4b0;
        if (x === x0 || x === x1) c = shade(c, 0.88);
        P.set(X + x + o, oy + y, c);
      }
    }
    // red cross stamp, slightly off register
    const sx0 = X + x0 + 1 + this.sx(y0 + 4), sy0 = oy + y0 + 3;
    P.rect(sx0 + 2, sy0, 2, 6, 0xb82a22, 0.9); P.rect(sx0, sy0 + 2, 6, 2, 0xb82a22, 0.9);
    const ink = 0x2a2018;
    type3(P, 'BLOOD', X + x0 + 9 + this.sx(y0 + 4), oy + y0 + 2, ink, 0.95, 0.4);
    type3(P, '500ML', X + x0 + 9 + this.sx(y0 + 9), oy + y0 + 8, ink, 0.85, 0.5);
    void typeW;
  }

  private drawFigure(P: Pix, X: number, oy: number, severed: BodyPart[]) {
    const ink = 0x200a0a, a = 0.22;
    const at = (part: BodyPart) => PART_AT[part];
    const pt = (dx: number, dy: number) => [X + CX + dx + this.sx(Y0 + FY + dy), oy + Y0 + FY + dy] as const;
    // head
    const [hx, hy] = pt(0, 7);
    P.ring(hx, hy, 2.6, ink, a);
    // spine and hips
    const seg = (pa: readonly [number, number], pb: readonly [number, number], gone: boolean) => {
      if (!gone) P.line(pa[0], pa[1], pb[0], pb[1], ink, a);
      else for (let i = 0; i <= 6; i++) if (i % 2 === 0) { const t = i / 6; P.blend(Math.round(pa[0] + (pb[0] - pa[0]) * t), Math.round(pa[1] + (pb[1] - pa[1]) * t), 0x2a2a2a, 0.6); }
    };
    seg(pt(0, 10), pt(0, 25), false);
    seg(pt(-4, 12), pt(4, 12), false);
    seg(pt(-3, 25), pt(3, 25), false);
    const limb = (a1: BodyPart, a2: BodyPart, a3: BodyPart, from: readonly [number, number]) => {
      const p1 = pt(...at(a1)), p2 = pt(...at(a2)), p3 = pt(...at(a3));
      seg(from, p1, severed.includes(a1)); seg(p1, p2, severed.includes(a2)); seg(p2, p3, severed.includes(a3));
    };
    limb('uarm_r', 'farm_r', 'hand_r', pt(-4, 12));
    limb('uarm_l', 'farm_l', 'hand_l', pt(4, 12));
    limb('thigh_r', 'shin_r', 'foot_r', pt(-3, 25));
    limb('thigh_l', 'shin_l', 'foot_l', pt(3, 25));
  }

  private drawHole(P: Pix, x: number, y: number, inj: Injury, hover: boolean) {
    const t = this.t;
    const D = 0x1c0306, L = 0xf0e8e0;
    const open = !inj.stitched && !inj.caut;
    switch (inj.type) {
      case 'bruise': P.disc(x, y, 2.6, 0x5a2a78, 0.45); break;
      case 'scratch': P.hline(x - 1, x + 1, y, D); P.set(x, y - 1, L); break;
      case 'laceration': P.line(x - 2, y + 2, x + 2, y - 2, D); P.line(x - 1, y + 2, x + 2, y - 1, 0x6a1010); P.set(x - 2, y + 1, L); P.set(x + 1, y - 2, L); break;
      case 'deep': P.disc(x, y, 1.6, D); P.set(x - 2, y - 1, L); P.set(x + 2, y + 1, L); P.set(x + 1, y - 2, L); break;
      case 'bite': for (let i = 0; i < 5; i++) { const a = Math.PI * (0.15 + i * 0.175); P.set(x + Math.round(Math.cos(a) * 3), y - Math.round(Math.sin(a) * 2) + 1, D); P.set(x + Math.round(Math.cos(a) * 3), y + Math.round(Math.sin(a) * 2) - 2, D); } break;
      case 'burn': P.disc(x, y, 2.8, 0x5a3010, 0.9); P.disc(x, y, 1.4, 0x1a0c04); P.set(x - 1, y - 2, 0xd8a060); P.set(x + 2, y, 0xd8a060); break;
      case 'fracture': for (let i = -6; i <= 6; i++) { const yy = y + ((i & 2) ? 1 : -1); P.blend(x + i, yy, 0x2a1a1a, 0.8); P.blend(x + i, yy + 1, 0xffffff, 0.35); } break;
      case 'glass': P.line(x - 1, y + 1, x + 1, y - 1, D); if (inj.foreign) { P.line(x, y, x + 2, y - 3, 0xbfeef8); P.set(x + 1, y - 2, 0xffffff); P.set(x + 3, y - 3, 0x8ad0e0); } break;
      case 'bullet': P.disc(x, y, 1.3, D); P.ring(x, y, 1.6, 0x502010, 0.8); if (inj.foreign) P.set(x, y, 0xd8a840); break;
      case 'amputation':
        if (open) { P.disc(x, y, 2.6, D); P.line(x - 3, y - 2, x - 4, y - 4, L); P.line(x + 3, y - 1, x + 4, y + 2, L); P.set(x + 1, y + 3, L); }
        else if (inj.caut) { P.disc(x, y, 2.4, 0x3a2410); P.hline(x - 2, x + 2, y, 0x140a04); }
        else P.hline(x - 3, x + 3, y, 0x1a0a0a);
        break;
    }
    if (inj.disinfected > 0 && !inj.bandage) P.ring(x, y, 2.6, 0xc87018, 0.45);
    if (inj.infection > 0.15) { const k = 0.4 + Math.sin(t * 4 + inj.id) * 0.2; P.ring(x, y, 3.2, 0xb8c43a, Math.min(0.9, k + inj.infection * 0.4)); }
    if (inj.stitched && inj.type !== 'amputation') for (let i = -1; i <= 1; i++) { P.set(x + i * 2, y - 1, 0x101010); P.set(x + i * 2 + 1, y, 0x101010); P.set(x + i * 2, y + 1, 0x101010); }
    if (inj.bandage) {
      const c = inj.bandage.clean ? 0xece4cc : 0xa89470;
      for (let i = -3; i <= 3; i++) { P.set(x + i, y + i, c); P.set(x + i + 1, y + i, shade(c, 0.85)); P.set(x + i, y - i, c); P.set(x + i + 1, y - i, shade(c, 0.85)); }
      const soak = inj.bandage.soak;
      if (soak > 0.05) P.disc(x, y, 0.8 + soak * 2.4, mix(0xb02020, 0x5a0a0a, soak), 0.85);
    }
    if (inj.splinted) { P.rect(x - 1, y - 5, 2, 11, 0x9a6a30); P.vline(x - 1, y - 5, y + 5, 0xc89050); P.hline(x - 2, x + 2, y - 3, 0xe8e0c8); P.hline(x - 2, x + 2, y + 3, 0xe8e0c8); }
    if (inj.tq != null) { P.rect(x - 2, y - 6, 5, 3, 0x1a1a1a); P.set(x - 2, y - 7, 0xb8b8b8); P.set(x + 2, y - 7, 0xb8b8b8); if (inj.tq > 2) P.set(x, y - 5, Math.floor(t * 4) % 2 ? 0xff3030 : 0x1a1a1a); }
    // wants care: a slow white blink; hovered: a bright ring
    if (hover) P.ring(x, y, 4.5, 0xffffff, 0.9);
    else if (needsCare(inj) && Math.sin(t * 5 + inj.id) > 0.55) P.ring(x, y, 4.2, 0xfff0c0, 0.5);
  }

  hit(lx: number, ly: number): Injury | null {
    let best: Injury | null = null, bd = 6.5;
    for (const h of this.holes) { const d = Math.hypot(h.x - lx, h.y - ly); if (d < bd) { bd = d; best = h.inj; } }
    return best;
  }
  holePos(inj: Injury): { x: number; y: number } | null { for (const h of this.holes) if (h.inj === inj) return h; return null; }
}
