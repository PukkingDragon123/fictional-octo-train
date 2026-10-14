// Procedural audio engine. Every buffer comes from the recipe library
// (sounds.ts); this file decides where, how loud and through what each one is
// heard: positional one-shots muffled by the walls between source and
// listener, per-zone convolution reverb, ambience beds that react to the
// world (lit tubes hum louder, rain drums on roofs, powered machines purr),
// looping action sounds, body sounds driven by moodles, the SEER-9 radio and
// sparse generative music.
import { bus } from '../core/events';
import { G } from '../game/G';
import { clamp } from '../core/math';
import { synth, LOOP_KEYS } from './sounds';
import { impulse, SR } from './synth';
import { wallsBetween } from '../world/collision';
import { objDef } from '../world/objects';
import { itemDef } from '../items/item';
import type { Player } from '../entities/player';
import type { Zone } from '../world/zone';

type BusName = 'sfx' | 'amb' | 'music' | 'ui' | 'voice';

export interface PlayOpts {
  vol?: number;
  /** metres at which the sound fades out completely */
  range?: number;
  rate?: number;
  zone?: string;
  bus?: BusName;
  /** no wall muffling / panning (heard "everywhere") */
  flat?: boolean;
  /** reverb send multiplier */
  send?: number;
  /** seconds from now */
  delay?: number;
  variant?: number;
}

// ---------------------------------------------------------------- per-key defaults
interface Info { range?: number; vars?: number; vol?: number; send?: number; pv?: number }
const INFO: Record<string, Info> = {};
const info = (keys: string, i: Info) => { for (const k of keys.split(/\s+/)) if (k) INFO[k] = { ...INFO[k], ...i }; };
info('step_carpet step_wetcarpet step_tile step_concrete step_linoleum step_grass step_dirt step_gravel step_wood step_metal step_water step_deep pad hoof', { range: 16, vars: 6, vol: 0.55, pv: 0.07 });
info('gun_pistol', { range: 90, vars: 2, send: 0.8 });
info('glass_break door_kick break', { range: 36, vars: 3 });
info('hammer', { range: 32, vars: 4 });
info('saw dig', { range: 18 });
info('door_open door_close knock lock door_locked window_slide wood_creak', { range: 22, vars: 3 });
info('hound_laugh hound_snarl doe_shriek mimic_call dog_bark hollow_moan', { range: 42, vars: 3 });
info('leviathan_rumble', { range: 140, vars: 2, send: 0.9 });
info('sentinel_hum custodian_tone', { range: 50 });
info('thud_distant door_far steps_far car_alarm_far pa_chime school_bell elevator_ding phone_ring', { range: 80, vars: 3 });
info('whisper', { range: 9, vars: 4 });
info('hit_blunt hit_blade hit_crit', { range: 22, vars: 4 });
info('heartbeat breath stomach teeth wake_gasp', { vars: 2, pv: 0.02 });
info('cloth crinkle metal_clank plastic_tap thud_soft drawer_wood drawer_metal cabinet rummage equip fluoro_tick drip beep', { range: 14, vars: 4 });
info('mbox epiano piano synpad bass_soft choir', { pv: 0 });
info('power_on power_off', { range: 60, vars: 1, send: 0.8 });

/** loop recipes get their tail crossfaded into their head so they cycle seamlessly */
const LOOPS = new Set(['hum_fluoro', 'rain', 'wind', 'drip_room', 'server_hum', 'machine_hum', 'fire_crackle', 'water_lap', 'static', 'mall_air', 'tunnel_air',
  'fridge_hum', 'generator_loop', 'computer_hum', 'tv_hum', 'beep_loop', 'crickets', 'playground_far', 'murmur', 'tinnitus', 'crt', 'beacon', 'numbers', 'drone_bed', 'moth_flutter', 'sentinel_hum']);

// ---------------------------------------------------------------- zone profiles
interface Rev { secs: number; k: number; bright: number; wet: number }
const REVERB: Record<string, Rev> = {
  hall: { secs: 3.2, k: 1.6, bright: 0.45, wet: 0.34 },
  office: { secs: 1.4, k: 3.8, bright: 0.38, wet: 0.24 },
  pool: { secs: 5.2, k: 0.85, bright: 0.85, wet: 0.5 },
  tunnel: { secs: 4.0, k: 1.1, bright: 0.25, wet: 0.46 },
  mall: { secs: 3.8, k: 1.2, bright: 0.55, wet: 0.4 },
  outdoor: { secs: 0.9, k: 6, bright: 0.3, wet: 0.08 },
  small: { secs: 0.7, k: 8, bright: 0.4, wet: 0.16 },
  stair: { secs: 3.2, k: 1.4, bright: 0.6, wet: 0.46 },
  server: { secs: 1.8, k: 3.2, bright: 0.6, wet: 0.26 },
  dream: { secs: 4.6, k: 1.0, bright: 0.7, wet: 0.42 },
  void: { secs: 7.0, k: 0.5, bright: 0.2, wet: 0.62 },
};

interface Bed { key: string; vol: number; lp?: number; rate?: number; when?: 'day' | 'night' | 'lit' }
interface AmbEvent { keys: string[]; every: [number, number]; vol: number; dist: [number, number]; when?: 'day' | 'night' }
interface AmbProfile { beds: Bed[]; events: AmbEvent[]; music: string; reverb: string }

