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
