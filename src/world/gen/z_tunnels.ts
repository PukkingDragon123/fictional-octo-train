// Service Tunnels (160×160, depth 3). The concrete underside of the memory
// regions: a real maze of utility tunnels laid on a 6-tile lattice, threaded
// by a few 3-wide trunk mains with pipes and cable trays, and anchored by
// numbered junctions you learn to navigate by:
//   J1 Drain Inflow (ladder up into the Poolrooms' dry end)
//   J2 the hospital stairs (St. Aldric's basement)
//   J3 the Elm St manhole (ladder up to the suburbs, dusk light falling down it)
//   J5 the pump station          J6 the Cistern: a flooded pillared reservoir
//   J7 the Compass: arrows painted in circles, and a tunnel marked "J4" that
//      never ends (a seamless loop with one wrong door in it)
//   J8 the substation            J9 the boiler hall (Sato's kit behind the boiler)
//   J4 FACILITY 4: the blast door with its keypad, the beacon, Sato's body.
// The West Main is collapsed between J5 and J8, the north main floods past J2,
// the south-east is dark, and five maze blocks re-dig themselves when nobody
// is watching. Arrows in the maze go around in circles, and a service door in
// the substation opens in J3, on the other side of the map (and back).
// Small boiler rooms, pump rooms, stores, crew rooms and camps are dug into
// the rock between the passages.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { floorId, wallId } from '../defs';
import { registerShift } from '../shift';
import { connectRegions } from './connect';
import { stash } from './meridian_kit';
import {
  Regions, Rect, rect, inRect, overlaps, mount, bulb, decalAt, stencil, arrow, anchorAt, scatterLoot, freeTile, put,
  BACK, FACE, Rot, Side,
} from './deep_kit';

