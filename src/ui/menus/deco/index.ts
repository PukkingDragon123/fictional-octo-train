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
import { kitScale } from '../btnKit';
import { sfx } from '../sfx';
import { Furnisher } from './furnish';
import { BuildMode } from './blueprint';
import { Shop } from './shop';
import { Preview } from './preview';
import { blueprintSheet, shopSheet, guideSheet } from './icons';
import { mxOk } from '../../machine/core';
import { mxIcon, type IconKind } from '../../machine/decor';
import { GIFTS } from './catalog';
import { owned, addOwned, flag, setFlag } from './store';
import { Guide } from '../guide/guide';
import { bitReady } from '../../../gfx/bitfont';
import './deco.css';

export interface DecoApi { build(): void; shop(): void; dispose(): void; guide: Guide }

const buildSubs = new Set<(id: MenuRoomId | null) => void>();
export function onBuildMode(cb: (id: MenuRoomId | null) => void): () => void { buildSubs.add(cb); return () => buildSubs.delete(cb); }

let installed: DecoApi | null = null;

export function installDecoAndGuide(opts: { root?: HTMLElement; fallback?: unknown } = {}): DecoApi {
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
      if (k === 'guide') return guideKey;
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
  const bpKey = icon(blueprintSheet(), 'Blueprint', 'Blueprint: decorate this room', () => { sfx('plate'); enterBuild(); });
  const shopKey = icon(shopSheet(), 'Commissary', 'Commissary: buy collectibles with research points', () => { sfx('plate'); openShop(); });
  const guideKey = icon(guideSheet(guide.muted), 'Guide', 'Guide: mute or call Dr. Calder', () => { sfx('toggle'); guide.setMuted(!guide.muted); });
  // round 17: the emote jukebox (buy emotes with research points, fill the wheel)
  const emoteKey = icon(shopSheet(), 'Emotes', 'Emote jukebox: buy emotes with dollars', () => { sfx('plate'); if (!hidden()) void import('../../../social/emotes/shop').then((m) => m.openEmoteShop()); });
  guide.onMute = (m) => { guideKey.dataset.sheet = guideSheet(m); paintKeys(); guideKey.classList.toggle('muted', m); };
  guideKey.classList.toggle('muted', guide.muted);
  // round 16: the keys are little 3D props from the machine kit (src/ui/machine/decor.ts), drawn at half size and
  // shown twice as big so they keep the hub's chunky pixels; the flat sheets stay as the no-WebGL fallback
  const MODEL: Record<string, () => IconKind> = { Blueprint: () => 'blueprint', Commissary: () => 'ledger', Guide: () => (guide.muted ? 'phoneOff' : 'phone'), Emotes: () => 'coin' };
  const paintKeys = () => {
    const S = Math.max(2, Math.round(kitScale() * (devicePixelRatio || 1) * 0.75) / (devicePixelRatio || 1));
    for (const b of [bpKey, shopKey, emoteKey, guideKey]) {
      const u = Math.round(12 * S);
      const ic = mxOk() ? mxIcon(MODEL[b.dataset.k ?? '']?.() ?? 'gear', u) : null;
      b.querySelector(':scope > .mxi-cv')?.remove();
      if (ic) {
        ic.style.width = ic.width * 2 + 'px'; ic.style.height = ic.height * 2 + 'px';
        b.prepend(ic); b.classList.add('dk-3d');
        Object.assign(b.style, { width: u * 2 + 'px', height: u * 2 + 'px', backgroundImage: 'none' });
        continue;
      }
      Object.assign(b.style, { width: 24 * S + 'px', height: 24 * S + 'px', backgroundImage: `url(${b.dataset.sheet})`, backgroundSize: `${24 * S}px ${72 * S}px` });
      b.style.setProperty('--h', 24 * S + 'px');
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
      if (guide.press(e.clientX, e.clientY)) { e.stopPropagation(); e.preventDefault(); return; }
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
