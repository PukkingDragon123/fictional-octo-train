// Items stream — LIMB LOSS: tourniquets, crutches, peg legs, hooks and proper
// prosthetics, the belt an improvised tourniquet starts from, and the
// severed limbs themselves (dropped where they come off; they rot).
// Rules live in src/survival/limbs.ts and limbSystem.ts; models are shared
// with the survivor rig through src/entities/limbGear.ts.
import { defItem } from '../../items/item';
import { lootTable } from '../../items/loot';
import './loot_tables';
import { tex, decal, rp, ph, T, MB } from './_kit';
import { limbItemModel, crutchItemModel, pegModel, hookModel, prostHandModel, prostLegModel, LimbItemKind, LT } from '../../entities/limbGear';

// ---------------------------------------------------------------- textures
tex(LT.skin, 8, 8, (pc) => {
  // dead skin: waxy grey-pink with purple pooling and a few veins
  const R = rp(0xc4aca2, 5, 0.42);
  pc.each((x, y) => {
    const v = ph(x >> 1, y >> 1, 61) * 0.7 + ph(x, y, 62) * 0.3;
    pc.set(x, y, v < 0.18 ? 0x9a7c86 : R[v < 0.5 ? 2 : v < 0.85 ? 3 : 4]);
  });
  pc.set(1, 5, 0x8a8aa0); pc.set(2, 6, 0x8a8aa0); pc.set(5, 1, 0x9a8a9c);
}, true);
tex(LT.nail, 6, 6, (pc) => {
  pc.fill(0xc4aca2);
  pc.rect(1, 1, 4, 4, 0xd8c8c0); pc.hline(1, 4, 1, 0xe8dcd4); pc.hline(1, 4, 4, 0xa89088);
}, false);
const cut = (rot: boolean) => (pc: any) => {
  // the cut face: skin rim, yellow fat, marbled muscle, white bone with marrow
  const C = rot ? { skin: 0x8a8060, fat: 0xa08a50, m0: 0x4a2a1a, m1: 0x6a3a22, bone: 0xc8bc98, marrow: 0x3a2018 } : { skin: 0xc8a090, fat: 0xe0c890, m0: 0x7a1414, m1: 0xa82a22, bone: 0xece4d0, marrow: 0x8a2a24 };
  pc.each((x: number, y: number) => {
    const d = Math.hypot(x - 4.5, y - 4.5) + (ph(x, y, 71) - 0.5) * 0.9;
    let c = C.skin;
    if (d < 4.2) c = C.fat;
    if (d < 3.5) c = ph(x, y, 72) < 0.35 ? C.m0 : C.m1;
    if (d < 1.6) c = C.bone;
    if (d < 0.8) c = C.marrow;
    pc.set(x, y, c);
  });
  if (!rot) { pc.set(3, 6, 0xd84a3a); pc.set(6, 3, 0xd84a3a); }
};
tex(LT.cut, 10, 10, cut(false));
tex(LT.cutRot, 10, 10, cut(true));
tex(LT.blood, 8, 8, (pc) => {
  const R = [0x4a0a0c, 0x6a1012, 0x841719, 0x9e2224];
  pc.each((x, y) => { const v = ph(x >> 1, y, 81) * 0.6 + (y / 8) * 0.5; pc.set(x, y, R[Math.min(3, Math.floor(v * 3))]); });
  pc.set(2, 1, 0xc0443a); pc.set(5, 2, 0xc0443a);
}, true);
tex(LT.raw, 8, 8, (pc) => {
  // a fresh stump end: wet red meat, a white bone, glistening highlights
  pc.each((x, y) => {
    const d = Math.hypot(x - 3.5, y - 3.5);
    let c = ph(x, y, 91) < 0.4 ? 0x7a1012 : 0xa01e1c;
    if (d > 3.3) c = 0xc06a5a;
    if (d < 1.3) c = 0xe8e0cc;
    if (d < 0.6) c = 0x8a2a24;
    pc.set(x, y, c);
  });
  pc.set(2, 5, 0xf06a5a); pc.set(5, 2, 0xf06a5a);
});
tex(LT.char, 8, 8, (pc) => {
  // cauterised: black crust, dark blood, blistered brown, a few angry red cracks
  pc.each((x, y) => {
    const v = ph(x >> 1, y >> 1, 101) * 0.6 + ph(x, y, 102) * 0.4;
    pc.set(x, y, v < 0.35 ? 0x1a1210 : v < 0.6 ? 0x3a1a12 : v < 0.85 ? 0x5a2a18 : 0x7a4a2a);
  });
  pc.set(2, 3, 0xb0301e); pc.set(3, 3, 0xd04a2a); pc.set(5, 6, 0xb0301e); pc.set(6, 1, 0x9a6a4a);
}, true);
tex(LT.scar, 8, 8, (pc) => {
  // neutral skin (tinted by the survivor's own colour) with a puckered, stitched seam
  pc.each((x, y) => pc.set(x, y, ph(x >> 1, y >> 1, 111) < 0.2 ? 0xe2d6d0 : 0xf0e6e0));
  pc.hline(0, 7, 4, 0xc89a96); pc.hline(0, 7, 3, 0xdcb8b2);
  for (let x = 1; x < 8; x += 2) { pc.set(x, 3, 0x3a2a30); pc.set(x, 5, 0x3a2a30); }
}, true);
tex(LT.strap, 8, 4, (pc) => {
  // black nylon webbing with velcro rows and stitching
  pc.fill(0x1e1e22);
  pc.hline(0, 7, 0, 0x2e2e34); pc.hline(0, 7, 3, 0x141418);
  for (let x = 0; x < 8; x += 2) pc.set(x, 1, 0x34343a);
  for (let x = 1; x < 8; x += 3) pc.set(x, 2, 0x4a4a52);
}, true);
tex(LT.tqRod, 6, 4, (pc) => { pc.fill(0xb8302a); pc.hline(0, 5, 0, 0xe0503a); pc.hline(0, 5, 3, 0x7a1e1a); pc.set(2, 1, 0xf07050); });
tex(LT.belt, 8, 4, (pc) => {
  const R = rp(0x6a4228, 4, 0.4);
  pc.each((x, y) => pc.set(x, y, R[1 + (ph(x, y, 121) < 0.3 ? 1 : 0)]));
  for (let x = 0; x < 8; x += 2) { pc.set(x, 0, R[3]); pc.set(x + 1, 3, R[0]); }
}, true);
tex(LT.alu, 4, 8, (pc) => {
  // brushed aluminium tube with adjustment holes
  pc.each((x, y) => pc.set(x, y, x === 0 ? 0xe2e8ee : x === 3 ? 0x8a929a : 0xb8c0c8));
  pc.set(1, 2, 0x3a3e44); pc.set(1, 6, 0x3a3e44);
}, true);
tex(LT.foam, 6, 6, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 131) < 0.25 ? 0x56565c : 0x3e3e44)), true);
tex(LT.wood, 6, 12, (pc) => {
  // oiled oak, darkened with handling
  const R = rp(0x8a5a34, 5, 0.4);
  pc.each((x, y) => { const g = Math.sin((x + ph(0, y >> 2, 141) * 2) * 1.6) * 0.5 + 0.5; pc.set(x, y, R[1 + Math.round(g * 2 + (ph(x, y, 142) - 0.5) * 0.5)]); });
  pc.set(2, 4, R[0]); pc.set(3, 4, R[0]);
}, true);
tex(LT.shell, 8, 8, (pc) => {
  // moulded beige plastic shell with a parting seam
  pc.each((x, y) => pc.set(x, y, x === 0 ? 0xf2e2cc : x === 7 ? 0xb8a088 : ph(x, y, 151) < 0.1 ? 0xd2bca2 : 0xdcc6ac));
  pc.vline(4, 0, 7, 0xc4ac92);
}, true);
tex(LT.carbon, 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ((x >> 1) + (y >> 1)) % 2 === 0 ? (y % 2 ? 0x2a2c30 : 0x3a3e44) : (x % 2 ? 0x1e2024 : 0x30343a))), true);

