# Zorg — Godot 4.7.2 port

A playable slice of Zorg's Dungeon Maker in Godot 4.7.2 (GDScript only).
The TypeScript engine in `packages/engine` decides every win, loss, score,
and turn (NFR-1, NFR-10). This app only presents that result. The decision
record is `docs/adr/0008-godot-port-milestone-1.md`. Agent rules are
`AGENTS.md` §8.

## Who decides

`packages/engine` is the referee. Godot keeps a GDScript copy,
`engine/zorg_engine.gd` (`ZorgEngine`), so a build can step without Node.
`scripts/engine_node.gd` calls that copy one action at a time. Scenes draw
the events it returns. They do not pick a path, a score, or a winner. A
rule the copy does not implement fails closed (NFR-8).

The copy is checked, not trusted:

1. `packages/engine/scripts/godot-golden.mjs` runs the TypeScript engine on
   fixed placements for the thirteen shipped levels and writes the files
   below. `--check` rebuilds them in memory and exits 1 if a committed file
   differs. Before it writes a run, it checks that the turns flatten to the
   same events `simulate()` returns.
2. `tests/parity_test.gd` is a headless `SceneTree`. It replays every case
   through `ZorgEngine` and exits 1 unless validation codes, every turn,
   the outcome, and the score match. Spell cases also check the cast log
   and the cast window.

Files the golden script writes (43 placement cases):

| File | What it is |
|---|---|
| `levels/<id>.json`, `levels/index.json` | The levels the game loads, plus the picker. Generated from the fixture texts named in the script. |
| `tests/golden/<id>.json` | One recording per level. A valid layout stores every turn, `runOutcome`, and `score`. Spell cases also store `casts` (`afterSteps`, `spellId`), `castLog` (`ok` or the refusal), and `castWindow`. A successful cast is its own turn, and `cast` is its first event. |
| `tests/golden/elements.json` | 24 ticks from `elementalTick`: fire, water, ice, poison × three immunity sets × visited or not. |
| `tests/golden/gold-portals.json` | 20 toll rows from `payToll`, and 36 portal-formula rows from `evalPortalIndex`. |
| `levels/solutions.json` | FR-47 **Show a solution** data: per level, the engine's stored solution (rooms, casts) shifted onto the board, plus one caption per step (text, rule IDs, reason codes), or `unsolved` with the search verdict. Read from `packages/engine/fixtures/solutions/`. Each solved level also gets a golden `stored-solution` case. |

**Show a solution (FR-47).** `packages/engine/scripts/solve-levels.mjs
--search` runs a bounded layout search in the TS engine (every connected
room shape, compact first, each legal room order and orientation; levels
with spells also get the capped FR-46 cast search), keeps the first layout
whose replay is a level win, and derives one reason per step: what the step
does in the run, and what happens when that one step is changed (the room
moved to each other legal spot, the cast left out or moved one step), with
the rule IDs. It writes `packages/engine/fixtures/solutions/<id>.json`; a
level the search can't solve is stored as `unsolved` with its verdict,
never a guessed layout. `--check` re-verifies the stored files and fails on
drift. The golden script copies them into `levels/solutions.json`, and
`parity_test.gd` replays each one through `ZorgEngine` to a win.
`scripts/solution_player.gd` plays it (clear the board, drop each room,
run, cast at the stored step); `scripts/solution_guide.gd` shows the
captions in the HUD text column. Neither decides anything (NFR-1).

The golden script does not write `levels/visual-lights.json`. That file is
cosmetic. `scripts/atmos.gd` reads it. The rules engine never does.

**Test harness.** Keep `tests/parity_test.gd` and `tests/level_smoke_test.gd`
(both headless `SceneTree` scripts) and `tests/web_boot_check.mjs`. GUT and
gdUnit4 stay out. The thing CI has to prove is that the GDScript copy matches
the TypeScript recording, and it does that with one stock Godot 4.7.2 binary,
`--headless --script`, and an exit code. A second test framework would sit
beside that compare. ADR-0002 already treats engine-native test frameworks as
extra weight on headless CI.

