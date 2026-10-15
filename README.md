# NOCLIP

An isometric survival sandbox set inside a simulation that is coming apart.
You wake on damp yellow carpet under humming lights with a handheld scanner
you don't remember picking up. The building goes on forever, rooms repeat,
corridors loop, and things live here. Survive alone or with friends, or follow
the signal down to the machine that runs it all and switch it off.

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

URL flags: `?quick` skips the title and the intro and starts a fresh run;
`?intro=0` keeps the title but skips the intro, `?intro` forces it;
`?gallery=<set>` and `?sandbox` open the asset gallery and the rendering sandbox.

## Controls

| key | action |
|---|---|
| WASD | walk (Shift run, C/Ctrl sneak) |
| Right mouse (hold) + Left mouse | ready weapon, attack / fire |
| Right click | context menu on anything: loot, open, barricade, dismantle, cook, treat… |
| E | interact with what's in front of you |
| Space | shove |
| F | flashlight |
| Tab | raise the SEER-9 scanner (1–6 / Q E / wheel to change pages) |
| I | inventory |
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
controls: auto / on / off): a floating stick to move (push fully or
double-tap to run), ATTACK (tap to strike, hold to aim with target lock),
USE, SHOVE, SNEAK, LIGHT and SHOUT buttons, map/scanner/pack buttons up top,
tap to act or walk, hold anywhere for the context menu, pinch to zoom and a
two-finger twist to turn the camera. Driving gets its own gas, brake, horn,
lights and ignition buttons.

## What's in it

- **Clipping in.** A new game opens on a night shift at the Meridian
  Institute; reality goes wrong around you and you fall through the floor
  into the Lobby.
- **Your mind matters.** Anxiety, low mood, insomnia, trauma flashbacks,
  loneliness and private hallucinations build from what happens to you;
  panic attacks race your heart and blur your aim. Sleep, food, light,
  company, comfort items, music, journaling, breathing and pets help, and
  medication has real side effects. A KESTREL wrist monitor shows the time,
  your pulse, temperature and state of mind.
- **Gore and limb loss** (Gore: Off / Normal / Heavy; Limb loss: on / off):
  weapon-specific blood, wall splatter, spreading pools, bloody footprints,
  severed heads and limbs, gibs. Monsters grab survivors and tear off hands,
  arms, feet and legs; a stump bleeds out unless you tourniquet, cauterise or
  stitch it, and you live on one-handed, on crutches, a peg leg or a hook.
  Monsters lose limbs mid-fight and keep coming on what they have left.
- **Monsters that look the part.** Eighteen species rebuilt as skinned
  low-poly bodies with hand-painted textures: planted-foot gaits, stalking,
  wind-up lunges, flinches, furniture disguises that match the real props.
- **A camera with weight.** Shake, recoil and zoom punches, free orbit and
  pitch, look-ahead toward your aim, push-ins when you go down, and photo
  mode; ambient occlusion, bloom, volumetric light and flashlight beams,
  wet-floor reflections and pool caustics, with quality presets for phones.
- **A personnel file to fill in.** A live 3D model of your survivor turns and
  emotes while you choose looks, a job and traits (40-odd, many of them
  silly). Most jobs are locked until you earn them by playing, and stay
  unlocked across runs.
- **Survival you have to manage.** Hunger, thirst, fatigue, temperature,
  wetness, exhaustion, panic, stress, boredom and sickness. Body-part injuries
  (scratches, lacerations, bites, burns, fractures) bleed and get infected
  until you clean, stitch, splint and bandage them. Tear clothing into rags,
  boil water, cook, collect rain, farm, trap and hunt.
- **A world that keeps going.** Seventeen interconnected zones: the yellow
  Lobby, offices, pools, malls, supermarkets, parking garages, suburbs, a
  school, a hospital, service tunnels, dreamcore fields and houses, a lab, the
  server core, and places that are already falling apart. Corridors loop
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
- **The SEER-9.** A 3D handheld scanner with a pixel CRT is the main UI:
  health, anomaly scans, radio signals, a self-drawing map, directives and the
  log. There is almost no HUD.
- **Co-op.** Shared world and bases, give items, carry and revive downed
  friends, proximity voice with wall occlusion, walkie-talkie channels with
  radio crackle, and chat.
- **Directives.** An optional mission chain: restore power, follow the numbers
  station, take the render nodes offline, find the root key, shut the
  simulation down and find the way out. Each server you take down makes the
  world less stable. Turn directives off for pure sandbox survival.
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