// tourniquet / belt / packaging decals
const D_TQ_COIL = decal('i_tq_coil', 12, 8, (pc) => {
  pc.fill(0x1e1e22);
  pc.strokeRect(0, 0, 12, 8, 0x2e2e34);
  pc.rect(2, 3, 8, 2, 0xb8302a); pc.hline(2, 9, 3, 0xe0503a);
  pc.rect(10, 1, 1, 6, 0x6a6a72);
});

// ---------------------------------------------------------------- tourniquets
const coil = (mb: MB, strap: string, rodTex: string, rodColor = 0xffffff) => {
  // a coiled strap (rectangular loop) with the windlass rod lying across it
  for (const [x, z, w, d] of [[0, -0.035, 0.12, 0.012], [0, 0.035, 0.12, 0.012], [-0.055, 0, 0.012, 0.07], [0.055, 0, 0.012, 0.07]] as const) mb.box(x, 0, z, w, 0.03, d, strap, { fit: true });
  mb.box(0.012, 0, 0, 0.1, 0.03, 0.06, strap, { fit: true, color: 0xb0b0b0 });
  mb.push().translate(0, 0.036, 0).rotateY(0.5);
  mb.box(0, -0.006, 0, 0.11, 0.012, 0.012, rodTex, { fit: true, color: rodColor });
  mb.pop();
};
defItem({
  key: 'tourniquet', name: 'Tourniquet', cat: 'medical', weight: 0.08, tags: ['tourniquet'],
  medical: { type: 'bandage', power: 0.5 },
  desc: 'Windlass tourniquet. Cinch it above a wound that is pumping blood and twist until it stops. Leave it on too long and the flesh under it dies: get the wound closed, then take it off.',
  model: (mb) => { coil(mb, LT.strap, LT.tqRod); mb.box(0, 0.031, 0, 0.06, 0.001, 0.04, D_TQ_COIL, { fit: true }); },
});
defItem({
  key: 'tourniquet_improv', name: 'Improvised Tourniquet', cat: 'medical', weight: 0.15, tags: ['tourniquet'],
  medical: { type: 'bandage', power: 0.3 },
  desc: 'A strap and a stick to twist it tight. Ugly, painful, and it works.',
  model: (mb) => coil(mb, LT.belt, T.wood, 0xc8a070),
});
defItem({
  key: 'belt', name: 'Leather Belt', cat: 'misc', weight: 0.25, tags: ['belt', 'leather', 'strap'],
  desc: 'Holds your trousers up. Holds a lot of other things down. Twist it round a stick and it holds blood in.',
  model: (mb) => {
    for (const [x, z, w, d] of [[0, -0.05, 0.16, 0.035], [0, 0.05, 0.16, 0.035], [-0.08, 0, 0.035, 0.1], [0.08, 0, 0.035, 0.1]] as const) mb.box(x, 0, z, w, 0.005, d, LT.belt, { fit: true });
    mb.box(0.06, 0.004, 0.05, 0.03, 0.006, 0.04, T.steel, { fit: true, color: 0xd8c070 });
  },
});

