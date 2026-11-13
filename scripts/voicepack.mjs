// Packs Dr. Calder's voice clips (dist/voice/calder/*.ogg) into a few packN.ogg files for uploads with a file limit
// (itch.io allows 1000) and fewer requests. Each pack is the clips' OGG files laid end to end; packs.json maps
// a clip to [pack, offset, length] so src/audio/calderVoice.ts can slice and decode one clip at a time.
// Clips go in manifest order (the greeting first), the spoken-number clips in their own pack.
//   node scripts/voicepack.mjs <buildDir>      (rewrites <buildDir>/voice/calder in place)
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.argv[2] ?? 'dist', 'voice', 'calder');
if (!existsSync(join(dir, 'manifest.json'))) { console.log('voicepack: no voice manifest, nothing to pack'); process.exit(0); }
const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const have = new Set(readdirSync(dir).filter((f) => f.endsWith('.ogg') && !/^pack\d+\.ogg$/.test(f)).map((f) => f.slice(0, -4)));

// clip order: lines in manifest order, then the number clips, then anything left over
const order = [];
const seen = new Set();
const push = (f) => { if (have.has(f) && !seen.has(f)) { seen.add(f); order.push(f); } };
for (const e of man.lines ?? []) for (const f of e.f ?? []) if (f !== '#') push(f);
const lineCount = order.length;
for (const v of Object.values(man.num ?? {})) push(v[0]);
for (const f of [...have].sort()) push(f);

const TARGET = 640 * 1024;
const packs = [];
let cur = null;
order.forEach((f, i) => {
  const buf = readFileSync(join(dir, f + '.ogg'));
  const numberStart = i === lineCount;
  if (!cur || cur.size + buf.length > TARGET || numberStart) { cur = { parts: [], size: 0, map: [] }; packs.push(cur); }
  cur.map.push([f, cur.size, buf.length]);
  cur.parts.push(buf);
  cur.size += buf.length;
});

const index = { v: 1, files: [], clips: {} };
packs.forEach((p, i) => {
  const name = `pack${i}.ogg`; // .ogg: every static host serves it (the clips inside are OGG files back to back)
  writeFileSync(join(dir, name), Buffer.concat(p.parts));
  index.files.push(name);
  for (const [f, off, len] of p.map) index.clips[f] = [i, off, len];
});
writeFileSync(join(dir, 'packs.json'), JSON.stringify(index));
for (const f of order) if (!/^pack\d+$/.test(f)) rmSync(join(dir, f + '.ogg'));
console.log(`voicepack: ${order.length} clips → ${packs.length} packs`);
