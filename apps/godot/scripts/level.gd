extends Node3D
## Level screen: pick a level, build the dungeon (tap or drag rooms, with a
## green/orange/red ghost preview), then Play/Step the engine one action at
## a time and cast spells from the spell bar between actions (FR-33).
## Round 6 look: procedural 2.5D tiles and figures (look.gd), one sun with
## soft shadows plus ambient light, smooth zoom / tilt / rotation. Visual
## only: the engine and its parity tests don't see any of it.
## Round 7 (phone UX): DPI-aware UI scale and one theme (hud.gd), 48 dp
## touch targets, colour-swatch tray buttons, a Levels popup, on-screen
## zoom/tilt/turn/fit buttons, screen-space labels on backing plates that
## never collide, and a camera that fits the dungeon with margins.

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
const FIT_EMPTY := Rect2i(0, 0, 3, 2)       # slots framed before any room is placed
const FIT_HEIGHT := 1.2                     # walls/props counted when framing

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
var kb_active := false    # keyboard placement: arrows move kb_slot, Enter drops
var kb_slot := Vector2i.ZERO
var place_order: Array = []   # placement history, for undo (Backspace / Ctrl+Z)

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
var cam_manual := false          # user zoomed/panned: stop auto-fit until Fit or a new level
var fit_pending := 0             # 1 = smooth refit, 2 = instant (after the HUD re-lays out)
var fit_wait := 0

# ui
var title: Label
var goal: Label
var picker: GridContainer
var tray: HFlowContainer
var status: Label
var result: Label
var log_label: Label
var play_btn: Button
var step_btn: Button
var spell_bar: HBoxContainer
var ui_root: Control
var label_layer: Control         # room labels (below the hero labels)
var hero_layer: Control          # hero HP labels and hit numbers (on top)
var hud_top: VBoxContainer
var bottom_bar: BoxContainer     # horizontal; vertical (tray above controls) in portrait
var controls: HBoxContainer
var cam_grid: GridContainer
var levels_btn: Button
var levels_panel: PanelContainer
var ui_scale := 1.0
# Round 9 look and follow camera.
var quality := "low"             # "low" | "high" (ZorgAtmos)
var env: Environment
var quality_btn: Button
var view_btn: Button
var follow := false              # true: the camera tracks the first living hero
var follow_overview := -1.0     # zoom the 60% follow distance is taken from; -1 = sample next time
var torch_timer := 0.0
var look_time := 0.0
var fps_log := 0.0
const FOLLOW_ZOOM := 0.6         # follow view zooms to 60% of the overview distance
const FOLLOW_MIN := 7.0          # ... and may come closer than the normal zoom limit
const FOLLOW_SMOOTH := 4.0       # 1/s, exponential ease of the pivot onto the hero
const REFUSALS := {"before_first_action": "wait for the first hero action", "run_over": "the run is over",
	"no_active_hero": "no hero is active", "consumed": "that spell is used up", "no_spell": "no such spell"}

func _ready() -> void:
	_setup_lighting()
	_apply_ui_scale()
	_build_ui()
	heroes.cam = camera
	heroes.overlay = hero_layer
	get_viewport().size_changed.connect(_on_resized)
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
		_free_room(id)
	room_nodes.clear()
	placed.clear()
	place_order.clear()
	kb_active = false
	selected = ""
	levels_panel.visible = false
	var err: String = engine.load_level_file(engine.levels[i]["file"])
	if err != "":
		title.text = "Cannot load level"
		status.text = err
		tray.visible = false
		return
	title.text = engine.level_name()
	levels_btn.text = "Level " + String(engine.levels[i]["id"]).replace("deluxe-", "")
	var rules: Array = engine.constraint_texts()
	goal.text = "Goal: every hero dies before reaching Zorg's room." + ("" if rules.is_empty() else "  Rule: " + ", ".join(rules))
	for b in picker.get_children():
		b.modulate = Color(1, 1, 0.5) if b.get_index() == i else Color.WHITE
	_refresh_tray()
	_refresh_validation()
	_refresh_spells()
	cam_manual = false
	_fit_camera(true)
	_request_fit(2)

func _build_picker() -> void:
	for i in engine.levels.size():
		var idx: int = i
		var e: Dictionary = engine.levels[i]
		var b := _btn(String(e["id"]).replace("deluxe-", ""), func(): _open_level(idx))
		b.custom_minimum_size = Vector2(72, ZorgHud.TARGET)
		b.tooltip_text = String(e["name"])
		picker.add_child(b)

