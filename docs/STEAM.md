# Steam release checklist

## Done in the repo

- [x] **Desktop build**: Electron wrapper in `desktop/` (`main.cjs`, `preload.cjs`) with steamworks.js (overlay,
      achievements, Steam Cloud folder). Loads the game from a private `app://` scheme: fully offline.
- [x] **Packages**: `npm run steam` (Windows x64 + Linux x64), `npm run steam:linux | steam:win | steam:mac`,
      `npm run steam:all` (all of them, zipped too) → `release/steam/limbo-phobia-<os>-<arch>/`, one SteamPipe content root per OS.
      Smoke test: `./limbo-phobia.sh --smoke` (Linux) boots to the title, logs `smoke: {"title":true,...}` and quits.
- [x] **App ID**: `$STEAM_APPID`, else `steam_appid.txt` beside the executable, else **480** (Spacewar, for testing).
      Launched from Steam, Steam's own `SteamAppId` is used. With a real ID, a copy started outside Steam is relaunched
      through Steam (`LIMBO_NO_RESTART=1` turns that off). No Steam running: the game runs the same, achievements stay local.
- [x] **Offline**: no CDN or web font. The wrapper blocks every web request except co-op's relay (a `ws://` address the
      player types, and its `/rooms` list). Co-op is the only online feature; single player never goes online.
- [x] **Saves**: every localStorage write is mirrored to `<user data>/saves/storage.json` (atomic write, `.bak` kept);
      at start the newer copy wins. localStorage stays the fallback (and is all a browser build uses).
- [x] **Settings**: DISPLAY page (preset Low–Ultra + first-launch auto-detect, windowed / borderless / fullscreen,
      window size, vsync, frame cap, render scale, pause in background); SOUND (master, music, effects, ambience,
      voices, UI); CONTROLS with full key rebinding (conflicts swap, reserved keys refused, defaults).
- [x] **Controller**: Gamepad API, standard (Xbox) layout, glyphs switch between keys and pad. Pause on focus loss and on
      the Steam overlay. F11 / Alt+Enter toggle fullscreen. Quit (title and pause) saves and closes cleanly.
- [x] **Error log**: `<user data>/logs/limbo-YYYY-MM-DD.log` (renderer errors, crashes, a lost renderer; 14 days kept).
- [x] **Achievements**: 30, defined in `src/platform/achievementDefs.ts`, earned from game events
      (`src/platform/steam.ts`), recorded locally and re-sent to Steam when it is up. `steam/achievements.csv`
      (`npm run steam:achievements`) has API names, names and descriptions to enter in Steamworks.
- [x] **Legal**: `CREDITS.md` (+ the About screen), `docs/EULA.md`, `docs/PRIVACY.md`, copied into every package as .txt.

User data folder: Windows `%APPDATA%\Limbo Phobia`, Linux `~/.config/Limbo Phobia`, macOS `~/Library/Application Support/Limbo Phobia`.

## Only you can do these

1. **Steamworks partner account**: sign up at partner.steamgames.com, pay the app fee, do the tax and bank forms.
2. **App ID**: create the app; put the ID in `steam_appid.txt` for local tests (do not ship that file in the depots).
3. **Configure the app** in Steamworks:
   - Depots: one per OS (Windows, Linux, macOS if shipped). Launch options: Windows `limbo-phobia.exe`,
     Linux `limbo-phobia.sh`, macOS `Limbo Phobia.app`.
   - **Steam Cloud** (Auto-Cloud): quota 50 MB / 20 files; root paths
     `WinAppDataRoaming` → `Limbo Phobia/saves`, pattern `*.json`;
     `LinuxHome` → `.config/Limbo Phobia/saves`, `*.json`; `MacAppSupport` → `Limbo Phobia/saves`, `*.json`.
   - **Achievements**: enter the 30 rows from `steam/achievements.csv`, upload a 64×64 icon and a grey icon for each
     (art is not in this repo yet), then publish.
   - **Steam Input**: set the default configuration to "Gamepad" (or opt out) so the game sees a standard pad; mark
     full controller support only after a playtest with a pad and the Steam Deck.
4. **Upload builds with SteamPipe**: install the Steamworks SDK, write `app_build_<id>.vdf` and one
   `depot_build_<depot>.vdf` per OS pointing at `release/steam/limbo-phobia-<os>-<arch>/`, then
   `steamcmd +login <builder> +run_app_build app_build_<id>.vdf +quit`, and set the build live on a branch.
5. **Store page and review**: capsules, screenshots, trailer (being made separately), description, system requirements,
   the content survey (horror, blood and gore), and the **AI disclosure**: Dr. Calder's voice is text-to-speech
   (Kokoro-82M). Submit the store page and the build for Valve's review (allow about a week each).
6. **Age rating**: fill in the IARC questionnaire in Steamworks (free; gives ESRB / PEGI / USK etc.), and the
   mature-content notes (violence, gore, horror).
7. **Signing** (recommended): an Authenticode certificate for the Windows exe (SmartScreen), and an Apple Developer ID +
   notarisation if macOS ships. Set the Windows exe icon on a machine with Wine or Windows.
8. **Confirm licences**: the Alagard font's licence for commercial use (author: Hewett Tsoi), and the voice model's terms.
