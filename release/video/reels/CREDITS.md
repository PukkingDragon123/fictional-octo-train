# Instagram reels: credits

Eleven vertical reels (1080 x 1920, 24 fps, H.264 + AAC), one for each inhabitant: the Jelly Bear, the
Bumble Bee (with its Queen), the Bee Keeper, the Battering Hare, the Gaunt Wolf, the Parasite Salamander,
the Gulper, the Balloon Puffer, the Worm Train, the Stalker and the Frog-legged Piranha. Everything on
screen is the game itself: the zones (the Ledge, the Meadow, the Undercroft, the Plunge, Westgate Station,
Level 0) generated and drawn by the game's own renderer, the inhabitants built and animated by their own
species code, Dr. Iris Calder and the unit built from the game's HumanRig. The card she hands over (heavy
paper with a green hologram, `tools/studio/paperCard.ts`) and the recruiting screen each reel ends on (a
clean green display with Dr. Calder in front of it, `tools/studio/adScreen.ts`) are modelled and lit in
the game's renderer. The Meridian Institute of Liminality lockup and bishop emblem are the game's own brand
art (`public/brand/`). The QR code on the screen encodes the game's itch.io page (`itch_url.txt`).
The captions are drawn by `tools/compose.py` in **Alagard**, word by word on the times speech recognition
finds in her recorded lines.

## Dr. Calder's voice

- Speech synthesised locally with **Kokoro-82M** (hexgrad), voice **`af_heart`** (a warm adult female
  English voice), run on the CPU through the `kokoro-onnx` package (ONNX export:
  <https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX>).
- Licence: **Apache License 2.0** (model and voice packs) - free to use in a commercial game and video.
  <https://huggingface.co/hexgrad/Kokoro-82M>
- Made into the Institute's old PA voice by `tools/voice_scary.py` (signal processing only, no other
  voice or sample): pitched down 8%, a faint copy an octave below, sample-and-hold at 9 kHz, 8-bit
  quantising, a short metallic comb and slap, a slow tape wobble and a PA band-pass. Checked for
  intelligibility with speech recognition (faster-whisper `base.en`, MIT).
- The same voice speaks her lines in the game (`public/voice/calder/`, see `src/audio/calderVoice.ts`).

## Music

| Track | Author | Source | Licence |
|---|---|---|---|
| 4 Music Box Tracks (as cut for the game: `mus_musicbox`) | Aureolus_Omicron | <https://opengameart.org/content/4-music-box-tracks> | CC0 |

## Sound effects

All recorded sounds, none generated. Most come from the game's own sample library
(`src/assets/sfx/`, converted from the OpenGameArt packs listed in `/CREDITS-AUDIO.md`); three were
downloaded for the reels (`build/sfx_extra/`). The reel tool picks them by tag from `tools/sfx_tags.json`,
which lists only these recorded packs.

