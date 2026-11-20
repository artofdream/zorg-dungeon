# Credits: third-party assets

Every third-party asset in the Godot app is listed here: pack, author,
source, licence and the exact files vendored. Only CC0 assets are allowed.
Everything else in the app (materials, lighting, fog, vignette, the
board, water, portal ring, hero rings, labels) is procedural.

| Pack | Author | Source (official) | Licence | Licence checked |
|---|---|---|---|---|
| KayKit Dungeon Remastered 1.0 (itch.io now calls it "KayKit - Dungeon Pack") | Kay Lousberg (kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (commit `b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07`), https://kaylousberg.itch.io/kaykit-dungeon-remastered | CC0 1.0 Universal | 2026-11-14: `LICENSE.txt` in the repo and the itch.io page ("Asset license: Creative Commons Zero v1.0 Universal") |
| KayKit Character Pack: Adventurers 1.0 | Kay Lousberg (kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (commit `672074b73ba276876a19e8816ecdc5241817ab47`), https://kaylousberg.itch.io/kaykit-adventurers | CC0 1.0 Universal | 2026-11-14: `LICENSE.txt` in the repo and the itch.io page ("Asset license: Creative Commons Zero v1.0 Universal") |

The packs' own licence files are kept next to the files:
`assets/kaykit/dungeon/LICENSE.txt` and `assets/kaykit/adventurers/LICENSE.txt`.
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