# ------------------------------------------------------------------ UI

func _btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)   # >= 48 dp once scaled
	b.pressed.connect(cb)
	return b

func _label(size: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func _build_ui() -> void:
	ui_root = Control.new()
	ui_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.theme = ZorgHud.make_theme()
	ui.add_child(ui_root)
	ui.add_child(ZorgAtmos.vignette())
	ui.move_child(ui.get_child(ui.get_child_count() - 1), 0)   # under the HUD
	label_layer = _layer()
	hero_layer = _layer()

	hud_top = VBoxContainer.new()
	hud_top.position = Vector2(12, 8)
	hud_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_top.add_theme_constant_override("separation", 2)
	ui_root.add_child(hud_top)
	title = _label(22)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD    # narrow portrait screens
	hud_top.add_child(title)
	goal = _label(16)
	goal.autowrap_mode = TextServer.AUTOWRAP_WORD
	hud_top.add_child(goal)
	status = _label(16)
	status.autowrap_mode = TextServer.AUTOWRAP_WORD
	hud_top.add_child(status)
	result = _label(22)
	result.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45))
	hud_top.add_child(result)
	log_label = _label(16)
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	hud_top.add_child(log_label)

	# Top right: the current level; tap it for the level grid.
	levels_btn = _btn("Levels", func(): levels_panel.visible = not levels_panel.visible)
	levels_btn.custom_minimum_size = Vector2(134, ZorgHud.TARGET)
	levels_btn.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	levels_btn.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	ui_root.add_child(levels_btn)
	fps_label = _label(16)
	fps_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	fps_label.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	fps_label.visible = _url_flag("fps", "0") == "1"
	ui_root.add_child(fps_label)

	levels_panel = PanelContainer.new()
	levels_panel.set_anchors_preset(Control.PRESET_CENTER)
	levels_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	levels_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	levels_panel.visible = false
	ui_root.add_child(levels_panel)
	var lp := VBoxContainer.new()
	lp.add_theme_constant_override("separation", 8)
	levels_panel.add_child(lp)
	var lt := _label(18)
	lt.text = "Choose a level"
	lp.add_child(lt)
	picker = GridContainer.new()
	picker.columns = 5
	picker.add_theme_constant_override("h_separation", 6)
	picker.add_theme_constant_override("v_separation", 6)
	lp.add_child(picker)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	lp.add_child(row)
	quality_btn = _btn("Graphics: " + quality.capitalize(), _toggle_quality)
	quality_btn.custom_minimum_size.x = 180
	quality_btn.tooltip_text = "High: more torches, shadows and glow. Low: faster."
	row.add_child(quality_btn)
	row.add_child(_btn("Close", func(): levels_panel.visible = false))

	# Camera buttons (touch screens; mouse: wheel, Ctrl + wheel, Q/E, right-drag).
	# Plain ASCII labels: the web build's default font has no arrow glyphs.
	cam_grid = GridContainer.new()
	cam_grid.columns = 2
	cam_grid.add_theme_constant_override("h_separation", 6)
	cam_grid.add_theme_constant_override("v_separation", 6)
	cam_grid.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	cam_grid.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	cam_grid.grow_vertical = Control.GROW_DIRECTION_BOTH
	ui_root.add_child(cam_grid)
	for spec in [["Zoom +", func(): _zoom_button(-4.0)], ["Zoom -", func(): _zoom_button(4.0)],
			["Tilt +", func(): _tilt_by(8.0)], ["Tilt -", func(): _tilt_by(-8.0)],
			["< 90°", func(): _rotate(-90.0)], ["90° >", func(): _rotate(90.0)],
			["Fit", _on_fit]]:
		cam_grid.add_child(_btn(spec[0], spec[1]))
	# Follow camera (round 9), next to Fit: only during a run; cycles
	# Overview ("All") / Follow hero ("Hero").
	view_btn = _btn("View: All", _on_cam_mode)
	view_btn.tooltip_text = "Overview or follow the hero (key C)"
	view_btn.visible = false
	cam_grid.add_child(view_btn)

	# Bottom bar: tray rooms (wrap upward if many), spells during a run, run controls.
	bottom_bar = BoxContainer.new()
	bottom_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bottom_bar.grow_vertical = Control.GROW_DIRECTION_BEGIN
	bottom_bar.alignment = BoxContainer.ALIGNMENT_END
	bottom_bar.add_theme_constant_override("separation", 8)
	ui_root.add_child(bottom_bar)
	tray = HFlowContainer.new()
	tray.add_theme_constant_override("h_separation", 6)
	tray.add_theme_constant_override("v_separation", 6)
	tray.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tray.size_flags_vertical = Control.SIZE_SHRINK_END
	tray.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom_bar.add_child(tray)
	# Spell bar (FR-32/FR-33): one button per spell, usable by tap or mouse,
	# enabled only between completed actions while the run is going.
	controls = HBoxContainer.new()
	controls.add_theme_constant_override("separation", 8)
	controls.size_flags_horizontal = Control.SIZE_SHRINK_END
	controls.size_flags_vertical = Control.SIZE_SHRINK_END
	bottom_bar.add_child(controls)
	spell_bar = HBoxContainer.new()
	spell_bar.add_theme_constant_override("separation", 6)
	spell_bar.size_flags_vertical = Control.SIZE_SHRINK_END
	controls.add_child(spell_bar)
	play_btn = _btn("Play", _on_play)
	step_btn = _btn("Step", _on_step)
	for b in [play_btn, step_btn, _btn("Build", _on_reset)]:
		b.custom_minimum_size.x = 76
		b.size_flags_vertical = Control.SIZE_SHRINK_END
		controls.add_child(b)
	_apply_margins()

