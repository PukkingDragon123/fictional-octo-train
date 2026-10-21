// Backpack-grid data: hand-picked footprints (and 3D sizes for the iron cube)
// for items whose shape the heuristic in grid.ts would get wrong, bag
// interiors, the tool roll, and the pockets each garment carries. Footprints are [w, h] in cells at rot 0 (h is the long
// side for long things: a rifle is 2 wide and 5 tall). A cell is roughly the
// size of a fist; a can or a pill bottle fills one.

/** item key -> footprint (ItemDef.grid wins over this table) */
export const FOOT: Record<string, [number, number]> = {
  // long things
  crowbar: [1, 4], tire_iron: [1, 3], bat_baseball: [1, 4], bat_nailed: [1, 4], golf_club: [1, 5], pool_cue: [1, 5],
  hockey_stick: [2, 5], tennis_racket: [2, 3], broom: [2, 5], mop: [2, 5], spear_wood: [1, 5], spear_knife: [1, 5],
  nailed_plank: [1, 5], plank: [1, 5], pipe: [1, 4], pipe_lead: [1, 3], fluoro_tube: [1, 5], pool_noodle: [1, 5],
  umbrella: [1, 4], shovel: [2, 5], axe: [2, 4], fire_axe: [2, 4], sledgehammer: [2, 4], baton: [1, 3], machete: [1, 3],
  rolling_pin: [1, 2], frying_pan: [2, 3], saw: [1, 3], bolt_cutters: [1, 3], crutch: [1, 5], crutch_wood: [1, 5],
  torch: [1, 3], splint: [1, 2], peg_leg: [1, 4], prosthetic_leg: [2, 4], hook_hand: [1, 2], prosthetic_hand: [1, 2],
  rifle: [2, 5], shotgun: [2, 5], rifle_hunting: [2, 5], carbine: [2, 4], smg: [2, 3], baton_guard: [1, 3], taser: [1, 2],
  // blades and tools
  knife_kitchen: [1, 2], knife_hunting: [1, 2], pocket_knife: [1, 1], shiv: [1, 1], scalpel: [1, 1], box_cutter: [1, 1],
  multitool: [1, 1], screwdriver: [1, 2], hammer: [1, 2], wrench: [1, 2], pliers: [1, 2], trowel: [1, 2], scissors: [1, 1],
  can_opener: [1, 1], soldering_iron: [1, 2], multimeter: [1, 2], flashlight: [1, 2], fire_extinguisher: [2, 3],
  pistol: [2, 1], flare_gun: [2, 1], nail_gun: [2, 2], slingshot: [1, 2],
  // bottles and jugs
  water_bottle: [1, 2], almond_water: [1, 2], wine: [1, 2], whiskey: [1, 2], beer: [1, 2], empty_bottle: [1, 2], molotov: [1, 2],
  glass_bottle_throw: [1, 2], soda_bottle_2l: [1, 2], cooking_oil: [1, 2], milk: [1, 2], bleach: [1, 2], disinfectant: [1, 2],
  canteen: [1, 2], thermos: [1, 2], water_jug: [2, 2], gas_can: [2, 2], bucket: [2, 2], spray_paint: [1, 2], walkie_talkie: [1, 2],
  // clothing (folded)
  jacket_denim: [2, 2], jacket_leather: [2, 2], coat_winter: [2, 3], raincoat: [2, 2], lab_coat: [2, 2], janitor_uniform: [2, 2],
  prison_jumpsuit: [2, 2], hoodie: [2, 2], sweater: [2, 2], boots_work: [2, 2], sneakers: [2, 2], dress_shoes: [2, 2], slippers: [2, 1],
  hard_hat: [2, 2], helmet_bike: [2, 2], gas_mask: [2, 2], bailiff_band: [1, 1], wrist_monitor: [1, 1], wristwatch: [1, 1],
  // reading, electronics
  laptop: [2, 2], radio_portable: [2, 2], newspaper: [2, 2], childrens_book: [2, 2], employee_handbook: [1, 2], vhs_tape: [1, 2],
  car_battery: [2, 2], camera_polaroid: [1, 1], binoculars: [2, 1],
  // bags and kits (bags inside bags; see bagFootprint for folding)
  backpack_school: [3, 3], backpack_crafted: [3, 3], backpack_hiking: [3, 4], duffel_bag: [4, 3], briefcase: [3, 2],
  tote_bag: [2, 2], purse: [2, 2], fanny_pack: [2, 1], plastic_bag: [1, 1], garbage_bag: [1, 1],
  first_aid_kit: [2, 2], sewing_kit: [1, 1], toolbox_item: [3, 2],
  // camping, bedding, bulk
  tent_kit: [2, 4], sleeping_bag_item: [2, 3], blanket: [2, 2], pillow_item: [2, 2], bedsheet: [2, 2], tarp: [2, 2],
  campfire_kit: [2, 2], rain_collector_kit: [3, 3], trap_box_item: [3, 2], basketball: [2, 2], teddy_bear: [2, 2],
  firewood: [2, 1], birthday_cake: [2, 2], pizza_frozen: [2, 2], cereal: [1, 2], bread: [1, 2],
  limb_leg: [2, 5], limb_leg_rot: [2, 5], limb_arm: [1, 4], limb_arm_rot: [1, 4], limb_shin: [1, 3], limb_shin_rot: [1, 3],
  furniture: [6, 6],
};

