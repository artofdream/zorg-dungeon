class_name ZorgLook
extends RefCounted
## 2.5D look: shared materials and meshes, room tiles, room props and hero
## figures. Round 10: walls, floor tiles, torches, props and heroes are CC0
## low-poly models (KayKit by Kay Lousberg, see CREDITS.md) under
## res://assets/kaykit; element floors keep their own flat colours so they
## stay readable. Visual only: nothing here reads or changes engine state.

const ROOM := 5.0
const WALL_H := 0.7
const FLOOR_H := 0.14

const FLOORS := {
	"A": Color(0.36, 0.62, 0.36), "Z": Color(0.45, 0.1, 0.12), "D": Color(0.72, 0.45, 0.2),
	"E": Color(0.5, 0.5, 0.54), "O": Color(0.62, 0.55, 0.32), "P": Color(0.42, 0.3, 0.58),
	"T": Color(0.45, 0.38, 0.3),
}

const KK := "res://assets/kaykit/"
## KayKit tiles are 2 m; one board cell is 1 unit.
const TILE_SCALE := 0.5
## Knight / Rogue are ~2.4 m tall; this makes them ~1.65 units before the
## hero SCALE, the height the HP label anchor expects.
const HERO_MODEL_SCALE := 0.58

static var _mats := {}
static var _meshes := {}
static var _parts := {}

## Meshes (with their transforms inside the model) of one KayKit piece,
## loaded once and shared by every room.
static func parts(piece: String) -> Array:
	if not _parts.has(piece):
		var out: Array = []
		var scene: PackedScene = load(KK + "dungeon/%s.glb" % piece)
		var n: Node = scene.instantiate()
		_collect(n, Transform3D.IDENTITY, out)
		n.free()
		_parts[piece] = out
	return _parts[piece]

static func _collect(n: Node, t: Transform3D, out: Array) -> void:
	var tt := t
	if n is Node3D:
		tt = t * (n as Node3D).transform
	if n is MeshInstance3D and (n as MeshInstance3D).mesh:
		out.append([(n as MeshInstance3D).mesh, tt])
	for c in n.get_children():
		_collect(c, tt, out)

## Queue a KayKit piece for a merged mesh (see flush): rooms draw their floor
## tiles and walls as one mesh per material instead of ~40 small ones, which
## keeps phone frame rates up.
static func queue_piece(batch: Dictionary, piece: String, pos: Vector3, s: Vector3, m: Material, shadows := true, yaw := 0.0) -> void:
	var key := [m, shadows]
	if not batch.has(key):
		batch[key] = []
	var base := Transform3D(Basis(Vector3.UP, yaw) * Basis.from_scale(s), pos)
	for pr in parts(piece):
		batch[key].append([pr[0], base * (pr[1] as Transform3D), piece])

## One MeshInstance3D per (material, shadows) with every queued piece merged
## in; each remembers the piece names it holds (meta "pieces").
static func flush(parent: Node3D, batch: Dictionary) -> void:
	for key in batch:
		var st := SurfaceTool.new()
		var names := {}
		for it in batch[key]:
			var mesh: Mesh = it[0]
			for si in mesh.get_surface_count():
				st.append_from(mesh, si, it[1])
			names[it[2]] = true
		var mi := MeshInstance3D.new()
		mi.name = "Merged"
		mi.mesh = st.commit()
		mi.material_override = key[0]
		if not key[1]:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.set_meta("pieces", names.keys())
		parent.add_child(mi)
	batch.clear()

## One KayKit piece at pos, scaled by s and turned by yaw (radians), with
## material m (the shared atlas look if null). Returns its first mesh node.
static func add_piece(parent: Node3D, piece: String, pos: Vector3, s: Vector3, m: Material = null, yaw := 0.0, shadows := true) -> MeshInstance3D:
	var base := Transform3D(Basis(Vector3.UP, yaw) * Basis.from_scale(s), pos)
	var first: MeshInstance3D = null
	for pr in parts(piece):
		var mi := MeshInstance3D.new()
		mi.mesh = pr[0]
		mi.transform = base * (pr[1] as Transform3D)
		mi.material_override = m if m else mat("kk")
		if not shadows:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		parent.add_child(mi)
		if first == null:
			first = mi
	return first