**Later AI.** Warrior and Elf steps that already decide a run are engine
rules (FR-20, FR-21, and FR-19 through FR-31). The copy ports Warrior and
Elf for these levels. If a Utility AI, or any other AI for heroes or
monsters, is added later, it stays in a sandbox and off the win/loss path.
It cannot change an outcome the engine decided (NFR-1).

**Art.** The models in this repo are CC0 KayKit, under `assets/kaykit/`,
listed in [CREDITS.md](CREDITS.md). Licensed packs from Humble, Zenva, and
Packt are never committed to this public repo. They live in a private asset
store.

**Renderers.** `project.godot` sets `renderer/rendering_method` to `mobile`
and `renderer/rendering_method.web` to `gl_compatibility`. The web export
uses the Compatibility renderer (WebGL 2). Android, Linux, and Windows use
the Mobile renderer.

The **Level** button in the top right opens a grid of thirteen real levels:

| Level | Rooms | Hero | Rule / spells |
|---|---|---|---|
| 1.1 Foundations | A, Z, D(2), E(fire) | Warrior(5) | none |
| 1.2 Contractual Obligation | A, Z, D(1), D(2), D(3) | Warrior(6) | dist(D(1), D(3)) = 2 |
| 1.3 Around The Bush | A, Z, 2×D(1), E(fire) | Warrior(5) | dist(A, Z) = 2 |
| 1.4 Low Blow | A, Z, D(2) | Warrior(4) | spell Attack(3) |
| 2.1 Fire Immunity | A, Z, E(fire) | Elf(1, {fire}), Warrior(1) | spell Attack(1) |
| 2.2 Elemental Sanctuary | A, Z, E(fire), E(water), E(ice) | Elf(3, {water}), Elf(3, {ice}) | dist(A, Z) != 2 |
| 2.4 Cross With the Constraint – Watered Down | A, Z, 2×D(1), E(fire), E(water) | Warrior(4) | ∃s ∈ Π, dist(s, A) = dist(s, Z) = 1 |
| 2.5 Cross With the Constraint | A, Z, 2×D(1), E(fire), E(ice) | Warrior(4) | same as 2.4 |
| 4.3 Fake Reset | A, Z, D(11), E(poison) | Warrior(20) | no hero below 0 HP; spells 2×Teleport(2) |
| 4.1 Teleportation Station | A, Z, E(poison), P(1, 1) | Warrior(6) | none |
| 5.2 Wealth Frontier | A, Z, D(1), O(1), T(1, fire) | Warrior(5) | none |
| 5.5 Counting the Riches | A, Z, E(fire), P(2, x↦7x-6), O(1), T(1, water) | Warrior(21) | spell Teleport(4) |
| 5.8 Vault Break | A, Z, D(1), O(1), T(1, fire), T(1, water) | Elf(1, {fire}), Elf(13, {water}) | none |

Element rooms (FR-14) have a 3×3 middle of one element. **Fire** costs 1 HP
per step. **Water** can't be walked into, and a hero who slides onto it dies.
**Ice** makes a hero slide on in the same direction until a wall (or Z).
**Poison** gives +1 HP the first time any hero steps on a cell and −3 after
that. A hero immune to an element ignores those cells completely. The **Elf**
(FR-21) picks the path to Z that keeps the most HP, then the shortest one,
then right, up, left, down.

**Portals, gold and tolls** (FR-15 to FR-17). The i-th entry into a
**P(n, f)** room, while i ≤ n, sends the hero to the f(i)-th most recent room
visit before this one (or to the waiting room if there are fewer). **O(x)**
holds x gold; the first hero in takes it all, and a dead hero's gold stays in
the room where it died. **T(x, elem)** has an element middle and 4 light
hatches that cost x gold each. Coins are paid oldest first and go back to the
room they came from. A hero who can't pay can't step on, and one pushed onto
an unpaid hatch dies. Warriors and Elves plan with their gold, as in the TS
engine. Gold shows as "$n" on heroes and rooms.

