// Headless zone checker: generates zones in Node (no WebGL), validates
// anchors/portals/links/reachability and writes a top-down PNG map.
//
//   node scripts/zonecheck.mjs                 # all zones
//   node scripts/zonecheck.mjs pools office    # specific zones (+ link checks against generated ones)
//   SEED=42 node scripts/zonecheck.mjs lobby
//   MAP=0 to skip PNGs. PNGs go to scripts/out/map_<zone>.png
import { createServer } from 'vite';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

// ---------------------------------------------------------------- minimal DOM shims
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : k === 'measureText' ? () => ({ width: 8 }) : () => {}), set: () => true });
function fakeCanvas() { return { width: 2048, height: 2048, style: {}, getContext: () => ctx2d, addEventListener() {}, toDataURL: () => '' }; }
globalThis.window = globalThis;
globalThis.document = { createElement: (t) => (t === 'canvas' ? fakeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} }, getElementById: () => null, addEventListener() {} };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' };
globalThis.requestAnimationFrame = () => 0;

const want = process.argv.slice(2);
const SEED = Number(process.env.SEED || 1337);
const OUT = path.resolve('scripts/out');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const warns = [];
const ow = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };
let wg, objects, defs;
try {
  await server.ssrLoadModule('/src/content/index.ts');
  await server.ssrLoadModule('/src/world/zones.ts');
  wg = await server.ssrLoadModule('/src/world/worldGraph.ts');
  objects = await server.ssrLoadModule('/src/world/objects.ts');
  defs = await server.ssrLoadModule('/src/world/defs.ts');
} catch (e) { console.warn = ow; console.error('LOAD FAILED', e); await server.close(); process.exit(1); }

const specs = wg.allZoneSpecs();
const keys = want.length ? want : specs.map((s) => s.key);
const zones = new Map();
const problems = [];
const P = (zk, msg) => problems.push(`[${zk}] ${msg}`);

for (const key of keys) {
  if (!wg.zoneSpec(key)) { P(key, 'no such zone registered'); continue; }
  const t0 = performance.now();
  const before = warns.length;
  let z;
  try { z = wg.generateZone(key, SEED); }
  catch (e) { P(key, 'GENERATION THREW: ' + (e && e.stack || e)); continue; }
  const ms = performance.now() - t0;
  zones.set(key, z);
  const newWarns = warns.slice(before);
  const uniq = [...new Set(newWarns)];
  for (const w of uniq.slice(0, 12)) P(key, 'warn: ' + w);
  if (uniq.length > 12) P(key, `... ${uniq.length - 12} more warnings`);
  let floors = 0; for (let i = 0; i < z.W * z.H; i++) if (z.floor[i]) floors++;
  console.log(`${key.padEnd(10)} ${z.W}x${z.H}  ${ms.toFixed(0)}ms  floor ${floors}  rooms ${z.rooms.length - 1}  objects ${z.objects.size}  lights ${z.lights.length}  portals ${z.portals.length}  anchors ${Object.keys(z.meta.anchors || {}).length}  spawn ${z.spawnTable.length} sp/cap ${z.creatureCap}`);
}