func _layer() -> Control:
	var c := Control.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.add_child(c)
	return c

## UI scale from the screen DPI (1 UI unit ~ 1 dp on phones; 1 on desktop).
func _apply_ui_scale() -> void:
	ui_scale = ZorgHud.ui_scale(get_window())
	get_window().content_scale_factor = ui_scale
	print("zorg: ui scale %.2f (dpi %d, window %s)" % [ui_scale, DisplayServer.screen_get_dpi(), get_window().size])

## Keep the HUD inside the safe area (notch, rounded corners, system bars).
func _apply_margins() -> void:
	var ins: Array = ZorgHud.safe_insets(get_window())
	var m := 8.0
	ui_root.offset_left = ins[0] + m
	ui_root.offset_top = ins[1] + m
	ui_root.offset_right = -(ins[2] + m)
	ui_root.offset_bottom = -(ins[3] + m)
	var vp := get_viewport().get_visible_rect().size
	# Portrait (narrow mobile browsers): tray on its own row above the controls,
	# and the text column stops short of the Level button.
	bottom_bar.vertical = vp.x < vp.y
	var w := minf(clampf(vp.x * 0.55, 320.0, 640.0), vp.x - 2.0 * 8.0 - levels_btn.custom_minimum_size.x - 12.0)
	title.custom_minimum_size.x = w
	goal.custom_minimum_size.x = w
	status.custom_minimum_size.x = w
	log_label.custom_minimum_size.x = w
	fps_label.offset_top = ZorgHud.TARGET + 6
	cam_grid.offset_left = -cam_grid.get_combined_minimum_size().x
	cam_grid.offset_top = -cam_grid.get_combined_minimum_size().y / 2.0
	cam_grid.offset_bottom = cam_grid.get_combined_minimum_size().y / 2.0
	cam_grid.offset_right = 0

func _on_resized() -> void:
	var s := ZorgHud.ui_scale(get_window())
	if not is_equal_approx(s, ui_scale):
		_apply_ui_scale()
	_apply_margins()
	if not cam_manual:
		_request_fit(2)

func _spell_label(def: Dictionary) -> String:
	match String(def["type"]):
		"Attack": return "Attack(%d)" % int(def["damage"])
		"Teleport": return "Teleport(%d)" % int(def["steps"])
	return String(def["type"])

