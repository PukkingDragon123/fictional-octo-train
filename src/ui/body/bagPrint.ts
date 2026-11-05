// The IV bag's print: what is printed and stuck on its front panel, painted
// into a small pixel texture. A typed paper label (red cross, BLOOD 500ML),
// a body pictogram in faint ink, graduation ticks, and every wound as a hole in
// the plastic at its place on the pictogram: slits, tooth marks, scorches,
// creases, shards; tape crosses, stitches, iodine rings, splints, clips.
import type { Injury } from '../../survival/body';
import type { BodyPart } from '../../items/item';
import { Pix, mix, shade, hash } from './pix';
import { inkText, FONT } from './stage';
import { needsCare } from './treat';

export const PRINT_W = 32, PRINT_H = 56;
const CX = 16, FY = 14;

/** pictogram position of each body part (x from the centre, y from FY); the survivor faces you */
const PART_AT: Record<BodyPart, [number, number]> = {
  head: [0, 7], neck: [0, 11], torso_u: [0, 15], torso_l: [0, 20], groin: [0, 25],
  uarm_r: [-6, 15], farm_r: [-8, 21], hand_r: [-10, 26], uarm_l: [6, 15], farm_l: [8, 21], hand_l: [10, 26],
  thigh_r: [-3, 30], shin_r: [-3.5, 36], foot_r: [-4, 41], thigh_l: [3, 30], shin_l: [3.5, 36], foot_l: [4, 41],
};

/** where a wound sits on the print (texture pixels) */
export function holeAt(inj: Injury): [number, number] {
  const a = PART_AT[inj.part] || [0, 20];
  const ox = Math.round((hash(inj.id, 3) - 0.5) * 3), oy = Math.round((hash(inj.id, 9) - 0.5) * 3);
  return [CX + a[0] + ox, FY + a[1] + oy];
}

export class BagPrint {
  paint(P: Pix, injuries: Injury[], severed: BodyPart[], hover: Injury | null, t: number) {
    P.clear();
    this.drawLabel(P);
    for (let i = 1; i < 6; i++) { const y = Math.round(PRINT_H - 4 - i * 6.5); P.hline(PRINT_W - 5, PRINT_W - 3, y, 0x1a1a1a, 0.5); if (i % 2 === 0) P.blend(PRINT_W - 6, y, 0x1a1a1a, 0.5); }
    this.drawFigure(P, severed);
    for (const inj of injuries) { const [x, y] = holeAt(inj); this.drawHole(P, x, y, inj, inj === hover, t); }
  }
  private drawLabel(P: Pix) {
    const x0 = 2, x1 = PRINT_W - 3, y0 = 1, y1 = 13;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let c = 0xeee4c6;
      if (y === y0 || y === y1) c = 0xc8b890;
      else if (hash(x, y, 4) < 0.08) c = 0xe0d4b0;
      if (x === x0 || x === x1) c = shade(c, 0.88);
      P.set(x, y, c);
    }
    P.rect(x0 + 3, y0 + 3, 2, 6, 0xb82a22, 0.9); P.rect(x0 + 1, y0 + 5, 6, 2, 0xb82a22, 0.9);
  }
  /** the label's typed lines, in real type at the texture's full resolution */
  type(c: CanvasRenderingContext2D, k: number) {
    inkText(c, 'BLOOD', 10 * k, 7 * k, 5.6 * k, FONT.type, '#231a12', 'left', '700');
    inkText(c, '500 ML', 10 * k, 12 * k, 4.2 * k, FONT.typeset, '#3a2a1e', 'left', '600');
  }
  private drawFigure(P: Pix, severed: BodyPart[]) {
    const ink = 0x200a0a, a = 0.3;
    const pt = (dx: number, dy: number) => [CX + dx, FY + dy] as const;
    P.ring(CX, FY + 7, 2.6, ink, a);
    const seg = (pa: readonly [number, number], pb: readonly [number, number], gone: boolean) => {
      if (!gone) P.line(pa[0], pa[1], pb[0], pb[1], ink, a);
      else for (let i = 0; i <= 6; i += 2) { const t = i / 6; P.blend(Math.round(pa[0] + (pb[0] - pa[0]) * t), Math.round(pa[1] + (pb[1] - pa[1]) * t), 0x2a2a2a, 0.7); }
    };
    seg(pt(0, 10), pt(0, 25), false); seg(pt(-4, 12), pt(4, 12), false); seg(pt(-3, 25), pt(3, 25), false);
    const limb = (a1: BodyPart, a2: BodyPart, a3: BodyPart, from: readonly [number, number]) => {
      const p1 = pt(...PART_AT[a1]), p2 = pt(...PART_AT[a2]), p3 = pt(...PART_AT[a3]);
      seg(from, p1, severed.includes(a1)); seg(p1, p2, severed.includes(a2)); seg(p2, p3, severed.includes(a3));
    };
    limb('uarm_r', 'farm_r', 'hand_r', pt(-4, 12)); limb('uarm_l', 'farm_l', 'hand_l', pt(4, 12));
    limb('thigh_r', 'shin_r', 'foot_r', pt(-3, 25)); limb('thigh_l', 'shin_l', 'foot_l', pt(3, 25));
  }

  private drawHole(P: Pix, x: number, y: number, inj: Injury, hover: boolean, t: number) {
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

}
