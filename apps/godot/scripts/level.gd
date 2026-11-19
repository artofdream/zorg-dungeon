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
## Round 11 (UX audit, medium findings): Back/Esc closes a popup or asks
## "Quit Zorg?", a "?" room legend with a first-run hint, "Next level" on
## the win banner, an on-screen Undo while building, no empty turn lines.
## The quit question is scenes/quit_dialog.tscn. It emits quit_requested;
## this screen still chooses history.back() on the web, or quitting the app.
## The FPS counter is scenes/fps_readout.tscn. F3 toggles it (signal
## toggled). This screen still writes the line and still drops High to Low.

const ROOM := 5.0                     # cells per room side; 1 cell = 1 unit
const SLOTS_X := Vector2i(-1, 6)      # room-grid slots shown on the board
const SLOTS_Y := Vector2i(-2, 3)
const GHOST_OK := Color(0.2, 1.0, 0.3, 0.45)
const GHOST_LOOSE := Color(1.0, 0.6, 0.1, 0.5)   # allowed, but touches no placed room yet
const GHOST_BAD := Color(1.0, 0.1, 0.1, 0.6)
const STEP_SECONDS := 0.18
const DRAG_START_PX := 12.0
const FIT_HEIGHT := 1.2                     # walls/props counted when framing

@onready var engine: Node = $Engine
@onready var board: Node3D = $Board
@onready var rooms_root: Node3D = $Rooms
@onready var heroes: Node3D = $Heroes
var cam: ZorgLevelCamera
var rig: Node3D
var camera: Camera3D
var yaw: float:
	get: return cam.yaw
	set(v): cam.yaw = v
var target_yaw: float:
	get: return cam.target_yaw
	set(v): cam.target_yaw = v
var zoom: float:
	get: return cam.zoom
	set(v): cam.zoom = v
var target_zoom: float:
	get: return cam.target_zoom
	set(v): cam.target_zoom = v
var pitch: float:
	get: return cam.pitch
	set(v): cam.pitch = v
var target_pitch: float:
	get: return cam.target_pitch
	set(v): cam.target_pitch = v
var cam_manual: bool:
	get: return cam.manual
	set(v):
		var was := cam.manual
		cam.manual = v
		# Right-drag and pinch assign this flag. The pad and the wheel go
		# through zoom_button, which emits the same signal itself.
		if v and not was:
			cam.became_manual.emit()
var follow: bool:
	get: return cam.follow
@onready var ui: CanvasLayer = $UI

var level_index := 0
var placed := {}          # room id -> Vector2i slot
var room_nodes := {}      # room id -> Node3D
var place_order: Array = []   # placement history, for undo (Backspace / Ctrl+Z)
var board_build: ZorgBoardBuild
var ghost: MeshInstance3D
var ghost_mat: StandardMaterial3D
var selected: String:
	get: return board_build.selected
	set(v): board_build.selected = v
var kb_active: bool:
	get: return board_build.kb_active
	set(v): board_build.kb_active = v
var drag_id: String:
	get: return board_build.drag_id

var recording: Dictionary = {}   # {"turns": [...]} once a run has started
var turn_index := 0
var playing := false
var play_timer := 0.0

# camera
var fps_readout: ZorgFpsReadout
var fps_shown := false
var touches := {}
var pinch_start := 0.0
var zoom_start := 0.0

# ui
var title: Label
var goal: Label
var picker: GridContainer
var level_picker: ZorgLevelPicker
var tray: HFlowContainer
var status: Label
var end_banner: ZorgEndBanner
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
var lighting: ZorgLevelLighting
var env: Environment
var quality_btn: Button
var view_btn: Button
# Round 11 UX.
var help_btn: Button
var undo_btn: Button
var next_btn: Button
var help_dlg: ZorgHelpDialog
var help_box: VBoxContainer
var quit_dlg: ZorgQuitDialog     # scenes/quit_dialog.tscn: "Quit Zorg?" Stay / Quit
var quit_stay: Button
var quit_btn: Button
var embedded := false            # web build inside an iframe (itch.io): no Quit
var hint: ZorgHint               # first-run hint (dismissed once, saved)
var settings_path := ZorgAtmos.SETTINGS
var fps_log := 0.0
const REFUSALS := {"before_first_action": "wait for the first hero action", "run_over": "the run is over",
	"no_active_hero": "no hero is active", "consumed": "that spell is used up", "no_spell": "no such spell"}

