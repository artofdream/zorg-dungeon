# Zorg — Godot 4 port (round 3)

A small playable slice of Zorg's Dungeon Maker in Godot 4.7.2 (GDScript
only). The picker in the top right holds six real levels:

| Level | Rooms | Hero | Rule |
|---|---|---|---|
| 1.1 Foundations | A, Z, D(2), E(fire) | Warrior(5) | none |
| 1.2 Contractual Obligation | A, Z, D(1), D(2), D(3) | Warrior(6) | dist(D(1), D(3)) = 2 |
| 1.3 Around The Bush | A, Z, 2×D(1), E(fire) | Warrior(5) | dist(A, Z) = 2 |
| 2.2 Elemental Sanctuary | A, Z, E(fire), E(water), E(ice) | Elf(3, {water}), Elf(3, {ice}) | dist(A, Z) != 2 |
| 2.4 Cross With the Constraint – Watered Down | A, Z, 2×D(1), E(fire), E(water) | Warrior(4) | ∃s ∈ Π, dist(s, A) = dist(s, Z) = 1 |
| 2.5 Cross With the Constraint | A, Z, 2×D(1), E(fire), E(ice) | Warrior(4) | same as 2.4 |

Element rooms (FR-14) have a 3×3 middle of one element. **Fire** costs 1 HP
per step. **Water** can't be walked into, and a hero who slides onto it dies.
**Ice** makes a hero slide on in the same direction until a wall (or Z).
**Poison** gives +1 HP the first time any hero steps on a cell and −3 after
that. A hero immune to an element ignores those cells completely. The **Elf**
(FR-21) picks the path to Z that keeps the most HP, then the shortest one,
then right, up, left, down. You place the rooms, press Play or Step, and
watch the heroes replay what the engine decided. The visuals are plain boxes.
The status is **Simulated**: it runs in CI and headless tests, and nobody has
tried it on a real phone yet.

**Why these levels:** they are the only real levels made just of A/Z/D/E
rooms with Warriors and Elves and a rule the engine understands. 2.6, 2.8
and base-extras 3.5 have prose rules that are still refused. `base-classic-1`
and `base-classic-3` repeat 1.1 and 2.5. No such level uses poison (those in
contract 4 also need portals or spells), so poison is checked against a TS
tick table instead of a level. Spells, mirror worlds and variables are still
refused (NFR-8).

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
4. Camera: use the mouse wheel or pinch to zoom. Right-drag or two-finger drag
   to pan. The ⟲/⟳ buttons (or Q/E) rotate the view 90°. After a rotation
   the view lands exactly on the new angle and recentres on your rooms.

## Tests
```
pnpm install && pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs --check   # TS engine recording is current
godot --headless --path apps/godot --script res://tests/parity_test.gd
godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```
The golden script runs the TypeScript engine on fixed placements for each
level (22 in total) and records every turn to `tests/golden/<level>.json`,
plus a 24-row element tick table in `tests/golden/elements.json`. It
also writes the level files the game loads (`levels/*.json`, plus
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