**Spells** (FR-32 to FR-35) are one-use icon buttons next to Play during a
run (presentation only, NFR-1). Each button is at least 48 dp, has an
accessible name, a tooltip on hover, and a text label on long-press.
**Attack(x)** deals x damage to every living hero, including heroes still
waiting to spawn (FR-34). Its icon is a sword striking down with a small
burst, and a badge shows x. Hovering or pressing Attack highlights the
heroes the engine says would be hit and shows the damage before you
confirm. **Teleport(n)** sends the active hero to the first cell of
its n-th most recent room (1 = the room it is in) with no room effect, or back
to the waiting room if it hasn't visited that many rooms. You can cast only
between two hero actions, after the first one and before the run ends
(FR-33). The buttons are greyed out at other times, and the tooltip says
why (including before the first action). When the cast window opens, unused
spells glow and pulse once. During Play, a short "Pause to cast a spell"
hint stays visible while unused spells remain, and the buttons still light
up between actions. The first time a window opens, a one-time hint says
"Cast a spell between steps to hit the heroes". You place the rooms, then
Step or Play the run one action at a time.

**Look** (round 6, visual only): rooms are 3D tiles with low stone walls and
their own floor. A has a green spawn ring, Z a dark exit pit, D steel
spikes, P a turning portal ring, O a coin stack and T wooden toll hatches.
Fire glows, water is a see-through tint, ice is pale and glossy, and poison
is green. The Warrior is broad and blue, with a helmet, shield and sword.
The Elf is slim and green, with a pointed hat. Heroes hop from cell to cell,
flash with a floating number when hurt or healed, and fade out when they
die. These were Godot primitives until round 10 (see **Models** below).
**Look** (round 9, visual only, `scripts/atmos.gd`): a torch-lit stone
dungeon. A warm fill (not a dim blue moon) keeps the checkerboard, walls
and heroes readable on the Compatibility renderer the web build uses and
on the Mobile renderer phones and desktop use. Fog is a light warm
haze and a vignette stays light enough that they don't paint the board
black. A few unshaded dust motes drift near the camera (12 on Low, 24
on High; frozen if the engine reports reduced motion). Each room has a wall
torch whose warm light flickers. Damage rooms also get a procedural
brazier from `levels/visual-lights.json` (cosmetic only; the rules engine
never reads that file). Walls use the KayKit atlas, the empty board is a
stone checker that glows faintly, and room and element floors glow faintly
in their own colour. **Graphics** (in the level panel; saved):
Low lights the 6 nearest omni lights with no shadows and no glow, and
renders the 3D view at 0.75 resolution (the HUD stays sharp). High
lights up to 8 (the Compatibility per-object cap), gives shadows to the
3 nearest torches and the sun, and adds glow. Phones and the web default
to Low; desktop defaults to High.
**Models** (round 10, visual only): walls, floor tiles, wall sconces, the
spawn door, exit grate, spikes, portal pillars, coins and toll hatches are
CC0 low-poly KayKit models, and the Warrior and Elf are KayKit's Knight and
hooded Rogue playing an idle loop. Floors keep their room and element
colours. Files and licences are listed in [CREDITS.md](CREDITS.md)
(`assets/kaykit/`, trimmed to about 0.9 MB).
**Dungeon look** (visual only; replaces round 9's warm fill and beige
checker): a dim cool fill (ambient 0.36, `ZorgAtmos.AMBIENT_MIN` 0.3) and a
cold moonlight sun leave corners in blue shadow; wall torches are stronger
and shorter-range, so they throw warm pools, and every flame has an
additive halo that glows even where the omni cap has turned its light off.
The empty board is dark flagstone (`shaders/flagstone.gdshader`) with a
faint slot checker; while building the whole board stays lit, and during a
run the stones beyond the placed rooms fade to black. Room floors are stone
tinted toward the room colour and glow in that colour; D, E, O, P and T
rooms get a thin glowing octagon rune and the spawn ring is an octagon.
The light caps (6 Low, 8 High), shadows and the FPS fallback are unchanged.
During a run (not while building, so empty slots stay clear) tall,
irregular KayKit stone walls with arches, broken stretches and wall
sconces stand a 1.2-unit corridor outside the dungeon's outer edges
(`scripts/dungeon_dressing.gd`, one merged mesh per side). Sides whose outward normal faces the camera drop to a low broken rim
(updated when you rotate past a 90° sector), so walls never hide the floor,
heroes, labels or taps. The corridor holds a gold-filled chest beside each
gold (O) room and a few barrels and crates (6 on Low, 12 on High); sconce
and chest glows are halos, not lights, so the omni budget is unchanged.
The default camera looks in from 42° above the board (was 53°) and
Follow hero tilts 8° lower still (given back when you leave it, unless you
tilted meanwhile). Yaw can turn freely (right-drag or middle-drag, or a
two-finger twist); `< 90°` / `90° >` still step 90° from the current
heading; Fit or a double-tap snaps back to the nearest 45° + n·90° sector.
Under Xvfb the smoke test measures the rendered 1.2 board: room floor vs
an empty slot, empty slot vs the black beyond, and room colours apart.
**Phone UI** (round 7, visual only): the HUD scales with screen DPI so one
UI unit is about 1 dp on phones and 1 CSS px in mobile browsers (desktop and
desktop web stay at the 1280×720 layout; in portrait the tray gets its own
row; `-- --ui-scale=1.75` forces it for testing). Every button is at least
52 units (≥ 48 dp) tall, text is 16 units or more, and the HUD keeps inside
the display safe area. Tray rooms are buttons with a colour swatch. Room
labels are screen-space plates at each room's back corner that never
overlap each other or the HUD text (round 12; on the end screen the result
banner replaces the "Extermination" line), and hero HP labels sit above the (larger) heroes on a layer on top.
**Smooth first use** (CF-015, visual only): when a level opens, its rooms,
its hero figures, a fading figure of each kind, a set of run walls and
props, and the hit-number glyphs are drawn once on a stage behind the board
(`scripts/prewarm.gd`), one piece per frame, so the GPU compiles their
shaders while the board is still idle. The rooms and heroes stay pooled: a
drop or the first spawn only attaches a ready node. A tray drop that comes
before its room is ready shows a floor-coloured slab and builds the room
over the next two frames. The Play button builds the run walls over about
five frames, and the first step waits for them; after that, one step every
0.18 s as before. The camera does not fit or start following on a spawn or
set-up frame. The cost moves to the first ~15 frames after a level opens.
The status is **Simulated**: it runs in CI and headless tests. Debug APKs
were also tried by hand on one Android phone; that is not CI evidence.
A run reset waits for the level's warm-up to finish before it refills the
hero pool, and a level switch stops the warm-up cleanly.

