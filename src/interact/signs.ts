// Stencil glyphs for the physical interaction hints: a small sprayed-on
// pictogram per verb (a chair to sit, a box to search, a door, an axe, a
// crowbar, a saw, a drop to drink...), painted in cream / signal red / brass
// with no plate behind it. The words beside them are free text in a real
// typeface (src/interact/grab.css); these only make the verb readable at a
// glance. Drawn once into a tiny canvas each, shown with square pixels.

/** stencil paint: dark parts become cream paint, the rest keep their colour */
const PAINT: Record<string, string> = { k: '#efe6cc', d: '#efe6cc', b: '#efe6cc', g: '#c9c6bb', w: '#ffffff', r: '#d0533f', y: '#d8b25a', u: '#7fb0d6' };

/** 9x9 glyphs ('.' = nothing) */
const ART: Record<string, string[]> = {
  mouseR: ['..ddddd..', '.dbbdrrd.', '.dbbdrrd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '..dbbbd..', '...ddd...'],
  mouseL: ['..ddddd..', '.drrdbbd.', '.drrdbbd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '..dbbbd..', '...ddd...'],
  mouseH: ['..ddddd..', '.dbbdrrd.', '.dbbdrrd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '..dbbbd..', '...ddd...', '.yyyyyyy.'],
  hand: ['.........', '..k.k.k..', '.kkkkkkk.', '.kwkwkwk.', '.kkkkkkkk', '.kkkkkkk.', '..kkkkk..', '...kkk...', '...kkk...'],
  chair: ['.k.......', '.k.......', '.k.......', '.k.......', '.kkkkkk..', '.kyyyyk..', '.k....k..', '.k....k..', '.........'],
  bed: ['.........', '.........', 'k........', 'k.ww.....', 'kkkkkkkkk', 'kyyyyyyyk', 'k.......k', '.........', '.........'],
  box: ['.........', '.k.....k.', '..k...k..', '.kkkkkkk.', '.kyyyyyk.', '.kykkkyk.', '.kyyyyyk.', '.kkkkkkk.', '.........'],
  door: ['.kkkkkk..', '.kyyyyk..', '.kyyyyk..', '.kyyyyk..', '.kyyykk..', '.kyyyyk..', '.kyyyyk..', '.kkkkkk..', '.........'],
  key: ['.........', '.yyy.....', 'y...y....', 'y...yyyyy', 'y...y..y.', '.yyy...y.', '.........', '.........', '.........'],
  switch: ['..kkkkk..', '..kwwwk..', '..kwrwk..', '..kwrwk..', '..kwwwk..', '..kwwwk..', '..kkkkk..', '.........', '.........'],
  drop: ['....k....', '....k....', '...kuk...', '..kuuuk..', '..kuuuk..', '..kuwuk..', '...kkk...', '.........', '.........'],
  eat: ['......k..', '.....k...', '....k....', '.kkkkkkk.', '.kwwwwwk.', '..kwwwk..', '...kkk...', '.........', '.........'],
  book: ['.........', '.kkk.kkk.', '.kwwkwwk.', '.kwwkwwk.', '.kwwkwwk.', '.kkkkkkk.', '.........', '.........', '.........'],
  pickup: ['....r....', '....r....', '..r.r.r..', '...rrr...', '....r....', '.........', '.kkkkkkk.', '.kyyyyyk.', '.........'],
  walk: ['.kk......', '.kk......', '.k...kk..', '.....kk..', '.kk..k...', '.kk......', '.k...kk..', '.....kk..', '.....k...'],
  push: ['.kkkkkkk.', '.kyyyyyk.', '.kkkkkkk.', '....r....', '...rrr...', '..rrrrr..', '....r....', '....r....', '....r....'],
  pull: ['.kkkkkkk.', '.kyyyyyk.', '.kkkkkkk.', '....r....', '....r....', '....r....', '..rrrrr..', '...rrr...', '....r....'],
  power: ['.....rr..', '....rr...', '...rr....', '..rrrrr..', '....rr...', '...rr....', '..rr.....', '.rr......', '.........'],
  powerOff: ['.....kk..', '....kk...', '...kk....', '..kkkkk..', '....kk...', '...kk....', '..kk.....', '.kk......', '.........'],
  shove: ['k...k...k', '.k..k..k.', '..k.k.k..', '...kkk...', 'kkkkrkkkk', '...kkk...', '..k.k.k..', '.k..k..k.', 'k...k...k'],
  throw: ['...kkkk..', '..k....k.', '.k......k', '.k.....kk', 'k.......k', 'k........', 'yy.......', 'yy.......', '.........'],
  axe: ['..kkk....', '.kgggk...', 'kgggggk..', '.kgggk...', '..kykk...', '....yk...', '....y....', '....y....', '....y....'],
  hammer: ['.kkkkk...', '.kgggkk..', '.kkkkk...', '...y.....', '...y.....', '...y.....', '...y.....', '...y.....', '.........'],
  crowbar: ['.......rr', '......r.r', '.....r...', '....r....', '...r.....', '..r......', '.r.......', 'rr.......', 'r........'],
  saw: ['.........', 'yy.......', 'yykkkkkkk', 'yykgggggk', '..kgggggk', '..k.k.k.k', '.........', '.........', '.........'],
  knife: ['........k', '.......kg', '......kg.', '.....kg..', '....kg...', '...kk....', '..y......', '.y.......', 'y........'],
  lever: ['.....rr..', '.....rr..', '....k....', '...k.....', '..k......', '.kkk.....', 'kgggk....', 'kkkkk....', '.........'],
  flame: ['....r....', '...rr....', '...rrr...', '..rryrr..', '..ryyyr..', '..ryyyr..', '...ryr...', '...kkk...', '.........'],
  cross: ['.........', '...rrr...', '...rrr...', '.rrrrrrr.', '.rrrrrrr.', '.rrrrrrr.', '...rrr...', '...rrr...', '.........'],
  eye: ['.........', '.........', '..kkkkk..', '.k.www.k.', 'k.wkkkw.k', '.k.www.k.', '..kkkkk..', '.........', '.........'],
  gear: ['...k.k...', '..kkkkk..', '.kk...kk.', '.k..y..k.', '.kk...kk.', '..kkkkk..', '...k.k...', '.........', '.........'],
  pack: ['.kkkkkkk.', '.kgggggk.', '.kkkkkkk.', '.kgggggk.', '.kggyggk.', '.kgggggk.', '.kgggggk.', '.kkkkkkk.', '.........'],
  board: ['.........', 'yyyyyyyyy', 'yk.....ky', 'yyyyyyyyy', '.........', 'yyyyyyyyy', 'yk.....ky', 'yyyyyyyyy', '.........'],
  shovel: ['....y....', '....y....', '....y....', '....y....', '...ggg...', '..ggggg..', '..ggggg..', '...ggg...', '....g....'],
  give: ['.........', '....yy...', '....yy...', '.........', 'k.......k', 'kk.....kk', '.kkkkkkk.', '..kkkkk..', '.........'],
  down: ['....k....', '....k....', '....k....', '..kkkkk..', '...kkk...', '....k....', '.........', 'kkkkkkkkk', '.........'],
};

/** which glyph a verb gets */
const VERB_GLYPH: [RegExp, string][] = [
  [/^(Sit|Stand up)/, 'chair'], [/^(Sleep|Lie)/, 'bed'], [/^(Backpack)/, 'pack'],
  [/^(Search|Look inside|Put .* in|Deposit)/, 'box'], [/^(Unlock|Lock)/, 'key'], [/^Knock/, 'hand'],
  [/^(Open|Close|Go through|Step through|Climb|Call the elevator|Go down|Kick down)/, 'door'],
  [/^(Turn|Switch|Use computer)|lights/, 'switch'], [/^(Drink|Fill|Wash|Pour)/, 'drop'],
  [/^Cook|fire|fuel|^Light|^Put out/i, 'flame'], [/^(Eat|Take|Offer|Open$)/, 'eat'], [/^Read/, 'book'],
  [/^Pick up|^Carry/, 'pickup'], [/^Walk/, 'walk'], [/^(Pull the lever|Haul)/, 'lever'],
  [/^Check health|^Look|^Study|^Inspect|^Scan/, 'eye'],
  [/^(Treat|Apply|Disinfect|Stitch|Remove shard|Remove bandage|Revive)/, 'cross'], [/^Give/, 'give'],
  [/^(Barricade|Board|Nail|Remove barricade|Pry the boards|Hang)/, 'board'], [/^(Dig|Plant|Forage|Mark)/, 'shovel'],
  [/^Chop|^Break it down/, 'axe'], [/^(Smash|Kick|Knock the glass)/, 'hammer'], [/^(Pry|Force)/, 'crowbar'], [/^Saw/, 'saw'],
  [/^(Slash|Stab|Butcher)/, 'knife'], [/^(Take apart|Disassemble)/, 'gear'], [/^Clear/, 'shove'],
];
export function verbGlyph(label: string): string {
  for (const [re, g] of VERB_GLYPH) if (re.test(label)) return g;
  return 'gear';
}

const urls = new Map<string, string>();
/** a glyph as an image URL (cached), painted stencil-style */
export function glyphUrl(name: string): string {
  let u = urls.get(name);
  if (u) return u;
  const a = ART[name] || ART.gear;
  const cv = document.createElement('canvas');
  cv.width = 9; cv.height = 9;
  const g = cv.getContext('2d')!;
  for (let j = 0; j < a.length; j++) for (let i = 0; i < a[j].length; i++) {
    const ch = a[j][i];
    if (ch === '.' || ch === ' ') continue;
    g.fillStyle = PAINT[ch] ?? PAINT.k;
    g.fillRect(i, j, 1, 1);
  }
  u = cv.toDataURL();
  urls.set(name, u);
  return u;
}
