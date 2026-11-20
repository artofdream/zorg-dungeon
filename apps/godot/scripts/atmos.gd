class_name ZorgAtmos
extends RefCounted
## Round 9 look: a torch-lit stone dungeon. Environment, a screen vignette,
## procedural stone noise (the empty board) and wall torches with warm
## flickering OmniLight3Ds. Round 10: the torch is a CC0 KayKit wall sconce
## (see CREDITS.md). Visual only: never reads or changes engine state.
##
## The web build (Compatibility) and the phone/desktop build (Mobile) both
## crushed this scene to blue-black: ambient energy 0.17, a cool sun at
## 0.32, filmic tonemap and near-black fog. Measured on level 1.2, an empty
## board tile was about (0.03, 0.04, 0.09) against a black background
## (contrast ~1.07) on both renderers. Torches did work; they were too few
## and too dim to lift the floor. The base light below is what keeps tiles,
## walls and heroes readable where a torch does not reach.
##
## Quality "low" (default on phones and the web): at most LOW_LIGHTS omni
## lights, no shadows, no glow. "high" (default on desktop): up to
## HIGH_LIGHTS omni lights, the nearest HIGH_SHADOWS of them cast shadows,
## sun shadows and glow on. HIGH_LIGHTS stays at 8 because that is the
## Compatibility renderer's default per-object omni cap (the sun is
## separate). Round 10: Low also renders the 3D view at LOW_3D_SCALE of the
## screen resolution (the UI stays at full resolution), because the textured
## models made the phone GPU-bound. Lights stay unshadowed on Low so a
## ROG Phone 2 class GPU is not asked for shadow maps.

const LOW_LIGHTS := 6
const HIGH_LIGHTS := 8
const HIGH_SHADOWS := 3
const LOW_3D_SCALE := 0.75
const TORCH_COLOR := Color(1.0, 0.56, 0.24)
const TORCH_ENERGY := 5.5
const TORCH_RANGE := 6.5
## Dungeon look (cool dark fill, warm torch pools). Ambient stays above
## AMBIENT_MIN: rooms, walls and heroes still read where no torch reaches
## because room floors, runes and walls carry their own glow.
const AMBIENT_ENERGY := 0.36
const AMBIENT_MIN := 0.3
const SETTINGS := "user://settings.cfg"
## Hand-written. godot-golden.mjs never writes this file, and the rules
## engine never reads it.
const LIGHTS_PATH := "res://levels/visual-lights.json"

static var _noise: NoiseTexture2D
static var _normal: NoiseTexture2D

## Saved choice, then `--quality=` (command line) or `?quality=` (web), then
## the platform default.
static func default_quality(url_value: String) -> String:
	if forced(url_value):
		for a in OS.get_cmdline_user_args():
			if a.begins_with("--quality="):
				return _norm(a.substr(10))
		return _norm(url_value)
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS) == OK and cfg.has_section_key("look", "quality"):
		return _norm(String(cfg.get_value("look", "quality")))
	return "low" if OS.has_feature("mobile") or OS.has_feature("web") else "high"

## True when the URL or command line asks for a quality explicitly (then the
## low-FPS fallback leaves it alone).
static func forced(url_value: String) -> bool:
	return url_value != "" or Array(OS.get_cmdline_user_args()).any(func(a): return String(a).begins_with("--quality="))

static func _norm(q: String) -> String:
	return "high" if q.strip_edges().to_lower() == "high" else "low"

static func save_quality(q: String) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS)
	cfg.set_value("look", "quality", q)
	cfg.save(SETTINGS)

static func environment(high: bool) -> Environment:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.006, 0.006, 0.01)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	# Dungeon look: a cool, dim fill so corners away from a torch sit in
	# blue shadow and the warm torch pools carry the scene. Round 9's warm
	# 0.7 fill made the board evenly bright; #112's "too dark" render had
	# no emissive floors at all, which the room glow now covers.
	env.ambient_light_color = Color(0.5, 0.58, 0.8)
	env.ambient_light_energy = AMBIENT_ENERGY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.25
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	# Thin cold haze that deepens to black with distance; the board shader
	# does the fade beyond the dungeon itself.
	env.fog_light_color = Color(0.03, 0.035, 0.055)
	env.fog_density = 0.007
	env.fog_sky_affect = 0.0
	set_quality(env, high)
	return env

static func set_quality(env: Environment, high: bool) -> void:
	env.glow_enabled = high
	env.glow_intensity = 0.7
	env.glow_bloom = 0.06
	env.glow_hdr_threshold = 1.0

## Radial vignette (darker corners) drawn under the HUD.
static func vignette() -> TextureRect:
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0))
	g.add_point(0.42, Color(0, 0, 0, 0))
	g.add_point(0.75, Color(0.0, 0.0, 0.01, 0.42))
	g.set_color(g.get_point_count() - 1, Color(0.0, 0.0, 0.01, 0.8))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.08, 1.08)
	t.width = 256
	t.height = 256
	var r := TextureRect.new()
	r.texture = t
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r