const NI = 25;                          // lattice nodes per axis
const C = (i: number) => 6 + 6 * i;     // node centre tile
const nid = (i: number, j: number) => j * NI + i;
const R_COR = 1, R_LOOP = 2;
const DIRS: [number, number, Side][] = [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']];
const lanes = (c: number, w: number): [number, number] => (w <= 1 ? [c, c] : w === 2 ? [c, c + 1] : [c - 1, c + 1]);
const lmRect = (i0: number, i1: number, j0: number, j1: number) => rect(C(i0) - 3, C(j0) - 3, C(i1) + 3, C(j1) + 3);

interface Port { i: number; j: number; dir: Side; w: number }
interface Landmark { key: string; r: Rect; id: number; ports: Port[]; trunk: boolean }
interface Block { id: string; i0: number; i1: number; j0: number; j1: number; r: Rect; cross: { o: number; n: number; w: number }[]; circuit: number }

/** sector circuit: 1..9 by 3×3 sectors; 9 (south-east) is dead */
const sectorCircuit = (x: number, y: number) => 1 + Math.min(2, Math.floor(x / 54)) + 3 * Math.min(2, Math.floor(y / 54));
const DEAD = 9;

function generateTunnels(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const R = new Regions(z);
  z.name = 'Service Tunnels';
  const W = z.W, H = z.H;

  // =====================================================================
  // PLAN: landmarks on the lattice, the loop tunnel, shifting maze blocks
  // =====================================================================
  const L: Record<string, Landmark> = {};
  const lm = (key: string, r: Rect, ports: Port[], trunk = true) => (L[key] = { key, r, id: R.next(), ports, trunk });
  lm('J1', lmRect(3, 4, 2, 3), [{ i: 3, j: 4, dir: 'n', w: 3 }, { i: 5, j: 3, dir: 'w', w: 3 }, { i: 2, j: 2, dir: 'e', w: 2 }]);
  lm('J2', lmRect(12, 13, 1, 2), [{ i: 12, j: 3, dir: 'n', w: 3 }, { i: 11, j: 2, dir: 'e', w: 2 }, { i: 14, j: 1, dir: 'w', w: 2 }]);
  lm('J3', lmRect(21, 22, 2, 3), [{ i: 20, j: 3, dir: 'e', w: 3 }, { i: 22, j: 4, dir: 'n', w: 2 }, { i: 23, j: 2, dir: 'w', w: 1 }]);
  lm('J5', lmRect(2, 4, 11, 13), [{ i: 3, j: 10, dir: 's', w: 3 }, { i: 3, j: 14, dir: 'n', w: 3 }, { i: 5, j: 12, dir: 'w', w: 3 }, { i: 1, j: 12, dir: 'e', w: 1 }]);
  lm('J6', lmRect(10, 14, 10, 14), [
    { i: 9, j: 12, dir: 'e', w: 3 }, { i: 12, j: 9, dir: 's', w: 3 }, { i: 12, j: 15, dir: 'n', w: 3 }, { i: 15, j: 11, dir: 'w', w: 3 },
    { i: 10, j: 9, dir: 's', w: 2 }, { i: 15, j: 14, dir: 'w', w: 2 }, { i: 14, j: 15, dir: 'n', w: 1 }, { i: 9, j: 10, dir: 'e', w: 1 },
  ]);
  lm('J7', lmRect(21, 22, 10, 11), [{ i: 20, j: 11, dir: 'e', w: 3 }, { i: 21, j: 9, dir: 's', w: 2 }, { i: 23, j: 10, dir: 'w', w: 2 }]);
  lm('J8', lmRect(3, 4, 20, 21), [{ i: 3, j: 19, dir: 's', w: 3 }, { i: 5, j: 21, dir: 'w', w: 3 }, { i: 4, j: 22, dir: 'n', w: 2 }]);
  lm('J9', lmRect(10, 12, 20, 22), [{ i: 9, j: 21, dir: 'e', w: 3 }, { i: 12, j: 19, dir: 's', w: 3 }, { i: 13, j: 21, dir: 'w', w: 2 }, { i: 10, j: 19, dir: 's', w: 1 }]);
  lm('J4', lmRect(20, 22, 21, 22), [{ i: 19, j: 21, dir: 'e', w: 2 }, { i: 21, j: 23, dir: 'n', w: 2 }, { i: 23, j: 22, dir: 'w', w: 1 }], false);
  const VEST = rect(131, 125, 133, 128);                 // behind the blast door
  const LOOP = rect(131, 76, 133, 120);                  // the tunnel marked J4
  const LOOP_A = 85, LOOP_B = 112, LOOP_D = 24;          // triggers and period
  const EXITR = rect(128, 95, 130, 101);                 // the one wrong door leads here
  const blocks: Block[] = [
    { id: 'tun_maze_nw', i0: 6, i1: 8, j0: 5, j1: 8 },
    { id: 'tun_maze_ne', i0: 15, i1: 18, j0: 5, j1: 8 },
    { id: 'tun_maze_e', i0: 16, i1: 18, j0: 14, j1: 17 },
    { id: 'tun_maze_sw', i0: 5, i1: 8, j0: 16, j1: 18 },
    { id: 'tun_maze_se', i0: 15, i1: 18, j0: 20, j1: 23 },
  ].map((q) => ({ ...q, r: lmRect(q.i0, q.i1, q.j0, q.j1), cross: [], circuit: 0 }));
  for (const bl of blocks) bl.circuit = bl.id === 'tun_maze_se' ? DEAD : sectorCircuit(C(Math.floor((bl.i0 + bl.i1) / 2)), C(Math.floor((bl.j0 + bl.j1) / 2)));

  // ---------------------------------------------------------------- lattice state
  const N = NI * NI;
  const blocked = new Uint8Array(N);      // 1 landmark/loop, 2 shift block
  const blockOf = new Int8Array(N).fill(-1);
  const deg = new Uint8Array(N);
  const E = new Map<number, number>();    // edge key -> width
  const trunkE = new Set<number>();
  const ek = (a: number, c: number) => (a < c ? a * 1024 + c : c * 1024 + a);
  const setEdge = (a: number, c: number, w: number) => { const k = ek(a, c); if (!E.has(k)) { deg[a]++; deg[c]++; } E.set(k, Math.max(w, E.get(k) ?? 0)); };
  const hasEdge = (a: number, c: number) => E.has(ek(a, c));
  const ij = (n: number): [number, number] => [n % NI, Math.floor(n / NI)];
  const nodeIn = (r: Rect, i: number, j: number, m = 2) => C(i) >= r.x0 - m && C(i) <= r.x1 + m && C(j) >= r.y0 - m && C(j) <= r.y1 + m;
  for (let j = 0; j < NI; j++) for (let i = 0; i < NI; i++) {
    for (const l of Object.values(L)) if (nodeIn(l.r, i, j)) blocked[nid(i, j)] = 1;
    if (nodeIn(LOOP, i, j) || nodeIn(VEST, i, j) || nodeIn(EXITR, i, j, 1)) blocked[nid(i, j)] = 1;
    blocks.forEach((bl, k) => { if (i >= bl.i0 && i <= bl.i1 && j >= bl.j0 && j <= bl.j1) { blocked[nid(i, j)] = 2; blockOf[nid(i, j)] = k; } });
  }

  // trunk mains (3 wide)
  const trunkLine = (i0: number, j0: number, i1: number, j1: number) => {
    const di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
    for (let i = i0, j = j0; i !== i1 || j !== j1; i += di, j += dj) {
      const a = nid(i, j), c = nid(i + di, j + dj);
      setEdge(a, c, 3); trunkE.add(ek(a, c));
    }
  };
  const TRUNKS: { a: [number, number]; b: [number, number]; from: string; to: string }[] = [
    { a: [5, 3], b: [20, 3], from: 'J1', to: 'J3' },
    { a: [3, 4], b: [3, 10], from: 'J1', to: 'J5' },
    { a: [3, 14], b: [3, 19], from: 'J5', to: 'J8' },
    { a: [5, 12], b: [9, 12], from: 'J5', to: 'J6' },
    { a: [12, 3], b: [12, 9], from: 'J2', to: 'J6' },
    { a: [15, 11], b: [20, 11], from: 'J6', to: 'J7' },
    { a: [12, 15], b: [12, 19], from: 'J6', to: 'J9' },
    { a: [5, 21], b: [9, 21], from: 'J8', to: 'J9' },
  ];
  for (const t of TRUNKS) trunkLine(t.a[0], t.a[1], t.b[0], t.b[1]);
  // the exit room of the loop tunnel opens onto this stretch of maze
  setEdge(nid(20, 15), nid(20, 16), 2);

  // crossings into the shifting blocks (fixed for every variant)
  blocks.forEach((bl, k) => {
    const sides: [number, number, number, number][] = []; // inner i,j -> outer i,j
    for (let i = bl.i0; i <= bl.i1; i++) { sides.push([i, bl.j0, i, bl.j0 - 1]); sides.push([i, bl.j1, i, bl.j1 + 1]); }
    for (let j = bl.j0; j <= bl.j1; j++) { sides.push([bl.i0, j, bl.i0 - 1, j]); sides.push([bl.i1, j, bl.i1 + 1, j]); }
    rng.shuffle(sides);
    let made = 0;
    const used = new Set<string>();
    for (const [i, j, oi, oj] of sides) {
      if (made >= 5) break;
      if (oi < 0 || oj < 0 || oi >= NI || oj >= NI || blocked[nid(oi, oj)]) continue;
      const side = oj < bl.j0 ? 'n' : oj > bl.j1 ? 's' : oi < bl.i0 ? 'w' : 'e';
      if (used.has(side) && made >= 3) continue;
      used.add(side);
      const w = rng.chance(0.6) ? 2 : 1;
      setEdge(nid(oi, oj), nid(i, j), w);
      bl.cross.push({ o: nid(oi, oj), n: nid(i, j), w });
      made++;
    }
    void k;
  });

  // ---------------------------------------------------------------- the maze (growing tree from the network)
  const visited = new Uint8Array(N);
  const active: number[] = [];
  const seedNode = (n: number) => { if (!visited[n] && !blocked[n]) { visited[n] = 1; active.push(n); } };
  for (const k of trunkE) { seedNode(Math.floor(k / 1024)); seedNode(k % 1024); }
  for (const l of Object.values(L)) if (l.trunk) for (const p of l.ports) seedNode(nid(p.i, p.j));
  const nbrs = (n: number) => {
    const [i, j] = ij(n);
    const out: number[] = [];
    for (const [di, dj] of DIRS) { const I = i + di, J = j + dj; if (I >= 0 && J >= 0 && I < NI && J < NI && !blocked[nid(I, J)]) out.push(nid(I, J)); }
    return out;
  };
  const grow = () => {
    while (active.length) {
      const k = rng.chance(0.72) ? active.length - 1 : rng.int(0, active.length - 1);
      const n = active[k];
      const cand = nbrs(n).filter((m) => !visited[m]);
      if (!cand.length) { active.splice(k, 1); continue; }
      const m = rng.pick(cand);
      setEdge(n, m, rng.weighted([[2, 5], [1, 4]] as [number, number][]));
      visited[m] = 1; active.push(m);
    }
  };
  grow();
  // stragglers (pockets walled in by landmarks): attach them to anything visited
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let n = 0; n < N; n++) {
      if (visited[n] || blocked[n]) continue;
      const v = nbrs(n).filter((m) => visited[m]);
      if (!v.length) continue;
      setEdge(n, rng.pick(v), 1); visited[n] = 1; active.push(n); grow(); changed = true;
    }
    if (!changed) break;
  }
  // braid: knock through some dead ends; remember the loops for the lying arrows
  const braids: [number, number][] = [];
  for (let n = 0; n < N; n++) {
    if (blocked[n] || deg[n] !== 1 || !rng.chance(0.42)) continue;
    const c = nbrs(n).filter((m) => !hasEdge(n, m));
    if (!c.length) continue;
    const m = rng.pick(c);
    setEdge(n, m, rng.chance(0.7) ? 1 : 2);
    braids.push([n, m]);
  }

  // ---------------------------------------------------------------- paint corridors
  const kind = new Uint8Array(W * H);      // 1 maze, 2 trunk, 3 port stub, 4 wet
  const nodeW = new Uint8Array(N);
  for (const [k, w] of E) { const a = Math.floor(k / 1024), c = k % 1024; nodeW[a] = Math.max(nodeW[a], w); nodeW[c] = Math.max(nodeW[c], w); }
  const paintRect = (x0: number, y0: number, x1: number, y1: number, kd: number, floor = 'concrete') => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!z.inb(x, y)) continue;
      const i = z.idx(x, y);
      if (R.id[i] && R.id[i] !== R_COR) continue;
      R.id[i] = R_COR;
      if (kind[i] !== 2) { kind[i] = kd; z.floor[i] = floorId(floor); }
    }
  };
  const blockRects = blocks.map((q) => q.r);
  const inAnyBlock = (x: number, y: number) => blockRects.some((r) => inRect(r, x, y));
  const wetEdges = new Set<number>();
  for (const [k, w] of E) {
    const a = Math.floor(k / 1024), c = k % 1024;
    const [ai, aj] = ij(a), [ci, cj] = ij(c);
    if (blocked[a] === 2 && blocked[c] === 2) continue;
    const kd = trunkE.has(k) ? 2 : 1;
    const wet = kd === 1 && rng.chance(0.12);
    if (wet) wetEdges.add(k);
    if (aj === cj) { const [y0, y1] = lanes(C(aj), w); paintRect(Math.min(C(ai), C(ci)), y0, Math.max(C(ai), C(ci)), y1, wet ? 4 : kd, wet ? 'concrete_wet' : 'concrete'); }
    else { const [x0, x1] = lanes(C(ai), w); paintRect(x0, Math.min(C(aj), C(cj)), x1, Math.max(C(aj), C(cj)), wet ? 4 : kd, wet ? 'concrete_wet' : 'concrete'); }
  }
  for (let n = 0; n < N; n++) {
    if (!nodeW[n] || blocked[n] === 2) continue;
    const [i, j] = ij(n);
    const [x0, x1] = lanes(C(i), nodeW[n]), [y0, y1] = lanes(C(j), nodeW[n]);
    paintRect(x0, y0, x1, y1, nodeW[n] === 3 ? 2 : 1);
  }
  // crossings were painted whole; strip what lies inside the blocks (their stamps own it)
  for (const bl of blocks) for (let y = bl.r.y0; y <= bl.r.y1; y++) for (let x = bl.r.x0; x <= bl.r.x1; x++) {
    const i = z.idx(x, y);
    const border = x === bl.r.x0 || x === bl.r.x1 || y === bl.r.y0 || y === bl.r.y1;
    if (!border && R.id[i] === R_COR) { R.id[i] = 0; z.floor[i] = 0; kind[i] = 0; }
  }
  // the trunk gutter: a strip of grating down the middle lane
  for (const k of trunkE) {
    const a = Math.floor(k / 1024), c = k % 1024;
    const [ai, aj] = ij(a), [ci, cj] = ij(c);
    if (aj === cj) for (let x = Math.min(C(ai), C(ci)); x <= Math.max(C(ai), C(ci)); x++) b.fillFloor(x, C(aj), x, C(aj), 'grate');
    else for (let y = Math.min(C(aj), C(cj)); y <= Math.max(C(aj), C(cj)); y++) b.fillFloor(C(ai), y, C(ai), y, 'grate');
  }

  // ---------------------------------------------------------------- paint landmarks + their port stubs
  for (const l of Object.values(L)) {
    R.area(b, l.r.x0, l.r.y0, l.r.x1, l.r.y1, l.id, 'concrete');
    for (const p of l.ports) {
      const cx = C(p.i), cy = C(p.j);
      const [a0, a1] = lanes(p.dir === 'e' || p.dir === 'w' ? cy : cx, p.w);
      if (p.dir === 'e') { paintRect(cx, a0, l.r.x0 - 1, a1, 3); for (let y = a0; y <= a1; y++) R.openEdge(l.r.x0, y, 1); }
      else if (p.dir === 'w') { paintRect(l.r.x1 + 1, a0, cx, a1, 3); for (let y = a0; y <= a1; y++) R.openEdge(l.r.x1 + 1, y, 1); }
      else if (p.dir === 's') { paintRect(a0, cy, a1, l.r.y0 - 1, 3); for (let x = a0; x <= a1; x++) R.openEdge(x, l.r.y0, 0); }
      else { paintRect(a0, l.r.y1 + 1, a1, cy, 3); for (let x = a0; x <= a1; x++) R.openEdge(x, l.r.y1 + 1, 0); }
      // make sure the port node square exists even if the maze left it bare
      const n = nid(p.i, p.j);
      if (!nodeW[n]) { const [x0, x1] = lanes(cx, p.w), [y0, y1] = lanes(cy, p.w); paintRect(x0, y0, x1, y1, 1); }
    }
  }
  // the vestibule behind the blast door, the loop tunnel and its exit room
  const ID_VEST = R.next(), ID_EXIT = R.next();
  R.area(b, VEST.x0, VEST.y0, VEST.x1, VEST.y1, ID_VEST, 'lab');
  R.area(b, LOOP.x0, LOOP.y0, LOOP.x1, LOOP.y1, R_LOOP, 'concrete');
  for (let x = LOOP.x0; x <= LOOP.x1; x++) R.openEdge(x, LOOP.y0, 0);
  R.area(b, EXITR.x0, EXITR.y0, EXITR.x1, EXITR.y1, ID_EXIT, 'concrete');

  // ---------------------------------------------------------------- maintenance rooms dug into the rock
  type RoomKind = 'maintenance' | 'storage' | 'electrical' | 'breakroom' | 'camp' | 'toilet' | 'valves' | 'records' | 'nest' | 'boiler';
  const rooms: { r: Rect; id: number; kind: RoomKind; door: [number, number, 0 | 1, Side] }[] = [];
  const reserved: Rect[] = [...Object.values(L).map((l) => l.r), ...blockRects, LOOP, VEST, EXITR];
  const roomKinds: [RoomKind, number][] = [['maintenance', 5], ['storage', 5], ['electrical', 3], ['breakroom', 2], ['camp', 1.5], ['toilet', 1.5], ['valves', 2.5], ['records', 1], ['nest', 1], ['boiler', 2]];
  const rockFree = (r: Rect) => {
    if (r.x0 < 3 || r.y0 < 3 || r.x1 > W - 4 || r.y1 > H - 4) return false;
    if (reserved.some((q) => overlaps(q, r, 1))) return false;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (R.id[z.idx(x, y)]) return false;
    return true;
  };
  for (let t = 0; t < 2600 && rooms.length < 40; t++) {
    const w = rng.int(3, 7), h = rng.int(3, 5);
    const x0 = rng.int(3, W - 4 - w), y0 = rng.int(3, H - 4 - h);
    const r = rect(x0, y0, x0 + w - 1, y0 + h - 1);
    if (!rockFree(r)) continue;
    // doors: an edge whose outside tile is maze corridor; prefer north/west walls (seen from inside)
    const doors: [number, number, 0 | 1, Side][] = [];
    for (let x = r.x0; x <= r.x1; x++) {
      if (R.at(x, r.y0 - 1) === R_COR && kind[z.idx(x, r.y0 - 1)] !== 2) doors.push([x, r.y0, 0, 'n']);
      if (R.at(x, r.y1 + 1) === R_COR && kind[z.idx(x, r.y1 + 1)] !== 2) doors.push([x, r.y1 + 1, 0, 's']);
    }
    for (let y = r.y0; y <= r.y1; y++) {
      if (R.at(r.x0 - 1, y) === R_COR && kind[z.idx(r.x0 - 1, y)] !== 2) doors.push([r.x0, y, 1, 'w']);
      if (R.at(r.x1 + 1, y) === R_COR && kind[z.idx(r.x1 + 1, y)] !== 2) doors.push([r.x1 + 1, y, 1, 'e']);
    }
    if (!doors.length) continue;
    const good = doors.filter((d) => d[3] === 'n' || d[3] === 'w');
    const door = rng.pick(good.length && rng.chance(0.7) ? good : doors);
    const id = R.next();
    R.area(b, r.x0, r.y0, r.x1, r.y1, id, 'concrete');
    rooms.push({ r, id, kind: rng.weighted(roomKinds), door });
    reserved.push(r);
  }

  // ---------------------------------------------------------------- walls
  const wallOfRegion = new Map<number, string>();
  wallOfRegion.set(R_COR, 'concrete'); wallOfRegion.set(R_LOOP, 'concrete');
  wallOfRegion.set(L.J6.id, 'brick'); wallOfRegion.set(L.J9.id, 'brick');
  wallOfRegion.set(ID_VEST, 'lab');
  for (const rm of rooms) wallOfRegion.set(rm.id, 'cinder');
  const prio = (id: number) => (id === R_COR || id === R_LOOP ? 0 : id === 0 ? -1 : 1);
  R.build(b, () => false, (a, c) => wallOfRegion.get(prio(a) >= prio(c) ? a : c) ?? 'concrete');

  // wallpapers
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = R.id[z.idx(x, y)];
    if (!id) continue;
    const p = id === R_COR || id === R_LOOP ? 'wall_tunnel' : id === L.J6.id || id === L.J9.id ? 'wall_brick' : id === ID_VEST ? 'wall_lab' : wallOfRegion.get(id) === 'cinder' ? 'wall_cinder' : 'wall_concrete';
    b.paper(x, y, x, y, p);
  }
  for (const bl of blocks) b.paper(bl.r.x0, bl.r.y0, bl.r.x1, bl.r.y1, 'wall_tunnel');

  // rooms: the whole warren, then everything with a name
  b.addRoom('Service Tunnels', 'tunnel', 0, 0, W - 1, H - 1, { circuit: 0, temp: 14 });

  const C_ = sectorCircuit;
  const pipeRun = (x: number, y: number, side: Side, k: number) => {
    if (k % 7 === 3) mount(b, 'zg_cable_tray', x, y, side, { v: k % 3 });
    else if (k % 11 === 5) mount(b, 'vent_wall', x, y, side);
    else mount(b, 'pipes_cluster', x, y, side);
  };

  // =====================================================================
  // LANDMARKS
  // =====================================================================
  const jsign = (x: number, y: number, label: string, side: Side = 'n') => mount(b, 'zg_junction_sign', x, y, side, { label });
  const chamber = (l: Landmark, name: string, type: string, temp = 14, lootMul?: number) => b.addRoom(name, type, l.r.x0, l.r.y0, l.r.x1, l.r.y1, { circuit: C_(l.r.x0, l.r.y0), temp, lootMul });

  // ---------------------------------------------------------------- J1: drain inflow (ladder up to the Poolrooms)
  {
    const l = L.J1, r = l.r;           // 21..33 × 15..27
    chamber(l, 'Junction 1 — Drain Inflow', 'junction', 13);
    const sx = 27;                     // shaft column
    b.vwall(sx - 1, r.y0, r.y0 + 1, 'concrete'); b.vwall(sx + 2, r.y0, r.y0 + 1, 'concrete');
    b.fillFloor(sx - 1, r.y0, sx + 1, r.y1, 'concrete_wet');
    b.obj('ladder_wall', sx, r.y0, 0, { portal: 'r_pools_drain' });
    b.portal({ id: 'r_pools_drain', x: sx, y: r.y0, kind: 'ladder', to: 'pools', tx: 106, ty: 111, label: 'Climb up into the drain' });
    anchorAt(b, 'p_pools_drain', sx, r.y0 + 2, 's', 3);
    b.light(sx + 0.5, r.y0 + 0.7, 'sky', { color: 0xbfeaf2, intensity: 0.6, radius: 5.5, y: 2.6, circuit: 0 });
    for (let y = r.y0 + 1; y <= r.y1; y += 1.3) decalAt(z, 'decal_puddle', sx + 0.5 + Math.sin(y) * 0.5, y, 1.6, 1.2, y);
    put(f, 'vent_floor', sx, r.y0 + 7);
    jsign(r.x0 + 2, r.y0, '1');
    stencil(z, 'J1', sx + 0.5, r.y0 + 9.5, 3, 0, 0xd8b030);
    for (const x of [r.x0, r.x0 + 1, r.x1 - 1, r.x1]) mount(b, 'pipes_cluster', x, r.y0, 'n');
    for (let y = r.y0 + 2; y <= r.y1 - 4; y++) if (y !== C(2) && y !== C(2) + 1) mount(b, 'pipes_cluster', r.x0, y, 'w');
    put(f, 'electrical_cabinet', r.x1, r.y0 + 2, FACE.w);
    put(f, 'barrel_oil', r.x1, r.y1, 0); put(f, 'barrel_oil', r.x1 - 1, r.y1, 0);
    put(f, 'trash_bags', r.x0 + 1, r.y1, 0);
    put(f, 'shopping_cart', r.x0 + 3, r.y0 + 4, 1, { yaw: 0.4 });
    bulb(b, r.x0 + 3, r.y0 + 7, C_(r.x0, r.y0), { flicker: 0.15 }); bulb(b, sx, r.y0 + 6, C_(r.x0, r.y0), {});
    bulb(b, r.x1 - 3, r.y1 - 3, C_(r.x0, r.y0), { broken: true });
    stencil(z, 'J3', r.x1 - 1.5, C(3) + 0.5, 1.6, 0, 0xd8b030); arrow(z, r.x1 - 0.2, C(3) + 0.5, 'e', 1.1);
    stencil(z, 'J5', C(3) + 0.5, r.y1 - 1.5, 1.6, Math.PI / 2, 0xd8b030); arrow(z, C(3) + 0.5, r.y1 - 0.2, 's', 1.1);
    f.floorLoot('floor_generic', r.x0 + 4, r.y1 - 2);
  }

  // ---------------------------------------------------------------- J2: stairs up to St. Aldric's basement
  {
    const l = L.J2, r = l.r;           // 75..87 × 9..21
    chamber(l, 'Junction 2', 'junction', 14);
    const ax0 = 79, ax1 = 83, ay1 = 13;  // stair alcove 79..83 × 9..13
    b.vwall(ax0, r.y0, ay1, 'cinder'); b.vwall(ax1 + 1, r.y0, ay1, 'cinder');
    b.hwall(ax0, ax1, ay1 + 1, 'cinder');
    b.fillFloor(ax0, r.y0, ax1, ay1, 'linoleum_green');
    b.paper(ax0, r.y0, ax1, ay1, 'wall_hospital');
    b.addRoom('Hospital Basement Stair', 'stairs', ax0, r.y0, ax1, ay1, { circuit: 0, temp: 15 });
    b.door(81, ay1 + 1, 0, 'door_hospital', { open: true, sign: 'stairs' });
    b.obj('staircase_up', 81, r.y0, 0, { portal: 'r_hospital_basement' });
    b.portal({ id: 'r_hospital_basement', x: 81, y: r.y0, kind: 'stairs_up', to: 'hospital', tx: 72, ty: 60, label: 'Climb the stairs to the hospital basement' });
    anchorAt(b, 'p_hospital_basement', 81, r.y0 + 3, 's', 3);
    mount(b, 'exit_sign', 80, r.y0, 'n');
    b.obj('light_fluoro', 82, r.y0 + 3, 0, { circuit: 0, flicker: 0.2 });
    put(f, 'wheelchair', ax0, ay1, FACE.e);
    // the hospital leaks down the stairs
    put(f, 'gurney', r.x0 + 1, r.y1 - 3, 0, { yaw: 0.3 });
    put(f, 'iv_stand', r.x0 + 2, r.y1 - 1);
    put(f, 'bed_hospital', r.x1 - 1, r.y1 - 2, FACE.n);
    put(f, 'trash_bags', r.x1, ay1 + 2); put(f, 'trash_bags', r.x1 - 1, ay1 + 2);
    put(f, 'medical_cabinet', r.x0, r.y0 + 1, FACE.e, {});
    jsign(r.x0 + 1, r.y0, '2');
    stencil(z, 'J2', 81.5, 18, 3, 0, 0xd8b030);
    for (let x = r.x0 + 2; x < ax0; x++) mount(b, 'pipes_cluster', x, r.y0, 'n');
    for (let x = ax1 + 1; x <= r.x1; x++) mount(b, 'pipes_cluster', x, r.y0, 'n');
    bulb(b, 77, 16, C_(77, 16), { kind: 'light_fluoro', flicker: 0.3 });
    bulb(b, 85, 18, C_(85, 18), { kind: 'light_fluoro', broken: true }); bulb(b, 81, 19, C_(81, 19), { kind: 'light_fluoro' });
    stencil(z, 'J6', C(12) + 0.5, r.y1 - 1.5, 1.6, Math.PI / 2, 0xd8b030); arrow(z, C(12) + 0.5, r.y1 - 0.2, 's', 1.1);
    f.floorLoot('hospital_cabinet', r.x0 + 3, r.y1 - 1);
    for (let k = 0; k < 4; k++) f.decal('decal_footprints', rng.int(r.x0, r.x1), rng.int(ay1 + 2, r.y1), 0.8, 0.8);
  }

  // ---------------------------------------------------------------- J3: the Elm St manhole
  {
    const l = L.J3, r = l.r;           // 129..141 × 15..27
    chamber(l, 'Junction 3 — Elm St Manhole', 'junction', 13);
    const sx = 135;
    b.vwall(sx - 1, r.y0, r.y0 + 1, 'concrete'); b.vwall(sx + 2, r.y0, r.y0 + 1, 'concrete');
    b.obj('ladder_wall', sx, r.y0, 0, { portal: 'r_suburbs_manhole' });
    b.portal({ id: 'r_suburbs_manhole', x: sx, y: r.y0, kind: 'ladder', to: 'suburbs', tx: 96, ty: 96, label: 'Climb up to the street' });
    anchorAt(b, 'p_suburbs_manhole', sx, r.y0 + 2, 's', 3);
    // dusk falls down the shaft
    b.light(sx + 0.5, r.y0 + 0.7, 'sky', { color: 0xffbf80, intensity: 0.7, radius: 6, y: 2.6, circuit: 0 });
    for (let k = 0; k < 9; k++) decalAt(z, 'decal_leaves', sx + rng.float(-0.6, 1.6), r.y0 + rng.float(0.6, 4.2), rng.float(0.6, 1.1), rng.float(0.6, 1.1), rng.float(0, 6));
    // a second, older ladder in the corner: rusted, going up into somewhere that is not a street
    b.obj('ladder_wall', r.x1 - 3, r.y0, 0, { portal: 'r_under_tunnels' });
    b.portal({ id: 'r_under_tunnels', x: r.x1 - 3, y: r.y0, kind: 'ladder', to: 'undercroft', tx: 48, ty: 54, label: 'Climb the rusted ladder' });
    anchorAt(b, 'p_under_tunnels', r.x1 - 3, r.y0 + 2, 's', 2);
    put(f, 'traffic_cone', sx + 1, r.y0 + 3, 0, { yaw: 1.2 });
    f.floorItem('newspaper', sx - 1, r.y0 + 3);
    jsign(r.x0 + 1, r.y0, '3');
    stencil(z, 'J3', sx + 0.5, r.y0 + 8.5, 3, 0, 0xd8b030);
    for (const x of [r.x0 + 3, r.x0 + 4, r.x1 - 1, r.x1]) mount(b, 'pipes_cluster', x, r.y0, 'n');
    put(f, 'electrical_cabinet', r.x0, r.y1 - 1, FACE.e);
    put(f, 'crate_wood', r.x1, r.y1, 0); put(f, 'cardboard_box', r.x1 - 1, r.y1, 0);
    bulb(b, r.x0 + 3, r.y0 + 8, C_(r.x0, r.y0), { flicker: 0.1 }); bulb(b, r.x1 - 3, r.y1 - 3, C_(r.x0, r.y0), {});
    stencil(z, 'J1', r.x0 + 1.5, C(3) + 0.5, 1.6, Math.PI, 0xd8b030); arrow(z, r.x0 + 0.2, C(3) + 0.5, 'w', 1.1);
    f.floorLoot('floor_generic', r.x1 - 3, r.y1 - 2);
    b.door(r.x0, 19, 1, 'door_metal', { sign: 'maintenance', portal: 'tun_fold_b' });
    b.portal({ id: 'tun_fold_b', x: r.x0, y: 19, kind: 'door', to: 'tunnels', tx: 23, ty: 132, label: 'Open the service door', anchor: 'fold_j8' });
    anchorAt(b, 'fold_j3', r.x0 + 2, 19, 'e', 1);
    mount(b, 'zg_room_plate', r.x0, 18, 'w', { label: '?' });
  }

  // ---------------------------------------------------------------- J5: pump station
  {
    const l = L.J5, r = l.r;           // 15..33 × 69..87
    chamber(l, 'Junction 5 — Pump Station', 'pump', 15);
    b.fillFloor(r.x0 + 1, r.y0 + 3, r.x1 - 1, r.y0 + 8, 'grate');
    for (let k = 0; k < 4; k++) {
      const x = r.x0 + 2 + k * 4;
      put(f, 'pump_machine', x, r.y0 + 4, 0);
      put(f, 'valve_wheel', x + 2, r.y0 + 4, 0, {});
      bulb(b, x + 1, r.y0 + 6, C_(x, r.y0), { kind: 'light_fluoro', flicker: k === 2 ? 0.3 : 0, broken: k === 3 });
    }
    put(f, 'pump_control', r.x1 - 1, r.y0 + 1, 0);
    put(f, 'electrical_cabinet', r.x1, r.y0 + 1, FACE.w); put(f, 'electrical_cabinet', r.x1, r.y0 + 2, FACE.w);
    for (let x = r.x0 + 2; x <= r.x1 - 2; x++) if (x !== C(3) && x !== C(3) - 1 && x !== C(3) + 1) mount(b, 'pipes_cluster', x, r.y0, 'n');
    for (let y = r.y0 + 1; y <= r.y1; y++) if (y !== C(12)) mount(b, y % 4 === 0 ? 'zg_cable_tray' : 'pipes_cluster', r.x0, y, 'w', { v: y % 3 });
    jsign(r.x0 + 1, r.y0, '5');
    // the sump: a sunken pit behind a railing
    const sp = rect(r.x0 + 3, r.y1 - 6, r.x0 + 7, r.y1 - 2);
    b.fillFloor(sp.x0, sp.y0, sp.x1, sp.y1, 'water_deep', -0.8);
    for (let x = sp.x0; x <= sp.x1; x++) { b.hwall(x, x, sp.y0, 'railing'); b.hwall(x, x, sp.y1 + 1, 'railing'); }
    for (let y = sp.y0; y <= sp.y1; y++) { b.vwall(sp.x0, y, y, 'railing'); b.vwall(sp.x1 + 1, y, y, 'railing'); }
    b.clearN(sp.x0 + 2, sp.y0);
    b.obj('pool_ladder', sp.x0 + 2, sp.y0, 0, { y: -0.8 });
    b.light(sp.x0 + 2.5, sp.y0 + 2.5, 'screen', { color: 0x2a9a8a, intensity: 0.4, radius: 5, y: -0.4, circuit: 0 });
    b.fillFloor(r.x0 + 1, r.y1 - 8, r.x1, r.y1, 'concrete_wet');
    b.fillFloor(sp.x0, sp.y0, sp.x1, sp.y1, 'water_deep', -0.8);
    stencil(z, 'J5', r.x1 - 5.5, r.y1 - 4.5, 3, 0, 0xd8b030);
    put(f, 'shelf_metal', r.x1, r.y1 - 2, FACE.w, { loot: 'maintenance' });
    put(f, 'tool_chest', r.x1, r.y1 - 3, FACE.w);
    put(f, 'workbench', r.x1 - 3, r.y1, FACE.n);
    put(f, 'mop_bucket', r.x0 + 10, r.y1 - 1);
    bulb(b, r.x0 + 12, r.y1 - 4, C_(r.x0, r.y1), { flicker: 0.1 });
    for (let k = 0; k < 10; k++) f.decal(rng.pick(['decal_puddle', 'decal_stain_water', 'decal_mold']), rng.int(r.x0, r.x1), rng.int(r.y0 + 9, r.y1), rng.float(1, 2), rng.float(1, 2));
    stencil(z, 'J1', C(3) + 0.5, r.y0 + 1.5, 1.6, -Math.PI / 2, 0xd8b030); arrow(z, C(3) + 0.5, r.y0 + 0.2, 'n', 1.1);
    stencil(z, 'J6', r.x1 - 1.5, C(12) + 0.5, 1.6, 0, 0xd8b030); arrow(z, r.x1 - 0.2, C(12) + 0.5, 'e', 1.1);
    f.floorItem('wrench', r.x1 - 2, r.y1 - 1);
  }

  // ---------------------------------------------------------------- J6: the Cistern
  {
    const l = L.J6, r = l.r;           // 63..93 × 63..93
    chamber(l, 'The Cistern (Junction 6)', 'cistern', 11);
    const bs = rect(r.x0 + 4, r.y0 + 4, r.x1 - 4, r.y1 - 4);   // basin 67..89
    b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'concrete_wet');
    b.fillFloor(bs.x0, bs.y0, bs.x1, bs.y1, 'water_deep', -0.7);
    const mid = 78;
    b.fillFloor(mid - 1, bs.y0, mid + 1, bs.y1, 'grate', 0);
    b.fillFloor(bs.x0, mid - 1, bs.x1, mid + 1, 'grate', 0);
    // railings along the catwalks, with breaks and ladders down into the water
    for (let t = bs.y0; t <= bs.y1; t++) {
      if (t >= mid - 2 && t <= mid + 2) continue;
      if (t % 5 !== 2) { b.vwall(mid - 1, t, t, 'railing'); b.vwall(mid + 2, t, t, 'railing'); }
      if (t % 5 !== 2) { b.hwall(t, t, mid - 1, 'railing'); b.hwall(t, t, mid + 2, 'railing'); }
    }
    // brick pillars standing in the water
    const px = [70, 74, 81, 85];
    for (const x of px) for (const y of px) {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { R.id[z.idx(x + i, y + j)] = 0; z.floor[z.idx(x + i, y + j)] = 0; }
    }
    R.build(b, () => false, () => 'brick', rect(r.x0 - 1, r.y0 - 1, r.x1 + 1, r.y1 + 1));
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (z.floor[z.idx(x, y)]) b.paper(x, y, x, y, 'wall_brick');
    // re-open the cistern ports (the rebuild above walled them)
    for (const p of l.ports) {
      const [a0, a1] = lanes(p.dir === 'e' || p.dir === 'w' ? C(p.j) : C(p.i), p.w);
      for (let t = a0; t <= a1; t++) {
        if (p.dir === 'e') b.clearW(r.x0, t); else if (p.dir === 'w') b.clearW(r.x1 + 1, t);
        else if (p.dir === 's') b.clearN(t, r.y0); else b.clearN(t, r.y1 + 1);
      }
    }
    // the railing along the walkway's inner edge, with gaps
    for (let t = bs.x0; t <= bs.x1; t++) {
      if (t >= mid - 1 && t <= mid + 1) continue;
      if (t % 4 !== 0) { b.hwall(t, t, bs.y0, 'railing'); b.hwall(t, t, bs.y1 + 1, 'railing'); b.vwall(bs.x0, t, t, 'railing'); b.vwall(bs.x1 + 1, t, t, 'railing'); }
    }
    // the centre: a television on static and a chair facing it
    b.fillFloor(mid - 2, mid - 2, mid + 2, mid + 2, 'grate', 0);
    put(f, 'tv_static', mid, mid - 1, FACE.s);
    put(f, 'chair_wood', mid, mid + 1, FACE.n);
    stencil(z, 'J6', mid + 0.5, mid + 2.2, 2.4, 0, 0xd8b030);
    jsign(mid - 2, r.y0, '6');
    mount(b, 'zg_junction_sign', r.x0, mid - 4, 'w', { label: '6' });
    for (let x = r.x0 + 1; x <= r.x1 - 1; x += 2) if (Math.abs(x - mid) > 3) mount(b, 'pipes_cluster', x, r.y0, 'n');
    // light: a few bulbs on the walkway, a cold glow in the water
    for (const [x, y] of [[r.x0 + 1, r.y0 + 1], [r.x1 - 1, r.y0 + 1], [r.x0 + 1, r.y1 - 1], [r.x1 - 1, r.y1 - 1], [mid, r.y0 + 1], [r.x0 + 1, mid], [r.x1 - 1, mid], [mid, r.y1 - 1]] as const) bulb(b, x, y, C_(x, y), { flicker: rng.chance(0.3) ? 0.2 : 0, broken: rng.chance(0.25) });
    bulb(b, mid, mid, C_(mid, mid), { flicker: 0.05 });
    for (const [x, y] of [[72, 72], [84, 72], [72, 84], [84, 84]]) b.light(x + 0.5, y + 0.5, 'screen', { color: 0x2a8a8a, intensity: 0.35, radius: 6, y: -0.4, circuit: 0 });
    for (let k = 0; k < 26; k++) f.decal(rng.pick(['decal_puddle', 'decal_stain_water', 'decal_mold', 'decal_crack']), rng.pick([rng.int(r.x0, bs.x0 - 1), rng.int(bs.x1 + 1, r.x1)]), rng.int(r.y0, r.y1), rng.float(1, 2.2), rng.float(1, 2.2));
    for (const [x, y] of [[r.x0 + 1, r.y1 - 1], [r.x1 - 1, r.y0 + 2]] as const) put(f, 'crate_wood', x, y);
    put(f, 'pallet_boxes', r.x1 - 1, r.y1 - 1);
    f.floorItem('flashlight', mid + 1, mid + 1);
    stencil(z, 'J9', mid + 0.5, r.y1 - 1.5, 1.6, Math.PI / 2, 0xd8b030); arrow(z, mid + 0.5, r.y1 - 0.2, 's', 1.1);
    stencil(z, 'J7', r.x1 - 1.5, C(11) + 0.5, 1.6, 0, 0xd8b030); arrow(z, r.x1 - 0.2, C(11) + 0.5, 'e', 1.1);
    stencil(z, 'J2', mid + 0.5, r.y0 + 1.5, 1.6, -Math.PI / 2, 0xd8b030); arrow(z, mid + 0.5, r.y0 + 0.2, 'n', 1.1);
    stencil(z, 'J5', r.x0 + 1.5, mid + 0.5, 1.6, Math.PI, 0xd8b030); arrow(z, r.x0 + 0.2, mid + 0.5, 'w', 1.1);
  }

  // ---------------------------------------------------------------- J7: the Compass, and the tunnel marked J4
  {
    const l = L.J7, r = l.r;           // 129..141 × 63..75
    chamber(l, 'Junction 7', 'junction', 13);
    const cx = 135, cy = 69;
    jsign(r.x0 + 1, r.y0, '7');
    stencil(z, 'J7', cx + 0.5, cy - 2.5, 2.4, 0, 0xd8b030);
    // arrows painted in a ring, all chasing each other
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = cx + 0.5 + Math.cos(a) * 4.2, y = cy + 0.5 + Math.sin(a) * 4.2;
      decalAt(z, 'zg_fw_arrow', x, y, 1.1, 0.55, a + Math.PI / 2, k % 3 === 0 ? 0xc83a2a : 0xd8b030);
    }
    for (let k = 0; k < 4; k++) { stencil(z, 'J4', cx + 0.5 + Math.cos(k * Math.PI / 2) * 2.3, cy + 0.5 + Math.sin(k * Math.PI / 2) * 2.3, 1.4, k * Math.PI / 2 + Math.PI / 2, 0xe8e8e0); }
    stencil(z, 'J4', 132.5, r.y1 - 1.5, 2, Math.PI / 2, 0xd8b030); arrow(z, 132.5, r.y1 - 0.2, 's', 1.4);
    stencil(z, 'NO EXIT', r.x1 - 2, C(10) + 0.5, 2.6, 0, 0xc83a2a);
    stencil(z, 'KEEP LEFT', cx + 0.5, cy + 2.6, 2.4, 0, 0xe8e8e0);
    // somebody counted laps
    for (let k = 0; k < 14; k++) decalAt(z, 'decal_mark_x', r.x0 + 1.5 + (k % 7) * 0.6, r.y1 - 1.2 - Math.floor(k / 7) * 0.7, 0.5, 0.5, k * 0.3, 0xe8e8e0);
    put(f, 'chair_office', cx, cy, FACE.s);
    put(f, 'electrical_cabinet', r.x1, r.y0 + 1, FACE.w);
    for (let x = r.x0 + 3; x <= r.x1; x++) mount(b, 'pipes_cluster', x, r.y0, 'n');
    bulb(b, cx, cy + 1, C_(cx, cy), { flicker: 0.4 });
    bulb(b, r.x0 + 3, r.y0 + 3, C_(cx, cy), {}); bulb(b, r.x1 - 3, r.y1 - 3, C_(cx, cy), { flicker: 0.1 }); bulb(b, r.x1 - 3, r.y0 + 3, C_(cx, cy), { broken: true });
    f.floorItem('note', cx + 1, cy + 1, { lore: 'note_generic' });
    f.floorItem('chalk', cx - 1, cy + 2);
  }
  // the tunnel marked J4: seamless loop, period 24, everything repeats every 8 tiles
  {
    const x0 = LOOP.x0, x1 = LOOP.x1;
    b.addRoom('Tunnel J4', 'tunnel_loop', x0, LOOP.y0, x1, LOOP.y1, { circuit: 4, temp: 13 });
    const EXIT_Y = 98;
    for (let y = LOOP.y0; y <= LOOP.y1; y++) {
      const m = ((y % 8) + 8) % 8;
      if (y !== EXIT_Y) {
        if (m === 3) mount(b, 'zg_cable_tray', x0, y, 'w', { v: 1 });
        else if (m === 6) mount(b, 'vent_wall', x0, y, 'w');
        else mount(b, 'pipes_cluster', x0, y, 'w');
      }
      if (m === 0) b.obj('light_bulb', 132, y, 0, { circuit: 4, flicker: 0 });
      if (m === 4) { arrow(z, 132.5, y + 0.5, 's', 1.2); stencil(z, 'J4', 132.5, y + 1.6, 1.4, Math.PI / 2, 0xd8b030); }
      if (m === 6) put(f, 'barrel_oil', x1, y, 0);
      if (m === 1) decalAt(z, 'decal_stain_water', 131.8, y + 0.4, 1.4, 1.1, 0.6);
    }
    for (let x = x0; x <= x1; x++) {
      b.portal({ id: `loop_j4_a${x}`, x, y: LOOP_A, kind: 'loop', to: z.key, tx: x, ty: LOOP_A + LOOP_D, loopDy: LOOP_D, hidden: true });
      b.portal({ id: `loop_j4_b${x}`, x, y: LOOP_B, kind: 'loop', to: z.key, tx: x, ty: LOOP_B - LOOP_D, loopDy: -LOOP_D, hidden: true });
    }
    // the one door that is only ever in one place
    b.door(x0, EXIT_Y, 1, 'door_metal', { sign: 'maintenance' });
    b.addRoom('Pump Closet', 'maintenance', EXITR.x0, EXITR.y0, EXITR.x1, EXITR.y1, { circuit: 4 });
    b.door(EXITR.x0, 97, 1, 'door_metal', {});
    mount(b, 'zg_room_plate', EXITR.x0 + 1, EXITR.y0, 'n', { label: '?' });
    put(f, 'valve_wheel', EXITR.x1, EXITR.y0, 0);
    put(f, 'shelf_metal', EXITR.x1, EXITR.y1, FACE.n, { loot: 'maintenance' });
    put(f, 'skeleton', EXITR.x0 + 1, EXITR.y1, 1);
    f.floorItem('note', EXITR.x0 + 1, EXITR.y1 - 1, { lore: 'note_generic' });
    for (let k = 0; k < 30; k++) decalAt(z, 'decal_mark_x', EXITR.x0 + 0.4 + (k % 6) * 0.45, EXITR.y0 + 1.2 + Math.floor(k / 6) * 0.5, 0.4, 0.4, k, 0xd8d8d0);
    b.obj('light_bulb', 129, 98, 0, { circuit: 4, flicker: 0.35 });
  }

  // ---------------------------------------------------------------- J8: substation
  {
    const l = L.J8, r = l.r;           // 21..33 × 123..135
    chamber(l, 'Junction 8 — Substation', 'electrical', 16);
    const cg = rect(25, 127, 29, 131);
    for (let x = cg.x0; x <= cg.x1; x++) { b.hwall(x, x, cg.y0, 'fence_chain'); b.hwall(x, x, cg.y1 + 1, 'fence_chain'); }
    for (let y = cg.y0; y <= cg.y1; y++) { b.vwall(cg.x0, y, y, 'fence_chain'); b.vwall(cg.x1 + 1, y, y, 'fence_chain'); }
    b.edge(27, cg.y1 + 1, 0, { kind: 'gate', style: 'door_metal', open: false });
    put(f, 'transformer', 26, 128, 0); put(f, 'transformer', 26, 130, 0);
    put(f, 'generator', 29, 128); put(f, 'barrel_oil', 29, 131);
    for (let x = r.x0 + 1; x <= r.x1 - 1; x += 2) put(f, 'electrical_cabinet', x, r.y0, 0);
    mount(b, 'fuse_panel_big', r.x0, r.y0 + 4, 'w');
    mount(b, 'breaker_panel', r.x0, r.y0 + 6, 'w');
    for (let y = r.y0 + 8; y <= r.y1; y += 2) if (Math.abs(y - 132) > 2) mount(b, 'zg_cable_tray', r.x0, y, 'w', { v: y % 3 });
    jsign(r.x1 - 1, r.y0, '8');
    for (const [x, y] of [[24, 126], [30, 126], [24, 133], [30, 133]] as const) bulb(b, x, y, C_(x, y), { kind: 'light_fluoro', flicker: rng.chance(0.5) ? 0.35 : 0.05 });
    stencil(z, 'J8', 27.5, r.y1 - 1, 2.4, 0, 0xd8b030);
    stencil(z, 'J9', r.x1 - 1.5, C(21) + 0.5, 1.6, 0, 0xd8b030); arrow(z, r.x1 - 0.2, C(21) + 0.5, 'e', 1.1);
    put(f, 'tool_chest', r.x1, r.y1, FACE.w);
    put(f, 'shelf_metal', r.x1, r.y1 - 1, FACE.w, { loot: 'maintenance' });
    f.floorItem('fuse', r.x1 - 1, r.y1 - 2);
    // a service door in the west wall that opens on the other side of the map (J3), and back
    b.door(r.x0, 132, 1, 'door_metal', { sign: 'maintenance', portal: 'tun_fold_a' });
    b.portal({ id: 'tun_fold_a', x: r.x0, y: 132, kind: 'door', to: 'tunnels', tx: 130, ty: 19, label: 'Open the service door', anchor: 'fold_j3' });
    anchorAt(b, 'fold_j8', r.x0 + 2, 132, 'e', 1);
    mount(b, 'zg_room_plate', r.x0, 131, 'w', { label: '?' });
    for (let k = 0; k < 6; k++) f.decal(rng.pick(['decal_scorch', 'decal_stain_dark', 'decal_crack']), rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), rng.float(0.8, 1.6), rng.float(0.8, 1.6));
  }

  // ---------------------------------------------------------------- J9: the boiler hall (Sato's kit)
  {
    const l = L.J9, r = l.r;           // 63..81 × 123..141
    chamber(l, 'Junction 9 — Boiler Hall', 'boiler', 29, 1.6);
    for (const x of [65, 70]) { put(f, 'boiler', x, r.y0 + 1, 0); b.light(x + 1, r.y0 + 3.2, 'fire', { intensity: 1.3, radius: 7, y: 0.6, circuit: 0, flicker: 0.15 }); }
    // the big one, set out from the wall: behind it, the kit
    put(f, 'boiler', 77, r.y0 + 1, 0);
    b.light(78, r.y0 + 3.2, 'fire', { intensity: 1.4, radius: 7.5, y: 0.6, circuit: 0, flicker: 0.2 });
    const st = put(f, 'survivor_stash', 78, r.y0, FACE.s, { loot: 'survivor_stash' });
    for (const k of ['pistol', 'ammo_9mm', 'battery', 'battery', 'canned_beans', 'mre', 'almond_water', 'first_aid_kit', 'flashlight']) stash(st, rng, k);
    decalAt(z, 'decal_mark_x', 79.5, r.y0 + 0.5, 0.8, 0.8, 0.3, 0xe8e8e0);
    decalAt(z, 'decal_chalk_drawing', 80.5, r.y0 + 1.5, 1.2, 1.2, 0.2, 0xe8e8e0);
    for (let x = r.x0; x <= r.x1; x++) if (x < 76 || x > 79) mount(b, 'pipes_cluster', x, r.y0, 'n');
    for (let y = r.y0 + 4; y <= r.y1; y++) if (Math.abs(y - C(21)) > 1) mount(b, y % 3 === 0 ? 'zg_cable_tray' : 'pipes_cluster', r.x0, y, 'w', { v: y % 3 });
    put(f, 'water_heater', r.x1, r.y0 + 5, FACE.w); put(f, 'water_heater', r.x1, r.y0 + 6, FACE.w);
    put(f, 'workbench', 66, r.y1, FACE.n); put(f, 'tool_chest', 68, r.y1, FACE.n);
    put(f, 'bed_single', r.x1, r.y1 - 2, FACE.w);
    put(f, 'pallet_boxes', 64, r.y1 - 3); put(f, 'barrel_oil', 64, r.y1 - 4);
    put(f, 'chair_wood', r.x1 - 1, r.y1 - 4, FACE.s);
    jsign(r.x0, r.y0 + 3, '9', 'w');
    stencil(z, 'J9', 72.5, 133, 3, 0, 0xd8b030);
    for (const [x, y] of [[66, 129], [72, 129], [78, 130], [66, 135], [72, 134], [78, 136], [69, 140], [76, 140]] as const) bulb(b, x, y, C_(x, y), { flicker: rng.chance(0.3) ? 0.2 : 0 });
    for (let k = 0; k < 10; k++) f.decal(rng.pick(['decal_stain_dark', 'decal_scorch', 'decal_stain_water']), rng.int(r.x0, r.x1), rng.int(r.y0 + 3, r.y1), rng.float(1, 2), rng.float(1, 2));
    stencil(z, 'J8', r.x0 + 1.5, C(21) + 0.5, 1.6, Math.PI, 0xd8b030); arrow(z, r.x0 + 0.2, C(21) + 0.5, 'w', 1.1);
    stencil(z, 'J6', C(12) + 0.5, r.y0 + 1.5, 1.6, -Math.PI / 2, 0xd8b030); arrow(z, C(12) + 0.5, r.y0 + 0.2, 'n', 1.1);
    stencil(z, 'J4', r.x1 - 1.5, C(21) + 0.5, 1.6, 0, 0xc83a2a); arrow(z, r.x1 - 0.2, C(21) + 0.5, 'e', 1.1, 0xc83a2a);
  }

  // ---------------------------------------------------------------- J4: FACILITY 4
  {
    const l = L.J4, r = l.r;           // 123..141 × 129..141
    chamber(l, 'Junction 4 — Facility 4', 'lab_door', 12);
    const dx = 132, dy = r.y0;
    b.obj('zg_blast_frame', dx - 1, dy, 0, {});
    b.door(dx, dy, 0, 'door_metal', { locked: true, portal: 'p_tunnels_lab', sign: 'lab' });
    b.portal({ id: 'p_tunnels_lab', x: dx, y: dy, kind: 'door', to: 'lab', tx: 10, ty: 55, label: 'Open the blast door', locked: 'flag:lab_code' });
    mount(b, 'keypad', dx + 2, dy, 'n', { code: '061480', codeFlag: 'lab_code', door: [dx, dy, 0] });
    anchorAt(b, 'lab_door', dx, dy + 1, 's', 0);
    anchorAt(b, 'r_tunnels_lab', dx, dy + 3, 's', 3);
    // the vestibule: the lift that goes down to the facility proper
    b.addRoom('Facility 4 Vestibule', 'lab_door', VEST.x0, VEST.y0, VEST.x1, VEST.y1, { circuit: 0, temp: 15 });
    mount(b, 'elevator_door', dx, VEST.y0, 'n', { portal: 'p_tunnels_lab' });
    mount(b, 'zg_room_plate', dx - 1, VEST.y0, 'n', { label: 'DECON' });
    b.light(dx + 0.5, VEST.y0 + 2, 'emergency', { intensity: 0.5, radius: 3.5, circuit: 0, flicker: 0.1 });
    // hazard box painted in front of the door
    for (const [x, y, w, d, rot] of [[dx + 0.5, dy + 0.15, 4, 0.18, 0], [dx + 0.5, dy + 2.6, 4, 0.18, 0], [dx - 1.45, dy + 1.4, 2.5, 0.18, Math.PI / 2], [dx + 2.45, dy + 1.4, 2.5, 0.18, Math.PI / 2]] as const) decalAt(z, 'decal_parking_line', x, y, w, d, rot, 0xd8b030, 0.9);
    stencil(z, 'F-4', dx + 0.5, dy + 1.5, 2, 0, 0xd8b030);
    stencil(z, 'J4', dx + 0.5, r.y1 - 2, 3, 0, 0xd8b030);
    jsign(r.x0 + 1, r.y0, '4');
    for (let x = r.x0 + 3; x <= r.x1; x++) if (x < dx - 1 || x > dx + 3) mount(b, x % 5 === 0 ? 'zg_cable_tray' : 'pipes_cluster', x, r.y0, 'n', { v: 1 });
    // Sato: slumped by the keypad, the journal in his lap
    b.obj('skeleton', dx + 4, dy + 1, 1, {});
    put(f, 'sleeping_bag', dx + 6, dy, FACE.s);
    f.floorItem('journal', dx + 4, dy + 2, { lore: 'journal_survey_4' });
    for (const [x, y] of [[dx + 5, dy + 2], [dx + 3, dy + 3]] as const) f.floorItem('glowstick', x, y);
    f.floorItem('empty_can', dx + 6, dy + 3);
    f.floorItem('flashlight', dx + 5, dy + 1);
    decalAt(z, 'decal_blood_pool', dx + 4.6, dy + 1.6, 1.6, 1.3, 0.4);
    for (let k = 0; k < 7; k++) decalAt(z, 'decal_blood_drip', r.x0 + 2 + k * 1.3, dy + 4.2 - k * 0.35 + Math.sin(k) * 0.3, 0.8, 0.8, k);
    decalAt(z, 'decal_scorch', dx - 2, dy + 1, 1.5, 1.5, 0.5);
    bulb(b, dx + 5, dy + 4, 0, { flicker: 0.5 }); bulb(b, dx - 4, dy + 3, 0, { flicker: 0.15 }); bulb(b, dx, dy + 7, 0, {});
    bulb(b, r.x0 + 3, r.y1 - 2, DEAD, { broken: true });
    put(f, 'hazard_barrier', dx - 3, dy + 4, 0); put(f, 'hazard_barrier', dx + 3, dy + 6, 0, { yaw: 0.6 });
    put(f, 'crate_wood', r.x1, r.y1, 0); put(f, 'cardboard_stack', r.x1 - 1, r.y1, 0);
  }

  // =====================================================================
  // MAINTENANCE ROOMS
  // =====================================================================
  const signFor: Record<RoomKind, string | undefined> = { maintenance: 'maintenance', storage: 'staff', electrical: 'danger', breakroom: 'staff', camp: undefined, toilet: 'restroom', valves: 'maintenance', records: 'office', nest: undefined, boiler: 'danger' };
  const nameFor: Record<RoomKind, string> = { maintenance: 'Maintenance Room', storage: 'Store Room', electrical: 'Electrical Room', breakroom: 'Crew Room', camp: 'Somebody\'s Camp', toilet: 'Washroom', valves: 'Pump Room', records: 'Survey Office', nest: 'Den', boiler: 'Boiler Room' };
  const typeFor = (k: RoomKind) => (k === 'valves' ? 'pump' : k);
  let roomNo = 1;
  for (const rm of rooms) {
    const { r, kind: k } = rm;
    const [dxx, dyy, ds] = rm.door;
    const circ = C_(r.x0, r.y0);
    b.addRoom(`${nameFor[k]} ${String(roomNo++).padStart(2, '0')}`, typeFor(k), r.x0, r.y0, r.x1, r.y1, { circuit: circ, temp: k === 'electrical' ? 18 : k === 'boiler' ? 26 : 14 });
    if (k === 'camp' || k === 'nest') b.gap(dxx, dyy, ds);
    else b.door(dxx, dyy, ds, 'door_metal', { open: rng.chance(0.35), sign: signFor[k], locked: k === 'electrical' && rng.chance(0.3) });
    const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
    bulb(b, cx, cy, circ, { broken: rng.chance(0.3), flicker: rng.chance(0.3) ? rng.float(0.1, 0.4) : 0 });
    const aw = (key: string, state: Record<string, any> = {}) => f.againstWall(key, r.x0, r.y0, r.x1, r.y1, 30, state);
    const any = (key: string, state: Record<string, any> = {}) => f.anywhere(key, r.x0, r.y0, r.x1, r.y1, 20, state);
    const wallOn = (key: string, state: Record<string, any> = {}) => f.onWall(key, r.x0, r.y0, r.x1, r.y1, 20, state);
    switch (k) {
      case 'maintenance':
        aw('shelf_metal', { loot: 'maintenance' }); aw('tool_chest'); aw('workbench'); any('mop_bucket'); wallOn('pipes_cluster'); wallOn('breaker_panel');
        if (rng.chance(0.5)) f.floorItem(rng.pick(['fuse', 'flashlight', 'battery', 'wrench', 'screwdriver']), cx, cy);
        break;
      case 'storage':
        for (let i = 0; i < 4; i++) aw(rng.pick(['crate_wood', 'cardboard_stack', 'pallet_boxes', 'shelf_metal']), { loot: rng.chance(0.5) ? 'crate_supplies' : undefined });
        any('cardboard_box'); any('barrel_oil');
        break;
      case 'electrical':
        aw('electrical_cabinet'); aw('electrical_cabinet'); aw('transformer'); wallOn('fuse_panel_big'); wallOn('zg_cable_tray', { v: 1 });
        break;
      case 'breakroom':
        aw('bed_single'); any('table_round'); any('chair_plastic'); any('chair_plastic'); aw('fridge', { loot: 'fridge_office' }); wallOn('noticeboard', { lore: 'note_generic' }); wallOn('clock_wall');
        any('trash_can');
        break;
      case 'camp':
        any('sleeping_bag'); any('campfire_unlit'); any('survivor_stash', { loot: 'camp_supplies' }); any('trash_bags');
        f.floorItem('empty_can', cx, cy); f.floorItem('note', cx, cy, { lore: 'note_generic' });
        for (let i = 0; i < 3; i++) f.decal('decal_trash', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), 1, 1);
        break;
      case 'toilet':
        aw('toilet'); aw('sink_bathroom'); wallOn('mirror'); any('mop_bucket');
        b.paper(r.x0, r.y0, r.x1, r.y1, 'wall_bathroom'); b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'tile_white');
        break;
      case 'valves':
        aw('valve_wheel'); aw('valve_wheel'); aw('pump_machine'); wallOn('pipes_cluster'); wallOn('pipes_cluster');
        b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'concrete_wet');
        break;
      case 'records':
        aw('desk_office'); aw('filing_cabinet', { loot: 'filing' }); aw('filing_cabinet', { loot: 'filing' }); any('chair_office'); wallOn('noticeboard');
        f.floorItem('map_lobby', cx, cy); f.floorItem('paper', cx, cy);
        break;
      case 'boiler': {
        const bo = f.place('boiler', r.x0 + 1 <= r.x1 - 2 ? r.x0 + 1 : r.x0, r.y0, 0, {});
        if (bo) b.light(bo.x + 1, bo.y + 2.2, 'fire', { intensity: 1.1, radius: 5, y: 0.6, circuit: 0, flicker: 0.2 });
        aw('water_heater'); wallOn('pipes_cluster'); wallOn('pipes_cluster'); any('barrel_oil');
        b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'concrete_wet');
        break;
      }
      case 'nest':
        any('trash_bags', { loot: 'creature_nest' }); any('clothes_pile'); any('skeleton');
        for (let i = 0; i < 6; i++) f.decal(rng.pick(['decal_stain_dark', 'decal_blood_drip', 'decal_trash']), rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), 1.2, 1.2);
        break;
    }
    if (k !== 'toilet' && k !== 'valves') for (let i = 0; i < 2; i++) f.decal(rng.pick(['decal_stain_water', 'decal_crack', 'decal_mold']), rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), rng.float(0.8, 1.4), rng.float(0.8, 1.4));
  }

  // =====================================================================
  // CORRIDOR DRESSING: mains, maze, lights, arrows that lie
  // =====================================================================
  // the mains: pipes on the visible wall all the way, bulbs every 8
  let pk = 0;
  for (const t of TRUNKS) {
    const [ai, aj] = t.a, [bi, bj] = t.b;
    const horiz = aj === bj;
    const c = horiz ? C(aj) : C(ai);
    const u0 = Math.min(horiz ? C(ai) : C(aj), horiz ? C(bi) : C(bj)), u1 = Math.max(horiz ? C(ai) : C(aj), horiz ? C(bi) : C(bj));
    for (let u = u0; u <= u1; u++) {
      const [x, y] = horiz ? [u, c - 1] : [c - 1, u];
      const side: Side = horiz ? 'n' : 'w';
      const wallThere = horiz ? z.wallN[z.idx(x, y)] && !z.edge(x, y, 0) : z.wallW[z.idx(x, y)] && !z.edge(x, y, 1);
      if (wallThere && !z.objectsAt(x, y).some((o) => o.key === 'pipes_cluster' || o.key === 'zg_cable_tray' || o.key === 'vent_wall')) pipeRun(x, y, side, pk++);
      if ((u - u0) % 8 === 4) { const [lx, ly] = horiz ? [u, c] : [c, u]; bulb(b, lx, ly, C_(lx, ly), { flicker: rng.chance(0.15) ? 0.25 : 0, broken: rng.chance(0.2) }); }
      // way-marks toward both ends
      if ((u - u0) % 18 === 9) {
        const toB = (horiz ? C(bi) : C(bj)) > (horiz ? C(ai) : C(aj));
        const fwd: Side = horiz ? (toB ? 'e' : 'w') : (toB ? 's' : 'n');
        const back: Side = horiz ? (toB ? 'w' : 'e') : (toB ? 'n' : 's');
        const rotOf = (d: Side) => (d === 'e' ? 0 : d === 's' ? Math.PI / 2 : d === 'w' ? Math.PI : -Math.PI / 2);
        const lie = rng.chance(0.18);  // somebody repainted this one
        const [p1x, p1y] = horiz ? [u + 0.5, c + 1.5] : [c + 1.5, u + 0.5];
        const [p2x, p2y] = horiz ? [u + 0.5, c - 0.5] : [c - 0.5, u + 0.5];
        stencil(z, t.to, p1x, p1y, 1.4, rotOf(lie ? back : fwd), 0xd8b030); arrow(z, p1x + (horiz ? (fwd === 'e' ? 1.3 : -1.3) : 0), p1y + (horiz ? 0 : (fwd === 's' ? 1.3 : -1.3)), lie ? back : fwd, 1);
        stencil(z, t.from, p2x, p2y, 1.4, rotOf(back), 0xd8b030); arrow(z, p2x + (horiz ? (back === 'e' ? 1.3 : -1.3) : 0), p2y + (horiz ? 0 : (back === 's' ? 1.3 : -1.3)), back, 1);
      }
    }
    // a puddle trail down the gutter
    for (let k = 0; k < (u1 - u0) / 5; k++) { const u = rng.int(u0, u1); const [x, y] = horiz ? [u, c] : [c, u]; f.decal(rng.pick(['decal_puddle', 'decal_stain_water']), x, y, rng.float(0.9, 1.6), rng.float(0.9, 1.6)); }
  }
  // the north main floods past J2; the west main has caved in between J5 and J8
  for (let x = C(14); x <= C(18); x++) for (let y = C(3) - 1; y <= C(3) + 1; y++) if (R.at(x, y) === R_COR) { b.fillFloor(x, y, x, y, 'concrete_wet'); if (rng.chance(0.4)) f.decal('decal_puddle', x, y, rng.float(1.2, 2), rng.float(1.2, 2)); }
  {
    const y = C(16) + 3;
    for (let x = C(3) - 1; x <= C(3) + 1; x++) b.fillFloor(x, y - 1, x, y + 1, 'gravel');
    b.obj('rock_large', C(3) - 1, y - 1, 0, {}); b.obj('rock_large', C(3), y, 1, {});
    put(f, 'crate_wood', C(3) + 1, y - 1); put(f, 'rock', C(3) - 1, y + 1); put(f, 'cardboard_stack', C(3) + 1, y + 1);
    for (let k = 0; k < 8; k++) f.decal(rng.pick(['decal_crack', 'decal_stain_dark']), C(3) + rng.int(-1, 1), y + rng.int(-3, 3), rng.float(1, 2), rng.float(1, 2));
    f.floorItem('note', C(3), y - 3, { lore: 'note_generic' });
  }
  // maze: sparse pipes, rare working bulbs, junk in dead ends
  for (let n = 0; n < N; n++) {
    if (blocked[n] || !nodeW[n]) continue;
    const [i, j] = ij(n);
    const x = C(i), y = C(j), circ = C_(x, y);
    if (deg[n] >= 3 && rng.chance(0.35)) bulb(b, x, y, circ, { broken: rng.chance(0.45), flicker: rng.chance(0.3) ? rng.float(0.1, 0.4) : 0 });
    else if (rng.chance(0.07)) bulb(b, x, y, circ, { broken: rng.chance(0.5), flicker: 0.2 });
    if (deg[n] === 1 && !kindIs(x, y, 2)) {
      const r = rng.next();
      if (r < 0.25) put(f, rng.pick(['crate_wood', 'barrel_oil', 'cardboard_stack', 'pallet_boxes']), x, y, 0, { loot: rng.chance(0.4) ? 'crate_supplies' : undefined });
      else if (r < 0.35) put(f, 'trash_bags', x, y, 0);
      else if (r < 0.42) put(f, 'skeleton', x, y, rng.int(0, 3) as Rot);
      else if (r < 0.5) f.floorLoot('floor_generic', x, y);
    }
  }
  function kindIs(x: number, y: number, k: number) { return z.inb(x, y) && kind[z.idx(x, y)] === k; }
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = z.idx(x, y);
    if (R.id[i] !== R_COR || kind[i] === 2 || inAnyBlock(x, y)) continue;
    if (z.objectsAt(x, y).some((o) => objDefOnWall(o.key))) continue;
    if (z.wallN[i] && !z.edge(x, y, 0) && rng.chance(0.09)) pipeRun(x, y, 'n', pk++);
    else if (z.wallW[i] && !z.edge(x, y, 1) && rng.chance(0.07)) pipeRun(x, y, 'w', pk++);
  }
  function objDefOnWall(key: string) { return key === 'pipes_cluster' || key === 'zg_cable_tray' || key === 'vent_wall' || key === 'zg_junction_sign' || key === 'ladder_wall'; }

  // the lying arrows: follow them around a braided loop and you come back to where you started
  let circles = 0;
  for (const [a, c] of rng.shuffle(braids.slice())) {
    if (circles >= 5) break;
    if (blocked[a] || blocked[c]) continue;
    // path c -> a avoiding the braid edge
    const prev = new Int32Array(N).fill(-1);
    const q = [c]; prev[c] = c;
    while (q.length && prev[a] < 0) {
      const n = q.shift()!;
      for (const m of nbrs(n)) if (prev[m] < 0 && hasEdge(n, m) && !(n === c && m === a)) { prev[m] = n; q.push(m); }
    }
    if (prev[a] < 0) continue;
    const cyc: number[] = [];
    for (let n = a; n !== c; n = prev[n]) cyc.push(n);
    cyc.push(c);
    if (cyc.length < 5 || cyc.length > 22) continue;
    // cyc runs a ... c along the tree; c -> a closes it. Paint arrows a -> ... -> c -> a
    const order = cyc.reverse(); // c ... a ; arrows point from each to the previous so the ring turns one way
    const word = rng.pick(['J4', 'EXIT', 'UP', 'J9']);
    for (let k = 0; k < order.length; k++) {
      const n = order[k], m = order[(k + 1) % order.length];
      const [ni, nj] = ij(n), [mi, mj] = ij(m);
      const dir: Side = mi > ni ? 'e' : mi < ni ? 'w' : mj > nj ? 's' : 'n';
      arrow(z, C(ni) + 0.5, C(nj) + 0.5, dir, 1.1, 0xe8e8e0);
      if (k % 3 === 0) stencil(z, word, C(ni) + 0.5 + (dir === 'n' || dir === 's' ? 0.9 : 0), C(nj) + 0.5 + (dir === 'e' || dir === 'w' ? 0.9 : 0), 1.2, dir === 'e' ? 0 : dir === 's' ? Math.PI / 2 : dir === 'w' ? Math.PI : -Math.PI / 2, 0xe8e8e0);
    }
    // and on one of its walls, a junction plate that should not be here
    if (circles < 2) {
      const [ni, nj] = ij(order[Math.floor(order.length / 2)]);
      const x = C(ni), y = C(nj);
      if (z.wallN[z.idx(x, y)] && !z.edge(x, y, 0) && !z.objectsAt(x, y).some((o) => objDefOnWall(o.key))) jsign(x, y, circles === 0 ? '4' : '?');
    }
    circles++;
  }

  // corridor floor dressing
  for (let k = 0; k < W * H * 0.02; k++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    const i = z.idx(x, y);
    if (!z.floor[i] || inAnyBlock(x, y) || (R.id[i] !== R_COR && R.id[i] !== R_LOOP)) continue;
    if (R.id[i] === R_LOOP) continue;
    const wet = kind[i] === 4;
    f.decal(rng.weighted((wet ? [['decal_puddle', 6], ['decal_stain_water', 3], ['decal_mold', 1]] : [['decal_stain_water', 3], ['decal_crack', 2], ['decal_stain_dark', 2], ['decal_mold', 1.5], ['decal_footprints', 1], ['decal_puddle', 1.5], ['decal_trash', 0.6]]) as [string, number][]), x, y, rng.float(0.8, 1.7), rng.float(0.8, 1.7));
  }
  scatterLoot(f, rng, 'floor_generic', rect(2, 2, W - 3, H - 3), 70, (x, y) => R.at(x, y) === R_COR && !inAnyBlock(x, y));

  // =====================================================================
  // SHIFTING MAZE BLOCKS: they re-dig themselves while nobody watches
  // =====================================================================
  for (const bl of blocks) {
    const { r } = bl;
    b.addRoom('Service Tunnels', 'tunnel', r.x0, r.y0, r.x1, r.y1, { circuit: bl.circuit, temp: 13 });
    registerShift(z, bl.id, r.x0, r.y0, r.x1, r.y1, 3, (sb, srng, v) => stampBlock(sb, srng, v, bl));
  }

  // =====================================================================
  // CONNECTIVITY, POWER, ENVIRONMENT
  // =====================================================================
  const first = z.meta.anchors.p_suburbs_manhole as number[];
  connectRegions(z, b, first[0], first[1], rng, { keep: [...blockRects, rect(LOOP.x0, LOOP.y0, LOOP.x1, LOOP.y1), VEST] });
  // anchors first in the table = the manhole (zonecheck reachability starts there)
  const a = z.meta.anchors;
  z.meta.anchors = { p_suburbs_manhole: a.p_suburbs_manhole, p_pools_drain: a.p_pools_drain, p_hospital_basement: a.p_hospital_basement, r_tunnels_lab: a.r_tunnels_lab, lab_door: a.lab_door, fold_j3: a.fold_j3, fold_j8: a.fold_j8, p_under_tunnels: a.p_under_tunnels };

  for (let c = 1; c <= 9; c++) z.power.set(c, c !== DEAD);
  z.env = {
    ...z.env,
    ambient: 0x1a201a, ambientI: 0.44, fog: 0x0b0e0b, fogNear: 7, fogFar: 23, void: 0x040504, temp: 14,
    grade: 'tunnels', reverb: 'tunnel', ambience: 'tunnels', music: 'drone',
  };
  z.spawnTable = [['underlay', 2], ['ventling', 2], ['drywall_man', 1], ['grinhound', 1.5], ['occupant', 0.6]];
  z.creatureCap = 8;
  z.meta.shiftRate = 1.1;
  void TF; void wallId; void freeTile;
}