const FAR_THINGS = ['thud_distant', 'door_far', 'steps_far'];
const AMB: Record<string, AmbProfile> = {
  hum: {
    beds: [{ key: 'hum_fluoro', vol: 0.5, when: 'lit' }, { key: 'mall_air', vol: 0.09, lp: 380 }],
    events: [{ keys: [...FAR_THINGS, 'scrape_wall', 'carpet_rustle'], every: [22, 70], vol: 0.4, dist: [18, 42] }],
    music: 'drone', reverb: 'hall',
  },
  office: {
    beds: [{ key: 'hum_fluoro', vol: 0.4, when: 'lit' }, { key: 'computer_hum', vol: 0.05 }, { key: 'mall_air', vol: 0.07, lp: 400 }],
    events: [{ keys: ['phone_ring', 'chair_squeak', 'door_far', 'paper', 'steps_far'], every: [25, 75], vol: 0.35, dist: [14, 36] }],
    music: 'drone', reverb: 'office',
  },
  pool: {
    beds: [{ key: 'water_lap', vol: 0.22 }, { key: 'drip_room', vol: 0.3 }, { key: 'mall_air', vol: 0.06, lp: 600 }],
    events: [{ keys: ['drip', 'drip', 'thud_distant', 'steps_far'], every: [10, 40], vol: 0.4, dist: [8, 30] }],
    music: 'pads', reverb: 'pool',
  },
  mall: {
    beds: [{ key: 'mall_air', vol: 0.2 }, { key: 'murmur', vol: 0.045, lp: 900 }],
    events: [{ keys: ['pa_chime', 'elevator_ding', 'steps_far', 'door_far'], every: [35, 90], vol: 0.35, dist: [20, 50] }],
    music: 'muzak', reverb: 'mall',
  },
  market: {
    beds: [{ key: 'fridge_hum', vol: 0.12 }, { key: 'hum_fluoro', vol: 0.35, when: 'lit' }, { key: 'mall_air', vol: 0.1 }],
    events: [{ keys: ['pa_chime', 'steps_far', 'beep'], every: [40, 100], vol: 0.3, dist: [16, 40] }],
    music: 'muzak', reverb: 'mall',
  },
  parking: {
    beds: [{ key: 'tunnel_air', vol: 0.22 }, { key: 'drip_room', vol: 0.12 }],
    events: [{ keys: ['door_far', 'steps_far', 'car_alarm_far', 'drip'], every: [30, 80], vol: 0.35, dist: [20, 55] }],
    music: 'drone', reverb: 'tunnel',
  },
  suburbs: {
    beds: [{ key: 'wind', vol: 0.12 }, { key: 'crickets', vol: 0.14, when: 'night' }, { key: 'playground_far', vol: 0.035, lp: 1100, when: 'day' }],
    events: [{ keys: ['birds_dream', 'birds_dream', 'door_far', 'dog_bark'], every: [18, 55], vol: 0.3, dist: [20, 50], when: 'day' },
      { keys: ['door_far', 'thud_distant'], every: [40, 100], vol: 0.3, dist: [25, 60], when: 'night' }],
    music: 'musicbox', reverb: 'outdoor',
  },
  fields: {
    beds: [{ key: 'wind', vol: 0.26 }, { key: 'crickets', vol: 0.16, when: 'night' }],
    events: [{ keys: ['birds_dream'], every: [12, 40], vol: 0.3, dist: [15, 45], when: 'day' }, { keys: ['music_box_broken'], every: [120, 300], vol: 0.18, dist: [30, 60] }],
    music: 'musicbox', reverb: 'dream',
  },
  school: {
    beds: [{ key: 'hum_fluoro', vol: 0.3, when: 'lit' }, { key: 'mall_air', vol: 0.1, lp: 500 }, { key: 'playground_far', vol: 0.03, lp: 900 }],
    events: [{ keys: ['school_bell', 'pa_chime', 'steps_far', 'door_far'], every: [45, 110], vol: 0.3, dist: [20, 50] }],
    music: 'musicbox', reverb: 'hall',
  },
  hospital: {
    beds: [{ key: 'hum_fluoro', vol: 0.4, when: 'lit' }, { key: 'mall_air', vol: 0.08, lp: 500 }],
    events: [{ keys: ['beep', 'door_far', 'steps_far', 'thud_distant'], every: [25, 70], vol: 0.3, dist: [14, 40] }],
    music: 'drone', reverb: 'office',
  },
  tunnels: {
    beds: [{ key: 'tunnel_air', vol: 0.32 }, { key: 'drip_room', vol: 0.26 }],
    events: [{ keys: ['thud_distant', 'scrape_wall', 'vent_clank', 'steps_far'], every: [18, 55], vol: 0.4, dist: [16, 45] }],
    music: 'drone', reverb: 'tunnel',
  },
  lab: {
    beds: [{ key: 'machine_hum', vol: 0.08 }, { key: 'server_hum', vol: 0.05 }, { key: 'hum_fluoro', vol: 0.3, when: 'lit' }],
    events: [{ keys: ['beep', 'door_far', 'static_burst'], every: [25, 70], vol: 0.25, dist: [12, 36] }],
    music: 'drone', reverb: 'office',
  },
  server: {
    beds: [{ key: 'server_hum', vol: 0.32 }],
    events: [{ keys: ['beep', 'static_burst', 'thud_distant'], every: [20, 60], vol: 0.25, dist: [12, 36] }],
    music: '', reverb: 'server',
  },
  stairwell: {
    beds: [{ key: 'tunnel_air', vol: 0.16 }],
    events: [{ keys: ['steps_far', 'steps_far', 'door_far'], every: [16, 45], vol: 0.45, dist: [12, 30] }],
    music: '', reverb: 'stair',
  },
  corrupt: {
    beds: [{ key: 'static', vol: 0.05, lp: 2400 }, { key: 'tunnel_air', vol: 0.2 }],
    events: [{ keys: ['static_burst', 'deja', 'whisper', 'music_box_broken'], every: [10, 35], vol: 0.35, dist: [6, 28] }],
    music: 'broken', reverb: 'void',
  },
  exit: { beds: [{ key: 'wind', vol: 0.05 }], events: [], music: 'choir', reverb: 'dream' },
  house: {
    beds: [{ key: 'fridge_hum', vol: 0.05, lp: 500 }, { key: 'tv_hum', vol: 0.02, lp: 1800 }],
    events: [{ keys: ['wood_creak', 'door_far', 'plush_squeak', 'music_box_broken', 'steps_far'], every: [25, 70], vol: 0.3, dist: [8, 26] }],
    music: 'musicbox', reverb: 'small',
  },
  void: { beds: [{ key: 'tunnel_air', vol: 0.18 }, { key: 'static', vol: 0.03, lp: 1500 }], events: [{ keys: ['thud_distant', 'deja'], every: [30, 80], vol: 0.3, dist: [20, 60] }], music: 'drone', reverb: 'void' },
};

const HUM_LOOP: Record<string, string> = {
  fluoro: 'hum_fluoro', fridge: 'fridge_hum', generator: 'generator_loop', machine: 'machine_hum', server: 'server_hum',
  computer: 'computer_hum', tv: 'tv_hum', beep: 'beep_loop', fire: 'fire_crackle',
};
const HUM_VOL: Record<string, number> = { fluoro: 0.25, fridge: 0.35, generator: 0.8, machine: 0.45, server: 0.5, computer: 0.3, tv: 0.35, beep: 0.4, fire: 0.6 };

/** action sounds repeated while a timed action runs: [min, max] seconds between hits */
const REPEAT: Record<string, [number, number]> = {
  eat: [1.25, 1.35], drink: [1.3, 1.4], fill: [1.35, 1.45], hammer: [0.55, 0.8], saw: [0.46, 0.52], dig: [1.0, 1.3], craft: [0.7, 1.4],
};

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rr = (a: number, b: number) => a + Math.random() * (b - a);

