import * as THREE from 'three';
import { PixelRenderer } from '../gfx/renderer';
import { atlas } from '../gfx/atlas';
import { U, worldMaterial } from '../gfx/materials';
import { Zone } from '../world/zone';
import { ZoneBuilder } from '../world/gen/builder';
import { ZoneRenderer } from '../world/zoneRenderer';
import { LightGrid } from '../world/lighting';
import { allObjDefs } from '../world/objects';
import { allItemDefs } from '../items/item';
import { ModelBuilder } from '../gfx/modelBuilder';
import { Rng } from '../core/rng';

/**
 * Developer galleries for visual QA:
 *   ?gallery=textures            atlas sheet with names
 *   ?gallery=objects[&filter=x]  furniture/props lineup (rendered in-engine)
 *   ?gallery=items[&filter=x]    item models lineup
 *   ?gallery=creatures           creature lineup (if registered)
 * Optional: &page=N for paging, &zoom=N (px per metre), &yaw=deg
 */
export async function runGallery(kind: string, params: URLSearchParams) {
  document.getElementById('boot')?.classList.add('gone');
  if (kind === 'textures') return textureSheet(params);
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const pr = new PixelRenderer(canvas);
  canvas.style.cursor = 'default';
  atlas().flush();
  const filter = params.get('filter') || '';
  const page = Number(params.get('page') || 0);
  const zoom = Number(params.get('zoom') || 40);
  pr.pxSize = pr.pxSizeTarget = 1 / zoom;
  if (params.get('yaw')) pr.yaw = pr.yawTarget = THREE.MathUtils.degToRad(Number(params.get('yaw')));

  const z = new Zone('gallery', 48, 48, 1);
  const b = new ZoneBuilder(z, new Rng(1));
  b.fillFloor(1, 1, 46, 46, params.get('floor') || 'concrete');
  b.paper(0, 0, 47, 47, 'wall_yellow');
  for (let y = 2; y < 46; y += 3) for (let x = 2; x < 46; x += 3) b.light(x + 0.5, y + 0.5, 'fluoro', { intensity: 0.75, radius: 6 });
  const labels: { text: string; pos: THREE.Vector3 }[] = [];
  const COLS = 6, SP = 3;
  if (kind === 'objects') {
    const defs = allObjDefs().filter((d) => !d.ceiling && (!filter || d.key.includes(filter) || (d.tags || []).some((t) => t.includes(filter))));
    const per = COLS * 5;
    defs.slice(page * per, page * per + per).forEach((d, i) => {
      const gx = 4 + (i % COLS) * SP * 1.3, gy = 4 + Math.floor(i / COLS) * SP;
      const x = Math.round(gx), y = Math.round(gy);
      b.obj(d.key, x, y, 0, { ...(d.key.includes('door') ? {} : {}) });
      labels.push({ text: d.key, pos: new THREE.Vector3(x + 0.5, 0, y + (d.d ?? 1) + 0.4) });
    });
    const info = document.createElement('div');
    info.style.cssText = 'position:fixed;left:8px;top:8px;color:#ff0;font:14px monospace;z-index:20;background:#000a;padding:4px';
    info.textContent = `objects ${defs.length} total, page ${page}`;
    document.body.appendChild(info);
  }
  const zr = new ZoneRenderer(z);
  pr.scene.add(zr.root);
  const lg = new LightGrid(z);
  pr.scene.add(new THREE.AmbientLight(0x8a8a90, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(10, 20, 6);
  pr.scene.add(sun);
  U.uVisOn.value = 0;
  U.uFogNear.value = 200; U.uFogFar.value = 300;
  U.uCutOn.value = 0;

  if (kind === 'items') {
    const defs = allItemDefs().filter((d) => !filter || d.key.includes(filter) || d.cat === filter);
    const per = 8 * 6;
    defs.slice(page * per, page * per + per).forEach((d, i) => {
      const x = 4 + (i % 8) * 1.6, y = 4 + Math.floor(i / 8) * 1.6;
      const mb = new ModelBuilder();
      if (d.model) d.model(mb); else mb.box(0, 0, 0, 0.2, 0.2, 0.2, 'white', { color: 0xff00ff });
      if (mb.isEmpty) return;
      const m = new THREE.Mesh(mb.build(), worldMaterial({}));
      m.position.set(x, 0, y);
      m.scale.setScalar(2.5);
      pr.scene.add(m);
      labels.push({ text: d.key, pos: new THREE.Vector3(x, 0, y + 0.6) });
    });
  }
  if (kind === 'creatures') {
    const mod: any = await import('../creatures/registry').catch(() => null);
    if (mod) {
      const list = mod.allSpecies().filter((s: any) => !filter || s.key.includes(filter));
      list.forEach((s: any, i: number) => {
        const x = 5 + (i % 4) * 6, y = 5 + Math.floor(i / 4) * 6;
        const rig = s.build();
        rig.root.position.set(x, 0, y);
        pr.scene.add(rig.root);
        labels.push({ text: s.key, pos: new THREE.Vector3(x, 0, y + 1.5) });
        (window as any).__rigs = ((window as any).__rigs || []).concat([{ rig, s }]);
      });
    }
  }

  const tgt = new THREE.Vector3(14, 0, 12);
  if (params.get('tx')) tgt.set(Number(params.get('tx')), 0, Number(params.get('tz')));
  const labelEls = labels.map((l) => {
    const el = document.createElement('div');
    el.textContent = l.text;
    el.style.cssText = 'position:fixed;color:#fff;font:11px monospace;background:#0008;padding:1px 3px;transform:translate(-50%,0);z-index:20;pointer-events:none';
    document.body.appendChild(el);
    return el;
  });
  let t = 0;
  const loop = () => {
    t += 1 / 60;
    U.uTime.value = t;
    pr.target.copy(tgt);
    pr.updateCamera(1 / 60);
    pr.updatePlayerView(tgt);
    lg.update(1 / 60, tgt.x, tgt.z, t);
    zr.update(tgt.x, tgt.z, 40, 1 / 60);
    const rigs = (window as any).__rigs || [];
    for (const r of rigs) r.s.animateGallery?.(r.rig, t);
    pr.render(1 / 60);
    labels.forEach((l, i) => { const s = pr.worldToScreen(l.pos); labelEls[i].style.left = s.x + 'px'; labelEls[i].style.top = s.y + 'px'; });
    requestAnimationFrame(loop);
  };
  loop();
  (window as any).__gallery = { pr, z, tgt };
}

function textureSheet(params: URLSearchParams) {
  const A = atlas();
  A.flush();
  const scale = Number(params.get('scale') || 2);
  const filter = params.get('filter') || '';
  document.body.style.overflow = 'auto';
  document.body.style.background = '#333';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px;position:absolute;top:0;left:0;z-index:50;background:#333';
  const rects = (A as any).rects as Map<string, any>;
  for (const r of rects.values()) {
    if (filter && !r.name.includes(filter)) continue;
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;color:#ddd;font:10px monospace';
    const c = document.createElement('canvas');
    // show 2x2 repeats to check tiling
    c.width = r.w * 2; c.height = r.h * 2;
    c.style.width = r.w * 2 * scale + 'px'; c.style.height = r.h * 2 * scale + 'px';
    c.style.imageRendering = 'pixelated';
    const ctx = c.getContext('2d')!;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) ctx.drawImage(A.canvas, r.x, r.y, r.w, r.h, i * r.w, j * r.h, r.w, r.h);
    box.appendChild(c);
    const lbl = document.createElement('div'); lbl.textContent = `${r.name} ${r.w}x${r.h}`;
    box.appendChild(lbl);
    wrap.appendChild(box);
  }
  document.body.appendChild(wrap);
  const view = document.getElementById('view'); if (view) view.style.display = 'none';
}