## Shared procedural stone noise (albedo detail + normal map).
static func stone_noise(normal: bool) -> NoiseTexture2D:
	if _noise == null:
		var n := FastNoiseLite.new()
		n.noise_type = FastNoiseLite.TYPE_CELLULAR
		n.frequency = 0.035
		n.fractal_type = FastNoiseLite.FRACTAL_FBM
		n.fractal_octaves = 3
		n.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
		_noise = NoiseTexture2D.new()
		_noise.width = 128
		_noise.height = 128
		_noise.seamless = true
		_noise.noise = n
		var ramp := Gradient.new()
		ramp.set_color(0, Color(0.62, 0.62, 0.62))
		ramp.set_color(1, Color(1, 1, 1))
		_noise.color_ramp = ramp
		_normal = NoiseTexture2D.new()
		_normal.width = 128
		_normal.height = 128
		_normal.seamless = true
		_normal.as_normal_map = true
		# 6.0 pushed floor normals off the sun and mottled the board black.
		_normal.bump_strength = 2.0
		_normal.noise = n
	return _normal if normal else _noise

## Stone look on a material: triplanar noise so any box size tiles evenly.
static func stone(m: StandardMaterial3D, scale: float) -> void:
	m.albedo_texture = stone_noise(false)
	m.normal_enabled = true
	m.normal_texture = stone_noise(true)
	m.normal_scale = 0.6
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3.ONE * scale

## Wall torch for a room: a KayKit wall sconce with an emissive flame on the
## inner face of the wall cell nearest the room's back-left corner that
## touches a floor cell, plus an OmniLight3D leaning into the room. The light
## starts hidden; the level decides which rooms get one (quality limits).
## Returns the light.
const SCONCE_SCALE := 0.8
static func add_torch(root: Node3D, tile: Array) -> OmniLight3D:
	var face: Array = ZorgLook.wall_face(tile, Vector2(0, 4))
	var inward: Vector3 = face[1]
	var torch := Node3D.new()
	torch.name = "Torch"
	root.add_child(torch)
	var p: Vector3 = face[0]
	if inward == Vector3.ZERO:
		p = Vector3(-2.0, 0, -2.0)          # no wall: back-left cell, facing the centre
		inward = (-p).normalized()
	torch.position = p + inward * 0.5
	torch.rotation.y = atan2(inward.x, inward.z)
	# Sconce model: bracket at z = 0 (the wall face), torch head at
	# (0, 0.6, 0.3) in model units.
	var top := ZorgLook.WALL_H
	var sconce_y := top - 0.5
	ZorgLook.add_piece(torch, "torch_mounted", Vector3(0, sconce_y, 0), Vector3.ONE * SCONCE_SCALE, null, 0.0, false)
	var flame := ZorgLook.add_mesh(torch, ZorgLook.cone(0.11, 0.3), ZorgLook.mat("flame"),
		Vector3(0, sconce_y + 0.72 * SCONCE_SCALE + 0.1, 0.31 * SCONCE_SCALE), false)
	flame.name = "Flame"
	var halo := add_halo(torch, Vector3(0, sconce_y + 0.72 * SCONCE_SCALE + 0.12, 0.31 * SCONCE_SCALE), 0.9)
	var light := OmniLight3D.new()
	light.name = "TorchLight"
	light.set_meta("halo", halo)
	light.light_color = TORCH_COLOR
	light.light_energy = TORCH_ENERGY
	light.omni_range = TORCH_RANGE
	light.omni_attenuation = 1.6
	light.shadow_enabled = false
	light.shadow_bias = 0.08
	# In front of the sconce, leaning into the room so it washes the floor.
	light.position = Vector3(0, top + 0.75, 0.3)
	light.visible = false
	light.set_meta("phase", randf() * TAU)
	light.set_meta("base_energy", TORCH_ENERGY)
	torch.add_child(light)
	return light

## Soft additive glow around a flame (one unshaded billboard quad, no
## light): torches still glow on Low where the omni cap switched the
## light itself off.
static var _halo_mat: StandardMaterial3D
static func add_halo(parent: Node3D, pos: Vector3, size: float) -> MeshInstance3D:
	if _halo_mat == null:
		var g := Gradient.new()
		g.set_color(0, Color(1.0, 0.7, 0.35, 0.85))
		g.add_point(0.35, Color(1.0, 0.45, 0.12, 0.35))
		g.set_color(g.get_point_count() - 1, Color(1.0, 0.35, 0.05, 0.0))
		var t := GradientTexture2D.new()
		t.gradient = g
		t.fill = GradientTexture2D.FILL_RADIAL
		t.fill_from = Vector2(0.5, 0.5)
		t.fill_to = Vector2(1.0, 0.5)
		t.width = 64
		t.height = 64
		_halo_mat = StandardMaterial3D.new()
		_halo_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_halo_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_halo_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_halo_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		_halo_mat.albedo_texture = t
		_halo_mat.disable_receive_shadows = true
		_halo_mat.no_depth_test = false
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	var mi := ZorgLook.add_mesh(parent, q, _halo_mat, pos, false)
	mi.name = "Halo"
	return mi

