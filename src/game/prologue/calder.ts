// Dr. Iris Calder's body for the cutscenes and the handler's projection: the
// menu guide's researcher (src/entities/researcher.ts) with her own badge,
// glasses and make-up, built on whatever material the scene wants (the
// intake stage's rim-lit stageMat, the hologram's phosphor light).
import type * as THREE from 'three';
import { Researcher, researcherAppearance, researcherOutfit } from '../../entities/researcher';

export function calderRig(material?: THREE.Material): Researcher {
  const r = new Researcher(researcherAppearance({ glasses: true }), material);
  r.ggOverrides = {
    bust: 0.8, badge: { col: [52, 104, 150], name: 'Dr. Iris Calder' },
    makeup: { liner: 0.45, lash: 0.85, shadow: [176, 132, 136], blush: [228, 132, 136], highlight: 0.35 },
    lipstick: 0xc0586a, blush: 0.32, hairVolume: 1.12, eyeH: 1.08, glasses: { kind: 'rect', col: [70, 46, 40], thick: 1 },
  } as typeof r.ggOverrides;
  r.setOutfit(researcherOutfit({ glasses: true }));
  r.setExpression('smile');
  return r;
}
