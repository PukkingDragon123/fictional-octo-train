import * as THREE from 'three';
import { PixelRenderer } from '../gfx/renderer';
import { atlas } from '../gfx/atlas';
import { Zone } from '../world/zone';
import { generateLobby } from '../world/gen/lobby';
import { ZoneRenderer } from '../world/zoneRenderer';
import { LightGrid } from '../world/lighting';
import { Visibility } from '../world/visibility';
import { U, worldMaterial } from '../gfx/materials';
import { Input } from '../core/input';
import { Rng } from '../core/rng';

/** Temporary render sandbox (replaced by the full game boot). */
export function runSandbox(_params: URLSearchParams) {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const pr = new PixelRenderer(canvas);
  atlas().flush();
  const zone = new Zone('lobby', 96, 96, 1234);
  generateLobby(zone, 1234);
  const zr = new ZoneRenderer(zone);
  pr.scene.add(zr.root);
  const lg = new LightGrid(zone);
  const vis = new Visibility(zone);
  pr.scene.add(new THREE.AmbientLight(zone.env.ambient, zone.env.ambientI * Math.PI));
  U.uFogColor.value.set(zone.env.fog);
  U.uFogNear.value = zone.env.fogNear; U.uFogFar.value = zone.env.fogFar;
  U.uVoidColor.value.set(zone.env.void);
  const player = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.3), worldMaterial({}));
  pr.scene.add(player);
  const start = zone.randomFloor(new Rng(5))!;
  player.position.set(start[0] + 0.5, 0.85, start[1] + 0.5);
  const flash = new THREE.SpotLight(0xfff1d6, 30, 18, 0.5, 0.5, 1.4);
  flash.castShadow = true;
  flash.shadow.mapSize.set(1024, 1024);
  pr.scene.add(flash); pr.scene.add(flash.target);
  const input = new Input(canvas);
  let facing = 0, last = performance.now(), time = 0;
  (window as any).__game = { pr, zone, player, U, lg, vis };
  document.getElementById('boot')!.classList.add('gone');
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    U.uTime.value = time;
    let mx = 0, mz = 0;
    if (input.down('up')) { mx -= 1; mz -= 1; }
    if (input.down('down')) { mx += 1; mz += 1; }
    if (input.down('left')) { mx -= 1; mz += 1; }
    if (input.down('right')) { mx += 1; mz -= 1; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const sp = (input.down('run') ? 4.2 : 2.2) * dt / len;
      player.position.x += mx * sp; player.position.z += mz * sp;
      facing = Math.atan2(mz, mx);
    }
    pr.target.set(player.position.x, 0, player.position.z);
    pr.updateCamera(dt);
    pr.updatePlayerView(new THREE.Vector3(player.position.x, 0, player.position.z));
    flash.position.set(player.position.x, 1.4, player.position.z);
    flash.target.position.set(player.position.x + Math.cos(facing) * 4, 0.2, player.position.z + Math.sin(facing) * 4);
    lg.update(dt, player.position.x, player.position.z, time);
    vis.update(dt, player.position.x, player.position.z, facing, time);
    zr.update(player.position.x, player.position.z, 26, dt);
    pr.render(dt);
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
