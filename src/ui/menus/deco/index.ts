// Room decoration and the guide, wired into the main menu with one call:
//
//   import { installDecoAndGuide } from './deco';
//   installDecoAndGuide({ root: this.root });          // in TitleRoom's constructor
//
// It listens to the menu-room registry (menuRooms.ts): every room that
// registers gets its saved collectibles back (Furnisher), the guide follows
// the active room, and three pixel keys float in the top-right corner: the
// BLUEPRINT (build mode for the room on screen), the COMMISSARY (the
// collectibles shop) and the GUIDE (mute / call her back). The 2D parts hide
// while `root` has one of the classes lit / paneled / playing / diving.
//
// Exposed for the rooms and the coordinator:
//   onBuildMode(cb)       cb(roomId | null) when build mode starts / ends (a room may widen its shot)
//   body.deco-build / body.deco-shop  while those are up; elements marked [data-deco-hide] are hidden then
//   DecoApi.build() / .shop() / .dispose()
// Until a room registers, the dev title's subject room (window.__title.room) or
// opts.fallback (a SubjectRoom) stands in, so it works on the current menu too.
import * as THREE from 'three';
import { onMenuRoom, menuRooms, activeMenuRoom, onActiveMenuRoom, type MenuRoom, type MenuRoomId } from '../menuRooms';
import { sfx } from '../sfx';
import { Furnisher } from './furnish';
import { BuildMode } from './blueprint';
import { Shop } from './shop';
import { Preview } from './preview';
import { pixSheet, PIX_N } from './pixIcons';
import { hubIcon, type HubKind } from './hubModels';
import { guideHooks } from '../guide/tour';
import { GIFTS } from './catalog';
import { owned, addOwned, flag, setFlag } from './store';
import { Guide } from '../guide/guide';
import { bitReady } from '../../../gfx/bitfont';
import './deco.css';

export interface DecoApi { build(): void; shop(): void; dispose(): void; guide: Guide }

const buildSubs = new Set<(id: MenuRoomId | null) => void>();
export function onBuildMode(cb: (id: MenuRoomId | null) => void): () => void { buildSubs.add(cb); return () => buildSubs.delete(cb); }

let installed: DecoApi | null = null;


