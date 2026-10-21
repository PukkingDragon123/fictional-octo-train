# NOCLIP — World spec (zones, links, mission hooks)

Contract for everyone writing zone generators. Read `docs/CONTENT_GUIDE.md`
first (furniture/item/texture conventions). The reference generator is
`src/world/gen/lobby.ts` + `lobbyRooms.ts`.

## How a zone is built

* One file per zone: `src/world/gen/z_<key>.ts`. It calls
  `defZone({ key, name, W, H, gen, depth, blurb })` at import time
  (`src/world/zones.ts` globs `./gen/z_*.ts`). Shared helpers for several of
  your zones go in `src/world/gen/<yourname>_kit.ts`.
* **Check your zones headlessly** (no WebGL, ~1 s):
  `node scripts/zonecheck.mjs <key> [<key> ...]` generates them, validates
  anchors (walkable, not on triggers), portals, loop portals, reachability
  from the first anchor (≥75% of floor), cross-zone anchor links against the
  other zones listed, unknown objects/textures, and writes
  `scripts/out/map_<key>.png` (red portal, magenta loop, green anchor, orange
  door, blue window, dots = lights). Look at the PNG. Run it with all your
  zones plus their neighbours (e.g. `node scripts/zonecheck.mjs lobby office stairwell`).
* Deterministic: build everything from `new Rng(seed)`. Never call
  `Math.random()`. Co-op clients regenerate zones locally and only sync
  changes, so identical seed ⇒ identical zone.
* Tools: `ZoneBuilder` (`fillFloor`, `roomWalls`, `hwall/vwall`, `door`,
  `window`, `arch`, `gap`, `addRoom`, `obj`, `light`, `portal`, `boundary`,
  `paper`, `flag`, `clearWallsIn`) and `Furnisher` (`place`, `againstWall`,
  `onWall`, `onTop`, `anywhere`, `floorItem`, `floorLoot`, `decal`).
  `stampRoom` in `lobbyRooms.ts` shows how to carve a room into existing space.
* Walls are edges: `wallN` (north edge of tile) and `wallW` (west edge).
  A room x0..x1 × y0..y1 has `roomWalls(x0,y0,x1,y1)`; doors sit on those
  edges (`b.door(x, y, side)` with side 0 = north edge of (x,y), 1 = west edge).
* Every walkable tile needs a floor (`fillFloor`). Floors: see `src/world/defs.ts`
  (`carpet_yellow`, `tile_pool`, `water_shallow`, `water_deep`, `grass`,
  `grass_dream`, `asphalt`, `sidewalk`, `concrete`, `parking`, `linoleum*`,
  `wood`, `wood_gym`, `tile_kitchen`, `tile_white`, `grate`, `lab`, `server`,
  `void`, `glitch`, `sand`, `gravel`, `rubber`, `carpet_*`, `dirt`, `soil`...).
  Walls: `drywall`, `concrete`, `cinder`, `brick`, `tile`, `glass`... (grep
  `defWall`). Wallpapers: grep `wallpaperId`/textures `wall_*`.
* Rooms: `b.addRoom(name, type, x0,y0,x1,y1, { circuit, temp, outdoor })`.
  **Room `type` matters**: entering a room sets the mission flag
  `room:<zone>:<type>` (e.g. `room:office:server_closet`).
* Lights: `b.obj('light_fluoro', x, y, 0, { circuit, flicker, broken })` or
  `b.light(x, z, kind, {...})`. Power: `z.power.set(circuit, true)`. Circuit 0
  is always powered. Outdoor zones use `z.env.sky = true` + sun.
* Furniture: any `defObj` key (grep `src/content/furniture*`). Containers fill
  lazily from their loot table; override with `state.loot`.
* Loot on floors: `f.floorLoot(table, x, y)`; specific items
  `f.floorItem(key, x, y, data)`.
* Lore: `f.floorItem('note', x, y, { lore: '<id>' })` (or `journal`), or any
  object with `state.lore` (noticeboards, computers, terminals). Lore ids live in
  `src/content/lore/*.ts`. Zone terminals without a specific id pick from
  `z.meta.terminalLore = ['id', ...]`.
* Environment: set `z.env = { ...z.env, ambient, ambientI, fog, fogNear,
  fogFar, void, temp, sky, sun, sunI, skyColor, grade, reverb, ambience,
  music, weather }`. Keys for `grade` (colour grading): lobby office pool mall
  market parking suburbs fields school hospital tunnels lab server stairwell
  corrupt exit void house. `ambience` (audio beds): same keys plus `hum`.
  `reverb`: hall office pool tunnel mall outdoor small stair server dream void.
  `music`: '' musicbox muzak drone pads choir broken (empty = zone default).
* Creatures: `z.spawnTable = [[speciesKey, weight], ...]`, `z.creatureCap`.
  Unknown species keys are ignored, so list the planned ones.
