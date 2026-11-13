// The emotes' props and effects in a running game: every survivor in the viewed
// level gets a driver (src/social/emotes/props.ts) fed the emote it is playing:
// the local unit from its animator, co-op peers from the emote mirrored in their
// snapshot. Particles live in the zone's scene; sounds are positional; bursts
// borrow a point light for a moment.
import * as THREE from 'three';
import { G } from '../../game/G';
import type { GameSystem } from '../../game/game';
import type { Player } from '../../entities/player';
import { EmoteParticles, type FxHost } from './fx';
import { EmoteRigFx } from './props';

interface Peer { d: EmoteRigFx; name: string; t: number }

export class EmoteFxSystem implements GameSystem {
  name = 'emoteFx';
  private parts = new EmoteParticles(900);
  private peers = new Map<string, Peer>();
  private flashes: { at: THREE.Vector3; col: number; i: number; t: number; d: number }[] = [];
  private host: FxHost = {
    parts: this.parts,
    sound: (k, v, at, rate) => { try { G.audio?.play?.(k, at.x, at.z, { vol: v, rate: rate ?? 1 }); } catch { /* audio off */ } },
    flash: (at, col, i, secs) => { this.flashes.push({ at: at.clone(), col, i, t: secs, d: secs }); },
  };

  update(dt: number) {
    const g = G as unknown as { pr?: { scene: THREE.Scene }; local?: Player; players: Map<string, Player>; pointLight?: (x: number, y: number, z: number, c: number, i: number, d?: number) => void };
    if (!g.pr || !g.local) return;
    if (this.parts.root.parent !== g.pr.scene) g.pr.scene.add(this.parts.root);
    const here = g.local.zoneKey;
    const seen = new Set<string>();
    for (const p of g.players.values()) {
      if (p.zoneKey !== here || !p.rig) continue;
      seen.add(p.id);
      let e: { name: string; t: number } | null = null;
      if (!p.remote) e = p.anim?.emoteState ?? null;
      else {
        const st = p.remote.state as { ac?: string; at?: number } | undefined;
        if (st?.ac && st.ac.startsWith('emote:')) e = { name: st.ac.slice(6), t: st.at ?? 0 };
      }
      let peer = this.peers.get(p.id);
      if (!peer || peer.d.rig !== p.rig) { peer?.d.dispose(); peer = { d: new EmoteRigFx(p.rig, this.host, { floorY: () => p.y ?? 0 }), name: '', t: 0 }; this.peers.set(p.id, peer); }
      // a peer's emote clock runs on between snapshots (and resyncs when it drifts)
      if (e) {
        if (p.remote) { if (peer.name !== e.name || Math.abs(peer.t - e.t) > 0.6) peer.t = e.t; else peer.t += dt; peer.name = e.name; e = { name: e.name, t: peer.t }; }
        peer.d.update(e.name, e.t, dt);
      } else { peer.name = ''; peer.d.update(null, 0, dt); }
    }
    for (const [id, peer] of this.peers) if (!seen.has(id)) { peer.d.dispose(); this.peers.delete(id); }
    this.parts.update(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      if (f.t <= 0) { this.flashes.splice(i, 1); continue; }
      g.pointLight?.(f.at.x, f.at.y, f.at.z, f.col, f.i * (f.t / f.d), 9);
    }
  }
  onZoneChange() { this.parts.clear(); for (const p of this.peers.values()) p.d.dispose(); this.peers.clear(); }
}
