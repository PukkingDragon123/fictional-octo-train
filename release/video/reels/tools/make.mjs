// The reel tool: one reel.json in, one finished 1080 x 1920 reel out.
//   node release/video/reels/tools/make.mjs reels/hare.json [more.json ...] [--preview] [--still <t>] [--sheet] [--force]
//     --preview    half size, 12 rendered frames a second, a fast encode (build/preview/<id>.mp4)
//     --still t    one finished frame at t seconds, captions and all (build/stills/<id>_<t>.png)
//     --sheet      the middle frame of every shot, raw, as one picture: staging check (build/sheets/<id>_shots.jpg)
//     --force      render shots again even when cached; --redo b3,b5 just those shots
// Pipeline: Dr. Calder's lines (voice.py: Kokoro af_heart -> the 8-bit PA chain -> word timings, cached by
// text) -> the plan (each shot as long as its line) -> frames from the studio (tools/studio: the game's
// renderer; shots cached by content, one browser at a time) -> the soundtrack (mix2.py: voice, music bed,
// room beds, recorded CC0 effects by tag from sfx_tags.json) -> the picture (compose.py: scaling, the
// lockup, captions moving with her voice) -> H.264 + AAC, and a contact sheet (build/sheets/<id>.jpg).
// Schema: README.md. Env: REEL_PY (python with kokoro-onnx, faster-whisper), KOKORO_DIR, BASE (a running vite).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { REELS as RD, HERE, ROOT, openStudio, stopServer } from './studiopage.mjs';
import { X264 } from './enc.mjs';

const argv = process.argv.slice(2);
const opt = { preview: argv.includes('--preview'), force: argv.includes('--force'), sheet: argv.includes('--sheet') };
const redo = argv.includes('--redo') ? argv[argv.indexOf('--redo') + 1].split(',') : [];
const stillAt = argv.includes('--still') ? Number(argv[argv.indexOf('--still') + 1]) : null;
const files = argv.filter((a) => a.endsWith('.json'));
const PY = process.env.REEL_PY || 'python3';
const B = path.join(RD, 'build'), CACHE = process.env.REEL_CACHE || path.join(B, 'cache');
const LINK = fs.readFileSync(path.join(RD, 'itch_url.txt'), 'utf8').trim();
const FPS = 24, RFPS = opt.preview ? 12 : 24;
const TAGS = JSON.parse(fs.readFileSync(path.join(HERE, 'sfx_tags.json'), 'utf8'));
const SFX_DIR = path.join(RD, '../../../src/assets/sfx'), EXTRA = path.join(B, 'sfx_extra');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 14);
const rev = (...fs_) => sha(fs_.map((f) => fs.readFileSync(path.join(HERE, 'studio', f), 'utf8')).join('|'));
const REV_LEDGE = rev('reelShots.ts', 'paperCard.ts', 'adScreen.ts', 'reelActors.ts');
const REV_BEAT = fs.readFileSync(path.join(HERE, 'studio/reelSpec.ts'), 'utf8').match(/SPEC_REV = '([^']+)'/)?.[1] ?? rev('reelSpec.ts', 'reelActors.ts');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** the inhabitants: where they live, how they sound (tags in sfx_tags.json) */
export const CREATURES = {
  battering_hare: { name: 'Battering Hare', zone: 'meadow', find: 'open', steps: 'steps_dirt', step: 0.5, stepGain: -11, stepRate: 0.55, voice: ['breath', 'growl'], attack: ['hit', 'deepbreak', 'growl'] },
  gaunt_wolf: { name: 'Gaunt Wolf', zone: 'meadow', find: 'open', steps: 'steps_grass', step: 0.32, stepGain: -14, stepRate: 0.7, voice: ['growl', 'beast'], attack: ['wetbreak', 'growl', 'hit'] },
  parasite_salamander: { name: 'Parasite Salamander', zone: 'undercroft', find: 'open', steps: 'slime', step: 0.6, stepGain: -24, stepRate: 1.3, voice: ['cmisc', 'bug'], attack: ['squish', 'mud', 'slime'] },
  gulper: { name: 'Gulper', zone: 'plunge', find: 'water', steps: 'splash', step: 1.4, stepGain: -18, stepRate: 0.7, voice: ['burp', 'breath'], attack: ['splash', 'mud', 'burp'] },
  frog_piranha: { name: 'Frog-legged Piranha', zone: 'plunge', find: 'water', steps: 'splash', step: 0.9, stepGain: -20, stepRate: 1.3, voice: ['bug', 'cmisc'], attack: ['squish', 'hit', 'splash'] },
  balloon_puffer: { name: 'Balloon Puffer', zone: 'plunge', find: 'water', steps: null, voice: ['cweird', 'cmisc'], attack: ['squish', 'cweird'] },
  worm_train: { name: 'Worm Train', zone: 'subway', find: 'low', steps: 'metalhit', step: 0.22, stepGain: -22, stepRate: 0.8, voice: ['beast', 'growl'], attack: ['metalslam', 'wetbreak', 'beast'] },
  stalker: { name: 'Stalker', zone: 'lobby', find: 'open', steps: 'steps_lino', step: 0.62, stepGain: -16, stepRate: 0.85, voice: ['breath', 'zombie'], attack: ['hit', 'fall', 'zombie'] },
};
const BEDS = {
  ledge: [['bed_hum', -24], ['bed_drips', -27]], meadow: [['bed_wind', -24]], fields: [['bed_wind', -24]], undercroft: [['bed_drips', -24], ['bed_tunnel', -27]],
  tunnels: [['bed_drips', -24], ['bed_tunnel', -27]], plunge: [['bed_water', -26], ['bed_hum', -30]], pools: [['bed_water', -26]], subway: [['bed_tunnel', -24], ['bed_machine', -32]],
  lobby: [['bed_hum', -22]], annex: [['bed_hum', -22]], office: [['bed_hum', -23]],
};
const DEFAULT = {
  card: "If you want to join the Institute, here's my card.",
  end: "The Meridian Institute is now recruiting units. Scan the code, or comment 'unit', to enlist.",
  accent: ['Meridian Institute of Liminality', 'Meridian Institute', 'Liminality', 'unit', 'units', 'inhabitant', 'inhabitants'],
};