/**
 * item key -> 3D size [w, l, t] where the footprint table's guess is wrong
 * (t = how tall it stands lying flat; anything else gets t from its model).
 * Other systems may also call setSize3() in src/items/grid.ts.
 */
export const FOOT3: Record<string, [number, number, number]> = {
  bucket: [2, 2, 2], water_jug: [2, 2, 3], gas_can: [2, 2, 3], fire_extinguisher: [2, 3, 2], car_battery: [2, 2, 2],
  toolbox_item: [3, 2, 2], first_aid_kit: [2, 2, 1], radio_portable: [2, 2, 2], laptop: [2, 2, 1], thermos: [1, 2, 1],
  basketball: [2, 2, 2], teddy_bear: [2, 2, 2], pillow_item: [2, 2, 1], blanket: [2, 2, 1], sleeping_bag_item: [2, 3, 2],
  tent_kit: [2, 4, 2], birthday_cake: [2, 2, 2], frying_pan: [2, 3, 1], helmet_bike: [2, 2, 2], hard_hat: [2, 2, 2], gas_mask: [2, 2, 1],
  backpack_school: [3, 3, 2], backpack_crafted: [3, 3, 2], backpack_hiking: [3, 4, 2], duffel_bag: [4, 3, 2], briefcase: [3, 2, 1],
  sledgehammer: [2, 4, 1], axe: [2, 4, 1], fire_axe: [2, 4, 1], shovel: [2, 5, 1],
  iron_cube: [5, 5, 5], tool_roll: [2, 3, 1], crude_axe: [2, 4, 1], chair_leg: [1, 4, 1], sharp_iron: [1, 2, 1], cloth_strips: [1, 1, 1],
};

/** the iron cube and anything built like it: interior [w, l, layers] */
export const BAG_GRID3: Record<string, [number, number, number]> = { iron_cube: [5, 5, 5] };

/** loops on the tool roll (plus one quick-draw holster) */
export const TOOL_ROLL_LOOPS = 6;

const TOOL_TAGS = new Set(['hammer', 'saw', 'sharp', 'knife', 'screwdriver', 'wrench', 'pliers', 'crowbar', 'axe', 'whetstone', 'scissors', 'can_opener', 'multitool',
  'needle', 'bolt_cutters', 'shovel', 'sledge', 'tapemeasure', 'lockpick', 'torch', 'flashlight', 'soldering', 'multimeter', 'trowel', 'file', 'chisel', 'hard']);
/** what goes in the tool roll's loops: tools, hand weapons, a torch (not bags, not food, nothing huge) */
export function isToolDef(d: { cat: string; tags?: string[]; weapon?: { kind: string; twoHanded?: boolean }; heavy?: boolean; bag?: unknown; light?: unknown; key: string }): boolean {
  if (d.heavy || d.bag) return false;
  if (d.cat === 'tool' || d.cat === 'light') return true;
  if (d.weapon && d.weapon.kind !== 'firearm' && d.weapon.kind !== 'thrown') return true;
  return (d.tags || []).some((t) => TOOL_TAGS.has(t));
}

/** bag item key -> interior grid [w, h] (unknown bags are sized from their capacity) */
export const BAG_GRID: Record<string, [number, number]> = {
  issue_pack: [6, 5], issued_pack: [6, 5], remittance_pack: [6, 5],
  backpack_school: [6, 5], backpack_crafted: [6, 6], backpack_hiking: [8, 7], duffel_bag: [9, 4], briefcase: [5, 3],
  tote_bag: [4, 4], purse: [3, 3], plastic_bag: [3, 3], garbage_bag: [5, 4], fanny_pack: [4, 2],
  first_aid_kit: [4, 2], sewing_kit: [2, 2], toolbox_item: [5, 3],
};

/** a pocket on a garment: its grid and where it sits on the laid-out body (doll art pixels) */
export interface PocketDef { id: string; label: string; w: number; h: number }

const P = (id: string, label: string, w: number, h: number): PocketDef => ({ id, label, w, h });

/** pockets by wear slot */
export const POCKETS_BY_SLOT: Record<string, PocketDef[]> = {
  fullsuit: [P('chest', 'chest pocket', 1, 2), P('thigh_l', 'left thigh pocket', 2, 2), P('thigh_r', 'right thigh pocket', 2, 2)],
  pants: [P('hip_l', 'left pocket', 1, 2), P('hip_r', 'right pocket', 1, 2), P('seat', 'back pocket', 2, 1)],
  jacket: [P('side_l', 'left jacket pocket', 2, 2), P('side_r', 'right jacket pocket', 2, 2)],
  shirt: [P('chest', 'shirt pocket', 1, 1)],
};

