# Findings ledger (antifragility)

> "The same miss twice is a missing sensor or gate, not a missing paragraph."
> — AEA's antifragility principle (architecture.artof.link/schema.html).

A **Coherence Finding (CF-NNN)** is any discrepancy between what the docs
claim and what the system actually does — a bug, a spec/code mismatch, a
broken promise in `STATUS_LEDGER.md`, anything a reviewer or a user catches.

Discipline: **1 finding → 1 issue → 1 branch**, until resolved. File one here
before opening the GitHub issue (use the `coherence_finding` issue template,
which links back to the CF-NNN ID).

The rule that makes this antifragile rather than just a bug tracker:
**once a finding's `Recurrence` reaches 2, the PR that resolves it must also
add or change something in `.github/workflows/**` or a `*.test.*` file** —
a sensor or a gate, not just a fix. `scripts/check-findings-ledger.mjs`
enforces this on the closing PR's diff.

## Format

```
## CF-NNN: <short title>
- Status: Open | Resolved
- Recurrence: <how many times this exact class of miss has happened>
- Linked: <issue/PR link>
- Sensor added: <path touched to prevent recurrence> (required once Recurrence >= 2)
```

## Ledger

## CF-001: Example — seed the format
- Status: Resolved
- Recurrence: 1
- Linked: (none — this is a seed entry demonstrating the format, not a real finding)
- Sensor added:

## CF-002: Unix placeholder commands in package scripts fail on Windows
- Status: Resolved
- Recurrence: 1
- Linked: (none — resolved in CI/CD stabilization)
- Sensor added:

## CF-003: pnpm/action-setup duplicate version specification in CI workflow
- Status: Resolved
- Recurrence: 1
- Linked: #2
- Sensor added: .github/workflows/ci.yml

## CF-004: GitHub Pages site missing / configure-pages Not Found
- Status: Resolved
- Recurrence: 1
- Linked: #4
- Sensor added: .github/workflows/knowledge.yml

`deploy-knowledge` failed on `main` after PR #2: `actions/configure-pages@v5`
returned Get Pages site failed / Not Found because `GET /repos/.../pages`
404'd — the Pages site had never been created. DNS already pointed
`knowledge.zorg.artof.link` at `artofdream.github.io`.

Resolution: a repo admin enabled Pages via the GitHub API with
`build_type=workflow` (site `https://artofdream.github.io/zorg-dungeon/`,
custom domain set to match the journal). `deploy-knowledge` was re-triggered
on `main` and completed success (Actions run 34530132314). This PR hardens
Setup Pages with `enablement: true` and records the sensor rule: **the repo
Pages site must exist with `build_type=workflow`**. Default `GITHUB_TOKEN`
cannot create a Pages site; `enablement: true` is not a substitute for that
admin enablement.

Do not mark the knowledge site `Live & Probed` from this finding. A green
deploy job is not a production content probe.

## CF-005: Base-classic N11 Dream Trap and N18 Math Bath are not green-corpus targets
- Status: Resolved
- Recurrence: 1
- Linked: https://github.com/artofdream/zorg-dungeon/pull/5
- Sensor added: packages/engine/src/quarantine-index.test.ts (+ packages/engine/fixtures/quarantine-index.json; green exclusion in base-classic-corpus.test.ts / level-pack-corpus.test.ts)

Sponsor resolution S5: Base N11 “Dream Trap” is author-flagged in the source
(`euh y a un problème dans celui-ci à mon grand regret`). Base N18 “Math Bath”
has a malformed heroes line (`Guerrier(choix(1, {1,3,5}), Guerrier(2)` —
unbalanced `choix`). Deluxe 10.7 `Artilleur(_)` is now imported under
`packages/engine/fixtures/contracts/quarantine/`. Phase 7 also quarantines
two clearly malformed authored lines that cannot parse: Base N23 Equilibrium
Atrium (broken `Princesse`/`choix` close) and Deluxe 8.2 (unbalanced `choix`).
N11, N18, and N23 live under
`packages/engine/fixtures/base-classic/quarantine/`. Green corpus suites
(`base-classic-corpus.test.ts`, `level-pack-corpus.test.ts`) assert these
paths are excluded and `describe.skip` the quarantine folder so they cannot
fail CI.