func _attach_camera() -> void:
	cam = preload("res://scenes/level_camera.tscn").instantiate() as ZorgLevelCamera
	add_child(cam)
	rig = cam
	camera = cam.camera_3d
	cam.needs_fit.connect(_fit_camera)
	cam.zoom_step.connect(_zoom_button)
	cam.tilt_step.connect(_tilt_by)
	cam.turn_step.connect(_rotate)
	cam.fit_pressed.connect(_on_fit)
	cam.view_pressed.connect(_on_cam_mode)

func _attach_board() -> void:
	board_build = preload("res://scenes/board_build.tscn").instantiate() as ZorgBoardBuild
	board_build.set_ghost_size(ROOM)
	add_child(board_build)
	ghost = board_build.ghost
	ghost_mat = board_build.ghost_mat
	board_build.place_requested.connect(_place)
	board_build.move_requested.connect(_place)
	board_build.unplace_requested.connect(_unplace)
	board_build.undo_requested.connect(undo)
	board_build.configure(placed, place_order, {
		"building": _building,
		"screen_to_slot": _screen_to_slot,
		"allowed": spot_allowed,
		"loose": spot_loose,
		"in_board": _in_board,
		"center": slot_center,
		"unproject": _unproject_board,
		"label": _label_of,
		"has_room": _has_room,
		"preview": _preview_room,
		"refresh_tray": _refresh_tray,
		"refresh_validation": _refresh_validation,
		"set_status": _set_status,
		"get_status": _get_status,
		"focus_play": _focus_play,
		"occupant": _room_at_slot,
	})

func _unproject_board(world: Vector3) -> Vector2:
	return camera.unproject_position(world)

func _label_of(id: String) -> String:
	var s := _supplied(id)
	return id if s.is_empty() else _label_for(s["def"])

func _has_room(id: String) -> bool:
	return room_nodes.has(id)

func _preview_room(id: String, at: Vector3) -> void:
	if room_nodes.has(id):
		room_nodes[id].position = at

func _set_status(text: String) -> void:
	status.text = text

func _get_status() -> String:
	return status.text

func _focus_play() -> void:
	play_btn.grab_focus()

func _ready() -> void:
	_attach_camera()
	_attach_board()
	get_tree().set_quit_on_go_back(false)   # Android Back goes to back_pressed()
	embedded = is_embedded()
	_setup_lighting()
	_apply_ui_scale()
	_build_ui()
	heroes.cam = camera
	heroes.overlay = hero_layer
	get_viewport().size_changed.connect(_on_resized)
	_build_board()
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
	level_picker.set_open(false)
	var err: String = engine.load_level_file(engine.levels[i]["file"])
	if err != "":
		title.text = "Cannot load level"
		status.text = err
		tray.visible = false
		return
	title.text = engine.level_name()
	level_picker.set_caption("Level " + String(engine.levels[i]["id"]).replace("deluxe-", ""))
	_apply_margins()                         # the ? button sits left of it
	var rules: Array = engine.constraint_texts()
	goal.text = "Goal: every hero dies before reaching Zorg's room." + ("" if rules.is_empty() else "  Rule: " + ", ".join(rules))
	level_picker.set_current(i)
	_refresh_tray()
	_refresh_validation()
	_refresh_spells()
	cam_manual = false
	_fit_camera(true)
	_request_fit(2)

