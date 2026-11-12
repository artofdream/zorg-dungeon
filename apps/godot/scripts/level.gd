extends Node3D
## Level screen: build the dungeon (tap/drag rooms), then Play/Step a replay
## of the engine's recording. Plain boxes on purpose (milestone 1).

const ROOM := 5.0                     # cells per room side; 1 cell = 1 unit
const SLOTS_X := Vector2i(-1, 6)      # room-grid slots shown on the board
const SLOTS_Y := Vector2i(-2, 2)
const COLORS := {"A": Color(0.3, 0.75, 0.35), "Z": Color(0.85, 0.2, 0.2), "D": Color(0.95, 0.6, 0.15)}
const STEP_SECONDS := 0.18

@onready var engine: Node = $Engine
@onready var board: Node3D = $Board
@onready var rooms_root: Node3D = $Rooms
@onready var heroes: Node3D = $Heroes
@onready var rig: Node3D = $CameraRig
@onready var camera: Camera3D = $CameraRig/Camera3D
@onready var ui: CanvasLayer = $UI

var placed := {}          # room id -> {x, y}
var room_nodes := {}      # room id -> Node3D
var selected := ""        # room id waiting for a tap on the board
var dragging := ""        # placed room being dragged
var drag_moved := false
var press_pos := Vector2.ZERO

var recording: Dictionary = {}
var turn_index := 0
var playing := false
var play_timer := 0.0

# camera
var yaw := 45.0
var target_yaw := 45.0
var zoom := 24.0
var touches := {}
var pinch_start := 0.0
var zoom_start := 0.0

# ui
var tray: HBoxContainer
var status: Label
var result: Label
var log_label: Label
var play_btn: Button
var step_btn: Button
var reset_btn: Button

func _ready() -> void:
	var err: String = engine.load_default_level()
	_build_ui()
	if err != "":
		status.text = "Cannot load level: " + err
		return
	_build_board()
	_refresh_tray()
	_refresh_validation()
	rig.position = Vector3(12.5, 0, -2.5)
	_update_camera(true)

# ------------------------------------------------------------------ UI

func _btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(96, 64)   # >= 48 dp at mobile densities
	b.add_theme_font_size_override("font_size", 24)
	b.pressed.connect(cb)
	return b

func _build_ui() -> void:
	var top := VBoxContainer.new()
	top.position = Vector2(16, 12)
	ui.add_child(top)
	var title := Label.new()
	title.add_theme_font_size_override("font_size", 26)
	title.text = engine.level_name() if engine.loaded.get("ok", false) else "Zorg"
	top.add_child(title)
	if engine.loaded.get("ok", false):
		var goal := Label.new()
		goal.add_theme_font_size_override("font_size", 20)
		goal.text = "Goal: every hero dies before Zorg's room.  Rule: " + ", ".join(engine.constraint_texts())
		top.add_child(goal)
	status = Label.new()
	status.add_theme_font_size_override("font_size", 20)
	top.add_child(status)
	result = Label.new()
	result.add_theme_font_size_override("font_size", 30)
	top.add_child(result)
	log_label = Label.new()
	log_label.add_theme_font_size_override("font_size", 18)
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	log_label.custom_minimum_size = Vector2(700, 0)
	top.add_child(log_label)

	var bottom := HBoxContainer.new()
	bottom.anchor_top = 1.0
	bottom.anchor_bottom = 1.0
	bottom.anchor_right = 1.0
	bottom.offset_top = -84
	bottom.offset_left = 16
	bottom.offset_right = -16
	bottom.add_theme_constant_override("separation", 12)
	ui.add_child(bottom)
	tray = HBoxContainer.new()
	tray.add_theme_constant_override("separation", 8)
	tray.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(tray)
	bottom.add_child(_btn("⟲ 90°", func(): target_yaw -= 90.0))
	bottom.add_child(_btn("⟳ 90°", func(): target_yaw += 90.0))
	play_btn = _btn("Play", _on_play)
	step_btn = _btn("Step", _on_step)
	reset_btn = _btn("Build", _on_reset)
	bottom.add_child(play_btn)
	bottom.add_child(step_btn)
	bottom.add_child(reset_btn)

func _label_for(def: Dictionary) -> String:
	return "D(%d)" % int(def["damage"]) if def["type"] == "D" else String(def["type"])

func _refresh_tray() -> void:
	for c in tray.get_children():
		c.queue_free()
	for s in engine.supplied():
		if placed.has(s["id"]):
			continue
		var id: String = s["id"]
		var b := _btn(_label_for(s["def"]), func(): _select(id))
		b.toggle_mode = true
		b.button_pressed = selected == id
		tray.add_child(b)

func _select(id: String) -> void:
	selected = "" if selected == id else id
	_refresh_tray()

func _building() -> bool:
	return recording.is_empty()

func _layout() -> Array:
	var out: Array = []
	for s in engine.supplied():
		if placed.has(s["id"]):
			out.append(ZorgEngine.make_room(s, placed[s["id"]].x, placed[s["id"]].y, 0))
	return out

