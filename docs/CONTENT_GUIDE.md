# NOCLIP — Content Authoring Guide

This is the contract for everyone adding textures, furniture/props, items, loot,
recipes and creatures. Read it fully before writing content.

## Visual identity (non-negotiable)

* **Low-poly 3D + hand-crafted pixel-art textures.** Everything is built from
  simple primitives (boxes, low-segment cylinders, wedges) and textured from a
  single pixel-art atlas. No smooth plastic surfaces, no photo noise, no smooth
  gradients.
* **Texel density: 32 px per metre** (`PX_PER_M`). A 1 m wide wall segment is
  32 px wide; a floor tile is 32×32; a 0.5 m drawer front is 16 px wide. Keep
  this density on every surface so the world looks coherent.
* **Pixel-art rules**: limited palettes built with `makeRamp(base, steps)`
  (hue-shifted ramps: shadows drift cool, highlights warm); shading via
  `fillRamp` (ordered dithering) or deliberate clusters; crisp 1 px highlights on
  top/left edges, darker 1 px shadows on bottom/right edges; wear and story
  details (scratches, stains, dents, rust, chipped paint, labels, screws,
  stitching, water damage). Avoid per-pixel random noise at full amplitude —
  it reads as TV static at this scale. Prefer clustered noise (`tileFbm` with low
  `cells`), patterns and hand-placed details.
* **Seamless tiling**: textures used on repeating surfaces (floors, walls,
  generic materials) must tile in both directions. `PixelCanvas.wrap` is true by
  default (drawing wraps around edges); use `tileFbm`/`tileNoise2` with integer
  periods matching the canvas size for noise.
* **Mood**: liminal, nostalgic, slightly wrong. Backrooms mono-yellow,
  fluorescent sickly light, empty malls, pastel dreamcore, damp poolrooms,
  sodium-orange parking garages, clinical labs. Muted, believable palettes with a
  few saturated accents (signage, toys, warning stripes).

## Coordinates & conventions

* World units are metres. One tile = 1 m. `y` is up. Wall height `WALL_H = 2.7`.
* Object models are built around the origin: the footprint (w × d tiles) is
  centred at x=0,z=0, the floor is y=0, and the **front faces +z (south)** at
  rotation 0. Multi-tile footprints: a `w:2, d:1` object spans x ∈ [-1, 1].
* Box face names: `south` (+z, front), `north` (-z, back), `east` (+x),
  `west` (-x), `top`, `bottom`.

## APIs

### Textures — `src/gfx/atlas.ts`, `src/gfx/pixel.ts`

```ts
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../../gfx/pixel';
import { tileFbm, Rng } from '../../core/rng';

addTextureModule(() => {
  const A = atlas();
  // name, width px, height px, draw(pc, rng), [metres covered x], [metres covered y]
  A.add('p_vending_front', 32, 58, (pc, rng) => { /* draw */ });
});
```

`PixelCanvas` methods: `set(x,y,hex)`, `get`, `blend(x,y,hex,t)`, `shade(x,y,f)`,
`ditherBlend`, `fill`, `rect`, `rectBlend`, `strokeRect`, `bevel(x,y,w,h,light,dark)`,
`hline`, `vline`, `line`, `ellipse`, `circle`, `ellipseBlend`, `ditherBlob`,
`fillRamp(ramp, fn(x,y)->0..1, ditherAmt)`, `remap(ramp)`, `speckle(rng, colors, density)`,
`grime(hex, amount, cells, seed, threshold)`, `drips(rng, hex, count, y0, maxLen, alpha)`,
`stain(cx,cy,r,inner,rim,seed)`, `outline(hex)`, `blit(src,dx,dy)`.
Set `pc.wrap = false` for non-tiling "fit" textures (labels, screens, faces).
Helpers: `makeRamp(base, steps, {hueShift, spread})` returns dark→light array,
`mixHex(a,b,t)`, `scaleHex(c,f)`, `bayer(x,y)` (0..1 threshold), `ph(x,y,seed)`
(hash 0..1), `tileFbm(x,y,w,h,cells,octaves,seed)` (tileable fbm 0..1).

