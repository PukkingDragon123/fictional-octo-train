// SPECIMEN 07 (round 18): a jar on the booth's desk (monitorRoom.ts) holding a human eye in cloudy fixative.
// The eye is a real one, as far as a painted ball goes: a wet white sclera, pink toward the back and threaded
// with red veins, an iris of radial fibres (darker at the limbal ring, flecked round the pupil), the pupil
// itself, and a wet highlight from the lamp (a glossy material). It drifts in the fluid, looks toward the
// camera with small saccades, and a torn lid of skin on top twitches shut now and then.
import * as THREE from 'three';

function eyeCanvas(): HTMLCanvasElement {
  const W = 512, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  // the sclera: off-white, pinker and darker round the back (u = 0.75 is the back of the ball)
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#d8b8b0'); g.addColorStop(0.25, '#f2ece2'); g.addColorStop(0.5, '#d8b8b0'); g.addColorStop(0.75, '#b07a72'); g.addColorStop(1, '#d8b8b0');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // the front (u 0.25): the iris at the centre of the front
  const cx = W * 0.25, cy = H / 2, R = 40;
  // veins: from the back toward the iris, thinning and forking
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 46; i++) {
    let x = cx + (rnd() - 0.5) * 220 + (rnd() < 0.5 ? -1 : 1) * 60, y = cy + (rnd() - 0.5) * 200;
    let w = 1.6 + rnd() * 1.4;
    c.strokeStyle = `rgba(${150 + rnd() * 60 | 0},${20 + rnd() * 30 | 0},${30 + rnd() * 20 | 0},${0.35 + rnd() * 0.4})`;
    for (let k = 0; k < 14 && w > 0.3; k++) {
      const a = Math.atan2(cy - y, cx - x) + (rnd() - 0.5) * 1.3, L = 6 + rnd() * 9;
      const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
      if (Math.hypot(nx - cx, ny - cy) < R + 4) break;
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      x = nx; y = ny; w *= 0.86;
    }
  }
  // the iris: a dark limbal ring, hazel fibres, a gold flecked collarette round the pupil
  const ig = c.createRadialGradient(cx, cy, 6, cx, cy, R);
  ig.addColorStop(0, '#2a1a0a'); ig.addColorStop(0.35, '#8a6a2a'); ig.addColorStop(0.7, '#4a6a5a'); ig.addColorStop(0.92, '#2a3a32'); ig.addColorStop(1, '#141a16');
  c.fillStyle = ig; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2, r0 = 14 + rnd() * 6, r1 = R * (0.7 + rnd() * 0.28);
    c.strokeStyle = rnd() < 0.5 ? `rgba(200,170,90,${0.25 + rnd() * 0.3})` : `rgba(20,30,24,${0.25 + rnd() * 0.3})`;
    c.lineWidth = 0.8 + rnd(); c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
  }
  c.strokeStyle = 'rgba(220,180,90,0.6)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, 18, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#0c0e0c'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.stroke();
  // the pupil
  c.fillStyle = '#050505'; c.beginPath(); c.arc(cx, cy, 13, 0, Math.PI * 2); c.fill();
  return cv;
}

export interface EyeJar { group: THREE.Group; hit: THREE.Object3D; update(dt: number, t: number, cam: THREE.Camera): void; poke(): void }