* Vehicles: list parked cars in `z.meta.vehicleSpawns = [{ x, y, rot, type?, chance? }]`
  (tile of the car centre; rot 0..3 quarter turns, 0 = facing +x/east; type
  `sedan | hatch | van | pickup`, chance default 0.8). They are drivable
  (keys, hotwiring, fuel, trunk loot) and can drive through `walk` portals,
  so put them on roads, driveways and parking bays with ~3 tiles of clear
  space around. Use them in suburbs, parking, hospital lot, market dock,
  and one abandoned on the fields road.
* Flags per tile: `TF.OUTDOOR`, `TF.NOSPAWN` (safe rooms, spawn points),
  `TF.SAFE`, `TF.CORRUPT`, `TF.SHIFT`, `TF.VENT`.
* Connectivity: `connectRegions(z, b, sx, sy, rng, { keep })` in
  `src/world/gen/connect.ts` opens plain walls until every walkable pocket is
  reachable from (sx, sy); `keep` lists rects (set pieces, loop corridors)
  whose walls must stay shut. Run it last in maze-like generators.
* Rooms can be richer or poorer than the zone: `addRoom(..., { lootMul })`
  scales container loot rolls.
* Wall-mounted props follow the floor height of their tile; an explicit
  `state.y` is absolute. Ledge faces use the floor's `side` texture
  (grass shows earth, pool decks show tiles).
* Shifting regions (`registerShift`): stamps may add walls, doors, furniture
  and lights, but not decals, floor items or rooms (those would pile up on
  every re-stamp). Loop portals can't change height; keep loops level.
* Door `sign` values must match a `sign_*` texture: danger, exit, lab,
  maintenance, office, pool, pool_rules, restroom, staff, stairs.

## Linking zones (portals + anchors)

A portal is a trigger tile plus usually a visible object:

```ts
const o = f.place('door_freestanding', x, y, 0, { portal: 'p_fields' }) || b.obj('door_freestanding', x, y, 0, { portal: 'p_fields' });
b.portal({ id: 'p_fields', x, y, kind: 'door', to: 'fields', tx: 40, ty: 40, label: 'Open the red door', locked?: 'flag:lab_code' });
```

* `kind`: `door | elevator | manhole | ladder | vent` need the player to
  interact; `stairs_up | stairs_down | hole | walk` trigger on stepping in;
  `loop` silently shifts the player by `loopDx/loopDy` inside the same zone
  (looping corridors, endless streets).
* Doors on wall edges can also be portals: `b.door(x, y, side, style, { portal: 'p_id' })`
  plus `b.portal({ id: 'p_id', x, y, kind: 'door', ... })` on the tile in front.
* **Arrival**: the travelling player lands on `targetZone.meta.anchors[portalId]`
  (`[x, y, facing?]`). Every zone must define an anchor for **every inbound
  portal id** listed below, on a walkable tile next to its own return portal
  (never on the return trigger tile itself, or the player bounces back).
  `tx/ty` are only a fallback; the engine also snaps to the nearest walkable tile.
* Locks: `power:<zone>:<circuit>`, `flag:<missionFlag>`, `stage:<n>` (render
  nodes disabled), `item:<itemKey>`, `any:a|b`.

### Link table

| portal id | from → to | kind | lock |
|---|---|---|---|
| p_fields / r_fields | lobby ↔ fields | red freestanding door both sides | — |
| p_pools / r_pools | lobby hole → pools · pools ladder → lobby | hole / ladder | — |
| p_stair / r_stair_lobby | lobby ↔ stairwell (landing "0") | stairs | — |
| p_office / r_office | lobby ↔ office | elevator | p_office: power:lobby:99 |
| p_office_stair / r_office_stair | office ↔ stairwell (landing "4") | door | — |
| p_fields_house / r_fields_house | fields (house front door) ↔ house | door | — |
| p_fields_road / r_fields_road | fields ↔ suburbs (road off the map edge) | walk | — |
| p_house_lab / r_house_lab | house basement ↔ lab | stairs | p_house_lab: flag:lab_code |
| p_suburbs_school / r_suburbs_school | suburbs ↔ school | door | — |
| p_suburbs_manhole / r_suburbs_manhole | suburbs manhole ↔ tunnels ladder | manhole / ladder | — |
| p_suburbs_lot / r_suburbs_lot | suburbs ↔ parking (road) | walk | — |
| p_school_nurse / r_school_nurse | school nurse office back door ↔ hospital ward door | door | — |
| p_pools_drain / r_pools_drain | pools drain grate ↔ tunnels ladder | manhole / ladder | — |
| p_pools_mall / r_pools_mall | pools (water park exit) ↔ mall | door | — |
| p_mall_market / r_mall_market | mall ↔ market (anchor store) | door | — |
| p_mall_lot / r_mall_lot | mall ↔ parking | door | — |
| p_mall_cinema / r_mall_cinema | mall cinema screen 6 ↔ corrupt | door | p_mall_cinema: stage:2 |
| p_market_dock / r_market_dock | market loading dock ↔ parking | door | — |
| p_hospital_lot / r_hospital_lot | hospital ↔ parking | door | — |
| p_hospital_basement / r_hospital_basement | hospital ↔ tunnels | stairs | — |
| p_stair_parking / r_stair_parking | stairwell landing "P2" ↔ parking | door | — |
| p_stair_13 / r_stair_13 | stairwell landing "13" ↔ corrupt | door | p_stair_13: stage:2 |
| p_tunnels_lab / r_tunnels_lab | tunnels blast door ↔ lab | door | p_tunnels_lab: flag:lab_code |
| p_lab_core / r_lab_core | lab freight elevator ↔ server | elevator | p_lab_core: stage:2 |
| p_core_exit | server → exit | door | stage:3 |
| p_exit_final | exit doorway → the ending (`to: '__ending__'`) | door (`exit_doorway` object) | stage:3 |
| p_lobby_depot / r_lobby_depot | lobby Underpass stairs ↔ depot "Stairs to Level 0" | stairs_down / stairs_up | — |
| p_lobby_under / r_lobby_under | lobby hole into the dark ↔ undercroft tan rope | hole / ladder | — |
| p_depot_annex / r_depot_annex | depot staff corridor ↔ annex Transit Door | door | — |
| p_office_annex / r_office_annex | office Stair B vestibule ↔ annex Reception B | door | — |
| p_annex_under / r_annex_under | annex Sector 7 hole (end of the blue rope) ↔ undercroft blue rope | hole / ladder | — |
| p_under_tunnels / r_under_tunnels | undercroft pit ladder ↔ tunnels Junction 3 rusted ladder | ladder / ladder | — |
| p_mall_showroom / r_mall_showroom | mall East Court glass doors ↔ showroom entrance | door | — |
| p_showroom_home / r_showroom_home | showroom "Living Room 14 / YOU ARE HOME" set front door ↔ homestead house 12 front door | door | — |
| p_suburbs_home / r_suburbs_home | suburbs Maple Court 5 red front door ↔ homestead house 14 front door | door | — |
| p_parking_depot / r_parking_depot | parking elevator core (P4) east door ↔ depot bus deck back wall | door | — |