function sound(tag, seed) {
  const l = TAGS[tag] ?? (tag.includes('.') || tag.includes('_') ? [tag] : null);
  if (!l?.length) throw new Error('no sound for tag ' + tag);
  const f = l[parseInt(sha(seed), 16) % l.length];
  if (f.startsWith('extra/')) return path.join(EXTRA, f.slice(6));
  return path.join(SFX_DIR, f + '.mp3');
}

// ------------------------------------------------------------------ voice
function voices(texts) {
  const dir = path.join(CACHE, 'voice'); fs.mkdirSync(dir, { recursive: true });
  const want = [...new Set(texts)].map((text) => ({ key: sha('v1|' + text), text }));
  const todo = want.filter((w) => !fs.existsSync(path.join(dir, w.key + '.json')));
  if (todo.length) {
    const tmp = path.join(dir, `todo_${process.pid}.json`); fs.writeFileSync(tmp, JSON.stringify(todo));
    log(`voice: ${todo.length} new line(s)`);
    const r = spawnSync(PY, [path.join(HERE, 'voice.py'), dir, tmp], { stdio: 'inherit' });
    fs.rmSync(tmp, { force: true });
    if (r.status !== 0) throw new Error('voice.py failed');
  }
  const m = new Map(want.map((w) => [w.text, { ...JSON.parse(fs.readFileSync(path.join(dir, w.key + '.json'), 'utf8')), wav: path.join(dir, w.key + '.wav') }]));
  return (text) => m.get(text);
}

