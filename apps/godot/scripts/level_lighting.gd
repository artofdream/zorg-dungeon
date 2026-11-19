class_name ZorgLevelLighting
extends Node
## Sun, world environment, torch budget, flicker, and the 30 FPS quality
## fallback. The level screen passes the sun and the room lights in.
## This node does not read the rules engine (NFR-1).

signal quality_changed(q: String)

var quality := "low"
var env: Environment
var sun: DirectionalLight3D
var _shadows := "1"
var _quality_url := ""
var _torch_timer := 0.0
var _look_time := 0.0
var _perf_frames := 0
var _perf_time := 0.0
var _perf_checked := false

## Configure the existing Level/Sun and add the world environment.
## quality_url and shadows_flag are the web query values (or the fallbacks).
func setup(sun_light: DirectionalLight3D, quality_url: String, shadows_flag: String) -> void:
	sun = sun_light
	_quality_url = quality_url
	_shadows = shadows_flag
	quality = ZorgAtmos.default_quality(quality_url)
	env = ZorgAtmos.environment(quality == "high")
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun.light_color = Color(1.0, 0.94, 0.84)
	sun.light_energy = 0.95
	sun.shadow_blur = 1.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 80.0
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 1.0
	_apply()

func set_quality(q: String, save := true) -> void:
	quality = "high" if q == "high" else "low"
	if save:
		ZorgAtmos.save_quality(quality)
	_apply()
	quality_changed.emit(quality)

func _apply() -> void:
	var high := quality == "high"
	sun.shadow_enabled = high and _shadows != "0"
	ZorgAtmos.set_quality(env, high)
	get_viewport().scaling_3d_scale = 1.0 if high else ZorgAtmos.LOW_3D_SCALE

## Omni lights per quality. Every room's wall torch is first, nearest
## rooms first, then declared extras (braziers). The cap is LOW_LIGHTS or
## HIGH_LIGHTS. On High the nearest HIGH_SHADOWS of that list cast shadows,
## which lands on torches rather than extras.
func refresh(room_nodes: Dictionary, pivot: Vector3) -> void:
	var high := quality == "high"
	var limit := ZorgAtmos.HIGH_LIGHTS if high else ZorgAtmos.LOW_LIGHTS
	var shadows := ZorgAtmos.HIGH_SHADOWS if high and _shadows != "0" else 0
	var ids: Array = room_nodes.keys()
	ids.sort_custom(func(a, b): return room_nodes[a].position.distance_to(pivot) < room_nodes[b].position.distance_to(pivot))
	var queue: Array = []
	for id in ids:
		queue.append(room_nodes[id].get_meta("torch"))
	for id in ids:
		for light in room_nodes[id].get_meta("lights", []):
			if light != room_nodes[id].get_meta("torch"):
				queue.append(light)
	for i in queue.size():
		var light: OmniLight3D = queue[i]
		light.visible = i < limit
		light.shadow_enabled = i < shadows

func torch_lights(room_nodes: Dictionary) -> Array:
	var out: Array = []
	for id in room_nodes:
		out.append(room_nodes[id].get_meta("torch"))
	return out

## Torch budget, flicker, and the slow-device quality drop.
func tick(delta: float, pivot: Vector3, room_nodes: Dictionary) -> void:
	_look_time += delta
	_torch_timer -= delta
	if _torch_timer <= 0.0:
		_torch_timer = 0.5
		refresh(room_nodes, pivot)
	for id in room_nodes:
		for light in room_nodes[id].get_meta("lights", []):
			if (light as OmniLight3D).visible:
				ZorgAtmos.flicker(light, _look_time)
	_perf(delta)

func _perf(delta: float) -> void:
	if _perf_checked:
		return
	_perf_time += delta
	_perf_frames += 1
	if _perf_time < 1.0:
		_perf_frames = 0                     # skip the first second (loading)
		return
	if _perf_time >= 5.0:
		_perf_checked = true
		var fps := _perf_frames / (_perf_time - 1.0)
		if fps < 30.0 and quality == "high" and not ZorgAtmos.forced(_quality_url):
			set_quality("low", false)        # this session only; the saved choice stays
			print("zorg: %.0f FPS on High, switching to Low" % fps)
		elif OS.has_feature("web") and fps < 30.0 and sun.shadow_enabled:
			sun.shadow_enabled = false
			print("zorg: %.0f FPS with shadows, turning them off" % fps)
