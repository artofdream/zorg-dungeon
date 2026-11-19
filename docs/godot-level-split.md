# Splitting the Godot level screen

`apps/godot/scripts/level.gd` is the whole level screen: the board, the
camera, the HUD, and the run playback. It is about 1,600 lines. This note
is the split plan. One component per pull request, smallest risk first.
The level screen stays the coordinator. A scene does not call
`ZorgEngine` and does not pick a path, a score, or a winner
([[NFR-1]], [[0008-godot-port-milestone-1]]).

`engine/zorg_engine.gd` and `tests/golden/` stay as they are unless a rule
changes. The custom headless harness stays (`parity_test.gd`,
`level_smoke_test.gd`). No GUT and no gdUnit4.

Talking between scenes: the level screen calls methods on the child.
The child emits signals back. The smoke test still reaches the same
controls through the fields it already uses (`quit_dlg`, `result`,
`next_btn`, and the rest). Those fields point at the extracted nodes
until a later PR moves the assertions. Do not delete a field the smoke
test reads.

## Order

| PR | Component | Why this order |
|---|---|---|
| 1 | Quit dialog | A modal. It is not in the HUD column, and it never reads the board or the engine. Done on main (#115, anchor fix #116). `level.gd` 1601 → 1588. |
| 2 | FPS readout | One label (`?fps=1` or F3). The 30 FPS drop to Low stays with lighting. Done on main (#117). Top-right anchors in `_init`. `level.gd` 1588 → 1593. |
| 3 | End banner | The result line and the Next level button. The level screen still reads `engine.score()` and passes the sentence in. Done on main (#118). Top-left anchors in `_init`, inside the HUD column. `level.gd` 1593 → 1591. |
| 4 | Help and the first-run hint | The "?" legend. Wording stays in `scripts/help.gd`. Dismissing the hint asks the level screen to refit the camera. Done on main (#119). Legend is full-rect; the hint is top-left in the HUD column. `level.gd` 1591 → 1530. |
| 5 | Level picker | The level grid and the Graphics button. The level screen passes the level list in. This slice. Full-rect root, corner button top-right, grid centered. `level.gd` 1530 → 1506. |
| 6 | Lighting | World environment, sun, torch budget, flicker, and the 30 FPS fallback. `levels/visual-lights.json` stays cosmetic. `set_quality`, `torch_lights`, and `env` stay as forwards for the smoke test. |
| 7 | Camera | Rig, zoom, tilt, yaw, fit, follow, and the on-screen pad. Gesture-heavy. The smoke test calls the fit and follow methods, so those stay as forwards. |
| 8 | Board build | Tray, ghost, drag, keyboard placement, and Undo. This is the Xvfb drag. Do it after the HUD pieces so the only change is input routing. |
| 9 | Run playback | Play, Step, the spell bar, and the turn line. Last, because it sits beside `engine.step()` and `engine.cast()`. It shows the events those calls return. |

After these, `level.gd` should load the level, keep the placement map the
engine start call needs, step and cast through the engine node, and wire
the signals. Rooms, heroes, and `scripts/atmos.gd` / `scripts/look.gd` /
`scripts/heroes.gd` are already separate.

## Signals

Parent calls are methods. Child replies are signals.

| Component | Methods the level screen calls | Signals the component emits |
|---|---|---|
| Quit dialog (`scenes/quit_dialog.tscn`) | `open()`, `close()`, `set_quit_offered(on)` | `quit_requested` (player pressed Quit), `dismissed` (closed without quitting) |
| FPS readout (`scenes/fps_readout.tscn`) | `set_visible_fps(on)`, `set_line(text)`, `set_top_offset(y)`, `toggle()` | `toggled(shown)` |
| End banner (`scenes/end_banner.tscn`) | `show_line(text, show_next)`, `clear()`, `apply_visibility()` | `next_level_pressed` |
| Help and hint (`scenes/help_dialog.tscn`, `scenes/hint_panel.tscn`) | `open(area)`, `close_dialog()`, `show_hint(on)`, `dismiss()` | `closed`, `hint_dismissed` |
| Level picker (`scenes/level_picker.tscn`) | `set_entries(rows)`, `set_current(index)`, `set_caption(text)`, `set_quality_label(text)`, `set_open(on)`, `close_panel()` | `level_picked(index)`, `closed`, `quality_toggled` |
| Lighting | `set_quality(q, save)`, `note_rooms(nodes)`, `tick(delta, pivot)` | `quality_changed(q)` |
| Camera | `fit(instant)`, `set_follow(on, point)`, `pan`, `zoom_by`, `tilt_by`, `rotate` | `became_manual` |
| Board build | `set_tray(entries)`, `set_building(on)`, `cancel()` | `place_requested(id, slot)`, `move_requested(id, slot)`, `undo_requested` |
| Run playback | `set_spells(list, allowed)`, `set_turn_line(text)`, `set_playing(on)` | `play_toggled`, `step_requested`, `cast_requested(spell_id)` |

PR 1 is the quit dialog. Its full-rect anchors are set in `_init`,
before the level screen parents it. `set_anchors_preset` inside `_ready`
leaves the overlay at 0×0, so clicks reach the board. The level screen
still owns Back/Esc ordering
(quit dialog, then legend, then the level grid, then a picked-up room,
then the quit question) and still decides `history.back()` on the web
versus `SceneTree.quit()` everywhere else. The dialog never sees that
choice: it only emits `quit_requested`.

Slice 2 is the FPS readout. Its anchors are `PRESET_TOP_RIGHT`, set in
`_init` before `add_child`. F3 stays on the level screen, because a popup
already swallows that key, and calls `toggle()`. The readout emits
`toggled`. The level screen still writes the line (`set_line`) and still
drops High to Low under 30 FPS. `level.gd` is 1593 lines after this slice
(1588 before it, 1601 before the quit dialog).

Slice 3 is the end banner. Its anchors are `PRESET_TOP_LEFT`, set in
`_init` before `add_child`. It lives in the top HUD column, not as a
full-rect overlay, and it reports the same text rects the column used
before so room labels do not move. The level screen still calls
`engine.score()` and passes the sentence to `show_line`. The banner
emits `next_level_pressed`. `level.gd` is 1591 lines after this slice.

Slice 4 is the room legend and the first-run hint. The legend's anchors
are `PRESET_FULL_RECT`, set in `_init` before `add_child`. The hint's
anchors are `PRESET_TOP_LEFT`, also in `_init`, and it stays in the HUD
column under the goal. Wording stays in `scripts/help.gd`. "Got it" emits
`hint_dismissed`; the level screen still writes `hint_seen` and refits
the camera. Back/Esc ordering stays on the level screen. `level.gd` is
1530 lines after this slice.

Slice 5 is the level picker. The root anchors are `PRESET_FULL_RECT`,
the corner button is `PRESET_TOP_RIGHT`, and the grid panel is
`PRESET_CENTER`, all set in `_init` before `add_child`. The level screen
passes the level list in. `level_picked` opens that level.
`quality_toggled` still changes the graphics quality on the level screen.
Back/Esc ordering stays there. `level.gd` is 1506 lines after this slice.

See [[LEARNINGS-godot]].