**Resolution:** S5 quarantine + `quarantine-index.json` honesty sensor
(`quarantine-index.test.ts`) — index paths exist on disk, green globs never
include them, expected ids stay base-classic 11/18/23 and contracts 8.2 /
10.7. Does **not** invent author fixes for Dream Trap. Recurrence stays 1 —
quarantine + skip + index sensor is documentation / first sensor, not a
second-miss gate. Cite: `corpus-quarantine-honesty` / Keep Learning and Apply.

## CF-006: Production web image has no CD and went stale
- Status: Resolved
- Recurrence: 1
- Linked: https://github.com/artofdream/zorg-dungeon/pull/9, https://github.com/artofdream/zorg-dungeon/pull/19
- Sensor added: .github/workflows/deploy-web.yml

Lightsail `zorg.artof.link` (`<LIGHTSAIL_STATIC_IP>`) was still serving a
pre–Phase-1 bundle until a manual SSH redeploy on 2026-09-11 to `2217dd5`.
The knowledge site auto-deploys via Pages; the game web image did not.

This PR adds `.github/workflows/deploy-web.yml` so `main` pushes that
touch the web/engine/deploy paths (or `workflow_dispatch`) SSH and rebuild
the `web` service. Recurrence 1 — the workflow is the first sensor, not a
second-miss gate. Do not mark game FRs `Live & Probed` from a redeploy.

First CD run failed with `permission denied while trying to connect to the
Docker daemon socket`. `git fetch` / `git reset` succeeded without sudo;
`ubuntu` is not in an effective docker group for that SSH session.
`deploy/setup-host.sh` already uses `sudo docker compose`. The remote
command now matches: `sudo docker compose -f deploy/compose.prod.yaml
up -d --build web`.

