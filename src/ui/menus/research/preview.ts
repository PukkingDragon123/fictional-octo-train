// THE LATTICE'S ACTION FEED (round 25): a live 3D scene of a unit doing what the inspected node is about, shown on
// the machine-kit monitor in the lattice's bay (research/lattice.ts) and, in 3D mode, on the whole screen.
//   a swing on a training dummy (every weapon mastery and move: the moves are HumanRig clips, src/combat/anims.ts)
//   suturing an arm on a steel table         welding a barricade across a doorway       work at the bench
//   tending planters under a grow light      feeding (or milking) a moon calf in a pen  cooking at an enamel stove
//   rummaging a store room                   the research bench (microscope, burner, glassware)
// Each set is a small lit room: the lab's own faceted kit (scene/pixtex.ts materials), the Poly Haven props
// (props/glb.ts, the same files as props/labProps.ts), the item models (items/itemMeshes.ts) in hands and on
// shelves, HumanRig people dressed by the game's own rules (scene/staff.ts outfitOf). It renders through the menu's
// own post pass (monitor/stage.ts PostView): the outline, the AO, the bloom and the grade the rooms have.
//   new ActionPreview(mats)     one per open lattice; show(shotFor(node)); update(dt, t); render(r, t, low)
//   orbit(dx, dy) / zoom(k)     the 3D mode's drag and wheel
//   dispose()                   every set, rig, geometry and target (the lattice calls it on close)
// The sets are built the first time they are shown and kept while the lattice is open. Every set has the same
// lights (one hemisphere, one shadowed key spot, two points), so swapping sets never recompiles a shader.
import * as THREE from 'three';
import { PostView, type Grade, type StageView } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, bolt, gem, tube, lathe, C, glowCard, gameSound, Wobble } from '../monitor/props';
import type { FMats } from '../scene/pixtex';
import { createPreviewRig, randomAppearance, type HumanRig } from '../../../entities/humanRig';
import { randomLooks } from '../../../entities/humanLooks';
import { outfitOf } from '../scene/staff';
import { makeHeldMesh } from '../../../items/itemMeshes';
import { hasItemDef } from '../../../items/item';
import { loadProp } from '../props/glb';
import { species } from '../../../creatures/registry';
import { objDef, objectGeometry } from '../../../world/objects';
import { worldMaterial } from '../../../gfx/materials';
import type { TileObject } from '../../../world/zone';
import type { TreeNode } from '../../../game/unitTree';
// the combat clips (cb_*) are registered with the animator when this loads; the menu does not load the fight otherwise
import '../../../combat/anims';

export type SetKey = 'combat' | 'medic' | 'weld' | 'bench' | 'cook' | 'garden' | 'pen' | 'store' | 'lab' | 'grow';
/** what the unit does: an action clip (the animator's names), its length, the rest between, and where it lands */
export interface Act { name: string; dur: number; rest?: number; full?: string; hit?: number; two?: boolean; weapon?: string; alt?: string }
export interface Shot { set: SetKey; act: Act; held?: string[]; heldL?: string[]; variant?: string }

const DEG = Math.PI / 180;
const URL_OF = (a: string) => `${import.meta.env.BASE_URL}props/lab/${a}.glb${import.meta.env.VITE_SANDBOXED ? '.txt' : ''}`;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const pick = (keys?: string[]) => keys?.find((k) => hasItemDef(k));

// ================================================================== what each node shows
/** scenes registered for nodes by other modules (the farming / livestock / crafting work): checked first */
const SHOTS = new Map<string, Shot>();
/** HOOK: show this scene on the lattice's monitor for a node key, e.g. previewShot('pf_hd_milk', { set: 'pen', act: { name: 'craft', dur: 1.6, full: 'kneel' }, variant: 'milk' }) */
export function previewShot(key: string, shot: Shot) { SHOTS.set(key, shot); }
// round 25, the farm and the yard (src/game/economy/trades.ts, registry.ts HUSBANDRY): their nodes' scenes
// garden variants: 'harvest' a bed of ripe exit-sign peppers picked by hand, 'hydro' a fluorescent hydroponic tray of
// strip cress, 'pest' a mint bed crawling with lint mites being sprayed; pen variants: 'hen' pallid hens pecking in the
// straw, 'egg' the incubator among them, 'grub' carpet grubs on their silk; cook 'pickle' the larder's jars and the
// cheese; lab 'herbal' bluecaps and tinctures on the bench, 'specimen' a scan of an egg and a cap under the lamp.
const FARM_SHOTS: [string, Shot][] = [
  ['pf_bt_yield', { set: 'garden', act: { name: 'harvest', dur: 1.8, rest: 0.4 }, variant: 'harvest' }],
  ['pf_bt_pest', { set: 'garden', act: { name: 'shear', dur: 2.2, rest: 0.6 }, held: ['mite_spray'], variant: 'pest' }],
  ['pf_bt_hydro', { set: 'garden', act: { name: 'harvest', dur: 1.8, rest: 0.5 }, variant: 'hydro' }],
  ['pf_bt_herbal', { set: 'lab', act: { name: 'mix', dur: 2.4 }, held: ['hush_mint'], variant: 'herbal' }],
  ['pf_bt_seeds', { set: 'garden', act: { name: 'harvest', dur: 1.8, rest: 0.4 }, variant: 'harvest' }],
  ['pf_hd_milk', { set: 'pen', act: { name: 'milk', dur: 2.4, rest: 0.2 }, variant: 'milk' }],
  ['pf_hd_breed', { set: 'pen', act: { name: 'harvest', dur: 1.8, rest: 0.6 }, variant: 'egg' }],
  ['pf_hd_shear', { set: 'pen', act: { name: 'shear', dur: 2.2, rest: 0.4 }, held: ['shears'], variant: 'hen' }],
  ['pf_hd_incub', { set: 'pen', act: { name: 'harvest', dur: 1.8, rest: 0.6 }, variant: 'egg' }],
  ['pf_hd_water', { set: 'pen', act: { name: 'harvest', dur: 1.8, rest: 0.5 }, variant: 'grub' }],
  ['pf_hd_hide', { set: 'pen', act: { name: 'shear', dur: 2.2, rest: 0.4 }, held: ['shears'], variant: 'grub' }],
  ['pf_ck_pickle', { set: 'cook', act: { name: 'mix', dur: 2.2 }, held: ['exit_pepper'], variant: 'pickle' }],
  ['pf_ck_cheese', { set: 'cook', act: { name: 'saw', dur: 1.4 }, held: ['knife_kitchen'], variant: 'pickle' }],
  ['pf_ck_larder', { set: 'cook', act: { name: 'mix', dur: 2.2 }, held: ['pickle_jar'], variant: 'pickle' }],
  ['pf_sc_forage', { set: 'garden', act: { name: 'harvest', dur: 1.8, rest: 0.4 }, variant: 'pest' }],
  ['pf_rs_specimen', { set: 'lab', act: { name: 'scanner', dur: 3 }, held: ['data_probe', 'multimeter'], variant: 'specimen' }],
  ['pf_rs_codex', { set: 'lab', act: { name: 'scanner', dur: 3 }, held: ['data_probe', 'multimeter'], variant: 'specimen' }],
  ['pf_c_crude', { set: 'combat', act: { name: 'cb_club', dur: 0.48, rest: 0.9, hit: 0.5, weapon: 'blunt', alt: 'swing' }, held: ['spiked_club', 'bat'] }],
  ['hb_hydro', { set: 'garden', act: { name: 'harvest', dur: 1.8, rest: 0.5 }, variant: 'hydro' }],
  ['hb_ipm', { set: 'garden', act: { name: 'shear', dur: 2.2, rest: 0.6 }, held: ['mite_spray'], variant: 'pest' }],
  ['hb_incubate', { set: 'pen', act: { name: 'harvest', dur: 1.8, rest: 0.6 }, variant: 'egg' }],
  ['hb_breeding', { set: 'pen', act: { name: 'pour', dur: 2.6 }, held: ['feed_sack', 'bucket'], variant: 'hen' }],
  ['bp_hydro_tray', { set: 'garden', act: { name: 'harvest', dur: 1.8, rest: 0.5 }, variant: 'hydro' }],
];
// the grow room is its own set (bright tubes, a hydroponic tray, beds at every stage): the garden variants play there
for (const [k, sh] of FARM_SHOTS) previewShot(k, sh.set === 'garden' ? { ...sh, set: 'grow', act: sh.variant === 'hydro' ? { name: 'craft', dur: 2.2 } : sh.act } : sh);
/** the scene for a lattice node: its trade (or research branch), its lane, its key */
export function shotFor(n: TreeNode): Shot {
  const k = n.key, br = n.branch;
  const reg = SHOTS.get(k);
  if (reg) return reg;
  const combat = (name: string, dur: number, hit: number, held?: string[], o: Partial<Act> = {}, variant?: string): Shot =>
    ({ set: 'combat', act: { name, dur, rest: 0.9, hit, ...o }, held, variant });
  if (br === 'p_combat') {
    if (k === 'pf_m_blunt') return combat('cb_club', 0.48, 0.5, ['bat', 'crowbar', 'pipe'], { weapon: 'blunt', alt: 'swing' });
    if (k === 'pf_m_blade') return combat('cb_cut', 0.34, 0.36, ['machete', 'knife_kitchen'], { weapon: 'blade' });
    if (k === 'pf_m_improv') return combat('cb_bash', 0.62, 0.52, ['chair_leg', 'plank', 'pipe'], { weapon: 'blunt', two: true });
    if (k === 'pf_m_thrown') return combat('throw', 0.6, 0.45, ['brick', 'bottle'], { rest: 1.2, weapon: 'thrown' }, 'throw');
    if (k === 'pf_mv_overhead') return combat('cb_overhead', 0.66, 0.56, ['sledgehammer', 'crowbar', 'bat'], { weapon: 'blunt', two: true, rest: 1.1 });
    if (k === 'pf_mv_kick') return combat('cb_shove_kick', 0.62, 0.5, undefined, { weapon: 'unarmed' });
    if (k === 'pf_mv_counter') return combat('cb_counter', 0.44, 0.35, ['machete', 'knife_kitchen'], { weapon: 'blade', rest: 1.1 });
    if (k === 'pf_mv_finisher') return combat('cb_finisher', 0.92, 0.52, ['crowbar', 'bat'], { weapon: 'blunt', two: true, rest: 1.2 }, 'down');
    return combat('cb_jab', 0.17, 0.45, undefined, { rest: 0.12, weapon: 'unarmed', alt: 'cb_jab2' }, 'bag');
  }
  if (br === 'p_medic' || br === 'chip' || br === 'limb') return { set: 'medic', act: { name: 'stitch', dur: 2.4, full: 'sit' }, held: ['needle', 'scalpel'] };
  if (br === 'p_engineer' || br === 'build' || br === 'matter') {
    if (n.row >= 2 || /bench|craft|jig|belt/.test(k)) return { set: 'bench', act: { name: 'craft', dur: 2.2 }, held: ['screwdriver', 'wrench'] };
    return { set: 'weld', act: { name: 'craft', dur: 2.6, full: 'kneel' }, held: ['welding_torch', 'blowtorch', 'screwdriver'] };
  }
  if (br === 'p_cook') return /cleaver|larder/.test(k) ? { set: 'cook', act: { name: 'saw', dur: 1.4 }, held: ['knife_kitchen'], variant: 'board' } : { set: 'cook', act: { name: 'cook', dur: 2.2 }, held: ['pan', 'frying_pan', 'pot'] };
  if (br === 'recipe') return n.row >= 8 ? { set: 'cook', act: { name: 'cook', dur: 2.2 }, held: ['pan', 'frying_pan', 'pot'] } : { set: 'bench', act: { name: 'craft', dur: 2.2 }, held: ['screwdriver', 'wrench'] };
  if (br === 'p_botanist' || br === 'farm') {
    if (br === 'farm' && /live|animal|pen|coop|hutch|milk|egg|feed/i.test(k + ' ' + n.title)) return { set: 'pen', act: { name: 'pour', dur: 2.6 }, held: ['bucket'] };
    return /forage|calm/.test(k) ? { set: 'garden', act: { name: 'dig', dur: 1.8, full: 'kneel' }, held: ['trowel', 'knife_kitchen'] } : { set: 'garden', act: { name: 'pour', dur: 2.8 }, held: ['watering_can', 'water_bottle'] };
  }
  if (br === 'p_handler') return /milk|breed/.test(k) ? { set: 'pen', act: { name: 'craft', dur: 1.6, full: 'kneel' }, held: [], variant: 'milk' } : { set: 'pen', act: { name: 'pour', dur: 2.6 }, held: ['bucket'] };
  if (br === 'p_scavenger' || br === 'survival') return { set: 'store', act: { name: 'loot', dur: 1.8 }, heldL: ['flashlight'] };
  if (br === 'device') return { set: 'lab', act: { name: 'scanner', dur: 3 }, held: ['data_probe', 'multimeter'] };
  if (br === 'design') return { set: 'store', act: { name: 'emote:flex', dur: 3 } };
  return { set: 'lab', act: { name: k.endsWith('focus') || k.endsWith('lucid') ? 'read' : 'mix', dur: 2.6 }, held: ['notebook'] };
}