**Level grid** (CF-016, visual only): the "Choose a level" grid is a modal on
its own layer above the HUD, so the room tray never covers it. A dimmed
backdrop takes every tap while it is open; a tap on the backdrop closes it.
It fits inside the safe area, uses fewer columns on narrow screens, and
scrolls the levels when the screen is short, so Graphics and Close stay
visible.

**Why these levels:** apart from 1.4, 2.1 and 4.3, they are the only real
levels made just of A/Z/D/E rooms with Warriors and Elves and a rule the
engine understands. 2.6, 2.8 and base-extras 3.5 have prose rules that are
still refused, and `base-classic-1` and `base-classic-3` repeat 1.1 and 2.5.
Round 4 added the three smallest levels whose only spells are Attack and
Teleport. 1.4 and 2.1 have 3 rooms and no rule. 4.3 is the only Teleport
level, and also the only real poison level that has no portals. It needed one
small extra rule: no hero may go below 0 HP (`base-extras-9.2` is the same
level). Other Attack-only levels are left for later: 1.5, 1.7, 1.8, 2.9, 2.10,
10.3 and `base-classic-2`. Any other spell, plus Selection, mirror worlds and
variables, is still refused (NFR-8).
Round 5 added four small levels that use only ported rooms (now with P, O
and T), Warriors, Elves and Teleport, and no rule. Other portal and gold
levels (for example 4.6 with `x↦5-2x`, or `⌊1/x⌋`-style formulas) and custom
tile shapes are left for later. With the default
tile a hero needs 2 coins to cross a toll room and no level here has more
than 1, so no shipped run that ends pays a toll: a TS toll table
(`tests/golden/gold-portals.json`) checks FIFO payment and refunds instead.

