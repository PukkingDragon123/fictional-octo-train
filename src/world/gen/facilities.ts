// Round 15 (WORLD): company facilities furnished into the levels after they are
// generated. Each is a recognisable set with a sign, loot and a lore note:
//
//   outpost      Meridian field research outpost (bench, terminal, tank, cabinet)
//   containment  an Argent-Vale Biosecure containment depot (pods, tank, barriers)
//   maint        a Meridian maintenance bay (workbench, tool chest, generator, drums)
//   survey       an abandoned Halcyon Survey camp (tent, bedroll, field table, board)
//   checkpoint   a Meridian security checkpoint with its relay booth (a checkpoint)
//   cargo        an Ostrander cargo lift, jammed, with its freight
//   server       a Meridian server closet
//   relay        a lone relay booth in an alcove (a checkpoint)
//
// Placement is a LATE post-generation hook (worldGraph.onZoneGeneratedLate): it runs
// after every other generator and hook, so older objects keep their uids and old saves'
// op logs still point at the right things. Every set backs onto a solid wall (the camp
// stands in the open), keeps a free row in front of it, stays clear of portals,
// anchors, the spawn and the press, and only goes where the entry can reach.
// The zone remembers its sets in z.meta.facilities (FacInfo[]), which the discovery
// cinematics read (src/game/cine/moments.ts).
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { objDef } from '../objects';
import { floorDef } from '../defs';
import { onZoneGeneratedLate } from '../worldGraph';
import { itemAt, itemOn } from './meridian_kit';

export type FacKind = 'outpost' | 'containment' | 'maint' | 'survey' | 'checkpoint' | 'cargo' | 'server' | 'relay';
export interface FacInfo { kind: FacKind; i: number; sign: string; name: string; company: string; x: number; y: number; sx: number; sy: number }

type Side = 'n' | 's' | 'w' | 'e';
const BACK: Record<Side, 0 | 1 | 2 | 3> = { n: 0, e: 1, s: 2, w: 3 };

interface Piece { key: string; lx: number; ly: number; state?: Record<string, unknown>; note?: string }
interface Layout {
  W: number; D: number; wall: boolean; sign: string; signLx: number;
  /** slide the plate along the wall by this many tiles (-0.5: centred over a two-tile piece) */
  signOff?: number;
  name: string; company: string; pieces: Piece[];
  /** a note dropped on the floor at (lx, ly) */
  floorNote?: [number, number, string];
  lamp?: boolean;
}

