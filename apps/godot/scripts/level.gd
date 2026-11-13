extends Node3D
## Level screen: pick a level, build the dungeon (tap or drag rooms, with a
## green/orange/red ghost preview), then Play/Step the engine one action at
## a time and cast spells from the spell bar between actions (FR-33).
## Round 6 look: procedural 2.5D tiles and figures (look.gd), one sun with
## soft shadows plus ambient light, smooth zoom / tilt / rotation. Visual
## only: the engine and its parity tests don't see any of it.

const ROOM := 5.0                     # cells per room side; 1 cell = 1 unit
const SLOTS_X := Vector2i(-1, 6)      # room-grid slots shown on the board
const SLOTS_Y := Vector2i(-2, 3)
const GHOST_OK := Color(0.2, 1.0, 0.3, 0.45)
const GHOST_LOOSE := Color(1.0, 0.6, 0.1, 0.5)   # allowed, but touches no placed room yet
const GHOST_BAD := Color(1.0, 0.1, 0.1, 0.6)
const STEP_SECONDS := 0.18
const ZOOM_LIMITS := Vector2(12.0, 70.0)
const PITCH_LIMITS := Vector2(30.0, 80.0)   # degrees above the board
const CAM_SMOOTH := 12.0                    # 1/s, exponential ease for zoom and tilt
const DRAG_START_PX := 12.0

@onready var engine: Node = $Engine
@onready var board: Node3D = $Board
@onready var rooms_root: Node3D = $Rooms
@onready var heroes: Node3D = $Heroes
@onready var rig: Node3D = $CameraRig
@onready var camera: Camera3D = $CameraRig/Camera3D
@onready var ui: CanvasLayer = $UI

var level_index := 0
var placed := {}          # room id -> Vector2i slot
var room_nodes := {}      # room id -> Node3D
var selected := ""        # tray room waiting for a tap on the board

# One drag at a time, from the tray or from the board.
var drag_id := ""
var drag_from_tray := false
var drag_active := false
var drag_origin := Vector2.ZERO
var ghost: MeshInstance3D
var ghost_mat: StandardMaterial3D

var recording: Dictionary = {}   # {"turns": [...]} once a run has started
var turn_index := 0
var playing := false
var play_timer := 0.0

# camera
var yaw := 45.0
var target_yaw := 45.0
var zoom := 24.0
var target_zoom := 24.0
var pitch := 53.13               # atan(0.8 / 0.6): the round 1-5 angle
var target_pitch := 53.13
var yaw_tween: Tween
var fps_label: Label
var perf_frames := 0
var perf_time := 0.0
var perf_checked := false
var touches := {}
var pinch_start := 0.0
var zoom_start := 0.0
var cam_tween: Tween

# ui
var title: Label
var goal: Label
var picker: GridContainer
var tray: HBoxContainer
var status: Label
var result: Label
var log_label: Label
var play_btn: Button
var step_btn: Button
var spell_bar: HBoxContainer
const REFUSALS := {"before_first_action": "wait for the first hero action", "run_over": "the run is over",
	"no_active_hero": "no hero is active", "consumed": "that spell is used up", "no_spell": "no such spell"}

func _ready() -> void:
	_setup_lighting()
	_build_ui()
	_build_board()
	_build_ghost()
	var err: String = engine.load_index()
	if err != "":
		status.text = err
		return
	_build_picker()
	_open_level(0)

# ------------------------------------------------------------------ levels

func _open_level(i: int) -> void:
	level_index = i
	_on_reset()
	for id in room_nodes:
		room_nodes[id].queue_free()
	room_nodes.clear()
	placed.clear()
	selected = ""
	var err: String = engine.load_level_file(engine.levels[i]["file"])
	if err != "":
		title.text = "Cannot load level"
		status.text = err
		tray.visible = false
		return
	title.text = engine.level_name()
	var rules: Array = engine.constraint_texts()
	goal.text = "Goal: every hero dies before reaching Zorg's room." + ("" if rules.is_empty() else "  Rule: " + ", ".join(rules))
	for b in picker.get_children():
		b.modulate = Color(1, 1, 0.5) if b.get_index() == i else Color.WHITE
	_refresh_tray()
	_refresh_validation()
	_refresh_spells()
	_snap_camera()