## Open and play
1. Install Godot 4.7.2 (standard build, not .NET).
2. In the Project Manager, choose **Import** and pick `apps/godot/project.godot`.
3. Press **F5**. Drag a room out of the tray onto the board, or tap it and
   then tap a square. A green ghost shows where it will land. A red ghost
   means you can't place it there (off the board or the square is taken).
   Dropping it there shakes the red ghost, shows "Can't place here: ..."
   above the tray for a moment, and leaves the room where it was. An orange
   ghost means the spot is free but doesn't touch any placed room yet. While
   building, a faint grid outlines every free square and squares next to a
   placed room glow green; while you drag a room, squares where it would
   touch a room turn green and the rest amber. Tray slots keep their order:
   a placed room leaves an empty outline in its slot instead of the row
   moving. You can drag a placed room
   to move it, or tap it to send it back to the tray. Once every room is
   placed and connected, **Play** and **Step** unlock. You can also step with
   Space.
   Keyboard only: Tab moves between buttons (amber focus ring) and Enter or
   Space presses one. On a tray room, it picks the room up; the arrow keys
   then move the ghost, Enter drops it and Esc cancels. Backspace, Ctrl+Z or
   the on-screen **Undo** button sends the last placed room back to the tray.
   Stuck? Open **?** and press **Show a solution**, then **Clear board and
   show** to confirm. The board is cleared and the engine's stored solution
   is built one room at a time, then played; a caption above the board says
   what each step does and why it is needed, with its rule IDs. **Pause**,
   **Next** and **Stop** sit on the caption; Back or Esc stops it. Levels
   with no stored solution say so instead.
   Undo stays on screen during and after a run: there it goes back to build
   (like **Build**, your rooms stay) and then takes back the last room.
   After a win, **Next level >** under the banner opens the next level.
   **?** (top right) lists what each room and element floor does, in the
   words of GAME_SPEC.md; a one-time hint points to it on first launch.
   Android Back (Esc on desktop and web) closes the open popup, drops a room
   you picked up, or else asks "Quit Zorg?" (Stay / Quit). On the web, Quit
   goes back to the previous page; inside an iframe (itch.io) there is no
   Quit, and Back/Esc only closes popups.
4. Camera: the view fits your rooms (with margins clear of the HUD) when a
   level opens and after each placement. Zoom with `Zoom +` / `Zoom -`, the
   mouse wheel, a two-finger pinch, or +/-. The on-screen pad is icons
   (hover or long-press for the name). Tilt with `Tilt +` / `Tilt -`,
   Ctrl + wheel, or W/S (pitch stays clamped). Left-drag or one finger pans.
   Right-drag or middle-drag, or a two-finger twist, rotates yaw freely. A
   drag or twist past a short threshold is never a room tap. `< 90°` /
   `90° >` (or Q/E) rotate 90° from the current yaw. `Fit` (or F, or a
   double-tap) snaps yaw to the nearest 45° + n·90° sector and frames the
   board. Once you zoom, pan or orbit yourself, auto-fit stops until you
   press `Fit` or open a level.
   During a run, **View** (next to `Fit`, or C) switches between Overview
   (`View: All`) and Follow hero (`View: Hero`).
   Follow hero zooms in, smoothly tracks the first living hero and moves on
   when that hero dies. Panning, a rotate gesture, Fit, Build or a new
   level go back to the overview.