export const LAYOUTS: Record<FacKind, Layout> = {
  outpost: {
    W: 5, D: 3, wall: true, sign: 'meridian_outpost', signLx: 2, name: 'Field Outpost', company: 'Meridian Institute', lamp: true,
    pieces: [
      { key: 'lab_bench', lx: 0, ly: 0, note: 'zf_outpost_memo' },
      { key: 'terminal_lab', lx: 2, ly: 0, state: { lore: 'zf_outpost_log' } },
      { key: 'lab_cabinet', lx: 3, ly: 0, state: { loot: 'fac_outpost' } },
      { key: 'specimen_tank', lx: 4, ly: 0 },
      { key: 'chair_office', lx: 2, ly: 1 },
    ],
  },
  containment: {
    W: 5, D: 3, wall: true, sign: 'argent_depot', signLx: 2, name: 'Containment Depot', company: 'Argent-Vale Biosecure', lamp: true,
    pieces: [
      { key: 'cryo_pod', lx: 0, ly: 0 },
      { key: 'cryo_pod', lx: 1, ly: 0 },
      { key: 'crate_wood', lx: 2, ly: 0, state: { loot: 'fac_containment' } },
      { key: 'lab_cabinet', lx: 3, ly: 0, state: { loot: 'fac_containment' } },
      { key: 'specimen_tank', lx: 4, ly: 0 },
      { key: 'hazard_barrier', lx: 4, ly: 2 },
    ],
    floorNote: [3, 1, 'zf_argent_manifest'],
  },
  maint: {
    W: 5, D: 3, wall: true, sign: 'meridian_maint', signLx: 1, signOff: -0.5, name: 'Maintenance Bay', company: 'Meridian Facilities', lamp: true,
    pieces: [
      { key: 'workbench', lx: 0, ly: 0, note: 'zf_maint_order' },
      { key: 'tool_chest', lx: 2, ly: 0, state: { loot: 'fac_maint' } },
      { key: 'electrical_cabinet', lx: 3, ly: 0 },
      { key: 'generator', lx: 4, ly: 0 },
      { key: 'barrel_oil', lx: 4, ly: 2 },
    ],
  },
  survey: {
    W: 5, D: 5, wall: false, sign: 'halcyon_camp', signLx: 0, name: 'Survey Camp', company: 'Halcyon Survey Co. (defunct)',
    pieces: [
      { key: 'tent', lx: 0, ly: 0 },
      { key: 'sleeping_bag', lx: 2, ly: 0 },
      { key: 'zw_field_table', lx: 3, ly: 0, note: 'zf_halcyon_journal' },
      { key: 'zw_survey_board', lx: 3, ly: 2 },
      { key: 'zw_hard_case', lx: 0, ly: 3, state: { loot: 'fac_survey' } },
      { key: 'campfire_unlit', lx: 2, ly: 3 },
      { key: 'fac_sign_post', lx: 0, ly: 4, state: { sign: 'halcyon_camp' } },
      { key: 'zw_floodlight', lx: 4, ly: 4 },
    ],
    floorNote: [1, 2, 'zf_halcyon_notice'],
  },
  checkpoint: {
    W: 5, D: 3, wall: true, sign: 'meridian_checkpoint', signLx: 1, signOff: -0.5, name: 'Security Checkpoint', company: 'Meridian Custody', lamp: true,
    pieces: [
      { key: 'security_desk', lx: 0, ly: 0 },
      { key: 'cp_relay', lx: 2, ly: 0 },
      { key: 'filing_cabinet', lx: 3, ly: 0, state: { loot: 'fac_checkpoint' } },
      { key: 'terminal_lab', lx: 4, ly: 0, state: { lore: 'zf_checkpoint_orders' } },
      { key: 'hazard_barrier', lx: 0, ly: 2 },
    ],
    floorNote: [3, 1, 'zf_relay_manual'],
  },
  cargo: {
    W: 5, D: 3, wall: true, sign: 'ostrander_lift', signLx: 3, name: 'Cargo Lift', company: 'Ostrander Lift & Freight (defunct)',
    pieces: [
      { key: 'fac_lift_cage', lx: 0, ly: 0 },
      { key: 'shelf_metal', lx: 2, ly: 0 },
      { key: 'pallet_boxes', lx: 3, ly: 0 },
      { key: 'crate_wood', lx: 4, ly: 0, state: { loot: 'fac_cargo' } },
      { key: 'crate_wood', lx: 4, ly: 2, state: { loot: 'fac_cargo' } },
    ],
    floorNote: [2, 1, 'zf_ostrander_notice'],
  },
  server: {
    W: 4, D: 2, wall: true, sign: 'meridian_server', signLx: 1, name: 'Server Closet', company: 'Meridian I.T.', lamp: true,
    pieces: [
      { key: 'server_rack', lx: 0, ly: 0, state: { loot: 'fac_server' } },
      { key: 'server_rack', lx: 1, ly: 0 },
      { key: 'server_rack', lx: 2, ly: 0 },
      { key: 'electrical_cabinet', lx: 3, ly: 0 },
    ],
    floorNote: [1, 1, 'zf_server_note'],
  },
  relay: {
    W: 2, D: 2, wall: true, sign: 'meridian_relay', signLx: 1, name: 'Relay Booth', company: 'Meridian Institute',
    pieces: [{ key: 'cp_relay', lx: 0, ly: 0 }],
  },
};

