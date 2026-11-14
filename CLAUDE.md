# Limbo Phobia: notes for Claude sessions

## Every session
- At the start of every session, invoke the `/token-saver:token-saver` skill and keep it active for the whole session
  (compact output level 2, a one-line topic at the top of replies, layered snapshots when the conversation gets long,
  Q&A archived by concept). Data lives in `~/.claude/token-saver/` (config `~/.token-saver/config.json`).

## Project
- Isometric pixel-art survival horror for the browser: Vite 8, TypeScript, three r186.
- Checks: `npx tsc --noEmit -p .`, `node scripts/zonecheck.mjs`, `node scripts/walkthrough.mjs http://127.0.0.1:5199`
  (dev server: `NOHMR=1 npx vite --host 127.0.0.1 --port 5199`).
- Builds: `node scripts/itch.mjs` (itch.io zip), `VITE_SANDBOXED=1 npx vite build && node scripts/artifact.mjs` (artifact page).

## The user's UI quality bar (apply to every screen, no reminders needed)
- Highly textured, polished, high-resolution, detailed. Never low-res, chunky, blurry or placeholder-flat.
- Real 3D objects with rich materials (worn metal, glass, enamel, paper, brass), well lit, bright, never murky.
- Interactive and physical: grab, drag, drop, press, pull; things react with motion, sound and physics.
- Minimal text: icons and numbers, names on hover; no hint lines, sign plates or label spam.
- No plain "UI blocks": no flat rectangles of colour holding text or buttons. Every element is a designed object
  (detailed pixel art, a 3D prop, or something in the scene). Choices and prompts float as styled, slightly 3D text.
- Before showing the user anything, compare its screenshot against this list; if it fails any point, it is not done.

## Fixed rules from the user
- Never use an angled or rotated red "stamp" effect anywhere.
- No rounded UI, no speech bubbles (lines go to the subtitle strip), minimal on-screen text, Alagard font.
- Every human face, head, body or hand is built from HumanRig (`src/entities/humanRig.ts`); never hand-draw a 2D face.
- Recorded CC0 sound effects only. Bright, realistic lighting.
- Never replace a system the user likes with a new design unless asked (the 3D research lattice is the skill tree;
  the HUD body console and the green/yellow machine UI stay).
- Say "unit", never "subject". Monsters are "inhabitants". The facility is the Meridian Institute of Liminality.
