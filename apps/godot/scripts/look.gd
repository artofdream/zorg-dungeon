class_name ZorgLook
extends RefCounted
## Procedural 2.5D look (round 6): shared materials and meshes, room tiles,
## room props and hero figures. Built from Godot primitives only, so there
## are no asset files or licences. Visual only: nothing here reads or changes
## engine state.

const ROOM := 5.0
const WALL_H := 0.7
const FLOOR_H := 0.14

const FLOORS := {
	"A": Color(0.36, 0.62, 0.36), "Z": Color(0.45, 0.1, 0.12), "D": Color(0.72, 0.45, 0.2),
	"E": Color(0.5, 0.5, 0.54), "O": Color(0.62, 0.55, 0.32), "P": Color(0.42, 0.3, 0.58),
	"T": Color(0.45, 0.38, 0.3),
}

static var _mats := {}
static var _meshes := {}

## One shared material per look, so rooms of the same kind share GPU state.
static func mat(key: String) -> StandardMaterial3D:
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.roughness = 0.85
	match key:
		"wall":
			m.albedo_color = Color(0.3, 0.28, 0.26)
		"wall_cap":
			m.albedo_color = Color(0.44, 0.41, 0.37)
		"board_a":
			m.albedo_color = Color(0.17, 0.18, 0.21)
			m.roughness = 1.0
		"board_b":
			m.albedo_color = Color(0.21, 0.22, 0.25)
			m.roughness = 1.0
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
		"ice":
			m.albedo_color = Color(0.86, 0.95, 1.0)
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
			elif key.begins_with("dark_"):
				m.albedo_color = mat(key.substr(5)).albedo_color.darkened(0.3)
				m.emission_enabled = mat(key.substr(5)).emission_enabled
				m.emission = mat(key.substr(5)).emission.darkened(0.3)
	_mats[key] = m
	return m

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

## One room: per-cell floor slabs, low stone walls with a lighter cap, and
## a prop that says what the room does. Positions are local to the room.
static func build_room(def: Dictionary, tile: Array) -> Node3D:
	var root := Node3D.new()
	var slab := box_mesh(Vector3(0.96, FLOOR_H, 0.96))
	for ly in 5:
		for lx in 5:
			var p := Vector3(lx + 0.5 - ROOM / 2.0, FLOOR_H / 2.0, -(ly + 0.5 - ROOM / 2.0))
			var kind := String(tile[ly][lx])
			if kind == "wall":
				add_mesh(root, box_mesh(Vector3(1.0, WALL_H, 1.0)), mat("wall"), p + Vector3(0, WALL_H / 2.0 - FLOOR_H / 2.0, 0))
				add_mesh(root, box_mesh(Vector3(0.9, 0.06, 0.9)), mat("wall_cap"), p + Vector3(0, WALL_H - FLOOR_H / 2.0 + 0.04, 0), false)
				continue
			var look := cell_floor(kind, def)
			if look == "water":
				# Dark bed under a see-through surface reads as depth.
				add_mesh(root, slab, mat("water_bed"), p + Vector3(0, -0.04, 0), false)
				add_mesh(root, box_mesh(Vector3(0.98, 0.04, 0.98)), mat("water"), p + Vector3(0, 0.1, 0), false)
			else:
				add_mesh(root, slab, mat(look), p, false)
			if kind == "light":
				# Toll hatch: a wooden trapdoor with a coin on it.
				add_mesh(root, disc(0.16, 0.05), mat("gold"), p + Vector3(0, FLOOR_H / 2.0 + 0.03, 0))
	_add_prop(root, def)
	return root

static func _add_prop(root: Node3D, def: Dictionary) -> void:
	var top := FLOOR_H
	match String(def.get("type", "")):
		"A":
			var r := add_mesh(root, ring(0.55, 0.75), mat("spawn"), Vector3(0, top + 0.03, 0), false)
			r.scale = Vector3(1, 0.3, 1)
		"Z":
			add_mesh(root, disc(0.8, 0.04), mat("exit_pit"), Vector3(0, top + 0.02, 0), false)
			var r := add_mesh(root, ring(0.8, 0.98), mat("exit_glow"), Vector3(0, top + 0.04, 0), false)
			r.scale = Vector3(1, 0.4, 1)
		"D":
			var spike := cone(0.13, 0.42)
			for o in [Vector3(-0.35, 0, -0.35), Vector3(0.35, 0, -0.35), Vector3(-0.35, 0, 0.35), Vector3(0.35, 0, 0.35), Vector3.ZERO]:
				add_mesh(root, spike, mat("steel"), o + Vector3(0, top + 0.21, 0))
		"P":
			var gate := Node3D.new()
			gate.name = "PortalGate"
			gate.position = Vector3(0, top + 1.0, 0)
			root.add_child(gate)
			var r := add_mesh(gate, ring(0.65, 0.82), mat("portal"), Vector3.ZERO)
			r.rotation_degrees.x = 90.0
			var core := add_mesh(gate, disc(0.66, 0.02), mat("portal_core"), Vector3.ZERO, false)
			core.rotation_degrees.x = 90.0

