class_name ZorgAtmos
extends RefCounted
## Round 9 look: a dark, torch-lit stone dungeon. Environment (dim ambient,
## cool moonlight, fog, glow), a screen vignette, procedural stone noise (the
## empty board) and wall torches with warm flickering OmniLight3Ds. Round 10:
## the torch is a CC0 KayKit wall sconce (see CREDITS.md). Visual only: never
## reads or changes engine state.
##
## Quality "low" (default on phones and the web): at most LOW_LIGHTS torch
## lights, no shadows, no glow. "high" (default on desktop): up to
## HIGH_LIGHTS torch lights, the nearest HIGH_SHADOWS of them cast shadows,
## sun shadows and glow on.

const LOW_LIGHTS := 4
const HIGH_LIGHTS := 10
const HIGH_SHADOWS := 3
const TORCH_COLOR := Color(1.0, 0.62, 0.3)
const TORCH_ENERGY := 2.2
const TORCH_RANGE := 6.5
const SETTINGS := "user://settings.cfg"

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
	env.background_color = Color(0.015, 0.014, 0.02)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.5, 0.55, 0.75)
	env.ambient_light_energy = 0.17
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = Color(0.03, 0.03, 0.045)
	env.fog_density = 0.012
	env.fog_sky_affect = 0.0
	set_quality(env, high)
	return env

static func set_quality(env: Environment, high: bool) -> void:
	env.glow_enabled = high
	env.glow_intensity = 0.6
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.1

## Radial vignette (darker corners) drawn under the HUD.
static func vignette() -> TextureRect:
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0))
	g.add_point(0.55, Color(0, 0, 0, 0))
	g.set_color(g.get_point_count() - 1, Color(0, 0, 0, 0.72))
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
		_normal.bump_strength = 6.0
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
	var light := OmniLight3D.new()
	light.name = "TorchLight"
	light.light_color = TORCH_COLOR
	light.light_energy = TORCH_ENERGY
	light.omni_range = TORCH_RANGE
	light.omni_attenuation = 1.2
	light.shadow_enabled = false
	light.shadow_bias = 0.08
	# In front of the sconce, leaning into the room so it washes the floor.
	light.position = Vector3(0, top + 0.75, 0.3)
	light.visible = false
	light.set_meta("phase", randf() * TAU)
	torch.add_child(light)
	return light

## Warm flicker: two slow sines plus a fast one, per torch phase.
static func flicker(light: OmniLight3D, t: float) -> void:
	var ph: float = light.get_meta("phase", 0.0)
	var f := 0.86 + 0.08 * sin(t * 7.3 + ph) + 0.05 * sin(t * 13.1 + ph * 2.0) + 0.03 * sin(t * 23.7 + ph * 3.0)
	light.light_energy = TORCH_ENERGY * f
