# Zorg — Godot 4 port (milestone 1)

A first playable slice of Zorg's Dungeon Maker in Godot 4.7.2 (GDScript only).
It loads one real level, **Contractual Obligation** (`deluxe-1.2`, contract 1):
rooms A, Z, D(1), D(2), D(3), one Warrior(6), and the rule
`dist(D(1), D(3)) = 2`. You place the rooms, press Play or Step, and watch the
Warrior replay what the engine decided. The visuals are plain boxes for now.
The status is **Simulated**: it runs in CI and headless tests, and nobody has
tried it on a real phone yet.

**Why this level:** no fixture uses only A/Z/D rooms and Warriors with no
spells and no rules at all. `deluxe-1.2` is the closest: A/Z/D only, one
Warrior, no spells, plus one simple distance rule. We ported just that rule.
`base-classic-1` needs a fire room, and `deluxe-1.4` needs a spell.

## Open and play
1. Install Godot 4.7.2 (standard build, not .NET).
2. In the Project Manager, choose **Import** and pick `apps/godot/project.godot`.
3. Press **F5**. Tap a room in the tray, then tap a square on the board to
   place it. You can drag a placed room to move it, or tap it to send it back
   to the tray. Once every room is placed and connected, **Play** and **Step**
   unlock. You can also step with Space.
4. Camera: use the mouse wheel or pinch to zoom. Right-drag or two-finger drag
   to pan. The ⟲/⟳ buttons (or Q/E) rotate the view 90°.

## Tests
```
pnpm install && pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs --check   # TS engine recording is current
godot --headless --path apps/godot --script res://tests/parity_test.gd
godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```
The golden script runs the TypeScript engine on six fixed placements and
records every turn to `tests/golden/deluxe-1.2.json`. It also writes the
level file the game loads (`levels/deluxe-1.2.json`) from the real fixture.
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