/** round 18: the corner keys jump straight to these (the title room passes them in) */
export interface HubJumps { codex?: () => void; tree?: () => void; tour?: () => void }
export function installDecoAndGuide(opts: { root?: HTMLElement; fallback?: unknown; jump?: HubJumps } = {}): DecoApi {
  if (installed) return installed;
  const root = opts.root ?? document.body;
  void bitReady();
  // ---- the layer and the keys
  const layer = document.createElement('div');
  layer.className = 'dk-ui';
  document.body.append(layer);
  const keys = document.createElement('div');
  keys.className = 'dk-keys-top';
  layer.append(keys);
  const icon = (sheet: string, label: string, aria: string, act: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dk-icon';
    b.setAttribute('aria-label', aria);
    b.dataset.sheet = sheet;
    b.dataset.k = label;
    const cap = document.createElement('span');
    cap.className = 'dk-icap';
    cap.textContent = label;
    b.append(cap);
    b.addEventListener('click', () => { act(); });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') sfx('tick', 0.35); });
    keys.append(b);
    return b;
  };
  let preview: Preview | null = null;
  const pv = () => (preview ??= new Preview());
  // ---- rooms
  const furn = new Map<MenuRoomId, Furnisher>();
  const hooked = new WeakSet<HTMLElement>();
  let fallbackRoom: MenuRoom | null = null;
  const addRoom = (r: MenuRoom) => {
    const old = furn.get(r.id);
    if (old && old.room === r) return;
    old?.dispose();
    // a real room registered: the stand-in steps aside (its items would stand twice)
    if (fallbackRoom && r !== fallbackRoom) {
      const fb = fallbackRoom;
      fallbackRoom = null;
      if (furn.get(fb.id)?.room === fb) { furn.get(fb.id)!.dispose(); furn.delete(fb.id); }
      fb.deco.removeFromParent();
    }
    furn.set(r.id, new Furnisher(r));
    hookPointer(r);
  };
  const unsubRooms = onMenuRoom(addRoom);
  const current = (): MenuRoom | null => {
    const id = activeMenuRoom();
    const list = menuRooms();
    const r = (id && list.find((q) => q.id === id)) || list.find((q) => q.id === 'monitor') || list[0];
    return r ?? fallbackRoom;
  };
  const viewRect = (r: MenuRoom | null): DOMRect => {
    if (!r) return new DOMRect(0, 0, innerWidth, innerHeight);
    const cv = r.host.querySelector('canvas');
    const b = (cv ?? r.host).getBoundingClientRect();
    return b.width > 4 ? b : r.host.getBoundingClientRect();
  };
  // the current menu has no registered rooms yet: adapt the subject room behind the title
  const tryFallback = () => {
    if (menuRooms().length || fallbackRoom) return;
    const sr = (opts.fallback ?? (import.meta.env.DEV ? (window as any).__title?.room : null)) as { scene?: THREE.Scene; cam?: THREE.Camera; host?: HTMLElement } | null;
    if (!sr?.scene || !sr.cam || !sr.host) return;
    const deco = new THREE.Group();
    deco.name = 'deco';
    sr.scene.add(deco);
    fallbackRoom = {
      id: 'subject', scene: sr.scene, camera: sr.cam, deco, host: sr.host,
      floor: { minX: -2.9, maxX: 2.9, minZ: -1.9, maxZ: 3.2, y: 0 },
      surfaces: [],
      guideSpot: { pos: new THREE.Vector3(-1.85, 0, 1.25), look: new THREE.Vector3(0, 1.1, -0.45) },
    };
    addRoom(fallbackRoom);
  };
  const fbTimer = setInterval(() => { if (menuRooms().length) { clearInterval(fbTimer); return; } tryFallback(); if (fallbackRoom) clearInterval(fbTimer); }, 700);
  // ---- hidden while a panel / the creator / the game is up
  const hidden = () => document.hidden || ['lit', 'paneled', 'playing', 'diving'].some((c) => root.classList.contains(c)) || !root.isConnected || !!document.querySelector('.ik3.on, .ik4.on, .ps.on');
  // ---- the guide
  const guide = new Guide({
    room: current,
    rect: () => viewRect(current()),
    layer,
    hidden: () => hidden() || shop.active,
    anchor: (k) => {
      if (k === 'blueprint') return bpKey;
      if (k === 'shop') return shopKey;
      if (k === 'guide') return null;
      if (k === 'tray') return layer.querySelector('.dk-tray') as HTMLElement | null;
      return (document.querySelector('.tt3-menu .ft-item, .tt3-menu, [data-deco-menu]') as HTMLElement | null);
    },
  });
  if (!flag('gifted', false)) { for (const id of GIFTS) if (!owned(id)) addOwned(id, 1); setFlag('gifted', true); }
  // ---- build mode and the commissary
  const build = new BuildMode({
    get preview() { return pv(); },
    layer,
    openShop: () => shop.open(),
    say: (k, extra) => guide.event(k, extra),
    onExit: () => { syncKeys(); for (const cb of buildSubs) cb(null); },
  });
  const shop = new Shop({
    get preview() { return pv(); },
    layer,
    say: (k) => guide.event(k),
    onClose: () => { syncKeys(); },
  });
  const enterBuild = () => {
    const r = current();
    if (!r || hidden()) { sfx('error', 0.5); return; }
    if (!furn.has(r.id)) addRoom(r);
    build.enter(r, furn.get(r.id)!);
    syncKeys();
    for (const cb of buildSubs) cb(r.id);
  };
  const openShop = () => { if (!hidden()) { shop.open(); syncKeys(); } };
  // round 18: the corner keys are detailed 3D models drawn sharp at the device's pixel ratio (./hubModels.ts): just the
  // object floating over its shadow, the name in small type under the pointer. Each is a door straight to one thing:
  // the codex, the research lattice, the commissary, the emote jukebox, decorating the room. Dr. Calder herself (a
  // click on her) runs the guided tour; muting her and replaying the tour live in Settings.
  const J = opts.jump ?? {};
  const codexKey = icon(pixSheet('codex'), 'Codex', 'Codex: the files on every inhabitant and anomaly', () => { if (!hidden() && J.codex) J.codex(); });
  const treeKey = icon(pixSheet('tree'), 'Skill tree', 'Skill tree: the research lattice', () => { if (!hidden() && J.tree) J.tree(); });
  const shopKey = icon(pixSheet('shop'), 'Commissary', 'Commissary: collectibles for this room', () => openShop());
  const emoteKey = icon(pixSheet('jukebox'), 'Emotes', 'Emote jukebox: emotes for the wheel', () => { if (!hidden()) void import('../../../social/emotes/shop').then((m) => m.openEmoteShop()); });
  const bpKey = icon(pixSheet('blueprint'), 'Decorate', 'Blueprint: decorate this room', () => enterBuild());
  if (!J.codex) codexKey.remove();
  if (!J.tree) treeKey.remove();
  // Settings reaches the guide through these (guide/tour.ts): mute her, replay the tour
  guideHooks({ tour: J.tour ?? null, mute: (v) => guide.setMuted(v), muted: () => guide.muted });
  const tourHook = J.tour ?? null;
  const KIND: Record<string, HubKind> = { Codex: 'codex', 'Skill tree': 'tree', Commissary: 'shop', Emotes: 'jukebox', Decorate: 'blueprint' };
  const keysAll = [codexKey, treeKey, shopKey, emoteKey, bpKey];
  for (const b of keysAll) {
    // a press: the model sinks with a clunk; under the pointer it lifts and lights
    b.addEventListener('pointerdown', () => { sfx('plate', 0.7); b.classList.add('down'); });
    for (const ev of ['pointerup', 'pointerleave', 'blur']) b.addEventListener(ev, () => b.classList.remove('down'));
  }
  let painted = '';
  const paintKeys = () => {
    const size = innerWidth >= 760 ? 52 : 40;
    const sig = size + ':' + (devicePixelRatio || 1);
    if (sig === painted) return;
    painted = sig;
    for (const b of keysAll) {
      b.querySelector(':scope > .dk-3dm')?.remove();
      const ic = hubIcon(KIND[b.dataset.k ?? ''], size);
      if (ic) {
        b.prepend(ic.cv); b.classList.add('dk-3d');
        Object.assign(b.style, { width: size + 12 + 'px', height: size + 12 + 'px', backgroundImage: 'none' });
        const hot = () => ic.hot(document.activeElement === b || b.matches(':hover'));
        b.onpointerenter = b.onpointerleave = b.onfocus = b.onblur = () => requestAnimationFrame(hot);
        continue;
      }
      // no WebGL: the pixel sheets
      const u = PIX_N * 1.5;
      Object.assign(b.style, { width: u + 'px', height: u + 'px', backgroundImage: `url(${b.dataset.sheet})`, backgroundSize: `${u}px ${u * 3}px`, imageRendering: 'pixelated' });
      b.style.setProperty('--h', u + 'px');
    }
  };
  const syncKeys = () => { layer.classList.toggle('busy', build.active || shop.active); };
  paintKeys();
  addEventListener('resize', paintKeys);
  // ---- clicks on the guide and on placed things (outside build mode)
  function hookPointer(r: MenuRoom) {
    if (hooked.has(r.host)) return;
    hooked.add(r.host);
    r.host.addEventListener('pointerdown', (e) => {
      if (build.active || shop.active || hidden()) return;
      const cr = current();
      if (!cr || cr.host !== r.host) return;
      if (guide.press(e.clientX, e.clientY)) { e.stopPropagation(); e.preventDefault(); tourHook?.(); return; }
      const f = furn.get(cr.id);
      const uid = f?.hit(e.clientX, e.clientY);
      if (uid) { f!.poke(uid); sfx('tick', 0.6); e.stopPropagation(); }
    }, true);
    r.host.addEventListener('pointermove', (e) => {
      if (build.active || shop.active || e.pointerType !== 'mouse') return;
      const cr = current();
      if (!cr || cr.host !== r.host) return;
      const on = guide.over(e.clientX, e.clientY) || !!furn.get(cr.id)?.hit(e.clientX, e.clientY);
      r.host.classList.toggle('dk-hand', on);
    }, { passive: true });
  }
  // ---- the active room changes: the guide follows, build mode closes
  const unsubActive = onActiveMenuRoom(() => {
    const r = current();
    if (build.active && r && (build as any).room !== r) build.exit();
    guide.follow(r);
  });
  // ---- the frame
  let raf = 0, last = performance.now(), lastRoom: MenuRoom | null = null;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const r = current();
    if (r !== lastRoom) { lastRoom = r; guide.follow(r); }
    const hide = hidden();
    layer.classList.toggle('off', hide);
    if (hide && build.active) build.exit(true);
    if (hide && shop.active) shop.close();
    for (const f of furn.values()) f.update(dt);
    guide.update(dt);
    build.update(dt);
    shop.update(dt);
  };
  raf = requestAnimationFrame(frame);
  tryFallback();
  installed = {
    build: enterBuild, shop: openShop, guide,
    dispose() {
      cancelAnimationFrame(raf);
      clearInterval(fbTimer);
      unsubRooms(); unsubActive();
      build.exit(true); shop.close();
      for (const f of furn.values()) f.dispose();
      furn.clear();
      guide.dispose();
      preview?.dispose();
      removeEventListener('resize', paintKeys);
      layer.remove();
      installed = null;
    },
  };
  if (import.meta.env.DEV) (window as any).__deco = { api: installed, furn, build, shop, guide, current };
  return installed;
}