func _refresh_validation() -> void:
	var report: Dictionary = engine.validate(_layout())
	var words := {"missing": "place every room", "overlap": "rooms overlap", "disconnected": "rooms must touch side by side",
		"diagonal_only": "diagonals don't connect", "no_spawn": "needs the A room", "no_zorg": "needs the Z room",
		"edge_mismatch": "walls don't line up", "orientation": "rooms must face the same way"}
	var seen := {}
	var parts: Array = []
	for c in report["codes"]:
		if not seen.has(c):
			seen[c] = true
			parts.append(words.get(c, c))
	status.text = "Ready to play." if report["ok"] else "Build: " + ", ".join(parts) + "."
	play_btn.disabled = not report["ok"] and _building()
	step_btn.disabled = play_btn.disabled
	for id in room_nodes:
		var bad := false
		for i in report["issues"]:
			if (i["roomIds"] as Array).has(id) and i["code"] != "missing":
				bad = true
		(room_nodes[id].get_meta("floor_mat") as StandardMaterial3D).emission_enabled = bad
		(room_nodes[id].get_meta("floor_mat") as StandardMaterial3D).emission = Color(1, 0, 0)

# ------------------------------------------------------------------ 3D

func _box(size: Vector3, color: Color, pos: Vector3, parent: Node3D) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	m.mesh = bm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	m.material_override = mat
	m.position = pos
	parent.add_child(m)
	return m

static func slot_center(x: int, y: int) -> Vector3:
	return Vector3(x * ROOM + ROOM / 2.0, 0, -(y * ROOM + ROOM / 2.0))

func _build_board() -> void:
	for x in range(SLOTS_X.x, SLOTS_X.y + 1):
		for y in range(SLOTS_Y.x, SLOTS_Y.y + 1):
			var shade := 0.22 if (x + y) % 2 == 0 else 0.27
			_box(Vector3(ROOM - 0.1, 0.1, ROOM - 0.1), Color(shade, shade, shade + 0.03), slot_center(x, y) + Vector3(0, -0.1, 0), board)

func _room_node(s: Dictionary) -> Node3D:
	var root := Node3D.new()
	var tile := ZorgEngine.default_tile()
	var color: Color = COLORS.get(s["def"]["type"], Color.GRAY)
	var floor_mat := StandardMaterial3D.new()
	floor_mat.albedo_color = color
	for ly in 5:
		for lx in 5:
			var p := Vector3(lx + 0.5 - ROOM / 2.0, 0, -(ly + 0.5 - ROOM / 2.0))
			if tile[ly][lx] == "wall":
				_box(Vector3(0.95, 1.0, 0.95), Color(0.55, 0.5, 0.45), p + Vector3(0, 0.5, 0), root)
			else:
				var f := _box(Vector3(0.95, 0.1, 0.95), color, p, root)
				f.material_override = floor_mat
	var label := Label3D.new()
	label.text = _label_for(s["def"])
	label.font_size = 96
	label.pixel_size = 0.02
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position.y = 2.2
	label.outline_size = 24
	root.add_child(label)
	root.set_meta("floor_mat", floor_mat)
	rooms_root.add_child(root)
	return root

func _place(id: String, slot: Vector2i) -> void:
	var s: Dictionary = {}
	for x in engine.supplied():
		if x["id"] == id:
			s = x
	placed[id] = slot
	if not room_nodes.has(id):
		room_nodes[id] = _room_node(s)
	room_nodes[id].position = slot_center(slot.x, slot.y)
	_refresh_tray()
	_refresh_validation()

func _unplace(id: String) -> void:
	placed.erase(id)
	if room_nodes.has(id):
		room_nodes[id].queue_free()
		room_nodes.erase(id)
	_refresh_tray()
	_refresh_validation()

func _screen_to_slot(pos: Vector2) -> Variant:
	var origin := camera.project_ray_origin(pos)
	var dir := camera.project_ray_normal(pos)
	if absf(dir.y) < 0.0001:
		return null
	var t := -origin.y / dir.y
	if t < 0:
		return null
	var hit := origin + dir * t
	var slot := Vector2i(floori(hit.x / ROOM), floori(-hit.z / ROOM))
	if slot.x < SLOTS_X.x or slot.x > SLOTS_X.y or slot.y < SLOTS_Y.x or slot.y > SLOTS_Y.y:
		return null
	return slot

func _room_at_slot(slot: Vector2i) -> String:
	for id in placed:
		if placed[id] == slot:
			return id
	return ""

# ------------------------------------------------------------------ input