Default metres covered = px / 32. Textures applied with `fit: true` stretch once
across a face regardless of size (use for labels, screens, door panels).

### Models — `src/gfx/modelBuilder.ts`

```ts
mb.box(cx, y0, cz, w, h, d, texSpec, opts)          // axis aligned box, y0 = bottom
mb.boxMinMax(x0, y0, z0, x1, y1, z1, texSpec, opts)
mb.cylinder(cx, y0, cz, r, h, segs, texSpec, { rTop, caps, ...opts })
mb.cylinderX(cx, cy, cz, r, len, segs, tex) / mb.cylinderZ(...)   // horizontal
mb.sphere(cx, cy, cz, r, segs, rings, tex, { sy })
mb.wedge(cx, y0, cz, w, d, h0, h1, texSpec)        // sloped top (h0 at -z, h1 at +z)
mb.flat(cx, y, cz, w, d, tex, { rot })             // horizontal quad (fit by default)
mb.cross(cx, y0, cz, w, h, tex)                    // crossed cards (plants; needs foliage)
mb.panel(x0, z0, x1, z1, y0, y1, tex, opts)        // single vertical quad
mb.push(); mb.translate(x,y,z); mb.rotateY(a); mb.rotateX(a); mb.rotateZ(a); mb.scale(x,y,z); mb.pop();
```

`texSpec` is a texture name or per-face map:
`{ south: 'p_drawer_front', top: 'wood_light', sides: 'wood_light', all: 'wood_light' }`.

`opts` (`PrimOpts`): `color` (vertex tint hex multiplied with texture — use it
to recolour neutral textures), `emissive` (0..2, self-lit: screens, bulbs, LEDs),
`fit` (true or per-face `{ south: true }` — stretch texture once over the face),
`uvOffset [u,v]` metres, `uvScale`, `skip: ['bottom']` faces, `ao: false`,
`rotTop`. Faces get automatic directional shading; bottoms are darker.

Keep models low-poly but **rich in silhouette**: legs, handles, bevel strips,
drawer gaps, buttons, cables, feet, trims. Typical furniture: 8–60 boxes.

### Furniture / props — `src/world/objects.ts`

```ts
import { defObj } from '../../world/objects';
defObj({
  key: 'filing_cabinet', name: 'Filing Cabinet', w: 1, d: 1, height: 1.32,
  block: 'solid',            // 'solid' | 'low' (vaultable) | 'table' | 'none'
  blocksSight: false,        // tall shelving that hides what is behind
  container: { capacity: 18, kind: 'drawer', loot: 'office_drawer' },
  movable: 35,               // kg; can be picked up/dragged
  disassemble: { tools: ['#screwdriver'], time: 12, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['screws', 2, 6]] },
  sound: 'metal', flammable: 0, sit: false, sleep: 0, surface: 0,
  light: { color: 0x7fd8ff, intensity: 0.35, radius: 2.5, y: 1.2, kind: 'screen', power: true }, // optional
  power: true,               // needs electricity to work (fridge, tv...)
  water: { capacity: 10, tap: true, tainted: false },   // sinks, toilets, baths
  heat: 'stove',             // cooking source
  onWall: true,              // mounted on the NORTH edge of its tile at rot 0 (model z ≈ -0.5)
  variant: (s) => (s.open ? 'open' : ''),   // appearance variants keyed by state
  model: (mb, state) => { /* build at origin, front +z */ },
  tags: ['office'],
});
```

`container.kind` values: drawer, cabinet, fridge, freezer, shelf, crate, locker,
trash, counter, vending, desk, oven, box, wardrobe, trunk, cooler, medical, tool,
mailbox, pile, bin, safe. The `loot` key must be a loot table defined with
`defLoot` (see below). Wall-mounted objects (`onWall`) are placed against the
north wall of their tile: build them flat against z = -0.5 (e.g. a painting at
`mb.box(0, 1.3, -0.47, 0.6, 0.45, 0.04, ...)`).