## One shared material per look, so rooms of the same kind share GPU state.
static func mat(key: String) -> StandardMaterial3D:
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.roughness = 0.85
	match key:
		"kk":
			# KayKit gradient atlas (downsampled to 256 px), warmed a little
			# toward the torch-lit stone of the target look.
			m.albedo_texture = load(KK + "dungeon/dungeon_texture.png")
			m.albedo_color = Color(1.0, 0.94, 0.86)
		"wall":
			m.albedo_texture = load(KK + "dungeon/dungeon_texture.png")
			m.albedo_color = Color(0.85, 0.76, 0.66)
		"wall_top":
			m.albedo_texture = load(KK + "dungeon/dungeon_texture.png")
			m.albedo_color = Color(0.5, 0.47, 0.45)
		"board_a":
			m.albedo_color = Color(0.25, 0.24, 0.24)
			m.roughness = 1.0
			ZorgAtmos.stone(m, 0.35)
		"board_b":
			m.albedo_color = Color(0.31, 0.3, 0.28)
			m.roughness = 1.0
			ZorgAtmos.stone(m, 0.35)
		"flame":
			m.albedo_color = Color(1.0, 0.7, 0.25)
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.emission_enabled = true
			m.emission = Color(1.0, 0.55, 0.15)
			m.emission_energy_multiplier = 3.0
		"fire":
			m.albedo_color = Color(1.0, 0.36, 0.08)
			m.emission_enabled = true
			m.emission = Color(0.9, 0.2, 0.02)
			m.emission_energy_multiplier = 0.7
		"water":
			m.albedo_color = Color(0.2, 0.5, 1.0, 0.55)
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.roughness = 0.05
			m.metallic_specular = 0.9
		"water_bed":
			m.albedo_color = Color(0.05, 0.12, 0.3)
			m.emission_enabled = true
			m.emission = Color(0.05, 0.2, 0.55)
			m.emission_energy_multiplier = 0.5
		"ice":
			m.albedo_color = Color(0.86, 0.95, 1.0)
			_readable(m)
			m.roughness = 0.04
			m.metallic = 0.25
			m.metallic_specular = 1.0
		"poison":
			m.albedo_color = Color(0.35, 0.85, 0.2)
			m.emission_enabled = true
			m.emission = Color(0.2, 0.6, 0.1)
			m.emission_energy_multiplier = 0.5
		"gold":
			m.albedo_color = Color(1.0, 0.8, 0.25)
			m.metallic = 0.9
			m.roughness = 0.3
			m.emission_enabled = true
			m.emission = Color(0.4, 0.28, 0.0)
		"hatch":
			m.albedo_color = Color(0.45, 0.3, 0.15)
			_readable(m)
		"steel":
			m.albedo_color = Color(0.75, 0.77, 0.8)
			m.metallic = 0.8
			m.roughness = 0.35
		"spawn":
			m.albedo_color = Color(0.4, 0.9, 0.45)
			m.emission_enabled = true
			m.emission = Color(0.15, 0.6, 0.2)
			m.emission_energy_multiplier = 0.6
		"exit_pit":
			m.albedo_color = Color(0.02, 0.0, 0.0)
			m.roughness = 1.0
		"exit_glow":
			m.albedo_color = Color(1.0, 0.2, 0.15)
			m.emission_enabled = true
			m.emission = Color(1.0, 0.15, 0.1)
			m.emission_energy_multiplier = 2.0
		"portal":
			m.albedo_color = Color(0.4, 0.95, 1.0)
			m.emission_enabled = true
			m.emission = Color(0.2, 0.85, 1.0)
			m.emission_energy_multiplier = 2.0
		"portal_core":
			m.albedo_color = Color(0.5, 0.9, 1.0, 0.35)
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.cull_mode = BaseMaterial3D.CULL_DISABLED
		_:
			if key.begins_with("floor_"):
				m.albedo_color = FLOORS.get(key.substr(6), Color(0.5, 0.5, 0.5))
				_readable(m)
				# Stone tile pattern from the atlas, tinted by the room colour.
				m.albedo_texture = load(KK + "dungeon/dungeon_texture.png")
			elif key.begins_with("dark_"):
				m.albedo_color = mat(key.substr(5)).albedo_color.darkened(0.3)
				m.albedo_texture = mat(key.substr(5)).albedo_texture
				m.emission_enabled = mat(key.substr(5)).emission_enabled
				m.emission = mat(key.substr(5)).emission.darkened(0.3)
				m.emission_energy_multiplier = mat(key.substr(5)).emission_energy_multiplier
	_mats[key] = m
	return m

## Round 9: the dungeon is dark, so room and element floors glow faintly in
## their own colour and stay readable outside torch light.
static func _readable(m: StandardMaterial3D) -> void:
	m.emission_enabled = true
	m.emission = m.albedo_color
	m.emission_energy_multiplier = 0.22