func _build_picker() -> void:
	for i in engine.levels.size():
		var idx: int = i
		var e: Dictionary = engine.levels[i]
		var b := _btn(String(e["id"]).replace("deluxe-", ""), func(): _open_level(idx))
		b.custom_minimum_size = Vector2(78, 56)
		b.tooltip_text = String(e["name"])
		picker.add_child(b)

# ------------------------------------------------------------------ UI

func _btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(96, 64)   # >= 48 dp at mobile densities
	b.add_theme_font_size_override("font_size", 24)
	b.pressed.connect(cb)
	return b

func _label(size: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	return l

func _build_ui() -> void:
	var top := VBoxContainer.new()
	top.position = Vector2(16, 12)
	ui.add_child(top)
	title = _label(26)
	top.add_child(title)
	goal = _label(20)
	goal.autowrap_mode = TextServer.AUTOWRAP_WORD
	goal.custom_minimum_size = Vector2(560, 0)   # stays clear of the level picker
	top.add_child(goal)
	status = _label(20)
	top.add_child(status)
	result = _label(30)
	top.add_child(result)
	log_label = _label(18)
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	log_label.custom_minimum_size = Vector2(700, 0)
	top.add_child(log_label)

	picker = GridContainer.new()
	picker.columns = 5
	picker.anchor_left = 1.0
	picker.anchor_right = 1.0
	picker.offset_left = -436
	picker.offset_top = 12
	picker.offset_right = -16
	picker.add_theme_constant_override("h_separation", 6)
	picker.add_theme_constant_override("v_separation", 6)
	ui.add_child(picker)

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
	# Plain ASCII arrows: the web build's default font has no ⟲/⟳ glyphs.
	bottom.add_child(_btn("< 90°", func(): _rotate(-90.0)))
	bottom.add_child(_btn("90° >", func(): _rotate(90.0)))
	play_btn = _btn("Play", _on_play)
	step_btn = _btn("Step", _on_step)
	bottom.add_child(play_btn)
	bottom.add_child(step_btn)
	bottom.add_child(_btn("Build", _on_reset))

	# Spell bar (FR-32/FR-33): one button per spell, usable by tap or mouse,
	# enabled only between completed actions while the run is going.
	spell_bar = HBoxContainer.new()
	spell_bar.anchor_top = 1.0
	spell_bar.anchor_bottom = 1.0
	spell_bar.anchor_left = 1.0
	spell_bar.anchor_right = 1.0
	spell_bar.offset_top = -160
	spell_bar.offset_bottom = -92
	spell_bar.offset_left = -700
	spell_bar.offset_right = -16
	spell_bar.alignment = BoxContainer.ALIGNMENT_END
	spell_bar.add_theme_constant_override("separation", 8)
	ui.add_child(spell_bar)

	# Camera tilt for touch screens (mouse: Ctrl + wheel or middle-drag; keys W/S).
	var cam_bar := VBoxContainer.new()
	cam_bar.anchor_left = 1.0
	cam_bar.anchor_right = 1.0
	cam_bar.anchor_top = 0.5
	cam_bar.anchor_bottom = 0.5
	cam_bar.offset_left = -100
	cam_bar.offset_right = -16
	cam_bar.offset_top = -60
	cam_bar.offset_bottom = 60
	cam_bar.add_theme_constant_override("separation", 8)
	ui.add_child(cam_bar)
	for spec in [["Tilt +", 8.0], ["Tilt -", -8.0]]:
		var amount: float = spec[1]
		var tb := _btn(spec[0], func(): _tilt_by(amount))
		tb.custom_minimum_size = Vector2(84, 52)
		tb.add_theme_font_size_override("font_size", 20)
		cam_bar.add_child(tb)

	fps_label = _label(18)
	fps_label.anchor_left = 1.0
	fps_label.anchor_right = 1.0
	fps_label.offset_left = -436
	fps_label.offset_top = 196
	fps_label.visible = _url_flag("fps", "0") == "1"
	ui.add_child(fps_label)

func _spell_label(def: Dictionary) -> String:
	match String(def["type"]):
		"Attack": return "Attack(%d)" % int(def["damage"])
		"Teleport": return "Teleport(%d)" % int(def["steps"])
	return String(def["type"])

func _refresh_spells() -> void:
	for c in spell_bar.get_children():
		c.queue_free()
	var list: Array = engine.spells()
	var allowed: bool = engine.can_cast()
	for i in list.size():
		var idx: int = i
		var sp: Dictionary = list[i]
		var b := _btn(_spell_label(sp["def"]), func(): cast_spell(idx))
		b.custom_minimum_size = Vector2(150, 64)
		b.disabled = sp["consumed"] or not allowed
		if sp["consumed"]:
			b.text += " (used)"  # ASCII: the web build has no system font fallback
		spell_bar.add_child(b)

## Cast spell `id` now (between actions). Public so the smoke test can use it.
func cast_spell(id: int) -> bool:
	if not _ensure_recording():
		return false
	playing = false
	play_btn.text = "Play"
	var r: Dictionary = engine.cast(id)
	if not r["ok"]:
		status.text = "Can't cast now: %s." % REFUSALS.get(r["error"], r["error"])
		_refresh_spells()
		return false
	recording["turns"].append(r["events"])
	turn_index += 1
	log_label.text = "Turn %d: %s" % [turn_index, heroes.apply_turn(r["events"])]
	_refresh_piles()
	_refresh_spells()
	if engine.over():
		_show_result()
	return true

func _label_for(def: Dictionary) -> String:
	match String(def["type"]):
		"D": return "D(%d)" % int(def["damage"])
		"E": return "E(%s)" % String(def["element"])
		"O": return "O(%d)" % int(def["gold"])
		"P": return "P(%d, %s)" % [int(def["entries"]), String(def["formula"]).replace("↦", "->")]
		"T": return "T(%d, %s)" % [int(def["cost"]), String(def["element"])]
	return String(def["type"])

## Gold lying in each placed room, shown on its label while a run is going.
func _refresh_piles() -> void:
	var piles: Dictionary = engine.room_gold()
	for id in room_nodes:
		var label: Label3D = room_nodes[id].get_meta("label")
		var base := _label_for(_supplied(id)["def"])
		var n := int(piles.get(id, 0))
		label.text = base + ("  $%d" % n if n > 0 and not _building() else "")
		# Coin stack: the O room's own gold while building, live piles in a run.
		var def: Dictionary = _supplied(id)["def"]
		var shown := n if not _building() else (int(def.get("gold", 0)) if String(def["type"]) == "O" else 0)
		var pile: Node3D = room_nodes[id].get_meta("pile")
		pile.visible = shown > 0
		pile.scale = Vector3.ONE * clampf(0.8 + 0.2 * shown, 0.8, 1.6)

func _supplied(id: String) -> Dictionary:
	for s in engine.supplied():
		if s["id"] == id:
			return s
	return {}

## Tray buttons react on press (not release) so one finger can drag a room
## straight out of the tray; a press + release without moving is a tap.
func _refresh_tray() -> void:
	for c in tray.get_children():
		c.queue_free()
	for s in engine.supplied():
		if placed.has(s["id"]):
			continue
		var id: String = s["id"]
		var b := Button.new()
		b.text = _label_for(s["def"])
		b.custom_minimum_size = Vector2(96, 64)
		b.add_theme_font_size_override("font_size", 24)
		b.modulate = Color(1, 1, 0.5) if selected == id else Color.WHITE
		b.button_down.connect(func(): _begin_drag(id, true, get_viewport().get_mouse_position()))
		tray.add_child(b)

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
	if _building():
		status.text = "Ready to play." if report["ok"] else "Build: " + ", ".join(parts) + "."
	play_btn.disabled = not report["ok"] and _building()
	step_btn.disabled = play_btn.disabled

# ------------------------------------------------------------------ 3D

static func slot_center(x: int, y: int) -> Vector3:
	return Vector3(x * ROOM + ROOM / 2.0, 0, -(y * ROOM + ROOM / 2.0))

func _build_board() -> void:
	for x in range(SLOTS_X.x, SLOTS_X.y + 1):
		for y in range(SLOTS_Y.x, SLOTS_Y.y + 1):
			var m := ZorgLook.mat("board_a" if (x + y) % 2 == 0 else "board_b")
			ZorgLook.add_mesh(board, ZorgLook.box_mesh(Vector3(ROOM - 0.1, 0.1, ROOM - 0.1)), m, slot_center(x, y) + Vector3(0, -0.1, 0), false)

func _build_ghost() -> void:
	ghost = MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(ROOM - 0.2, 0.4, ROOM - 0.2)
	ghost.mesh = bm
	ghost_mat = StandardMaterial3D.new()
	ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ghost.material_override = ghost_mat
	ghost.visible = false
	add_child(ghost)

func _room_node(s: Dictionary) -> Node3D:
	var root := ZorgLook.build_room(s["def"], ZorgEngine.base_tile(s["def"]))
	var pile := ZorgLook.gold_pile()
	pile.visible = false
	root.add_child(pile)
	root.set_meta("pile", pile)
	var label := Label3D.new()
	label.text = _label_for(s["def"])
	label.font_size = 96
	label.pixel_size = 0.015
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position.y = 2.2
	label.outline_size = 24
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(label)
	root.set_meta("label", label)
	rooms_root.add_child(root)
	return root

func _place(id: String, slot: Vector2i) -> void:
	placed[id] = slot
	if not room_nodes.has(id):
		room_nodes[id] = _room_node(_supplied(id))
	room_nodes[id].position = slot_center(slot.x, slot.y)
	_refresh_tray()
	_refresh_validation()
	_refresh_piles()

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
	return Vector2i(floori(hit.x / ROOM), floori(-hit.z / ROOM))

func _in_board(slot: Vector2i) -> bool:
	return slot.x >= SLOTS_X.x and slot.x <= SLOTS_X.y and slot.y >= SLOTS_Y.x and slot.y <= SLOTS_Y.y

func _room_at_slot(slot: Vector2i) -> String:
	for id in placed:
		if placed[id] == slot:
			return id
	return ""

## A spot is allowed when it is on the board and no other room is there
## (FR-5 no overlaps). Connectivity is shown by the status line instead,
## because building can pass through disconnected states.
func spot_allowed(id: String, slot: Variant) -> bool:
	if slot == null or not _in_board(slot):
		return false
	var other := _room_at_slot(slot)
	return other == "" or other == id

## True when other rooms are placed and none shares a side with `slot`
## (FR-5 would flag the layout as disconnected). Still droppable.
func spot_loose(id: String, slot: Vector2i) -> bool:
	var others := 0
	for other in placed:
		if other == id:
			continue
		others += 1
		var d: Vector2i = placed[other] - slot
		if absi(d.x) + absi(d.y) == 1:
			return false
	return others > 0

func _show_ghost(id: String, screen_pos: Vector2) -> void:
	var slot = _screen_to_slot(screen_pos)
	if slot == null:
		ghost.visible = false
		return
	var ok := spot_allowed(id, slot)
	var loose := ok and spot_loose(id, slot)
	ghost.visible = true
	ghost.position = slot_center(slot.x, slot.y) + Vector3(0, 0.3, 0)
	ghost_mat.albedo_color = GHOST_BAD if not ok else (GHOST_LOOSE if loose else GHOST_OK)
	var label := _label_for(_supplied(id)["def"])
	if not ok:
		status.text = "Can't place here: %s." % ("off the board" if not _in_board(slot) else "another room is there")
	elif loose:
		status.text = "%s here would not touch any room yet." % label
	else:
		status.text = "Drop %s here." % label

# ------------------------------------------------------------------ input

func _begin_drag(id: String, from_tray: bool, pos: Vector2) -> void:
	if not _building():
		return
	drag_id = id
	drag_from_tray = from_tray
	drag_active = false
	drag_origin = pos

## Drop (or tap) at `pos`. Public so the smoke test can drive it.
func end_drag(pos: Vector2) -> void:
	var id := drag_id
	drag_id = ""
	ghost.visible = false
	if id == "":
		return
	if not drag_active:
		if drag_from_tray:
			selected = "" if selected == id else id
			_refresh_tray()
		else:
			_unplace(id)                     # tap a placed room: back to the tray
		return
	var slot = _screen_to_slot(pos)
	if spot_allowed(id, slot):
		_place(id, slot)
	elif drag_from_tray:
		_refresh_validation()                # red spot: room stays in the tray
	else:
		_place(id, placed[id])               # red spot: snap back
	drag_active = false

func drag_to(pos: Vector2) -> void:
	if drag_id == "":
		return
	if not drag_active and pos.distance_to(drag_origin) > DRAG_START_PX:
		drag_active = true
		selected = ""
	if drag_active:
		_show_ghost(drag_id, pos)
		if not drag_from_tray and room_nodes.has(drag_id):
			var slot = _screen_to_slot(pos)
			if slot != null:
				room_nodes[drag_id].position = slot_center(slot.x, slot.y) + Vector3(0, 0.8, 0)

## Drag motion/release must be seen even when the press began on a tray
## Button, so it is handled here before the GUI.
func _input(event: InputEvent) -> void:
	if drag_id == "" or touches.size() >= 2:
		return
	if event is InputEventMouseMotion:
		drag_to(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		end_drag(event.position)
		get_viewport().set_input_as_handled()

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
			zoom_start = target_zoom
			if drag_id != "" and not drag_from_tray and placed.has(drag_id):
				_place(drag_id, placed[drag_id])
			drag_id = ""
			ghost.visible = false
		return
	if event is InputEventScreenDrag:
		if touches.size() >= 2 and touches.has(event.index):
			var before: Vector2 = touches[event.index]
			touches[event.index] = event.position
			var pts := touches.values()
			var d := (pts[0] as Vector2).distance_to(pts[1])
			if pinch_start > 0:
				target_zoom = clampf(zoom_start * pinch_start / maxf(d, 1.0), ZOOM_LIMITS.x, ZOOM_LIMITS.y)
			_pan((event.position - before) * 0.5)
			_update_camera()
		elif touches.has(event.index):
			touches[event.index] = event.position
		return
	if touches.size() >= 2:
		return
	if event is InputEventMouseButton:
		# Wheel zooms; Ctrl/Shift + wheel tilts. Both ease in _process.
		var wheel := 0.0
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			wheel = -1.0
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			wheel = 1.0
		if wheel != 0.0:
			if event.ctrl_pressed or event.shift_pressed:
				_tilt_by(-wheel * 5.0)
			else:
				_zoom_by(wheel * 2.5)
		elif event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			_on_board_press(event.position)
	elif event is InputEventMouseMotion:
		if event.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
			_tilt_by(-event.relative.y * 0.25)          # middle-drag tilts
		elif event.button_mask & MOUSE_BUTTON_MASK_RIGHT:
			_pan(event.relative)
			_update_camera()
		elif selected != "" and _building():
			_show_ghost(selected, event.position)     # hover preview (mouse)
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_Q:
			_rotate(-90.0)
		elif event.keycode == KEY_E:
			_rotate(90.0)
		elif event.keycode == KEY_SPACE:
			_on_step()
		elif event.keycode == KEY_W:
			_tilt_by(5.0)
		elif event.keycode == KEY_S:
			_tilt_by(-5.0)
		elif event.keycode == KEY_EQUAL or event.keycode == KEY_KP_ADD:
			_zoom_by(-2.5)
		elif event.keycode == KEY_MINUS or event.keycode == KEY_KP_SUBTRACT:
			_zoom_by(2.5)
		elif event.keycode == KEY_F3:
			fps_label.visible = not fps_label.visible

func _on_board_press(pos: Vector2) -> void:
	if not _building():
		return
	var slot = _screen_to_slot(pos)
	if selected != "":
		# Tap-to-place: only on an allowed spot; a red spot keeps the selection.
		if spot_allowed(selected, slot):
			var id := selected
			selected = ""
			ghost.visible = false
			_place(id, slot)
		else:
			_show_ghost(selected, pos)
		return
	if slot != null:
		var here := _room_at_slot(slot)
		if here != "":
			_begin_drag(here, false, pos)

# ------------------------------------------------------------------ light

## One sun with soft shadows plus ambient light. Works on Compatibility
## (web) and Mobile. On the web, `?shadows=0` turns shadows off, and they
## also switch off by themselves if the first seconds run under 30 FPS.
## `?fps=1` (or F3) shows an FPS counter.
func _setup_lighting() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.08, 0.09, 0.12)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.62, 0.66, 0.78)
	env.ambient_light_energy = 0.3
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun: DirectionalLight3D = $Sun
	sun.light_color = Color(1.0, 0.95, 0.85)
	sun.light_energy = 0.9
	sun.shadow_enabled = _url_flag("shadows", "1") != "0"
	sun.shadow_blur = 1.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 80.0
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 1.0