/** pockets by item key (override the slot defaults; [] = no pockets) */
export const POCKETS_BY_KEY: Record<string, PocketDef[]> = {
  prison_jumpsuit: [P('chest', 'chest pocket', 1, 2), P('thigh_l', 'left thigh pocket', 2, 2), P('thigh_r', 'right thigh pocket', 2, 2)],
  guard_uniform: [P('chest', 'chest pocket', 1, 2), P('chest_l', 'pen pocket', 1, 1), P('thigh_l', 'left cargo pocket', 2, 2), P('thigh_r', 'right cargo pocket', 2, 2)],
  janitor_uniform: [P('chest', 'bib pocket', 1, 2), P('thigh_l', 'left hip pocket', 2, 2), P('thigh_r', 'right hip pocket', 2, 2)],
  pajamas: [P('chest', 'breast pocket', 1, 1)],
  shorts: [P('hip_l', 'left pocket', 1, 1), P('hip_r', 'right pocket', 1, 1)],
  skirt: [],
  scrubs_pants: [P('hip_l', 'left pocket', 1, 2), P('hip_r', 'right pocket', 1, 2), P('thigh_r', 'cargo pocket', 1, 2)],
  sweatpants: [P('hip_l', 'left pocket', 1, 2), P('hip_r', 'right pocket', 1, 2)],
  hoodie: [P('pouch', 'front pouch', 3, 1)],
  vest_hiviz: [P('chest_l', 'left chest pocket', 1, 1), P('chest', 'right chest pocket', 1, 1)],
  lab_coat: [P('side_l', 'left coat pocket', 2, 2), P('side_r', 'right coat pocket', 2, 2), P('chest', 'pen pocket', 1, 2)],
  jacket_leather: [P('inner', 'inside pocket', 1, 2), P('side_l', 'left pocket', 2, 1), P('side_r', 'right pocket', 2, 1)],
  jacket_denim: [P('chest_l', 'left chest pocket', 1, 1), P('chest', 'right chest pocket', 1, 1), P('side_l', 'left pocket', 1, 2), P('side_r', 'right pocket', 1, 2)],
  security_uniform: [P('chest_l', 'left chest pocket', 1, 1), P('chest', 'right chest pocket', 1, 1)],
  scrubs_top: [P('chest', 'chest pocket', 1, 2)],
  coat_winter: [P('side_l', 'left coat pocket', 2, 2), P('side_r', 'right coat pocket', 2, 2), P('inner', 'inside pocket', 1, 2)],
  raincoat: [P('side_l', 'left pocket', 2, 2), P('side_r', 'right pocket', 2, 2)],
};

/** world container kinds -> grid shape and look */
export const KIND_SHAPE: Record<string, { aspect: number; style: string; shelves?: number; label: string }> = {
  drawer: { aspect: 1.7, style: 'wood', label: 'drawer' },
  desk: { aspect: 1.7, style: 'wood', label: 'desk drawer' },
  counter: { aspect: 2.0, style: 'laminate', label: 'counter' },
  cabinet: { aspect: 1.3, style: 'wood', shelves: 2, label: 'cabinet' },
  shelf: { aspect: 2.0, style: 'shelf', shelves: 3, label: 'shelves' },
  wardrobe: { aspect: 1.0, style: 'wood', shelves: 2, label: 'wardrobe' },
  locker: { aspect: 0.8, style: 'steel', shelves: 2, label: 'locker' },
  fridge: { aspect: 1.3, style: 'fridge', shelves: 3, label: 'fridge' },
  freezer: { aspect: 1.4, style: 'freezer', shelves: 2, label: 'freezer' },
  crate: { aspect: 1.3, style: 'crate', label: 'crate' },
  box: { aspect: 1.3, style: 'cardboard', label: 'box' },
  trunk: { aspect: 2.2, style: 'carpet', label: 'trunk' },
  trash: { aspect: 1.0, style: 'trash', label: 'bin' },
  bin: { aspect: 1.1, style: 'trash', label: 'bin' },
  vending: { aspect: 1.6, style: 'vending', shelves: 3, label: 'coils' },
  oven: { aspect: 1.7, style: 'oven', label: 'oven rack' },
  medical: { aspect: 1.3, style: 'medical', shelves: 2, label: 'cabinet' },
  tool: { aspect: 1.8, style: 'toolbox', label: 'tool tray' },
  mailbox: { aspect: 1.6, style: 'steel', label: 'mailbox' },
  pile: { aspect: 1.4, style: 'pile', label: 'heap' },
  safe: { aspect: 1.2, style: 'steel', label: 'safe' },
  cooler: { aspect: 1.6, style: 'cooler', label: 'cooler' },
  corpse: { aspect: 1.4, style: 'corpse', label: 'remains' },
};