func _refresh_spells() -> void:
	for c in spell_bar.get_children():
		c.queue_free()
	spell_bar.visible = not _building()
	var list: Array = engine.spells()
	var allowed: bool = engine.can_cast()
	for i in list.size():
		var idx: int = i
		var sp: Dictionary = list[i]
		var b := _btn(_spell_label(sp["def"]), func(): cast_spell(idx))
		b.custom_minimum_size = Vector2(120, ZorgHud.TARGET)
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
		var label: Label = room_nodes[id].get_meta("label")
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
		b.icon = ZorgHud.swatch(s["def"])
		b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
		b.tooltip_text = "Drag onto the board, or tap then tap a spot"
		if selected == id:
			# From the HUD theme directly: b isn't in the tree yet.
			b.add_theme_stylebox_override("normal", ui_root.theme.get_stylebox("pressed", "Button"))
		b.button_down.connect(func():
			# Enter/Space on a focused tray button: keyboard placement (WCAG 2.1.1).
			if Input.is_action_pressed("ui_accept") and not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
				_kb_select.call_deferred(id)
			else:
				_begin_drag(id, true, get_viewport().get_mouse_position()))
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
	root.set_meta("torch", ZorgAtmos.add_torch(root, ZorgEngine.base_tile(s["def"])))
	var pile := ZorgLook.gold_pile()
	pile.visible = false
	root.add_child(pile)
	root.set_meta("pile", pile)
	# Screen-space label on a small plate at the room's back corner; placed
	# each frame by _layout_labels so labels never overlap.
	var plate := PanelContainer.new()
	plate.add_theme_stylebox_override("panel", ZorgHud.plate())
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var label := _label(16)
	label.text = _label_for(s["def"])
	plate.add_child(label)
	label_layer.add_child(plate)
	root.set_meta("label", label)
	root.set_meta("plate", plate)
	rooms_root.add_child(root)
	return root

func _free_room(id: String) -> void:
	var n: Node3D = room_nodes[id]
	(n.get_meta("plate") as Control).queue_free()
	n.queue_free()

func _place(id: String, slot: Vector2i) -> void:
	placed[id] = slot
	place_order.erase(id)
	place_order.append(id)
	if not room_nodes.has(id):
		room_nodes[id] = _room_node(_supplied(id))
	room_nodes[id].position = slot_center(slot.x, slot.y)
	_refresh_tray()
	_refresh_validation()
	_refresh_piles()
	_refresh_torches()
	_request_fit(1)

func _unplace(id: String) -> void:
	placed.erase(id)
	place_order.erase(id)
	if room_nodes.has(id):
		_free_room(id)
		room_nodes.erase(id)
	_refresh_tray()
	_refresh_validation()
	_refresh_torches()
	_request_fit(1)

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
			kb_active = false                # a tap or click takes over from the keyboard
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
				# Same floor as the zoom buttons. A two-finger pan always runs
				# this before it leaves follow, so the overview floor would
				# snap a close-up (below ZOOM_LIMITS.x) back out.
				var span := zoom_start * pinch_start / maxf(d, 1.0)
				target_zoom = clampf(span, _zoom_floor(zoom_start), ZOOM_LIMITS.y)
				cam_manual = true
			cam_manual = true
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
				_zoom_button(wheel * 2.5)
		elif event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			_on_board_press(event.position)
	elif event is InputEventMouseMotion:
		if event.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
			_tilt_by(-event.relative.y * 0.25)          # middle-drag tilts
		elif event.button_mask & MOUSE_BUTTON_MASK_RIGHT:
			cam_manual = true
			_pan(event.relative)
			_update_camera()
		elif selected != "" and _building() and not kb_active:
			_show_ghost(selected, event.position)     # hover preview (mouse)
	elif event is InputEventKey and event.pressed and kb_active and _kb_key(event):
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_TAB and get_viewport().gui_get_focus_owner() == null:
			levels_btn.grab_focus()          # Tab from nothing: start on the Level button
		elif (event.keycode == KEY_BACKSPACE or (event.keycode == KEY_Z and event.ctrl_pressed)) and _building() and not place_order.is_empty():
			_unplace(place_order.back())     # undo the last placement
		elif event.keycode == KEY_Q:
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
			_zoom_button(-2.5)
		elif event.keycode == KEY_MINUS or event.keycode == KEY_KP_SUBTRACT:
			_zoom_button(2.5)
		elif event.keycode == KEY_F:
			_on_fit()
		elif event.keycode == KEY_C:
			_on_cam_mode()
		elif event.keycode == KEY_F3:
			fps_label.visible = not fps_label.visible

## Keyboard placement: pick a tray room with Enter/Space, move the ghost with
## the arrow keys, Enter/Space drops it (only on an allowed spot), Esc cancels.
func _kb_select(id: String) -> void:
	if not _building() or placed.has(id):
		return
	selected = id
	kb_active = true
	kb_slot = Vector2i.ZERO
	for other in place_order:               # start next to the last placed room
		var base: Vector2i = placed[other]
		for d in [Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(0, 1)]:
			if spot_allowed(id, base + d):
				kb_slot = base + d
				break
	get_viewport().gui_release_focus()      # arrows now reach _unhandled_input
	_refresh_tray()
	_kb_show()