// ------------------------------------------------------------------ the plan
function plan(R) {
  const shots = [], lines = [];
  let t = 0;
  const cr = CREATURES[R.creature] ?? {};
  const zone = R.zone ?? cr.zone ?? 'ledge';
  if (R.legacy) {
    const P = JSON.parse(fs.readFileSync(path.join(B, 'plan.json'), 'utf8'))[R.legacy.reel];
    const L = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(B, 'lines.json'), 'utf8'))[R.legacy.reel]);
    for (const s of P.shots) shots.push({ id: s.id, kind: ['card', 'endcard'].includes(s.id) ? s.id : 'legacy', zone: 'ledge', at: s.at, dur: s.dur });
    for (const v of P.voice) lines.push({ text: L[v.key], at: v.at, nocap: v.key === 'bye' });
    return { shots, lines, total: P.total, zone: 'ledge' };
  }
  const add = (id, kind, z, dur, extra = {}) => { shots.push({ id, kind, zone: z, at: +t.toFixed(3), dur: +dur.toFixed(3), ...extra }); t += dur; };
  const say = (text, lead, tail, hold = 0) => { lines.push({ text, at: +(t + lead).toFixed(3) }); return { lead, tail, hold }; };
  const V = R._voice;
  { const v = V(R.intro.line); say(R.intro.line, 0.35, 0.3); add('intro', 'intro', 'ledge', 0.35 + v.dur + 0.3); }
  R.beats.forEach((b, i) => {
    const id = b.id ?? `b${i + 1}`;
    const v = b.line ? V(b.line) : null;
    const lead = b.lead ?? 0.25, tail = b.tail ?? 0.35;
    if (v) say(b.line, lead, tail);
    add(id, 'beat', b.zone ?? zone, b.dur ?? (v ? lead + v.dur + tail + (b.hold ?? 0) : 3), { spec: b.shot ?? {}, sfx: b.sfx ?? [], beat: b });
  });
  const card = R.card?.line ?? DEFAULT.card, end = R.end?.line ?? DEFAULT.end;
  { const v = V(card); say(card, 0.2, 0.3); add('card', 'card', 'ledge', 0.2 + v.dur + 0.3); }
  { const v = V(end); lines.push({ text: end, at: +(t + 0.6).toFixed(3), nocap: true }); add('endcard', 'endcard', 'ledge', 0.6 + v.dur + 3.0); }
  return { shots, lines, total: +t.toFixed(3), zone };
}

// ------------------------------------------------------------------ frames
const shotKey = (R, s) => s.kind === 'beat'
  ? sha([REV_BEAT, s.zone, R.seed ?? 1337, JSON.stringify(R.stage ?? {}), JSON.stringify(s.spec), s.dur, RFPS].join('|'))
  : s.kind === 'legacy' ? sha(['legacy', R.legacy.reel, s.id, s.dur, RFPS].join('|'))
    : sha([REV_LEDGE, s.kind, s.dur, s.kind === 'endcard' ? LINK : '', RFPS].join('|'));
const dims = (s) => (opt.preview ? [270, 480] : s.kind === 'endcard' ? [540, 960] : [405, 720]);
const nFrames = (s) => Math.round((s.at + s.dur) * FPS) - Math.round(s.at * FPS);