func _build_picker() -> void:
	var rows: Array = []
	for e in engine.levels:
		rows.append({"label": String(e["id"]).replace("deluxe-", ""), "tip": String(e["name"])})
	level_picker.set_entries(rows)

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
	end_banner = preload("res://scenes/end_banner.tscn").instantiate() as ZorgEndBanner
	end_banner.next_level_pressed.connect(func(): _open_level(level_index + 1))
	hud_top.add_child(end_banner)
	result = end_banner.line_label
	next_btn = end_banner.next_button
	log_label = _label(16)
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	hud_top.add_child(log_label)

	level_picker = preload("res://scenes/level_picker.tscn").instantiate() as ZorgLevelPicker
	level_picker.level_picked.connect(_open_level)
	level_picker.quality_toggled.connect(_toggle_quality)
	levels_btn = level_picker.level_button
	levels_btn.reparent(ui_root)
	help_btn = _btn("?", open_help)
	help_btn.custom_minimum_size = Vector2(ZorgHud.TARGET, ZorgHud.TARGET)
	help_btn.tooltip_text = "What each room does"
	help_btn.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	help_btn.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	ui_root.add_child(help_btn)
	fps_readout = preload("res://scenes/fps_readout.tscn").instantiate() as ZorgFpsReadout
	fps_readout.toggled.connect(_on_fps_toggled)
	fps_readout.set_visible_fps(_url_flag("fps", "0") == "1")
	ui_root.add_child(fps_readout)

	ui_root.add_child(level_picker)
	levels_panel = level_picker.panel
	picker = level_picker.grid
	quality_btn = level_picker.quality_button
	level_picker.set_quality_label("Graphics: " + quality.capitalize())

	# Camera pad. Anchors were set in the camera scene's _init, before this add.
	# Sibling order stays: picker, then this pad, then the bottom bar (Tab).
	cam_grid = cam.pad
	ui_root.add_child(cam_grid)
	view_btn = cam.view_button

	# Bottom bar: tray rooms (wrap upward if many), spells during a run, run controls.
	bottom_bar = BoxContainer.new()
	bottom_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bottom_bar.grow_vertical = Control.GROW_DIRECTION_BEGIN
	bottom_bar.alignment = BoxContainer.ALIGNMENT_END
	bottom_bar.add_theme_constant_override("separation", 8)
	ui_root.add_child(bottom_bar)
	# Tray was built in the board scene's _init, before this add.
	tray = board_build.tray
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
	undo_btn = board_build.undo_button
	play_btn = _btn("Play", _on_play)
	step_btn = _btn("Step", _on_step)
	for b in [undo_btn, play_btn, step_btn, _btn("Build", _on_reset)]:
		b.custom_minimum_size.x = 76
		b.size_flags_vertical = Control.SIZE_SHRINK_END
		controls.add_child(b)
	_build_hint()
	_build_dialogs()
	_apply_margins()

func _build_hint() -> void:
	hint = preload("res://scenes/hint_panel.tscn").instantiate() as ZorgHint
	hint.hint_dismissed.connect(_on_hint_dismissed)
	hint.show_hint(not ZorgHelp.hint_seen(settings_path))
	hud_top.add_child(hint)
	hud_top.move_child(hint, goal.get_index() + 1)

func _on_hint_dismissed() -> void:
	ZorgHelp.set_hint_seen(settings_path, true)
	_request_fit(1)

func _build_dialogs() -> void:
	help_dlg = preload("res://scenes/help_dialog.tscn").instantiate() as ZorgHelpDialog
	ui_root.add_child(help_dlg)
	help_box = help_dlg.legend
	quit_dlg = preload("res://scenes/quit_dialog.tscn").instantiate() as ZorgQuitDialog
	ui_root.add_child(quit_dlg)
	quit_stay = quit_dlg.stay_button
	quit_btn = quit_dlg.quit_button
	quit_dlg.quit_requested.connect(_quit)
	set_embedded(embedded)

func open_help() -> void:
	hint.dismiss()
	level_picker.set_open(false)
	help_dlg.open(ui_root.size)

func close_help() -> void:
	help_dlg.close_dialog()

func _show_quit() -> void:
	quit_dlg.open()                          # Enter = Stay, the safe choice

func _quit() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("history.length > 1 ? history.back() : location.assign('/')")
	else:
		get_tree().quit()

## True on the web when the page is inside an iframe (itch.io embeds the
## game that way). Leaving the game is then the host page's business:
## history.back() would navigate the host away. A cross-origin top that
## can't be compared counts as embedded.
static func is_embedded() -> bool:
	if not OS.has_feature("web"):
		return false
	var r = JavaScriptBridge.eval("(function(){try{return window.self !== window.top ? 1 : 0}catch(e){return 1}})()", true)
	return embedded_from_js(r)

## The web bridge hands JS booleans back as ints (1/0), not bools, and
## int == bool is a script error in Godot 4; accept bool, number or text.
static func embedded_from_js(r: Variant) -> bool:
	match typeof(r):
		TYPE_BOOL: return r
		TYPE_INT, TYPE_FLOAT: return r != 0
		TYPE_STRING: return String(r) in ["1", "true"]
	return false

