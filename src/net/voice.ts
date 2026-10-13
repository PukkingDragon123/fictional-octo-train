// Proximity voice chat over WebRTC (mesh between peers, signalled through the
// relay). Voices are spatialised like any other sound: louder when close,
// muffled through walls, gone in other zones. A walkie-talkie on the same
// channel carries a voice anywhere, band-limited with a squelch of static.
// The last few seconds each friend said are kept so mimic creatures can
// throw their voices back at you.
import { G } from '../game/G';
import { clamp } from '../core/math';
import { wallsBetween } from '../world/collision';
import { itemDef } from '../items/item';
import type { Player } from '../entities/player';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const CLIP_SECS = 10;

interface PeerVoice {
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  el?: HTMLAudioElement;
  src?: MediaStreamAudioSourceNode;
  dry?: GainNode; pan?: StereoPannerNode; lp?: BiquadFilterNode;
  radio?: GainNode; radioBp?: BiquadFilterNode;
  rec?: ScriptProcessorNode;
  ring: Float32Array; ringPos: number; ringFill: number;
  wasRadio: boolean;
  makingOffer: boolean;
}

export class Voice {
  peers = new Map<string, PeerVoice>();
  mic: MediaStream | null = null;
  micError = '';
  /** what the local player is doing: 0 silent, 1 talking, 2 talking into a walkie */
  mode: 0 | 1 | 2 = 0;
  channel = 1;
  private shaper: WaveShaperNode | null = null;
  constructor(private send: (to: string, d: any) => void, private selfId: () => string) {}

  get ctx() { return G.audio?.ctx as AudioContext | null; }

