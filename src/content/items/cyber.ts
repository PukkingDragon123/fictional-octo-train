// Items stream — CYBERWARE: the boxed parts (found, crafted, fitted at an
// operating table or with a surgery rig), the field surgery rig itself and
// machine oil for rusting scrap. Rules: src/survival/cyber.ts; models are
// shared with the rig through src/entities/cyberGear.ts.
import { defItem } from '../../items/item';
import { lootTable } from '../../items/loot';
import './loot_tables';
import { tex, ph, rp, MB } from './_kit';
import { CT, buildLoosePart } from '../../entities/cyberGear';
import { rigDims } from '../../entities/humanModel';
import { CYBER_PARTS, CyberSlot } from '../../survival/cyberParts';

// ---------------------------------------------------------------- textures
tex(CT.rust, 8, 8, (pc) => {
  const R = [0x3a2014, 0x5a2e18, 0x7a3e1c, 0x9a5426, 0xb86e34, 0x6a4a3a];
  pc.each((x, y) => { const v = ph(x >> 1, y >> 1, 301) * 0.6 + ph(x, y, 302) * 0.4; pc.set(x, y, R[Math.min(5, Math.floor(v * 5.2))]); });
  pc.set(2, 3, 0x2a160e); pc.set(6, 6, 0x2a160e); pc.set(5, 1, 0xd8904a);
}, true);
tex(CT.paint, 8, 8, (pc) => {
  // yellow machine paint flaking off rust
  pc.each((x, y) => { const v = ph(x, y >> 1, 311); pc.set(x, y, v < 0.22 ? 0x7a3e1c : v < 0.3 ? 0x5a2e18 : y === 0 ? 0xe8c040 : 0xd0a630); });
  pc.set(1, 6, 0x9a5426); pc.set(6, 2, 0xf0d060);
}, true);
tex(CT.hazard, 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ((x + y) >> 2) % 2 ? 0x1a1814 : 0xe8b828)); pc.set(3, 3, 0x7a3e1c); }, true);
tex(CT.pipe, 8, 8, (pc) => {
  const R = rp(0x8a9098, 5, 0.45);
  pc.each((x, y) => pc.set(x, y, R[x < 2 ? 1 : x < 5 ? 3 : 2]));
  for (let y = 0; y < 8; y++) if (ph(1, y, 321) < 0.35) pc.set(5, y, 0x9a5426);
  pc.set(6, 2, 0x7a3e1c); pc.set(6, 3, 0x9a5426);
}, true);
tex(CT.chrome, 8, 8, (pc) => {
  const C = [0x4a5260, 0x8a96a8, 0xd8e4f0, 0xffffff, 0xa8b4c4, 0x606878, 0x9aa6b8, 0xc8d4e4];
  pc.each((x, y) => pc.set(x, y, C[x]));
}, true);
tex(CT.shell, 8, 8, (pc) => {
  pc.fill(0xe8eaec);
  pc.hline(0, 7, 0, 0xffffff); pc.hline(0, 7, 7, 0xb8bcc4);
  pc.vline(5, 1, 6, 0xc8ccd4); pc.set(2, 3, 0xd8dce0); pc.set(6, 5, 0xdadde2);
}, true);
tex(CT.black, 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 2 ? 0x22242a : 0x2a2c34));
  pc.hline(0, 7, 3, 0x16181c); pc.set(1, 1, 0x3a3e48); pc.set(6, 6, 0x3a3e48);
}, true);
tex(CT.hose, 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y % 2 ? 0x18181a : 0x303034)); pc.set(2, 2, 0x3c3c42); }, true);
tex(CT.glow, 4, 4, (pc) => { pc.fill(0xffffff); pc.set(0, 0, 0xd0d0d0); pc.set(3, 3, 0xd0d0d0); }, true);
tex(CT.teeth, 8, 4, (pc) => {
  pc.fill(0x2a2a2e);
  for (let x = 0; x < 8; x += 2) { pc.vline(x, 0, 3, 0xd8dce0); pc.set(x, 0, 0xffffff); pc.set(x + 1, 3, 0x8a9098); }
}, true);
tex(CT.lens, 8, 8, (pc) => {
  pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); pc.set(x, y, d < 1.2 ? 0xffffff : d < 2.4 ? 0xe0e0e0 : d < 3.3 ? 0xa0a0a0 : 0x606060); });
  pc.set(2, 2, 0xffffff);
});
tex(CT.wires, 8, 8, (pc) => {
  const W = [0xc02020, 0x2050c0, 0xe0c020, 0x20a040, 0x18181a, 0xe0e0e0, 0xc06020, 0x18181a];
  pc.each((x, y) => pc.set(x, y, (y + (x >> 2)) % 3 === 0 ? 0x101012 : W[x]));
}, true);
tex(CT.steel, 8, 8, (pc) => {
  const R = rp(0x5a606a, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[1 + Math.floor(ph(x >> 2, y, 331) * 2.5)]));
  pc.set(1, 1, 0xb8c0cc); pc.set(6, 1, 0xb8c0cc); pc.set(1, 6, 0xb8c0cc); pc.set(6, 6, 0xb8c0cc);
}, true);
tex('i_cy_case', 12, 8, (pc) => {
  // a dented aluminium flight case with a stencilled cross and hazard tape
  pc.fill(0x9aa2ac);
  pc.strokeRect(0, 0, 12, 8, 0x5a606a);
  pc.rect(1, 3, 10, 2, 0xe8b828);
  for (let x = 1; x < 11; x += 2) pc.rect(x, 3, 1, 2, 0x1a1814);
  pc.rect(5, 1, 2, 6, 0xd03030); pc.rect(4, 3, 4, 2, 0xd03030);
  pc.set(2, 1, 0xc8d0d8); pc.set(9, 6, 0x6a707a);
});
tex('i_cy_oilcan', 8, 10, (pc) => {
  pc.fill(0x2a6a3a);
  pc.rect(0, 3, 8, 4, 0xe8e0c8);
  pc.hline(1, 6, 4, 0x1a1a1a); pc.hline(1, 4, 5, 0x1a1a1a);
  pc.hline(0, 7, 0, 0x4a9a5a); pc.set(6, 8, 0x1a4a2a);
});