## Zones

Sizes are tiles (1 tile = 1 m). "Depth" scales danger. Every zone needs: rooms
with sensible types, lights + power, loot containers, floor loot, decals,
lore placements listed, ambience/env, spawn table, anchors for inbound
portals, and its outbound portals. Make each zone **memorable**: a few big
landmarks, a readable structure, then repetition with small wrong details.
No random noise mazes except where stated.

### lobby — Level 0 (exists, 160×160)
Mono-yellow maze, fluorescent sectors. Anchors: spawn, maintenance, r_fields,
r_pools, r_stair_lobby, r_office.

### pools — The Poolrooms (128×128, depth 1)
White/blue tile halls, shallow channels (`water_shallow`) and deep pools
(`water_deep`), columns, skylights (`sky` lights high up, cyan-white), slides,
tiled stairs into water, changing rooms with lockers, a lifeguard chair, an
indoor water-park wing with a door to the mall. Echoing, bright, warm (temp 27),
grade `pool`, ambience `pool`, reverb `pool`, music `pads`.
* Arrival p_pools: in shallow water under a ceiling hole. Return r_pools: a
  ladder up (object `ladder` if defined, else `staircase_up`).
* **Pump hall** room type `pumps`, anchor `pumps`: three valve objects with
  `state: { mission: 'valve', valve: 'A' | 'B' | 'C' }` and a control panel
  with `state: { mission: 'pump_start' }` (use any valve/pipe/panel props).
  Lore `pump_manual` on the wall/floor there.
* Drain grate (p_pools_drain → tunnels), door to mall (p_pools_mall).
* Lore: `sign_pool_rules` (sign at the main pool), `journal_survey_2` (Brandt's
  journal in a changing room).
* Spawn: lifeguard 2, lumenmoth 1, echo 1, hollow 0.5. Cap 6.

### fields — The Fields (192×192, depth 1, outdoor)
Dreamcore: endless soft grass (`grass_dream`), gentle low fences, power-line
poles marching to the horizon, one lonely house (exterior only: walls with a
door = portal p_fields_house) with a dog house (kennel) and a washing line in
the yard, a swing set, a creek (shallow water), a small farm plot (`soil`), a
billboard, the freestanding red door (r_fields back to the lobby) alone in the
grass. Big sky (`sky: true`, warm sun), grade `fields`, ambience `fields`,
reverb `dream`, music `musicbox`. Temp 21. Fog light and far.
* The **house_key** lies inside the kennel: `f.floorItem('house_key', x, y, { keyId: 'alder_attic' })`.
* Anchors: p_fields (by the red door), r_fields_house (outside the house's
  front door), r_fields_road (where the road enters).
* A road (asphalt + sidewalk) leaves the map edge: `walk` portal p_fields_road
  across the road at the edge (2–3 tiles wide).
* Lore: `drawing_family` on the porch.
* Spawn: stilt_doe 4, wrongbird 3, goodboy 1, sentinel 1, plushkin 0.5, grinhound 1. Cap 8.