## Gold pile: a stack of coins, shown when the room holds gold.
static func gold_pile() -> Node3D:
	var pile := Node3D.new()
	var coin := disc(0.22, 0.06)
	var offs := [Vector3(0, 0, 0), Vector3(0.28, 0, 0.1), Vector3(-0.22, 0, 0.2), Vector3(0.05, 0, -0.27), Vector3(0.02, 0.06, 0.02), Vector3(0.2, 0.06, 0.05)]
	for i in offs.size():
		var c := add_mesh(pile, coin, mat("gold"), offs[i] + Vector3(0, FLOOR_H + 0.03, 0))
		c.rotation_degrees = Vector3(float((i * 7) % 13 - 6), i * 37, 0)
	return pile

static func _hero_mat(mats: Array, c: Color, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.metallic = metal
	m.roughness = 0.5 if metal > 0 else 0.8
	m.emission_enabled = true
	m.emission = Color.BLACK
	mats.append(m)
	return m

## Hero figure: capsule body + sphere head, with own materials (so one hero
## can flash or fade alone). Warrior: broad, blue, steel helmet, shield and
## sword. Elf: slim, green, tall pointed hat and ears.
static func hero_figure(is_elf: bool) -> Dictionary:
	var root := Node3D.new()
	var body := Node3D.new()
	body.name = "Body"
	root.add_child(body)
	var mats: Array = []
	var skin := _hero_mat(mats, Color(0.95, 0.78, 0.62))
	var cap := CapsuleMesh.new()
	var head := SphereMesh.new()
	head.radial_segments = 16
	head.rings = 8
	if is_elf:
		cap.radius = 0.17
		cap.height = 0.9
		head.radius = 0.15
		head.height = 0.3
		add_mesh(body, cap, _hero_mat(mats, Color(0.2, 0.62, 0.3)), Vector3(0, 0.45 + FLOOR_H, 0))
		add_mesh(body, head, skin, Vector3(0, 1.02 + FLOOR_H, 0))
		add_mesh(body, cone(0.17, 0.5), _hero_mat(mats, Color(0.1, 0.38, 0.18)), Vector3(0, 1.36 + FLOOR_H, 0))
		for side in [-1.0, 1.0]:
			var ear := add_mesh(body, cone(0.04, 0.16), skin, Vector3(side * 0.15, 1.04 + FLOOR_H, 0), false)
			ear.rotation_degrees.z = -side * 70.0
	else:
		cap.radius = 0.25
		cap.height = 0.8
		head.radius = 0.17
		head.height = 0.34
		var steel: StandardMaterial3D = _hero_mat(mats, Color(0.72, 0.74, 0.78), 0.7)
		add_mesh(body, cap, _hero_mat(mats, Color(0.22, 0.38, 0.85)), Vector3(0, 0.4 + FLOOR_H, 0))
		add_mesh(body, head, skin, Vector3(0, 0.96 + FLOOR_H, 0))
		var helm := SphereMesh.new()
		helm.radius = 0.19
		helm.height = 0.2
		helm.is_hemisphere = true
		add_mesh(body, helm, steel, Vector3(0, 1.0 + FLOOR_H, 0))
		add_mesh(body, box_mesh(Vector3(0.06, 0.42, 0.34)), _hero_mat(mats, Color(0.75, 0.15, 0.15)), Vector3(-0.3, 0.5 + FLOOR_H, 0))
		add_mesh(body, box_mesh(Vector3(0.05, 0.6, 0.05)), steel, Vector3(0.3, 0.62 + FLOOR_H, 0.08))
	return {"root": root, "body": body, "mats": mats}