// ================================================================== the sets
interface SetV {
  key: SetKey; g: THREE.Group;
  /** where the unit stands and faces (yaw), the camera's look-at and its offset from it */
  at: THREE.Vector3; yaw: number; look: THREE.Vector3; cam: THREE.Vector3; fov: number;
  /** the practical light (a weld arc, a burner, a grow lamp) and how it moves */
  prac: THREE.PointLight; pracK: (t: number, on: number) => number; pracBase: number;
  tick?: (dt: number, t: number, hit: number, act: number) => void;
  /** a training dummy's torso (combat) */
  dummy?: { g: THREE.Group; w: Wobble; down: THREE.Group; bag: THREE.Group };
  patient?: { at: THREE.Vector3; yaw: number };
  props: THREE.Object3D[];
  /** round 25: the set's own framing, restored when a variant has moved it; and each variant's extra props */
  base?: { at: THREE.Vector3; yaw: number; look: THREE.Vector3; cam: THREE.Vector3 };
  vp?: Map<string, THREE.Group>;
}

// ================================================================== variants (round 25: the farm and the yard)
type V2 = [number, number];
interface VariantDef {
  /** the unit's spot and facing, the camera's look-at and offset */
  at?: V2; yaw?: number; look?: [number, number, number]; cam?: [number, number, number];
  /** world objects (their own models, src/content/furniture) placed in the set: key, state, x, z, turn (quarter turns) */
  objs?: [string, Record<string, unknown>, number, number, number?][];
  /** item models on surfaces: keys (first defined), position, rotation */
  items?: [string[], [number, number, number], [number, number, number]?, number?][];
  /** the animals in the pen */
  beasts?: 'pale_hen' | 'carpet_grub' | 'moon_calf';
}
const VARIANTS: Record<string, VariantDef> = {
  'grow:harvest': { at: [-1.64, 0.3], yaw: Math.PI / 2, look: [-0.95, 0.62, 0.15], cam: [1.15, 0.72, 2.05] },
  'grow:pest': { at: [-0.12, 0.45], yaw: Math.PI / 2, look: [0.3, 0.75, 0.35], cam: [0.75, 0.6, 2.0] },
  'grow:hydro': { at: [0.5, -0.7], yaw: Math.PI / 2, look: [0.95, 1.0, -0.6], cam: [-0.6, 0.55, 2.2] },
  'pen:hen': { beasts: 'pale_hen', at: [-0.32, -0.3], yaw: 0.05, look: [-0.2, 0.55, 0.0], cam: [0.55, 0.75, 2.3] },
  'pen:egg': { beasts: 'pale_hen', at: [0.3, -0.3], yaw: -0.1, look: [0.2, 0.5, 0.05], cam: [0.65, 0.85, 2.3],
    items: [[['incubator'], [0.28, 0.012, 0.25], [0, 0.3, 0], 1.3], [['pallid_egg'], [0.62, 0.03, 0.42], [0, 0, 0.2], 1.4], [['feed_sack'], [1.15, 0, -1.05], [0, -0.3, 0]]] },
  'pen:grub': { beasts: 'carpet_grub', at: [-0.15, -0.45], yaw: 0.1, look: [0.0, 0.8, -0.1], cam: [0.55, 0.72, 2.75], items: [[['grub_silk'], [0.45, 0.03, 0.45], [0, 0.7, 0], 1.5], [['watering_can', 'bucket'], [1.1, 0, -0.95], [0, -0.6, 0]]] },
  'pen:milk': { beasts: 'moon_calf' },
  'cook:pickle': { at: [1.05, -0.78], yaw: 0, look: [0.95, 1.05, -0.2], cam: [0.25, 0.45, 1.6], items: [[['pickle_jar'], [1.3, 0.955, -0.12], [0, 0.3, 0], 1.6], [['moon_cheese'], [0.82, 0.975, 0.0], [0, 0.6, 0], 1.6], [['salted_eggs'], [1.5, 0.955, 0.02], [0, -0.4, 0], 1.6], [['potted_meat'], [1.12, 0.955, 0.08], [0, 0.2, 0], 1.6], [['exit_pepper'], [0.6, 0.975, -0.05], [0, 1.1, 0], 1.6]] },
  'lab:herbal': { look: [-0.05, 1.02, -0.3], cam: [0.6, 0.38, 1.35], items: [[['bluecap'], [-0.3, 0.912, -0.22], [0, 0.4, 0], 1.6], [['tincture_bluecap'], [0.36, 0.912, -0.12], [0, 0.3, 0], 1.6], [['tincture_hush'], [0.46, 0.912, -0.02], [0, -0.4, 0], 1.6], [['hush_mint'], [-0.05, 0.912, -0.12], [0, 0.9, 0], 1.6], [['herb_salve'], [0.24, 0.912, 0.0], [0, 0, 0], 1.6]] },
  'lab:specimen': { look: [-0.05, 1.02, -0.3], cam: [0.6, 0.38, 1.35], items: [[['pallid_egg'], [-0.25, 0.912, -0.2], [0, 0.3, 0], 1.6], [['bluecap'], [0.02, 0.912, -0.12], [0, 1.2, 0], 1.6], [['grub_silk'], [0.32, 0.912, -0.05], [0, -0.5, 0], 1.6], [['hen_down'], [-0.45, 0.912, -0.05], [0, 0, 0], 1.6]] },
};
const BEAST_AT: Record<string, [number, number, number, number][]> = {
  pale_hen: [[-0.95, -0.15, 0.5, 1.0], [0.95, 0.12, -2.3, 0.95], [-0.32, 0.18, 2.6, 1.05]],
  carpet_grub: [[-0.75, -0.2, 0.4, 1.0], [0.1, 0.25, -1.9, 1.1], [0.95, -0.05, 2.5, 0.9]],
};

const GRADE: Grade = { exposure: 1.45, lift: [0.84, 0.95, 1.1], gain: [1.1, 1.0, 0.9], vig: 0.5, sat: 1.14, contrast: 1.12, haze: 0.25, hazeColor: 0x5a6a8a, ao: 0.9, aoRad: 0.22, scatter: 0.45, bounce: 0.3 };

export class ActionPreview implements StageView {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(38, 4 / 3, 0.05, 30);
  grade: Grade = { ...GRADE };
  private view: PostView | null = null;
  private sets = new Map<SetKey, SetV>();
  private cur: SetV | null = null;
  private shot: Shot | null = null;
  private actor: HumanRig | null = null;
  private patient: HumanRig | null = null;
  private calf: { root: THREE.Object3D; rig: unknown; anim?: (r: unknown, t: number) => void } | null = null;
  private calfLoading = false;
  /** round 25: the pen's other animals (pallid hens, carpet grubs), built from their species the first time */
  private beasts = new Map<string, { root: THREE.Object3D; rig: unknown; anim?: (r: unknown, t: number) => void }[]>();
  private beastLoading = new Set<string>();
  private mats: FMats; private low: boolean;
  private t = 0; private actT = 0; private fired = false;
  private yaw = 0; private pitch = 0; private zoomK = 1; private yawS = 0; private pitchS = 0; private zoomS = 1;
  private sparks: THREE.InstancedMesh; private spark: { p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  private puffs: { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number }[] = [];
  private puffMat: THREE.MeshBasicMaterial;
  private thrown: THREE.Object3D | null = null;
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];
  /** sounds only while the feed is the thing being looked at */
  audible = false;