export function eyeJar(): EyeJar {
  const g = new THREE.Group();
  const R = 0.052, Hh = 0.14;
  const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe8e0, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
  const fluidM = new THREE.MeshStandardMaterial({ color: 0xb8c890, roughness: 0.4, transparent: true, opacity: 0.32, depthWrite: false });
  const brass = new THREE.MeshStandardMaterial({ color: 0xa8843a, roughness: 0.35, metalness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.012, R + 0.016, 0.022, 16), iron); base.position.y = 0.011;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hh, 20, 1, true), glassM); glass.position.y = 0.022 + Hh / 2; glass.renderOrder = 3;
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.003, R - 0.003, Hh * 0.82, 20), fluidM); fluid.position.y = 0.022 + Hh * 0.41; fluid.renderOrder = 2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.008, 0.02, 20), brass); lid.position.y = 0.022 + Hh + 0.01;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.014, 10), brass); knob.position.y = 0.022 + Hh + 0.027;
  // a paper label on the glass: SPECIMEN 07
  const lc = document.createElement('canvas'); lc.width = 128; lc.height = 48;
  { const c = lc.getContext('2d')!; c.fillStyle = '#e8dcb8'; c.fillRect(0, 0, 128, 48); c.fillStyle = '#2a2014'; c.font = '20px Alagard, monospace'; c.textAlign = 'center'; c.fillText('SPECIMEN 07', 64, 30); c.fillStyle = '#a83a2a'; c.fillRect(8, 38, 112, 3); }
  const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.001, R + 0.001, 0.036, 20, 1, true, -0.7, 1.4), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
  label.position.y = 0.04 + 0.018;
  // the eye: a glossy painted ball, its stalk of optic nerve trailing down
  const tex = new THREE.CanvasTexture(eyeCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const eyeM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.12, metalness: 0 });
  const eyeR = 0.03;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 32, 20), eyeM);
  // the clear cornea bulging over the iris: the wet highlight sits on it
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.18 }));
  cornea.rotation.x = Math.PI / 2; cornea.position.z = eyeR * 0.78;
  const nerveM = new THREE.MeshStandardMaterial({ color: 0xc89080, roughness: 0.55 });
  const nerve = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0025, 0.05, 6), nerveM); nerve.rotation.x = Math.PI / 2; nerve.position.z = -eyeR - 0.02;
  // a torn lid of skin over the top; it twitches shut now and then
  const lidSkin = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.04, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshStandardMaterial({ color: 0xc89a86, roughness: 0.6, side: THREE.DoubleSide }));
  lidSkin.rotation.x = 0.45;
  const look = new THREE.Group(); look.add(eye, cornea, nerve);
  const ball = new THREE.Group(); ball.add(look, lidSkin);
  ball.position.y = 0.022 + Hh * 0.45;
  g.add(base, ball, fluid, glass, label, lid, knob);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.01, R + 0.01, Hh + 0.05, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (Hh + 0.05) / 2; g.add(hit);
  let blinkT = 2 + Math.random() * 3, blink = 0, sacT = 0, poke = 0;
  const aim = new THREE.Vector3(), off = new THREE.Vector3(), tgt = new THREE.Vector3();
  return {
    group: g, hit,
    poke() { poke = 1; blink = 1; },
    update(dt, t, cam) {
      // the eye drifts in the fluid and holds the camera with small jumps (saccades)
      ball.position.x = Math.sin(t * 0.7) * 0.004; ball.position.z = Math.cos(t * 0.53) * 0.004;
      ball.position.y = 0.022 + Hh * 0.45 + Math.sin(t * 0.9) * 0.005 + poke * Math.sin(t * 30) * 0.004;
      poke = Math.max(0, poke - dt * 1.5);
      sacT -= dt;
      if (sacT <= 0) { sacT = 0.4 + Math.random() * 1.6; off.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15, 0); }
      cam.getWorldPosition(tgt).add(off);
      look.updateWorldMatrix(true, false);
      aim.copy(tgt);
      const q0 = look.quaternion.clone();
      look.lookAt(aim);
      const q1 = look.quaternion.clone();
      look.quaternion.copy(q0).slerp(q1, Math.min(1, dt * 14));
      // the lid twitches shut and opens again
      blinkT -= dt;
      if (blinkT <= 0) { blink = 1; blinkT = 1.5 + Math.random() * 4.5; }
      blink = Math.max(0, blink - dt * 5);
      const shut = blink > 0.5 ? (1 - blink) * 2 : blink * 2;
      lidSkin.rotation.x = 0.45 + shut * 1.15;
    },
  };
}
