# NOCLIP

An isometric survival-horror sandbox set in endless liminal rooms. You are
a debtor in a yellow jumpsuit. Meridian Institute guards drag you through a
1990 processing wing, beat you, and shove you through a black seam in a wall.
You land on damp yellow carpet with a BAILIFF band bolted through your wrist.
It will blow your arm off if you try to leave. A flickering hologram sergeant
tells you the deal: smash the furniture, find what's worth something, and feed
it to the hoppers until the debt is paid. Then buy a ride out. The building goes
on forever, rooms repeat, corridors loop, the people sitting at the dinner
tables are not people, and other things live here.

It runs in the browser: low-poly 3D with hand-painted pixel-art textures,
rendered at low resolution with outlines, dithering and per-zone colour
grading, in the spirit of the PS1 era and Project Zomboid's camera.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, single player
```

Co-op needs the small relay server, which also serves the built game:

```bash
npm start            # builds, then serves game + relay on http://localhost:8787
```

The host picks **Co-op → Host** on the title screen and shares the five-letter
room code. Friends open the same address and pick **Join**. Up to 8 players.
Proximity voice uses WebRTC, so the browser will ask for the microphone.

Other scripts:

| command | what it does |
|---|---|
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | production build into `dist/` |
| `node scripts/zonecheck.mjs [zone…]` | generate zones headlessly, validate portals/anchors/reachability, write top-down maps to `scripts/out/` (`SEED=`, `ROOMS=1`, `ASCII=1`) |
| `node scripts/shot.mjs <url> <out.png> [waitMs] [steps.json]` | headless screenshot against a running dev server |
| `node scripts/walkthrough.mjs [devUrl]` | plays the main mission chain from the lobby fuses to the ending through the real mission objects and portals |
| `VITE_SANDBOXED=1 npx vite build && node scripts/artifact.mjs` | packages a single-page build (CSS and fonts inlined) for sandboxed hosts; co-op is disabled there |

URL flags: `?quick` skips the title and the intro and starts a fresh run (band already fitted);
`?intro=0` keeps the title but skips the intro, `?intro` forces it;
`?gallery=<set>` and `?sandbox` open the asset gallery and the rendering sandbox.

## Controls

| key | action |
|---|---|
| WASD | walk (Shift run, C/Ctrl sneak) |
| Right mouse (hold) + Left mouse | ready weapon, attack / fire |
| Right click | context menu on anything: loot, open, barricade, dismantle, cook, treat… |
| E | interact with what's in front of you |
| Right click on furniture | Smash it, Kick it, Push, Drag (Let go to release), smash through drywall, smash a light |
| Space | shove |
| F | flashlight |
| Tab | raise the SEER-9 scanner (1–6 / Q E / wheel to change pages) |
| I | open the backpack (drag to place, R or right-click to turn while dragging, Shift-drag takes half, Ctrl-drag takes one, double-click quick-moves) |
| L | expand / collapse the BAILIFF hologram (body map, status, debt ledger) |
| M | map |
| R | reload; rotate while placing furniture |
| Q | shout |
| H | breathing exercise (calms a panic attack) |
| Z / X, wheel | rotate camera, zoom |
| Middle mouse or Alt+drag | orbit the camera freely (snaps back on release) |
| PageUp / PageDown, Alt+wheel | camera pitch |
| P | photo mode (free camera, hidden HUD, Space saves a picture) |
| V (hold) | talk: proximity voice, or the walkie-talkie when it's on |
| Enter / T | chat |
| Esc | close / pause |

In a vehicle: W/S throttle and brake, A/D steer, R ignition, F headlights,
Space horn, E get out.

On phones and tablets the touch layer turns on by itself (Options → Touch
controls: auto / on / off). The controls are found objects drawn in 3D:
- a red valve wheel to move
- a domed industrial button to attack (tap to strike, hold to aim with target lock)
- a toggle switch under a flip-up cover to run
- a bottle cap to use whatever is in reach
- a crash bar to shove, a slipper to sneak, a pull-chain bulb for the light and a whistle to shout
- a camera, folded map, mini scanner and rucksack along the top

They bleed, rust and twitch with what is happening to you. Tap to act or walk,
hold anywhere for the context menu, swipe sideways to turn the camera and pinch
to zoom. Driving swaps in a steering wheel, pedals, a horn, a headlight knob
and an ignition key.

## What's in it

- **Intake.** A new game opens on intake camera 2: cuffed, marched down a
  wet concrete corridor between two guards, beaten, and shoved through the
  Seam. A guard steps out after you and bolts the BAILIFF band through your
  wrist. Skippable; `?intro` forces it, `?quick` skips it.
- **The debt.** You and your crew owe the Institute 25,000 scrip (Terms
  screen: amount, days per installment, how lethal the band is). Smash
  furniture to shake out what was hidden in it: rings in the sofa cushions,
  watches in desks, boards and copper in TVs. Push loot, or whole pieces of
  furniture, onto a Remittance Hopper, which weighs, scans and swallows them.
  Five installments come due on a timer, and missing one shocks every band.
  Clear the debt, buy passage at the depot (a freight lift, the night coach,
  or the Quiet Car) and board before it leaves.
- **The band and Voss.** The BAILIFF band talks in a cold synthetic voice and
  projects a hologram from your wrist. A heartbeat trace runs at your real
  pulse, and hunger, thirst, pain, bleeding, cold, panic and sickness all
  change its shape. Expand it for the body map and the ledger. Go near the
  Seam and it counts down; cut it off with bolt cutters if you dare.
  Staff Sergeant Voss, a scanline hologram in a beret, teaches you the job and
  comments on how you're doing it.
- **Your mind matters.** Anxiety, low mood, insomnia, trauma flashbacks,
  loneliness and private hallucinations build from what happens to you;
  panic attacks race your heart and blur your aim. Sleep, food, light,
  company, comfort items, music, journaling, breathing and pets help, and
  medication has real side effects. The band's hologram shows your pulse
  and state of mind, and lies to you when you hallucinate.
- **Gore and limb loss** (Gore: Off / Normal / Heavy; Limb loss: on / off):
  weapon-specific blood, arterial sprays, blood running down walls, pools
  that creep out under corpses, bloody footprints, wounds that stay on
  bodies, severed heads and limbs, bodies torn in two, blood on the lens,
  monsters feeding on the dead. Monsters grab survivors and tear off hands,
  arms, feet and legs; a stump bleeds out unless you tourniquet, cauterise or
  stitch it, and you live on one-handed, on crutches, a peg leg or a hook.
  Monsters lose limbs mid-fight and keep coming on what they have left.
- **Destruction.** Furniture dents, cracks and then breaks into real
  pieces with splinters, stuffing, sparks and glass. Contents spill. Drywall
  can be smashed through, lights put out, windows shattered. Grab furniture to
  push or drag it, slowly, scraping.
- **Monsters that look the part.** Twenty-three species. Still Lifes are wax
  copies of people (sometimes of you) sitting at dinner tables, which turn
  their heads when you look away. The Stammer frame-skips toward you in the
  dark. The Surveyor is something wearing a 1990 hazmat suit. The Plenum
  crawls inside the ceiling, and the Gloam is only eye-shine and teeth. Every
  creature freezes when watched, twitches, and makes your torch stutter.
- **Bodies that move.** Feet plant without sliding, the body leans into
  turns, heads track threats, hits throw you by direction and body part, the
  dead fall as ragdolls, and wounds, hunger and panic show in how you walk.
- **A camera with weight.** Shake, recoil and zoom punches, free orbit and
  pitch, look-ahead toward your aim, push-ins when you go down, and photo
  mode; ambient occlusion, bloom, volumetric light and flashlight beams,
  wet-floor reflections and pool caustics, with quality presets for phones.
- **Intake processing and the Rehab Section.** Click any part of the 3D
  prisoner in front of the height chart to change it: an identikit for the
  face, a barber's chart, tattoo flash, a fingerprint card, the jumpsuit's
  sleeves and stains. In the Rehab Section, jobs are case files and traits
  are X-ray films, and every one says what it gives you and what it costs.
  "Let the Board decide" deals a random programme. Most jobs are locked
  until you earn them, and stay unlocked across runs.
- **No traditional UI.** The title is a security desk with a CCTV monitor,
  settings are clipboards you stamp, saves are case files in a cabinet, and
  pause freezes the world inside the band's hologram. The backpack swings in
  hanging from a spring scale, unzips, and is a stitched canvas grid where
  every item takes its real space. Pockets are on the jumpsuit, and a drawer
  you loot is a wooden tray. Context menus are tags fanned out from what you
  clicked, and progress is tally marks scratched round your feet.
- **Survival you have to manage.** Hunger, thirst, fatigue, temperature,
  wetness, exhaustion, panic, stress, boredom and sickness. Body-part injuries
  (scratches, lacerations, bites, burns, fractures) bleed and get infected
  until you clean, stitch, splint and bandage them. Tear clothing into rags,
  boil water, cook, collect rain, farm, trap and hunt.
- **A world that keeps going.** Twenty-two interconnected zones: the yellow
  Lobby, offices, pools, malls, supermarkets, parking garages, suburbs, a
  school, a hospital, service tunnels, dreamcore fields and houses, a lab, the
  server core, and places that are already falling apart. There are also five
  newer places: an endless 1990 bus depot, a furniture showroom with no end,
  one family home copied 4×4 and stitched to itself, a research annex with an
  abandoned expedition camp and ropes leading into the dark, and a flooded
  pillared undercroft. Wrong rooms everywhere: doors high on walls, stairs into
  the ceiling, chairs facing a corner, a sideways bathroom, a corridor of the
  same poster where the figure gets closer. Corridors loop
  seamlessly, rooms rearrange while nobody is looking, doors open somewhere
  else, and some rooms are bigger inside.
- **Hands-on building.** Move, pick up and place furniture; barricade doors and
  windows; break windows; dismantle anything for parts; build walls, crates,
  beds, planters and workbenches; run generators and flip breakers; start
  fires (which spread).
- **Creatures with their own lives.** They eat, sleep, nest, wander, hunt and
  react to sound and light. Some are harmless or curious, some territorial,
  some patient. Some imitate your friends' voices, watch from far away, or only
  move when nobody's looking. Rare ones can be studied with the scanner,
  trapped or tamed.
- **The SEER-9.** A 3D handheld scanner with a pixel CRT, issued to find
  hoppers (they beacon on 77.7 MHz): health, anomaly scans, radio signals, a
  self-drawing map, directives and the log. Apart from the band's hologram
  there is no HUD.
- **Co-op.** Shared world and bases, give items, carry and revive downed
  friends, proximity voice with wall occlusion, walkie-talkie channels with
  radio crackle, and chat.
- **Directives.** The contract is the main chain: first haul, five
  installments, discharge, passage. A side chain is the way out they don't
  want you to find: restore power, follow the numbers station, take the
  render nodes offline, find the root key and shut the core down. That kills
  every band and opens the other ending. Choose RELEASE on the title for free
  survival: no contract, no band (a plain wrist monitor shows your vitals).
- **Sandbox settings.** Character creation with occupations and traits, world
  presets and custom settings, seeds, and autosaving to the browser
  (IndexedDB).

## Code tour

```
src/
  core/        input, events, deterministic RNG and ids
  gfx/         pixel renderer, materials, texture atlas, model builder
  world/       tile zones, chunk mesher, lighting, visibility, world graph,
               shifting regions; gen/ holds one generator per zone
  entities/    player and the humanoid rig
  survival/    body simulation, moodles, traits and occupations
  items/       item model, containers, crafting, world systems (fire, power,
               farming, traps, building, furniture)
  creatures/   creature manager, behaviours, species
  missions/    directives, flags, mission objects, collapse
  audio/       procedural WebAudio: sounds, ambience, reverb, music
  net/         relay client, replication, WebRTC voice
  vehicles/    driveable cars
  ui/          scanner, inventory, menus, speech and chat
  content/     items, loot, recipes, furniture, textures, lore
server/        WebSocket relay and static file server
docs/          WORLD.md (zones and links), CONTENT_GUIDE.md, REFERENCES.md
```

Every change to the world goes through a small op log (`src/game/ops.ts`).
That one log drives multiplayer replication and save games, so generation and
ids are deterministic per seed.

## Credits and originality

Everything here is original: art, text, creatures, sounds and UI are generated
in code. The game borrows only the broad premise of the 2019 "noclip into
endless empty rooms" creepypasta and the general feel of isometric survival
games. `docs/REFERENCES.md` lists the research behind it and the IP rules the
project follows.