## Embedded: no Quit button, and Back/Esc with nothing open does nothing.
func set_embedded(on: bool) -> void:
	embedded = on
	if quit_dlg:
		quit_dlg.set_quit_offered(not on)
	print("zorg: embedded %s (Quit %s)" % [on, "hidden" if on else "shown"])

## Android Back and Esc: close the top popup (quit dialog, legend, level
## grid), else drop a room picked up for placing, else ask before quitting.
func back_pressed() -> void:
	if quit_dlg.visible:
		quit_dlg.close()
	elif help_dlg.visible:
		close_help()
	elif level_picker.panel.visible:
		level_picker.close_panel()
	elif selected != "" or kb_active:
		_kb_cancel()
	elif not embedded:
		_show_quit()

func popup_open() -> bool:
	return quit_dlg.visible or help_dlg.visible or levels_panel.visible

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST and quit_dlg != null:
		back_pressed()

## Undo button (and Backspace / Ctrl+Z): take back the last placed room.
func undo() -> void:
	if _building() and not place_order.is_empty():
		_unplace(place_order.back())

func _refresh_undo() -> void:
	if undo_btn:
		undo_btn.visible = _building()
		undo_btn.disabled = place_order.is_empty()

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
	var w := minf(clampf(vp.x * 0.55, 320.0, 640.0), vp.x - 2.0 * 8.0 - levels_btn.custom_minimum_size.x - ZorgHud.TARGET - 20.0)
	title.custom_minimum_size.x = w
	goal.custom_minimum_size.x = w
	status.custom_minimum_size.x = w
	log_label.custom_minimum_size.x = w
	fps_readout.set_top_offset(ZorgHud.TARGET + 6)
	help_btn.offset_right = -(levels_btn.get_combined_minimum_size().x + 8.0)
	help_btn.offset_left = help_btn.offset_right - ZorgHud.TARGET
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
	var rows: Array = []
	for s in engine.supplied():
		if placed.has(s["id"]):
			continue
		rows.append({
			"id": s["id"],
			"text": _label_for(s["def"]),
			"icon": ZorgHud.swatch(s["def"]),
			"selected": selected == s["id"],
		})
	board_build.set_tray(rows, ui_root.theme)

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
	_refresh_undo()

# ------------------------------------------------------------------ 3D

static func slot_center(x: int, y: int) -> Vector3:
	return Vector3(x * ROOM + ROOM / 2.0, 0, -(y * ROOM + ROOM / 2.0))

func _build_board() -> void:
	for x in range(SLOTS_X.x, SLOTS_X.y + 1):
		for y in range(SLOTS_Y.x, SLOTS_Y.y + 1):
			var m := ZorgLook.mat("board_a" if (x + y) % 2 == 0 else "board_b")
			ZorgLook.add_mesh(board, ZorgLook.box_mesh(Vector3(ROOM - 0.1, 0.1, ROOM - 0.1)), m, slot_center(x, y) + Vector3(0, -0.1, 0), false)

func _room_node(s: Dictionary) -> Node3D:
	var root := ZorgLook.build_room(s["def"], ZorgEngine.base_tile(s["def"]))
	var torch := ZorgAtmos.add_torch(root, ZorgEngine.base_tile(s["def"]))
	var level_id := String(engine.loaded.get("level", {}).get("id", ""))
	var extras: Array = ZorgAtmos.add_declared(root, level_id, String(s["id"]), String(s["def"].get("type", "")))
	root.set_meta("torch", torch)
	root.set_meta("lights", [torch] + extras)
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

# ------------------------------------------------------------------ input

func _begin_drag(id: String, from_tray: bool, pos: Vector2) -> void:
	board_build.begin_drag(id, from_tray, pos)

## Drop (or tap) at `pos`. Public so the smoke test can drive it.
func end_drag(pos: Vector2) -> void:
	board_build.end_drag(pos)

func drag_to(pos: Vector2) -> void:
	board_build.drag_to(pos)