  constructor(mats: FMats) {
    this.mats = mats;
    this.low = (mats.metal as THREE.MeshLambertMaterial).isMeshLambertMaterial === true;
    this.scene.background = new THREE.Color(0x0a0c0e);
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 90);
    this.sparks.count = 0; this.sparks.frustumCulled = false; this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.sparks);
    const pc = document.createElement('canvas'); pc.width = pc.height = 32;
    const c = pc.getContext('2d')!; const gr = c.createRadialGradient(16, 16, 1, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
    const pt = new THREE.CanvasTexture(pc); this.disposables.push(pt);
    this.puffMat = new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false, color: 0xe8eef2, opacity: 0.5 });
    // the pen's moon calf lives in its own module: start fetching it now so the pen is never shown empty
    void import('../../../creatures/species/moon_calf').catch(() => undefined);
  }

  get texture(): THREE.Texture | null { return this.view?.texture ?? null; }

  /** put a node's scene on: its set (built the first time), the unit dressed and armed for it */
  show(s: Shot) {
    const same = this.shot && this.shot.set === s.set && this.shot.act.name === s.act.name && this.shot.variant === s.variant && this.shot.held?.[0] === s.held?.[0];
    this.shot = s;
    if (same) return;
    const set = this.sets.get(s.set) ?? this.build(s.set);
    if (this.cur && this.cur !== set) this.cur.g.visible = false;
    this.cur = set; set.g.visible = true;
    this.actT = 0; this.fired = false;
    const V = this.variant(set, s.variant);
    const a = this.ensureActor();
    set.g.add(a.root);
    a.root.position.copy(set.at); a.root.rotation.y = set.yaw;
    // variants that move the unit: milking kneels behind the calf, the cleaver works at the counter's board
    if (s.variant === 'milk') { a.root.position.set(-0.68, 0, -0.98); a.root.rotation.y = 0.1; }
    else if (s.variant === 'board') a.root.position.x += 0.85;
    a.setOutfit(outfitOf(OUTFIT[s.set]));
    a.hold('R', null); a.hold('L', null);
    const hr = pick(s.held), hl = pick(s.heldL);
    if (hr) { const m = makeHeldMesh(hr); if (m) a.hold('R', m, s.act.name === 'throw' ? 'auto' : 'perp'); }
    if (hl) { const m = makeHeldMesh(hl); if (m) a.hold('L', m, 'along'); }
    // the second person: the medic's patient
    if (set.patient) {
      const p = this.ensurePatient();
      set.g.add(p.root); p.root.position.copy(set.patient.at); p.root.rotation.y = set.patient.yaw; p.root.visible = true;
    } else if (this.patient) this.patient.root.visible = false;
    if (set.dummy) { set.dummy.g.visible = s.variant !== 'down' && s.variant !== 'bag'; set.dummy.down.visible = s.variant === 'down'; set.dummy.bag.visible = s.variant === 'bag'; }
    if (s.set === 'pen') { const kind = V?.beasts ?? 'moon_calf'; if (kind === 'moon_calf') this.ensureCalf(set); this.showBeasts(set, kind); }
    for (const p of this.puffs) p.m.visible = false;
    this.spark.length = 0;
    if (this.thrown) this.thrown.visible = false;
  }

  /** 3D mode: drag to turn round the scene, the wheel to move in */
  orbit(dx: number, dy: number) { this.yaw = Math.max(-1.1, Math.min(1.1, this.yaw - dx * 0.006)); this.pitch = Math.max(-0.25, Math.min(0.5, this.pitch + dy * 0.004)); }
  zoom(k: number) { this.zoomK = Math.max(0.55, Math.min(1.5, this.zoomK * k)); }
  resetView() { this.yaw = 0; this.pitch = 0; this.zoomK = 1; }

  update(dt: number, t: number) {
    const set = this.cur, s = this.shot, a = this.actor;
    if (!set || !s || !a) return;
    this.t = t;
    // the action loop: the clip, then a breath, then again
    const A = s.act, cyc = A.dur + (A.rest ?? 0);
    this.actT += dt;
    if (this.actT >= cyc) { this.actT -= cyc; this.fired = false; this.flip = !this.flip; }
    const on = this.actT < A.dur;
    const name = on ? (A.alt && this.flip ? A.alt : A.name) : '';
    a.update(dt, { speed: 0, stance: 'stand', full: (A.full ?? '') as never, action: name as never, actionT: on ? this.actT : 0, actionDur: A.dur, twoHanded: !!A.two, weapon: A.weapon, fidget: !on, holding: !!pick(s.held) } as never);
    // the moment it lands
    const hitAt = (A.hit ?? 0.5) * A.dur;
    if (on && !this.fired && this.actT >= hitAt) { this.fired = true; this.onHit(set, s); }
    if (this.patient?.root.visible) this.patient.update(dt, { speed: 0, stance: 'stand', full: 'sit', action: '', fidget: true } as never);
    if (this.patient?.root.visible) this.posePatient(this.patient, t);
    if (set.key === 'pen' && this.calf?.anim && this.calf.root.visible) { try { this.calf.anim(this.calf.rig, (t % 3.95)); } catch { /* a pose that wants the world */ } }
    for (const [k, list] of this.beasts) for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.root.visible || !b.anim || set.key !== 'pen') continue;
      try { b.anim(b.rig, t * (0.9 + i * 0.07) + i * 3.1); } catch { /* */ }
      void k;
    }
    // the spray drifts off the nozzle over the mint, red with pepper
    if (set.key === 'grow' && s.variant === 'pest' && on && this.actT > A.dur * 0.25 && Math.random() < dt * 16) this.addPuff(new THREE.Vector3(0.22 + Math.random() * 0.2, 0.78, 0.42 + (Math.random() - 0.5) * 0.2), 0xffc8b8, 0.7, 0.04, -0.3);
    set.tick?.(dt, t, this.fired ? Math.max(0, 1 - (this.actT - hitAt) * 3) : 0, on ? this.actT / A.dur : 0);
    // the practical lamp (a weld arc stutters, a burner breathes)
    set.prac.intensity = set.pracBase * set.pracK(t, on ? 1 : 0);
    if (set.dummy) { const x = set.dummy.w.update(dt); set.dummy.g.rotation.x = x * 0.35; set.dummy.g.rotation.z = x * 0.12; set.dummy.bag.rotation.x = x * 0.5; set.dummy.down.rotation.z = x * 0.04; }
    this.stepSparks(dt);
    this.stepPuffs(dt);
    if (this.thrown && this.thrown.visible) this.stepThrown(set);
    // the camera: a slow drift round the work, the 3D mode's drag on top
    this.yawS = damp(this.yawS, this.yaw, 6, dt); this.pitchS = damp(this.pitchS, this.pitch, 6, dt); this.zoomS = damp(this.zoomS, this.zoomK, 6, dt);
    const drift = Math.sin(t * 0.21) * 0.16;
    const off = this.v.copy(set.cam).multiplyScalar(this.zoomS * 1.1);
    off.applyAxisAngle(Y, drift + this.yawS);
    const r = Math.hypot(off.x, off.z), el = Math.atan2(off.y, r) + this.pitchS;
    const L = off.length();
    off.set(Math.sin(Math.atan2(off.x, off.z)) * Math.cos(el) * L, Math.sin(el) * L, Math.cos(Math.atan2(off.x, off.z)) * Math.cos(el) * L);
    this.cam.position.copy(set.look).add(off);
    this.cam.fov = set.fov;
    this.cam.lookAt(set.look);
  }
  private flip = false;

  /** draw the feed through the menu's post pass (stage preRender) */
  render(r: THREE.WebGLRenderer, t: number, low: boolean) {
    if (!this.cur) return;
    if (!this.view) this.view = new PostView(low ? 288 : 384, low ? 216 : 288);
    this.view.render(r, this.scene, this.cam, this.grade, t, low);
  }

  // ---------------------------------------------------------------- people
  private ensureActor(): HumanRig {
    if (this.actor) return this.actor;
    let s = 4711;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const app = { ...randomAppearance(rnd), ...randomLooks(rnd, false) };
    const rig = createPreviewRig(app, outfitOf(['jumpsuit', 'boots_work']), { outline: false });
    rig.skin.castShadow = true; rig.skin.receiveShadow = true;
    this.actor = rig;
    return rig;
  }
  private ensurePatient(): HumanRig {
    if (this.patient) return this.patient;
    let s = 977;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const app = { ...randomAppearance(rnd), ...randomLooks(rnd, true) };
    const rig = createPreviewRig(app, { ...outfitOf(['tshirt', 'jeans', 'sneakers']), cond: { bleeding: { arm_l: 0.2 } } } as never, { outline: false });
    rig.skin.castShadow = true;
    this.patient = rig;
    return rig;
  }
  /** the patient's left arm laid out along the table, the head turned away from the needle */
  private posePatient(p: HumanRig, t: number) {
    p.j.uarmL.rotation.set(-1.25, 0.15, 0.55);
    p.j.farmL.rotation.set(-0.15, 0, 0);
    p.j.handL.rotation.set(0.1, 0, 0.2);
    p.j.head.rotation.set(0.05, 0.55 + Math.sin(t * 0.4) * 0.05, 0);
    p.j.uarmR.rotation.set(-0.35, 0, -0.25); p.j.farmR.rotation.set(-1.2, 0, 0);
  }
  /** the set's framing and props for a variant (restoring its own first); returns the variant's definition */
  private variant(set: SetV, v?: string): VariantDef | undefined {
    set.base ||= { at: set.at.clone(), yaw: set.yaw, look: set.look.clone(), cam: set.cam.clone() };
    set.at.copy(set.base.at); set.yaw = set.base.yaw; set.look.copy(set.base.look); set.cam.copy(set.base.cam);
    set.vp ||= new Map();
    for (const g of set.vp.values()) g.visible = false;
    const V = VARIANTS[`${set.key}:${v ?? ''}`];
    if (!V) return undefined;
    if (V.at) { set.at.x = V.at[0]; set.at.z = V.at[1]; }
    if (V.yaw !== undefined) set.yaw = V.yaw;
    if (V.look) set.look.set(...V.look);
    if (V.cam) set.cam.set(...V.cam);
    let g = set.vp.get(v!);
    if (!g) {
      g = new THREE.Group(); g.name = 'variant:' + v;
      for (const [key, st, x, z, r] of V.objs ?? []) { const m = objMesh(key, st, r ?? 0); if (m) { m.position.set(x, 0, z); g.add(m); } }
      // the variant's exhibits sit a little larger than life so they read on the monitor
      for (const [keys, p, r, sc] of V.items ?? []) {
        const k = pick(keys); const m = k ? makeHeldMesh(k) : null; if (!m) continue;
        m.position.set(...p); if (r) m.rotation.set(...r); if (sc) m.scale.setScalar(sc);
        // a held mesh hangs from its grip: stand it on the surface instead
        m.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m); m.position.y += p[1] - bb.min.y;
        m.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } });
        g.add(m);
      }
      set.g.add(g); set.vp.set(v!, g);
    }
    g.visible = true;
    return V;
  }
  /** the pen's animals for a variant: the calf, or a few pallid hens / carpet grubs, the others hidden */
  private showBeasts(set: SetV, kind: string) {
    if (this.calf) this.calf.root.visible = kind === 'moon_calf';
    for (const [k, list] of this.beasts) for (const b of list) b.root.visible = k === kind;
    if (kind === 'moon_calf' || this.beasts.has(kind) || this.beastLoading.has(kind)) return;
    this.beastLoading.add(kind);
    const load = kind === 'pale_hen' ? import('../../../creatures/species/pale_hen') : import('../../../creatures/species/carpet_grub');
    load.then(() => {
      const sp = species(kind) as { build(): { root: THREE.Object3D }; animateGallery?: (r: unknown, t: number) => void } | undefined;
      if (!sp || !this.sets.has('pen')) return;
      const list = (BEAST_AT[kind] ?? []).map(([x, z, yaw, sc]) => {
        const rig = sp.build();
        rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
        rig.root.position.set(x, 0, z); rig.root.rotation.y = yaw; rig.root.scale.setScalar(sc * 1.25);
        (this.sets.get('pen') ?? set).g.add(rig.root);
        return { root: rig.root, rig: rig as unknown, anim: sp.animateGallery };
      });
      this.beasts.set(kind, list);
      const want = this.shot?.set === 'pen' ? (VARIANTS['pen:' + (this.shot.variant ?? '')]?.beasts ?? 'moon_calf') : '';
      for (const b of list) b.root.visible = want === kind;
    }).catch((e) => console.warn('[preview] no', kind, e)).finally(() => this.beastLoading.delete(kind));
  }
  private async ensureCalf(set: SetV) {
    if (this.calf) { set.g.add(this.calf.root); return; }
    if (this.calfLoading) return;
    this.calfLoading = true;
    try {
      await import('../../../creatures/species/moon_calf');
      const sp = species('moon_calf') as { build(): { root: THREE.Object3D }; animateGallery?: (r: unknown, t: number) => void } | undefined;
      const rig = sp?.build();
      if (!rig?.root) return;
      rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      rig.root.position.set(-0.72, 0, -0.42); rig.root.rotation.y = Math.PI / 2; rig.root.scale.setScalar(1.15);
      this.calf = { root: rig.root, rig, anim: sp?.animateGallery };
      (this.sets.get('pen')?.g ?? set.g).add(rig.root);
      rig.root.visible = !this.shot || this.shot.set !== 'pen' || (VARIANTS['pen:' + (this.shot.variant ?? '')]?.beasts ?? 'moon_calf') === 'moon_calf';
    } catch (e) { console.warn('[preview] no moon calf', e); }
  }

  // ---------------------------------------------------------------- the moment of contact
  private onHit(set: SetV, s: Shot) {
    const snd = (k: string, v: number) => { if (this.audible) gameSound(k, v); };
    if (set.key === 'combat') {
      if (s.variant === 'throw') { this.launch(set, s); return; }
      set.dummy?.w.kick(s.act.name === 'cb_overhead' || s.act.name === 'cb_finisher' ? 9 : s.act.name === 'cb_shove_kick' ? 11 : s.act.name.startsWith('cb_jab') ? 3 : 6);
      const p = this.v.set(set.at.x + Math.sin(set.yaw) * 0.75, s.variant === 'down' ? 0.25 : 1.25, set.at.z + Math.cos(set.yaw) * 0.75);
      for (let i = 0; i < 6; i++) this.addPuff(p, 0xd8c89a, 0.6, 0.06);
      snd(s.act.weapon === 'blade' ? 'flesh_cut' : s.act.name === 'cb_shove_kick' ? 'body_thud' : 'cb_impact', 0.25);
    } else if (set.key === 'weld') snd('cy_servo', 0.08);
  }
  private launch(set: SetV, s: Shot) {
    const k = pick(s.held);
    if (!this.thrown) { const m = k ? makeHeldMesh(k) : null; this.thrown = m ?? new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), this.mats.concrete); this.scene.add(this.thrown); }
    this.thrown.visible = true;
    this.thrown.userData.t0 = this.t;
    this.actor?.hold('R', null);
    setTimeout(() => { const kk = pick(this.shot?.held); if (kk && this.shot?.variant === 'throw' && this.actor) { const m = makeHeldMesh(kk); if (m) this.actor.hold('R', m, 'auto'); } }, 900);
    void set;
  }
  private stepThrown(set: SetV) {
    const o = this.thrown!, u = (this.t - (o.userData.t0 as number)) / 0.45;
    const a = new THREE.Vector3(set.at.x + 0.15, 1.55, set.at.z + 0.1), b = new THREE.Vector3(set.at.x + Math.sin(set.yaw) * 2.1, 1.2, set.at.z + Math.cos(set.yaw) * 2.1);
    if (u >= 1) { o.visible = false; set.dummy?.w.kick(8); for (let i = 0; i < 8; i++) this.addPuff(b, 0xd8c89a, 0.7, 0.05); if (this.audible) gameSound('body_thud', 0.25); return; }
    o.position.lerpVectors(a, b, u); o.position.y += Math.sin(u * Math.PI) * 0.35;
    o.rotation.set(u * 9, u * 4, 0);
  }

  // ---------------------------------------------------------------- sparks and puffs
  emitSparks(p: THREE.Vector3, n: number, spread = 1) {
    for (let i = 0; i < n && this.spark.length < 90; i++) this.spark.push({ p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 2.4 * spread, Math.random() * 1.6, (Math.random() - 0.5) * 2.4 * spread), life: 0.25 + Math.random() * 0.45 });
  }
  private stepSparks(dt: number) {
    let n = 0;
    for (let i = this.spark.length - 1; i >= 0; i--) {
      const s = this.spark[i];
      s.life -= dt;
      if (s.life <= 0) { this.spark.splice(i, 1); continue; }
      s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.01) { s.p.y = 0.01; s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; }
      this.m4.lookAt(s.v, ORIGIN, Y).setPosition(s.p);
      this.m4.scale(this.v.set(1, 1, 0.6 + s.v.length() * 0.6));
      this.sparks.setMatrixAt(n, this.m4);
      this.sparks.setColorAt(n++, COL.setHSL(0.1 + s.life * 0.05, 1, 0.55 + s.life * 0.4));
    }
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }
  addPuff(p: THREE.Vector3, color: number, life = 2, size = 0.12, rise = 0.25) {
    let q = this.puffs.find((x) => !x.m.visible);
    if (!q) {
      if (this.puffs.length > 40) return;
      const m = new THREE.Mesh(PUFF_GEO, this.puffMat.clone());
      m.renderOrder = 3; this.scene.add(m);
      q = { m, v: new THREE.Vector3(), life: 0, max: 1 };
      this.puffs.push(q);
    }
    q.m.visible = true; q.m.position.copy(p); q.m.scale.setScalar(size);
    (q.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    q.v.set((Math.random() - 0.5) * 0.15, rise * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.15);
    q.life = q.max = life * (0.7 + Math.random() * 0.5);
  }
  private stepPuffs(dt: number) {
    for (const q of this.puffs) {
      if (!q.m.visible) continue;
      q.life -= dt;
      if (q.life <= 0) { q.m.visible = false; continue; }
      const f = q.life / q.max;
      q.m.position.addScaledVector(q.v, dt);
      q.m.scale.multiplyScalar(1 + dt * 0.9);
      (q.m.material as THREE.MeshBasicMaterial).opacity = Math.sin(f * Math.PI) * 0.45;
      q.m.quaternion.copy(this.cam.quaternion);
    }
  }

  // ================================================================== building the sets
  private build(key: SetKey): SetV {
    const g = new THREE.Group(); g.name = 'set:' + key;
    this.scene.add(g);
    const b = new FacetBuilder();
    const S = BUILD[key];
    const set: SetV = { key, g, at: new THREE.Vector3(), yaw: 0, look: new THREE.Vector3(), cam: new THREE.Vector3(), fov: 38, prac: new THREE.PointLight(0xffffff, 0, 4, 1.8), pracK: () => 1, pracBase: 0, props: [] };
    const ctx: BuildCtx = { b, g, set, mats: this.mats, prev: this, glb: (a, p, r = 0, s = 1) => this.glb(set, a, p, r, s), item: (k, p, r) => this.item(set, k, p, r) };
    shell(b, S.shell);
    S.make(ctx);
    const built = b.build(this.mats);
    g.add(built);
    lights(set, S.light);
    this.sets.set(key, set);
    return set;
  }
  private glb(set: SetV, a: string, p: [number, number, number], r: number, s: number) {
    loadProp(URL_OF(a), this.low).then((m) => {
      if (!this.sets.has(set.key)) return;
      m.position.set(...p); m.rotation.y = r * DEG; if (s !== 1) m.scale.setScalar(s);
      m.castShadow = true; m.receiveShadow = true;
      set.g.add(m); set.props.push(m);
    }).catch((e) => console.warn('[preview] prop', a, e));
  }
  private item(set: SetV, keys: string | string[], p: [number, number, number], r: [number, number, number] = [0, 0, 0]): THREE.Object3D | null {
    const k = pick(Array.isArray(keys) ? keys : [keys]);
    const m = k ? makeHeldMesh(k) : null;
    if (!m) return null;
    m.position.set(...p); m.rotation.set(r[0], r[1], r[2]);
    m.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } });
    set.g.add(m);
    return m;
  }

  dispose() {
    this.view?.dispose(); this.view = null;
    this.actor?.dispose(); this.patient?.dispose();
    this.actor = this.patient = null;
    const keep = new Set<THREE.Material>(Object.values(this.mats));
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // shared: the faceted kit's materials, the item atlas, the props' cached geometry (props/glb.ts)
      if (m.geometry && !m.name.startsWith('prop:') && !(m.geometry as THREE.BufferGeometry & { userData: { shared?: boolean } }).userData.shared && m.geometry !== PUFF_GEO) m.geometry.dispose();
      // the glow cards and puffs own their materials (the kit's, the items' and the props' are shared)
      const mt = m.material as THREE.Material;
      if (!Array.isArray(m.material) && (mt as THREE.MeshBasicMaterial).isMeshBasicMaterial && !keep.has(mt)) mt.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.sparks.geometry.dispose(); (this.sparks.material as THREE.Material).dispose();
    this.scene.clear();
    this.sets.clear(); this.cur = null; this.shot = null; this.calf = null; this.beasts.clear();
  }
}