func _kb_show() -> void:
	_show_ghost(selected, camera.unproject_position(slot_center(kb_slot.x, kb_slot.y)))
	status.text += "  Arrows move, Enter places, Esc cancels."

func _kb_key(e: InputEventKey) -> bool:
	# Tap/click placement, a drag or a run start can end the selection first.
	if selected == "" or not _building() or placed.has(selected):
		kb_active = false
		if _building():
			ghost.visible = false
			_refresh_validation()            # drop the arrows/Enter/Esc prompt
		return false
	if e.keycode == KEY_TAB:                 # leaving for the buttons cancels the pick-up
		_kb_cancel()
		return false
	var moves := {KEY_LEFT: Vector2i(-1, 0), KEY_RIGHT: Vector2i(1, 0), KEY_UP: Vector2i(0, 1), KEY_DOWN: Vector2i(0, -1)}
	if moves.has(e.keycode):
		var next: Vector2i = kb_slot + moves[e.keycode]
		if _in_board(next):
			kb_slot = next
		_kb_show()
		return true
	if e.echo:
		return false
	if e.keycode == KEY_ENTER or e.keycode == KEY_KP_ENTER or e.keycode == KEY_SPACE:
		if spot_allowed(selected, kb_slot):
			var id := selected
			selected = ""
			kb_active = false
			ghost.visible = false
			_place(id, kb_slot)
			_kb_refocus.call_deferred()
		else:
			_kb_show()
		return true
	if e.keycode == KEY_ESCAPE:
		_kb_cancel()
		_kb_refocus.call_deferred()
		return true
	return false

func _kb_cancel() -> void:
	selected = ""
	kb_active = false
	ghost.visible = false
	_refresh_tray()
	_refresh_validation()

## After a keyboard drop, focus the next tray room (or Play once all are placed).
func _kb_refocus() -> void:
	for b in tray.get_children():
		if not b.is_queued_for_deletion():
			b.grab_focus()
			return
	play_btn.grab_focus()

func _on_board_press(pos: Vector2) -> void:
	if not _building():
		return
	var slot = _screen_to_slot(pos)
	if selected != "":
		# Tap-to-place: only on an allowed spot; a red spot keeps the selection.
		if spot_allowed(selected, slot):
			var id := selected
			selected = ""
			kb_active = false
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

## Round 9: dark torch-lit dungeon (ZorgAtmos). A dim cool "moon" keeps
## the shapes readable; torches carry the light. Quality Low (phones and
## web by default): few torch lights, no shadows, no glow. High: more
## torches, torch and sun shadows, glow. `?quality=low|high` on the web,
## `--quality=` on the command line, or the Graphics button (saved).
## `?shadows=0` still forces shadows off, and High drops to Low by itself
## if the first seconds run under 30 FPS (unless High was asked for in
## the URL or on the command line). `?fps=1` (or F3) shows FPS.
func _setup_lighting() -> void:
	quality = ZorgAtmos.default_quality(_url_flag("quality", ""))
	env = ZorgAtmos.environment(quality == "high")
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun: DirectionalLight3D = $Sun
	sun.light_color = Color(0.62, 0.7, 1.0)
	sun.light_energy = 0.32
	sun.shadow_blur = 1.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 80.0
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 1.0
	_apply_quality()

func _apply_quality() -> void:
	var high := quality == "high"
	$Sun.shadow_enabled = high and _url_flag("shadows", "1") != "0"
	ZorgAtmos.set_quality(env, high)
	if quality_btn:
		quality_btn.text = "Graphics: " + ("High" if high else "Low")
	_refresh_torches()

func set_quality(q: String, save := true) -> void:
	quality = "high" if q == "high" else "low"
	if save:
		ZorgAtmos.save_quality(quality)
	_apply_quality()

func _toggle_quality() -> void:
	set_quality("low" if quality == "high" else "high")