static func box_mesh(size: Vector3) -> BoxMesh:
	var key := "box%s" % size
	if not _meshes.has(key):
		var b := BoxMesh.new()
		b.size = size
		_meshes[key] = b
	return _meshes[key]

static func add_mesh(parent: Node3D, mesh: Mesh, m: Material, pos: Vector3, shadows := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.position = pos
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi

static func cone(radius: float, height: float) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = 0.0
	c.bottom_radius = radius
	c.height = height
	c.radial_segments = 12
	c.rings = 1
	return c

static func disc(radius: float, height: float) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = radius
	c.bottom_radius = radius
	c.height = height
	c.radial_segments = 16
	c.rings = 1
	return c

static func ring(inner: float, outer: float) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = inner
	t.outer_radius = outer
	t.rings = 24
	t.ring_segments = 8
	return t

## Floor look of one cell, from the tile value (base_tile) and the room def.
static func cell_floor(kind: String, def: Dictionary) -> String:
	var el := String(def.get("element", ""))
	match kind:
		"green": return el
		"dark": return "dark_" + el
		"light": return "hatch"
	return "floor_" + String(def.get("type", ""))

## KayKit floor tile (2 x 0.15 x 2 m, top at +0.05) fitted to one cell with
## its top at FLOOR_H.
const _TILE_Y := 0.93
const _TILE_TOP := 0.05

## One room: KayKit stone floor tiles tinted by room type (element cells keep
## their flat element colours), stone block walls, and props that say what
## the room does. Positions are local to the room.
static func build_room(def: Dictionary, tile: Array) -> Node3D:
	var root := Node3D.new()
	var batch := {}
	var slab := box_mesh(Vector3(0.96, FLOOR_H, 0.96))
	var tile_s := Vector3(TILE_SCALE, _TILE_Y, TILE_SCALE)
	var tile_y := FLOOR_H - _TILE_TOP * _TILE_Y
	# Foundation block: 2.2 x 2 x 2.2 m, fitted to one cell, WALL_H tall.
	var block_s := Vector3(1.0 / 2.2, WALL_H / 2.0, 1.0 / 2.2)
	for ly in 5:
		for lx in 5:
			var c := Vector3(lx + 0.5 - ROOM / 2.0, 0, -(ly + 0.5 - ROOM / 2.0))
			var p := c + Vector3(0, FLOOR_H / 2.0, 0)
			var kind := String(tile[ly][lx])
			if kind == "wall":
				queue_piece(batch, "floor_foundation_allsides", c, block_s, mat("wall"))
				# Worn stone slab on top, darker than any floor, so a wall top
				# never reads as floor.
				queue_piece(batch, "floor_tile_small", c + Vector3(0, WALL_H - 0.02, 0), Vector3(TILE_SCALE, 0.5, TILE_SCALE), mat("wall_top"), false)
				continue
			var look := cell_floor(kind, def)
			if look == "water":
				# Dark bed under a see-through surface reads as depth.
				add_mesh(root, slab, mat("water_bed"), p + Vector3(0, -0.04, 0), false)
				add_mesh(root, box_mesh(Vector3(0.98, 0.04, 0.98)), mat("water"), p + Vector3(0, 0.1, 0), false)
			elif kind == "light":
				# Toll hatch: a wooden trapdoor with a coin on it.
				queue_piece(batch, "floor_wood_small", c + Vector3(0, tile_y, 0), tile_s, mat("hatch"), false)
				queue_piece(batch, "coin", c + Vector3(0, FLOOR_H + 0.04, 0), Vector3.ONE * 0.9, mat("gold"))
			else:
				queue_piece(batch, "floor_tile_small", c + Vector3(0, tile_y, 0), tile_s, mat(look), false)
	flush(root, batch)
	_add_prop(root, def, tile)
	return root

## A wall cell touching a floor cell, nearest the corner `near` (tile
## coordinates), and the direction into the room: [cell centre, inward].
## inward is ZERO if the room has no such wall.
static func wall_face(tile: Array, near: Vector2) -> Array:
	var best := INF
	var out: Array = [Vector3.ZERO, Vector3.ZERO]
	for ly in 5:
		for lx in 5:
			if String(tile[ly][lx]) != "wall":
				continue
			for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var q: Vector2i = Vector2i(lx, ly) + d
				if q.x < 0 or q.x > 4 or q.y < 0 or q.y > 4 or String(tile[q.y][q.x]) == "wall":
					continue
				var dist := Vector2(lx, ly).distance_to(near) + 0.01 * absf(d.x)
				if dist < best:
					best = dist
					out = [Vector3(lx + 0.5 - ROOM / 2.0, 0, -(ly + 0.5 - ROOM / 2.0)), Vector3(d.x, 0, -d.y)]
	return out

static func _add_prop(root: Node3D, def: Dictionary, tile: Array) -> void:
	var top := FLOOR_H
	match String(def.get("type", "")):
		"A":
			# Spawn: the heroes' door in a wall, and the green ring they appear on.
			var r := add_mesh(root, ring(0.55, 0.75), mat("spawn"), Vector3(0, top + 0.03, 0), false)
			r.scale = Vector3(1, 0.3, 1)
			var face: Array = wall_face(tile, Vector2(4, 4))
			var inward: Vector3 = face[1]
			if inward != Vector3.ZERO:
				var door := add_piece(root, "wall_doorway", (face[0] as Vector3) + inward * 0.5 + Vector3(0, FLOOR_H - 0.02, 0),
					Vector3(0.28, 0.28, 0.28), null, atan2(inward.x, inward.z))
				door.name = "SpawnDoor"
		"Z":
			# Exit: an open iron grate over Zorg's pit, ringed in red.
			add_mesh(root, disc(0.62, 0.02), mat("exit_pit"), Vector3(0, top + 0.005, 0), false)
			add_piece(root, "floor_tile_big_grate_open", Vector3(0, top, 0), Vector3(0.36, 0.2, 0.36), null, 0.0, false)
			var r := add_mesh(root, ring(0.8, 0.98), mat("exit_glow"), Vector3(0, top + 0.04, 0), false)
			r.scale = Vector3(1, 0.4, 1)
		"D":
			add_piece(root, "floor_tile_big_spikes", Vector3(0, top - 0.02, 0), Vector3(0.4, 0.5, 0.4))
		"P":
			# Portal: the glowing ring between two stone pillars.
			for side in [-1.0, 1.0]:
				add_piece(root, "pillar", Vector3(side * 1.2, top - 0.02, 0), Vector3(0.28, 0.34, 0.28))
			var gate := Node3D.new()
			gate.name = "PortalGate"
			gate.position = Vector3(0, top + 1.0, 0)
			root.add_child(gate)
			var r := add_mesh(gate, ring(0.65, 0.82), mat("portal"), Vector3.ZERO)
			r.rotation_degrees.x = 90.0
			var core := add_mesh(gate, disc(0.66, 0.02), mat("portal_core"), Vector3.ZERO, false)
			core.rotation_degrees.x = 90.0

## Gold pile: a KayKit coin stack, shown when the room holds gold.
static func gold_pile() -> Node3D:
	var pile := Node3D.new()
	add_piece(pile, "coin_stack_small", Vector3(0, FLOOR_H, 0), Vector3.ONE * 0.8, mat("gold"))
	return pile

## Hero figure: a KayKit Knight (Warrior) or hooded Rogue (Elf) playing its
## idle loop. Each hero gets its own copies of the materials so one hero can
## flash or fade alone.
static func hero_figure(is_elf: bool) -> Dictionary:
	var root := Node3D.new()
	var body := Node3D.new()
	body.name = "Body"
	root.add_child(body)
	var scene: PackedScene = load(KK + ("adventurers/rogue_hooded.glb" if is_elf else "adventurers/knight.glb"))
	var model: Node3D = scene.instantiate()
	model.name = "Model"
	model.scale = Vector3.ONE * HERO_MODEL_SCALE
	model.position.y = FLOOR_H
	body.add_child(model)
	var mats: Array = []
	var copies := {}
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = node
		for i in mi.mesh.get_surface_count():
			var src: Material = mi.get_active_material(i)
			if not copies.has(src):
				var m: StandardMaterial3D = src.duplicate() if src is StandardMaterial3D else StandardMaterial3D.new()
				m.emission_enabled = true
				m.emission = Color.BLACK
				copies[src] = m
				mats.append(m)
			mi.set_surface_override_material(i, copies[src])
	var anim: AnimationPlayer = model.find_child("AnimationPlayer", true, false)
	if anim and anim.has_animation("Idle"):
		anim.get_animation("Idle").loop_mode = Animation.LOOP_LINEAR
		anim.play("Idle")
		anim.seek(randf() * anim.current_animation_length, true)
	return {"root": root, "body": body, "mats": mats}