const Y = new THREE.Vector3(0, 1, 0), ORIGIN = new THREE.Vector3(), COL = new THREE.Color();
/** a world object's own model (planters, the hydro tray, the pen: src/content/furniture) as a set prop */
function objMesh(key: string, state: Record<string, unknown>, rot: number): THREE.Mesh | null {
  const d = objDef(key); if (!d) return null;
  const g = objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot, state } as unknown as TileObject);
  if (!g) return null;
  const m = new THREE.Mesh(g, worldMaterial({}));
  // 'prop:' : the geometry is the world's cache, not ours to dispose
  m.name = 'prop:obj:' + key; m.rotation.y = -rot * Math.PI / 2; m.castShadow = true; m.receiveShadow = true;
  return m;
}
const PUFF_GEO = new THREE.PlaneGeometry(1, 1);

// what the unit wears for each kind of work (the game's own clothes)
const OUTFIT: Record<SetKey, string[]> = {
  combat: ['tshirt', 'jeans', 'boots_work', 'gloves_work'],
  medic: ['scrubs_top', 'scrubs_pants', 'sneakers', 'gloves_rubber'],
  weld: ['hoodie', 'jeans', 'boots_work', 'gloves_work'],
  bench: ['tshirt_stripe', 'jeans', 'boots_work', 'gloves_work'],
  cook: ['tshirt', 'jeans', 'sneakers'],
  garden: ['hoodie', 'jeans', 'boots_work', 'gloves_rubber'],
  pen: ['hoodie', 'jeans', 'boots_work'],
  store: ['hoodie', 'jeans', 'sneakers'],
  lab: ['lab_coat', 'slacks', 'dress_shoes'],
  grow: ['hoodie', 'jeans', 'boots_work', 'gloves_rubber'],
};

interface BuildCtx {
  b: FacetBuilder; g: THREE.Group; set: SetV; mats: FMats; prev: ActionPreview;
  glb(a: string, p: [number, number, number], r?: number, s?: number): void;
  item(k: string | string[], p: [number, number, number], r?: [number, number, number]): THREE.Object3D | null;
}
interface ShellOpts { w: number; d: number; wall: number; floor: 'tile' | 'concrete' | 'floor' | 'wood'; floorCol: number; wains?: number; tileCol?: number }
interface LightOpts { key: [number, number, number]; keyAt: [number, number, number]; keyCol: number; keyI: number; fill: [number, number, number]; fillCol: number; fillI: number; prac: [number, number, number]; pracCol: number; pracI: number; pracDist?: number }

// ---------------------------------------------------------------- a small room round the work
/** floor, a back wall and a left wall (the camera looks in from the open front right), wainscot tiles, a skirting,
 *  pipes and a conduit run, a junction box, a vent, a floor drain and the grime of use */
function shell(b: FacetBuilder, o: ShellOpts) {
  const { w, d } = o, x0 = -w / 2, z0 = -d / 2, H = 2.7;
  b.add(o.floor, cbox(w, 0.06, d, 0.004), o.floorCol, at(0, -0.03, 0), { rep: o.floor === 'tile' ? 0.6 : 1.2 });
  b.add('paint', cbox(w, H, 0.08, 0.006), o.wall, at(0, H / 2, z0 - 0.04), { rep: 0.9 });
  b.add('paint', cbox(0.08, H, d, 0.006), o.wall, at(x0 - 0.04, H / 2, 0), { rep: 0.9 });
  // a tiled wainscot to shoulder height with a cap rail, a skirting along both walls
  const wh = o.wains ?? 1.2, tc = o.tileCol ?? 0xd8dccc;
  b.add('tile', cbox(w, wh, 0.03, 0.003), tc, at(0, wh / 2, z0 + 0.015), { rep: 0.45 });
  b.add('tile', cbox(0.03, wh, d, 0.003), tc, at(x0 + 0.015, wh / 2, 0), { rep: 0.45 });
  b.add('tile', cbox(w, 0.05, 0.05, 0.008), 0x4e6a48, at(0, wh + 0.02, z0 + 0.03));
  b.add('tile', cbox(0.05, 0.05, d, 0.008), 0x4e6a48, at(x0 + 0.03, wh + 0.02, 0));
  b.add('rubber', cbox(w, 0.09, 0.02, 0.003), 0x2a2a28, at(0, 0.045, z0 + 0.04));
  b.add('rubber', cbox(0.02, 0.09, d, 0.003), 0x2a2a28, at(x0 + 0.04, 0.045, 0));
  // two pipes along the back wall near the ceiling, brackets every so often, a valve wheel
  for (const [y, r, col] of [[2.42, 0.05, 0x8a8e90], [2.26, 0.035, 0xb0503a]] as [number, number, number][]) {
    b.add('metal', tube([[x0 + 0.1, y, z0 + 0.12], [w / 2 + 0.2, y, z0 + 0.12]], r, 4, 8, false), col, undefined, { rep: 0.3 });
    for (let x = x0 + 0.4; x < w / 2; x += 0.8) b.add('metal', cbox(0.04, 0.12, 0.14, 0.006), C.dark, at(x, y, z0 + 0.07));
  }
  b.add('brass', lathe([[0, 0], [0.09, 0], [0.09, 0.015], [0.02, 0.03], [0, 0.03]], 8), 0xc8a050, at(x0 + 1.1, 2.26, z0 + 0.2, Math.PI / 2));
  // a conduit down the left wall into a junction box, a light switch, a vent grille
  b.add('metal', tube([[x0 + 0.07, 2.6, -d * 0.2], [x0 + 0.07, 1.42, -d * 0.2]], 0.014, 2, 6, false), C.steel);
  b.add('metal', cbox(0.05, 0.16, 0.16, 0.01), 0x6a7462, at(x0 + 0.08, 1.34, -d * 0.2));
  for (const [bx, by] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) b.add('chrome', bolt(0.006, 0.005), C.steel, at(x0 + 0.11, 1.34 + by * 0.06, -d * 0.2 + bx * 0.06, 0, 0, -Math.PI / 2));
  b.add('metal', cbox(0.46, 0.22, 0.03, 0.006), 0x5a6062, at(w * 0.18, 2.0, z0 + 0.02));
  for (let i = 0; i < 6; i++) b.add('metal', cbox(0.42, 0.012, 0.02, 0.002), C.darker, at(w * 0.18, 1.92 + i * 0.03, z0 + 0.04));
  // a floor drain and a hazard strip along the wall
  b.add('metal', cbox(0.22, 0.012, 0.22, 0.004), 0x3a3e40, at(w * 0.15, 0.004, d * 0.12));
  for (let i = 0; i < 5; i++) b.add('metal', cbox(0.18, 0.016, 0.012, 0.002), 0x1a1c1e, at(w * 0.15, 0.008, d * 0.12 - 0.08 + i * 0.04));
  b.add('hazard', cbox(w * 0.6, 0.006, 0.07, 0.002), 0xffffff, at(-w * 0.1, 0.003, z0 + 0.12), { rep: 0.2 });
}

/** the same four lights in every set (a hemisphere, a shadowed key spot, a fill, the practical) */
function lights(set: SetV, o: LightOpts) {
  const g = set.g;
  const hemi = new THREE.HemisphereLight(0xe0ecff, 0x5a4a3a, 0.95);
  const key = new THREE.SpotLight(o.keyCol, o.keyI * 0.42, 9, 0.75, 0.55, 1.5);
  key.position.set(...o.key); key.target.position.set(...o.keyAt);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3.5;
  key.shadow.camera.near = 0.3; key.shadow.camera.far = 9;
  const fill = new THREE.PointLight(o.fillCol, o.fillI, 7, 1.6); fill.position.set(...o.fill);
  set.prac.color.setHex(o.pracCol); set.prac.distance = o.pracDist ?? 3.5; set.prac.position.set(...o.prac); set.pracBase = o.pracI;
  g.add(hemi, key, key.target, fill, set.prac);
}