async function render(R, P, only = null) {
  const zones = [...new Set(P.shots.map((s) => s.zone))];
  for (const z of zones) {
    const list = P.shots.filter((s) => s.zone === z && (!only || only.includes(s)));
    const todo = [];
    for (const s of list) {
      s.key = shotKey(R, s); s.dir = path.join(CACHE, 'shots', s.key);
      if (s.kind === 'legacy' && R.legacy.frames && fs.existsSync(path.join(R.legacy.frames, String(Math.round((s.at + s.dur) * FPS) - 1).padStart(5, '0') + '.jpg')) && !opt.preview) { s.legacyDir = R.legacy.frames; continue; }
      if (only || opt.force || redo.includes(s.id) || !fs.existsSync(path.join(s.dir, 'done'))) todo.push(s);
    }
    if (!todo.length) continue;
    const spec = { stage: R.stage ?? { find: CREATURES[R.creature]?.find ?? 'open' }, shots: Object.fromEntries(P.shots.filter((s) => s.kind === 'beat').map((s) => [s.id, s.spec])) };
    for (const [w, h] of [...new Set(todo.map((s) => dims(s).join('x')))].map((d) => d.split('x').map(Number))) {
      const batch = todo.filter((s) => dims(s)[0] === w);
      log(`${R.id}: ${batch.length} shot(s) in ${z} at ${w}x${h}`);
      const st = await openStudio(LINK, { w, h, zone: z, seed: R.seed ?? 1337, spec });
      try {
        for (const s of batch) {
          fs.mkdirSync(s.dir, { recursive: true });
          const name = s.kind === 'legacy' ? R.legacy.reel : R.id;
          await st.begin(name, s.id, s.dur);
          if (only) { // a still: jump to the moment
            const b = await st.step(1 / RFPS, s.stillAt);
            s.still = path.join(s.dir, 'still.jpg'); fs.writeFileSync(s.still, b); continue;
          }
          const n = Math.ceil(s.dur * RFPS) + 1, t0 = Date.now();
          for (let j = 0; j < n; j++) fs.writeFileSync(path.join(s.dir, String(j).padStart(4, '0') + '.jpg'), await st.step(1 / RFPS));
          fs.writeFileSync(path.join(s.dir, 'done'), JSON.stringify({ n, stage: await st.stage() }));
          log(`  ${s.id} ${n} frames, ${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame`);
        }
      } finally { await st.close(); }
    }
  }
}
function framePaths(P) {
  const out = [];
  for (const s of P.shots) {
    const f0 = Math.round(s.at * FPS), n = nFrames(s);
    for (let j = 0; j < n; j++) {
      if (s.legacyDir) out.push(path.join(s.legacyDir, String(f0 + j).padStart(5, '0') + '.jpg'));
      else out.push(path.join(s.dir, String(opt.preview ? Math.floor(j / 2) : j).padStart(4, '0') + '.jpg'));
    }
  }
  return out;
}

// ------------------------------------------------------------------ sound
function soundtrack(R, P) {
  const sfx = [], beds = [];
  const S = (id, u = 0) => { const s = P.shots.find((x) => x.id === id); return s ? s.at + u : null; };
  const zoneSpans = [];
  for (const s of P.shots) { const last = zoneSpans[zoneSpans.length - 1]; if (last && last.z === s.zone) last.to = s.at + s.dur; else zoneSpans.push({ z: s.zone, from: s.at, to: s.at + s.dur }); }
  const endAt = S('endcard') ?? P.total;
  for (const zs of zoneSpans) {
    const from = Math.max(0, zs.from - 0.2), to = Math.min(endAt, zs.to + 0.3);
    if (to - from > 0.5) for (const [tag, g] of BEDS[zs.z] ?? []) beds.push({ file: sound(tag, tag), from, to, gain: g });
  }
  const cr = CREATURES[R.creature] ?? {};
  for (const s of P.shots.filter((x) => x.kind === 'beat')) {
    const sp = s.spec ?? {}, c0 = sp.creatures?.[0], cc = CREATURES[c0?.key ?? R.creature] ?? cr;
    const caught = sp.caught;
    // its steps while it moves, a sound of it, the catch
    if (c0?.from && cc.steps) for (let u = 0.15; u < Math.min(s.dur, caught ? caught.t : s.dur); u += cc.step) sfx.push({ file: sound(cc.steps, `${R.id}${s.id}${u}`), at: s.at + u, gain: cc.stepGain, rate: cc.stepRate });
    if (cc.voice && !s.beat.quiet) sfx.push({ file: sound(cc.voice[P.shots.indexOf(s) % cc.voice.length], R.id + s.id + 'v'), at: s.at + (s.beat.voiceAt ?? 0.5), gain: s.beat.voiceGain ?? -15, rate: cc.voiceRate ?? 0.85 });
    if (caught) {
      cc.attack.forEach((tg, i) => sfx.push({ file: sound(tg, R.id + s.id + tg), at: s.at + caught.t + i * 0.12, gain: -8 - i * 2 }));
      sfx.push({ file: sound('fall', R.id + s.id + 'f'), at: s.at + caught.t + 0.55, gain: -10 });
      sfx.push({ file: sound('cloth', R.id + s.id + 'c'), at: s.at + caught.t + 0.1, gain: -12 });
    }
    for (const e of s.sfx ?? []) sfx.push({ file: sound(e.tag, R.id + s.id + e.tag + (e.at ?? 0)), at: s.at + (e.at ?? 0), gain: e.gain ?? -12, rate: e.rate ?? 1, to: e.to !== undefined ? s.at + e.to : undefined, dur: e.dur, fade_out: e.fade_out ?? 0 });
  }
  const card = S('card'), end = S('endcard');
  if (card !== null) sfx.push({ file: sound('book', 'card'), at: card + 0.35, gain: -8 });
  if (end !== null) {
    sfx.push({ file: sound('whoosh', 'w'), at: end - 0.15, gain: -16, dur: 0.9, fade_out: 0.8 });
    sfx.push({ file: sound('breaker', 'b1'), at: end, gain: -10 });
    sfx.push({ file: sound('static', 's1'), at: end + 0.05, gain: -17, fade_out: 0.3 });
    sfx.push({ file: sound('bed_static', 'bs'), at: end + 0.3, to: P.total, gain: -36 });
    sfx.push({ file: sound('typing', 't'), at: end + 1.5, gain: -21, fade_out: 0.25, dur: 0.85 });
    sfx.push({ file: sound('static', 's2'), at: end + 3.5, gain: -21, fade_out: 0.25, dur: 0.45 });
    sfx.push({ file: sound('typing', 't'), at: end + 4.7, gain: -21, fade_out: 0.3, dur: 0.9 });
  }
  const bye = P.lines[P.lines.length - 1];
  return { beds, sfx, music: { file: sound('music', 'm'), gain: -19, up_at: bye.at + bye.dur + 0.2 } };
}