/** what each level gets, in order (a set that does not fit is skipped) */
const PLAN: Record<string, FacKind[]> = {
  lobby: ['outpost', 'checkpoint', 'maint', 'survey', 'server', 'relay'],
  pools: ['survey', 'containment', 'relay'],
  fields: ['survey', 'relay'],
  office: ['server', 'checkpoint', 'maint'],
  stairwell: ['relay'],
  mall: ['maint', 'cargo', 'checkpoint'],
  market: ['cargo', 'relay'],
  parking: ['maint', 'cargo', 'checkpoint'],
  hospital: ['containment', 'outpost', 'relay'],
  tunnels: ['maint', 'survey', 'cargo', 'relay'],
  lab: ['containment', 'server', 'relay'],
  server: ['server', 'relay'],
  depot: ['cargo', 'checkpoint'],
  showroom: ['outpost', 'relay'],
  homestead: ['survey'],
  annex: ['containment', 'maint', 'relay'],
  undercroft: ['survey', 'containment', 'relay'],
  school: ['outpost', 'relay'],
  suburbs: ['survey', 'checkpoint'],
  meadow: ['survey'],
  ledge: ['survey', 'outpost'],
  playground: ['survey', 'relay'],
  ballhouse: ['relay'],
  moon: ['survey'],
  subway: ['maint', 'relay'],
};

const isCeil = (key: string) => !!objDef(key)?.ceiling;

/** a tile a set may stand on */
function okTile(z: Zone, x: number, y: number): boolean {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return false;
  if (floorDef(z.floor[i])?.water) return false;
  if (z.flags[i] & (TF.SHIFT | TF.STAIRS | TF.NOSPAWN | TF.CORRUPT)) return false;
  const objs = z.tileObjs.get(i);
  if (objs && objs.some((o) => !isCeil(o.key))) return false;
  return true;
}
/** a tile one can walk over (the free row in front of a set) */
function walkTile(z: Zone, x: number, y: number): boolean {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return false;
  const objs = z.tileObjs.get(i);
  return !(objs && objs.some((o) => !isCeil(o.key) && objDef(o.key)?.block === 'solid'));
}

