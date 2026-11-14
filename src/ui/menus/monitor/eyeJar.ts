// SPECIMEN 07 (round 18b): a big glass specimen jar on the booth's desk (monitorRoom.ts) holding a human eye in
// pale amber fixative. Drawn by the room's own pixel pipeline like everything else, made to read at that size:
// a wet white sclera threaded with red veins and pinker toward the back, a brown iris of radial fibres with a dark
// limbal ring and a gold collarette, a black pupil, a hard wet glint that always faces the desk lamp, a trailing
// optic nerve with its sheath, specks of tissue drifting in the fluid, a brass screw lid with clamp wires and a
// paper label. It follows the pointer (small saccades on the way), and a flap of eyelid blinks over it.
import * as THREE from 'three';

function eyeCanvas(): HTMLCanvasElement {
  const W = 512, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  // the sclera: white at the front (u .25), warming to pink and then raw red round the back (u .75)
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#e8d4c8'); g.addColorStop(0.12, '#f6f2ea'); g.addColorStop(0.25, '#fbf8f2'); g.addColorStop(0.38, '#f6f2ea'); g.addColorStop(0.5, '#e8ccc0');
  g.addColorStop(0.68, '#c47c70'); g.addColorStop(0.75, '#a85a50'); g.addColorStop(0.82, '#c47c70'); g.addColorStop(1, '#e8d4c8');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // the poles darker (the ball's top and bottom)
  const v = c.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(120,60,50,.35)'); v.addColorStop(0.2, 'rgba(0,0,0,0)'); v.addColorStop(0.8, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(120,60,50,.35)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  const cx = W * 0.25, cy = H / 2, R = 46;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // veins: thick at the back, forking and thinning toward the iris
  for (let i = 0; i < 70; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    let x = cx + side * (70 + rnd() * 120), y = cy + (rnd() - 0.5) * 210;
    let w = 1.2 + rnd() * 2.2;
    const red = 150 + rnd() * 70 | 0;
    for (let k = 0; k < 22 && w > 0.35; k++) {
      const a = Math.atan2(cy - y, cx - x) + (rnd() - 0.5) * 1.5, L = 4 + rnd() * 8;
      const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
      if (Math.hypot(nx - cx, ny - cy) < R + 6) break;
      c.strokeStyle = `rgba(${red},${16 + rnd() * 24 | 0},${24 + rnd() * 20 | 0},${0.45 + rnd() * 0.45})`;
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      if (rnd() < 0.18) { c.lineWidth = w * 0.5; c.beginPath(); c.moveTo(nx, ny); c.lineTo(nx + (rnd() - 0.5) * 16, ny + (rnd() - 0.5) * 16); c.stroke(); }
      x = nx; y = ny; w *= 0.88;
    }
  }
  // a pink ring of irritation round the limbus
  const pr = c.createRadialGradient(cx, cy, R, cx, cy, R + 22);
  pr.addColorStop(0, 'rgba(210,120,110,.45)'); pr.addColorStop(1, 'rgba(210,120,110,0)');
  c.fillStyle = pr; c.beginPath(); c.arc(cx, cy, R + 22, 0, Math.PI * 2); c.fill();
  // the iris: brown-amber fibres, darker crypts, a black limbal ring, a gold collarette
  const ig = c.createRadialGradient(cx, cy, 8, cx, cy, R);
  ig.addColorStop(0, '#3a2210'); ig.addColorStop(0.32, '#a8702c'); ig.addColorStop(0.55, '#7a4a1e'); ig.addColorStop(0.85, '#4a2c14'); ig.addColorStop(1, '#140c06');
  c.fillStyle = ig; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r0 = 15 + rnd() * 5, r1 = R * (0.62 + rnd() * 0.36);
    c.strokeStyle = rnd() < 0.55 ? `rgba(230,180,96,${0.25 + rnd() * 0.35})` : `rgba(30,16,6,${0.3 + rnd() * 0.35})`;
    c.lineWidth = 0.7 + rnd() * 1.1; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    const m = (r0 + r1) / 2, wob = (rnd() - 0.5) * 0.12;
    c.quadraticCurveTo(cx + Math.cos(a + wob) * m, cy + Math.sin(a + wob) * m, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
  }
  for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2, r = 24 + rnd() * 16; c.fillStyle = 'rgba(20,10,4,.55)'; c.beginPath(); c.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + rnd() * 3, 1 + rnd() * 1.5, a, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(240,200,110,.75)'; c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, 21, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#0a0604'; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, R - 2, 0, Math.PI * 2); c.stroke();
  // the pupil
  c.fillStyle = '#030303'; c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fill();
  return cv;
}

function labelCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 192; cv.height = 96;
  const c = cv.getContext('2d')!;
  // yellowed paper, foxing, a ruled line, typed words in the institute's hand
  c.fillStyle = '#e6d8b0'; c.fillRect(0, 0, 192, 96);
  let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${150 + r() * 40 | 0},${110 + r() * 30 | 0},${60 + r() * 20 | 0},${r() * 0.18})`; c.fillRect(r() * 192, r() * 96, 1 + r() * 3, 1 + r() * 3); }
  const e = c.createLinearGradient(0, 0, 0, 96); e.addColorStop(0, 'rgba(120,80,30,.25)'); e.addColorStop(0.15, 'rgba(0,0,0,0)'); e.addColorStop(0.85, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(120,80,30,.3)');
  c.fillStyle = e; c.fillRect(0, 0, 192, 96);
  c.fillStyle = '#2a1e10'; c.font = '30px Alagard, monospace'; c.textAlign = 'center'; c.fillText('SPECIMEN 07', 96, 44);
  c.fillStyle = '#4a3a24'; c.fillRect(18, 56, 156, 2);
  c.font = '18px Alagard, monospace'; c.fillText('OCULUS DEXTER', 96, 80);
  return cv;
}

export interface EyeJar { group: THREE.Group; hit: THREE.Object3D; update(dt: number, t: number, cam: THREE.Camera, ptr?: THREE.Vector2): void; poke(): void }

export function eyeJar(): EyeJar {
  const g = new THREE.Group();
  const R = 0.052, Hh = 0.15;
  const glassM = new THREE.MeshStandardMaterial({ color: 0xeef2ec, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false });
  const fluidM = new THREE.MeshStandardMaterial({ color: 0xe8c880, roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, emissive: 0x3a2a0c, emissiveIntensity: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 0.85 });
  const brassD = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.45, metalness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.55, metalness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.012, R + 0.016, 0.022, 20), iron); base.position.y = 0.011;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hh, 28, 1, true), glassM); glass.position.y = 0.022 + Hh / 2; glass.renderOrder = 3;
  // the glass catches the light in two long vertical streaks
  const streakM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const streaks: THREE.Mesh[] = [];
  for (const [a, w, o] of [[-0.55, 0.006, 0.55], [0.35, 0.003, 0.35]] as [number, number, number][]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, Hh * 0.8), streakM.clone());
    (m.material as THREE.MeshBasicMaterial).opacity = o;
    m.position.set(Math.sin(a) * (R + 0.0015), 0.022 + Hh * 0.52, Math.cos(a) * (R + 0.0015)); m.rotation.y = a; m.renderOrder = 4;
    streaks.push(m);
  }
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.003, R - 0.003, Hh * 0.84, 24), fluidM); fluid.position.y = 0.022 + Hh * 0.42; fluid.renderOrder = 2;
  const meniscus = new THREE.Mesh(new THREE.RingGeometry(R - 0.012, R - 0.003, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.45, depthWrite: false }));
  meniscus.position.y = 0.022 + Hh * 0.84; meniscus.renderOrder = 3;
  // the brass screw lid: a knurled band, a domed top, a knob; two clamp wires down the sides to the base
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.007, R + 0.008, 0.024, 28), brass); lid.position.y = 0.022 + Hh + 0.012;
  const knurl = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0085, R + 0.0085, 0.01, 28, 1, true), brassD); knurl.position.y = 0.022 + Hh + 0.006;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R + 0.004, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.22), brass); dome.position.y = 0.022 + Hh + 0.002; dome.scale.y = 0.9;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.016, 12), brassD); knob.position.y = 0.022 + Hh + 0.035;
  const wireM = new THREE.MeshStandardMaterial({ color: 0x9a9e98, roughness: 0.3, metalness: 0.9 });
  const wires: THREE.Mesh[] = [];
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, Hh + 0.03, 5), wireM); w.position.set(s * (R + 0.009), 0.022 + Hh / 2 + 0.005, 0); wires.push(w); }
  // the paper label pasted round the front
  const lt = new THREE.CanvasTexture(labelCanvas()); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 4;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0012, R + 0.0012, 0.044, 24, 1, true, -0.62, 1.24), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
  label.position.y = 0.028 + 0.022; label.rotation.y = 0;
  // the eye: a glossy painted ball, the cornea bulging over the iris
  const tex = new THREE.CanvasTexture(eyeCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const eyeM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0, emissive: 0x1a1410, emissiveIntensity: 0.6, emissiveMap: tex });
  const eyeR = 0.031;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 36, 24), eyeM);
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.52, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.16 }));
  cornea.rotation.x = Math.PI / 2; cornea.position.z = eyeR * 0.8;
  // the optic nerve: a pale sheathed cord trailing back and down into the fluid, frayed at its cut end
  const nerveCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -eyeR * 0.9), new THREE.Vector3(0.004, -0.008, -eyeR - 0.018), new THREE.Vector3(-0.006, -0.026, -eyeR - 0.028), new THREE.Vector3(0.003, -0.05, -eyeR - 0.026), new THREE.Vector3(0.008, -0.066, -eyeR - 0.012)]);
  const nerve = new THREE.Mesh(new THREE.TubeGeometry(nerveCurve, 24, 0.0042, 7), new THREE.MeshStandardMaterial({ color: 0xe0b8a0, roughness: 0.45, emissive: 0x2a1008, emissiveIntensity: 0.3 }));
  const vessel = new THREE.Mesh(new THREE.TubeGeometry(nerveCurve, 24, 0.0013, 4), new THREE.MeshStandardMaterial({ color: 0x9a2a22, roughness: 0.4 }));
  vessel.position.x = 0.0035;
  const fray = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.01, 6), new THREE.MeshStandardMaterial({ color: 0xb87a6a, roughness: 0.6 }));
  fray.position.copy(nerveCurve.getPoint(1)); fray.rotation.x = Math.PI * 0.85;
  // a flap of eyelid over the top: it blinks shut over the eye now and then
  const lidSkin = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.05, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.34), new THREE.MeshStandardMaterial({ color: 0xd49c88, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x2a1008, emissiveIntensity: 0.3 }));
  lidSkin.rotation.x = 0.45;
  const lashes = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 0.92, 0.0012, 3, 24, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: 0x1a120c }));
  lashes.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); lashes.position.y = eyeR * 0.47;
  const lidG = new THREE.Group(); lidG.add(lidSkin, lashes);
  // the wet glint: a hard white point on the cornea toward the lamp (kept on the light's side as the eye turns)
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff8e8 }));
  const look = new THREE.Group(); look.add(eye, cornea, nerve, vessel, fray);
  const ball = new THREE.Group(); ball.add(look, lidG, glint, glint2);
  ball.position.y = 0.022 + Hh * 0.5;
  // specks of tissue drifting in the fluid
  const N = 46;
  const pg = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (R - 0.008); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.03 + Math.random() * Hh * 0.74; pos[i * 3 + 2] = Math.sin(a) * r; ph[i] = Math.random() * 10; }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const specks = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf0dcb0, size: 0.0035, transparent: true, opacity: 0.85, depthWrite: false }));
  specks.renderOrder = 2;
  const base0 = pos.slice();
  // a warm lamp on the jar so it reads against the green of the screens
  const lamp = new THREE.PointLight(0xffd2a0, 1.1, 0.75, 2);
  lamp.position.set(-0.09, Hh + 0.12, 0.14);
  g.add(base, ball, specks, fluid, meniscus, glass, ...streaks, label, lid, knurl, dome, knob, ...wires, lamp);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.01, R + 0.01, Hh + 0.05, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (Hh + 0.05) / 2; g.add(hit);
  let blinkT = 2 + Math.random() * 3, blink = 0, sacT = 0, poke = 0;
  const aim = new THREE.Vector3(), off = new THREE.Vector3(), tgt = new THREE.Vector3(), ray = new THREE.Raycaster(), wp = new THREE.Vector3(), cp = new THREE.Vector3(), lp = new THREE.Vector3(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), inv = new THREE.Matrix4(), nd = new THREE.Vector2();
  return {
    group: g, hit,
    poke() { poke = 1; blink = 1; },
    update(dt, t, cam, ptr) {
      // the eye drifts in the fluid and follows the pointer with small jumps (saccades)
      ball.position.x = Math.sin(t * 0.7) * 0.004; ball.position.z = Math.cos(t * 0.53) * 0.004;
      ball.position.y = 0.022 + Hh * 0.5 + Math.sin(t * 0.9) * 0.005 + poke * Math.sin(t * 30) * 0.004;
      poke = Math.max(0, poke - dt * 1.5);
      sacT -= dt;
      if (sacT <= 0) { sacT = 0.3 + Math.random() * 1.4; off.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.05, 0); }
      ball.updateWorldMatrix(true, false);
      ball.getWorldPosition(wp);
      cam.getWorldPosition(cp);
      if (ptr) {
        nd.set(ptr.x, -ptr.y);
        ray.setFromCamera(nd, cam);
        tgt.copy(ray.ray.direction).multiplyScalar(cp.distanceTo(wp) * 0.55).add(ray.ray.origin);
      } else tgt.copy(cp);
      tgt.add(off);
      look.updateWorldMatrix(true, false);
      aim.copy(tgt);
      q0.copy(look.quaternion);
      look.lookAt(aim);
      q1.copy(look.quaternion);
      look.quaternion.copy(q0).slerp(q1, Math.min(1, dt * 12));
      // the glint sits on the cornea's surface between the eye's front and the lamp
      inv.copy(ball.matrixWorld).invert();
      lp.set(-0.4, 0.8, 0.5).normalize();
      const front = new THREE.Vector3(0, 0, 1).applyQuaternion(look.quaternion);
      const toCam = cp.clone().sub(wp).normalize().transformDirection(inv);
      const n = toCam.clone().add(lp).normalize();
      const k = Math.max(0, front.dot(n));
      glint.position.copy(n).multiplyScalar(eyeR * 1.02); glint.visible = k > 0.2 && blink < 0.5;
      glint2.position.copy(n).multiplyScalar(eyeR * 1.02).add(new THREE.Vector3(0.006, -0.005, 0).applyQuaternion(look.quaternion)); glint2.visible = glint.visible;
      // the lid follows the eye's turn a little and blinks shut now and then
      lidG.quaternion.copy(look.quaternion);
      blinkT -= dt;
      if (blinkT <= 0) { blink = 1; blinkT = 1.8 + Math.random() * 4.5; }
      blink = Math.max(0, blink - dt * 5);
      const shut = blink > 0.5 ? (1 - blink) * 2 : blink * 2;
      lidSkin.rotation.x = 0.45 + shut * 1.2; lashes.position.y = eyeR * (0.47 - shut * 0.5); lashes.position.z = eyeR * shut * 0.85;
      // the specks drift
      const a = pg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        a.array[i * 3] = base0[i * 3] + Math.sin(t * 0.3 + ph[i]) * 0.004;
        a.array[i * 3 + 1] = 0.03 + ((base0[i * 3 + 1] - 0.03 + t * 0.0025 * (0.5 + (ph[i] % 1))) % (Hh * 0.74));
        a.array[i * 3 + 2] = base0[i * 3 + 2] + Math.cos(t * 0.27 + ph[i]) * 0.004;
      }
      a.needsUpdate = true;
    },
  };
}