// ---------------------------------------------------------------- per set
type Builder = { shell: ShellOpts; light: LightOpts; make(c: BuildCtx): void };
const BUILD: Record<SetKey, Builder> = {
  // ---- TRAINING: rubber mats, a dummy on a sprung post, a heavy bag on a chain, a weapon rack, a bench
  combat: {
    shell: { w: 4.2, d: 3.6, wall: 0x8a9a7a, floor: 'concrete', floorCol: 0x8a8478, tileCol: 0xc8ccb4 },
    light: { key: [1.2, 2.6, 1.4], keyAt: [-0.2, 0.6, -0.4], keyCol: 0xfff0dc, keyI: 34, fill: [-1.4, 1.8, 1.4], fillCol: 0xc8dcff, fillI: 5, prac: [-1.6, 2.1, -1.5], pracCol: 0xffd8a0, pracI: 2 },
    make(c) {
      const { b, set } = c;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.add('rubber', cbox(1.0, 0.035, 1.0, 0.006), (i + j) % 2 ? 0x2e4a3a : 0x34523e, at(-0.9 + i * 1.02, 0.018, -0.75 + j * 1.02), { rep: 0.4 });
      // the dummy: a weighted tyre base, a sprung steel post, a stuffed canvas torso with tape and straw at the seams
      const dx = -0.55, dz = 0.3;
      b.add('rubber', lathe([[0.12, 0], [0.34, 0], [0.36, 0.06], [0.34, 0.14], [0.12, 0.14]], 12), 0x1e1e1e, at(dx, 0.02, dz));
      b.add('metal', prism(0.05, 0.05, 8), C.steel, at(dx, 0.14, dz));
      b.add('metal', lathe([[0, 0], [0.045, 0], [0.045, 0.06], [0, 0.06]], 8), 0x6a6e70, at(dx, 0.19, dz));
      const dg = new THREE.Group(); dg.position.set(dx, 0.22, dz);
      const db = new FacetBuilder();
      db.add('chrome', prism(0.022, 0.75, 6), 0xffffff, at(0, 0.37, 0));
      db.add('leather', cbox(0.46, 0.62, 0.3, 0.06, 0.12), 0xb89a6a, at(0, 1.0, 0), { rep: 0.3 });
      db.add('leather', cbox(0.22, 0.26, 0.22, 0.05), 0xa88a5a, at(0, 1.47, 0.01), { rep: 0.3 });
      db.add('rubber', prism(0.06, 0.1, 8), 0x6a6a66, at(0, 1.33, 0.01));
      for (const sx of [-1, 1]) db.add('leather', prism(0.06, 0.4, 6), 0xa88a5a, at(sx * 0.3, 1.12, 0.02, 0, 0, sx * 1.2), { rep: 0.3 });
      for (const y of [0.82, 1.18]) db.add('rubber', cbox(0.48, 0.05, 0.32, 0.01), 0x8a8a86, at(0, y, 0));
      for (let i = 0; i < 9; i++) db.add('wood', cbox(0.012, 0.08, 0.012, 0.002), 0xe8c860, at(-0.2 + i * 0.05, 0.7 + (i % 3) * 0.01, 0.13, 0.3 * (i % 2 ? 1 : -1), 0, 0.4 * (i % 3 - 1)));
      db.add('paint', cbox(0.18, 0.18, 0.004, 0.002), 0xa8382a, at(0, 1.06, 0.152));
      db.add('paint', cbox(0.09, 0.09, 0.004, 0.002), 0xe8e2d0, at(0, 1.06, 0.155));
      dg.add(db.build(c.mats));
      c.g.add(dg);
      // a dummy already down on the mat (the finisher's)
      const down = new THREE.Group(); down.position.set(dx + 0.05, 0.04, dz + 0.1);
      const dd = new FacetBuilder();
      dd.add('leather', cbox(0.46, 0.3, 0.62, 0.06), 0xb89a6a, at(0, 0.15, 0), { rep: 0.3 });
      dd.add('leather', cbox(0.22, 0.2, 0.24, 0.05), 0xa88a5a, at(0, 0.12, -0.45), { rep: 0.3 });
      dd.add('rubber', cbox(0.48, 0.32, 0.05, 0.01), 0x8a8a86, at(0, 0.15, 0.12));
      for (let i = 0; i < 7; i++) dd.add('wood', cbox(0.012, 0.012, 0.08, 0.002), 0xe8c860, at(-0.18 + i * 0.06, 0.02, 0.33, 0.2, 0.4 * (i % 3 - 1), 0));
      down.add(dd.build(c.mats)); down.visible = false; c.g.add(down);
      // the heavy bag on a chain from a ceiling bracket
      const bag = new THREE.Group(); bag.position.set(dx, 2.55, dz);
      const bb = new FacetBuilder();
      bb.add('metal', cbox(0.3, 0.05, 0.3, 0.01), C.dark, at(0, 0.1, 0));
      for (let i = 0; i < 6; i++) bb.add('chrome', cbox(0.02, 0.07, 0.008, 0.002), 0xffffff, at(0, 0.02 - i * 0.07, 0, 0, (i % 2) * Math.PI / 2));
      bb.add('leather', prism(0.2, 0.9, 10), 0x6a2a1e, at(0, -1.35, 0), { rep: 0.3 });
      bb.add('leather', lathe([[0, 0], [0.2, 0], [0.12, 0.08], [0, 0.09]], 10), 0x5a2218, at(0, -0.9, 0));
      for (const y of [-1.05, -1.6]) bb.add('rubber', prism(0.205, 0.04, 10), 0x1a1a1a, at(0, y, 0));
      bag.add(bb.build(c.mats)); bag.visible = false; c.g.add(bag);
      set.dummy = { g: dg, w: new Wobble(160, 5), down, bag };
      // a weapon rack on the back wall: a plank on brackets, things on pegs
      b.add('wood', cbox(1.5, 0.08, 0.06, 0.008), 0x8a6a48, at(-0.9, 1.52, -1.74));
      b.add('wood', cbox(1.5, 0.08, 0.06, 0.008), 0x8a6a48, at(-0.9, 0.62, -1.74));
      for (let i = 0; i < 6; i++) b.add('chrome', prism(0.008, 0.1, 5), 0xffffff, at(-1.5 + i * 0.24, 1.52, -1.68, Math.PI / 2));
      c.item(['bat', 'crowbar'], [-1.45, 1.05, -1.66], [0, 0, Math.PI / 2]);
      c.item(['pipe', 'crowbar'], [-1.2, 1.05, -1.66], [0, 0, Math.PI / 2 - 0.05]);
      c.item(['machete', 'knife_kitchen'], [-0.95, 1.12, -1.66], [0, 0, Math.PI / 2]);
      c.item(['chair_leg', 'plank'], [-0.7, 1.05, -1.66], [0, 0, Math.PI / 2 + 0.04]);
      c.item(['sledgehammer', 'hammer'], [-0.42, 1.0, -1.66], [0, 0, Math.PI / 2]);
      // a bench with a bottle and a towel, bricks stacked by the wall
      b.add('wood', cbox(1.0, 0.05, 0.32, 0.008), 0x9a7a52, at(-1.55, 0.45, 0.3, 0, Math.PI / 2));
      for (const z of [-0.1, 0.7]) b.add('metal', cbox(0.04, 0.44, 0.28, 0.006), C.dark, at(-1.55, 0.22, z));
      c.item(['water_bottle', 'almond_water'], [-1.52, 0.56, 0.1], [0, 0.5, 0]);
      b.add('sponge', cbox(0.3, 0.03, 0.22, 0.01), 0xd8d0c0, at(-1.55, 0.49, 0.5, 0, 0.3, 0));
      for (let i = 0; i < 5; i++) c.item(['brick'], [1.5 + (i % 2) * 0.1, 0.05 + Math.floor(i / 2) * 0.08, -1.5 + (i % 3) * 0.06], [0, i * 0.4, 0]);
      c.glb('drum', [1.55, 0, -1.1]);
      c.glb('toolbox', [1.55, 0.9, -1.1], 20);
      c.glb('wall_lamp', [-1.6, 1.95, -1.78]);
      set.at.set(0.32, 0.02, -0.45); set.yaw = Math.atan2(dx - 0.32, dz + 0.45); set.look.set(-0.1, 0.95, -0.05); set.cam.set(1.1, 0.7, 2.3); set.fov = 40;
      set.pracK = (t) => 0.96 + Math.sin(t * 50) * 0.04;
    },
  },
  // ---- SUTURE: a steel table in the middle of the room, the medic on a stool behind it facing out, the patient at
  // the end with an arm laid along it; an instrument tray, a lamp on an arm, gauze, an IV pole, a cabinet of bottles
  medic: {
    shell: { w: 4.0, d: 3.4, wall: 0xa8c0b8, floor: 'tile', floorCol: 0xc8ccc4, tileCol: 0xe8ece4, wains: 1.5 },
    light: { key: [0.9, 2.6, 1.3], keyAt: [-0.1, 0.8, -0.2], keyCol: 0xfff6e8, keyI: 30, fill: [-1.3, 1.8, 1.3], fillCol: 0xd0e4ff, fillI: 5, prac: [-0.3, 1.45, -0.1], pracCol: 0xfff8f0, pracI: 1.1, pracDist: 1.6 },
    make(c) {
      const { b, set } = c;
      const tz = -0.2;
      b.add('chrome', cbox(1.2, 0.035, 0.6, 0.006), 0xd0d4d6, at(0, 0.78, tz));
      b.add('metal', cbox(1.14, 0.06, 0.54, 0.006), 0x8a8e90, at(0, 0.74, tz));
      for (const [x, z] of [[-0.55, tz - 0.25], [0.55, tz - 0.25], [-0.55, tz + 0.25], [0.55, tz + 0.25]]) b.add('chrome', prism(0.018, 0.74, 6), 0xffffff, at(x, 0.37, z));
      b.add('metal', cbox(1.1, 0.02, 0.5, 0.004), 0x6a6e70, at(0, 0.22, tz));
      for (let i = 0; i < 3; i++) c.item(['bandage', 'rag'], [-0.3 + i * 0.25, 0.25, tz], [0, i, 0]);
      // a towel under the arm, a kidney dish, the instruments laid on a tray, gauze and red swabs
      b.add('sponge', cbox(0.5, 0.012, 0.26, 0.004), 0x9ac8c0, at(-0.3, 0.805, tz - 0.02));
      b.add('chrome', cbox(0.34, 0.02, 0.22, 0.004), 0xe0e4e6, at(0.33, 0.81, tz - 0.1));
      for (let i = 0; i < 5; i++) b.add('chrome', cbox(0.012, 0.006, 0.15, 0.002), 0xffffff, at(0.22 + i * 0.05, 0.825, tz - 0.1, 0, 0.1 * (i - 2), 0));
      b.add('chrome', lathe([[0, 0], [0.08, 0], [0.09, 0.03], [0, 0.03]], 10), 0xd8dcde, at(0.3, 0.8, tz + 0.15), { rep: 0.2 });
      for (let i = 0; i < 4; i++) b.add('sponge', cbox(0.05, 0.02, 0.05, 0.01), i % 2 ? 0xe8e4d8 : 0xb82a22, at(0.12 + (i % 2) * 0.06, 0.808, tz + 0.12 + Math.floor(i / 2) * 0.05));
      c.item(['disinfectant'], [0.5, 0.86, tz + 0.12]);
      // the patient's stool at the table's left end, the medic's behind it
      c.glb('stool_low', [-0.95, 0, tz], 10);
      c.glb('stool_low', [-0.15, 0, -0.78], -20);
      // a lamp on a jointed arm clamped to the table's back edge, its pool on the arm
      b.add('metal', tube([[0.55, 0.8, tz - 0.28], [0.55, 1.45, tz - 0.4], [-0.15, 1.62, tz - 0.12]], 0.014, 10, 6), C.dark);
      b.add('enamel', lathe([[0, 0], [0.13, 0], [0.09, 0.1], [0.03, 0.14], [0, 0.14]], 10), 0x4e6a48, at(-0.2, 1.68, tz - 0.08, Math.PI));
      b.add('lamp', prism(0.07, 0.01, 10), 0xfff4e0, at(-0.2, 1.58, tz - 0.08));
      const pool = glowCard(0.9, 0.7, 0xfff4e0, 0.12); pool.rotation.x = -Math.PI / 2; pool.position.set(-0.25, 0.83, tz); c.g.add(pool);
      // an IV pole with a bag behind the patient, a cabinet with glass doors and bottles on the back wall
      b.add('chrome', prism(0.012, 1.9, 6), 0xffffff, at(-1.35, 0.95, -0.75));
      b.add('chrome', cbox(0.3, 0.012, 0.012, 0.003), 0xffffff, at(-1.35, 1.9, -0.75));
      b.add('glass', cbox(0.14, 0.22, 0.04, 0.02), 0xc8e8ff, at(-1.43, 1.72, -0.75));
      b.add('lamp', cbox(0.11, 0.1, 0.03, 0.01), 0xd84a3a, at(-1.43, 1.66, -0.75));
      b.add('metal', tube([[-1.43, 1.6, -0.75], [-1.25, 1.2, -0.5], [-0.95, 0.95, -0.25]], 0.004, 10, 4), 0xd8e0e0);
      b.add('enamel', cbox(0.9, 1.8, 0.4, 0.02), 0xe8e4d8, at(0.9, 0.9, -1.45));
      for (const y of [0.5, 0.9, 1.3]) b.add('metal', cbox(0.84, 0.02, 0.36, 0.003), 0xc8ccce, at(0.9, y, -1.42));
      for (let i = 0; i < 12; i++) b.add(i % 3 ? 'glass' : 'paint', prism(0.03, 0.12 + (i % 3) * 0.04, 6), [0x8a5a2a, 0xd8e8ff, 0x6ad0a0, 0xc8a0ff][i % 4], at(0.6 + (i % 6) * 0.11, (i < 6 ? 0.58 : 0.98) + 0.06, -1.42));
      b.add('glass', cbox(0.86, 1.6, 0.01, 0.002), 0xc8e0ff, at(0.9, 1.0, -1.24));
      c.glb('tool_cart', [1.5, 0, 0.1], -90);
      c.glb('chem_set', [1.5, 0.955, 0.1], -90);
      c.glb('clipboard', [0.42, 0.8, tz + 0.2], 25);
      set.patient = { at: new THREE.Vector3(-0.98, 0.0, tz + 0.02), yaw: Math.PI / 2 };
      set.at.set(-0.15, 0.0, -0.74); set.yaw = 0.15; set.look.set(-0.3, 0.92, -0.3); set.cam.set(0.95, 0.55, 1.95); set.fov = 36;
      set.pracK = () => 1;
    },
  },
  // ---- WELD: a doorway in the back wall boarded with planks and a plate; the unit kneels at its right edge with the
  // torch on the seam (seen side on); the welder and its bottles, a tool chest, offcuts
  weld: {
    shell: { w: 4.0, d: 3.4, wall: 0x7a8a8a, floor: 'concrete', floorCol: 0x7a766e, tileCol: 0xb8bca8 },
    light: { key: [1.3, 2.6, 1.0], keyAt: [-0.2, 0.7, -1.2], keyCol: 0xffe8c8, keyI: 26, fill: [-1.2, 1.6, 1.4], fillCol: 0xb8ccff, fillI: 4, prac: [-0.1, 1.0, -1.3], pracCol: 0xb8d8ff, pracI: 2.4, pracDist: 2.6 },
    make(c) {
      const { b, set } = c;
      const z = -1.62, cx = -0.35;
      b.add('metal', cbox(0.12, 2.1, 0.18, 0.01), 0x5a6062, at(cx - 0.65, 1.05, z));
      b.add('metal', cbox(0.12, 2.1, 0.18, 0.01), 0x5a6062, at(cx + 0.65, 1.05, z));
      b.add('metal', cbox(1.42, 0.12, 0.18, 0.01), 0x5a6062, at(cx, 2.12, z));
      b.add('rubber', cbox(1.2, 2.0, 0.02, 0.002), 0x050505, at(cx, 1.02, z - 0.06));
      const planks: [number, number][] = [[0.3, 0.06], [0.62, -0.08], [1.45, 0.1], [1.78, -0.05]];
      for (const [y, r] of planks) {
        b.add('wood', cbox(1.5, 0.16, 0.04, 0.006), 0x9a7a52, at(cx, y, z + 0.11, 0, 0, r), { rep: 0.6 });
        for (const dx of [-0.58, 0.58]) b.add('chrome', bolt(0.008, 0.01), C.steel, at(cx + dx, y + dx * Math.tan(r), z + 0.14, Math.PI / 2));
      }
      // the plate across the middle, a bead run down its right edge (the hot end still glowing)
      b.add('rust', cbox(0.9, 0.72, 0.02, 0.004), 0x8a6a4a, at(cx, 1.05, z + 0.15, 0, 0, 0.02));
      b.add('metal', cbox(0.025, 0.7, 0.02, 0.006), 0xb8a080, at(cx + 0.45, 1.05, z + 0.165));
      b.add('lamp', cbox(0.018, 0.16, 0.012, 0.004), 0xffb050, at(cx + 0.45, 0.82, z + 0.175));
      for (const [dx, dy] of [[-0.4, 0.32], [0.4, 0.32], [-0.4, -0.32], [0.4, -0.32]]) b.add('chrome', bolt(0.01, 0.01), C.steel, at(cx + dx, 1.05 + dy, z + 0.17, Math.PI / 2));
      b.add('hazard', cbox(1.4, 0.07, 0.006, 0.002), 0xffffff, at(cx, 1.98, z + 0.16, 0, 0, -0.04), { rep: 0.2 });
      c.glb('welder', [0.95, 0, -0.75], -100);
      c.glb('gas_tank', [1.55, 0, -1.4], 20);
      c.glb('propane', [1.2, 0, -1.5], -10);
      c.glb('tool_chest', [-1.5, 0, -0.9], 70);
      b.add('rubber', tube([[0.85, 0.35, -0.7], [0.75, 0.02, -0.55], [0.4, 0.02, -0.75], [0.3, 0.55, -1.1]], 0.012, 16, 5), 0x1a1a1a);
      for (let i = 0; i < 5; i++) b.add('metal', cbox(0.18 + (i % 2) * 0.1, 0.012, 0.06, 0.003), 0x6a6e70, at(-0.9 + (i % 3) * 0.12, 0.006, -0.6 + i * 0.1, 0, i * 0.7, 0));
      for (let i = 0; i < 3; i++) b.add('wood', cbox(0.9, 0.04, 0.12, 0.006), 0x9a7a52, at(-1.2, 0.02 + i * 0.04, -0.2 + i * 0.03, 0, 0.3 + i * 0.1, 0));
      const glow = glowCard(0.4, 0.4, 0xc8e0ff, 0.45); glow.position.set(cx + 0.45, 1.0, z + 0.2); c.g.add(glow);
      set.at.set(0.42, 0.0, -1.3); set.yaw = -Math.PI / 2; set.look.set(-0.05, 0.85, -1.4); set.cam.set(0.55, 0.45, 2.35); set.fov = 36;
      const tip = new THREE.Vector3(cx + 0.45, 1.0, z + 0.2);
      set.pracK = (t, on) => (on ? (Math.sin(t * 71) > -0.2 ? 0.75 + Math.sin(t * 173) * 0.25 : 0.12) : 0.03);
      set.tick = (dt, t, _hit, act) => {
        glow.visible = act > 0.15 && act < 0.9 && Math.sin(t * 71) > -0.2;
        if (glow.visible) { tip.y = 0.95 + Math.sin(t * 1.1) * 0.12; glow.position.y = tip.y; if (Math.random() < dt * 40) c.prev.emitSparks(tip, 3, 0.8); if (Math.random() < dt * 4) c.prev.addPuff(tip, 0xb8c0c8, 2.2, 0.08, 0.35); }
      };
    },
  },
  // ---- BENCH: a heavy workbench in the middle of the shop, the unit behind it facing out; a vice, parts, a lamp on
  // an arm; behind, a pegboard of tools, shelving, the tool chest
  bench: {
    shell: { w: 4.0, d: 3.4, wall: 0x8a8a6a, floor: 'concrete', floorCol: 0x86827a, tileCol: 0xc8c4a8 },
    light: { key: [1.0, 2.6, 1.2], keyAt: [-0.1, 0.9, -0.3], keyCol: 0xfff0dc, keyI: 28, fill: [-1.2, 1.8, 1.2], fillCol: 0xc8d8ff, fillI: 5, prac: [-0.25, 1.7, -0.1], pracCol: 0xffe0b0, pracI: 1.4, pracDist: 2 },
    make(c) {
      const { b, set } = c;
      const z = -0.25;
      b.add('wood', cbox(1.9, 0.07, 0.7, 0.008), 0xa8885a, at(0, 0.92, z), { rep: 0.7 });
      for (const [x, zz] of [[-0.88, z - 0.3], [0.88, z - 0.3], [-0.88, z + 0.3], [0.88, z + 0.3]]) b.add('metal', cbox(0.06, 0.9, 0.06, 0.008), 0x4e5a4a, at(x, 0.45, zz));
      b.add('metal', cbox(1.8, 0.04, 0.62, 0.006), 0x4e5a4a, at(0, 0.25, z));
      b.add('wood', cbox(1.7, 0.03, 0.56, 0.006), 0x8a6a48, at(0, 0.28, z));
      c.glb('carton', [0.45, 0.3, z], 5, 0.8);
      c.item(['scrap_metal'], [-0.5, 0.32, z], [0, 0.4, 0]);
      // the vice on the front right corner, something clamped in it
      b.add('metal', cbox(0.2, 0.12, 0.16, 0.012), 0x2e5a8a, at(0.7, 1.02, z + 0.22));
      b.add('metal', cbox(0.2, 0.12, 0.06, 0.012), 0x2e5a8a, at(0.7, 1.02, z + 0.06));
      b.add('chrome', prism(0.012, 0.3, 6), 0xffffff, at(0.7, 1.0, z + 0.36, Math.PI / 2));
      c.item(['pipe', 'scrap_metal'], [0.7, 1.12, z + 0.14], [0, Math.PI / 2, 0]);
      // the pegboard on the wall behind, a hole grid, tools on it
      b.add('wood', cbox(1.6, 0.9, 0.025, 0.004), 0xc8a878, at(0, 1.55, -1.68), { rep: 0.4 });
      for (let i = 0; i < 15; i++) for (let j = 0; j < 8; j++) b.add('rubber', cbox(0.012, 0.012, 0.004, 0.001), 0x2a2018, at(-0.75 + i * 0.107, 1.16 + j * 0.107, -1.665));
      c.item(['hammer'], [-0.55, 1.6, -1.64], [0, 0, Math.PI / 2]);
      c.item(['wrench'], [-0.25, 1.62, -1.64], [0, 0, Math.PI / 2]);
      c.item(['screwdriver'], [0.0, 1.6, -1.64], [0, 0, Math.PI / 2]);
      c.item(['saw', 'knife_kitchen'], [0.4, 1.58, -1.64], [0, 0, 0]);
      // on the bench: parts, a coil of wire, a can of screws, the toolbox open
      c.item(['scrap_metal'], [-0.15, 0.98, z + 0.12], [0, 0.6, 0]);
      c.item(['wire', 'rope'], [-0.62, 0.98, z + 0.15], [0, 0.2, 0]);
      c.item(['screwdriver'], [0.2, 0.97, z + 0.22], [0, 1.1, Math.PI / 2]);
      b.add('copper', prism(0.06, 0.05, 10), 0xc87a4a, at(0.35, 0.98, z - 0.15));
      for (let i = 0; i < 8; i++) b.add('chrome', bolt(0.008, 0.01), C.steel, at(0.1 + (i % 4) * 0.03, 0.96, z + 0.05 + Math.floor(i / 4) * 0.03));
      b.add('metal', tube([[-0.88, 0.95, z - 0.3], [-0.88, 1.65, z - 0.3], [-0.3, 1.85, z - 0.1]], 0.014, 10, 6), C.dark);
      b.add('enamel', lathe([[0, 0], [0.16, 0], [0.1, 0.12], [0.03, 0.16], [0, 0.16]], 10), 0x6e7a4a, at(-0.25, 1.92, z - 0.05, Math.PI));
      b.add('lamp', prism(0.09, 0.01, 10), 0xfff0d0, at(-0.25, 1.8, z - 0.05));
      c.glb('toolbox', [-0.55, 0.955, z - 0.12], -15);
      c.glb('shelves', [1.55, 0, -1.3], -90);
      c.glb('carton', [1.55, 0.135, -1.3], -80);
      c.glb('gallon', [1.5, 0.625, -1.2], 20);
      c.glb('tool_chest', [-1.45, 0, -1.25], 30);
      set.at.set(0.0, 0.0, -0.82); set.yaw = 0; set.look.set(0.0, 1.1, -0.45); set.cam.set(0.85, 0.45, 2.15); set.fov = 38;
      set.pracK = () => 1;
    },
  },
  // ---- KITCHEN: an enamel range on an island, a pot on a lit burner, the cook behind it facing out; a tiled
  // counter beside with a board and meat, the hood over the range, shelves of cans and hanging pans behind
  cook: {
    shell: { w: 4.0, d: 3.4, wall: 0xc8b890, floor: 'tile', floorCol: 0xb8b0a0, tileCol: 0xe8e4d8, wains: 1.45 },
    light: { key: [1.1, 2.6, 1.3], keyAt: [-0.2, 0.9, -0.3], keyCol: 0xfff0dc, keyI: 26, fill: [-1.3, 1.8, 1.2], fillCol: 0xc8d8ff, fillI: 4, prac: [0.0, 1.0, -0.15], pracCol: 0xff9a40, pracI: 1.0, pracDist: 1.6 },
    make(c) {
      const { b, set } = c;
      const z = -0.25, rx = -0.2;
      // the range: enamel body (its oven door to the room), four burners, the knob rail
      b.add('enamel', cbox(0.9, 0.9, 0.62, 0.02), 0xece8dc, at(rx, 0.45, z));
      b.add('metal', cbox(0.88, 0.02, 0.6, 0.004), 0x2a2a2a, at(rx, 0.91, z));
      for (const [x, zz] of [[-0.22, -0.13], [0.22, -0.13], [-0.22, 0.13], [0.22, 0.13]]) {
        b.add('metal', lathe([[0, 0], [0.11, 0], [0.11, 0.015], [0, 0.015]], 10), 0x1a1a1a, at(rx + x, 0.92, z + zz));
        for (let i = 0; i < 4; i++) b.add('metal', cbox(0.2, 0.012, 0.016, 0.002), 0x3a3a3a, at(rx + x, 0.94, z + zz, 0, i * Math.PI / 4, 0));
      }
      for (let i = 0; i < 4; i++) b.add('bakelite', lathe([[0, 0], [0.028, 0], [0.028, 0.03], [0, 0.03]], 8), 0xffffff, at(rx - 0.3 + i * 0.2, 0.82, z + 0.31, Math.PI / 2));
      b.add('metal', cbox(0.6, 0.36, 0.02, 0.01), 0x2a2a28, at(rx, 0.48, z + 0.31));
      b.add('glass', cbox(0.4, 0.18, 0.006, 0.003), 0xffa050, at(rx, 0.5, z + 0.322));
      b.add('lamp', cbox(0.36, 0.14, 0.004, 0.002), 0x8a3a10, at(rx, 0.5, z + 0.318));
      b.add('chrome', prism(0.012, 0.56, 6), 0xffffff, at(rx, 0.71, z + 0.35, 0, 0, Math.PI / 2));
      // the lit burner under the pan, the pot simmering at the back, steam
      b.add('lamp', lathe([[0.02, 0], [0.09, 0], [0.06, 0.035], [0, 0.04]], 10), 0x4a8aff, at(rx - 0.22, 0.935, z + 0.13));
      b.add('lamp', lathe([[0.02, 0], [0.09, 0], [0.06, 0.035], [0, 0.04]], 10), 0x4a8aff, at(rx + 0.22, 0.935, z - 0.13));
      const fl = glowCard(0.34, 0.34, 0xff8a3a, 0.4); fl.rotation.x = -Math.PI / 2; fl.position.set(rx + 0.22, 0.95, z - 0.13); c.g.add(fl);
      c.item(['pot'], [rx + 0.22, 1.02, z - 0.13]);
      c.item(['kettle', 'pot'], [rx - 0.22, 1.0, z - 0.13]);
      // the counter beside it, tiled, a cutting board with meat and a knife, a can
      b.add('paint', cbox(1.0, 0.86, 0.62, 0.012), 0x6e7a5a, at(rx + 0.98, 0.43, z), { rep: 0.5 });
      b.add('tile', cbox(1.04, 0.05, 0.66, 0.006), 0xe8e4d8, at(rx + 0.98, 0.885, z), { rep: 0.25 });
      b.add('wood', cbox(0.5, 0.03, 0.32, 0.008), 0xb88a5a, at(rx + 0.9, 0.925, z + 0.05));
      c.item(['meat_raw', 'heart_raw'], [rx + 0.85, 0.96, z + 0.05], [0, 0.4, 0]);
      c.item(['knife_kitchen'], [rx + 1.08, 0.95, z + 0.12], [0, 1.4, Math.PI / 2]);
      c.item(['can_soup'], [rx + 1.32, 0.96, z - 0.15]);
      // the hood over the range on a duct, a shelf of cans and pans on the wall behind
      b.add('metal', cbox(1.0, 0.22, 0.7, 0.02, 0.25), 0x9aa0a0, at(rx, 2.32, z - 0.05));
      b.add('metal', cbox(0.3, 0.3, 0.3, 0.01), 0x8a9090, at(rx, 2.6, z - 0.05));
      b.add('wood', cbox(1.6, 0.04, 0.24, 0.006), 0x8a6a48, at(0.3, 1.55, -1.6));
      for (let i = 0; i < 7; i++) c.item(['can_soup', 'jar', 'pot'], [-0.35 + i * 0.2, 1.63, -1.6], [0, i, 0]);
      b.add('chrome', prism(0.01, 1.2, 6), 0xffffff, at(0.3, 2.05, -1.62, 0, 0, Math.PI / 2));
      c.item(['frying_pan', 'pan'], [-0.05, 1.88, -1.6], [Math.PI / 2, 0, 0]);
      c.item(['pan', 'pot'], [0.45, 1.85, -1.6], [Math.PI / 2, 0, 0.2]);
      c.glb('shelves', [-1.55, 0, -0.9], 90);
      c.glb('gallon', [-1.6, 0.625, -0.8], 20);
      c.glb('kettle', [-1.5, 1.155, -1.0], -30);
      c.glb('carton', [-1.55, 0.135, -0.9], 85);
      set.at.set(-0.1, 0.0, -0.84); set.yaw = 0; set.look.set(0.05, 1.05, -0.4); set.cam.set(0.9, 0.5, 2.0); set.fov = 36;
      const steam = new THREE.Vector3(rx + 0.22, 1.15, z - 0.13);
      set.pracK = (t) => 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.06;
      set.tick = (dt, t) => { fl.scale.setScalar(0.9 + Math.sin(t * 13) * 0.08); if (Math.random() < dt * 5) c.prev.addPuff(steam, 0xf0f4f8, 2.6, 0.1, 0.3); };
    },
  },
  // ---- GROW ROOM: a planter box in the middle under a grow lamp with the botanist behind it facing out, another along
  // the wall behind, a hydro rack, an irrigation pipe, sacks of compost
  garden: {
    shell: { w: 4.2, d: 3.6, wall: 0x8aa080, floor: 'concrete', floorCol: 0x6e6a60, tileCol: 0xc8d4b8 },
    light: { key: [1.2, 2.6, 1.3], keyAt: [-0.2, 0.5, -0.4], keyCol: 0xfff4e4, keyI: 24, fill: [-1.3, 1.6, 1.3], fillCol: 0xd0e0ff, fillI: 4, prac: [-0.1, 1.2, 0.1], pracCol: 0xffc8f0, pracI: 1.6, pracDist: 2 },
    make(c) {
      const { b, set } = c;
      for (const [x, z] of [[-0.1, -0.2], [-0.4, -1.4], [0.85, -1.4]] as [number, number][]) {
        b.add('wood', cbox(1.1, 0.42, 0.62, 0.01), 0x8a6a48, at(x, 0.21, z), { rep: 0.5 });
        for (let i = 0; i < 3; i++) b.add('wood', cbox(1.12, 0.012, 0.64, 0.002), 0x6a4a30, at(x, 0.06 + i * 0.14, z));
        b.add('concrete', cbox(1.02, 0.04, 0.54, 0.008), 0x3a2a1a, at(x, 0.41, z), { rep: 0.3 });
        for (let i = 0; i < 4; i++) {
          const px = x - 0.36 + i * 0.24, h = 0.2 + ((i * 37 + Math.round(z * 10)) % 5) * 0.06;
          b.add('wood', prism(0.008, h, 4), 0x4a7a3a, at(px, 0.43 + h / 2, z));
          for (let l = 0; l < 7; l++) b.add('leather', gem(0.05 + (l % 2) * 0.025, 5, 0.012), [0x5aa04a, 0x4a8a3a, 0x7ab85a][l % 3], at(px + Math.cos(l * 2.1) * 0.06, 0.47 + l * h / 7, z + Math.sin(l * 2.1) * 0.06, 0.6, l * 1.3, 0.4));
          if (i % 2) b.add('paint', gem(0.025, 6, 0.03), 0xd84a3a, at(px + 0.03, 0.47 + h * 0.6, z + 0.04));
          if (i % 2 === 0) b.add('wood', cbox(0.05, 0.08, 0.004, 0.001), 0xe8e2d0, at(px + 0.08, 0.47, z + 0.22, -0.2));
        }
      }
      c.glb('plant_small', [-1.6, 0, -0.6]);
      c.glb('plant_small', [-1.45, 0, 0.1], 50);
      c.glb('plant_small', [1.65, 0.92, -0.65], 20);
      // the grow lamp over the middle box: a long hood on chains, a lit tube, its pink-white pool on the soil
      b.add('metal', cbox(1.4, 0.06, 0.24, 0.01), 0x3a3e40, at(-0.1, 2.1, 0.05));
      b.add('lamp', cbox(1.3, 0.02, 0.12, 0.004), 0xffd8f8, at(-0.1, 2.065, 0.05));
      for (const x of [-0.7, 0.5]) b.add('chrome', prism(0.006, 0.5, 4), 0xffffff, at(x, 2.4, 0.05));
      const pool = glowCard(1.8, 1.0, 0xffd0f0, 0.1); pool.rotation.x = -Math.PI / 2; pool.position.set(-0.1, 0.44, -0.2); c.g.add(pool);
      b.add('metal', cbox(2.4, 0.06, 0.24, 0.01), 0x3a3e40, at(0.2, 2.0, -1.4));
      b.add('lamp', cbox(2.3, 0.02, 0.12, 0.004), 0xfff0e0, at(0.2, 1.965, -1.4));
      // irrigation along the back boxes, a tap and a hose
      b.add('copper', tube([[-1.15, 0.5, -1.75], [1.6, 0.5, -1.75]], 0.016, 2, 6, false), 0xc87a4a);
      for (let i = 0; i < 8; i++) b.add('copper', prism(0.006, 0.08, 4), 0xc87a4a, at(-1.0 + i * 0.32, 0.46, -1.73));
      b.add('brass', lathe([[0, 0], [0.05, 0], [0.05, 0.02], [0, 0.03]], 6), 0xc8a050, at(-1.6, 0.9, -1.75, Math.PI / 2));
      b.add('rubber', tube([[-1.6, 0.88, -1.7], [-1.5, 0.05, -1.3], [-1.0, 0.03, 0.3]], 0.016, 12, 5), 0x2e6a3a);
      // a hydro rack, sacks of compost
      b.add('metal', cbox(0.5, 1.6, 0.4, 0.01), 0x8a9090, at(1.75, 0.8, -0.65));
      for (const y of [0.4, 0.92]) { b.add('metal', cbox(0.48, 0.03, 0.38, 0.004), 0x6a7070, at(1.75, y, -0.65)); b.add('lamp', cbox(0.44, 0.01, 0.04, 0.002), 0xd8a8ff, at(1.75, y + 0.42, -0.65)); }
      for (let i = 0; i < 3; i++) b.add('sponge', cbox(0.42, 0.55, 0.28, 0.08, 0.1), 0x9a7a4a, at(1.3 + i * 0.12, 0.27, 0.35 + i * 0.25, 0, 0.3 * i, 0.05));
      c.glb('gallon', [-1.1, 0, -0.2], 30);
      c.item(['bucket', 'pot'], [0.85, 0.0, -0.6]);
      set.at.set(-0.15, 0.0, -0.82); set.yaw = 0; set.look.set(-0.1, 0.98, -0.45); set.cam.set(0.95, 0.55, 2.3); set.fov = 40;
      set.pracK = () => 1;
      set.tick = (dt, _t, _h, act) => { if (act > 0.3 && act < 0.8 && Math.random() < dt * 12) c.prev.addPuff(new THREE.Vector3(-0.05, 0.6, -0.3), 0xc8e8ff, 0.6, 0.03, -0.6); };
    },
  },
  // ---- THE GROW ROOM (round 25): pale tiles under racks of fluorescent tubes; a hydroponic tray of strip cress down the
  // right wall, a fungus bed of glowing bluecaps in the back corner, beds at every stage (cress just sprouting, cotton
  // burst, peppers ripe and red, hush mint crawling with mites, one bed wilted), the irrigation line along the back,
  // seed on a shelf, a can and a hoe. The unit kneels at the pepper bed and picks by hand.
  grow: {
    shell: { w: 4.4, d: 3.8, wall: 0x9ab8a4, floor: 'tile', floorCol: 0xa8b0a2, tileCol: 0xdde8d8, wains: 1.2 },
    light: { key: [1.1, 2.7, 1.4], keyAt: [-0.3, 0.5, -0.3], keyCol: 0xf6fbff, keyI: 30, fill: [-1.4, 1.9, 1.4], fillCol: 0xd8eeff, fillI: 6, prac: [0.9, 1.6, -0.7], pracCol: 0xeafff2, pracI: 2.4, pracDist: 2.8 },
    make(c) {
      const { b, set, g } = c;
      const O = (key: string, st: Record<string, unknown>, x: number, z: number, r = 0) => { const m = objMesh(key, st, r); if (m) { m.position.set(x, 0, z); g.add(m); } };
      // a third wall on the right (the hydro tray's shot looks that way): tiles to the wainscot, paint above, a skirting
      b.add('paint', cbox(0.08, 2.7, 3.8, 0.006), 0x9ab8a4, at(2.24, 1.35, 0), { rep: 0.9 });
      b.add('tile', cbox(0.03, 1.2, 3.8, 0.004), 0xdde8d8, at(2.19, 0.6, 0), { rep: 0.15 });
      b.add('wood', cbox(0.04, 0.1, 3.8, 0.004), 0x3a5a44, at(2.17, 0.05, 0));
      O('bld_hydro_tray', { crop: 'strip_cress', stage: 4, water: 80 }, 1.45, -0.7, 1);
      O('bld_fungus_bed', { crop: 'bluecap', stage: 4, water: 60 }, -1.6, -1.45);
      O('bld_planter', { crop: 'lint_cotton', stage: 4, water: 60 }, -0.55, -1.48);
      O('bld_planter', { crop: 'strip_cress', stage: 1, water: 70 }, 0.42, -1.5);
      O('bld_planter', { crop: 'exit_pepper', stage: 4, water: 70, tilled: true }, -0.85, 0.3);
      O('bld_planter', { crop: 'hush_mint', stage: 3, water: 70, pest: 0.85 }, 0.55, 0.45);
      O('bld_planter', { crop: 'exit_pepper', stage: 5, water: 10 }, -1.72, -0.45, 1);
      // the tube racks over the beds: green steel hoods on chains, two tubes each, a pool of light on the soil
      for (const [x, z, w] of [[-0.85, 0.3, 1.1], [0.55, 0.45, 1.1], [-0.1, -1.48, 2.2]] as [number, number, number][]) {
        b.add('metal', cbox(w, 0.05, 0.26, 0.01), 0x3a5a44, at(x, 2.15, z));
        for (const dz of [-0.06, 0.06]) b.add('lamp', cbox(w - 0.08, 0.022, 0.03, 0.004), 0xf4fff8, at(x, 2.115, z + dz));
        for (const dx of [-w * 0.4, w * 0.4]) b.add('chrome', prism(0.005, 0.55, 4), 0xffffff, at(x + dx, 2.45, z));
        const pool = glowCard(w + 0.5, 0.9, 0xf0fff4, 0.07); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.5, z); g.add(pool);
      }
      // irrigation along the back wall: a copper line, drip spurs, a brass tap and a green hose to the front beds
      b.add('copper', tube([[-2.0, 0.62, -1.82], [2.0, 0.62, -1.82]], 0.016, 2, 6, false), 0xc87a4a);
      for (let i = 0; i < 10; i++) b.add('copper', prism(0.006, 0.1, 4), 0xc87a4a, at(-1.8 + i * 0.4, 0.57, -1.8));
      b.add('brass', lathe([[0, 0], [0.05, 0], [0.05, 0.02], [0, 0.03]], 6), 0xc8a050, at(-2.0, 1.0, -1.82, Math.PI / 2));
      b.add('rubber', tube([[-1.95, 0.98, -1.78], [-1.9, 0.04, -1.0], [-1.25, 0.03, 0.85], [0.1, 0.03, 0.95]], 0.016, 14, 5), 0x2e6a3a);
      // a shelf of seed and spray on the back wall, a timer box, a clipboard
      b.add('wood', cbox(1.2, 0.03, 0.26, 0.006), 0x8a6a48, at(-0.4, 1.32, -1.76));
      for (const x of [-0.9, 0.1]) b.add('metal', cbox(0.03, 0.18, 0.2, 0.004), 0x4a4e50, at(x, 1.23, -1.78));
      c.item(['spawn_bluecap'], [-0.85, 1.335, -1.74], [0, 0.3, 0]);
      c.item(['seeds_cress'], [-0.55, 1.335, -1.72], [0, 0.6, 0]);
      c.item(['seeds_pepper'], [-0.3, 1.335, -1.72], [0, -0.4, 0]);
      c.item(['mite_spray'], [0.0, 1.335, -1.74]);
      c.item(['seeds_mint'], [-0.1, 1.335, -1.7], [0, 0.2, 0]);
      b.add('paint', cbox(0.22, 0.28, 0.06, 0.01), 0xe8e0c8, at(1.0, 1.4, -1.86));
      b.add('lamp', cbox(0.06, 0.03, 0.004, 0.001), 0x3aff6a, at(1.0, 1.46, -1.828));
      c.item(['watering_can', 'bucket'], [0.0, 0.0, 0.95], [0, -0.7, 0]);
      c.item(['hoe'], [-2.08, 0.02, 0.6], [0, 0.2, 1.25]);
      c.item(['exit_pepper'], [-0.2, 0.0, 0.85], [0, 0.4, 0]);
      c.glb('gallon', [1.7, 0, 0.75], 30);
      c.glb('plant_small', [1.85, 0, 1.1], 60);
      set.at.set(-1.48, 0.0, 0.3); set.yaw = Math.PI / 2; set.look.set(-0.95, 0.62, 0.15); set.cam.set(1.15, 0.72, 2.05); set.fov = 40;
      set.pracK = (t) => 1 + Math.sin(t * 47) * 0.015;
    },
  },
  // ---- THE PEN: plank fencing, straw bedding, a trough in the middle with the moon calf at it side on; the handler
  // behind the trough facing out; hay bales, feed sacks, a pitchfork
  pen: {
    shell: { w: 4.4, d: 3.8, wall: 0x9a8a6a, floor: 'wood', floorCol: 0x8a7a5a, tileCol: 0xc8bc98, wains: 0.9 },
    light: { key: [1.3, 2.7, 1.4], keyAt: [0.0, 0.4, -0.4], keyCol: 0xfff0d8, keyI: 30, fill: [-1.4, 1.8, 1.4], fillCol: 0xd0dcff, fillI: 5, prac: [-1.6, 2.0, -1.6], pracCol: 0xffd8a0, pracI: 2 },
    make(c) {
      const { b, set } = c;
      for (let i = 0; i < 90; i++) { const a = i * 2.39996, r = 0.25 + (i % 17) * 0.09; b.add('wood', cbox(0.14, 0.006, 0.012, 0.002), [0xe8c870, 0xd8b860, 0xc8a850][i % 3], at(0.1 + Math.cos(a) * r, 0.034 + (i % 3) * 0.003, -0.4 + Math.sin(a) * r * 0.8, 0, a * 3, 0)); }
      b.add('sponge', cbox(2.8, 0.03, 2.4, 0.01), 0xd8b860, at(0.1, 0.015, -0.4), { rep: 0.3 });
      for (let i = 0; i < 6; i++) b.add('wood', cbox(0.09, 1.05, 0.09, 0.012), 0x7a5a3a, at(-1.3 + i * 0.6, 0.52, -1.55));
      for (const y of [0.3, 0.62, 0.94]) b.add('wood', cbox(3.2, 0.1, 0.04, 0.008), 0x8a6a48, at(0.2, y, -1.5, 0, 0, (y - 0.6) * 0.03), { rep: 0.7 });
      for (let i = 0; i < 4; i++) b.add('wood', cbox(0.09, 1.05, 0.09, 0.012), 0x7a5a3a, at(1.75, 0.52, -1.3 + i * 0.6));
      for (const y of [0.3, 0.62, 0.94]) b.add('wood', cbox(0.04, 0.1, 2.0, 0.008), 0x8a6a48, at(1.72, y, -0.4));
      // the trough: a steel tub on legs across the middle, feed in it
      const tx = 0.35, tz = -0.45;
      b.add('wood', cbox(1.1, 0.24, 0.36, 0.02, 0.15), 0x9a7a52, at(tx, 0.4, tz), { rep: 0.5 });
      b.add('sponge', cbox(1.0, 0.04, 0.28, 0.01), 0xc8a860, at(tx, 0.5, tz));
      for (const x of [tx - 0.5, tx + 0.5]) b.add('wood', cbox(0.08, 0.3, 0.42, 0.01), 0x7a5a3a, at(x, 0.15, tz));
      for (const x of [tx - 0.3, tx + 0.3]) b.add('metal', cbox(0.03, 0.26, 0.38, 0.004), 0x5a5e60, at(x, 0.4, tz));
      for (let i = 0; i < 3; i++) b.add('chrome', bolt(0.012, 0.01), C.steel, at(tx - 0.4 + i * 0.4, 0.42, tz + 0.182, Math.PI / 2));
      for (const [x, y, z, r] of [[-1.35, 0.2, -1.2, 0.1], [-1.35, 0.2, -0.7, -0.05], [-1.3, 0.6, -0.95, 0.2]] as [number, number, number, number][]) {
        b.add('sponge', cbox(0.75, 0.4, 0.45, 0.05), 0xd8b860, at(x, y, z, 0, r, 0), { rep: 0.25 });
        for (const dx of [-0.2, 0.2]) b.add('rubber', cbox(0.02, 0.41, 0.46, 0.003), 0x8a4a2a, at(x + dx * Math.cos(r), y, z - dx * Math.sin(r), 0, r, 0));
      }
      for (let i = 0; i < 2; i++) b.add('sponge', cbox(0.4, 0.6, 0.25, 0.08, 0.12), 0xc8b088, at(1.1 + i * 0.35, 0.3, -1.3 + i * 0.05, 0, 0.2 * i, 0));
      b.add('wood', prism(0.016, 1.6, 5), 0x9a7a52, at(-1.7, 0.85, 0.3, 0, 0, 0.15));
      for (let i = 0; i < 4; i++) b.add('chrome', prism(0.006, 0.28, 4), 0xffffff, at(-1.82 + i * 0.03, 1.72, 0.3, 0, 0, 0.15));
      c.glb('drum', [1.45, 0, 0.5]);
      c.glb('hand_truck', [-1.2, 0, 1.0], 40);
      c.glb('wall_lamp', [-1.6, 1.95, -1.88]);
      c.item(['bucket', 'pot'], [0.95, 0.0, -0.95]);
      c.item(['bucket', 'pot'], [-0.62, 0.0, -0.66], [0, 0.6, 0]);
      set.at.set(0.45, 0.0, -0.98); set.yaw = -0.25; set.look.set(0.0, 0.85, -0.55); set.cam.set(0.55, 0.8, 2.6); set.fov = 40;
      set.pracK = () => 1;
      set.tick = (dt, _t, _h, act) => { if (act > 0.35 && act < 0.85 && Math.random() < dt * 14) c.prev.addPuff(new THREE.Vector3(0.4, 0.62, -0.45), 0xd8c088, 0.5, 0.025, -0.5); };
    },
  },
  // ---- STORE ROOM: steel shelving, cartons, a crate pried open in the middle with the unit behind it going through it,
  // a cage locker door ajar, a cart, a drum, a hand truck
  store: {
    shell: { w: 4.2, d: 3.6, wall: 0x7a8478, floor: 'concrete', floorCol: 0x7a766e, tileCol: 0xb0b4a4 },
    light: { key: [1.0, 2.6, 1.4], keyAt: [-0.1, 0.6, -0.4], keyCol: 0xffecd0, keyI: 24, fill: [-1.3, 1.6, 1.3], fillCol: 0xb8c8ff, fillI: 4, prac: [0.1, 0.9, 0.1], pracCol: 0xfff0c8, pracI: 1.2, pracDist: 2 },
    make(c) {
      const { b, set } = c;
      c.glb('shelves', [-0.4, 0, -1.55]);
      c.glb('carton', [-0.4, 0.135, -1.55], 90);
      c.glb('carton', [-0.5, 0.625, -1.5], 80);
      c.glb('gallon', [-0.2, 1.155, -1.52], 10);
      c.glb('shelves', [0.75, 0, -1.55]);
      c.glb('radio', [0.75, 1.155, -1.55], 10);
      c.glb('carton', [0.75, 0.625, -1.55], 95);
      c.glb('storage_cart', [-1.55, 0, -0.5], 90);
      c.glb('drum', [1.55, 0, -1.3]);
      c.glb('hand_truck', [1.4, 0, 0.5], -60);
      c.glb('power_box', [1.9, 1.3, -0.5], -90);
      // a wooden crate pried open, its lid against it, straw spilling, things in it
      const cx = 0.05, cz = -0.25;
      b.add('wood', cbox(0.8, 0.5, 0.55, 0.012), 0x9a7a52, at(cx, 0.25, cz), { rep: 0.5 });
      for (const y of [0.08, 0.42]) b.add('wood', cbox(0.82, 0.06, 0.57, 0.004), 0x7a5a3a, at(cx, y, cz));
      b.add('rubber', cbox(0.74, 0.02, 0.49, 0.004), 0x1a1410, at(cx, 0.49, cz));
      b.add('wood', cbox(0.82, 0.03, 0.57, 0.006), 0x9a7a52, at(cx + 0.5, 0.3, cz + 0.32, 0.2, 0.4, 1.2));
      for (let i = 0; i < 16; i++) b.add('wood', cbox(0.1, 0.005, 0.01, 0.002), 0xe0c070, at(cx - 0.3 + (i % 8) * 0.08, 0.51, cz - 0.15 + Math.floor(i / 8) * 0.25, 0, i, 0.2));
      for (let i = 0; i < 10; i++) b.add('wood', cbox(0.1, 0.005, 0.01, 0.002), 0xe0c070, at(cx - 0.4 + i * 0.09, 0.006, cz + 0.35 + (i % 3) * 0.05, 0, i * 1.7, 0));
      c.item(['can_soup'], [cx - 0.15, 0.55, cz - 0.05]);
      c.item(['battery', 'flashlight'], [cx + 0.15, 0.53, cz + 0.05], [0, 0.8, 0]);
      c.item(['scrap_metal'], [cx - 0.55, 0.02, cz + 0.4], [0, 0.5, 0]);
      c.item(['rope', 'wire'], [cx + 0.6, 0.02, cz - 0.3], [0, 0.2, 0]);
      b.add('metal', cbox(0.05, 1.9, 0.7, 0.008), 0x5a6a5a, at(-2.06, 0.95, -1.2));
      b.add('metal', cbox(0.7, 1.86, 0.03, 0.006), 0x6a7a6a, at(-1.7, 0.95, -0.82, 0, -0.9, 0));
      for (let i = 0; i < 9; i++) b.add('metal', cbox(0.66, 0.008, 0.035, 0.002), 0x4a5a4a, at(-1.7, 0.2 + i * 0.2, -0.82, 0, -0.9, 0));
      set.at.set(0.05, 0.0, -0.82); set.yaw = 0; set.look.set(0.05, 0.8, -0.4); set.cam.set(0.95, 0.65, 2.1); set.fov = 40;
      set.pracK = (t) => 0.9 + Math.sin(t * 2.7) * 0.1;
    },
  },
  // ---- THE RESEARCH BENCH: a tiled island bench, the researcher behind it facing out; the old brass microscope, the
  // burner lit under a flask, a rack of tubes, a CRT terminal; a fume cupboard window and shelving behind
  lab: {
    shell: { w: 4.0, d: 3.4, wall: 0xa8b8c0, floor: 'tile', floorCol: 0xb8bcb4, tileCol: 0xe4e8e0, wains: 1.4 },
    light: { key: [1.0, 2.6, 1.3], keyAt: [-0.1, 0.9, -0.3], keyCol: 0xfff4e8, keyI: 26, fill: [-1.3, 1.8, 1.2], fillCol: 0xc8dcff, fillI: 5, prac: [0.6, 1.15, -0.05], pracCol: 0x7aff9a, pracI: 0.8, pracDist: 1.4 },
    make(c) {
      const { b, set } = c;
      const z = -0.25;
      b.add('enamel', cbox(2.2, 0.86, 0.66, 0.012), 0x5a6a5a, at(0, 0.43, z), { rep: 0.5 });
      b.add('tile', cbox(2.26, 0.05, 0.72, 0.006), 0xf0f0e8, at(0, 0.885, z), { rep: 0.2 });
      for (let i = 0; i < 4; i++) { b.add('metal', cbox(0.46, 0.18, 0.02, 0.006), 0x4a5a4a, at(-0.82 + i * 0.55, 0.65, z + 0.335)); b.add('chrome', cbox(0.16, 0.02, 0.03, 0.006), 0xffffff, at(-0.82 + i * 0.55, 0.72, z + 0.35)); }
      c.glb('microscope_old', [-0.55, 0.91, z], 200);
      c.glb('bunsen', [0.15, 0.91, z - 0.05]);
      c.glb('chem_set', [0.85, 0.91, z + 0.05], 0, 0.9);
      c.glb('clipboard', [-0.15, 0.91, z + 0.2], 10);
      b.add('lamp', lathe([[0.012, 0], [0.02, 0.03], [0.006, 0.09], [0, 0.1]], 6), 0x6a9aff, at(0.15, 1.08, z - 0.05));
      for (let i = 0; i < 3; i++) b.add('metal', prism(0.005, 0.2, 4), C.dark, at(0.15 + Math.cos(i * 2.1) * 0.07, 1.0, z - 0.05 + Math.sin(i * 2.1) * 0.07));
      b.add('glass', lathe([[0, 0], [0.07, 0.01], [0.075, 0.05], [0.02, 0.12], [0.02, 0.18], [0, 0.18]], 10), 0xc8f0ff, at(0.15, 1.1, z - 0.05));
      b.add('lamp', lathe([[0, 0], [0.065, 0.01], [0.068, 0.045], [0, 0.045]], 10), 0x6aff9a, at(0.15, 1.105, z - 0.05));
      b.add('metal', cbox(0.3, 0.04, 0.1, 0.006), C.steel, at(-0.95, 0.94, z + 0.15));
      for (let i = 0; i < 6; i++) b.add(i % 2 ? 'glass' : 'lamp', prism(0.012, 0.12, 6), [0xff8a6a, 0x8affc8, 0xffe08a][i % 3], at(-1.07 + i * 0.045, 1.0, z + 0.15));
      // the terminal on the bench end, its screen turned to the room
      b.add('paint', cbox(0.5, 0.42, 0.42, 0.03), C.beige, at(0.62, 1.12, z - 0.15));
      b.add('screen', cbox(0.36, 0.27, 0.01, 0.004), 0x1a5a2a, at(0.62, 1.14, z + 0.065));
      for (let i = 0; i < 6; i++) b.add('lamp', cbox(0.24 - (i % 3) * 0.05, 0.012, 0.004, 0.001), 0x7aff9a, at(0.58 - (i % 3) * 0.02, 1.22 - i * 0.03, z + 0.072));
      b.add('metal', cbox(1.5, 0.9, 0.04, 0.01), 0x8a9090, at(-0.4, 1.75, -1.66));
      b.add('glass', cbox(1.36, 0.76, 0.01, 0.002), 0xc8e8ff, at(-0.4, 1.75, -1.63));
      b.add('enamel', cbox(1.5, 0.86, 0.6, 0.012), 0x5a6a5a, at(-0.4, 0.43, -1.4), { rep: 0.5 });
      b.add('tile', cbox(1.54, 0.04, 0.64, 0.006), 0xf0f0e8, at(-0.4, 0.88, -1.4), { rep: 0.2 });
      c.glb('chem_set', [-0.6, 0.9, -1.45], 180);
      c.glb('kettle', [-0.05, 0.9, -1.45], 20);
      c.glb('shelves', [1.6, 0, -1.0], -90);
      c.glb('radio', [1.6, 1.155, -1.0], -90);
      set.at.set(-0.2, 0.0, -0.86); set.yaw = 0; set.look.set(-0.05, 1.12, -0.45); set.cam.set(0.9, 0.45, 2.15); set.fov = 38;
      set.pracK = (t) => 0.9 + Math.sin(t * 31) * 0.05;
    },
  },
};
