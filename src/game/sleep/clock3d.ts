// The sleep cut's clock: a worn twin-bell alarm clock (brass case and bells, a cream enamel dial with a day window,
// blued steel hands, a glass over the face, a hammer between the bells) that hangs in the top corner of the picture
// while the unit sleeps. Its hands run with the game clock, so a time skip spins them; every hour it passes it
// gives a little jump, and when the unit wakes the hammer rattles the bells.
import * as THREE from 'three';

export interface SleepClock {
  root: THREE.Group;
  /** set the hands and the day window from the game clock (hours since the start) */
  set(hours: number, day: number): void;
  /** per-frame motion: the hour jump, the bells' rattle */
  step(dt: number): void;
  /** a little jump (an hour passed) */
  bump(): void;
  /** rattle the bells for `secs` */
  ring(secs: number): void;
  dispose(): void;
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

/** brass, scuffed: a tarnish mottle with bright rubbed edges and fine scratches */
function brassTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = '#c99a3e'; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 128, y = rnd() * 128, r = rnd() * 3 + 0.5;
      c.fillStyle = rnd() < 0.5 ? `rgba(92,58,18,${0.1 + rnd() * 0.25})` : `rgba(255,226,150,${0.08 + rnd() * 0.2})`;
      c.fillRect(x, y, r, r);
    }
    c.strokeStyle = 'rgba(255,240,190,.35)'; c.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = rnd() * 128, y = rnd() * 128; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8); c.stroke(); }
    // verdigris in the crevices
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(70,130,100,${0.08 + rnd() * 0.15})`; c.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  });
}
/** the dial: cream enamel, crazed and foxed, minute track, hour batons, 12 / 3 / 6 / 9, a day window */
function dialTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 118, 10, 128, 128, 128);
    g.addColorStop(0, '#fbf2d8'); g.addColorStop(0.75, '#efe0b8'); g.addColorStop(1, '#cdb57f');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    // foxing and crazing
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(150,110,50,${rnd() * 0.08})`; const r = rnd() * 5 + 1; c.fillRect(rnd() * 256, rnd() * 256, r, r); }
    c.strokeStyle = 'rgba(120,90,40,.12)';
    for (let i = 0; i < 26; i++) { let x = rnd() * 256, y = rnd() * 256; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 22; y += (rnd() - 0.5) * 22; c.lineTo(x, y); } c.stroke(); }
    c.translate(128, 128);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
      c.save(); c.rotate(a);
      c.fillStyle = big ? '#1d1812' : '#4a3f30';
      if (big) c.fillRect(-3.5, -118, 7, 20); else c.fillRect(-1, -118, 2, 8);
      c.restore();
    }
    c.fillStyle = '#1d1812';
    c.font = 'bold 34px Alagard, Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const num: [string, number][] = [['12', 0], ['3', 3], ['6', 6], ['9', 9]];
    for (const [s, h] of num) { const a = (h / 12) * Math.PI * 2; c.fillText(s, Math.sin(a) * 76, -Math.cos(a) * 76 + 2); }
    // the day window frame (its number is a separate little plate)
    c.fillStyle = '#5a4526'; c.fillRect(-22, 24, 44, 26);
    c.fillStyle = '#f7efd8'; c.fillRect(-19, 27, 38, 20);
  });
}
function dayTex(day: number): THREE.CanvasTexture {
  return canvasTex(64, 32, (c) => {
    c.fillStyle = '#f7efd8'; c.fillRect(0, 0, 64, 32);
    c.fillStyle = '#7a1c12'; c.font = 'bold 26px Alagard, Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(day), 32, 17);
  });
}