5. Web: add `?fps=1` to the URL (or press F3) for an FPS counter,
   `?quality=low|high` to pick the graphics quality (`-- --quality=` on the
   command line), and `?shadows=0` to turn shadows off. If High runs under
   30 FPS in the first seconds, it drops to Low for that session, unless the
   URL or command line asked for High.

## Tests
From the repo root, with Godot 4.7.2 (standard build, not .NET):

```
pnpm install && pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs --check   # TS recording is current
godot --headless --path apps/godot --script res://tests/parity_test.gd
godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```

What those commands check is under **Who decides**. `level_smoke_test.gd`
is the other half of the harness: it drives the Level scene (place the
first golden layout of every level, step to the banner, drag, camera,
lights, and the UI checks named in the file). CI runs it twice. Once
headless. Once under Xvfb with `--rendering-driver opengl3` and
`--shot`, so a real GUI drag runs. If you change `packages/engine`, run
the golden script without `--check` and commit the files it writes, then
run the parity script.
`tests/hitch_probe.gd` is a manual probe that is not run in CI. It prints the worst frame
after a level opens, after each drop, after Play and after the first death.
Run it under Xvfb with an empty shader cache, for example
`XDG_DATA_HOME=$(mktemp -d) XDG_CACHE_HOME=$(mktemp -d) MESA_SHADER_CACHE_DISABLE=true xvfb-run -a godot --path apps/godot --script res://tests/hitch_probe.gd -- --level=deluxe-5.8`.

The `godot` workflow (`.github/workflows/godot.yml`) runs that sequence
on a pull request that touches `apps/godot/**`, `packages/engine/**`, or
the workflow itself. Godot is 4.7.2-stable. After the tests it writes
four debug exports and runs `tests/web_boot_check.mjs` (Node 22, headless
Chrome) against the web one. It uploads `zorg-godot-linux-x86_64`,
`zorg-godot-windows-x86_64`, `zorg-godot-web`,
`zorg-godot-android-debug-apk`, and screenshots. It does not deploy.
`pnpm test` and the `ci` workflow do not run any of this.

## Debug exports
From `apps/godot`, after `godot --headless --path . --import`. The Android
export needs `GODOT_ANDROID_KEYSTORE_DEBUG_PATH`,
`GODOT_ANDROID_KEYSTORE_DEBUG_USER`, and
`GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD`. CI mints a throwaway debug
keystore per run and discards it. There is no release keystore in this
repo.

```
godot --headless --path . --export-debug Linux build/linux/zorg.x86_64
godot --headless --path . --export-debug Windows build/windows/zorg.exe
godot --headless --path . --export-debug Web build/web/index.html
godot --headless --path . --export-debug Android build/android/zorg-debug.apk
```

The web preset is single-threaded (`variant/thread_support` off), so it
needs no COOP/COEP headers. It uses the Compatibility renderer. The
Linux, Windows, and Android exports use the Mobile renderer. CI rejects
a `build/linux/zorg.sh` wrapper. From `apps/godot`:

```
node tests/web_boot_check.mjs build/web
```

## Install the debug APK (sideload)
Open the PR's **godot** workflow run on GitHub and download the artifact
`zorg-godot-android-debug-apk`. Unzip it, then either run
`adb install -r zorg-debug.apk`, or copy the file to the phone and open it
there (allow "install unknown apps"). Each CI run signs the APK with a
throwaway debug key. Because that key changes, you have to uninstall the old
build before installing a new one. The desktop build is in the
`zorg-godot-linux-x86_64` artifact. Run `chmod +x zorg.x86_64` before
starting it.

## Try the Godot preview