// ---------------------------------------------------------------- the parts (boxed)
const REST = rigDims({ height: 1, build: 'average', bodyShape: 0.3 } as any);
const SLOT_FOR: Record<string, CyberSlot> = { arm: 'arm_r', hand: 'hand_r', leg: 'leg_r', eyes: 'eyes', jaw: 'jaw', spine: 'spine', skin: 'skin' };
/** lying on the floor: limbs along +x, head and torso hardware on its back */
function partModel(key: string, kind: string) {
  const slot = SLOT_FOR[kind];
  return (mb: MB) => {
    if (kind === 'arm' || kind === 'hand' || kind === 'leg') {
      mb.push().translate(kind === 'leg' ? -0.45 : kind === 'arm' ? -0.32 : -0.06, kind === 'leg' ? 0.07 : 0.05, 0).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      buildLoosePart(mb, key, slot, REST);
      mb.pop();
    } else {
      const lift = kind === 'spine' || kind === 'skin' ? -1.2 : -1.55;
      mb.push().translate(0, 0.04, 0).rotateX(-Math.PI / 2).translate(0, lift, 0);
      buildLoosePart(mb, key, slot, REST);
      mb.pop();
    }
  };
}
for (const d of CYBER_PARTS) {
  defItem({
    key: d.item, name: d.name, cat: 'misc', weight: d.weight, rare: d.tier > 0, tags: ['cyberware', 'metal'], noStack: true,
    desc: `${d.desc}\n+ ${d.good}\n− ${d.bad}\nFit it at an operating table or with a surgery rig (right-click yourself → Cyberware).`,
    value: 60 + d.tier * 90,
    model: partModel(d.key, d.kind),
  });
}

defItem({
  key: 'surgery_rig', name: 'Field Surgery Rig', cat: 'tool', weight: 6.5, tags: ['tool', 'surgery', 'metal'], noStack: true,
  desc: 'A folding steel arm with a bone saw on one end and a bolt driver on the other, clamped to a case of sockets. With it you can take a limb off and put hardware on. Your own limb. Without anaesthetic.',
  value: 120,
  model: (mb) => {
    mb.box(0, 0, 0, 0.42, 0.14, 0.28, { all: 'i_cy_case', top: 'i_cy_case' }, { fit: true });
    mb.cylinder(0.12, 0.14, -0.06, 0.012, 0.22, 6, { sides: 'i_cy_steel', top: 'i_cy_steel', bottom: 'i_cy_steel' }, { fit: true });
    mb.push().translate(0.12, 0.36, -0.06).rotateZ(1.1);
    mb.box(0.09, -0.012, 0, 0.18, 0.024, 0.024, 'i_cy_black', { fit: true });
    mb.cylinderZ(0.19, 0.0, 0, 0.055, 0.008, 10, { sides: 'i_cy_chrome', top: 'i_cy_chrome', bottom: 'i_cy_chrome' }, { fit: true });
    mb.pop();
  },
});
defItem({
  key: 'machine_oil', name: 'Machine Oil', cat: 'material', weight: 0.5, uses: 1, tags: ['oil', 'lubricant'],
  desc: 'A squat green can with a long spout. Scrap joints stop squealing for a while.',
  value: 8,
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.045, 0.1, 8, { sides: 'i_cy_oilcan', top: 'i_cy_steel', bottom: 'i_cy_steel' }, { fit: true });
    mb.push().translate(0, 0.1, 0).rotateZ(-0.7);
    mb.cylinder(0, 0, 0, 0.007, 0.09, 5, { sides: 'i_cy_chrome', top: 'i_cy_chrome', bottom: 'i_cy_chrome' }, { fit: true, rTop: 0.003 });
    mb.pop();
  },
});

// ---------------------------------------------------------------- loot: where these turn up
function addLoot(table: string, entries: [string, number, number?, number?][]) {
  const t = lootTable(table);
  if (!t) return;
  for (const e of entries) if (!t.entries.some((x) => x[0] === e[0])) t.entries.push(e);
}
addLoot('garage_shelf', [['machine_oil', 2], ['cy_scrap_arm', 0.08], ['cy_scrap_leg', 0.08]]);
addLoot('tool_shelf', [['machine_oil', 1.5]]);
addLoot('store_hardware', [['machine_oil', 1.5]]);
addLoot('maintenance', [['machine_oil', 1], ['cy_vise_hand', 0.1], ['cy_tool_hand', 0.08]]);
addLoot('hospital_cabinet', [['cy_lamp_optic', 0.08], ['cy_servo_arm', 0.05], ['surgery_rig', 0.12]]);
addLoot('morgue', [['cy_trap_jaw', 0.15], ['cy_scrap_arm', 0.1], ['surgery_rig', 0.1]]);
addLoot('lab_cabinet', [['cy_ledger_optic', 0.1], ['cy_coil_leg', 0.06], ['cy_plate_dermis', 0.04]]);
addLoot('lab_bench', [['cy_servo_arm', 0.06], ['cy_gantry_spine', 0.04]]);
addLoot('server_room', [['cy_ledger_optic', 0.06]]);
addLoot('security_office', [['cy_piston_arm', 0.04]]);
addLoot('survivor_corpse', [['cy_scrap_arm', 0.12], ['cy_scrap_leg', 0.1]]);