// ---------------------------------------------------------------- per zone checks
const walkable = (z, x, y) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0 && z.solid[z.idx(x, y)] !== 1;
function reach(z, sx, sy) {
  const seen = new Uint8Array(z.W * z.H);
  const q = [[sx, sy]]; seen[z.idx(sx, sy)] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!z.inb(X, Y) || seen[z.idx(X, Y)] || !walkable(z, X, Y)) continue;
      // closed (even locked) doors count as passable for layout purposes
      const e = dx ? z.edge(dx > 0 ? X : x, y, 1) : z.edge(x, dy > 0 ? Y : y, 0);
      if (z.edgeBlocks(x, y, dx, dy, 'walk') && !(e && (e.kind === 'door' || e.kind === 'gate'))) continue;
      seen[z.idx(X, Y)] = 1; q.push([X, Y]);
    }
    // loop portals connect distant tiles
    for (const p of z.portals) if (p.kind === 'loop' && p.x === x && p.y === y) {
      const X = x + (p.loopDx || 0), Y = y + (p.loopDy || 0);
      if (z.inb(X, Y) && !seen[z.idx(X, Y)]) { seen[z.idx(X, Y)] = 1; q.push([X, Y]); }
    }
  }
  return seen;
}
for (const [key, z] of zones) {
  const anchors = z.meta.anchors || {};
  for (const [id, a] of Object.entries(anchors)) {
    if (!Array.isArray(a) || a.length < 2) { P(key, `anchor ${id} malformed`); continue; }
    if (!walkable(z, a[0], a[1])) P(key, `anchor ${id} at ${a[0]},${a[1]} is not walkable`);
    for (const p of z.portals) if (p.kind !== 'loop' && p.x === a[0] && p.y === a[1]) P(key, `anchor ${id} sits on portal trigger ${p.id} (player would bounce)`);
  }
  for (const p of z.portals) {
    if (!z.inb(p.x, p.y)) P(key, `portal ${p.id} out of bounds`);
    if (p.kind === 'loop') {
      const X = p.x + (p.loopDx || 0), Y = p.y + (p.loopDy || 0);
      if (!walkable(z, X, Y)) P(key, `loop portal ${p.id} lands on unwalkable ${X},${Y}`);
      for (const q of z.portals) if (q !== p && q.kind === 'loop' && q.x === X && q.y === Y) P(key, `loop portal ${p.id} lands on loop trigger ${q.id} (ping-pong)`);
    }
  }
  // reachability from the first anchor
  const first = Object.values(anchors)[0];
  if (first && walkable(z, first[0], first[1])) {
    const seen = reach(z, first[0], first[1]);
    for (const [id, a] of Object.entries(anchors)) if (walkable(z, a[0], a[1]) && !seen[z.idx(a[0], a[1])]) P(key, `anchor ${id} unreachable from ${Object.keys(anchors)[0]}`);
    for (const p of z.portals) {
      if (p.kind === 'loop') continue;
      let ok = false;
      for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) if (z.inb(p.x + dx, p.y + dy) && seen[z.idx(p.x + dx, p.y + dy)]) ok = true;
      if (!ok) P(key, `portal ${p.id} (${p.x},${p.y}) unreachable from ${Object.keys(anchors)[0]}`);
    }
    let tot = 0, got = 0;
    for (let i = 0; i < z.W * z.H; i++) if (z.floor[i] && z.solid[i] !== 1) { tot++; if (seen[i]) got++; }
    if (tot && got / tot < 0.75) P(key, `only ${(100 * got / tot).toFixed(0)}% of walkable floor reachable from the first anchor`);
  } else if (!first) P(key, 'no anchors defined');
  if (!z.spawnTable.length && key !== 'exit') P(key, 'empty spawnTable');
}
// ---------------------------------------------------------------- cross-zone links
for (const [key, z] of zones) for (const p of z.portals) {
  if (p.kind === 'loop' || p.to === '__ending__') continue;
  if (!wg.zoneSpec(p.to)) { P(key, `portal ${p.id} → unknown zone ${p.to}`); continue; }
  const t = zones.get(p.to);
  if (!t) continue;
  const aid = p.anchor || p.id;
  if (!t.meta.anchors || !t.meta.anchors[aid]) P(key, `portal ${p.id} → ${p.to}: target has no anchor '${aid}'`);
}

// ---------------------------------------------------------------- PNG maps
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function hcol(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return [(h & 0x7f) + 80, ((h >> 8) & 0x7f) + 80, ((h >> 16) & 0x7f) + 80]; }
if (process.env.MAP !== '0') for (const [key, z] of zones) {
  const S = z.W * z.H > 40000 ? 3 : 4;
  const W = z.W * S, H = z.H * S;
  const img = Buffer.alloc(W * H * 3);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
  const fcache = new Map();
  for (let ty = 0; ty < z.H; ty++) for (let tx = 0; tx < z.W; tx++) {
    const f = z.floor[z.idx(tx, ty)];
    if (!f) { rect(tx * S, ty * S, S, S, [12, 10, 8]); continue; }
    let c = fcache.get(f);
    if (!c) { const fd = defs.floorDefById ? defs.floorDefById(f) : null; c = hcol(String(fd?.key ?? f)); fcache.set(f, c); }
    const solid = z.solid[z.idx(tx, ty)];
    rect(tx * S, ty * S, S, S, solid === 1 ? c.map((v) => v * 0.45) : solid ? c.map((v) => v * 0.75) : c);
  }
  for (let ty = 0; ty < z.H; ty++) for (let tx = 0; tx < z.W; tx++) {
    const i = z.idx(tx, ty);
    if (z.wallN[i]) { const e = z.edge(tx, ty, 0); rect(tx * S, ty * S, S, 1, e ? (e.kind === 'door' ? [230, 160, 40] : e.kind === 'window' ? [120, 200, 255] : [200, 200, 200]) : [20, 20, 20]); }
    if (z.wallW[i]) { const e = z.edge(tx, ty, 1); rect(tx * S, ty * S, 1, S, e ? (e.kind === 'door' ? [230, 160, 40] : e.kind === 'window' ? [120, 200, 255] : [200, 200, 200]) : [20, 20, 20]); }
  }
  for (const p of z.portals) rect(p.x * S, p.y * S, S, S, p.kind === 'loop' ? [255, 0, 255] : [255, 30, 30]);
  for (const a of Object.values(z.meta.anchors || {})) if (Array.isArray(a)) rect(a[0] * S + 1, a[1] * S + 1, S - 2, S - 2, [40, 255, 80]);
  for (const l of z.lights) put(Math.floor(l.x * S), Math.floor(l.z * S), l.on && !l.broken ? [255, 255, 160] : [90, 90, 60]);
  fs.writeFileSync(path.join(OUT, `map_${key}.png`), png(W, H, img));
}

console.warn = ow;
console.log('\n' + (problems.length ? `${problems.length} problem(s):\n` + problems.join('\n') : 'no problems found'));
console.log(process.env.MAP !== '0' ? `maps: ${OUT}/map_<zone>.png  (red = portal, magenta = loop, green = anchor, orange = door, blue = window)` : '');
await server.close();
process.exit(0);
