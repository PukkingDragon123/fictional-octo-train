# Instagram reels

| File | Inhabitant | Script |
|---|---|---|
| `limbo_phobia_reel_jelly_bear.mp4` | the Jelly (Gummy) Bear | `reels/jelly.json` |
| `limbo_phobia_reel_bumble_bee.mp4` | the Bumble Bee and its Queen | `reels/bee.json` |
| `limbo_phobia_reel_bee_keeper.mp4` | the Bee Keeper | `reels/keeper.json` |
| `limbo_phobia_reel_battering_hare.mp4` | the Battering Hare | `reels/hare.json` |
| `limbo_phobia_reel_gaunt_wolf.mp4` | the Gaunt Wolf | `reels/wolf.json` |
| `limbo_phobia_reel_parasite_salamander.mp4` | the Parasite Salamander | `reels/salamander.json` |
| `limbo_phobia_reel_gulper.mp4` | the Gulper | `reels/gulper.json` |
| `limbo_phobia_reel_balloon_puffer.mp4` | the Balloon Puffer | `reels/puffer.json` |
| `limbo_phobia_reel_worm_train.mp4` | the Worm Train | `reels/worm.json` |
| `limbo_phobia_reel_stalker.mp4` | the Stalker | `reels/stalker.json` |
| `limbo_phobia_reel_frog_piranha.mp4` | the Frog-legged Piranha | `reels/piranha.json` |

1080 x 1920, 24 fps, H.264 + AAC, -14 LUFS. Contact sheets: `build/sheets/<id>.jpg`. Credits: `CREDITS.md`.
Older versions: `v1/`, `v2/`.

## Making a reel: `tools/make.mjs`

```
node release/video/reels/tools/make.mjs release/video/reels/reels/wolf.json          # the finished reel
node release/video/reels/tools/make.mjs release/video/reels/reels/*.json             # all of them, one at a time
node release/video/reels/tools/make.mjs reels/wolf.json --preview                     # half size, fast: build/preview/wolf.mp4
node release/video/reels/tools/make.mjs reels/wolf.json --still 12.5                  # one finished frame: build/stills/wolf_12.5.png
node release/video/reels/tools/make.mjs reels/wolf.json --sheet                       # the middle of every shot: build/sheets/wolf_shots.jpg
```

What it does, all cached in `build/cache/` so a second run only redoes what changed:

1. **Voice** (`tools/voice.py`): each line through Kokoro `af_heart`, the Institute's 8-bit PA chain
   (`tools/voice_scary.py`), then speech recognition with word timestamps on the finished clip; the line's own
   words get those times, and the clip's loudness is kept for the captions. Cached by the text.
2. **Plan**: the opening, each beat and the card hand-over last as long as their line (+ a short lead and
   tail); the recruiting screen is held 3 s after the last line.
3. **Frames** (`tools/studio/`, driven by `tools/studiopage.mjs`): the game's own renderer, the zone generated
   by the game, the inhabitants built and animated by their own code (their gallery poses), Dr. Calder and the
   unit as HumanRigs. Each shot is cached by its content; only one browser runs at a time.
4. **Sound** (`tools/mix2.py`): her lines, the music box bed (ducked under her), the zone's room beds, and
   recorded CC0 effects picked by tag from `tools/sfx_tags.json`: the inhabitant's steps while it moves, a
   sound of it in every beat, the catch, the card, the screen coming on.
5. **Picture** (`tools/compose.py`): frames scaled to 1080 x 1920, the Institute's lockup in the opening,
   and captions that move with her voice: each word pops in as she says it (scale-up, overshoot, settle) with
   a green glow that blooms and decays, the word she is saying brightest, the caption breathing a little with
   the loudness of her voice, key words in yellow, a clean fade up and away.
6. **Encode**: H.264 + AAC (`tools/enc.mjs` settings), then a contact sheet every 2 s.

Setup once: `npm install` in `tools/` (the `qrcode` package for the recruiting screen); a Python with
`kokoro-onnx faster-whisper soundfile numpy pillow` (`REEL_PY=/path/to/python`), the Kokoro files
`model.onnx` + `voices.npz` in `KOKORO_DIR`; ffmpeg. The tool starts its own vite from the repository root
(`BASE=http://127.0.0.1:5199` uses a running one).

### reel.json

