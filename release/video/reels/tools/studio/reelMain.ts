import * as THREE from 'three';
import { makeStudio } from './reelStudio';
import { REELS, intro, cardShot, endcardShot, type ShotCtx, type Shot } from './reelShots';
import { beatShot, findStage, type Spec, type Stage } from './reelSpec';
import { img } from './paperCard';
import { filmLights } from './reelActors';

const q = new URLSearchParams(location.search);
const S = makeStudio(q.get('zone') || 'ledge', Number(q.get('seed') || 1337));
const lights = filmLights(S);
S.pr.qualityOverride = (q.get('q') as never) || 'low';
S.pr.setQuality(S.pr.qualityOverride as never);
// capture at the canvas' own resolution (the encoder scales 2x to 1080 x 1920)
S.pr.pixelFilter = Number(q.get('pf') ?? 0);
// the picture at the canvas' own resolution (no preset cap)
(S.pr as any).pickScale = () => 1;
S.pr.resize();

// shots from a reel.json (tools/make.mjs puts it on window.__spec): beats on a stage found in this zone,
// or the shared intro / card hand-over / recruiting screen
const spec = (window as unknown as { __spec?: Spec }).__spec;
let stage: Stage | null = null;
function specShot(id: string): Shot | undefined {
  if (id === 'intro' || id === 'card' || id === 'endcard') return id === 'intro' ? intro('intro') : id === 'card' ? cardShot('card') : endcardShot();
  const b = spec?.shots?.[id];
  if (!b) return undefined;
  if (!stage) {
    const f = findStage(S, spec?.stage?.find ?? 'open');
    stage = { ...f, ...(spec?.stage ?? {}) } as Stage;
    if (spec?.stage?.x !== undefined) stage.y = S.ground(stage.x, stage.z);
    (window as any).__stage = stage;
  }
  return { id, setup: beatShot(b, stage) as unknown as Shot['setup'] };
}

let ctx: ShotCtx | null = null;
let upd: ((u: number, dt: number) => void) | null = null;
let u = 0;

function teardown() {
  if (!ctx) return;
  for (const a of ctx.actors) { a.root.removeFromParent(); a.dispose?.(); }
  for (const o of ctx.extra) o.removeFromParent();
  lights.key.intensity = 0; lights.fill.intensity = 0;
  ctx = null; upd = null;
}

S.hooks.push((_t, dt) => {
  if (!ctx || !upd) return;
  upd(u, dt);
  for (const a of ctx.actors) a.tick(u, dt);
});

(window as any).THREE = THREE;
(window as any).__reel = {
  shots: (name: string) => REELS[name]?.map((s) => s.id) ?? Object.keys(spec?.shots ?? {}),
  stage: () => stage,
  begin(name: string, id: string, dur: number, preroll = 0.6) {
    teardown();
    const shot = REELS[name]?.find((s) => s.id === id) ?? specShot(id);
    if (!shot) throw new Error('no shot ' + id);
    ctx = { S, actors: [], lights, extra: [] };
    lights.fill.color.setHex(0xc8e4ff); lights.key.distance = 9; lights.fill.distance = 9;
    upd = shot.setup(ctx, dur);
    // settle springs and hair before the first frame
    u = 0;
    for (let i = 0; i < Math.round(preroll * 30); i++) S.frame(1 / 30, false);
    u = 0;
    return true;
  },
  /** advance one frame (and grab it); `at` jumps (simulating in between) to a shot time for stills */
  step(dt: number, grab = true, at?: number) {
    if (at !== undefined) {
      const d = at - u;
      if (d > 0) { const n = Math.max(1, Math.ceil(d * 30)); for (let i = 0; i < n - 1; i++) { u += d / n; S.frame(d / n, false); } u += d / n; }
      S.frame(1 / 30, true);
    } else { u += dt; S.frame(dt, true); }
    return grab ? S.grab(0.93) : '';
  },
};
void Promise.all([document.fonts.load('40px Alagard'), document.fonts.load('600 30px "IBM Plex Mono"'),
  ...['/brand/emblem-256.png', '/brand/lockup-stacked@4x.png', '/brand/lockup-horizontal@4x.png'].map((s) => img(s).decode().catch(() => {}))]).then(() => { (window as any).__ready = true; });