## Drag motion/release must be seen even when the press began on a tray
## Button, so it is handled here before the GUI.
func _input(event: InputEvent) -> void:
	if drag_id == "" or touches.size() >= 2:
		return
	board_build.handle_drag_input(event)

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
			board_build.abort_pinch()
		return
	if event is InputEventScreenDrag:
		if touches.size() >= 2 and touches.has(event.index):
			var before: Vector2 = touches[event.index]
			touches[event.index] = event.position
			var pts := touches.values()
			var d := (pts[0] as Vector2).distance_to(pts[1])
			if pinch_start > 0:
				_set_zoom(zoom_start * pinch_start / maxf(d, 1.0))
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
			board_build.on_board_press(event.position)
	elif event is InputEventMouseMotion:
		if event.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
			_tilt_by(-event.relative.y * 0.25)          # middle-drag tilts
		elif event.button_mask & MOUSE_BUTTON_MASK_RIGHT:
			cam_manual = true
			_pan(event.relative)
			_update_camera()
		elif selected != "" and _building() and not kb_active:
			board_build.show_ghost(selected, event.position)     # hover preview (mouse)
	elif event is InputEventKey and event.pressed and event.keycode != KEY_ESCAPE and popup_open():
		get_viewport().set_input_as_handled()  # a popup is up: no undo/step/camera keys behind it
	elif event is InputEventKey and event.pressed and kb_active and board_build.kb_key(event):
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_TAB and get_viewport().gui_get_focus_owner() == null:
			levels_btn.grab_focus()          # Tab from nothing: start on the Level button
		elif event.keycode == KEY_ESCAPE:
			back_pressed()                   # same as Android Back
			get_viewport().set_input_as_handled()
		elif (event.keycode == KEY_BACKSPACE or (event.keycode == KEY_Z and event.ctrl_pressed)) and _building() and not place_order.is_empty():
			undo()                           # undo the last placement
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
			fps_readout.toggle()

## Keyboard placement: pick a tray room with Enter/Space, move the ghost with
## the arrow keys, Enter/Space drops it (only on an allowed spot), Esc cancels.
func _kb_select(id: String) -> void:
	board_build.kb_select(id)

func _kb_cancel() -> void:
	board_build.cancel()

# ------------------------------------------------------------------ light

func _setup_lighting() -> void:
	lighting = preload("res://scenes/level_lighting.tscn").instantiate() as ZorgLevelLighting
	lighting.quality_changed.connect(_on_quality_changed)
	add_child(lighting)
	lighting.setup($Sun, _url_flag("quality", ""), _url_flag("shadows", "1"))
	quality = lighting.quality
	env = lighting.env

func _on_quality_changed(q: String) -> void:
	quality = q
	if level_picker:
		level_picker.set_quality_label("Graphics: " + ("High" if q == "high" else "Low"))
	_refresh_torches()

func set_quality(q: String, save := true) -> void:
	lighting.set_quality(q, save)

func _toggle_quality() -> void:
	set_quality("low" if quality == "high" else "high")

func _refresh_torches() -> void:
	lighting.refresh(room_nodes, Vector3(rig.position.x, 0, rig.position.z))

func torch_lights() -> Array:
	return lighting.torch_lights(room_nodes)

## Query parameter `name` on the web build, else `fallback`.
func _url_flag(name: String, fallback: String) -> String:
	if not OS.has_feature("web"):
		return fallback
	var q = JavaScriptBridge.eval("new URLSearchParams(location.search).get('%s')" % name, true)
	return fallback if q == null else String(q)

func _on_fps_toggled(shown: bool) -> void:
	fps_shown = shown

func _perf_tick(delta: float) -> void:
	if not fps_shown:
		return
	fps_readout.set_line("%d FPS  %s" % [Engine.get_frames_per_second(), quality.capitalize()])
	fps_log -= delta
	if fps_log <= 0.0:                  # also in the log (adb logcat), for phone tests
		fps_log = 2.0
		var vp := get_viewport().get_viewport_rid()
		RenderingServer.viewport_set_measure_render_time(vp, true)
		print("zorg: fps %d quality %s cpu %.1f gpu %.1f process %.1f ms draws %d prims %d" % [Engine.get_frames_per_second(), quality,
			RenderingServer.viewport_get_measured_render_time_cpu(vp), RenderingServer.viewport_get_measured_render_time_gpu(vp),
			Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
			Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)])

# ------------------------------------------------------------------ camera
# Framing lives on scenes/level_camera.tscn. These forwards keep the calls
# the smoke test and the input path already use. The camera does not read
# the rules engine.

func _rotate(deg: float) -> void:
	cam.rotate_by(deg)
	_snap_camera()

func _zoom_by(d: float) -> void:
	cam.zoom_by(d)