## Warm flicker: two slow sines plus a fast one, per light phase.
## `base_energy` lets a declared brazier flicker around its own energy.
static func flicker(light: OmniLight3D, t: float) -> void:
	var ph: float = light.get_meta("phase", 0.0)
	var base := float(light.get_meta("base_energy", TORCH_ENERGY))
	var f := 0.86 + 0.08 * sin(t * 7.3 + ph) + 0.05 * sin(t * 13.1 + ph * 2.0) + 0.03 * sin(t * 23.7 + ph * 3.0)
	light.light_energy = base * f
	if light.has_meta("halo"):
		(light.get_meta("halo") as Node3D).scale = Vector3.ONE * (0.85 + 0.6 * (f - 0.86))

static var _declared: Dictionary = {}
static var _declared_loaded := false

## Cosmetic lights from LIGHTS_PATH. Missing or unreadable file means no
## extras (every room still has its wall torch). Keys the rules engine
## does not know about.
static func declared_lights() -> Dictionary:
	if not _declared_loaded:
		_declared_loaded = true
		_declared = {"byRoomType": {}, "byRoom": {}}
		if FileAccess.file_exists(LIGHTS_PATH):
			var data = JSON.parse_string(FileAccess.get_file_as_string(LIGHTS_PATH))
			if typeof(data) == TYPE_DICTIONARY:
				_declared = data
	return _declared

## Specs for one room. `byRoom` key is "levelId/roomId" and replaces the
## type list when present, so one level can move a light without a code edit.
static func specs_for(level_id: String, room_id: String, room_type: String) -> Array:
	var data := declared_lights()
	var by_room: Dictionary = data.get("byRoom", {})
	var key := "%s/%s" % [level_id, room_id]
	if by_room.has(key) and by_room[key] is Array:
		return by_room[key]
	var by_type: Dictionary = data.get("byRoomType", {})
	var specs = by_type.get(room_type, [])
	return specs if specs is Array else []

## Build the declared lights for a room. Each entry is
## {kind, at:[x,y,z], color:[r,g,b], energy, range}. "brazier" is a
## procedural bowl and flame (no new art); "omni" is a bare light.
## Lights start hidden; the level turns on as many as the quality cap allows.
static func add_declared(root: Node3D, level_id: String, room_id: String, room_type: String) -> Array:
	var lights: Array = []
	for spec in specs_for(level_id, room_id, room_type):
		if typeof(spec) != TYPE_DICTIONARY:
			continue
		var at: Array = spec.get("at", [0, 0, 0])
		var pos := Vector3(float(at[0]) if at.size() > 0 else 0.0, float(at[1]) if at.size() > 1 else 0.0, float(at[2]) if at.size() > 2 else 0.0)
		var kind := String(spec.get("kind", "omni"))
		var node := Node3D.new()
		node.name = "Brazier" if kind == "brazier" else "ExtraLight"
		node.position = pos
		root.add_child(node)
		if kind == "brazier":
			ZorgLook.add_mesh(node, ZorgLook.disc(0.28, 0.14), ZorgLook.mat("hatch"), Vector3(0, ZorgLook.FLOOR_H + 0.07, 0), false)
			var flame := ZorgLook.add_mesh(node, ZorgLook.cone(0.12, 0.28), ZorgLook.mat("flame"), Vector3(0, ZorgLook.FLOOR_H + 0.3, 0), false)
			flame.name = "Flame"
			node.set_meta("halo", add_halo(node, Vector3(0, ZorgLook.FLOOR_H + 0.32, 0), 1.1))
		var light := OmniLight3D.new()
		light.name = "Light"
		light.light_color = _color3(spec.get("color"), TORCH_COLOR)
		light.light_energy = float(spec.get("energy", 2.2))
		light.omni_range = float(spec.get("range", 4.2))
		light.omni_attenuation = 1.3
		light.shadow_enabled = false
		light.position = Vector3(0, ZorgLook.FLOOR_H + 0.7, 0)
		light.visible = false
		light.set_meta("phase", randf() * TAU)
		light.set_meta("base_energy", light.light_energy)
		if node.has_meta("halo"):
			light.set_meta("halo", node.get_meta("halo"))
		node.add_child(light)
		lights.append(light)
	return lights

static func _color3(v, fallback: Color) -> Color:
	if typeof(v) != TYPE_ARRAY or v.size() < 3:
		return fallback
	return Color(float(v[0]), float(v[1]), float(v[2]))