  async enableMic(): Promise<boolean> {
    if (this.mic) return true;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const t = this.mic.getAudioTracks()[0];
      t.enabled = false;
      for (const pv of this.peers.values()) await pv.sender?.replaceTrack(t);
      return true;
    } catch (e: any) { this.micError = e?.message || 'microphone unavailable'; return false; }
  }

  setTalking(mode: 0 | 1 | 2) {
    this.mode = mode;
    const t = this.mic?.getAudioTracks()[0];
    if (t) t.enabled = mode > 0;
  }

  /** ensure a connection to a peer exists; the lower id makes the offer */
  ensure(id: string) {
    if (this.peers.has(id) || id === this.selfId()) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const pv: PeerVoice = { pc, sender: tr.sender, ring: new Float32Array(CLIP_SECS * 48000), ringPos: 0, ringFill: 0, wasRadio: false, makingOffer: false };
    this.peers.set(id, pv);
    const t = this.mic?.getAudioTracks()[0];
    if (t) tr.sender.replaceTrack(t);
    pc.onicecandidate = (e) => { if (e.candidate) this.send(id, { k: 'rtc', ice: e.candidate.toJSON() }); };
    pc.ontrack = (e) => this.attach(id, pv, e.streams[0] || new MediaStream([e.track]));
    pc.onnegotiationneeded = async () => {
      if (this.selfId() > id) return;
      try { pv.makingOffer = true; await pc.setLocalDescription(); this.send(id, { k: 'rtc', sdp: pc.localDescription }); }
      catch { /* retried on next negotiation */ } finally { pv.makingOffer = false; }
    };
  }

  async onSignal(from: string, d: any) {
    this.ensure(from);
    const pv = this.peers.get(from)!;
    const pc = pv.pc;
    try {
      if (d.sdp) {
        const polite = this.selfId() > from;
        const collision = d.sdp.type === 'offer' && (pv.makingOffer || pc.signalingState !== 'stable');
        if (collision && !polite) return;
        await pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') { await pc.setLocalDescription(); this.send(from, { k: 'rtc', sdp: pc.localDescription }); }
      } else if (d.ice) await pc.addIceCandidate(d.ice).catch(() => {});
    } catch (e) { console.warn('rtc', e); }
  }

  drop(id: string) {
    const pv = this.peers.get(id); if (!pv) return;
    pv.pc.close(); pv.src?.disconnect(); pv.rec?.disconnect(); pv.el?.remove();
    this.peers.delete(id);
  }

  private attach(id: string, pv: PeerVoice, stream: MediaStream) {
    const ctx = this.ctx; if (!ctx) return;
    // Chrome only feeds remote WebRTC audio into WebAudio while an element plays it
    const el = document.createElement('audio'); el.srcObject = stream; el.muted = true; el.autoplay = true; el.style.display = 'none';
    document.body.appendChild(el); el.play().catch(() => {});
    pv.el = el;
    const src = ctx.createMediaStreamSource(stream);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000;
    const pan = ctx.createStereoPanner();
    const dry = ctx.createGain(); dry.gain.value = 0;
    src.connect(lp); lp.connect(pan); pan.connect(dry);
    const radioBp = ctx.createBiquadFilter(); radioBp.type = 'bandpass'; radioBp.frequency.value = 1500; radioBp.Q.value = 0.9;
    const radio = ctx.createGain(); radio.gain.value = 0;
    src.connect(radioBp); radioBp.connect(this.radioShaper(ctx)); this.shaper!.connect(radio);
    const out = G.audio?.voiceInput?.() as AudioNode | undefined;
    dry.connect(out || ctx.destination); radio.connect(out || ctx.destination);
    // capture what they say (for the mimics)
    const rec = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain(); sink.gain.value = 0;
    src.connect(rec); rec.connect(sink); sink.connect(ctx.destination);
    rec.onaudioprocess = (e) => {
      const st = (G.players.get(id) as any)?.remote?.state;
      if (!st?.vc) return;
      const inp = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < inp.length; i++) { pv.ring[pv.ringPos] = inp[i]; pv.ringPos = (pv.ringPos + 1) % pv.ring.length; }
      pv.ringFill = Math.min(pv.ring.length, pv.ringFill + inp.length);
    };
    Object.assign(pv, { src, lp, pan, dry, radio, radioBp, rec });
  }
  private radioShaper(ctx: AudioContext) {
    if (this.shaper) return this.shaper;
    const ws = ctx.createWaveShaper();
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 3.2) * 0.8; }
    ws.curve = c;
    this.shaper = ws;
    return ws;
  }

  /** does this player carry a switched-on two-way radio on channel ch? */
  static radioOn(p: Player, ch?: number): number {
    for (const it of p.allItems()) {
      const d = itemDef(it.key);
      if (!d.radio?.twoWay || !it.data?.on) continue;
      if ((it.uses ?? 1) <= 0.001 && d.battery) continue;
      if (ch === undefined || (it.data.ch ?? 1) === ch) return it.data.ch ?? 1;
    }
    return 0;
  }

  /** per frame: place every remote voice relative to the listener */
  update() {
    const ctx = this.ctx; const me = G.local;
    if (!ctx || !me) return;
    const z = G.zones.get(me.zoneKey);
    const yaw = G.pr?.yaw ?? Math.PI / 4;
    const rtX = Math.cos(yaw), rtZ = -Math.sin(yaw);
    const now = ctx.currentTime;
    for (const [id, pv] of this.peers) {
      if (!pv.dry) continue;
      const p = G.players.get(id) as any;
      const st = p?.remote?.state;
      let near = 0, cutoff = 18000, pan = 0, radio = 0;
      if (p && st?.vc && !st.dead) {
        if (p.zoneKey === me.zoneKey && z) {
          const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
          if (d < 28) {
            const walls = d > 1 ? wallsBetween(z, me.x, me.z, p.x, p.z, 4) : 0;
            near = clamp(1 - d / 28, 0, 1) ** 1.3 * Math.pow(0.4, walls);
            cutoff = walls ? 6000 / (1 + walls * 2.5) : 18000;
            pan = d < 1 ? 0 : clamp((dx * rtX + dz * rtZ) / Math.max(2, d), -1, 1) * 0.7;
          }
        }
        if (st.vc === 2 && st.ch && Voice.radioOn(me, st.ch)) radio = 0.9;
      }
      if (radio > 0 && !pv.wasRadio) G.audio?.ui?.('static_burst', 0.25);
      if (radio === 0 && pv.wasRadio) G.audio?.ui?.('static_burst', 0.18);
      pv.wasRadio = radio > 0;
      pv.dry.gain.setTargetAtTime(near * 1.4, now, 0.05);
      pv.radio!.gain.setTargetAtTime(radio, now, 0.05);
      pv.lp!.frequency.setTargetAtTime(cutoff, now, 0.08);
      pv.pan!.pan.setTargetAtTime(pan, now, 0.08);
    }
  }

  /** a recent snippet of a friend's voice (for mimics), or null */
  randomClip(): AudioBuffer | null {
    const ctx = this.ctx; if (!ctx) return null;
    const cands = [...this.peers.values()].filter((p) => p.ringFill > ctx.sampleRate * 1.2);
    if (!cands.length) return null;
    const pv = cands[Math.floor(Math.random() * cands.length)];
    const len = Math.floor(ctx.sampleRate * (1 + Math.random() * 1.2));
    // find a loud stretch in the ring
    const N = pv.ring.length, avail = Math.min(pv.ringFill, N);
    let bestStart = (pv.ringPos - len + N) % N, bestE = 0;
    for (let t = 0; t < 12; t++) {
      const back = len + Math.floor(Math.random() * Math.max(1, avail - len));
      const start = (pv.ringPos - back + N * 2) % N;
      let e = 0;
      for (let i = 0; i < len; i += 64) { const v = pv.ring[(start + i) % N]; e += v * v; }
      if (e > bestE) { bestE = e; bestStart = start; }
    }
    if (bestE < 0.05) return null;
    const ab = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = ab.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = pv.ring[(bestStart + i) % N] * Math.min(1, i / 800, (len - i) / 800);
    return ab;
  }
}