| Sound (file) | Pack | Author | Source | Licence |
|---|---|---|---|---|
| Bee buzz (`bee.wav`, looped and pitched) | Single Bee sound | IMadeIt | <https://opengameart.org/content/single-bee-sound> | **CC-BY 3.0** (attribution: "Single Bee sound" by IMadeIt, OpenGameArt.org, <https://creativecommons.org/licenses/by/3.0/>; trimmed, looped, pitched, mixed) |
| Insect clicks (`insect0-4.ogg`) | Insect Sounds | fvcalderan | <https://opengameart.org/content/insect-sounds> | CC0 |
| Cut to the screen (`whoosh2.wav`) | Air Whoosh | pyranostudios | <https://opengameart.org/content/air-whoosh> | CC0 |
| Slime, splash, bubbles (`slime_*`, `splash_*`, `bubble_*`) | 40 CC0 water / splash / slime SFX | rubberduck | <https://opengameart.org/content/40-cc0-water-splash-slime-sfx> | CC0 |
| Creature burps, bug noises, breaths, crackles (`burp_*`, `bug_*`, `breath_*`, `cmisc_*`) | 80 CC0 creature SFX / 80 CC0 creture SFX #2 | rubberduck | <https://opengameart.org/content/80-cc0-creature-sfx>, <https://opengameart.org/content/80-cc0-creture-sfx-2> | CC0 |
| Bear growls (`growl_*`) | 16 Monster Growls | StarNinjas | <https://opengameart.org/content/16-monster-growls> | CC0 |
| The Queen (`beast_*`) | Monster Sound Pack, Volume 1 | Ogrebane | <https://opengameart.org/content/monster-sound-pack-volume-1> | CC0 |
| Squishes (`squish_*`) | Squish Sounds Effects | EZduzziteh | <https://opengameart.org/content/squish-sounds-effects> | CC0 |
| The split (`wetbreak_*`) | Fleshy Bone Break/Snap SFX | Zane Little Music | <https://opengameart.org/content/fleshy-bone-breaksnap-sfx> | CC0 |
| Wet chewing (`mud_*`) | 25 CC0 mud sfx | rubberduck | <https://opengameart.org/content/25-cc0-mud-sfx> | CC0 |
| Hits, body falls (`hit_*`, `fall_*`) | 75 CC0 breaking / falling / hit sfx | rubberduck | <https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx> | CC0 |
| Sting, cloth, card in the hand, creak (`blade_*`, `cloth_*`, `book_*`, `creak_*`) | 50 RPG sound effects (blade also: 80 CC0 RPG SFX, rubberduck) | Kenney | <https://opengameart.org/content/50-rpg-sound-effects> | CC0 |
| Footsteps (`fs_dirt_*`) | Different steps on wood, stone, leaves, gravel and mud | TinyWorlds | <https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud> | CC0 |
| Flashlight handling (`plastic_*`) | 202 More Sound Effects | OwlishMedia | <https://opengameart.org/content/202-more-sound-effects> | CC0 |
| Inhabitants: growls, breaths, clicks, burps, bites (`growl_*`, `beast_*`, `breath_*`, `bug_*`, `cmisc_*`, `burp_*`, `cweird_*`, `attack_*`, `die_*`) | 16 Monster Growls / Monster Sound Pack Vol. 1 / 80 CC0 creature SFX (1 and 2) | StarNinjas / Ogrebane / rubberduck | see `/CREDITS-AUDIO.md` | CC0 |
| The Stalker's breath (`zombie_*`) | Zombie noises and moans | ianzazz | <https://opengameart.org/content/zombie-noises-and-moans> | CC0 |
| Bone breaks (`deepbreak_*`) | Deep Bone Crack/Break SFX | Zane Little Music | <https://opengameart.org/content/deep-bone-crackbreak-sfx> | CC0 |
| The Worm Train's legs and doors (`metalhit_*`, `metalslam_*`, `metalfall_*`) | 100 CC0 metal and wood SFX / 75 CC0 breaking, falling, hit sfx | rubberduck | <https://opengameart.org/content/100-cc0-metal-and-wood-sfx> | CC0 |
| More steps (`fs_wet_*`, `fs_lino_*`, `fs_wood_*`) | 100 CC0 SFX #2 | rubberduck | <https://opengameart.org/content/100-cc0-sfx-2> | CC0 |
| Room beds: wind, water, machines, tunnel, hum, dark (`bed_wind`, `bed_gust`, `bed_water`, `bed_machine`, `bed_tunnel`, `bed_air`, `dark_*`) | Mild Wind Background Noise / wind whoosh loop / 100 CC0 SFX #2 / Loopable Dungeon Ambience / General Household Sound Effects / Dark Ambiences | Bashar3A / SketchMan3 / rubberduck / JaggedStone / bretbernhoft / Ogrebane | see `/CREDITS-AUDIO.md` | CC0 |
| The screen's breaker (`breaker_1`) | SFX - Circuit breaker | CleytonKauffman | <https://opengameart.org/content/sfx-circuit-breaker> | CC0 |
| The tube's static (`static_burst_*`, `bed_static`) | Frequency Static Sound Effects | bretbernhoft | <https://opengameart.org/content/frequency-static-sound-effects> | CC0 |
| Keys under the type (`typing_1`) | Keyboard Soundpack #1 | unicaegames | <https://opengameart.org/content/keyboard-soundpack-1-typing-and-single-keystrokes> | CC0 |
| Room tone (`bed_hum`) | General Household Sound Effects | bretbernhoft | <https://opengameart.org/content/general-household-sound-effects> | CC0 |
| Drips (`bed_drips`) | Dripping water loop | Independent.nu | <https://opengameart.org/content/dripping-water-loop> | CC0 |

## Fonts

- Captions and the card's "JOIN THE INSTITUTE": **Alagard** by Hewett Tsoi (free font, as used by the game).
- The link on the card: **IBM Plex Mono** (SIL Open Font License, `public/fonts/OFL-ibmplexmono.txt`).

## Code

- Rendering: three.js (MIT); capture: Playwright with Chromium (Apache 2.0); encoding: FFmpeg (libx264);
  captions and compositing: Pillow (HPND); word timings: faster-whisper `base.en` (MIT).
- QR code: the `qrcode` npm package (MIT, <https://github.com/soldair/node-qrcode>), error correction M;
  checked to decode with zxing-cpp (Apache 2.0) on the finished frames.
