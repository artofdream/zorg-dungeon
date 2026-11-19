# Learnings from the Godot port (rounds 1–8)

Plain-English notes from PRs #84–#95, kept so the next agent doesn't rediscover them. The decision record is [[0008-godot-port-milestone-1]]. The repeatable recipes are rows in [[SKILL_MATRIX]] (`engine-parity-goldens`, `adb-phone-test`) and the SKILL.md files under `.cursor/skills/` (`godot-headless-verify`, `debug-apk-reinstall`, `godot-cosmetic-lights`, `zorg-pr`). [[GAME_SPEC]] wins on any rule question.

## 1. Two engines, one set of answers

The TypeScript engine in `packages/engine` is the referee ([[NFR-1]], [[NFR-10]]). The Godot app has its own GDScript copy of the engine. We don't trust the copy by reading it. We check it:

- `packages/engine/scripts/godot-golden.mjs` plays fixed placements through the TS engine and writes every turn to `apps/godot/tests/golden/*.json`.
- `apps/godot/tests/parity_test.gd` replays the same placements in Godot. It must match turn by turn: events, outcome, score, and spell results.
- CI fails if a golden file is stale or the replay differs.
- **Plant a bug once.** A test that has never failed proves nothing. In #84 we swapped the tie order on purpose and 2 cases went red, then reverted it. Do the same for each new rule: break it locally, watch it fail, put it back, and say so in the PR.
- If a rule isn't ported, it fails closed ([[NFR-8]]). Godot scenes only replay engine events. They never decide who wins.

## 2. Debug APKs need an uninstall first