/** BFS over walkable tiles from the entry (doors pass) */
function reachable(z: Zone, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(z.W * z.H);
  if (!z.inb(sx, sy)) return seen;
  const q = [z.idx(sx, sy)]; seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % z.W, y = (i / z.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!z.inb(X, Y)) continue;
      const j = z.idx(X, Y);
      if (seen[j] || !z.floor[j] || z.solid[j] === 1 || z.solid[j] === 3) continue;
      if (z.edgeBlocks(x, y, dx, dy, 'walk')) {
        const e = dx ? z.edge(dx > 0 ? X : x, y, 1) : z.edge(x, dy > 0 ? Y : y, 0);
        if (!(e && (e.kind === 'door' || e.kind === 'gate'))) continue;
      }
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

function entryOf(z: Zone): [number, number] {
  const sp = z.meta.spawn as [number, number] | undefined;
  if (sp) return [sp[0], sp[1]];
  const anchors = (z.meta.anchors || {}) as Record<string, number[]>;
  for (const a of Object.values(anchors)) if (a && z.inb(a[0], a[1]) && z.floor[z.idx(a[0], a[1])] && !z.solid[z.idx(a[0], a[1])]) return [a[0], a[1]];
  return [z.W >> 1, z.H >> 1];
}

/** local (along the wall, out from it) -> world tile, for a set whose rect starts at (px, py) */
function toWorld(side: Side, px: number, py: number, W: number, D: number, lx: number, ly: number): [number, number] {
  switch (side) {
    case 'n': return [px + lx, py + ly];
    case 's': return [px + W - 1 - lx, py + D - 1 - ly];
    case 'w': return [px + ly, py + W - 1 - lx];
    case 'e': return [px + D - 1 - ly, py + lx];
  }
}

interface Spot { side: Side; px: number; py: number }

/** does a set of this layout fit with its back to `side` and its rect at (px, py)? */
function fits(z: Zone, L: Layout, s: Spot, reach: Uint8Array): boolean {
  const vert = s.side === 'w' || s.side === 'e';
  const RW = vert ? L.D : L.W, RH = vert ? L.W : L.D;
  const { px, py } = s;
  for (let y = py; y < py + RH; y++) for (let x = px; x < px + RW; x++) {
    if (!okTile(z, x, y) || !reach[z.idx(x, y)]) return false;
    // no walls, doors or windows inside the rect
    if (x > px && (z.wallW[z.idx(x, y)] || z.edge(x, y, 1))) return false;
    if (y > py && (z.wallN[z.idx(x, y)] || z.edge(x, y, 0))) return false;
  }
  for (let lx = 0; lx < L.W; lx++) {
    if (L.wall) {
      // a solid wall all along the back (no door, no gap)
      const [bx, by] = toWorld(s.side, px, py, L.W, L.D, lx, 0);
      const has = s.side === 'n' ? z.wallN[z.idx(bx, by)] && !z.edge(bx, by, 0)
        : s.side === 's' ? z.inb(bx, by + 1) && z.wallN[z.idx(bx, by + 1)] && !z.edge(bx, by + 1, 0)
          : s.side === 'w' ? z.wallW[z.idx(bx, by)] && !z.edge(bx, by, 1)
            : z.inb(bx + 1, by) && z.wallW[z.idx(bx + 1, by)] && !z.edge(bx + 1, by, 1);
      if (!has) return false;
    }
    // the row in front stays walkable and open to the set (nobody gets walled in)
    const [fx, fy] = toWorld(s.side, px, py, L.W, L.D, lx, L.D - 1);
    const [ox, oy] = toWorld(s.side, px, py, L.W, L.D, lx, L.D);
    if (!walkTile(z, ox, oy) || z.edgeBlocks(fx, fy, ox - fx, oy - fy, 'walk')) return false;
  }
  return true;
}

function placeSet(z: Zone, b: ZoneBuilder, f: Furnisher, rng: Rng, kind: FacKind, L: Layout, s: Spot, i: number): FacInfo {
  const rot = L.wall ? BACK[s.side] : 0;
  const placed: TileObject[] = [];
  for (const p of L.pieces) {
    const d = objDef(p.key);
    if (!d) continue;
    const fw = d.w ?? 1, fd = d.d ?? 1;
    // the footprint's world top-left: the smallest corner of its local cells
    const a = toWorld(s.side, s.px, s.py, L.W, L.D, p.lx, p.ly);
    const c = toWorld(s.side, s.px, s.py, L.W, L.D, p.lx + fw - 1, p.ly + fd - 1);
    const wx = Math.min(a[0], c[0]), wy = Math.min(a[1], c[1]);
    const o = f.place(p.key, wx, wy, rot, { ...(p.state || {}), fac: kind });
    if (!o) continue;
    placed.push(o);
    if (p.note) itemOn(z, rng, 'note', o, { lore: p.note }, 0.3, 0);
  }
  if (L.floorNote) {
    const [nx, ny] = toWorld(s.side, s.px, s.py, L.W, L.D, L.floorNote[0], L.floorNote[1]);
    itemAt(z, rng, 'note', nx, ny, 0.01, { lore: L.floorNote[2] }, 0.25);
  }
  // the plate on the wall above the set (or on its post in the camp)
  const [sx, sy] = toWorld(s.side, s.px, s.py, L.W, L.D, L.signLx, 0);
  if (L.wall && !z.objectsAt(sx, sy).some((o) => objDef(o.key)?.onWall)) {
    const [ux, uy] = toWorld(s.side, s.px, s.py, L.W, L.D, L.signLx + 1, 0);
    const k = L.signOff ?? 0;
    b.obj('fac_sign', sx, sy, BACK[s.side], { sign: L.sign }, k ? { ox: (ux - sx) * k, oz: (uy - sy) * k } : {});
  }
  // a working light over it (on the room's own circuit, so a dead circuit leaves it dark)
  if (L.lamp) {
    const [cx, cy] = toWorld(s.side, s.px, s.py, L.W, L.D, Math.floor(L.W / 2), 1);
    const lit = z.objectsAt(cx, cy).some((o) => isCeil(o.key));
    if (!lit && objDef('light_fluoro')) b.obj('light_fluoro', cx, cy, 0, { circuit: z.roomAt(cx, cy).circuit, flicker: rng.chance(0.3) ? 0.12 : 0 });
  }
  const [mx, my] = toWorld(s.side, s.px, s.py, L.W, L.D, Math.floor(L.W / 2), Math.floor(L.D / 2));
  void placed;
  return { kind, i, sign: L.sign, name: L.name, company: L.company, x: mx, y: my, sx, sy };
}

/** furnish one zone with its companies' sets */
export function placeFacilities(z: Zone, seed: number) {
  const base = z.key.split('~')[0];
  const plan = PLAN[base];
  if (!plan || !plan.length) return;
  const rng = new Rng(hash3(seed, 0xfac1, 15));
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const [ex, ey] = entryOf(z);
  const reach = reachable(z, ex, ey);
  let floor = 0;
  for (let i = 0; i < reach.length; i++) if (reach[i]) floor++;
  const cap = floor < 1500 ? 1 : floor < 4000 ? 2 : floor < 9000 ? 4 : 6;
  // keep-out points: portals, anchors, the spawn, the press and kiosk
  const keep: [number, number, number][] = [[ex, ey, 7]];
  for (const p of z.portals) if (p.kind !== 'loop') keep.push([p.x, p.y, 6]);
  for (const a of Object.values((z.meta.anchors || {}) as Record<string, number[]>)) if (a) keep.push([a[0], a[1], 5]);
  for (const o of z.objects.values()) {
    if (o.key === 'hopper' || o.key === 'ticket_kiosk' || o.key === 'seam_door' || o.key === 'exit_doorway') keep.push([o.x, o.y, 5]);
    else if (objDef(o.key)?.tags?.includes('portal')) keep.push([o.x, o.y, 5]);
  }
  const clear = (x0: number, y0: number, x1: number, y1: number) => !keep.some(([kx, ky, r]) => kx >= x0 - r && kx <= x1 + r && ky >= y0 - r && ky <= y1 + r);
  // candidate rect corners, in a seeded order
  const cand: number[] = [];
  for (let y = 1; y < z.H - 1; y++) for (let x = 1; x < z.W - 1; x++) if (reach[z.idx(x, y)]) cand.push(z.idx(x, y));
  rng.shuffle(cand);
  const out: FacInfo[] = [];
  const sides: Side[] = ['n', 's', 'w', 'e'];
  for (const kind of plan) {
    if (out.length >= cap) break;
    const L = LAYOUTS[kind];
    let got: Spot | null = null;
    let tried = 0;
    for (const ci of cand) {
      if (++tried > 60000) break;
      const x = ci % z.W, y = (ci / z.W) | 0;
      for (const side of (L.wall ? sides : (['n'] as Side[]))) {
        const vert = side === 'w' || side === 'e';
        const RW = vert ? L.D : L.W, RH = vert ? L.W : L.D;
        if (!clear(x, y, x + RW - 1, y + RH - 1)) continue;
        const s = { side, px: x, py: y };
        if (fits(z, L, s, reach)) { got = s; break; }
      }
      if (got) break;
    }
    if (!got) continue;
    const info = placeSet(z, b, f, rng, kind, L, got, out.length);
    out.push(info);
    const vert = got.side === 'w' || got.side === 'e';
    keep.push([got.px + ((vert ? L.D : L.W) >> 1), got.py + ((vert ? L.W : L.D) >> 1), 9]);
  }
  if (out.length) z.meta.facilities = out;
}

let installed = false;
export function installFacilities() {
  if (installed) return;
  installed = true;
  onZoneGeneratedLate(placeFacilities);
}