```jsonc
{
  "id": "wolf",                                   // cache / output name (default: the file name)
  "file": "limbo_phobia_reel_gaunt_wolf.mp4",     // written to release/video/reels/
  "creature": "gaunt_wolf",                       // species key: picks the zone, the stage, the sounds (CREATURES in make.mjs)
  "zone": "meadow",                               // optional: any zone key; default from the creature
  "stage": { "find": "open" },                    // optional: "open" | "water" (a pool edge) | "low" (a platform edge),
                                                  //   or { "x", "z", "yaw" } in tiles
  "accent": ["Gaunt Wolf", "three rows"],         // words shown in the accent colour (the Institute and 'unit' always are)
  "intro": { "line": "Hi! I'm Dr. Iris Calder, from the Meridian Institute of Liminality. Today: the Gaunt Wolf." },
  "beats": [                                      // one shot per beat, as long as its line
    {
      "line": "Then it comes at a lope, then a charge. It knocks the unit down, and stands on it.",
      "shot": {
        // positions are metres on the stage: [x, z], +z forward (across the open floor / into the water /
        // over the tracks), +x to the left of a camera looking forward
        "creatures": [{ "key": "gaunt_wolf", "from": [0, 16], "to": [0, 6],
                        "poses": [[0, "lope"], [2.2, "charge"]] }],     // or "pose": "walk"; "at": [x, z] to stand;
                                                                        // "face": "camera" | "unit" | "calder" | degrees;
                                                                        // "y": height offset; "scale"
        "unit": { "at": [0.5, 3], "face": "creature" },                 // "to": [x, z] walks; "do": "downed" | "crouch" | "flee"
        "caught": { "t": 3.4, "pose": "maul" },                         // the creature reaches the unit at t s: its pose,
                                                                        // "then": a pose after, "drag": [x, z], "hide": s (swallowed)
        "calder": null,                                                 // { "at", "do": "point" | "present" | "think" | ...,
                                                                        //   "doAt": s, "look": "creature" | "camera" | "unit" }
        "camera": { "move": "over", "dist": 2.2 }                       // see below
      },
      "sfx": [{ "tag": "growl", "at": 0.4, "gain": -10 }]               // extra sounds: tag from tools/sfx_tags.json
    }
  ],
  "card": { "line": "If you want to join the Institute, here's my card." },     // optional (this is the default)
  "end": { "line": "The Meridian Institute is now recruiting units. Scan the code, or comment 'unit', to enlist." }
}
```

Camera `move`: `wide` (the whole creature and more), `medium`, `close`, `low` (from the floor), `orbit`
(swings `orbit` degrees round), `track`, `push`, `two` (Dr. Calder in the near side of the frame, turned to
the lens, the creature beyond), `over` (over the unit's shoulder). Options: `on` (`body`, `head`, `tail`,
`feet`, `unit`, `calder`, `mid`, `stage`, or `[x, y, z]` fractions of the creature's size in its own frame),
`size` (metres of picture width to fit), `angle` (degrees round the stage), `dist`, `height`, `fov`, `push`,
`lookY`. Other beat keys: `lead`, `tail`, `hold` (seconds), `dur` (a beat with no line), `quiet` (no creature
sound), `zone` (film this beat elsewhere). `light` in a shot scales the film lights (dark zones: 1.5).

The opening (Dr. Calder at the Ledge field outpost), the card she hands over (`tools/studio/paperCard.ts`) and
the recruiting screen (`tools/studio/adScreen.ts`: the lockup, NOW RECRUITING UNITS, a QR code to
`itch_url.txt` with the link under it, COMMENT "UNIT" TO ENLIST) are shared by every reel and rendered once.

The three first reels are `"legacy"` scripts: their shots are the hand-made ones in `tools/studio/reelShots.ts`
(cached frames in `build/cache/legacy/`), their timing `build/plan.json`, their sound `tools/mix.py`.

## Changing the link

Put it in `itch_url.txt` and run `make.mjs reels/*.json` again: the card and the recruiting screen are redrawn
with the new link and QR code, everything else comes from the cache. (`tools/endcard.mjs` swaps only the
recruiting screen into finished files.)

## Other tools

- `tools/voice_lines.mjs` + `tools/voice_game.py` + `tools/voice_scary.py --ogg`: the in-game voice clips
  (`public/voice/calder/`).
- `tools/capture.mjs`, `tools/assemble.mjs`, `tools/plan.py`, `tools/captions.py`, `tools/mix.py`: the v2 pipeline.
- The QR code is checked with a decoder (zxing-cpp) on frames cut from the finished MP4s.