func _unhandled_input(event: InputEvent) -> void:
	# Fingers: two-finger pinch zoom + pan. One finger arrives as emulated mouse.
	if event is InputEventScreenTouch:
		if event.pressed:
			touches[event.index] = event.position
		else:
			touches.erase(event.index)
		if touches.size() == 2:
			var pts := touches.values()
			pinch_start = (pts[0] as Vector2).distance_to(pts[1])
			zoom_start = zoom
			dragging = ""
		return
	if event is InputEventScreenDrag:
		if touches.size() >= 2 and touches.has(event.index):
			var before: Vector2 = touches[event.index]
			touches[event.index] = event.position
			var pts := touches.values()
			var d := (pts[0] as Vector2).distance_to(pts[1])
			if pinch_start > 0:
				zoom = clampf(zoom_start * pinch_start / maxf(d, 1.0), 12.0, 70.0)
			_pan((event.position - before) * 0.5)
			_update_camera(false)
		elif touches.has(event.index):
			touches[event.index] = event.position
		return
	if touches.size() >= 2:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			zoom = clampf(zoom - 2.0, 12.0, 70.0)
			_update_camera(false)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			zoom = clampf(zoom + 2.0, 12.0, 70.0)
			_update_camera(false)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_on_press(event.position)
			else:
				_on_release(event.position)
	elif event is InputEventMouseMotion:
		if event.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE):
			_pan(event.relative)
			_update_camera(false)
		elif dragging != "" and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
			if event.position.distance_to(press_pos) > 12:
				drag_moved = true
			var slot = _screen_to_slot(event.position)
			if slot != null:
				room_nodes[dragging].position = slot_center(slot.x, slot.y) + Vector3(0, 0.6, 0)
	elif event is InputEventKey and event.pressed:
		if event.keycode == KEY_Q:
			target_yaw -= 90.0
		elif event.keycode == KEY_E:
			target_yaw += 90.0
		elif event.keycode == KEY_SPACE:
			_on_step()

func _on_press(pos: Vector2) -> void:
	press_pos = pos
	drag_moved = false
	if not _building():
		return
	var slot = _screen_to_slot(pos)
	if slot == null:
		return
	var here := _room_at_slot(slot)
	if here != "" and selected == "":
		dragging = here

func _on_release(pos: Vector2) -> void:
	if not _building():
		return
	var slot = _screen_to_slot(pos)
	if dragging != "":
		var id := dragging
		dragging = ""
		if not drag_moved:
			_unplace(id)            # tap a placed room: back to the tray
		elif slot == null:
			_unplace(id)
		else:
			_place(id, slot)
		return
	if selected != "" and slot != null:
		var id := selected
		selected = ""
		_place(id, slot)

func _pan(delta_px: Vector2) -> void:
	var scale := zoom / 600.0
	var right := Vector3(cos(deg_to_rad(yaw)), 0, -sin(deg_to_rad(yaw)))
	var fwd := Vector3(-sin(deg_to_rad(yaw)), 0, -cos(deg_to_rad(yaw)))
	rig.position -= right * delta_px.x * scale
	rig.position += fwd * delta_px.y * scale

func _update_camera(_snap: bool) -> void:
	rig.rotation_degrees.y = yaw
	camera.position = Vector3(0, zoom * 0.8, zoom * 0.6)
	camera.look_at(rig.global_position, Vector3.UP)

func _process(delta: float) -> void:
	if absf(target_yaw - yaw) > 0.01:
		yaw = move_toward(yaw, target_yaw, delta * 360.0)
		_update_camera(false)
	if playing:
		play_timer -= delta
		if play_timer <= 0:
			play_timer = STEP_SECONDS
			if not _advance():
				playing = false

# ------------------------------------------------------------------ play

func _ensure_recording() -> bool:
	if not recording.is_empty():
		return true
	var r: Dictionary = engine.run(_layout())
	if r.has("error"):
		status.text = r["error"]
		return false
	recording = r
	turn_index = 0
	heroes.clear()
	selected = ""
	_refresh_tray()
	tray.visible = false
	status.text = "Extermination: %d turns recorded by the engine." % recording["turns"].size()
	return true

func _advance() -> bool:
	if turn_index >= recording["turns"].size():
		return false
	var events: Array = recording["turns"][turn_index]
	turn_index += 1
	var line: String = heroes.apply_turn(events)
	for e in events:
		if e["type"] == "spawn":
			var hp := int(engine.loaded["level"]["heroes"][int(e["heroId"])]["hp"])
			heroes.set_start_hp(int(e["heroId"]), hp)
	log_label.text = "Turn %d: %s" % [turn_index, line]
	if turn_index >= recording["turns"].size():
		_show_result()
		return false
	return true

func _show_result() -> void:
	var sc: Dictionary = recording["score"]
	match String(sc["outcome"]):
		"win":
			result.text = "You win! Every hero died and the rule holds."
		"loss":
			result.text = "You lose: a hero reached Zorg."
		_:
			var failed: Array = []
			for c in sc["constraints"]:
				if c["status"] != "held":
					failed.append("%s (%s)" % [c["id"], c["status"]])
			result.text = "Not won yet: rule not met " + ", ".join(failed) if not failed.is_empty() else "Not won yet."

func _on_play() -> void:
	if _ensure_recording():
		playing = not playing
		play_timer = 0.0
		play_btn.text = "Pause" if playing else "Play"

func _on_step() -> void:
	if _ensure_recording():
		playing = false
		play_btn.text = "Play"
		_advance()

func _on_reset() -> void:
	recording = {}
	playing = false
	play_btn.text = "Play"
	heroes.clear()
	result.text = ""
	log_label.text = ""
	tray.visible = true
	_refresh_tray()
	_refresh_validation()