export function buildSleepClock(): SleepClock {
  const root = new THREE.Group();
  root.name = 'sleepClock';
  const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [], texs: THREE.Texture[] = [];
  const M = <T extends THREE.Material>(m: T) => { mats.push(m); return m; };
  const Gm = <T extends THREE.BufferGeometry>(g: T) => { geos.push(g); return g; };
  const bt = brassTex(); texs.push(bt);
  const brass = M(new THREE.MeshStandardMaterial({ color: 0xffffff, map: bt, metalness: 0.82, roughness: 0.34 }));
  const darkBrass = M(new THREE.MeshStandardMaterial({ color: 0x8a6a30, map: bt, metalness: 0.8, roughness: 0.45 }));
  const steel = M(new THREE.MeshStandardMaterial({ color: 0x1c2a4a, metalness: 0.9, roughness: 0.25 }));
  const dt = dialTex(); texs.push(dt);
  const dialMat = M(new THREE.MeshStandardMaterial({ map: dt, roughness: 0.42, metalness: 0 }));
  const glass = M(new THREE.MeshStandardMaterial({ color: 0xdfeeff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, depthWrite: false }));
  const R = 0.07;
  const body = new THREE.Group(); root.add(body);
  // case: a deep drum, the dial set in a bezel
  const drum = new THREE.Mesh(Gm(new THREE.CylinderGeometry(R, R, 0.036, 40, 1, true)), brass); drum.rotation.x = Math.PI / 2; body.add(drum);
  const back = new THREE.Mesh(Gm(new THREE.CircleGeometry(R, 40)), darkBrass); back.position.z = -0.018; back.rotation.y = Math.PI; body.add(back);
  const dial = new THREE.Mesh(Gm(new THREE.CircleGeometry(R * 0.9, 48)), dialMat); dial.position.z = 0.012; body.add(dial);
  const bezel = new THREE.Mesh(Gm(new THREE.TorusGeometry(R * 0.95, 0.0075, 10, 48)), brass); bezel.position.z = 0.017; body.add(bezel);
  const dome = new THREE.Mesh(Gm(new THREE.SphereGeometry(R * 1.9, 32, 8, 0, Math.PI * 2, 0, 0.5)), glass); dome.rotation.x = Math.PI / 2; dome.position.z = 0.017 - R * 1.9 * Math.cos(0.5) + 0.002; body.add(dome);
  // day window number
  const dayMat = M(new THREE.MeshStandardMaterial({ roughness: 0.5 }));
  const dayPlate = new THREE.Mesh(Gm(new THREE.PlaneGeometry(0.0105, 0.0055)), dayMat); dayPlate.position.set(0, -0.0233, 0.0128); body.add(dayPlate);
  let shownDay = -1;
  // hands (blued steel), the centre cap
  const hand = (len: number, w: number) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(Gm(new THREE.BoxGeometry(w, len, 0.0016)), steel); m.position.y = len / 2 - len * 0.12; g.add(m);
    const tip = new THREE.Mesh(Gm(new THREE.ConeGeometry(w * 1.1, w * 2.4, 4)), steel); tip.position.y = len * 0.88 + w; g.add(tip);
    return g;
  };
  const hourH = hand(R * 0.5, 0.0052); hourH.position.z = 0.0145; body.add(hourH);
  const minH = hand(R * 0.75, 0.0034); minH.position.z = 0.016; body.add(minH);
  const cap = new THREE.Mesh(Gm(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 12)), brass); cap.rotation.x = Math.PI / 2; cap.position.z = 0.0172; body.add(cap);
  // the bells, their posts and the hammer between them
  const bells: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(Gm(new THREE.CylinderGeometry(0.0022, 0.0022, 0.03, 8)), darkBrass);
    post.position.set(sx * R * 0.42, R + 0.01, -0.004); post.rotation.z = -sx * 0.5; body.add(post);
    const bell = new THREE.Mesh(Gm(new THREE.SphereGeometry(R * 0.46, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2)), brass);
    const bg = new THREE.Group(); bg.position.set(sx * R * 0.62, R + 0.024, -0.004); bg.rotation.z = -sx * 0.55; bg.add(bell); body.add(bg);
    const knob = new THREE.Mesh(Gm(new THREE.SphereGeometry(0.0035, 8, 6)), darkBrass); knob.position.y = R * 0.46; bell.add(knob);
    bells.push(bg);
  }
  const hammer = new THREE.Group(); hammer.position.set(0, R + 0.004, -0.004); body.add(hammer);
  const arm = new THREE.Mesh(Gm(new THREE.BoxGeometry(0.0022, 0.03, 0.0022)), darkBrass); arm.position.y = 0.015; hammer.add(arm);
  const head = new THREE.Mesh(Gm(new THREE.SphereGeometry(0.0045, 8, 6)), brass); head.position.y = 0.031; hammer.add(head);
  // a carry ring and two feet
  const ring = new THREE.Mesh(Gm(new THREE.TorusGeometry(0.012, 0.0022, 6, 18, Math.PI)), darkBrass); ring.position.set(0, R + 0.038, -0.004); body.add(ring);
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(Gm(new THREE.CylinderGeometry(0.0026, 0.0055, 0.022, 8)), darkBrass);
    foot.position.set(sx * R * 0.62, -R - 0.008, -0.004); foot.rotation.z = sx * 0.6; body.add(foot);
  }
  // its own light (the overlay scene carries no world light): a warm key from the upper left, a cool fill
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0x3a3026, 1.25); root.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d0, 2.1); key.position.set(-0.6, 0.9, 1); root.add(key);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.7); rim.position.set(0.8, 0.1, -0.6); root.add(rim);

  let jump = 0, rattle = 0;
  return {
    root,
    set(hours: number, day: number) {
      const h12 = ((hours % 12) + 12) % 12;
      minH.rotation.z = -(hours % 1) * Math.PI * 2;
      hourH.rotation.z = -(h12 / 12) * Math.PI * 2;
      if (day !== shownDay) {
        shownDay = day;
        const old = dayMat.map; dayMat.map = dayTex(day); dayMat.needsUpdate = true; old?.dispose();
      }
    },
    step(dt: number) {
      jump = Math.max(0, jump - dt * 5);
      body.position.y = Math.sin(jump * Math.PI) * 0.006;
      body.rotation.z = Math.sin(jump * 9) * jump * 0.05;
      if (rattle > 0) {
        rattle -= dt;
        const s = Math.sin(performance.now() * 0.09);
        hammer.rotation.z = s * 0.5;
        body.position.x = s * 0.0012; body.rotation.z += s * 0.02;
        for (const b of bells) b.position.z = -0.004 + Math.abs(s) * 0.0008;
      } else hammer.rotation.z = 0;
    },
    bump() { jump = 1; },
    ring(secs: number) { rattle = secs; },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) { (m as THREE.MeshStandardMaterial).map?.dispose?.(); m.dispose(); }
      for (const t of texs) t.dispose();
    },
  };
}