CI makes a new throwaway debug key on every run. Android then reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE` if `link.artof.zorg` is already installed. Uninstall that package only (`adb uninstall link.artof.zorg`), then `adb install`. The steps are `.cursor/skills/debug-apk-reinstall/SKILL.md`. This also wipes the app's saved data, which is fine for a debug build. There's no release signing and no store upload. The user's Android developer account is never used.

## 3. Caching hid new builds

After a deploy, browsers kept the old `index.html` and the old Godot files, so "it's not fixed" was sometimes just a stale page. Since #90, nginx sends `Cache-Control: no-cache` for the React app's HTML (including SPA routes), and Caddy sends it for `/godot/*`. Check with `curl -sI <url>` before you blame the code. Look at `cache-control` and `last-modified`.

## 4. Deploys wait for approval, and they stack

`deploy-web` and `deploy-godot` run in the `production` environment, and that needs a manual approval. Each merge to `main` queues one more waiting run. Until someone approves, the site keeps serving the old build. In round 8, `/godot/` still showed round 6. A newer waiting run in the same group can replace an older one (the #93 run was cancelled that way). Before saying "it's live", check the live page's `last-modified`, not the merge. Agents never approve deploys.

## 5. Phone testing over adb has limits

- `adb shell screenrecord` stops after **180 s**. Plan short takes, and stop early with `pkill -2 screenrecord` so the MP4 gets finished properly.
- `adb shell input` can tap and swipe (drag), but it can't pinch with two fingers. That's one reason the app has zoom buttons.
- The Back key quits the app. A test script must expect that.
- Use `screencap` for stills and `logcat -d --pid <pid>` to read only the Zorg app's log.
- Touch only the Zorg debug app. Don't change phone settings beyond what install needs, and don't read other apps or user data. Delete files from the phone's sdcard afterwards.

## 6. UI scale has to follow the screen's DPI

Fixed pixel sizes looked fine on a desktop and tiny on a phone. The HUD now scales like this:

`ui_scale = clamp((dpi / base) / min(width/1280, height/720), 1, 4)`

`base` is 96 on the web (so 1 UI unit = 1 CSS px) and 160 on Android (1 unit = 1 dp). Godot's stretch is already applied, so we divide by it. Then we measure, not guess. Targets should be at least 48 dp (Material) or 44 pt (Apple). Text should be at least 16 dp. Measured in round 8: phone 51 dp, mobile web 52 CSS px, desktop 52×76 px.

## 7. Bugbot sometimes reviews after the merge

PRs were merged quickly, and Cursor Bugbot's comments sometimes arrived after the merge. The fix is a small follow-up PR (#91, #93, #95) rather than reopening the old one. Before saying a PR is done, read the Bugbot check. If it lands later, open the follow-up right away.

## 8. Keyboard players

The whole game must be playable without a mouse:

- Tab moves between buttons. Enter or Space on a tray button picks up that room.
- The arrow keys move the ghost. Enter or Space drops it, but only on an allowed spot. Esc or Tab cancels.
- Q and E rotate. Backspace or Ctrl+Z undoes the last placement. Space steps the run.

A 3 px amber focus ring (about 12:1 contrast) shows only for keyboard navigation, because Godot's default `show_focus_state_on_pointer_event` setting hides it for clicks. When the player taps or clicks again, the keyboard state must be cleared (#95). The smoke test plays level 1.1 keyboard-only.

## 9. Uploading to itch.io

`deploy-itch` reuses `godot.yml` through `workflow_call`, so itch.io gets the exact builds the tests passed on. A preflight job fails before the long build if `BUTLER_API_KEY` is missing. Pin butler by version and SHA-256 (broth.itch.zone has no checksum file, so hash the archive once). butler pushes builds but never publishes a Draft page, and the HTML5 "played in the browser" flag has to be set once by hand. Inside itch's iframe, `window.self !== window.top`, and the web bridge returns that JS boolean as an int (1/0), so compare carefully (#106).

## 10. The web preview sits behind the shared site login

`https://zorg.artof.link/godot/` uses the same username and password as the
Maker at `/`. `/grafana/` and `/healthz` stay open. After that login is
live, a `curl` of `/godot/` without `-u` gets 401; `deploy-godot` takes the
credentials from the `ZORG_AUTH_USER` and `ZORG_AUTH_PASSWORD` repo secrets
and never puts them in the URL or the logs. The itch.io copy of the game is
hosted by itch.io and is not affected. See
[CONTRIBUTING.md](../CONTRIBUTING.md#site-login-shared-username-and-password).

## 11. A dark board is the light values, on both renderers

The itch.io web build of level 1.2 looked blue-black: the HUD was fine, and
the checkerboard sat in the background. That build uses Godot's
Compatibility renderer (`gl_compatibility` / WebGL 2). The phone and
desktop builds use the Mobile renderer. Rendering the same frame on both
(llvmpipe, Godot 4.7.2) gave the same pixels: an empty board tile about
`(0.03, 0.04, 0.09)` against black, contrast about 1.07. Turning the
torches off only dropped a room floor from about `0.11` to `0.06`, so the
omni lights were working. They were just too dim, and only the nearest
rooms had one.

The crush was the round-9 setup: ambient energy `0.17` with a cool blue
colour, sun energy `0.32`, filmic tonemap, fog density `0.012` toward
near-black, and board albedo around `0.25` multiplied by a dark stone
texture. Raising ambient alone to `0.55` barely moved the tile. The board
needs its own fill (lighter checker plus a little emission), a warmer
ambient and sun, and lighter fog. Measure a screenshot before changing it
again. The smoke test locks ambient `>= 0.5` and fog `<= 0.008`.

Phone budget: Low still skips shadows and still draws the 3D view at 0.75
scale. It now allows 6 unshadowed omni lights (one torch per room in the
current levels) and High allows 8, which is the Compatibility per-object
cap. Extra lights are declared in `apps/godot/levels/visual-lights.json`.
The rules engine never reads that file. See [[FINDINGS]] CF-013.

## 12. Split the level screen one scene at a time

`scripts/level.gd` owns the board, the camera, the HUD, and the run
playback. The order and the signals are [[godot-level-split]]. Each pull
request takes one component. The level screen keeps calling the engine
node. A scene does not pick a path, a score, or a winner ([[NFR-1]]).
Leave `engine/zorg_engine.gd` and `tests/golden/` alone unless a rule
changed. The smoke test still addresses `quit_dlg`, `quit_stay`, and
`quit_btn` on the level node. Those are the dialog's own controls.
Set a full-rect control's anchors before it enters the tree (`_init`,
or before `add_child`). `set_anchors_preset` inside `_ready` leaves the
control at 0×0, and the smoke test now checks that the quit dialog
covers the HUD. The FPS readout uses `PRESET_TOP_RIGHT` in `_init`, not
full-rect, and the smoke test checks that F3 shows a non-zero label at
the top right. The end banner uses `PRESET_TOP_LEFT` in `_init` and stays
inside the HUD column. Its line rects are the same measurement the column
used, so room labels do not jump. The smoke test checks a win and a loss.
The room legend is its own full-rect scene. The first-run hint is its own
plate. Dismissing the hint still saves `hint_seen` from the level screen.
The level grid is its own scene. The level screen passes the list of
levels in, and Back/Esc still closes that grid. The sun, fill light, torch
budget, and the 30 FPS quality drop live in their own node. The level
screen still forwards `set_quality`, `torch_lights`, and `env`. The
orbit camera and its pad live in their own scene. The pad's anchors are
`PRESET_CENTER_RIGHT`, set in `_init`. The level screen still forwards
fit and follow, and the camera does not read the rules engine.

