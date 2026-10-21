// Build-mode catalogue: every piece a survivor can weld together out of salvage.
// Pure data (furniture models and the build system both read it).
//  kind 'obj'  = a furniture object placed on tiles (frame first, then welded)
//  kind 'wall' = a wall on a tile edge (north or west); 'door' = wall + hatch
// node = research node (branch 'blueprint') that unlocks it; no node = known from the start.

export type PieceCat = 'struct' | 'machine' | 'defense' | 'living' | 'farm';
export interface PieceStats { def?: number; comfort?: number; food?: number; power?: number }
export interface Piece {
  key: string;
  name: string;
  cat: PieceCat;
  kind: 'obj' | 'wall' | 'door';
  /** object key placed when the weld completes */
  obj?: string;
  /** wall key for wall / door pieces */
  wall?: string;
  /** footprint (tiles at rot 0) and frame height, for the scaffold */
  w?: number; d?: number; h: number;
  cost: [string, number][];
  /** seconds of welding at full torch */
  weld: number;
  /** 'nail' pieces are hammered instead of welded (wood) */
  join?: 'weld' | 'nail';
  node?: string;
  stats?: PieceStats;
  /** a station a worker (robot thrall) can be assigned to */
  station?: 'farm' | 'forge' | 'guard' | 'power' | 'kitchen' | 'store';
  desc: string;
}

