# Credits: third-party assets

Every third-party asset in the Godot app is listed here: pack, author,
source, licence and the exact files vendored. Only CC0 assets are allowed.
Everything else in the app (materials, lighting, fog, vignette, the
board, water, portal ring, hero rings, labels) is procedural.

| Pack | Author | Source (official) | Licence | Licence checked |
|---|---|---|---|---|
| KayKit Dungeon Remastered 1.0 (itch.io now calls it "KayKit - Dungeon Pack") | Kay Lousberg (kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (commit `b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07`), https://kaylousberg.itch.io/kaykit-dungeon-remastered | CC0 1.0 Universal | 2026-11-14: `LICENSE.txt` in the repo and the itch.io page ("Asset license: Creative Commons Zero v1.0 Universal") |
| KayKit Character Pack: Adventurers 1.0 | Kay Lousberg (kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (commit `672074b73ba276876a19e8816ecdc5241817ab47`), https://kaylousberg.itch.io/kaykit-adventurers | CC0 1.0 Universal | 2026-11-14: `LICENSE.txt` in the repo and the itch.io page ("Asset license: Creative Commons Zero v1.0 Universal") |
| Camera pad icons (original) | Drawn for this project | `apps/godot/assets/ui/camera/` | CC0 1.0 Universal | 2026-11-20: `LICENSE.txt` next to the SVG files |
| Kenney Board Game Icons 1.1 | Kenney (kenney.nl) | https://kenney.nl/assets/board-game-icons (same zip also published by Kenney on OpenGameArt), zip SHA-256 `05f4358381d8b16b303b2f056393b76ce3f6a58228599e88caa2eab11d4c2946` (1,039,954 bytes) | CC0 1.0 Universal | 2026-11-20: pack `License.txt` ("License: (Creative Commons Zero, CC0)") and the kenney.nl / itch.io pages ("Asset license: Creative Commons Zero v1.0 Universal") |

The packs' own licence files are kept next to the files:
`assets/kaykit/dungeon/LICENSE.txt`, `assets/kaykit/adventurers/LICENSE.txt`,
`assets/ui/camera/LICENSE.txt` and `assets/kenney/board-game-icons/LICENSE.txt`.
Attribution is not required by CC0; we give it anyway. The KayKit pages ask
not to resell unmodified copies or claim the assets as your own: we do
neither.

## Files used

`assets/kaykit/dungeon/` (from `addons/kaykit_dungeon_remastered/Assets/`):

| Vendored file | Source file | Used for |
|---|---|---|
| `floor_tile_small.glb` | `gltf/floor_tile_small.gltf.glb` | room floor tiles (tinted by room type and element) |
| `floor_foundation_allsides.glb` | `gltf/floor_foundation_allsides.gltf.glb` | wall cells (stone blocks) |
| `torch_mounted.glb` | `gltf/torch_mounted.gltf.glb` | wall sconce on each room's torch light |
| `wall_doorway.glb` | `gltf/wall_doorway.glb` | spawn room (A): the heroes' door |
| `floor_tile_big_grate_open.glb` | `gltf/floor_tile_big_grate_open.gltf.glb` | exit room (Z): grate over the pit |
| `floor_tile_big_spikes.glb` | `gltf/floor_tile_big_spikes.glb` | damage room (D): spikes |
| `pillar.glb` | `gltf/pillar.gltf.glb` | portal room (P): pillars beside the ring |
| `coin_stack_small.glb` | `gltf/coin_stack_small.gltf.glb` | gold pile in a room |
| `floor_wood_small.glb` | `gltf/floor_wood_small.gltf.glb` | toll hatch cells (T) |
| `coin.glb` | `gltf/coin.gltf.glb` | coin on a toll hatch |
| `wall.glb` | `gltf/wall.gltf.glb` | dungeon look: tall outer walls around a run (`scripts/dungeon_dressing.gd`) |
| `wall_broken.glb` | `gltf/wall_broken.gltf.glb` | dungeon look: broken stretches of those walls, and the low rim on the camera side |
| `wall_arched.glb` | `gltf/wall_arched.gltf.glb` | dungeon look: arches in the middle of long walls |
| `barrel_large.glb` | `gltf/barrel_large.gltf.glb` | dungeon look: corridor prop |
| `box_large.glb` | `gltf/box_large.gltf.glb` | dungeon look: corridor prop (crate) |
| `chest_gold.glb` | `gltf/chest_gold.glb` | dungeon look: gold-filled chest beside each gold (O) room |
| `dungeon_texture.png` | `texture/dungeon_texture.png` | shared atlas for all pieces above |

`assets/kaykit/adventurers/` (from `addons/kaykit_character_pack_adventures/Characters/gltf/`):

| Vendored file | Source file | Used for |
|---|---|---|
| `knight.glb` (+ extracted `knight_knight_texture.png`) | `Knight.glb` | Warrior heroes |
| `rogue_hooded.glb` (+ extracted `rogue_hooded_rogue_texture.png`) | `Rogue_Hooded.glb` | Elf heroes |

## How the files were reduced (CC0 allows changes)

To keep the APK and web download small, the files were trimmed with
glTF-Transform 4.5.1 (`@gltf-transform/core` / `functions`, `prune` with
attributes kept, then `dedup`):

- Dungeon pieces: the embedded atlas image was removed (the app applies one
  shared `dungeon_texture.png`); geometry and UVs unchanged.
- `dungeon_texture.png`: 1024 x 1024 atlas downsampled to 256 x 256
  (nearest), imported lossless.
- Knight / Rogue_Hooded: only the `Idle` animation kept (of 76), unused
  hand accessories removed (Knight keeps `1H_Sword` and `Badge_Shield`,
  Rogue keeps `1H_Crossbow`), the embedded texture downsampled to 256 x 256.
  3.5 MB -> 0.32 MB and 3.4 MB -> 0.29 MB.

Source checksums (SHA-256, before trimming): floor_tile_small `645f02c8…`,
floor_foundation_allsides `5b167b3f…`, torch_mounted `a617c159…`,
wall_doorway `2be5369a…`, floor_tile_big_grate_open `96d1e7a6…`,
floor_tile_big_spikes `7a4e94de…`, pillar `e31da496…`, coin_stack_small
`b7395adb…`, floor_wood_small `9e11192d…`, coin `97d3abdd…`,
dungeon_texture `f9ae1825…`, Knight `60428e3a…`, Rogue_Hooded `93e6e252…`.

Dungeon-look pieces (added with the walls-and-props PR, same commit
`b0ca9bd9…`, same trimming: embedded atlas removed, `prune` with attributes
kept, `dedup`; geometry and UVs unchanged; together 0.31 MB):

| Vendored file | Bytes | SHA-256 of the source file | SHA-256 of the vendored file |
|---|---|---|---|
| `wall.glb` | 37144 | `f2f343a7bdf2d45947e3f354494e16095a923485e05637e3804e3b81ce11d921` | `e64da3c15f106b0c5b99b0679c25ef963f00b1338908eb8e5198b87b541e4523` |
| `wall_broken.glb` | 53288 | `ee7598ef2b88aaeb7b61e46d5f1da1a059de3860b080b38b7a507ca2f461302c` | `474a87737a74a2e80232cd2ebdb114ecad3d14c382d41cf82b28749251674b6d` |
| `wall_arched.glb` | 53136 | `916a7d81b8d6ebddb069440a0f9ecb14c9c2a1e5cd7769acf2218d630bd56cb8` | `3b13c870164ff6a20558ec8bee92d0bc2be6844138284ef0cdb3e17dbe962967` |
| `barrel_large.glb` | 28308 | `9fae6a79056241baf253fe9272dc7a7ddb174e1caf153eb5013c58a596722148` | `fcc1a552072f31efafe8d43cc32bd975d5350f93c9c6be794d392c7811f327cd` |
| `box_large.glb` | 12756 | `6dacda267f04769f8ebbb7e991885785054923ea3d5eb19e833768a911d5b661` | `5fc891945f0ee306def079e850c7ea9f0a0b8412aeb63e96441e13826d000042` |
| `chest_gold.glb` | 124032 | `04708d5f88ed59d361c8a6cec1efe8b7028dbc641dfae0a1467f272e14a94b6e` | `6b14d76998297770b43e42e29c163833224afd7f2824258b522d2d90e4868130` |

## Camera pad icons

`assets/ui/camera/` — nine original stroke SVG icons (64×64, 24-unit viewBox,
2 px round cream stroke on a transparent ground), dedicated to the public
domain under CC0 1.0. They are not from KayKit, Kenney, Humble, Zenva or
Packt. The licence file is `assets/ui/camera/LICENSE.txt`. Total size of
the nine SVGs plus the licence: about 2.9 KB.

| Vendored file | Bytes | SHA-256 | Used for |
|---|---|---|---|
| `zoom_in.svg` | 284 | `7609e966e0a79021d102fde0b4e8cdd8da57a69c0d73c14c31272d74ed3d3d55` | camera pad Zoom + |
| `zoom_out.svg` | 270 | `ad950645f233b9d2800d52501b7b5eceb5e7774a996e8146ed83eb51bbe30f05` | camera pad Zoom - |
| `tilt_up.svg` | 270 | `c74a872c9768fd7a4a04a77d345d10e9b43e6020ddb0b390fb1c86160e3ec1c6` | camera pad Tilt + |
| `tilt_down.svg` | 272 | `5b92ab928f4dc3b08300fe79d2beed7567898cbe6dcd0b0bfff896d84d905e86` | camera pad Tilt - |
| `turn_left.svg` | 264 | `aa20628796eaed799dc58c4cd69317d6f0c38cba6a6a7329f9d202c5f2cd8782` | camera pad Turn left 90° |
| `turn_right.svg` | 259 | `87c73233b936e7ecc64b5bcb3707fed5936acef3d0e0187aa25958e09b04aab5` | camera pad Turn right 90° |
| `fit.svg` | 281 | `db1a5d4921d3bf40e9015cf3394cff972b7436f2d77b1e5f329926b7434f7022` | camera pad Fit |
| `view_all.svg` | 377 | `d70c762e662d09f5119cd2db2a5e7b3185ff8b3c5e4e66b60b4611aeb623a86b` | camera pad View: All |
| `view_hero.svg` | 286 | `67772fae4b067e66bdb901aa91dd8f12be82a90cf26bdfdf71a0bc1040342f86` | camera pad View: Hero |
| `LICENSE.txt` | 362 | `33a684e35873de1edafef9e3df417a68145d4d3b257491ebb8fcec670f4ecb48` | CC0 1.0 text |

Together the nine SVGs and the licence are **2925 bytes**.

The pack's own licence file is kept next to the files:
`assets/kenney/board-game-icons/LICENSE.txt`. Attribution is not required by
CC0; we give it anyway.

## Spell icons (`assets/kenney/board-game-icons/`)

128 px white-on-transparent PNGs from `PNG/Double (128px)/`, plus one
composed Attack icon (CC0 allows changes). The Godot HUD draws the Attack
damage badge at runtime; it is not baked into the texture.

| Vendored file | Source file | Used for |
|---|---|---|
| `sword.png` | `PNG/Double (128px)/sword.png` | source for the Attack composition |
| `exploding.png` | `PNG/Double (128px)/exploding.png` | source for the Attack burst |
| `attack.png` | composed: `sword.png` rotated 90° clockwise, shrunk to 120 px, plus `exploding.png` shrunk to 52 px at the tip | Attack (sword striking down with a small burst) |
| `arrow_rotate.png` | `PNG/Double (128px)/arrow_rotate.png` | Teleport |
| `card_place.png` | `PNG/Double (128px)/card_place.png` | Move |
| `hexagon_switch.png` | `PNG/Double (128px)/hexagon_switch.png` | Swap |
| `card_target.png` | `PNG/Double (128px)/card_target.png` | Selection |
| `hourglass.png` | `PNG/Double (128px)/hourglass.png` | Sleep |
| `lock_open.png` | `PNG/Double (128px)/lock_open.png` | Wake |
| `shield.png` | `PNG/Double (128px)/shield.png` | Banality |
| `LICENSE.txt` | `License.txt` | pack licence |

Source and vendored SHA-256 (128 px PNGs are copied unchanged, so both hashes match):

| File | Bytes | SHA-256 |
|---|---|---|
| `sword.png` | 746 | `69bc34f388eccdad66dfe4d2f879ffc443fba82d9d0757854678e2b3cca92674` |
| `exploding.png` | 896 | `11a9cc07a8b965cee3f3cd964796315d5fbfae0d939b23de09e4c8ef2f0f2860` |
| `attack.png` (composed) | 3485 | `f4e566233330cffe9a095e872cd8cde9996623c6a50b545815f8088a380832e2` |
| `arrow_rotate.png` | 1137 | `53a826208bb4fc7c316c682ddc0d35477a241eef5a255205db2969ee94fed3be` |
| `card_place.png` | 1022 | `0c7fab75eb96f47867cabaf2f01cfba3c354c4c8d97a7e0b8a06d98e5b7ca927` |
| `card_target.png` | 379 | `1504c06c6ccfaa16afb6a4de4fd271034fab26549fc26449b15c6d4b262def75` |
| `hexagon_switch.png` | 1288 | `7b5c163271d4a1d081e9c389695c67406a1aafa787c3a1ec5a08649dfb54e44c` |
| `hourglass.png` | 1046 | `69693c139c4e3c12c17881f2a1b3b2d49ea71da443a1b6a40af01aef32822ff5` |
| `lock_open.png` | 1006 | `f520f78e43e103f5de9e289f054ebec8044a953f5362ed25bad64084885a45a3` |
| `shield.png` | 913 | `61d3a2734e356fb79f4b75ce8d67a1125232f1002d5d707b791b9b6ddafd5fad` |
| `LICENSE.txt` | 574 | `ee984bc143c380c108199620d18bfdf55001a566951bbda485c2a5d94254350a` |