// ---------------------------------------------------------------- crutches
defItem({
  key: 'crutch', name: 'Elbow Crutch', cat: 'tool', weight: 1.0, tags: ['crutch', 'tool'],
  desc: 'Aluminium forearm crutch. Hold it in the hand on the side of your good leg (or one in each) and you can walk again, slowly. Makes a poor club.',
  weapon: { kind: 'blunt', dmg: [3, 6], range: 1.1, speed: 1.0, endurance: 0.05, crit: 0.03, knock: 0.6, durability: 60, noise: 6 },
  model: (mb) => crutchItemModel(mb, false),
});
defItem({
  key: 'crutch_wood', name: 'Wooden Crutch', cat: 'tool', weight: 1.4, tags: ['crutch', 'tool', 'wood'],
  desc: 'Planks, nails and a padded cuff. It creaks, it holds.',
  weapon: { kind: 'blunt', dmg: [3, 7], range: 1.1, speed: 0.9, endurance: 0.06, crit: 0.03, knock: 0.7, durability: 35, noise: 6 },
  model: (mb) => crutchItemModel(mb, true),
});

// ---------------------------------------------------------------- prosthetics (worn: Wear straps them onto the stump that fits)
const prost = (key: string, name: string, slot: string, weight: number, desc: string, model: (mb: MB) => void, rare = false) => defItem({
  key, name, cat: 'clothing', weight, rare, tags: ['prosthetic'], desc,
  // no visible garment: the rig draws prosthetics itself (humanRig limb gear)
  clothing: { slot, covers: [], insulation: 0, wind: 0, bite: 0, scratch: 0, water: 0, look: { part: 'prosthetic' as any, tex: 'none', color: 0 } },
  model,
});
const lying = (fn: (mb: MB) => void, h: number) => (mb: MB) => { mb.push().translate(0, h, 0).rotateZ(Math.PI / 2); fn(mb); mb.pop(); };
prost('peg_leg', 'Peg Leg', 'prosth_leg', 1.6,
  'A turned post in a leather cup, strapped above the stump. Replaces a lost foot or lower leg: stiff, loud, but you are walking. Needs a stump that has started to heal.',
  lying((mb) => pegModel(mb, 0.05, 0.45), 0.065));