export const PIECES: Piece[] = [
  // ---------------------------------------------------------------- structure
  { key: 'plate_wall', name: 'Scrap-Plate Wall', cat: 'struct', kind: 'wall', wall: 'bld_scrap_plate', h: 2.7, cost: [['sheet_metal', 2], ['scrap_metal', 1]], weld: 5, stats: { def: 3 }, desc: 'Mismatched plates seam-welded to a pipe frame. Stops most things.' },
  { key: 'plank_wall', name: 'Plank Wall', cat: 'struct', kind: 'wall', wall: 'wood_built', h: 2.7, cost: [['plank', 3], ['nails', 4]], weld: 4, join: 'nail', stats: { def: 2 }, desc: 'Boards nailed across studs. Cheap, quick, flammable.' },
  { key: 'pipe_rail', name: 'Pipe Railing', cat: 'struct', kind: 'wall', wall: 'railing', h: 1.0, cost: [['pipe', 2]], weld: 3, stats: { def: 1 }, desc: 'Waist-high pipe rail. Keeps the edge of things where it is.' },
  { key: 'hatch', name: 'Bulkhead Hatch', cat: 'struct', kind: 'door', wall: 'bld_scrap_plate', h: 2.7, cost: [['sheet_metal', 2], ['steel_frame', 1], ['spring', 1]], weld: 7, node: 'bp_hatch', stats: { def: 3 }, desc: 'A welded door in a plate wall, hung on a spring hinge.' },
  { key: 'deck', name: 'Deck Grating', cat: 'struct', kind: 'obj', obj: 'bld_deck', h: 0.08, cost: [['scrap_metal', 2]], weld: 2, desc: 'A welded grate laid over the carpet. Your base starts somewhere.' },
  { key: 'steps', name: 'Welded Platform', cat: 'struct', kind: 'obj', obj: 'bld_steps', h: 0.5, cost: [['steel_frame', 1], ['scrap_metal', 2]], weld: 4, desc: 'A raised steel platform with two steps. Stand on it and survey your kingdom.' },
  // ---------------------------------------------------------------- machines ("mechanical tables")
  { key: 'mech_bench', name: 'Powered Workbench', cat: 'machine', kind: 'obj', obj: 'bld_mech_bench', w: 2, d: 1, h: 1.6, cost: [['steel_frame', 1], ['sheet_metal', 2], ['motor', 1], ['wire', 2]], weld: 9, node: 'bp_mech_bench', stats: { comfort: 1, power: -1 }, station: 'forge', desc: 'A steel bench with a motorised vise, a grinder and a drill press. Counts as a workbench.' },
  { key: 'compactor', name: 'Scrap Compactor', cat: 'machine', kind: 'obj', obj: 'bld_compactor', h: 1.9, cost: [['steel_frame', 2], ['motor', 1], ['pipe', 2]], weld: 10, node: 'bp_compactor', stats: { power: -1 }, station: 'forge', desc: 'A hydraulic platen that stamps three scrap into one sheet of metal.' },
  { key: 'gen_rig', name: 'Generator Rig', cat: 'machine', kind: 'obj', obj: 'bld_gen_rig', h: 1.2, cost: [['motor', 2], ['steel_frame', 1], ['wire', 3], ['pipe', 1]], weld: 10, node: 'bp_gen_rig', stats: { power: 6 }, station: 'power', desc: 'Two motors run backwards off a fuel drum. Loud. Powers everything nearby.' },
  // ---------------------------------------------------------------- defence
  { key: 'turret', name: 'Pipe Sentry', cat: 'defense', kind: 'obj', obj: 'bld_turret', h: 1.4, cost: [['steel_frame', 1], ['pipe', 2], ['motor', 1], ['electronics_scrap', 2]], weld: 10, node: 'bp_turret', stats: { def: 8, power: -1 }, station: 'guard', desc: 'A motor-swivelled nail cannon on a tripod. Shoots anything that is not a friend.' },
  { key: 'spikes', name: 'Rebar Spikes', cat: 'defense', kind: 'obj', obj: 'bld_spikes', h: 0.4, cost: [['pipe', 2], ['scrap_metal', 2]], weld: 4, node: 'bp_spikes', stats: { def: 2 }, desc: 'Sharpened rebar welded to a plate. Things that walk over it stop walking.' },
  // ---------------------------------------------------------------- living
  { key: 'beacon', name: 'Claim Beacon', cat: 'living', kind: 'obj', obj: 'bld_beacon', h: 2.2, cost: [['scrap_metal', 2], ['electronics_scrap', 1]], weld: 3, desc: 'Plant it and the ground around it is yours: a settlement with defence, comfort, food and power.' },
  { key: 'locker', name: 'Welded Locker', cat: 'living', kind: 'obj', obj: 'bld_locker', h: 1.8, cost: [['sheet_metal', 2], ['scrap_metal', 1]], weld: 5, station: 'store', desc: 'A tall steel locker. Storage that stays where you left it.' },
  { key: 'cot', name: 'Steel Cot', cat: 'living', kind: 'obj', obj: 'bld_cot', d: 2, h: 0.6, cost: [['steel_frame', 1], ['bedsheet', 1]], weld: 5, stats: { comfort: 3 }, desc: 'A pipe cot with a sheet stretched over it. Sleep off the floor.' },
  { key: 'strip_light', name: 'Strip Light Stand', cat: 'living', kind: 'obj', obj: 'bld_strip_light', h: 2.0, cost: [['fluoro_tube', 1], ['wire', 1], ['scrap_metal', 1]], weld: 2, stats: { comfort: 2 }, desc: 'A fluorescent tube on a pole. Crops grow under it. So do you.' },
  { key: 'stove', name: 'Drum Stove', cat: 'living', kind: 'obj', obj: 'bld_stove', h: 1.0, cost: [['sheet_metal', 2], ['pipe', 1]], weld: 6, stats: { comfort: 2, food: 1 }, station: 'kitchen', desc: 'An oil drum with a grate and a flue. Burn wood, cook on top.' },
  { key: 'table', name: 'Steel Table', cat: 'living', kind: 'obj', obj: 'bld_table', h: 0.85, cost: [['sheet_metal', 1], ['pipe', 2]], weld: 4, stats: { comfort: 1 }, desc: 'A sheet of steel on four pipe legs. Eat at it like a person.' },
  // ---------------------------------------------------------------- farm
  { key: 'planter', name: 'Welded Planter', cat: 'farm', kind: 'obj', obj: 'bld_planter', h: 0.55, cost: [['sheet_metal', 1], ['scrap_metal', 1]], weld: 3, stats: { food: 1 }, station: 'farm', desc: 'A steel trough of carpet-fibre soil. Sow seeds, water, wait under the lights.' },
  { key: 'hydro', name: 'Hydro Rack', cat: 'farm', kind: 'obj', obj: 'bld_hydro', h: 1.8, cost: [['steel_frame', 1], ['pipe', 2], ['electronics_scrap', 1]], weld: 6, node: 'bp_hydro', stats: { food: 2, power: -1 }, station: 'farm', desc: 'Two trays fed by a dripping pipe loop. Grows fast, drinks little, needs light.' },
  { key: 'rain', name: 'Rain Funnel', cat: 'farm', kind: 'obj', obj: 'bld_rain', h: 1.6, cost: [['sheet_metal', 2], ['pipe', 1]], weld: 4, stats: { food: 1 }, desc: 'A sheet-metal funnel over a drum. Catches whatever falls from the sky (or the ceiling).' },
];

const BY = new Map(PIECES.map((p) => [p.key, p]));
export const piece = (k: string) => BY.get(k);
export const pieceForObj = (objKey: string) => PIECES.find((p) => p.obj === objKey);
export const CAT_NAMES: Record<PieceCat, string> = { struct: 'STRUCTURE', machine: 'MACHINES', defense: 'DEFENCE', living: 'LIVING', farm: 'FARM' };