func _set_zoom(z: float) -> void:
	cam.set_zoom(z)

func _tilt_by(d: float) -> void:
	cam.tilt_by(d)

func _request_fit(mode: int) -> void:
	cam.request_fit(mode)

func _zoom_button(d: float) -> void:
	cam.zoom_button(d)

func _on_fit() -> void:
	_set_follow(false)
	cam_manual = false
	_fit_camera(false)

func _snap_camera() -> void:
	if follow:
		return                               # the follow camera keeps the hero centred
	if not cam_manual:
		_fit_camera(false)
		return
	cam.snap_to(placed, ROOM)

## Free screen area for the board: below the top text, above the bottom
## bar, left of the camera buttons (UI units, same space as unproject).
func _fit_area() -> Rect2:
	# HUD / canvas_items space (same as Control.get_global_rect).
	var left := ui_root.offset_left + 4.0
	var right := cam_grid.get_global_rect().position.x - 8.0
	var top := hud_top.get_global_rect().end.y + 6.0
	var bottom := bottom_bar.get_global_rect().position.y - 8.0
	# Keep the hole inside the chrome; never grow it under the camera
	# buttons or the bars (that used to clip the board on the left).
	if right < left + 8.0:
		right = left + 8.0
	if bottom < top + 8.0:
		top = bottom - 8.0
	return Rect2(left, top, right - left, bottom - top)

func _fit_camera(instant: bool) -> void:
	cam.fit(instant, placed, _building(), _fit_area(), ROOM, SLOTS_X, SLOTS_Y, FIT_HEIGHT, get_viewport().get_visible_rect().size)

func _pan(delta_px: Vector2) -> void:
	cam.pan(delta_px)

func _update_camera() -> void:
	cam.update_transform()

func _process(delta: float) -> void:
	cam.ease(delta)
	status.visible = not end_banner.apply_visibility()   # banner replaces "Extermination: ..." 
	log_label.visible = log_label.text != "" or not _building()
	cam.consume_fit(drag_id == "")
	cam.follow_step(delta, heroes.follow_point() if follow else null)
	lighting.tick(delta, Vector3(rig.position.x, 0, rig.position.z), room_nodes)
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
	taken.append_array(hud_text_rects())     # round 12: never over the HUD text
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

## Screen rects of the visible top-left HUD lines (title, goal, status,
## result, Next level, turn line, hint), sized to the text actually drawn
## rather than the full column width.
func hud_text_rects() -> Array[Rect2]:
	var out: Array[Rect2] = []
	for c in hud_top.get_children():
		if c is ZorgEndBanner:
			out.append_array((c as ZorgEndBanner).line_rects()); continue
		var ctl := c as Control
		if ctl == null or not ctl.is_visible_in_tree():
			continue
		var r := ctl.get_global_rect()
		if ctl is Label:
			var l := ctl as Label
			if l.text.strip_edges() == "":
				continue
			var sz := l.get_theme_font("font").get_multiline_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, r.size.x, l.get_theme_font_size("font_size"))
			r.size.x = minf(sz.x + 8.0, r.size.x)
		out.append(r)
	return out

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
	board_build.set_building(false)
	_refresh_tray()
	level_picker.set_open(false)
	status.text = "Extermination: Step or Play; cast spells between actions."
	view_btn.visible = true
	_refresh_undo()
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
	var text := "Not won yet."
	var show_next := false
	match String(sc["outcome"]):
		"win":
			text = "You win! Every hero died and the rules hold."
			show_next = level_index + 1 < engine.levels.size()
		"loss":
			text = "You lose: a hero reached Zorg."
		_:
			var failed: Array = []
			for c in sc["constraints"]:
				if c["status"] != "held":
					failed.append("%s (%s)" % [c["id"], c["status"]])
			if not failed.is_empty():
				text = "Not won yet: rule not met " + ", ".join(failed)
			elif String(recording.get("outcome", "")) == "stalemate":
				text = "Not won yet: a hero is stuck and can't move."
	end_banner.show_line(text, show_next)

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
	cam.set_follow(on)

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
	end_banner.clear()
	log_label.text = ""
	board_build.set_building(true)
	_request_fit(1)
	_refresh_tray()
	_refresh_validation()
	_refresh_piles()
	if spell_bar:
		_refresh_spells()
