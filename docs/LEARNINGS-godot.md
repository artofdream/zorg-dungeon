# Learnings from the Godot port (rounds 1–8)

Plain-English notes from PRs #84–#95, kept so the next agent doesn't rediscover them. The decision record is [[0008-godot-port-milestone-1]]. The repeatable recipes are rows in [[SKILL_MATRIX]] (`engine-parity-goldens`, `adb-phone-test`). [[GAME_SPEC]] wins on any rule question.

## 1. Two engines, one set of answers

The TypeScript engine in `packages/engine` is the referee ([[NFR-1]], [[NFR-10]]). The Godot app has its own GDScript copy of the engine. We don't trust the copy by reading it. We check it:

- `packages/engine/scripts/godot-golden.mjs` plays fixed placements through the TS engine and writes every turn to `apps/godot/tests/golden/*.json`.
- `apps/godot/tests/parity_test.gd` replays the same placements in Godot. It must match turn by turn: events, outcome, score, and spell results.
- CI fails if a golden file is stale or the replay differs.
- **Plant a bug once.** A test that has never failed proves nothing. In #84 we swapped the tie order on purpose and 2 cases went red, then reverted it. Do the same for each new rule: break it locally, watch it fail, put it back, and say so in the PR.
- If a rule isn't ported, it fails closed ([[NFR-8]]). Godot scenes only replay engine events. They never decide who wins.

## 2. Debug APKs need an uninstall first

CI makes a new throwaway debug key on every run. Android refuses to update an app signed with a different key, so every new APK needs `adb uninstall` before `adb install`. This also wipes the app's saved data, which is fine for a debug build. There's no release signing and no store upload. The user's Android developer account is never used.

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