## Torch lights per quality: the rooms nearest the camera pivot get one
## (LOW_LIGHTS or HIGH_LIGHTS); on High the nearest HIGH_SHADOWS cast shadows.
func _refresh_torches() -> void:
	var high := quality == "high"
	var limit := ZorgAtmos.HIGH_LIGHTS if high else ZorgAtmos.LOW_LIGHTS
	var shadows := ZorgAtmos.HIGH_SHADOWS if high and _url_flag("shadows", "1") != "0" else 0
	var ids: Array = room_nodes.keys()
	var pivot := Vector3(rig.position.x, 0, rig.position.z)
	ids.sort_custom(func(a, b): return room_nodes[a].position.distance_to(pivot) < room_nodes[b].position.distance_to(pivot))
	for i in ids.size():
		var light: OmniLight3D = room_nodes[ids[i]].get_meta("torch")
		light.visible = i < limit
		light.shadow_enabled = i < shadows

func torch_lights() -> Array:
	var out: Array = []
	for id in room_nodes:
		out.append(room_nodes[id].get_meta("torch"))
	return out

## Query parameter `name` on the web build, else `fallback`.
func _url_flag(name: String, fallback: String) -> String:
	if not OS.has_feature("web"):
		return fallback
	var q = JavaScriptBridge.eval("new URLSearchParams(location.search).get('%s')" % name, true)
	return fallback if q == null else String(q)

func _perf_tick(delta: float) -> void:
	if fps_label and fps_label.visible:
		fps_label.text = "%d FPS  %s" % [Engine.get_frames_per_second(), quality.capitalize()]
		fps_log -= delta
		if fps_log <= 0.0:                  # also in the log (adb logcat), for phone tests
			fps_log = 2.0
			print("zorg: fps %d quality %s" % [Engine.get_frames_per_second(), quality])
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
		if fps < 30.0 and quality == "high" and not ZorgAtmos.forced(_url_flag("quality", "")):
			set_quality("low", false)        # this session only; the saved choice stays
			print("zorg: %.0f FPS on High, switching to Low" % fps)
		elif OS.has_feature("web") and fps < 30.0 and $Sun.shadow_enabled:
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

## Nearest zoom. Follow may pass the overview floor, and so may a close-up
## left behind once follow ends. `from_zoom` keeps a pinch that started in
## that close-up from snapping out if a later sample crosses the floor.
func _zoom_floor(from_zoom: float) -> float:
	if follow or minf(from_zoom, target_zoom) < ZOOM_LIMITS.x:
		return FOLLOW_MIN
	return ZOOM_LIMITS.x

func _zoom_by(d: float) -> void:
	var next := clampf(target_zoom + d, _zoom_floor(target_zoom), ZOOM_LIMITS.y)
	# A real change back in the normal range is a new overview distance.
	# A clamp that does not move the zoom must not forget the old one.
	if not follow and next >= ZOOM_LIMITS.x and next != target_zoom:
		follow_overview = -1.0
	target_zoom = next

func _tilt_by(d: float) -> void:
	target_pitch = clampf(target_pitch + d, PITCH_LIMITS.x, PITCH_LIMITS.y)
	_request_fit(1)

## Refit once the HUD has re-laid out (containers sort at the end of a frame).
func _request_fit(mode: int) -> void:
	fit_pending = maxi(fit_pending, mode)
	fit_wait = 2

## On-screen +/- buttons, wheel and keys: the user takes over the zoom.
func _zoom_button(d: float) -> void:
	cam_manual = true
	_zoom_by(d)

func _on_fit() -> void:
	_set_follow(false)
	cam_manual = false
	_fit_camera(false)

## After a rotation (or a new level), glide the pivot back onto the dungeon
## so the board doesn't drift off screen; yaw lands exactly on 45° + n·90°.
func _snap_camera() -> void:
	if follow:
		return                               # the follow camera keeps the hero centred
	if not cam_manual:
		_fit_camera(false)
		return
	var lo := Vector3(INF, 0, INF)
	var hi := Vector3(-INF, 0, -INF)
	for id in placed:
		var c := slot_center(placed[id].x, placed[id].y)
		lo = lo.min(c)
		hi = hi.max(c)
	var center := slot_center(2, 0) if placed.is_empty() else (lo + hi) / 2.0
	if cam_tween:
		cam_tween.kill()
	cam_tween = create_tween()
	cam_tween.tween_property(rig, "position", center, 0.25)

