// Where the dead are: after a zone generates (the generators' post-generation
// hook, src/world/worldGraph.ts onZoneGenerated), lay remains scenes from
// ./kit.ts through it. Bodies end up where bodies do: against walls, in
// corners, at the end of a drag. Each scene is a few pieces: the remains, an
// old pool under them, a drag trail or footprints leading off, a handprint on
// the wall, sometimes the unit's last note. Deterministic per zone seed (every
// peer lays the same ones). Kept sparse so the rooms read as lived-in, not
// as a slaughterhouse: the lobby gets a dozen-odd sites in its 160x160.
import { onZoneGenerated } from '../worldGraph';
import type { Zone } from '../zone';
import { TF } from '../zone';
import { ZoneBuilder } from '../gen/builder';
import { Furnisher } from '../gen/furnish';
import { Rng, hash3 } from '../../core/rng';
import { objDef } from '../objects';
import { causesFor } from './life';

type Scene = 'unit' | 'bones' | 'carcass' | 'gore';
interface Plan { n: number; stains: number; w: [Scene, number][]; carc: number[]; eaten: [number, number] }
const PLANS: Record<string, Plan> = {
  lobby: { n: 14, stains: 26, w: [['unit', 3], ['bones', 3], ['gore', 2], ['carcass', 1.2]], carc: [1, 1, 0], eaten: [0, 2] },
  ledge: { n: 10, stains: 12, w: [['carcass', 3], ['unit', 2], ['gore', 2], ['bones', 1.5]], carc: [2, 2, 0, 1], eaten: [1, 3] },
  tunnels: { n: 14, stains: 22, w: [['unit', 3], ['bones', 3], ['carcass', 2], ['gore', 2]], carc: [0, 1], eaten: [0, 2] },
  undercroft: { n: 9, stains: 12, w: [['bones', 4], ['unit', 2], ['gore', 1], ['carcass', 1]], carc: [0, 1], eaten: [1, 3] },
  office: { n: 4, stains: 8, w: [['unit', 2], ['gore', 1], ['bones', 1]], carc: [1], eaten: [0, 1] },
  hospital: { n: 5, stains: 10, w: [['unit', 2], ['gore', 2], ['bones', 1]], carc: [1], eaten: [0, 1] },
  parking: { n: 4, stains: 6, w: [['carcass', 2], ['bones', 2], ['unit', 1]], carc: [0, 1], eaten: [0, 2] },
  stairwell: { n: 3, stains: 6, w: [['unit', 2], ['bones', 2]], carc: [1], eaten: [0, 2] },
  server: { n: 3, stains: 4, w: [['unit', 2], ['bones', 1]], carc: [1], eaten: [1, 2] },
  pools: { n: 3, stains: 4, w: [['bones', 2], ['carcass', 1]], carc: [0], eaten: [1, 3] },
};
/** the notes the dead were writing */
export const LAST_NOTES = ['rm_note_count', 'rm_note_bees', 'rm_note_sorry', 'rm_note_map', 'rm_note_hum'];

const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function walls(z: Zone, x: number, y: number): boolean[] {
  // n, e, s, w
  const n = z.wallN[z.idx(x, y)] > 0 && !z.edges.has(z.idx(x, y) * 2);
  const w = z.wallW[z.idx(x, y)] > 0 && !z.edges.has(z.idx(x, y) * 2 + 1);
  const s = z.inb(x, y + 1) && z.wallN[z.idx(x, y + 1)] > 0 && !z.edges.has(z.idx(x, y + 1) * 2);
  const e = z.inb(x + 1, y) && z.wallW[z.idx(x + 1, y)] > 0 && !z.edges.has(z.idx(x + 1, y) * 2 + 1);
  return [n, e, s, w];
}
function okTile(z: Zone, b: ZoneBuilder, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i] || (z.flags[i] & (TF.NOSPAWN | TF.SAFE | TF.STAIRS)) || z.height[i] < -2) return false;
  return b.free(x, y, 1, 1, false);
}
/** a wall decal (a handprint, a smear) on the wall beside tile (x, y), seen from inside it */
function wallMark(z: Zone, x: number, y: number, side: number, tex: string, rng: Rng, h = rng.float(0.5, 1.3), size = rng.float(0.28, 0.4)) {
  const off = rng.float(0.25, 0.75);
  const d = side === 0 ? { x: x + off, z: y + 0.07, rot: Math.PI / 2 } : side === 2 ? { x: x + off, z: y + 0.93, rot: -Math.PI / 2 } : side === 3 ? { x: x + 0.07, z: y + off, rot: 0 } : { x: x + 0.93, z: y + off, rot: Math.PI };
  z.decals.push({ ...d, y: h, w: size, d: size * (tex === 'rm_smear' ? 1.6 : 1), tex, vert: 1, alpha: 0.9 });
}
function floorMark(z: Zone, tex: string, x: number, y: number, w: number, d: number, rot: number, alpha = 0.9) {
  z.decals.push({ x, z: y, w, d, rot, tex, alpha });
}
/** a trail of drag marks or footprints from (x, y) along a cardinal direction while the floor allows */
function trail(z: Zone, b: ZoneBuilder, x: number, y: number, dir: [number, number], len: number, tex: string, rng: Rng) {
  let cx = x, cy = y;
  for (let k = 1; k <= len; k++) {
    const nx = cx + dir[0], ny = cy + dir[1];
    if (!z.inb(nx, ny) || !z.floor[z.idx(nx, ny)] || !z.canStep(cx, cy, dir[0], dir[1])) break;
    cx = nx; cy = ny;
    const along = dir[0] === 0 ? 0 : Math.PI / 2;
    floorMark(z, tex, cx + 0.5 + rng.float(-0.08, 0.08), cy + 0.5 + rng.float(-0.08, 0.08), tex === 'rm_prints' ? 0.45 : 0.62, tex === 'rm_prints' ? 0.9 : 1.05, along + (dir[0] + dir[1] > 0 ? Math.PI : 0), Math.max(0.35, 0.9 - k * 0.09));
  }
  void b;
}