/** one shifting maze block: two different mazes and, once in a while, no maze at all */
function stampBlock(b: ZoneBuilder, rng: Rng, v: number, bl: Block) {
  const z = b.z, r = bl.r;
  const f = new Furnisher(b, rng);
  const conc = floorId('concrete'), wet = floorId('concrete_wet');
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = z.idx(x, y); z.floor[i] = 0; z.height[i] = 0; }
  const fill = (x0: number, y0: number, x1: number, y1: number, fl = conc) => {
    for (let y = Math.max(y0, r.y0); y <= Math.min(y1, r.y1); y++) for (let x = Math.max(x0, r.x0); x <= Math.min(x1, r.x1); x++) z.floor[z.idx(x, y)] = fl;
  };
  const ni = bl.i1 - bl.i0 + 1, nj = bl.j1 - bl.j0 + 1;
  const local = (n: number): [number, number] => [(n % NI) - bl.i0, Math.floor(n / NI) - bl.j0];
  const width = new Uint8Array(ni * nj);
  // crossings (fixed): the part of the corridor inside the block
  for (const c of bl.cross) {
    const oi = c.o % NI, oj = Math.floor(c.o / NI), ii = c.n % NI, jj = Math.floor(c.n / NI);
    if (oj === jj) { const [y0, y1] = lanes(C(jj), c.w); fill(Math.min(C(oi), C(ii)), y0, Math.max(C(oi), C(ii)), y1); }
    else { const [x0, x1] = lanes(C(ii), c.w); fill(x0, Math.min(C(oj), C(jj)), x1, Math.max(C(oj), C(jj))); }
    const [li, lj] = local(c.n); width[lj * ni + li] = Math.max(width[lj * ni + li], c.w);
  }
  const lights: [number, number][] = [];
  if (v === 2) {
    // the maze is gone: one low hall of square columns
    fill(C(bl.i0) - 1, C(bl.j0) - 1, C(bl.i1) + 1, C(bl.j1) + 1);
    for (let j = bl.j0; j <= bl.j1; j++) for (let i = bl.i0; i <= bl.i1; i++) {
      if ((i + j) % 2) { const x = C(i) + 3, y = C(j) + 3; if (x < C(bl.i1) && y < C(bl.j1)) { z.floor[z.idx(x, y)] = 0; } }
      if ((i * 3 + j) % 4 === 0) lights.push([C(i), C(j)]);
    }
    for (let y = C(bl.j0); y <= C(bl.j1); y += 3) for (let x = C(bl.i0); x <= C(bl.i1); x += 3) if (rng.chance(0.18)) z.floor[z.idx(x, y)] = wet;
  } else {
    const vis = new Uint8Array(ni * nj);
    const act: number[] = [];
    for (const c of bl.cross) { const [li, lj] = local(c.n); const k = lj * ni + li; if (!vis[k]) { vis[k] = 1; act.push(k); } }
    const edges: [number, number, number][] = [];
    while (act.length) {
      const q = v === 0 ? act.length - 1 : rng.int(0, act.length - 1);
      const k = act[q], i = k % ni, j = Math.floor(k / ni);
      const cand: number[] = [];
      for (const [di, dj] of DIRS) { const I = i + di, J = j + dj; if (I >= 0 && J >= 0 && I < ni && J < nj && !vis[J * ni + I]) cand.push(J * ni + I); }
      if (!cand.length) { act.splice(q, 1); continue; }
      const m = rng.pick(cand);
      const w = rng.chance(0.55) ? 1 : 2;
      edges.push([k, m, w]); vis[m] = 1; act.push(m);
      width[k] = Math.max(width[k], w); width[m] = Math.max(width[m], w);
    }
    // a couple of loops so it is not a pure tree
    for (let t = 0; t < 3; t++) {
      const k = rng.int(0, ni * nj - 1), i = k % ni, j = Math.floor(k / ni);
      const [di, dj] = rng.pick(DIRS);
      const I = i + di, J = j + dj;
      if (I >= 0 && J >= 0 && I < ni && J < nj) edges.push([k, J * ni + I, 1]);
    }
    for (const [k, m, w] of edges) {
      const ai = bl.i0 + (k % ni), aj = bl.j0 + Math.floor(k / ni), ci = bl.i0 + (m % ni), cj = bl.j0 + Math.floor(m / ni);
      const fl = rng.chance(0.12) ? wet : conc;
      if (aj === cj) { const [y0, y1] = lanes(C(aj), w); fill(Math.min(C(ai), C(ci)), y0, Math.max(C(ai), C(ci)), y1, fl); }
      else { const [x0, x1] = lanes(C(ai), w); fill(x0, Math.min(C(aj), C(cj)), x1, Math.max(C(aj), C(cj)), fl); }
    }
    for (let k = 0; k < ni * nj; k++) {
      if (!width[k]) continue;
      const i = bl.i0 + (k % ni), j = bl.j0 + Math.floor(k / ni);
      const [x0, x1] = lanes(C(i), width[k]), [y0, y1] = lanes(C(j), width[k]);
      fill(x0, y0, x1, y1);
      if (rng.chance(0.18)) lights.push([C(i), C(j)]);
    }
  }
  // inner walls: wherever floor meets nothing
  const cw = wallId('concrete');
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const i = z.idx(x, y), fl = z.floor[i] !== 0;
    if (y > r.y0) { const g = z.floor[z.idx(x, y - 1)] !== 0; z.wallN[i] = fl !== g ? cw : 0; }
    if (x > r.x0) { const g = z.floor[z.idx(x - 1, y)] !== 0; z.wallW[i] = fl !== g ? cw : 0; }
  }
  // dressing (no decals or items in a stamp: they would pile up)
  for (const [x, y] of lights) b.obj('light_bulb', x, y, 0, { circuit: bl.circuit, broken: rng.chance(0.4), flicker: rng.chance(0.3) ? 0.3 : 0 });
  let k = 0;
  for (let y = r.y0 + 1; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const i = z.idx(x, y);
    if (!z.floor[i]) continue;
    if (z.wallN[i] && rng.chance(0.12)) b.obj(k++ % 4 === 0 ? 'zg_cable_tray' : 'pipes_cluster', x, y, 0, { v: k % 3 });
    else if (x > r.x0 && z.wallW[i] && rng.chance(0.06)) b.obj('pipes_cluster', x, y, 3, {});
  }
  for (let t = 0; t < 6; t++) {
    const x = rng.int(r.x0 + 1, r.x1 - 1), y = rng.int(r.y0 + 1, r.y1 - 1);
    if (!z.floor[z.idx(x, y)]) continue;
    // keep the through-routes clear: only in dead-end-ish spots
    let open = 0;
    for (const [dx, dy] of DIRS) if (z.floor[z.idx(x + dx, y + dy)] && !z.edgeBlocks(x, y, dx, dy)) open++;
    if (open <= 1) f.place(rng.pick(['crate_wood', 'barrel_oil', 'cardboard_box', 'trash_bags', 'skeleton']), x, y, rng.int(0, 3) as Rot, {});
  }
}

defZone({
  key: 'tunnels', name: 'Service Tunnels', W: 160, H: 160, depth: 3, gen: (z, s) => generateTunnels(z, s),
  blurb: 'Concrete, pipes and running water. Every junction has a number. The numbers are the only thing you can trust.',
});
