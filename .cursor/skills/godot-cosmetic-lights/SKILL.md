---
name: godot-cosmetic-lights
description: >
  Change Godot room lighting without changing who wins. Use when adding or
  moving a brazier or extra omni light, or when a level looks too dark and
  the fix is cosmetic. Edit apps/godot/levels/visual-lights.json and leave
  the rules engine and golden recordings alone.
---

# Cosmetic lights

Extra lights are presentation. The file the game reads is
`apps/godot/levels/visual-lights.json`. `apps/godot/scripts/atmos.gd`
loads it (`LIGHTS_PATH`) and never writes it back.
`packages/engine/scripts/godot-golden.mjs` does not write it either.
The rules engine does not read it.

## Edit the JSON only

`byRoomType` is keyed by room type. `byRoom` is keyed by `levelId/roomId`
and, when present, replaces that room's type list. Each entry is
`kind`, `at` (`[x, y, z]`), `color` (`[r, g, b]`), `energy`, and `range`.
`kind` is `brazier` (a procedural bowl and flame) or `omni` (a bare light).

The committed file gives every damage room (`D`) one brazier:

```json
{
  "byRoomType": {
    "D": [
      { "kind": "brazier", "at": [1.0, 0.0, 1.0], "color": [1.0, 0.52, 0.2], "energy": 2.4, "range": 4.4 }
    ]
  },
  "byRoom": {}
}
```

A single room override looks like `"deluxe-1.2/D:0": [ { "kind": "omni", ... } ]`.
An empty array for that key removes the type lights for that room.

Leave these alone on a cosmetic-light change:

- `packages/engine`
- `apps/godot/engine`
- `apps/godot/tests/golden`
- `apps/godot/levels/*.json` other than `visual-lights.json`
- `apps/godot/levels/index.json`

Do not run `godot-golden.mjs` to refresh lights. It rewrites rule recordings,
not this file.

## Budget the smoke test already locks

`atmos.gd` allows 6 omni lights on Low (`LOW_LIGHTS`) and 8 on High
(`HIGH_LIGHTS`). Declared lights share that budget with the wall torches.
Torches are turned on first, then braziers. Low draws no shadows.

`apps/godot/tests/level_smoke_test.gd` checks level `deluxe-1.2`: three
damage rooms, three braziers, five torches on, and the visible omni count
inside the cap. Removing the `D` brazier, or adding lights until that
count breaks the cap, fails the smoke test.

The fill light (ambient energy, fog density, board emission) lives in
`atmos.gd`, not in this JSON. The smoke test requires ambient energy
`>= 0.5` and fog density `<= 0.008`. The values that made the board
unreadable were ambient `0.17` and fog `0.012` (CF-013, PR #112). Change
those only when you are fixing that fill, and re-run the smoke test.

## Check

Follow `.cursor/skills/godot-headless-verify/SKILL.md` for the smoke test
(and parity, which should stay green because no rule changed):

```bash
timeout 120 godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```

Exit 0 and `level smoke: PASS` means the declared lights still match the
checks above. Say **Simulated**. A screenshot of a local export is not a
live-site probe, and this change does not approve a deploy.