function site(z: Zone, b: ZoneBuilder, rng: Rng): [number, number, boolean[]] | null {
  const sp = Array.isArray(z.meta.spawn) ? (z.meta.spawn as number[]) : null;
  let best: [number, number, boolean[]] | null = null, bs = -1;
  for (let t = 0; t < 26; t++) {
    const p = z.randomFloor(rng, (x, y) => okTile(z, b, x, y), 60);
    if (!p) continue;
    const [x, y] = p;
    if (sp && Math.hypot(x - sp[0], y - sp[1]) < 11) continue;
    if (z.objects.size && hasRemainsNear(z, x, y, 7)) continue;
    const w = walls(z, x, y);
    const nw = w.filter(Boolean).length;
    const score = nw === 2 ? 3 : nw === 1 ? 2 : nw === 3 ? 1.5 : 0.4 + rng.next();
    if (score > bs) { bs = score; best = [x, y, w]; }
    if (bs >= 3) break;
  }
  return best;
}
function hasRemainsNear(z: Zone, x: number, y: number, r: number) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const l = z.inb(x + i, y + j) ? z.tileObjs.get(z.idx(x + i, y + j)) : null;
    if (l && l.some((o) => o.key.startsWith('rm_'))) return true;
  }
  return false;
}

function lay(z: Zone, b: ZoneBuilder, f: Furnisher, rng: Rng, plan: Plan, kind: Scene, x: number, y: number, w: boolean[], i: number) {
  const causes = causesFor(z.key);
  const base = { cause: rng.int(0, causes.length - 1), days: rng.int(2, 60), eaten: rng.int(plan.eaten[0], plan.eaten[1]) };
  const wallSide = w.findIndex(Boolean);
  const away: [number, number] = wallSide >= 0 ? [-DIRS[wallSide][0], -DIRS[wallSide][1]] : DIRS[rng.int(0, 3)];
  if (kind === 'unit' || kind === 'carcass') {
    // lie along the wall: rot 0 runs east-west (needs x+1 free), rot 1 north-south (needs y+1 free)
    const key = kind === 'unit' ? 'rm_unit' : 'rm_carcass';
    const prefer: (0 | 1)[] = wallSide === 0 || wallSide === 2 ? [0, 1] : [1, 0];
    let placed = false;
    for (const rot of prefer) {
      const [dx, dy] = rot === 0 ? [1, 0] : [0, 1];
      if (!okTile(z, b, x + dx, y + dy) || !z.canStep(x, y, dx, dy)) continue;
      const v = kind === 'unit' ? rng.int(0, 2) : rng.pick(plan.carc);
      const flip = rng.chance(0.5) ? 2 : 0;
      if (b.obj(key, x, y, (rot + flip) as 0 | 1 | 2 | 3, { ...base, v })) {
        placed = true;
        const cx = x + 0.5 + dx * 0.5, cy = y + 0.5 + dy * 0.5;
        floorMark(z, 'rm_pool', cx + rng.float(-0.2, 0.2), cy + rng.float(-0.2, 0.2), rng.float(1.4, 2.0), rng.float(1.1, 1.5), rng.float(0, 6.28), 0.82);
        if (rng.chance(kind === 'unit' ? 0.55 : 0.4)) trail(z, b, x, y, away, rng.int(3, 7), 'rm_trail', rng);
        if (kind === 'unit' && wallSide >= 0 && rng.chance(0.75)) { wallMark(z, x, y, wallSide, 'rm_hand', rng, rng.float(0.35, 0.9)); if (rng.chance(0.5)) wallMark(z, x, y, wallSide, 'rm_smear', rng, rng.float(0.3, 0.7), 0.5); }
        if (kind === 'unit' && rng.chance(0.4)) { const nx = x + away[0], ny = y + away[1]; if (okTile(z, b, nx, ny)) f.floorItem('note', nx, ny, { lore: LAST_NOTES[(i + rng.int(0, 4)) % LAST_NOTES.length] }); }
        if (kind === 'carcass') {
          floorMark(z, 'rm_spatter', cx + rng.float(-0.6, 0.6), cy + rng.float(-0.6, 0.6), 1.2, 1.2, rng.float(0, 6.28), 0.85);
          const gx = x + away[0], gy = y + away[1];
          if (rng.chance(0.5) && okTile(z, b, gx, gy)) b.obj('rm_gore_pile', gx, gy, 0, { ...base, v: rng.int(0, 2), yaw: rng.float(0, 6.28) });
        }
        break;
      }
    }
    if (placed) return;
    kind = 'bones';
  }
  if (kind === 'gore') {
    b.obj('rm_gore_pile', x, y, 0, { ...base, v: rng.int(0, 2), yaw: rng.float(0, 6.28) });
    floorMark(z, 'rm_pool', x + 0.5, y + 0.5, rng.float(1.1, 1.6), rng.float(1.0, 1.4), rng.float(0, 6.28), 0.8);
    trail(z, b, x, y, away, rng.int(2, 5), 'rm_prints', rng);
    if (wallSide >= 0 && rng.chance(0.5)) wallMark(z, x, y, wallSide, 'rm_smear', rng, rng.float(0.3, 1.0), 0.45);
    return;
  }
  // bones: one heap, sometimes a second, a smear where they were dragged apart
  b.obj('rm_bones', x, y, 0, { ...base, v: rng.int(0, 2), yaw: rng.float(0, 6.28) });
  floorMark(z, 'rm_smear', x + 0.5 + away[0] * 0.4, y + 0.5 + away[1] * 0.4, 1.0, 1.0, rng.float(0, 6.28), 0.6);
  const bx = x + away[0], by = y + away[1];
  if (rng.chance(0.45) && okTile(z, b, bx, by)) b.obj('rm_bones', bx, by, 0, { ...base, v: rng.int(0, 2), yaw: rng.float(0, 6.28) });
}

