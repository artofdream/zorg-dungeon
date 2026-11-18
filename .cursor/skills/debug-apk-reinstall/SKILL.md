---
name: debug-apk-reinstall
description: >
  Download or export the Godot debug APK and reinstall package
  link.artof.zorg. Use when a phone already has a Zorg debug build and
  Android rejects the update because the CI debug signature changed.
  Uninstall only that package, and only after a signature mismatch.
---

# Debug APK download and reinstall

Each `godot` workflow run signs `zorg-debug.apk` with a new throwaway debug
keystore and deletes the keystore. Android then refuses to replace an
already-installed `link.artof.zorg` (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
There is no release keystore and no store upload in this repo.

The package name is `package/unique_name` in `apps/godot/export_presets.cfg`:

```bash
grep 'package/unique_name' apps/godot/export_presets.cfg
```

That line is `package/unique_name="link.artof.zorg"`. Confirm it before
any uninstall. Phone driving after install (taps, `screenrecord`, logcat)
stays in the `adb-phone-test` row of `docs/SKILL_MATRIX.md`.

## Download the CI artifact

The `godot` job uploads `zorg-godot-android-debug-apk` (the file
`zorg-debug.apk`). From a green run on your branch:

```bash
gh run list --repo artofdream/zorg-dungeon --workflow godot.yml --branch "$(git branch --show-current)" --limit 5
gh run download RUN_ID --repo artofdream/zorg-dungeon --name zorg-godot-android-debug-apk --dir /tmp/zorg-apk
sha256sum /tmp/zorg-apk/zorg-debug.apk
```

Record the SHA-256 in the PR. The artifact exists only after the `godot`
workflow's Android export step succeeds.

## Build it the way CI does

Prefer the artifact above. It is the APK the parity and smoke steps in
that run already passed. A local export needs Godot 4.7.2-stable, Java 17,
the Android SDK, and the three `GODOT_ANDROID_KEYSTORE_DEBUG_*` variables
from the "Throwaway debug keystore + Android SDK paths" step in
`.github/workflows/godot.yml`. That step generates a debug keystore for the
run and does not keep it. Then, from `apps/godot` after
`godot --headless --path . --import`:

```bash
mkdir -p build/android
godot --headless --path . --export-debug Android build/android/zorg-debug.apk
test -s build/android/zorg-debug.apk
sha256sum build/android/zorg-debug.apk
```

## Reinstall

```bash
adb install /tmp/zorg-apk/zorg-debug.apk
```

When that exits 0, stop. `adb install -r` does not cross a debug-key
change, so a signature mismatch still fails.

When the install output contains `INSTALL_FAILED_UPDATE_INCOMPATIBLE`:

```bash
adb shell pm path link.artof.zorg
adb uninstall link.artof.zorg
adb install /tmp/zorg-apk/zorg-debug.apk
```

`pm path` must print a path inside `link.artof.zorg` before you uninstall.
Uninstall that package only. Do not uninstall any other package name, and
do not loop `pm list packages`.

| Result | What to do |
|---|---|
| `adb install` exit 0 | Installed. Leave every other package as it was. |
| output contains `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | `adb uninstall link.artof.zorg`, then `adb install` the same APK again. |
| `pm path link.artof.zorg` prints nothing | Nothing of ours is installed. Do not uninstall. Fix the install error instead. |
| any other `adb install` failure | Stop. A different error is not a reason to uninstall. |

Uninstall removes the debug app's saved data. That is expected for this
throwaway key. Do not use a Play developer account, and do not copy
signing credentials into the repo, the PR, or the phone session.