In a PC browser: <https://zorg.artof.link/godot/> (same shared sign-in as the Maker; see [CONTRIBUTING.md](../../CONTRIBUTING.md#site-login-shared-username-and-password)). `deploy-godot` publishes that page after a merge to `main` that touches `apps/godot/`, once a person approves the `production` environment. Until that approval, the URL keeps serving the previous export. It's a single-threaded debug build, so it needs
no special server headers. The first load fetches about 10 MB (the engine,
compressed). The same build is in the `zorg-godot-web` CI artifact, which
you can serve with any static server, for example `python3 -m http.server`
inside the unzipped folder. A Windows build is in
`zorg-godot-windows-x86_64`: unzip it and run `zorg.exe`. It's unsigned, so
SmartScreen asks you to confirm.

## itch.io uploads (deploy-itch)

`.github/workflows/deploy-itch.yml` uploads the same four debug builds to
<https://artofdream.itch.io/zorg-dungeon-maker> with
[butler](https://itch.io/docs/butler/). It runs after a merge to `main` that
touches `apps/godot/`, or by hand from the Actions tab. It runs `godot.yml`
first (parity, smoke tests, exports), then pushes the channels `html5`,
`windows`, `linux` and `android` with `--userversion` from `git describe`
(the short commit hash while the repo has no tags). Butler 15.32.0 is
downloaded from broth.itch.zone and checked against a pinned SHA-256.
- **Owner setup (once):** create an itch.io API key (itch.io, Settings, API
  keys) and store it as the repository secret `BUTLER_API_KEY`. Without it
  the workflow stops at its first job with an error. It never falls back.
- **Approval:** the push job uses the `production` environment, so each run
  waits for the same approval as the other deploys. A newer run cancels an
  older one, even one still waiting.
- **Draft:** pushes don't publish the itch.io page. On the Edit game page,
  set the kind to HTML and tick "played in the browser" on the `html5`
  upload once.
- The Linux export no longer writes a `zorg.sh` console wrapper: Godot left
  the apostrophe in "Zorg's" unquoted, which made it a shell syntax error.

## Plan
- **Style:** the game logic stays turn-based and the view is 3D, seen from an
  angled overhead camera. A first-person view would hide the board, and the
  board is the puzzle.
- **GDScript, not C#:** Godot's web export can't run C#, and C# on mobile is
  still experimental. GDScript also reads close to the TypeScript engine.
- **Same repo for now:** the GDScript engine is checked against recordings
  from the TS engine, so one PR can change both and CI checks them together.
  Split it into its own repo once it stands alone, or if large art or audio
  needs Git LFS.
- **Distribution:** Sideload the debug APK from the `godot` workflow
  artifact. `deploy-godot` publishes the web export, and `deploy-itch`
  uploads the same four debug builds (html5, windows, linux, android) with
  butler. Both deploys wait for the `production` environment. The itch.io
  page stays a draft. Play Store upload, release signing, and store
  credentials are not in this repo. A later public release would start as
  a manual upload of a release build to the Play internal testing track.
- **Next:** more rooms and heroes, each with its own golden cases. Room C,
  the Gunner duration and FR-4 stay blocked until the game author answers
  (NFR-8).
- **Level screen split:** `scripts/level.gd` is being split into scenes
  that signal this screen. The order and the signals are
  `docs/godot-level-split.md`. The rules copy and the golden files stay
  put. The quit question is `scenes/quit_dialog.tscn`. The FPS counter
  is `scenes/fps_readout.tscn`. The win/loss line is `scenes/end_banner.tscn`.
  The room legend is `scenes/help_dialog.tscn`. The first-run hint is
  `scenes/hint_panel.tscn`. The level grid is `scenes/level_picker.tscn`.
  The sun and torch budget are `scenes/level_lighting.tscn`.   The orbit
  camera and its pad are `scenes/level_camera.tscn`. The tray, ghost, and
  Undo button are `scenes/board_build.tscn`. Play, Step, the spell
  buttons, and the turn line are `scenes/run_playback.tscn`.

See `docs/adr/0008-godot-port-milestone-1.md`.