### house — 14 Alder Lane (64×64, depth 2) — bigger on the inside
The interior of the small fields house, impossibly large: a 1980s family home
whose hallways keep going (family photos, carpet runner), extra nurseries,
a kitchen, living room with TV and sofa, Mia's bedroom (toys, bed, night
light), the father's study (desk, books, Meridian papers), bathroom, laundry,
a second floor reached by a looping staircase (`loop` portal), an attic behind
a **locked door** (`b.door(x,y,side,'door_wood',{ locked: true, keyId: 'alder_attic' })`),
a basement with a steel door + `keypad` object (`state: { code: '061480',
codeFlag: 'lab_code' }`) and stairs down = portal p_house_lab (locked
`flag:lab_code`). Grade `house`, ambience `house`, reverb `small`, music
`musicbox`. Warm bulbs. Temp 21.
* Anchors: p_fields_house (inside the front door), r_house_lab (by the basement stairs).
* Return r_fields_house: the front door (interact).
* Lore: `diary_mia` (Mia's room), `note_house_rooms` (hallway), attic:
  `card_birthday`, `letter_hale_mia`.
* Spawn: plushkin 2, lamplighter 2, echo 1, davenport 1. Cap 5.

### suburbs — Alder Lane Estates (192×192, depth 2, outdoor)
A grid of identical houses (red doors, swings, dog bowls) with lawns, fences,
driveways with parked cars, sodium street lights, sidewalks, a cul-de-sac, a
playground, a corner store. One street **loops**: `loop` portals at both ends
shift the player back to the other end. Walk-in houses (enterable interiors
with loot) — at least 10 of them; the rest locked. School building entrance on
one street (p_suburbs_school), a manhole on Elm St (p_suburbs_manhole), the
road leaving to the parking lot (p_suburbs_lot, walk) and the road back to
the fields (r_fields_road, walk). Grade `suburbs`, ambience `suburbs`, reverb
`outdoor`, music `musicbox`, sky true, dusk-ish sun (warm, low).
* Anchors: p_fields_road, r_suburbs_school, r_suburbs_manhole, r_suburbs_lot.
* Lore: `journal_survey_3` (Ruiz, in a garage), `flyer_lost_dog` on 3 poles/walls.
* Spawn: grinhound 3, goodboy 1.5, wrongbird 2, stilt_doe 1, sentinel 1, hollow 1. Cap 10.

### school — Meadowbrook Elementary (128×96, depth 2)
Long hallways with lockers, classrooms (desks in rows, chalkboards), a gym
(`wood_gym`, bleachers), cafeteria, library, music room, principal's office,
nurse's office (type `nurse`) whose back door is portal p_school_nurse →
hospital. Front doors back to suburbs (r_suburbs_school). PA speakers. Grade
`school`, ambience `school`, reverb `hall`, music `musicbox`.
* Anchors: p_suburbs_school, r_school_nurse.
* Lore: `school_announcement` (principal's office), `report_card` (a classroom desk).
* Spawn: echo 2, swivel 2, plushkin 1, employee 1, lamplighter 1. Cap 6.

### office — Level 4, Meridian offices (144×144, depth 1)
Open-plan cubicle farms (repeating desks with computers), glass-walled
meeting rooms, conference room C (locked, lights on, coffee for six), break
rooms, copy rooms, restrooms, a **giant open-plan floor** (40×40, columns), a
corridor that is much longer than it should be (loop portal pair). Grade
`office`, ambience `office`, reverb `office`, music `drone`.
* Elevator lobby with elevator = return r_office (interact) and anchor p_office.
* Stair door p_office_stair → stairwell; anchor r_office_stair.
* **Workstation 4-07**: room "Office 4-07" (type `office`), a computer/terminal
  with `state.lore = 'terminal_numbers'`, anchor `numbers_terminal` on it.
* **Office 4-12** (R. Doyle, Facilities): desk with the **keycard_facilities**
  (`f.floorItem('keycard_facilities', ...)` on the desk tile, or put it in the
  desk container via `state.loot` of a one-item table). Lore `memo_facilities`
  as a note in a break room.
* **Server closet 07** room type `server_closet`: door locked
  (`b.door(..., 'door_metal', { locked: true })`), a `keycard_reader` object
  beside it with `state: { card: 'keycard_facilities', door: [x, y, side] }`,
  inside a `render_node` with `state: { node: 'SRV-1' }` plus server racks.
* Lore: `org_chart`, `memo_continuity_1`, `terminal_mail_1`, `terminal_mail_2`,
  `poster_safety`. `z.meta.terminalLore = ['terminal_mail_1','terminal_mail_2','terminal_generic']`.
* Spawn: employee 3, swivel 3, drywall_man 1.5, ventling 2, hollow 1, custodian 0.5. Cap 9.

### stairwell — The Stairwell (48×192, depth 2) — impossible stairs
A vertical stack of identical concrete landings laid out down the map (each
landing ≈ 16×10: stair flights, railing, a numbered door, a light). Landing
numbers: 4, 3, 2, 1, 0, P1, P2, ... ; going down the flight from landing P3
loops (`loop` portal) back to landing 2 — the stairs never reach the bottom.
A hidden landing "13" between 1 and 0 (door p_stair_13 → corrupt, locked
stage:2). Doors: landing 0 → lobby (r_stair_lobby), 4 → office
(r_office_stair), P2 → parking (p_stair_parking). Grade `stairwell`,
ambience `stairwell`, reverb `stair`, cold (temp 15).
* Anchors: p_stair (landing 0), p_office_stair (landing 4), r_stair_parking (P2), r_stair_13 (13).
* Lore: `stair_graffiti`.
* Spawn: echo 2, hollow 1.5, employee 1, occupant 0.3. Cap 5.

### mall — Westgate Mall (192×160, depth 2)
Two-storey-feeling atrium (huge open space, fountain, planters, skylights,
benches), store units with shutters (some enterable: clothes, shoes, toys,
electronics, a food court with counters), kiosks, a carousel, escalators
(props), service corridors behind stores, restrooms, information desk, the
cinema (6 screens; screen 6 door = p_mall_cinema → corrupt, locked stage:2).
Entrances: to market (p_mall_market), parking (p_mall_lot), water park door
from pools (r_pools_mall). Grade `mall`, ambience `mall`, reverb `mall`, music `muzak`.
* Anchors: p_pools_mall, r_mall_market, r_mall_lot, r_mall_cinema.
* Lore: `mall_directory` (directory sign), `lost_child_notice` (info desk), `muzak_memo`.
* Spawn: davenport 2, hollow 2, employee 1, ventling 1, lumenmoth 1, custodian 0.5. Cap 9.

### market — Foodland (112×96, depth 2)
Supermarket: long aisles of shelves (food loot), fridges/freezers along walls
(fridge/freezer containers), produce, bakery, butcher counter, checkouts with
registers, office, back storage + **warehouse** (giant room with racking), a
loading dock (p_market_dock → parking). Entrance back to mall (r_mall_market).
Grade `market`, ambience `market`, reverb `mall`, music `muzak`.
* Anchors: p_mall_market, r_market_dock.
* Spawn: swivel 1, ventling 2, hollow 1, grinhound 1. Cap 6.

### parking — Parking Level P∞ (208×208, depth 2)
Endless multi-storey garage: concrete pillars in a strict grid, painted bays,
parked cars (all kinds, some with loot in trunks), ramps (props), sodium
lights in pools of orange, some sectors dark, ticket booths, elevator cores,
an outdoor section with lamp posts on asphalt. The far edges **loop** (walking
off one edge returns you to the other). Doors to suburbs road (r_suburbs_lot),
mall (r_mall_lot), market dock (r_market_dock), hospital (r_hospital_lot),
stairwell (r_stair_parking). Grade `parking`, ambience `parking`, reverb `tunnel`.
* Anchors: p_suburbs_lot, p_mall_lot, p_market_dock, p_hospital_lot, p_stair_parking.
* Lore: `parking_ticket`.
* Spawn: grinhound 2, hollow 1.5, sentinel 1.5, occupant 0.5. Cap 9.

### hospital — St. Aldric (144×120, depth 3)
Wards with beds and curtains, ER, operating theatre, pharmacy (medical loot,
locked cabinet), records room (type `records`), paediatric ward, morgue
(cold), cafeteria, waiting rooms with chairs, generator room. Doors: parking
(p_hospital_lot), basement stairs to tunnels (p_hospital_basement), the ward
door leading back to the school (r_school_nurse). Grade `hospital`,
ambience `hospital`, reverb `office`, music `drone`. Many lights broken.
* Anchors: p_school_nurse, r_hospital_lot, r_hospital_basement.
* Lore: `memo_lab_access` (records room — sets lab_code), `patient_file_hale`,
  `patient_file_0411` (records), `pharmacy_note`.
* Spawn: hollow 3, echo 1.5, employee 1, ventling 1, custodian 1. Cap 8.

### tunnels — Service Tunnels (160×160, depth 3)
Narrow concrete/brick corridors with pipes on the walls, grates, steam,
junction rooms (numbered), boiler rooms, pump rooms, flooded sections,
ladders up. This IS a maze, but with numbered junctions as landmarks.
Connections: ladder to suburbs (r_suburbs_manhole), ladder to pools
(r_pools_drain), stairs to hospital (r_hospital_basement), the **lab blast
door** at junction 4 (p_tunnels_lab, locked flag:lab_code) with a `keypad`
object beside it (`state: { code: '061480', codeFlag: 'lab_code' }`) and
anchor `lab_door`. Sato's body area near it with `journal_survey_4`.
* **Junction 9 cache**: a `survivor_stash` (or crate) behind the boiler with
  good loot (`state.loot` a strong table) — Sato's kit.
* Anchors: p_suburbs_manhole, p_pools_drain, p_hospital_basement, r_tunnels_lab, lab_door.
* Grade `tunnels`, ambience `tunnels`, reverb `tunnel`. Dark, few lights (bulbs).
* Spawn: underlay 2, ventling 2, drywall_man 1, grinhound 1.5, occupant 0.6. Cap 8.

### lab — Facility 4 (112×112, depth 4)
Meridian's hidden laboratory: decontamination airlock, clean corridors, labs
(benches, fume hoods, centrifuges), observation rooms with specimen tanks,
the sedation ward (cryo pods/beds, `terminal_lab`), offices, a server hall
with **render_node SRV-2** (`state: { node: 'SRV-2' }`), the director's office
with a terminal `state.lore = 'log_director'`, archive with `experiment_noclip`,
`specimen_log`, `continuity_spec`, `log_director_2`. Freight elevator
p_lab_core → server (locked stage:2). Entrances: blast door from tunnels
(r_tunnels_lab), stairs from the house basement (r_house_lab). Grade `lab`,
ambience `lab`, reverb `office`, music `drone`. Cold clean light.
* Anchors: p_tunnels_lab, p_house_lab, r_lab_core.
* Spawn: custodian 2, hollow 1, echo 1, employee 1. Cap 6.

### server — The Core (96×96, depth 5)
Rows of tall server racks (dark aisles, blue screen light), cooling plant,
a central chamber with the **core node SRV-3** (`render_node`,
`state: { node: 'SRV-3' }`) and a `core_console` terminal
(`state.lore = 'core_console'`). A door p_core_exit → exit (locked stage:3)
that should look like it was always there. Return elevator r_lab_core.
Grade `server`, ambience `server`, reverb `server`, music ''.
* Anchors: p_lab_core.
* Spawn: custodian 3, sentinel 1. Cap 5.

### corrupt — Unrendered (128×128, depth 5)
A patchwork of every other zone's rooms, misaligned: lobby carpet next to
pool tile next to lawn, walls at half height, floors of `void`/`glitch`,
props floating (use `state.y`), missing-texture patches, rooms repeated.
The **Custodian's office**: an ordinary office floating in void — desk with
the **root_key** (`f.floorItem('root_key', ...)`) and lore `custodian_memo`;
conference room C with lore `corrupt_text`. Doors back to the mall cinema
(r_mall_cinema) and the stairwell (r_stair_13). Grade `corrupt`, ambience
`corrupt`, reverb `void`, music `broken`. Tiles flagged `TF.CORRUPT`.
* Anchors: p_mall_cinema, p_stair_13.
* Spawn: custodian 2, hollow 2, echo 1.5, drywall_man 1, grinhound 1, occupant 1. Cap 9.

### exit — Exit (48×48, depth 6)
Almost nothing: white floor, soft white light, fog to white, a single
`exit_doorway` object with portal `p_exit_final` (`to: '__ending__'`,
locked stage:3), a note with `exit_note` taped near it. Arrival anchor
p_core_exit some distance away so the player walks toward the light. Grade
`exit`, ambience `exit`, reverb `dream`, music `choir`. No creatures.

### depot — Interchange 0 (192×72, depth 2) — `z_depot.ts`
A 1990 bus and rail interchange that never ends: the whole level repeats
every 128 tiles east–west (32-tile modules; loop seams at x 32 ↔ 160 and
159 ↔ 31) and only modules 1–2 (x 52..115) are unique. North to south: bus
lane + bays under sodium lamps (dead coaches `zw_coach`, NOT IN SERVICE),
bus platform, glass wall, concourse (dot-matrix `zw_departures` /
`zw_board_hanging` boards listing places nobody can go, steel benches,
pillars, newsstands, ticket machines), a row of rooms (waiting rooms with a
seated Still Life, toilets, Bay Cafe, left luggage, a quiet room where every
chair faces one corner), and Platform 0, whose edge drops onto a track bed
(`zw_track`, h −1.1) and then into void.
* **Bay 0** (x 70..75, y 10..21) is kept clear for the transport: room type
  `transport_bay`, anchor `transport_bay` at its platform end, and
  `z.meta.transportBay = { x0, y0, x1, y1, face, laneY, entry }` (the vehicle
  comes in from the lane at y 2..9 and noses south into the bay).
* **Ticket booth** `zw_ticket_booth` faces the concourse behind Bay 0; the
  debt contract's `ticket_kiosk` machine is placed by hand at the booth window
  (bx+1, 29) and the anchor `ticket_kiosk` is the tile in front of it.
* Unique rooms: Stairs to Level 0 (r_lobby_depot), Lost Property (lore
  `zw_lost_property`), Station Office (`zw_depot_driver`), Staff Corridor with
  the door to Annex B (`zw_annex_memo` on the noticeboard), the Waiting Hall
  full of seated Still Lifes. Hopper by hand in the concourse at (58, 39).
* Anchors: p_lobby_depot, transport_bay, ticket_kiosk, r_depot_annex, p_parking_depot.
* Grade `parking`, ambience `parking`, reverb `hall`, music `drone`. Spawn:
  still_life 3, hollow 1.5, employee 1, grinhound 1, sentinel 1, echo 0.8, occupant 0.3, gloam 0.8, stammer 0.8.

### showroom — The Showroom (176×128, depth 2) — `z_showroom.ts`
An endless furniture store: entrance (from the mall, hopper by the door), then
one long path of 66 room sets (living, kitchen, bedroom, dining, office,
nursery, bathroom; banners `zw_banner`, price stands `zw_price_stand`) along
three aisles with painted path edges and arrows. Sets deeper in repeat with
one thing wrong: a Still Life on the sofa, dinner served (real food on the
plates) with a family at the table, everything hung from the ceiling
(`zw_upside_down`), someone in the bed (`replica_lying`), a bathroom on its
side (`zw_on_wall`), SOLD / YOURS price cards. The "Living Room 14 / YOU ARE
HOME" set has a red front door in its back wall (p_showroom_home). Then the
cafeteria (food on every table, a children's corner), the collection point,
and the self-serve warehouse: pallet racking (`zw_rack`, `zw_flatpack`) that
loops east–west (period 16, seams x 24 ↔ 152), checkouts in the unique middle.
* Anchors: p_mall_showroom, r_showroom_home. Lore: `zw_showroom_memo`,
  `zw_showroom_receipt`, `zw_assembly`, `zw_home_child`, `zw_home_note`.
* Grade `market`, ambience `market`, reverb `mall`, music `muzak`. Spawn:
  still_life 4, davenport 1.5, employee 1.5, hollow 1, swivel 1, plushkin 0.6, plenum 0.8, stammer 0.6.

### homestead — The Homestead (100×84, depth 3) — `z_homestead.ts`
One family bungalow copied 4×4 times wall to wall. Every front door opens
onto the hallway of the house in front of it; the bottom row's front doors
open onto the top row's hallways (portals `home_front_k` → anchors
`home_hall_k`), except house 12 (→ showroom) and house 14 (→ suburbs). The
kitchen back door opens into the child's bedroom of the house behind; the
parents' bedroom into the next house's living room. Copies differ: the family
of Still Lifes at dinner (real food on the plates via `zw_table_setting` +
items), on the sofa facing the static `zw_tv_console`, in the beds, children
at the little table, the living room on the ceiling, chairs turned away,
buckets under drips. Portraits `zw_portrait` have smeared faces. Exterior
windows look onto black. Hopper by hand in house 12's dining room.
* Anchors: home_hall_0..3, p_showroom_home, p_suburbs_home.
* Grade `house`, ambience `house`, reverb `small`, music `musicbox`. Spawn:
  still_life 5, plushkin 1, lamplighter 1, echo 0.8, davenport 0.4, stammer 1.

### annex — Annex B (128×112, depth 3) — `z_annex.ts`
A 1990 Meridian research annex: beige vinyl walls (`zw_wall_annex`), carpet
tiles, cubicles, tape library, an observation room whose one-way glass looks
onto a sealed cell with a seated Still Life, break room, records, equipment
store, decontamination (`zw_hazmat` suits on hooks, `zw_decon_arch`), the
Transit Door to the depot, the director's office, Lab 3, meeting room, server
closet B. In the middle, the abandoned **base camp**: tents, `zw_cot`,
`zw_field_table`, hard cases, generator, work lights `zw_floodlight`, CRT
carts with test patterns `zw_crt_cart`, camcorders `zw_camcorder` pointed
east, a survey board, three tether stakes `zw_tether_stake` whose ropes
(decals via `ropeLine`) run into **Sector 7**, the east half where every
light is dead, black doorways `zw_black_door` stand in the walls and two
rooms rearrange. T1/T2 stop short; the blue T3 rope goes over the lip of a
hole (p_annex_under). Hopper by hand at the camp entrance (48, 51).
* Anchors: p_office_annex, p_depot_annex, r_annex_under. Lore:
  `zw_annex_memo`, `zw_annex_log`, `zw_annex_tape`.
* Grade `office`, ambience `office`, reverb `office`, music `drone`. Spawn:
  still_life 3, employee 2, hollow 1.5, swivel 1, drywall_man 1, echo 1, custodian 0.4, surveyor 1.5, plenum 1.2.

### undercroft — The Undercroft (96×96, depth 4) — `z_undercroft.ts`
Under the Lobby and Annex B: a wet concrete hall with no far wall, huge 2×2
pillars (`zw_pillar_huge`), ragged edges, standing water, rubble, black
doorways, a debtors' camp with a tally (`zw_under_ledger`), and in the middle
a pit with a rusted ladder going down (`zw_pit_ladder`, p_under_tunnels).
You arrive under two holes in the ceiling, each with a rope hanging out of it
(`zw_rope_hanging`): the tan one back up to Level 0, the blue one to Annex B.
Hopper by hand near the Level 0 rope. Very dark: bring light.
* Anchors: r_under_tunnels, p_annex_under, p_lobby_under.
* Grade `tunnels`, ambience `tunnels`, reverb `void`, music `drone`. Spawn:
  still_life 2, hollow 1.5, occupant 1, underlay 1, echo 1, grinhound 0.5, gloam 1.5, surveyor 0.8.

### Shared floors and dimensions — `void_kit.ts`, `z_floors.ts`, `z_chess.ts`, `z_meadow.ts`, `z_moon.ts`
Holes are pits of void tiles (`pit()`): walk into one and you fall
(`src/social/floors.ts`: tip, drop, black with wind, come down out of the dark
at the target's `fall` anchor). `z.meta.holes` records where each leads;
a `hole` portal records the link for zonecheck. `shared` holes, online, can
drop a solo player onto another player's open floor (relay `/floors`
directory; "Open floor" in the emote wheel). Every older `hole` portal now
plays the fall too.
* `floor~<n>` (64×64, a zone family, `defZoneFamily`): a generated floor per
  number — yellow / office / drained pools / sodium / red / static styles, BSP
  rooms with doorway gaps, one weird room (`giantStairs` over a void with a
  hole at the top and the void itself a way down, `scaleHall` with
  `vx_giant_chair` / `vx_giant_frame`, or three `stairsToNowhere`), 2–3
  shared holes deeper, sometimes a hole into a dimension, and a rope back up
  to the Lobby (`vx_return`). Anchor `fall`.
* `chess` — The Board (56×72): 8×8 squares of 4 m in violet void, start
  landing south, far side north (stash, hole). The board runtime
  (`src/social/dims.ts`) runs a turn clock: a black piece telegraphs its move
  with a red square, then slams; whoever stands there dies. White pieces are
  pushed (E, or Shift + walk into them); taking the king is checkmate
  (+30 RP, flag `vx:checkmate`). Initial endgame in `z.meta.chess`.
  Spawn chess_rook, chess_knight.
* `meadow` — The Meadow (96×96, outdoor): too-green terraced grass island in
  pastel void, pastel paths, humming `vx_pylon`s, `vx_daisy`, `vx_orb`,
  `vx_kiosk`, a mint pond, a hole down. Spawn bubble_mite, bubble_rabbit.
* `moon` — The Moon (96×96, outdoor): regolith and mare, craters (negative
  heights), cracks to the void showing the Earth under the ground, the
  Remittance lander (`vx_lander`, `vx_flag`, `vx_suit_empty`), a hole in the
  big crater. `z.meta.lowGravity`: every step is a bound. Spawn moon_wisp,
  moon_strider.
* Stamped into older zones (post-gen hook in `z_floors.ts`): Lobby (shared
  hole + `vx_return` anchor + stairs to nowhere), Undercroft (giant stairs →
  `chess`), Fields (hole → `meadow`), Lab (hole → `moon`), Showroom (scale
  hall with a hole).

### Wrong rooms — `wrong_kit.ts`, `lobbyWrong.ts`
A library of rooms that are wrong in one specific way: `high_door`
(`zw_high_door`), `ceiling_stairs` (`zw_stairs_ceiling`), `chairs_corner`
(chairs with `state.yaw` all facing one corner), `narrowing` (slanted
`zw_slab` walls squeezing a corridor to a `zw_crack`), `tiny_door`
(`zw_tiny_door`), `same_thrice` (three identical rooms in a row, same note),
`upside_down` (`zw_upside_down` / `zw_on_wall` render any furniture key on
the ceiling or standing on a wall: `state.of`, `state.ofState`), `sideways_bath`,
`dark_hole` (void hole with torn carpet edge; optional hole portal), `phones`
(`zw_phone`, ringing), `wet` (`zw_drip_bucket`, dripping), `bed_still` (a
Still Life sitting on a single bed), `poster_corridor` (`zw_poster_same`:
the figure in the poster gets closer), `tv_backs` (`zw_tv_stack`: CRTs
showing the back of a figure in a yellow jumpsuit), `loop_stairs` (a stairs
portal into the same zone that lands you at the foot of the same stairs).
* `carveWrong(z, b, rng, kind, rect, opts)` carves a fresh walled room (the
  Lobby has 14 of them plus the Underpass and the hole to the Undercroft, all
  ≥16 tiles from the spawn room); `wrongRoomsIn(z, b, seed, types, n, kinds)`
  dresses existing rooms (office ×5, hospital ×4, school ×3, mall ×3,
  suburbs ×2), skipping rooms with portals, anchors, mission props or
  mission items. Rooms are retyped `wrong_*` (flags `room:<zone>:wrong_*`).
* Sound cues (`src/world/roomFx.ts`): phones ring, buckets drip, TV stacks
  hiss, cracks whisper — local, proximity-based, every peer.

### Hand-placed contract props
New zones place the Remittance Hopper by hand near their entry
(`hopperAt` in `weird_kit.ts`, also recorded in `z.meta.hopperSites`); the
debt contract's post-gen hook leaves zones that already have one alone. The
depot places the `ticket_kiosk` at the booth window by hand.

## Liminal mechanics (use them!)

* **Looping corridors / streets**: two `loop` portals, e.g. at x=10 with
  `loopDx: +60` and at x=71 with `loopDx: -60`; geometry on both ends must be
  identical for ~12 tiles so the jump is invisible.
* **Bigger inside**: the fields house (exterior 8×8, interior zone 64×64).
  Also closets that open into huge rooms (portal to a distant anchor of the
  same zone).
* **Doors leading elsewhere**: wall doors whose `portal` leads to another zone
  (school nurse → hospital).
* **Shifting geometry**: `registerShift(z, id, x0, y0, x1, y1, variants, stamp)`
  from `src/world/shift.ts` — the region is rebuilt to another variant while
  no player can see it (rooms rearranging, corridors changing length, doors
  moving). Use for 3–8 regions per indoor zone.
* **Giant rooms, wrong proportions**: oversized doors, tiny doors, ceilings
  implied by huge pillars, a chair 3× scale (`state.scale` if supported).