prost('hook_hand', 'Hook Hand', 'prosth_arm', 0.5,
  'A steel hook on a laced cuff. It cannot hold a weapon, but it can steady one, carry a bag and turn a page.',
  lying((mb) => hookModel(mb, 0.033), 0.045));
prost('prosthetic_leg', 'Prosthetic Leg', 'prosth_leg', 2.4,
  'A real one: carbon socket, titanium pylon, a foot that rolls. Fits any leg stump, even above the knee. You could almost run.',
  lying((mb) => prostLegModel(mb, 0.05, 0.4, true, -0.45), 0.07), true);
prost('prosthetic_hand', 'Prosthetic Hand', 'prosth_arm', 0.7,
  'A moulded hand on a shell socket, fingers that lock around a grip. Fits a lost hand or forearm. Almost as good as the old one.',
  lying((mb) => prostHandModel(mb, 0.033), 0.045), true);

// ---------------------------------------------------------------- severed limbs
const LIMBS: [LimbItemKind, string, number][] = [
  ['hand', 'Severed Hand', 0.45], ['forearm', 'Severed Forearm', 1.7], ['arm', 'Severed Arm', 3.9],
  ['foot', 'Severed Foot', 1.1], ['shin', 'Severed Lower Leg', 4.3], ['leg', 'Severed Leg', 11.5],
];
for (const [k, name, w] of LIMBS) {
  defItem({
    key: 'limb_' + k, name, cat: 'corpse', weight: w, tags: ['limb', 'gore'], noStack: true,
    desc: 'It used to be somebody\'s. It is going grey, and soon it will smell. Nothing here can put it back.',
    model: (mb) => limbItemModel(mb, k, false),
  });
  // the same limb after a day or two (model swapped in by the limb system; never spawned on its own)
  defItem({ key: 'limb_' + k + '_rot', name: 'Rotting ' + name.replace('Severed ', ''), cat: 'corpse', weight: w, tags: ['limb', 'gore'], noStack: true, model: (mb) => limbItemModel(mb, k, true) });
}

// ---------------------------------------------------------------- loot: where these turn up
function addLoot(table: string, entries: [string, number, number?, number?][]) {
  const t = lootTable(table);
  if (!t) return;
  for (const e of entries) if (!t.entries.some((x) => x[0] === e[0])) t.entries.push(e);
}
addLoot('hospital_cabinet', [['tourniquet', 3], ['crutch', 1.5], ['prosthetic_hand', 0.25], ['prosthetic_leg', 0.2]]);
addLoot('hospital_pharmacy', [['tourniquet', 1]]);
addLoot('morgue', [['limb_hand', 0.4], ['limb_foot', 0.3], ['prosthetic_leg', 0.3], ['prosthetic_hand', 0.3]]);
addLoot('lab_cabinet', [['prosthetic_hand', 0.35], ['prosthetic_leg', 0.25]]);
addLoot('nurse_office', [['tourniquet', 1.2], ['crutch', 0.8]]);
addLoot('contents_first_aid_kit', [['tourniquet', 1]]);
addLoot('lifeguard', [['tourniquet', 1]]);
addLoot('security_office', [['tourniquet', 1]]);
addLoot('wardrobe', [['belt', 3]]);
addLoot('bedroom_dresser', [['belt', 2]]);
addLoot('store_clothing', [['belt', 3]]);
addLoot('gym_locker', [['belt', 1]]);
addLoot('survivor_corpse', [['belt', 2], ['tourniquet_improv', 1]]);
addLoot('creature_nest', [['limb_hand', 0.6], ['limb_foot', 0.5]]);