interface LoopVoice {
  key: string; src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode | null; send: GainNode | null;
  stopAt?: number;
}
interface Repeater { key: string; p: Player; next: number }

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private comp!: DynamicsCompressorNode;
  private buses = {} as Record<BusName, GainNode>;
  private reverb!: ConvolverNode;
  private reverbIn!: GainNode;
  private reverbOut!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private radioFilter!: BiquadFilterNode;
  private bufs = new Map<string, AudioBuffer>();
  private lastVar = new Map<string, number>();
  private voices = 0;
  private recent = new Map<string, number>();
  vol = { master: 0.85, sfx: 1, amb: 0.8, music: 0.5, ui: 0.6, voice: 1 };
  /** listener */
  private L = { x: 0, z: 0, zone: '', rtX: 1, rtZ: 0, zoneRef: null as Zone | null };
  private t = 0;
  private profileKey = '';
  private profile: AmbProfile = AMB.hum;
  private beds = new Map<string, LoopVoice>();
  private nextEvent: number[] = [];
  private objLoops = new Map<number, LoopVoice>();
  private objScanT = 0;
  private creatureLoops = new Map<string, LoopVoice>();
  private creatureSteps = new Map<string, { x: number; z: number; acc: number }>();
  private repeaters: Repeater[] = [];
  private lightHum = 0;
  private lightScanT = 0;
  private flickerT = 0;
  // body
  private heartNext = 0; private breathNext = 0; private stomachNext = 30; private coughNext = 20; private teethNext = 0; private whisperNext = 40;
  // radio
  private radio = { on: false, t: -10, strength: 0, sig: null as any, freq: 0 };
  private radioNoise: LoopVoice | null = null;
  private radioSig: LoopVoice | null = null;
  private radioSigKey = '';
  private crt: LoopVoice | null = null;
  private rain: LoopVoice | null = null;
  private tinnitus: LoopVoice | null = null;
  private deaf = 0;
  private sleepDuck = false;
  private dead = false;
  // music
  private style = '';
  private musicNext = 0;
  private musicRestUntil = 0;
  private mb = { deg: 7, left: 0 };
  private muzakBeat = 0;
  private stingT = -100;
  private pianoDeg = 7;
  private reverbKey = '';

  constructor() {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive', sampleRate: SR });
    } catch { this.ctx = null; return; }
    const ctx = this.ctx;
    this.loadVolumes();
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 12; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.muffle.connect(this.comp); this.comp.connect(this.master); this.master.connect(ctx.destination);
    for (const b of ['sfx', 'amb', 'music', 'ui', 'voice'] as BusName[]) {
      const g = ctx.createGain(); g.gain.value = (this.vol as any)[b];
      g.connect(b === 'ui' ? this.comp : this.muffle);
      this.buses[b] = g;
    }
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
    this.musicFilter.connect(this.buses.music);
    this.radioFilter = ctx.createBiquadFilter(); this.radioFilter.type = 'bandpass'; this.radioFilter.frequency.value = 1500; this.radioFilter.Q.value = 0.6;
    this.radioFilter.connect(this.buses.ui);
    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.3;
    this.reverbIn.connect(this.reverb); this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.muffle);
    this.setReverb('hall');
    // browsers start contexts suspended until a gesture
    const resume = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('keydown', resume, { capture: true });
    this.hook();
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  // ---------------------------------------------------------------- settings
  private loadVolumes() {
    try { const s = localStorage.getItem('noclip.audio'); if (s) Object.assign(this.vol, JSON.parse(s)); } catch { /* storage unavailable */ }
  }
  setVolume(b: keyof AudioEngine['vol'], v: number) {
    this.vol[b] = clamp(v, 0, 1);
    if (!this.ctx) return;
    if (b === 'master') this.master.gain.setTargetAtTime(this.vol.master, this.ctx.currentTime, 0.05);
    else this.buses[b as BusName].gain.setTargetAtTime(this.vol[b], this.ctx.currentTime, 0.05);
    try { localStorage.setItem('noclip.audio', JSON.stringify(this.vol)); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- buffers
  private buffer(key: string, v: number): AudioBuffer | null {
    const ck = key + ':' + v;
    let ab = this.bufs.get(ck);
    if (ab) return ab;
    const b = synth(key, v);
    if (!b || !this.ctx) return null;
    let data = b.d;
    if (LOOPS.has(key) || LOOP_KEYS.has(key)) {
      // crossfade the tail into the head: the cut becomes inaudible
      const L = Math.min(Math.floor(0.3 * SR), Math.floor(data.length / 3));
      const n = data.length - L;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = data[i];
      for (let i = 0; i < L; i++) { const w = i / L; out[i] = data[i] * w + data[n + i] * (1 - w); }
      data = out;
    }
    ab = this.ctx.createBuffer(1, data.length, SR);
    ab.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    this.bufs.set(ck, ab);
    return ab;
  }
  private variant(key: string) {
    const n = INFO[key]?.vars ?? 3;
    if (n <= 1) return 0;
    let v = Math.floor(Math.random() * n);
    if (v === this.lastVar.get(key)) v = (v + 1) % n;
    this.lastVar.set(key, v);
    return v;
  }

  // ---------------------------------------------------------------- spatial
  private spatial(x: number, z: number, range: number, flat: boolean) {
    const L = this.L;
    const dx = x - L.x, dz = z - L.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return null;
    const near = 1 / (1 + Math.max(0, d - 1.2) * 0.11);
    const fade = 1 - smooth(range * 0.5, range, d);
    let walls = 0;
    if (!flat && d > 1.0 && L.zoneRef) walls = wallsBetween(L.zoneRef, L.x, L.z, x, z, 4);
    const gain = near * fade * Math.pow(0.45, walls);
    const cutoff = walls ? 7000 / (1 + walls * 2.4) : 20000 - Math.min(15000, d * 240);
    const pan = flat || d < 0.8 ? 0 : clamp((dx * L.rtX + dz * L.rtZ) / Math.max(2.5, d), -1, 1) * 0.8;
    const send = 0.3 + Math.min(0.45, (d / range) * 0.6) + walls * 0.18;
    return { gain, pan, cutoff, send, d, walls };
  }

  /** play a sound at a world position (x,z metres) */
  play(key: string, x: number, z: number, o: PlayOpts = {}): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return null;
    if ((o.zone ?? this.L.zone) !== this.L.zone) return null;
    const inf = INFO[key] || {};
    const range = o.range ?? inf.range ?? 24;
    const sp = this.spatial(x, z, range, !!o.flat);
    if (!sp || sp.gain < 0.004) return null;
    // de-duplicate the same sound stacking within a few ms
    const dk = key + ((x * 2) | 0) + ':' + ((z * 2) | 0);
    const last = this.recent.get(dk) ?? -1;
    if (this.t - last < 0.035) return null;
    this.recent.set(dk, this.t);
    if (this.voices > 48 && sp.gain < 0.3) return null;
    const v = o.variant ?? this.variant(key);
    const buf = this.buffer(key, v);
    if (!buf) return null;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const pv = inf.pv ?? 0.05;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 2 * pv);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.cutoff; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = (o.vol ?? 1) * (inf.vol ?? 1) * sp.gain;
    const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
    src.connect(f); f.connect(pan); pan.connect(g); g.connect(this.buses[o.bus ?? 'sfx']);
    const sendAmt = sp.send * (o.send ?? inf.send ?? 1);
    let send: GainNode | null = null;
    if (sendAmt > 0.01) { send = ctx.createGain(); send.gain.value = sendAmt; g.connect(send); send.connect(this.reverbIn); }
    // sound travels ~343 m/s: distant gunshots and slams arrive late
    const delay = (o.delay ?? 0) + (sp.d > 18 ? sp.d / 343 : 0);
    src.start(ctx.currentTime + delay);
    this.voices++;
    src.onended = () => { this.voices--; src.disconnect(); f.disconnect(); pan.disconnect(); g.disconnect(); send?.disconnect(); };
    return src;
  }

  /** non-positional sound on a bus */
  flat(key: string, b: BusName, vol = 1, rate = 1, when = 0, variant?: number): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return null;
    const v = variant ?? this.variant(key);
    const buf = this.buffer(key, v);
    if (!buf) return null;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(b === 'music' ? this.musicFilter : this.buses[b]);
    src.start(Math.max(ctx.currentTime, when || ctx.currentTime));
    this.voices++;
    src.onended = () => { this.voices--; src.disconnect(); g.disconnect(); };
    return src;
  }

  private startLoop(key: string, b: BusName | 'radio', vol: number, opts: { lp?: number; rate?: number; spatial?: boolean; fadeIn?: number; variant?: number } = {}): LoopVoice | null {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return null;
    const buf = this.buffer(key, opts.variant ?? 0);
    if (!buf) return null;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = opts.rate ?? 1;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = opts.lp ?? 20000; filter.Q.value = 0.5;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = opts.spatial ? ctx.createStereoPanner() : null;
    src.connect(filter);
    if (pan) { filter.connect(pan); pan.connect(gain); } else filter.connect(gain);
    gain.connect(b === 'radio' ? this.radioFilter : this.buses[b]);
    let send: GainNode | null = null;
    if (opts.spatial) { send = ctx.createGain(); send.gain.value = 0.3; gain.connect(send); send.connect(this.reverbIn); }
    // start at a random offset so identical loops never phase together
    src.start(ctx.currentTime, Math.random() * buf.duration);
    gain.gain.setTargetAtTime(vol, ctx.currentTime, opts.fadeIn ?? 0.6);
    return { key, src, gain, filter, pan, send };
  }
  private stopLoop(lv: LoopVoice | null | undefined, fade = 0.5) {
    if (!lv || !this.ctx) return;
    const now = this.ctx.currentTime;
    lv.gain.gain.cancelScheduledValues(now);
    lv.gain.gain.setTargetAtTime(0, now, fade / 3);
    try { lv.src.stop(now + fade + 0.05); } catch { /* already stopped */ }
    lv.src.onended = () => { lv.src.disconnect(); lv.filter.disconnect(); lv.pan?.disconnect(); lv.gain.disconnect(); lv.send?.disconnect(); };
  }
  private placeLoop(lv: LoopVoice, x: number, z: number, vol: number, range: number) {
    const ctx = this.ctx!;
    const sp = this.spatial(x, z, range, false);
    const now = ctx.currentTime;
    const g = sp ? vol * sp.gain : 0;
    lv.gain.gain.setTargetAtTime(g, now, 0.15);
    if (sp) {
      lv.filter.frequency.setTargetAtTime(sp.cutoff, now, 0.15);
      lv.pan?.pan.setTargetAtTime(sp.pan, now, 0.15);
      lv.send?.gain.setTargetAtTime(sp.send, now, 0.3);
    }
  }

  private setReverb(key: string) {
    if (!this.ctx || key === this.reverbKey) return;
    this.reverbKey = key;
    const r = REVERB[key] || REVERB.hall;
    const ch = impulse(r.secs, r.k, r.bright, 0.02, true);
    const ab = this.ctx.createBuffer(2, ch[0].length, SR);
    ab.copyToChannel(ch[0] as Float32Array<ArrayBuffer>, 0); ab.copyToChannel(ch[1] as Float32Array<ArrayBuffer>, 1);
    this.reverb.buffer = ab;
    this.reverbOut.gain.setTargetAtTime(r.wet, this.ctx.currentTime, 0.3);
  }

  // ---------------------------------------------------------------- public API used by gameplay code
  at(key: string, x: number, z: number, vol = 1) { this.play(key, x, z, { vol }); }
  ui(key: string, vol = 0.55) { this.flat(key, 'ui', vol, 1 + (Math.random() - 0.5) * 0.04); }

  /** start/stop the repeating sound of a timed action performed by a player */
  loop(key: string, p: Player, on: boolean) {
    const i = this.repeaters.findIndex((r) => r.key === key && r.p === p);
    if (on && i < 0) this.repeaters.push({ key, p, next: this.t + 0.05 });
    else if (!on && i >= 0) this.repeaters.splice(i, 1);
  }

  itemSound(itemKey: string, kind: 'pick' | 'drop' | 'equip' | 'cloth' | string, p: Player) {
    const d = itemDef(itemKey);
    if (!d) return;
    const tags = d.tags || [];
    let key = 'grab', vol = 0.6;
    if (kind === 'cloth' || d.cat === 'clothing' || d.cat === 'bag') key = 'cloth';
    else if (kind === 'equip') key = d.cat === 'weapon' || tags.includes('knife') ? 'metal_clank' : 'equip';
    else if (tags.includes('glass') || tags.includes('bottle')) key = 'glass_clink';
    else if (tags.includes('can') || tags.includes('canned')) key = 'metal_clank';
    else if (d.cat === 'food' && (tags.includes('snack') || tags.includes('sweet'))) key = 'crinkle';
    else if (d.cat === 'literature' || d.cat === 'lore') key = 'paper';
    else if (d.cat === 'medical') key = tags.includes('pills') ? 'pills' : 'crinkle';
    else if (d.cat === 'weapon' || d.cat === 'tool' || d.cat === 'ammo') key = 'metal_clank';
    else if (d.cat === 'electronics' || d.cat === 'light' || tags.includes('plastic')) key = 'plastic_tap';
    if (kind === 'drop' && d.weight >= 4) { key = 'thud_soft'; vol = clamp(0.4 + d.weight * 0.05, 0.4, 1); }
    if (key === 'metal_clank') vol *= kind === 'equip' ? 0.35 : 0.5;
    this.play(key, p.x, p.z, { vol, zone: p.zoneKey });
  }

  objSound(objKey: string, kind: 'open' | 'close' | 'search' | string, x: number, y: number) {
    const d = objDef(objKey);
    const tags = d?.tags || [];
    const mat = d?.sound || 'wood';
    let key = 'cabinet';
    if (tags.includes('fridge') || tags.includes('freezer')) key = 'fridge_open';
    else if (tags.includes('drawers') || tags.includes('desk') || /drawer|desk|dresser|filing/.test(objKey)) key = mat === 'metal' ? 'drawer_metal' : 'drawer_wood';
    else if (mat === 'metal') key = 'drawer_metal';
    else if (mat === 'fabric' || mat === 'flesh') key = 'rummage';
    else if (mat === 'plastic') key = 'plastic_tap';
    else if (mat === 'paper') key = 'paper';
    else if (mat === 'glass') key = 'glass_clink';
    if (kind === 'search') key = 'rummage';
    this.play(key, x + 0.5, y + 0.5, { vol: 0.8 });
  }

  creature(snd: string, c: any) {
    const sp = c.sp || {};
    const big = sp.flags?.leviathan ? 1.3 : 1;
    const rate = clamp(1.6 / Math.max(0.6, (sp.height ?? 1.6)), 0.6, 1.5) * (0.97 + Math.random() * 0.06);
    this.play(snd, c.x, c.z, { zone: c.zoneKey, vol: 0.9 * big, rate: snd.startsWith('hound') || snd.startsWith('dog') ? 1 : rate });
  }

  hit(kind: string, x: number, z: number, crit = false) {
    const key = kind === 'blade' || kind === 'axe' || kind === 'spear' ? 'hit_blade' : 'hit_blunt';
    this.play(key, x, z, { vol: 0.9 });
    if (crit) this.play('hit_crit', x, z, { vol: 0.8, delay: 0.01 });
  }

  gun(key: string, x: number, z: number) {
    const rate = /shotgun/.test(key) ? 0.78 : /rifle/.test(key) ? 0.9 : 1;
    this.play('gun_pistol', x, z, { vol: 1, rate, send: 1 });
    const d = Math.hypot(x - this.L.x, z - this.L.z);
    if (d < 7) this.deafen(clamp(1 - d / 7, 0.3, 1));
  }

  hurt(p: Player) {
    const pitch = (p.app as any)?.voice ?? ((p.app as any)?.sex === 'f' ? 1.25 : 1);
    if (p.isLocal) this.flat('hurt_player', 'voice', 0.7, pitch * (0.96 + Math.random() * 0.08));
    else this.play('hurt_player', p.x, p.z, { zone: p.zoneKey, rate: pitch });
  }

  /** a few notes from a piano somewhere (someone is playing it) */
  piano(x: number, z: number) {
    const scale = [0, 2, 4, 7, 9];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.pianoDeg = clamp(this.pianoDeg + pick([-2, -1, -1, 1, 1, 2, 0]), 0, 14);
      const midi = 55 + Math.floor(this.pianoDeg / 5) * 12 + scale[this.pianoDeg % 5];
      this.play('piano', x, z, { vol: 0.7, delay: i * rr(0.22, 0.4), variant: midi, range: 40 });
    }
  }

  /** SEER-9 radio page: strength < 0 turns the radio off */
  radioStatic(strength: number, sig: any, freq: number) {
    this.radio.t = this.t;
    if (strength < 0) { this.radio.on = false; return; }
    this.radio.on = true; this.radio.strength = strength; this.radio.sig = sig; this.radio.freq = freq;
  }

  /** where remote voice chat is mixed in (the voice bus) */
  voiceInput(): AudioNode | null { return this.ctx ? this.buses.voice : null; }

  /**
   * A mimic creature calls out. With friends connected it throws back a
   * snippet of something one of them actually said; alone, it uses a
   * synthesised voice saying something that sounds like your name.
   */
  mimic(c: any) {
    const ctx = this.ctx;
    if (!ctx || !this.ready || c.zoneKey !== this.L.zone) return;
    const clip = G.net?.voice?.randomClip?.() as AudioBuffer | null;
    if (!clip) { this.creature('mimic_call', c); return; }
    const sp = this.spatial(c.x, c.z, 34, false);
    if (!sp) return;
    const src = ctx.createBufferSource(); src.buffer = clip; src.playbackRate.value = 0.94 + Math.random() * 0.08;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(sp.cutoff, 5200);
    const g = ctx.createGain(); g.gain.value = 1.1 * sp.gain;
    const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
    const send = ctx.createGain(); send.gain.value = sp.send + 0.2;
    src.connect(f); f.connect(pan); pan.connect(g); g.connect(this.buses.voice); g.connect(send); send.connect(this.reverbIn);
    src.start();
    src.onended = () => { src.disconnect(); f.disconnect(); pan.disconnect(); g.disconnect(); send.disconnect(); };
  }

  /** ringing ears and muffled world after a close gunshot or blast */
  deafen(amount: number) { this.deaf = Math.max(this.deaf, amount); }

  // ---------------------------------------------------------------- event wiring
  private hook() {
    bus.on('footstep', (p: Player) => this.footstep(p));
    bus.on('sound', (key: string, x: number, z: number, vol?: number) => this.at(key, x, z, vol ?? 1));
    bus.on('enterZone', (_z: Zone, p: Player) => { if (p?.isLocal) this.profileKey = ''; });
    bus.on('travelStart', (p: Player) => { if (p?.isLocal) this.duck(0.15, 0.6); });
    bus.on('travelEnd', (p: Player) => { if (p?.isLocal) this.duck(1, 1.2); });
    bus.on('circuit', (z: Zone, c: number, on: boolean) => this.onCircuit(z, c, on));
    bus.on('creatureSeen', (c: any) => {
      const sp = c?.sp;
      if (!sp || this.t - this.stingT < 75) return;
      if (sp.temperament === 'hostile' || sp.temperament === 'stalker' || (sp.threat ?? 0) >= 3) { this.stingT = this.t; this.flat('sting_low', 'music', 0.5); }
    });
    bus.on('death', (p: Player) => {
      if (!p?.isLocal || !this.ctx) return;
      this.dead = true;
      this.flat('death_tone', 'music', 0.7);
      this.muffle.frequency.setTargetAtTime(350, this.ctx.currentTime, 1.2);
    });
    bus.on('sleepStart', (p: Player) => { if (p?.isLocal) { this.sleepDuck = true; this.duck(0.2, 2); } });
    bus.on('sleepEnd', (p: Player) => { if (p?.isLocal) { this.sleepDuck = false; this.duck(1, 1.5); this.flat('wake_gasp', 'voice', 0.35); } });
    bus.on('loop', (p: Player) => { if (p?.isLocal) this.flat('deja', 'sfx', 0.35); });
  }
  private duck(level: number, secs: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const b of ['sfx', 'amb', 'music'] as BusName[]) this.buses[b].gain.setTargetAtTime((this.vol as any)[b] * level, now, secs / 3);
  }

  private footstep(p: Player) {
    const z = G.getZone(p.zoneKey);
    const f = z?.floorAt(p.tileX(), p.tileY());
    let key = 'step_' + (f?.sound || 'concrete');
    if (key === 'step_carpet' && p.body.wetness > 60) key = 'step_wetcarpet';
    const stance = p.sneaking ? 0.22 : p.running ? 0.95 : 0.55;
    const shoes = p.worn?.get?.('shoes') || p.worn?.get?.('feet') ? 1 : 0.6;
    if (p.isLocal) this.play(key, p.x, p.z, { vol: stance * shoes * 0.8, zone: p.zoneKey, flat: true, send: 0.6 });
    else this.play(key, p.x, p.z, { vol: stance * shoes, zone: p.zoneKey });
  }

  private onCircuit(z: Zone, c: number, on: boolean) {
    if (!this.ready || z?.key !== this.L.zone) return;
    // is the switched circuit near us? use its nearest light as the source
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const l of z.lights) if (l.circuit === c) { const d = Math.hypot(l.x - this.L.x, l.z - this.L.z); if (d < bd) { bd = d; best = l; } }
    if (best && bd < 40) this.play(on ? 'power_on' : 'power_off', best.x, best.z, { vol: 0.9, range: 60 });
    else this.flat(on ? 'power_on' : 'power_off', 'amb', 0.18);
  }

  // ---------------------------------------------------------------- per-frame
  update(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.t += dt;
    const p = G.local;
    if (!p) return;
    const yaw = G.pr?.yaw ?? Math.PI / 4;
    this.L.x = p.x; this.L.z = p.z; this.L.rtX = Math.cos(yaw); this.L.rtZ = -Math.sin(yaw);
    if (this.L.zone !== p.zoneKey) { this.L.zone = p.zoneKey; this.L.zoneRef = G.getZone(p.zoneKey); this.profileKey = ''; }
    if (!this.ready) return;
    if (this.recent.size > 400) this.recent.clear();
    const z = this.L.zoneRef!;
    if (!this.profileKey) this.applyProfile(z);
    this.updateBeds(z, dt);
    this.updateEvents(z);
    this.updateObjectHums(z, dt);
    this.updateCreatures(dt);
    this.updateRepeaters();
    this.updateBody(p, dt);
    this.updateRadio();
    this.updateMusic(z);
    this.updateDeafness(dt);
  }

  private applyProfile(z: Zone) {
    const key = AMB[z.env.ambience] ? z.env.ambience : (AMB[z.env.grade] ? z.env.grade : 'hum');
    this.profileKey = key;
    this.profile = AMB[key];
    this.setReverb(REVERB[z.env.reverb] ? z.env.reverb : this.profile.reverb);
    const want = new Set(this.profile.beds.map((b) => b.key));
    for (const [k, lv] of this.beds) if (!want.has(k)) { this.stopLoop(lv, 2); this.beds.delete(k); }
    for (const [, lv] of this.objLoops) this.stopLoop(lv, 0.5);
    this.objLoops.clear();
    for (const [, lv] of this.creatureLoops) this.stopLoop(lv, 0.5);
    this.creatureLoops.clear();
    this.nextEvent = this.profile.events.map((e) => this.t + rr(e.every[0] * 0.4, e.every[1]));
    this.style = '';
  }

  private bedActive(b: Bed) {
    if (b.when === 'day') return !G.clock.isNight();
    if (b.when === 'night') return G.clock.isNight();
    return true;
  }

  private updateBeds(z: Zone, dt: number) {
    // fluorescent hum follows the lit tubes around you; flickering tubes tick
    this.lightScanT -= dt;
    if (this.lightScanT <= 0 && G.view?.lg) {
      this.lightScanT = 0.25;
      let w = 0;
      const R = 7;
      const lights = G.view.lg.lightsIn(this.L.x - R, this.L.z - R, this.L.x + R, this.L.z + R);
      let flick: { x: number; z: number } | null = null;
      for (const l of lights) {
        if (l.kind !== 'fluoro' || l.broken) continue;
        const lvl = l.level ?? (l.on && z.circuitPowered(l.circuit) ? 1 : 0);
        if (lvl <= 0.01) continue;
        const d = Math.hypot(l.x - this.L.x, l.z - this.L.z);
        w += lvl * Math.max(0, 1 - d / R);
        if (l.flicker > 0 && lvl < 0.9 && d < 6) flick = l;
      }
      this.lightHum = clamp(w * 0.45, 0, 1);
      this.flickerT -= 0.25;
      if (flick && this.flickerT <= 0) { this.flickerT = rr(0.15, 0.6); this.play('fluoro_tick', flick.x, flick.z, { vol: 0.5 }); }
    }
    const lit = this.lightHum;
    const collapse = G.missions?.collapse ?? 0;
    for (const b of this.profile.beds) {
      let lv = this.beds.get(b.key);
      const on = this.bedActive(b);
      let vol = on ? b.vol : 0;
      if (b.when === 'lit') vol *= lit;
      if (!lv && vol > 0.001) { lv = this.startLoop(b.key, 'amb', vol, { lp: b.lp, rate: b.rate, fadeIn: 1.5 }) || undefined; if (lv) this.beds.set(b.key, lv); }
      else if (lv) {
        lv.gain.gain.setTargetAtTime(vol, this.ctx!.currentTime, 0.4);
        // the simulation wobbling: beds drift out of tune as it collapses
        if (collapse > 0.2) lv.src.playbackRate.setTargetAtTime((b.rate ?? 1) * (1 + Math.sin(this.t * 0.37 + b.vol * 9) * collapse * 0.04), this.ctx!.currentTime, 0.5);
      }
    }
    // weather
    const raining = z.env.weather === 'rain';
    if (raining && !this.rain) this.rain = this.startLoop('rain', 'amb', 0.0, { lp: 900, fadeIn: 2 });
    if (!raining && this.rain) { this.stopLoop(this.rain, 3); this.rain = null; }
    if (this.rain) {
      const f = z.floorAt(Math.floor(this.L.x), Math.floor(this.L.z));
      const outside = !!f?.outdoor && z.roomAt(Math.floor(this.L.x), Math.floor(this.L.z)).id === 0;
      const now = this.ctx!.currentTime;
      this.rain.gain.gain.setTargetAtTime(outside ? 0.45 : 0.22, now, 0.6);
      this.rain.filter.frequency.setTargetAtTime(outside ? 9000 : 700, now, 0.6);
    }
  }

  private updateEvents(z: Zone) {
    const night = G.clock.isNight();
    this.profile.events.forEach((e, i) => {
      if (this.t < (this.nextEvent[i] ?? 0)) return;
      this.nextEvent[i] = this.t + rr(e.every[0], e.every[1]);
      if (e.when === 'day' && night) return;
      if (e.when === 'night' && !night) return;
      const a = Math.random() * Math.PI * 2, d = rr(e.dist[0], e.dist[1]);
      const x = clamp(this.L.x + Math.cos(a) * d, 1, z.W - 1), zz = clamp(this.L.z + Math.sin(a) * d, 1, z.H - 1);
      this.play(pick(e.keys), x, zz, { vol: e.vol, range: e.dist[1] + 15 });
    });
  }

  private updateObjectHums(z: Zone, dt: number) {
    this.objScanT -= dt;
    if (this.objScanT > 0) return;
    this.objScanT = 0.4;
    const R = 10;
    const cx = Math.floor(this.L.x), cy = Math.floor(this.L.z);
    const found: { o: any; key: string; d: number; vol: number }[] = [];
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!z.inb(x, y)) continue;
      for (const o of z.objectsAt(x, y)) {
        if (o.x !== x || o.y !== y) continue; // multi-tile objects: anchor tile only
        const d = objDef(o.key);
        let hum = d?.hum;
        if (o.state?.lit || o.state?.burning) hum = 'fire';
        if (!hum || !HUM_LOOP[hum]) continue;
        if (hum !== 'fire') {
          if (o.state?.on === false || o.state?.broken) continue;
          const powered = G.interact?.objPowered ? G.interact.objPowered(o) : z.circuitPowered(z.roomAt(o.x, o.y).circuit);
          if (!powered) continue;
        }
        found.push({ o, key: HUM_LOOP[hum], d: Math.hypot(o.x + 0.5 - this.L.x, o.y + 0.5 - this.L.z), vol: HUM_VOL[hum] ?? 0.3 });
      }
    }
    found.sort((a, b) => a.d - b.d);
    const keep = new Set<number>();
    for (const f of found.slice(0, 6)) {
      keep.add(f.o.uid);
      let lv = this.objLoops.get(f.o.uid);
      if (!lv) { lv = this.startLoop(f.key, 'amb', 0, { spatial: true, fadeIn: 0.8 }) || undefined; if (!lv) continue; this.objLoops.set(f.o.uid, lv); }
      this.placeLoop(lv, f.o.x + 0.5, f.o.y + 0.5, f.vol, R + 2);
    }
    for (const [uid, lv] of this.objLoops) if (!keep.has(uid)) { this.stopLoop(lv, 0.8); this.objLoops.delete(uid); }
  }

  private updateCreatures(dt: number) {
    const list: any[] = G.creatures?.list?.() || [];
    const alive = new Set<string>();
    for (const c of list) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - this.L.x, c.z - this.L.z);
      const sounds = c.sp?.sounds || {};
      // footsteps: one per stride while moving (silent movers excluded)
      if (sounds.step && d < 18 && !c.sp.flags?.ghost && !c.sp.flags?.weepingAngel) {
        let st = this.creatureSteps.get(c.id);
        if (!st) { st = { x: c.x, z: c.z, acc: 0 }; this.creatureSteps.set(c.id, st); }
        st.acc += Math.hypot(c.x - st.x, c.z - st.z); st.x = c.x; st.z = c.z;
        const stride = 0.45 + (c.sp.height ?? 1) * 0.35;
        if (st.acc > stride) { st.acc = 0; this.play(sounds.step, c.x, c.z, { zone: c.zoneKey, vol: c.speed > 3 ? 0.8 : 0.45 }); }
      }
      // continuous creature sounds (wing flutter, hums)
      if (sounds.loop && d < 26) {
        alive.add(c.id);
        let lv = this.creatureLoops.get(c.id);
        if (!lv) { lv = this.startLoop(sounds.loop, 'sfx', 0, { spatial: true, fadeIn: 0.5 }) || undefined; if (lv) this.creatureLoops.set(c.id, lv); }
        if (lv) this.placeLoop(lv, c.x, c.z, 0.6, 26);
      }
    }
    for (const [id, lv] of this.creatureLoops) if (!alive.has(id)) { this.stopLoop(lv, 0.6); this.creatureLoops.delete(id); }
    if (this.creatureSteps.size > 64) this.creatureSteps.clear();
    void dt;
  }

  private updateRepeaters() {
    for (const r of this.repeaters) {
      if (this.t < r.next) continue;
      const iv = REPEAT[r.key] || [0.9, 1.2];
      r.next = this.t + rr(iv[0], iv[1]);
      const key = r.key === 'craft' && Math.random() < 0.3 ? 'rummage' : r.key;
      this.play(key, r.p.x, r.p.z, { zone: r.p.zoneKey, vol: 0.8 });
    }
  }

  private updateBody(p: Player, dt: number) {
    if (this.dead || p.body.dead) return;
    const b = p.body;
    const now = this.ctx!.currentTime;
    // heartbeat: panic, blood loss, low health
    const fear = clamp((b.panic - 30) / 70, 0, 1);
    const weak = clamp((70 - b.blood) / 50, 0, 1) + clamp((40 - b.health) / 40, 0, 1) * 0.6;
    const hb = Math.max(fear, weak);
    if (hb > 0.05 && this.t >= this.heartNext) {
      const bpm = 70 + b.panic * 0.85 + (100 - b.blood) * 0.5;
      this.heartNext = this.t + 60 / clamp(bpm, 50, 170);
      this.flat('heartbeat', 'voice', 0.15 + hb * 0.55, 1, now, 0);
    }
    // breathing: exhaustion and sprinting
    const winded = clamp((0.55 - b.endurance) / 0.55, 0, 1) + (p.running ? 0.25 : 0) + fear * 0.3;
    if (winded > 0.15 && this.t >= this.breathNext) {
      this.breathNext = this.t + 1.6 - winded * 0.7 + Math.random() * 0.2;
      this.flat('breath', 'voice', 0.08 + winded * 0.3, 0.9 + winded * 0.25);
    }
    if (b.hunger > 45 && this.t >= this.stomachNext) { this.stomachNext = this.t + rr(60, 140); this.flat('stomach', 'voice', 0.2 + (b.hunger - 45) / 140); }
    else if (this.t >= this.stomachNext) this.stomachNext = this.t + 30;
    if (b.sickness > 35 && this.t >= this.coughNext) { this.coughNext = this.t + rr(22, 60) * (1.5 - b.sickness / 100); this.play('cough', p.x, p.z, { flat: true, vol: 0.6 }); bus.emit('noise', { x: p.x, z: p.z, radius: 9, kind: 'cough', zone: p.zoneKey, by: p.id }); }
    else if (this.t >= this.coughNext) this.coughNext = this.t + 20;
    if (b.temp < 35.6 && this.t >= this.teethNext) { this.teethNext = this.t + rr(5, 10); this.flat('teeth', 'voice', 0.25); }
    // low lucidity: whispers from just behind you that are not there
    if (b.lucidity < 45 && this.t >= this.whisperNext) {
      this.whisperNext = this.t + rr(25, 70) * (0.4 + b.lucidity / 60);
      const a = Math.random() * Math.PI * 2;
      this.play('whisper', p.x + Math.cos(a) * 2.5, p.z + Math.sin(a) * 2.5, { flat: false, vol: 0.4 + (45 - b.lucidity) / 90, range: 9 });
    }
    // muffled world while asleep or unconscious
    const target = this.sleepDuck ? 900 : 20000 - this.deaf * 18500;
    this.muffle.frequency.setTargetAtTime(Math.max(300, target), now, 0.3);
    void dt;
  }

  private updateRadio() {
    const r = this.radio;
    const active = r.on && this.t - r.t < 0.35;
    if (active) {
      if (!this.radioNoise) this.radioNoise = this.startLoop('static', 'radio', 0, { fadeIn: 0.1 });
      const st = this.radioNoise;
      const now = this.ctx!.currentTime;
      if (st) {
        st.gain.gain.setTargetAtTime(0.05 + 0.2 * (1 - r.strength * 0.85) * (0.85 + Math.random() * 0.3), now, 0.05);
        st.src.playbackRate.setTargetAtTime(0.85 + ((r.freq * 7.31) % 1) * 0.3, now, 0.08);
      }
      const sigKey = r.sig ? (r.sig.text ? 'numbers' : 'beacon') : '';
      const v = r.sig ? (hashStr(r.sig.id || r.sig.name || '') % 3) : 0;
      const want = sigKey ? sigKey + ':' + v : '';
      if (want !== this.radioSigKey) { this.stopLoop(this.radioSig, 0.2); this.radioSig = null; this.radioSigKey = want; if (sigKey) this.radioSig = this.startLoop(sigKey, 'radio', 0, { fadeIn: 0.1, variant: v }); }
      if (this.radioSig) this.radioSig.gain.gain.setTargetAtTime(Math.pow(r.strength, 1.4) * 0.5, now, 0.08);
    } else if (this.radioNoise || this.radioSig) {
      this.stopLoop(this.radioNoise, 0.15); this.stopLoop(this.radioSig, 0.15);
      this.radioNoise = null; this.radioSig = null; this.radioSigKey = '';
    }
    // the scanner's CRT whines faintly while it is up
    const open = !!G.local?.scannerOpen;
    if (open && !this.crt) this.crt = this.startLoop('crt', 'ui', 0.06, { fadeIn: 0.3 });
    if (!open && this.crt) { this.stopLoop(this.crt, 0.3); this.crt = null; }
  }

  private updateDeafness(dt: number) {
    if (this.deaf > 0) {
      if (!this.tinnitus) this.tinnitus = this.startLoop('tinnitus', 'ui', 0, { fadeIn: 0.05 });
      this.tinnitus?.gain.gain.setTargetAtTime(this.deaf * 0.18, this.ctx!.currentTime, 0.1);
      this.deaf = Math.max(0, this.deaf - dt / 7);
    } else if (this.tinnitus) { this.stopLoop(this.tinnitus, 1.5); this.tinnitus = null; }
  }

  // ---------------------------------------------------------------- generative music
  private updateMusic(z: Zone) {
    const ctx = this.ctx!;
    const style = this.dead ? '' : (z.env.music || this.profile.music);
    const now = ctx.currentTime;
    if (style !== this.style) {
      this.style = style;
      this.musicNext = now + 2;
      this.musicRestUntil = this.t + (style === 'muzak' ? 1 : rr(15, 45));
      this.mb.left = 0;
      this.musicFilter.frequency.setTargetAtTime(style === 'muzak' ? 2600 : 20000, now, 0.5);
    }
    if (!style || this.t < this.musicRestUntil) return;
    // music hides when things get dangerous; tension belongs to the world sounds
    const panic = G.local?.body.panic ?? 0;
    const calm = clamp(1 - panic / 60, 0.15, 1);
    if (this.musicNext < now) this.musicNext = now + 0.05;
    while (this.musicNext < now + 0.25) {
      const when = this.musicNext;
      switch (style) {
        case 'musicbox': case 'broken': this.stepMusicBox(when, style === 'broken', calm); break;
        case 'muzak': this.stepMuzak(when, calm); break;
        case 'pads': case 'drone': this.stepPads(when, style, calm); break;
        case 'choir': this.stepChoir(when, calm); break;
        default: this.musicNext = now + 10;
      }
      if (this.t < this.musicRestUntil) break;
    }
  }

  private stepMusicBox(when: number, broken: boolean, calm: number) {
    const scale = [0, 2, 4, 7, 9];
    if (this.mb.left <= 0) { this.mb.left = 10 + Math.floor(Math.random() * 10); this.mb.deg = 5 + Math.floor(Math.random() * 5); }
    this.mb.deg = clamp(this.mb.deg + pick([-2, -1, -1, 0, 1, 1, 2]), 0, 12);
    let midi = 72 + Math.floor(this.mb.deg / 5) * 12 + scale[this.mb.deg % 5];
    const wrong = broken ? 0.25 : 0.04 + (G.missions?.collapse ?? 0) * 0.2;
    if (Math.random() < wrong) midi += pick([-1, 1]);
    const rate = broken ? 1 + (Math.random() - 0.5) * 0.04 : 1;
    this.flat('mbox', 'music', 0.32 * calm, rate, when, midi);
    if (this.mb.left % 4 === 0) this.flat('mbox', 'music', 0.18 * calm, rate, when, midi - 24);
    this.mb.left--;
    // the mechanism winds down near the end of a phrase
    const beat = broken ? 0.42 + (12 - Math.min(12, this.mb.left)) * 0.03 : 0.42;
    this.musicNext = when + beat * (Math.random() < 0.2 ? 2 : 1);
    if (this.mb.left <= 0) this.musicRestUntil = this.t + rr(30, 80);
  }

  private stepMuzak(when: number, calm: number) {
    // Fmaj7 - Dm7 - Gm7 - C7, two bars each, soft electric piano from ceiling speakers
    const chords = [[53, 57, 60, 64], [50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 58]];
    const beat = this.muzakBeat++;
    const bar = Math.floor(beat / 4), ch = chords[Math.floor(bar / 2) % 4], b4 = beat % 4;
    const wob = 1 + Math.sin(this.t * 0.6) * 0.004; // worn tape
    const v = 0.16 * calm;
    if (b4 === 0) { for (const n of ch) this.flat('epiano', 'music', v, wob, when, n + 12); this.flat('bass_soft', 'music', v * 1.4, wob, when, ch[0] - 12); }
    if (b4 === 2) { this.flat('bass_soft', 'music', v * 1.1, wob, when, ch[2] - 12); if (Math.random() < 0.6) for (const n of ch.slice(1)) this.flat('epiano', 'music', v * 0.6, wob, when + 0.35, n + 12); }
    if (Math.random() < 0.45) this.flat('epiano', 'music', v * 0.9, wob, when + (Math.random() < 0.5 ? 0.35 : 0), pick(ch) + 24);
    this.musicNext = when + 60 / 76;
    if (beat > 0 && beat % 64 === 0) { this.musicRestUntil = this.t + rr(8, 20); this.flat('pa_chime', 'amb', 0.12, 1, when + 2); }
  }

  private stepPads(when: number, style: string, calm: number) {
    // sparse cues: a few slow chords, then a long silence
    const roots = style === 'pads' ? [45, 48, 50, 53] : [36, 38, 41, 43];
    const r = pick(roots);
    const voicing = style === 'pads' ? [0, 7, 14, 16] : [0, 7, 10, 15];
    for (const n of voicing) this.flat('synpad', 'music', 0.11 * calm, 1, when, r + 12 + n);
    if (style === 'drone') this.flat('drone_bed', 'music', 0.08 * calm, 1, when);
    this.mb.left = (this.mb.left || 3) - 1;
    this.musicNext = when + rr(4, 6);
    if (this.mb.left <= 0) { this.mb.left = 2 + Math.floor(Math.random() * 3); this.musicRestUntil = this.t + rr(60, 140); }
  }

  private stepChoir(when: number, calm: number) {
    const chord = pick([[60, 64, 67], [57, 60, 64], [65, 69, 72], [62, 65, 69]]);
    for (const n of chord) this.flat('choir', 'music', 0.12 * calm, 1, when, n);
    this.musicNext = when + 4.5;
  }
}

function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