/** loose marks: a spatter, a handprint on a wall, a smear, old prints going somewhere */
function stains(z: Zone, b: ZoneBuilder, rng: Rng, n: number) {
  for (let k = 0; k < n; k++) {
    const p = z.randomFloor(rng, (x, y) => okTile(z, b, x, y), 80);
    if (!p) continue;
    const [x, y] = p;
    const w = walls(z, x, y), ws = w.findIndex(Boolean);
    const r = rng.next();
    if (ws >= 0 && r < 0.4) { wallMark(z, x, y, ws, rng.chance(0.6) ? 'rm_hand' : 'rm_smear', rng); if (rng.chance(0.35)) wallMark(z, x, y, ws, 'rm_hand', rng); }
    else if (r < 0.6) floorMark(z, 'rm_spatter', x + 0.5, y + 0.5, rng.float(0.7, 1.2), rng.float(0.7, 1.2), rng.float(0, 6.28), 0.7);
    else if (r < 0.8) trail(z, b, x, y, DIRS[rng.int(0, 3)], rng.int(2, 5), rng.chance(0.5) ? 'rm_prints' : 'rm_trail', rng);
    else floorMark(z, 'rm_smear', x + 0.5, y + 0.5, rng.float(0.8, 1.2), rng.float(0.8, 1.2), rng.float(0, 6.28), 0.65);
  }
}

onZoneGenerated((z, seed) => {
  const plan = PLANS[z.key];
  if (!plan || !objDef('rm_bones')) return;
  const rng = new Rng(hash3(seed, 9301, 17));
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  // scale the count to the zone's size (the plans are for the full-size levels)
  const n = Math.max(2, Math.round(plan.n * Math.min(1.3, (z.W * z.H) / (160 * 160) * (z.key === 'ledge' || z.key === 'undercroft' ? 2.4 : 1))));
  for (let i = 0; i < n; i++) {
    const s = site(z, b, rng);
    if (!s) continue;
    lay(z, b, f, rng, plan, rng.weighted(plan.w), s[0], s[1], s[2], i);
  }
  stains(z, b, rng, plan.stains);
});