Path filters originally omitted workspace manifests that
`apps/web/Dockerfile` copies (`package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `tsconfig.base.json`). A lockfile-only merge
would skip CD and leave prod stale again. Follow-up adds those paths
to the sensor. Recurrence stays 1 — this is tightening the first
sensor, not a second miss.

Docker builds leave `/opt/zorg` files (especially fixtures) root-owned.
Non-sudo `git reset --hard` then fails with `Permission denied` unlinking
those files (CD and manual redeploy). Remote command now uses
`sudo git fetch` and `sudo git reset --hard origin/main` before
`sudo docker compose`. Recurrence stays 1 — same sensor, privilege
alignment, not a second-miss gate.

Resolution: PR #19 landed the `sudo git` privilege alignment on the
Lightsail host command. After PR #21 merged to `main` (`4111d82`,
2026-09-12), `deploy-web` ran on that push and completed success
(Actions run
[34687483872](https://github.com/artofdream/zorg-dungeon/actions/runs/34687483872)).
That is CD evidence, not a production content probe — do not mark
game FRs `Live & Probed` from this close.

## CF-007: Player guide still said only Warrior/Elf were encoded
- Status: Resolved
- Recurrence: 1
- Linked: (this PR — knowledge companion refresh)
- Sensor added: apps/knowledge/scripts/build.mjs

After phases 4–7 and the Difficulté campaign landed, `docs/PLAYER_GUIDE.md`
still said only Warrior and Elf had rules encoded, and that the spellbook
was “when Phase 4 starts.” The companion was stale vs `@zorg/engine` and
the Maker at zorg.artof.link.

This PR rewrites the guide as a companion (cite IDs; spec wins; no invented
`C` / Gunner duration / FR-4 gating) and adds a knowledge-build check that
the guide cites FR-22–25 / FR-32–33 / NFR-5 and does not claim “two types
have rules encoded.” Recurrence 1 — first sensor, not a second-miss gate.
Do not promote ledger rows from companion prose.

## CF-008: Mechanic shove search dropped colon-bearing room ids
- Status: Resolved
- Recurrence: 1
- Linked: https://github.com/artofdream/zorg-dungeon/pull/23
- Sensor added: packages/engine/src/mechanic.test.ts

`layoutKeyOf` / `layoutFromKey` encoded positions as `A:0:x,y` and split on
the first `:`. Room ids are already `Type:n`, so a shove snapshot restored
nothing and later search steps planned on the pre-shove graph. From spawn
center the equal-length shove-first path was invisible; the run lucked into
walk-then-shove because Z had not moved.

Fix: encode `A:0@x,y`. Recurrence 1 — first sensor, not a second-miss gate.
Does not invent Gunner duration or new shove rules.

## CF-009: First-timer landing is engineer-first
- Status: Resolved
- Recurrence: 1
- Linked: https://github.com/artofdream/zorg-dungeon/pull/44, https://github.com/artofdream/zorg-dungeon/issues/46, https://github.com/artofdream/zorg-dungeon/issues/47, https://github.com/artofdream/zorg-dungeon/issues/48
- Sensor added: apps/web/src/first-run.test.ts

Sponsor: the game should be reachable from about age 8. The live Maker
lede led with Difficulté / FR-4 / C rooms / Gunner duration / Simulated
ledger language before a first-timer could see “pick a level.” That is a
docs-vs-audience miss (companion claims a playable campaign; the first
screen spoke engineer).

This PR adds [[PLAYER_JOURNEYS]] (J-KID, J-HELPER, J-CAMPAIGN, J-PRACTICE,
J-HONESTY) as UX validation cases — [[GAME_SPEC]] still wins on rules —
and rewrites the landing to How to play + Start here (Difficulty 1 or
Generate Difficulty 1). Honesty / FR notes stay in a disclosure.
Recurrence 1 — `first-run.test.ts` is the first sensor (kid-facing copy
must stay free of FR-4 / C / Gunner / ledger jargon), not a second-miss
gate. Maker-play leftovers (JSON log, Φ, choix setup) are filed as
follow-up issues, not this CF.

Do not promote [[STATUS_LEDGER]] rows from landing copy. Do not invent
`C`, Gunner duration, or [[FR-4]] gating.

## CF-010: Skills written only after AFK rebase pain
- Status: Resolved
- Recurrence: 1
- Linked: https://github.com/artofdream/zorg-dungeon/issues/50, https://github.com/artofdream/zorg-dungeon/issues/53, https://github.com/artofdream/zorg-dungeon/pull/54
- Sensor added: AGENTS.md (Keep Learning and Apply section) + docs/SKILL_MATRIX.md + apps/knowledge/scripts/build.mjs (skills.html)

Keep Learning and Apply
([AEA #434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434))
lagged in practice. Shared Grok skills
(`pr-train-rebase`, `honesty-ledger-gate`, `companion-plain-docs`,
`persona-journey-validation`) and the in-repo [[SKILL_MATRIX]] were
written after the 2026-09 AFK PR train
([#23](https://github.com/artofdream/zorg-dungeon/pull/23) /
[#24](https://github.com/artofdream/zorg-dungeon/pull/24) /
[#25](https://github.com/artofdream/zorg-dungeon/pull/25) CONFLICTING)
and the first-timer audit, not into the harness before the next loop.
That is a process discrepancy: Honesty and Knowledge First were already
named; the apply write waited for a retrospective. This is not an
Antifragility miss (Recurrence stays 1).

**Resolution:** Harness apply landed — [[AGENTS]] Keep Learning section,
[[SKILL_MATRIX]], and knowledge `skills.html` build gate. [#50](https://github.com/artofdream/zorg-dungeon/issues/50)
/ [#53](https://github.com/artofdream/zorg-dungeon/issues/53) closed; later
cuts applied skills ([#58](https://github.com/artofdream/zorg-dungeon/pull/58)
journeys, [#59](https://github.com/artofdream/zorg-dungeon/pull/59) CI,
[#60](https://github.com/artofdream/zorg-dungeon/pull/60) tiles). **zorg
knowledge Pages Probed** this session (2026-09-13): HTTP 200 for
https://knowledge.zorg.artof.link/skills.html,
https://knowledge.zorg.artof.link/aea.html, and
https://knowledge.zorg.artof.link/findings.html. **AEA Pages remain
Unknown** (not independently probed here). Not Live & Probed for game
FRs; not a [[STATUS_LEDGER]] promotion.

CF-009 is reserved for in-flight journeys PR #44 (first-timer landing)
so this entry skips that ID. Recurrence 1 — documenting + probing zorg
knowledge Pages is not a second-miss gate. Do not invent `C`, Gunner
duration, or [[FR-4]] gating.

## CF-011: LEARN.md mermaid reserved node id `end`
- Status: Resolved
- Recurrence: 1
- Linked: (this PR — learn.html mermaid 11.4.1 syntax error)
- Sensor added: apps/knowledge/scripts/build.mjs

[[LEARN]] (`learn.html` on knowledge.zorg.artof.link) showed mermaid 11.4.1
“Syntax error in text” (red bomb). Rendered with `@mermaid-js/mermaid-cli@11.4.1`:
the Two jobs diagram failed because `spell --> end["…"]` uses the reserved
flowchart token `end`. The comma edge label and chained `A --- D --- Z`
both rendered under 11.4.1; they are quoted/split anyway.

Recurrence 1 — the knowledge build now rejects reserved `end` node ids,
unquoted comma edge labels, and one-line chained undirected links in every
shipped `<pre class="mermaid">`. Not a second-miss gate. Do not promote
[[STATUS_LEDGER]] rows. Do not invent `C`, Gunner duration, or [[FR-4]]
gating. [#51](https://github.com/artofdream/zorg-dungeon/issues/51) is closed
(12 September 2026, 22:27 Europe/Berlin). A live Pages probe of the
learn page is a separate honesty step; this entry does not claim that
probe, and it no longer says the issue is open.


## CF-012: ci journey probes broke when ubuntu-latest moved to 26.04
- Status: Resolved
- Recurrence: 1
- Linked: PR #84 (Godot milestone 1) — first PR after the runner migration
- Sensor added: .github/workflows/ci.yml

`ci` on PR #84 failed at "Install Playwright Chromium": Playwright 1.55.1
does not support `ubuntu26.04-x64`, and `ubuntu-latest` began moving to
Ubuntu 26 on 2026-10-19. Build, typecheck, lint and test had all passed;
main's last green `ci` was 2026-10-28, before the label moved. The fix pins
`ci` to `ubuntu-24.04` without changing any web behaviour. Recurrence 1.
Bumping Playwright later can drop the pin.


## CF-013: Godot board unreadable on the web build
- Status: Resolved
- Recurrence: 1
- Linked: [PR #112](https://github.com/artofdream/zorg-dungeon/pull/112)
- Sensor added: apps/godot/tests/level_smoke_test.gd

The itch.io HTML5 build of level 1.2 (Contractual Obligation) showed a
readable HUD and a blue-black board. `apps/godot/README.md` said a faint
cool moon kept shapes readable. A Compatibility render and a Mobile render
of the same frame were both near-black (empty tile contrast about 1.07
against the background). Cause: ambient energy 0.17, cool sun energy 0.32,
filmic tonemap, and fog density 0.012, not a web-only lighting bug. Torches
were on and only warmed the nearest rooms. The fix is visual (warmer fill,
emissive checker, brighter torches, declared braziers). No engine rule
changed. Recurrence 1. The smoke test now rejects the old ambient and fog
values. See [[LEARNINGS-godot]].


## CF-014: Godot board motion fought the player and skipped frames of a run
- Status: Resolved
- Recurrence: 1
- Linked: PR (this branch, agent/grok/board-ux-fluidity)
- Sensor added: apps/godot/tests/level_smoke_test.gd

A web play-through looked laggy. On the box (no GPU), a Compatibility
frame under Xvfb/llvmpipe took 21–46 ms, while the level screen's own
`_process` took 0.03–0.1 ms. Most of that is box-only software
rendering. Four real motion causes were found in the presentation
layer, none in the rules:
the fit/snap glide (a 0.25–0.35 s tween) kept moving the pivot while a
finger panned; a free yaw drag during a 90° turn jumped to the turn's
destination; Play reset its step timer each step, so the cadence
rounded up to whole frames (0.20 s instead of 0.18 s at 30 FPS); and a
multi-cell ice slide (9 cells, 1.17 s) was killed by the next Play step
after 0.18 s, so the figure cut the corner. Pan and yaw now stop the
glide, yaw continues from the current angle, the timer keeps its
overshoot, and a turn's moves fit inside one Play step. No engine rule
changed. Recurrence 1. The smoke test now checks each of these.


## CF-015: Godot froze for one frame on first drop, Play, spawn and death
- Status: Resolved
- Recurrence: 1
- Linked: PR (this branch, agent/grok/hitch-prewarm)
- Sensor added: apps/godot/tests/level_smoke_test.gd

On the ROG Phone 2 the debug APK held 59–60 FPS but froze for single
frames: up to 219 ms on a room drop, 125 ms when Play was pressed on 5.8
(49 ms on 1.4), and 50–85 ms on the first spawn and the first death. The
causes were first-use costs in the presentation layer, all landing on one
frame. These were shader and pipeline compiles, building a room model, the
run walls and the first hero, and the first step itself on the Play press
frame. The box (llvmpipe, no shader cache) showed the same events, larger:
about 1.3 s on the first drop and 0.7 s on Play. Another death fix was
tried first: drawing a separate fading figure and then freeing it. That
brought the compile back on the box. Only a figure kept alive on the
hidden stage worked. The fix keeps the rules as they are. It draws the
level's pieces once on a hidden stage while the board is idle, pools the
rooms and heroes, shows a placeholder slab for a drop with no room ready,
builds the walls over a few frames before the first step, and keeps the
camera still on those frames. No engine rule changed. Recurrence 1. The
smoke test checks the pool, the placeholder and the Play hold.


## CF-016: Godot level grid drew under the room tray on a phone
- Status: Resolved
- Recurrence: 1
- Linked: PR (this branch, agent/grok/levelselect-overlay-bugbot)
- Sensor added: apps/godot/tests/level_smoke_test.gd

On the ROG Phone 2 (2340×1080 landscape, level 5.8) the open "Choose a
level" grid sat under the room tray: the O(1) and T(1, fire) tiles covered
its bottom row, so Graphics and Close could not be read or tapped. The grid
was an earlier sibling of the tray in the HUD, so the tray drew on top, and
taps outside the grid still reached the tray and the board. The grid now
lives on its own layer above the HUD, behind a dimmed backdrop that takes
every tap (a tap on it closes the grid), fits inside the safe area with
fewer columns on a narrow screen, and scrolls its levels when the screen is
short, so Graphics and Close stay on screen. The same change fixes three
warm-up races from CF-015 (review findings): a run reset now waits for the
level's warm-up instead of freeing its pieces, a pooled room that was
dropped during the warm-up keeps its torch budget, and a level switch can no
longer leave the warm-up waiting on a freed node. No engine rule changed.
Recurrence 1. The smoke test checks the layer, the backdrop, that every
grid button is on screen at 2340×1080 and 360 wide, and real taps on a tray
tile, Close and a level button.

## CF-017: Shipped level 5.8 has no winning layout under the engine's rules
- Status: Open
- Recurrence: 1
- Linked: PR (this branch, agent/grok/show-solution)
- Sensor added: packages/engine/src/solution.test.ts

The FR-47 solution search (packages/engine/scripts/solve-levels.mjs) tried
every legal layout of 5.8 Vault Break — all 216 six-room shapes, every room
order, all four orientations: 622,080 layouts — and none is a level win.
5.8 has no spells, so no cast search is involved: this is exhaustive for
the rules as the engine implements them (FR-16 gold, FR-17 tolls, FR-21
Elf). Cross-check: the same verifier gives the recorded verdict for all
52 valid golden layouts (the three 5.8 goldens are two losses and a
stalemate; none of them wins), and every golden shape is one the search
enumerates, so the result is not an artefact of a stricter verifier or a
missing shape. Either the source level depends on a rule reading the engine does
not have, or the transcription is off. The game ships 5.8 anyway; its
golden leads with a loss case, and Show a solution says "No stored
solution yet" instead of a made-up answer. The stored file
(fixtures/solutions/deluxe-5.8.json) records the verdict, and the test
fails if a solution ever appears without replaying to a win.