## Free screen area for the board: below the top text, above the bottom
## bar, left of the camera buttons (UI units, same space as unproject).
func _fit_area() -> Rect2:
	var vp := get_viewport().get_visible_rect().size
	var left := ui_root.offset_left + 4.0
	var right := cam_grid.get_global_rect().position.x - 8.0
	var top := hud_top.get_global_rect().end.y + 6.0
	var bottom := bottom_bar.get_global_rect().position.y - 8.0
	if bottom - top < vp.y * 0.4:
		top = bottom - vp.y * 0.4
	if right - left < vp.x * 0.4:
		right = left + vp.x * 0.4
	return Rect2(left, top, right - left, bottom - top)

func _ground_at(pos: Vector2) -> Vector3:
	var o := camera.project_ray_origin(pos)
	var d := camera.project_ray_normal(pos)
	return o - d * (o.y / d.y) if absf(d.y) > 0.0001 else rig.position

## Centre on and fit the dungeon's bounds (placed rooms plus a one-slot
## ring while rooms are still in the tray, else FIT_EMPTY)
## inside _fit_area, for the yaw/tilt the camera is heading to. Binary
## search on the zoom, then shift the pivot so the box sits in the middle.
func _fit_camera(instant: bool) -> void:
	var lo := Vector2i(FIT_EMPTY.position)
	var hi := FIT_EMPTY.end - Vector2i.ONE
	if not placed.is_empty():
		lo = Vector2i(1 << 20, 1 << 20)
		hi = -lo
		for id in placed:
			lo = lo.min(placed[id])
			hi = hi.max(placed[id])
		if _building() and placed.size() < engine.supplied().size():
			lo -= Vector2i.ONE              # rooms left in the tray: keep the
			hi += Vector2i.ONE              # neighbouring drop spots on screen
	var x0 := lo.x * ROOM
	var x1 := (hi.x + 1) * ROOM
	var z0 := -lo.y * ROOM
	var z1 := -(hi.y + 1) * ROOM
	# Corners of each placed room once the tray is empty (an L-shaped dungeon
	# is framed tighter than its bounding box), else of the whole box.
	var boxes: Array = [[x0, x1, z0, z1]]
	if not placed.is_empty() and (not _building() or placed.size() >= engine.supplied().size()):
		boxes = []
		for id in placed:
			var sl: Vector2i = placed[id]
			boxes.append([sl.x * ROOM, (sl.x + 1) * ROOM, -sl.y * ROOM, -(sl.y + 1) * ROOM])
	var pts: Array[Vector3] = []
	for bx in boxes:
		for x in [bx[0], bx[1]]:
			for z in [bx[2], bx[3]]:
				for h in [0.0, FIT_HEIGHT]:
					pts.append(Vector3(x, h, z))
	var area := _fit_area()
	var saved := [rig.position, yaw, pitch, zoom]
	rig.position = Vector3((x0 + x1) / 2.0, 0, (z0 + z1) / 2.0)
	yaw = target_yaw
	pitch = target_pitch
	var best := ZOOM_LIMITS.y
	for round in 2:
		var a := ZOOM_LIMITS.x
		var b := ZOOM_LIMITS.y
		for i in 14:
			zoom = (a + b) / 2.0
			_update_camera()
			if _fits(pts, area.size):
				b = zoom
			else:
				a = zoom
		best = b
		zoom = best
		_update_camera()
		var box := Rect2(camera.unproject_position(pts[0]), Vector2.ZERO)
		for p in pts:
			box = box.expand(camera.unproject_position(p))
		var screen_mid := get_viewport().get_visible_rect().size / 2.0
		rig.position = _ground_at(screen_mid - (area.get_center() - box.get_center()))
	var target_pos := rig.position
	rig.position = saved[0]
	yaw = saved[1]
	pitch = saved[2]
	zoom = saved[3]
	_update_camera()
	if cam_tween:
		cam_tween.kill()
	target_zoom = best
	follow_overview = -1.0             # this fit is the overview distance
	if instant:
		rig.position = target_pos
		zoom = best
		_update_camera()
	else:
		cam_tween = create_tween()
		cam_tween.tween_property(rig, "position", target_pos, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

## True when the projected points' bounding box fits in `size`.
func _fits(pts: Array[Vector3], size: Vector2) -> bool:
	var box := Rect2()
	for i in pts.size():
		if camera.is_position_behind(pts[i]):
			return false
		var q := camera.unproject_position(pts[i])
		box = Rect2(q, Vector2.ZERO) if i == 0 else box.expand(q)
	return box.size.x <= size.x and box.size.y <= size.y

func _pan(delta_px: Vector2) -> void:
	if follow:
		_set_follow(false)                   # dragging the view takes over from the follow camera
		cam_manual = true
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
	result.visible = result.text != ""        # empty lines take no room from the board
	log_label.visible = log_label.text != "" or not _building()
	if fit_wait > 0:
		fit_wait -= 1
	elif fit_pending != 0 and drag_id == "":
		if follow:
			pass                                 # no auto-fit while following a hero
		elif fit_pending == 2 or not cam_manual:
			_fit_camera(fit_pending == 2)
		fit_pending = 0
	if follow:
		var target: Variant = heroes.follow_point()
		if target != null:
			var goal_pos := Vector3(target.x, 0, target.z)
			rig.position = rig.position.lerp(goal_pos, 1.0 - exp(-FOLLOW_SMOOTH * delta))
	look_time += delta
	torch_timer -= delta
	if torch_timer <= 0.0:
		torch_timer = 0.5
		_refresh_torches()                   # nearest rooms to the pivot keep the lights
	for id in room_nodes:
		var light: OmniLight3D = room_nodes[id].get_meta("torch")
		if light.visible:
			ZorgAtmos.flicker(light, look_time)
	_layout_labels()
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

## Room labels sit on a plate at each room's back corner (topmost on
## screen). Overlaps are pushed down below the label they hit, so labels
## never cover each other; hero labels draw on a layer above them.
func _layout_labels() -> void:
	var items: Array = []
	for id in room_nodes:
		var n: Node3D = room_nodes[id]
		var plate: Control = n.get_meta("plate")
		var c := n.global_position
		var best := Vector2(0, INF)
		var visible := true
		for dx in [-1.0, 1.0]:
			for dz in [-1.0, 1.0]:
				var w := c + Vector3(dx * (ROOM / 2.0 - 0.6), FIT_HEIGHT, dz * (ROOM / 2.0 - 0.6))
				if camera.is_position_behind(w):
					visible = false
				var q := camera.unproject_position(w)
				if q.y < best.y:
					best = q
		plate.visible = visible
		if not visible:
			continue
		var size := plate.get_combined_minimum_size()
		plate.size = size
		items.append([plate, Rect2(best - Vector2(size.x / 2.0, 0), size)])
	items.sort_custom(func(a, b): return a[1].position.y < b[1].position.y)
	var taken: Array[Rect2] = heroes.label_rects()
	for it in items:
		var r: Rect2 = it[1]
		for tries in 8:
			var hit := false
			for t in taken:
				if t.grow(1.0).intersects(r):
					r.position.y = t.end.y + 2.0
					hit = true
					break
			if not hit:
				break
		taken.append(r)
		(it[0] as Control).position = r.position - label_layer.get_global_rect().position

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
	kb_active = false
	turn_index = 0
	heroes.clear()
	heroes.names = engine.hero_names()
	selected = ""
	ghost.visible = false
	_refresh_tray()
	tray.visible = false
	levels_panel.visible = false
	status.text = "Extermination: Step or Play; cast spells between actions."
	view_btn.visible = true
	_request_fit(1)                          # the turn line now takes a row
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
	_request_fit(1)                          # the result banner takes a row
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

## View button / key C during a run: Overview <-> Follow hero.
func _on_cam_mode() -> void:
	if _building():
		return
	_set_follow(not follow)
	if not follow:
		cam_manual = false
		_fit_camera(false)

func _set_follow(on: bool) -> void:
	follow = on
	if view_btn:
		view_btn.text = "View: Hero" if on else "View: All"
	if on:
		if cam_tween:
			cam_tween.kill()
		# Pan leaves the close-up in place. Multiplying that zoom again
		# would stack (overview -> 60% -> 36% -> FOLLOW_MIN).
		if follow_overview < 0.0:
			follow_overview = target_zoom
		target_zoom = maxf(FOLLOW_MIN, follow_overview * FOLLOW_ZOOM)

func _on_reset() -> void:
	if follow:
		_set_follow(false)
		cam_manual = false                   # back to the fitted overview
	if view_btn:
		view_btn.visible = false
	recording = {}
	engine.state = {}
	playing = false
	if play_btn:
		play_btn.text = "Play"
	heroes.clear()
	result.text = ""
	log_label.text = ""
	tray.visible = true
	_request_fit(1)
	_refresh_tray()
	_refresh_validation()
	_refresh_piles()
	if spell_bar:
		_refresh_spells()
