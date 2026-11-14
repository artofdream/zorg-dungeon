# Zorg — Godot 4 port (round 7)

A small playable slice of Zorg's Dungeon Maker in Godot 4.7.2 (GDScript
only). The **Level** button in the top right opens a grid of thirteen real levels:

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

**Spells** (FR-32 to FR-35) are one-use buttons next to Play during a run.
**Attack(x)** deals x damage to every living hero, including heroes still
waiting to spawn. **Teleport(n)** sends the active hero to the first cell of
its n-th most recent room (1 = the room it is in) with no room effect, or back
to the waiting room if it hasn't visited that many rooms. You can cast only
between two hero actions, after the first one and before the run ends
(FR-33). The buttons are greyed out at other times. You place the rooms, then
Step or Play the run one action at a time.

**Look** (round 6, visual only): rooms are 3D tiles with low stone walls and
their own floor. A has a green spawn ring, Z a dark exit pit, D steel
spikes, P a turning portal ring, O a coin stack and T wooden toll hatches.
Fire glows, water is a see-through tint, ice is pale and glossy, and poison
is green. The Warrior is broad and blue, with a helmet, shield and sword.
The Elf is slim and green, with a pointed hat. Heroes hop from cell to cell,
flash with a floating number when hurt or healed, and fade out when they
die. These were Godot primitives until round 10 (see **Models** below).
**Look** (round 9, visual only, `scripts/atmos.gd`): a dark, torch-lit stone
dungeon. Ambient light is dim, a faint cool "moon" keeps shapes readable,
and there's fog and a vignette. Each room has a wall torch whose warm light
flickers. Walls and floor slabs use procedural stone noise, and room and
element floors glow faintly in their own colour. **Graphics** (in the level panel; saved):
Low lights the 4 rooms nearest the view with no shadows and no glow, and
renders the 3D view at 0.75 resolution (the HUD stays sharp). High
lights up to 10 rooms, gives shadows to the 3 nearest torches and the sun,
and adds glow. Phones and the web default to Low; desktop defaults to High.
**Models** (round 10, visual only): walls, floor tiles, wall sconces, the
spawn door, exit grate, spikes, portal pillars, coins and toll hatches are
CC0 low-poly KayKit models, and the Warrior and Elf are KayKit's Knight and
hooded Rogue playing an idle loop. Floors keep their room and element
colours. Files and licences are listed in [CREDITS.md](CREDITS.md)
(`assets/kaykit/`, trimmed to about 0.9 MB).
**Phone UI** (round 7, visual only): the HUD scales with screen DPI so one
UI unit is about 1 dp on phones and 1 CSS px in mobile browsers (desktop and
desktop web stay at the 1280×720 layout; in portrait the tray gets its own
row; `-- --ui-scale=1.75` forces it for testing). Every button is at least
52 units (≥ 48 dp) tall, text is 16 units or more, and the HUD keeps inside
the display safe area. Tray rooms are buttons with a colour swatch. Room
labels are screen-space plates at each room's back corner that never
overlap each other or the HUD text (round 12; on the end screen the result
banner replaces the "Extermination" line), and hero HP labels sit above the (larger) heroes on a layer on top.
The status is **Simulated**: it runs in CI and headless tests. Debug APKs
were also tried by hand on one Android phone; that is not CI evidence.

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
   means you can't place it there (off the board or the square is taken), and
   dropping it there leaves the room where it was. An orange ghost means the
   spot is free but doesn't touch any placed room yet. You can drag a placed room
   to move it, or tap it to send it back to the tray. Once every room is
   placed and connected, **Play** and **Step** unlock. You can also step with
   Space.
   Keyboard only: Tab moves between buttons (amber focus ring) and Enter or
   Space presses one. On a tray room, it picks the room up; the arrow keys
   then move the ghost, Enter drops it and Esc cancels. Backspace, Ctrl+Z or
   the on-screen **Undo** button sends the last placed room back to the tray.
   After a win, **Next level >** under the banner opens the next level.
   **?** (top right) lists what each room and element floor does, in the
   words of GAME_SPEC.md; a one-time hint points to it on first launch.
   Android Back (Esc on desktop and web) closes the open popup, drops a room
   you picked up, or else asks "Quit Zorg?" (Stay / Quit). On the web, Quit
   goes back to the previous page; inside an iframe (itch.io) there is no
   Quit, and Back/Esc only closes popups.
4. Camera: the view fits your rooms (with margins clear of the HUD) when a
   level opens and after each placement. Zoom with `Zoom +` / `Zoom -`, the
   mouse wheel, pinch or +/-; tilt with `Tilt +` / `Tilt -`, Ctrl + wheel,
   middle-drag or W/S. Right-drag or two-finger drag pans. `< 90°` / `90° >`
   (or Q/E) rotate 90°. Once you zoom or pan yourself, auto-fit stops until
   you press `Fit` (or F) or open a level.
   During a run, **View** (next to `Fit`, or C) switches between Overview
   (`View: All`) and Follow hero (`View: Hero`).
   Follow hero zooms in, smoothly tracks the first living hero and moves on
   when that hero dies. Panning, Fit, Build or a new level go back to the
   overview.
5. Web: add `?fps=1` to the URL (or press F3) for an FPS counter,
   `?quality=low|high` to pick the graphics quality (`-- --quality=` on the
   command line), and `?shadows=0` to turn shadows off. If High runs under
   30 FPS in the first seconds, it drops to Low for that session, unless the
   URL or command line asked for High.

## Tests
```
pnpm install && pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs --check   # TS engine recording is current
godot --headless --path apps/godot --script res://tests/parity_test.gd
godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```
The golden script runs the TypeScript engine on fixed placements for each
level (43 in total) and records every turn to `tests/golden/<level>.json`.
Spell cases also list the casts (`afterSteps`, `spellId`), each cast's result
(`ok` or the refusal reason), and, after every turn, whether a cast would be
allowed. A cast is its own turn, with `cast` as its first event. The script
also writes a 24-row element tick table to `tests/golden/elements.json`, a
20-row toll table and a 36-row portal formula table to
`tests/golden/gold-portals.json`, and
it writes the level files the game loads (`levels/*.json`, plus
`levels/index.json` for the picker) from the real fixtures.
The parity test replays the same placements in GDScript and fails on any
difference. If you change `packages/engine`, run the golden script without
`--check` and commit the result.

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

In a PC browser: <https://zorg.artof.link/godot/>, once the web-preview PR
has merged and `deploy-godot` has run (`deploy-godot` publishes every merge
that touches `apps/godot/`). It's a single-threaded debug build, so it needs
no special server headers. The first load fetches about 10 MB (the engine,
compressed). The same build is in the `zorg-godot-web` CI artifact, which
you can serve with any static server, for example `python3 -m http.server`
inside the unzipped folder. A Windows build is in
`zorg-godot-windows-x86_64`: unzip it and run `zorg.exe`. It's unsigned, so
SmartScreen asks you to confirm.

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
- **Distribution:** (1) For now, sideload the debug APK from CI, with no
  store. (2) Once the game is fun, publish on itch.io: the Android APK,
  desktop builds, and maybe a Godot web build. (3) Use the Play Store only if
  you later want it public. Start with a manual upload of a release build to
  the internal testing track. Automate uploads through the Google Play
  Developer API only if releases become frequent. None of that exists yet:
  there's no release signing, no store credentials and no upload automation.
- **Next:** more rooms and heroes, each with its own golden cases. Room C,
  the Gunner duration and FR-4 stay blocked until the game author answers
  (NFR-8).

See `docs/adr/0008-godot-port-milestone-1.md`.