### Items — `src/items/item.ts`

```ts
import { defItem } from '../../items/item';
defItem({
  key: 'canned_beans', name: 'Canned Beans', cat: 'food', weight: 0.45,
  food: { hunger: 18, thirst: -2, calories: 380, canned: true, openedInto: 'beans_open', unhappy: 2 },
  tags: ['canned'],
  model: (mb) => { mb.cylinder(0, 0, 0, 0.04, 0.11, 8, { sides: 'i_can_beans', top: 'i_can_top', bottom: 'i_can_top' }, { fit: { north: true } }) },
});
```

See `ItemDef` in `src/items/item.ts` for every field (food, weapon, clothing,
bag, medical, light, fluidCap/fluids/startFluid, uses, durability, literature,
burn, seed, place, radio...). Item models are built at real-world scale around
the origin with the item resting on y=0 (they are shown on the floor, on
shelves and rendered into inventory icons).

Body part keys: `head, neck, torso_u, torso_l, groin, uarm_l, uarm_r, farm_l,
farm_r, hand_l, hand_r, thigh_l, thigh_r, shin_l, shin_r, foot_l, foot_r`.

Clothing `look.part`: torso | legs | feet | head | hands | face | back | eyes;
`look.tex` is a texture painted onto the character segment (neutral/grey
designs tinted by `look.color`).

Common tool tags used by systems: `#hammer #screwdriver #saw #knife
#canopener #lighter #matches #pot #kettle #needle #thread #scissors #wrench
#crowbar #shovel #trowel #wateringcan #battery #tape #glue #nails #screws
#plank #rope #sheet #fuel #axe #sledge #tweezers #disinfectant #bandage
#splint #whetstone #radio #walkie #flashlight #map #pen #paper #key`.

### Loot — `src/items/loot.ts`

```ts
defLoot('office_drawer', [1, 4], [['pen', 6], ['paper_stack', 5], ['stapler', 2], ['@snacks', 3, 1, 2]], 0.2);
```

### Recipes — `src/items/recipes.ts`

```ts
defRecipe({ key: 'rip_sheet', name: 'Rip into Rags', category: 'medical', time: 4,
  inputs: [{ item: 'bedsheet' }], outputs: [{ item: 'rag', count: 6 }], anim: 'craft' });
defRecipe({ key: 'spear', name: 'Craft Spear', category: 'weapons', time: 10,
  inputs: [{ item: 'plank' }, { item: '#knife', keep: true }], outputs: [{ item: 'spear_wood' }],
  skill: ['carpentry', 1], xp: ['carpentry', 10] });
```

## File ownership

Each content stream owns its own files; never edit files outside your stream
except to *append* to the lists noted in your brief.

| Stream | Directory / files | Texture name prefix |
|---|---|---|
| Surfaces | `src/content/textures/*.ts` | none (generic names) |
| Furniture A | `src/content/furniture/*.ts` (files `a_*.ts`) | `p_` |
| Furniture B | `src/content/furniture/*.ts` (files `b_*.ts`) | `q_` |
| Items | `src/content/items/*.ts`, `src/content/recipes/*.ts` | `i_` |
| Creatures | `src/creatures/species/*.ts` | `c_` |

Files in these directories are auto-imported by `src/content/index.ts`
(Vite `import.meta.glob`), so creating a file is enough to register content.

## Testing your work

A Vite dev server runs at `http://localhost:5173/` (start one with
`npx vite --port 5173 &` if it is not running). Galleries:

* `?gallery=textures&filter=p_` — atlas sheet (2×2 repeats to check tiling)
* `?gallery=objects&filter=office&page=0` — furniture rendered in-engine
* `?gallery=items&filter=food` — item models
* `?gallery=creatures`

Screenshot with:
`node scripts/shot.mjs "http://localhost:5173/?gallery=objects&page=0" scripts/out/x.png 4000`
then view the PNG. Run `npx tsc --noEmit -p .` before finishing — it must pass.