## Query parameter `name` on the web build, else `fallback`.
func _url_flag(name: String, fallback: String) -> String:
	if not OS.has_feature("web"):
		return fallback
	var q = JavaScriptBridge.eval("new URLSearchParams(location.search).get('%s')" % name, true)
	return fallback if q == null else String(q)

func _perf_tick(delta: float) -> void:
	if fps_label and fps_label.visible:
		fps_label.text = "%d FPS%s" % [Engine.get_frames_per_second(), "" if $Sun.shadow_enabled else " (no shadows)"]
	if perf_checked:
		return
	perf_time += delta
	perf_frames += 1
	if perf_time < 1.0:
		perf_frames = 0                     # skip the first second (loading)
		return
	if perf_time >= 5.0:
		perf_checked = true
		var fps := perf_frames / (perf_time - 1.0)
		if OS.has_feature("web") and fps < 30.0 and $Sun.shadow_enabled:
			$Sun.shadow_enabled = false
			print("zorg: %.0f FPS with shadows, turning them off" % fps)

# ------------------------------------------------------------------ camera

## Smooth 90° turn (ease out); lands exactly on target_yaw, so the yaw is
## always 45° + n·90° once settled.
func _rotate(deg: float) -> void:
	target_yaw += deg
	if yaw_tween:
		yaw_tween.kill()
	yaw_tween = create_tween()
	yaw_tween.tween_property(self, "yaw", target_yaw, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	yaw_tween.tween_callback(func():
		yaw = fposmod(target_yaw, 360.0)
		target_yaw = yaw)
	_snap_camera()

func _zoom_by(d: float) -> void:
	target_zoom = clampf(target_zoom + d, ZOOM_LIMITS.x, ZOOM_LIMITS.y)

func _tilt_by(d: float) -> void:
	target_pitch = clampf(target_pitch + d, PITCH_LIMITS.x, PITCH_LIMITS.y)

## After a rotation (or a new level), glide the pivot back onto the dungeon
## so the board doesn't drift off screen; yaw lands exactly on 45° + n·90°.
func _snap_camera() -> void:
	var center := slot_center(2, 0)
	if not placed.is_empty():
		var sum := Vector3.ZERO
		for id in placed:
			sum += slot_center(placed[id].x, placed[id].y)
		center = sum / placed.size()
	if cam_tween:
		cam_tween.kill()
	cam_tween = create_tween()
	cam_tween.tween_property(rig, "position", center, 0.25)

func _pan(delta_px: Vector2) -> void:
	var scale := zoom / 600.0
	var right := Vector3(cos(deg_to_rad(yaw)), 0, -sin(deg_to_rad(yaw)))
	var fwd := Vector3(-sin(deg_to_rad(yaw)), 0, -cos(deg_to_rad(yaw)))
	rig.position -= right * delta_px.x * scale
	rig.position += fwd * delta_px.y * scale

func _update_camera() -> void:
	rig.rotation_degrees.y = yaw
	var p := deg_to_rad(pitch)
	camera.position = Vector3(0, zoom * sin(p), zoom * cos(p))
	camera.look_at(rig.global_position, Vector3.UP)

func _process(delta: float) -> void:
	# Zoom and tilt ease toward their targets (frame-rate independent).
	var k := 1.0 - exp(-CAM_SMOOTH * delta)
	zoom = target_zoom if absf(target_zoom - zoom) < 0.01 else lerpf(zoom, target_zoom, k)
	pitch = target_pitch if absf(target_pitch - pitch) < 0.01 else lerpf(pitch, target_pitch, k)
	_update_camera()
	for id in room_nodes:
		var gate: Node3D = room_nodes[id].get_node_or_null("PortalGate")
		if gate:
			gate.rotation.y += delta * 1.2
	_perf_tick(delta)
	if playing:
		play_timer -= delta
		if play_timer <= 0:
			play_timer = STEP_SECONDS
			if not _advance():
				playing = false
				play_btn.text = "Play"

func camera_settled() -> bool:
	return yaw == target_yaw and is_equal_approx(fmod(yaw - 45.0, 90.0), 0.0)

# ------------------------------------------------------------------ play

func _ensure_recording() -> bool:
	if not recording.is_empty():
		return true
	var err: String = engine.start(_layout())
	if err != "":
		status.text = err
		return false
	recording = {"turns": []}
	turn_index = 0
	heroes.clear()
	heroes.names = engine.hero_names()
	selected = ""
	ghost.visible = false
	_refresh_tray()
	tray.visible = false
	status.text = "Extermination: Step or Play; cast spells between actions."
	_refresh_spells()
	return true

## Run one hero action live. Returns false once the run is over.
func _advance() -> bool:
	if recording.is_empty() or engine.over():
		return false
	var events: Array = engine.step()
	recording["turns"].append(events)
	turn_index += 1
	var line: String = heroes.apply_turn(events)
	for e in events:
		if e["type"] == "spawn":
			heroes.set_start_hp(int(e["heroId"]), engine.hero_hp(int(e["heroId"])), engine.hero_gold(int(e["heroId"])))
	log_label.text = "Turn %d: %s" % [turn_index, line]
	_refresh_piles()
	_refresh_spells()
	if engine.over():
		_show_result()
		return false
	return true

func run_over() -> bool:
	return not recording.is_empty() and engine.over()

func _show_result() -> void:
	var sc: Dictionary = engine.score()
	recording["outcome"] = engine.state["outcome"]
	match String(sc["outcome"]):
		"win":
			result.text = "You win! Every hero died and the rules hold."
		"loss":
			result.text = "You lose: a hero reached Zorg."
		_:
			var failed: Array = []
			for c in sc["constraints"]:
				if c["status"] != "held":
					failed.append("%s (%s)" % [c["id"], c["status"]])
			if not failed.is_empty():
				result.text = "Not won yet: rule not met " + ", ".join(failed)
			elif String(recording.get("outcome", "")) == "stalemate":
				result.text = "Not won yet: a hero is stuck and can't move."
			else:
				result.text = "Not won yet."

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
	engine.state = {}
	playing = false
	if play_btn:
		play_btn.text = "Play"
	heroes.clear()
	result.text = ""
	log_label.text = ""
	tray.visible = true
	_refresh_tray()
	_refresh_validation()
	_refresh_piles()
	if spell_bar:
		_refresh_spells()