function run(cmd, args, o = {}) { const r = spawnSync(cmd, args, { stdio: 'inherit', ...o }); if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args[0]} failed`); }

// ------------------------------------------------------------------ one reel
async function make(file) {
  const R = JSON.parse(fs.readFileSync(file, 'utf8'));
  R.id ??= path.basename(file, '.json');
  if (R.legacy?.frames) R.legacy.frames = path.resolve(ROOT, R.legacy.frames);
  const cr = CREATURES[R.creature] ?? {};
  const work = path.join(CACHE, 'reels', R.id + (opt.preview ? '_preview' : '')); fs.mkdirSync(work, { recursive: true });
  // lines: voice first (the plan needs their lengths)
  const texts = R.legacy ? Object.values(Object.fromEntries(JSON.parse(fs.readFileSync(path.join(B, 'lines.json'), 'utf8'))[R.legacy.reel]))
    : [R.intro.line, ...R.beats.map((b) => b.line).filter(Boolean), R.card?.line ?? DEFAULT.card, R.end?.line ?? DEFAULT.end];
  R._voice = voices(texts);
  const P = plan(R);
  for (const l of P.lines) Object.assign(l, R._voice(l.text));
  log(`${R.id}: ${P.total.toFixed(1)} s, ${P.shots.length} shots, ${P.lines.length} lines`);
  const accent = [...DEFAULT.accent, ...(R.accent ?? []), ...(cr.name ? [cr.name, cr.name.replace(/-/g, ' ')] : [])];
  const hi = P.lines[0];
  const named = hi.words.find((w) => /^Meridian/.test(w[2]));
  const intro = P.shots[0];
  const logo = { from: +(hi.at + (named ? named[0] : 2.5) - 0.08).toFixed(2), to: +(intro.at + intro.dur - 0.3).toFixed(2) };
  const base = { fps: FPS, total: P.total, size: opt.preview ? [540, 960] : [1080, 1920], accent, logo, lines: P.lines.map((l) => ({ at: l.at, words: l.words, env: l.env, nocap: !!l.nocap, wav: l.wav, dur: l.dur })) };

  if (opt.sheet || stillAt !== null) {
    const picks = stillAt !== null ? [P.shots.find((s) => stillAt >= s.at && stillAt < s.at + s.dur) ?? P.shots[P.shots.length - 1]] : P.shots.filter((s) => s.kind === 'beat');
    for (const s of picks) s.stillAt = stillAt !== null ? Math.max(0.02, stillAt - s.at) : s.dur * 0.55;
    await render(R, P, picks);
    if (opt.sheet) {
      const out = path.join(B, 'sheets', R.id + '_shots.jpg'); fs.mkdirSync(path.dirname(out), { recursive: true });
      const ins = picks.flatMap((s) => ['-i', s.still]);
      const fl = picks.map((_, i) => `[${i}]scale=180:320,drawtext=fontfile=${path.join(RD, '../../../public/fonts/alagard.ttf')}:text='${picks[i].id}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';');
      const cols = Math.min(6, picks.length), rows = Math.ceil(picks.length / cols);
      void rows;
      run('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', `${fl};${picks.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${picks.length}:layout=${picks.map((_, i) => `${(i % cols) * 180}_${Math.floor(i / cols) * 320}`).join('|')}:fill=black`, '-frames:v', '1', out]);
      log('sheet', out);
    } else {
      const s = picks[0], tl = path.join(work, 'still.json');
      const idx = Math.round(stillAt * FPS);
      fs.writeFileSync(tl, JSON.stringify({ ...base, size: [1080, 1920], frames: Array(idx + 1).fill(s.still) }));
      const out = path.join(B, 'stills', `${R.id}_${stillAt}.png`); fs.mkdirSync(path.dirname(out), { recursive: true });
      run(PY, [path.join(HERE, 'compose.py'), tl, '--still', String(stillAt), out]);
      log('still', out);
    }
    return;
  }

  await render(R, P);
  // sound
  const wav = path.join(work, 'audio.wav');
  if (R.legacy) {
    run(PY, [path.join(HERE, 'mix.py'), path.join(B, 'plan.json'), SFX_DIR, EXTRA, path.join(B, 'voice'), R.legacy.reel, wav]);
  } else {
    const tl = path.join(work, 'sound.json');
    fs.writeFileSync(tl, JSON.stringify({ ...base, ...soundtrack(R, P) }));
    run(PY, [path.join(HERE, 'mix2.py'), tl, wav]);
  }
  // picture + encode
  const tl = path.join(work, 'timeline.json');
  fs.writeFileSync(tl, JSON.stringify({ ...base, frames: framePaths(P) }));
  const outDir = opt.preview ? path.join(B, 'preview') : RD; fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, opt.preview ? R.id + '.mp4' : (R.file ?? `limbo_phobia_reel_${R.id}.mp4`));
  const [W, H] = base.size;
  const venc = opt.preview ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p'] : X264.filter((a) => a !== '-an');
  log(`${R.id}: compose + encode -> ${out}`);
  await new Promise((ok, bad) => {
    const comp = spawn(PY, [path.join(HERE, 'compose.py'), tl, '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-i', wav,
      '-map', '0:v', '-map', '1:a', ...venc, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    comp.stdout.pipe(ff.stdin);
    let n = 0; const done = (c) => { if (c !== 0) bad(new Error('compose/encode failed')); else if (++n === 2) ok(); };
    comp.on('exit', done); ff.on('exit', done);
  });
  // contact sheet, every 2 s
  const sheet = path.join(B, 'sheets', R.id + (opt.preview ? '_preview' : '') + '.jpg'); fs.mkdirSync(path.dirname(sheet), { recursive: true });
  run('ffmpeg', ['-loglevel', 'error', '-y', '-i', out, '-vf', `fps=0.5,scale=180:320,tile=8x${Math.ceil(P.total / 16)}`, '-frames:v', '1', sheet]);
  log(`${R.id}: done ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB), sheet ${sheet}`);
}

try {
  for (const f of files) await make(f);   // one at a time: one browser, one encode
} finally { stopServer(); }
