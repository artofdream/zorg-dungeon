class_name ZorgBoardBuild
extends Node
## Tray, ghost, drag, and keyboard placement. It asks the level screen
## whether a spot is legal and emits the drop. It does not read the rules
## engine. [[NFR-1]]

signal place_requested(id: String, slot: Vector2i)
signal move_requested(id: String, slot: Vector2i)
signal unplace_requested(id: String)
signal undo_requested

const GHOST_OK := Color(0.2, 1.0, 0.3, 0.45)
const GHOST_LOOSE := Color(1.0, 0.6, 0.1, 0.5)
const GHOST_BAD := Color(1.0, 0.1, 0.1, 0.6)
const DRAG_START_PX := 12.0

var tray: HFlowContainer
var undo_button: Button
var ghost: MeshInstance3D
var ghost_mat: StandardMaterial3D

var selected := ""
var kb_active := false
var kb_slot := Vector2i.ZERO
var drag_id := ""
var drag_from_tray := false
var drag_active := false
var drag_origin := Vector2.ZERO

var _placed: Dictionary
var _order: Array
var _is_building: Callable
var _screen_to_slot: Callable
var _allowed: Callable
var _loose: Callable
var _in_board: Callable
var _center: Callable
var _unproject: Callable
var _label: Callable
var _has_room: Callable
var _preview: Callable
var _refresh_tray: Callable
var _refresh_validation: Callable
var _set_status: Callable
var _get_status: Callable
var _focus_play: Callable
var _occupant: Callable


func _init() -> void:
	name = "BoardBuild"
	# Tray and Undo are container children. They take no anchors; a preset
	# would fight the bar that parents them. The ghost is a mesh.
	tray = HFlowContainer.new()
	tray.name = "Tray"
	tray.add_theme_constant_override("h_separation", 6)
	tray.add_theme_constant_override("v_separation", 6)
	tray.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tray.size_flags_vertical = Control.SIZE_SHRINK_END
	tray.mouse_filter = Control.MOUSE_FILTER_IGNORE
	undo_button = Button.new()
	undo_button.name = "Undo"
	undo_button.text = "Undo"
	undo_button.tooltip_text = "Take back the last room (Backspace / Ctrl+Z)"
	undo_button.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	undo_button.pressed.connect(func() -> void: undo_requested.emit())
	ghost = MeshInstance3D.new()
	ghost.name = "Ghost"
	var bm := BoxMesh.new()
	bm.size = Vector3(4.8, 0.4, 4.8)
	ghost.mesh = bm
	ghost_mat = StandardMaterial3D.new()
	ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ghost.material_override = ghost_mat
	ghost.visible = false
	add_child(ghost)


func configure(placed_map: Dictionary, order: Array, hooks: Dictionary) -> void:
	_placed = placed_map
	_order = order
	_is_building = hooks["building"]
	_screen_to_slot = hooks["screen_to_slot"]
	_allowed = hooks["allowed"]
	_loose = hooks["loose"]
	_in_board = hooks["in_board"]
	_center = hooks["center"]
	_unproject = hooks["unproject"]
	_label = hooks["label"]
	_has_room = hooks["has_room"]
	_preview = hooks["preview"]
	_refresh_tray = hooks["refresh_tray"]
	_refresh_validation = hooks["refresh_validation"]
	_set_status = hooks["set_status"]
	_get_status = hooks["get_status"]
	_focus_play = hooks["focus_play"]
	_occupant = hooks["occupant"]


func set_building(on: bool) -> void:
	tray.visible = on
	if not on:
		selected = ""
		kb_active = false
		drag_id = ""
		ghost.visible = false


func set_tray(rows: Array, theme: Theme) -> void:
	for c in tray.get_children():
		c.queue_free()
	for row in rows:
		var id: String = row["id"]
		var b := Button.new()
		b.text = row["text"]
		b.icon = row["icon"]
		b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
		b.tooltip_text = "Drag onto the board, or tap then tap a spot"
		if row["selected"]:
			# From the HUD theme directly: b isn't in the tree yet.
			b.add_theme_stylebox_override("normal", theme.get_stylebox("pressed", "Button"))
		b.button_down.connect(func() -> void:
			# Enter/Space on a focused tray button: keyboard placement (WCAG 2.1.1).
			if Input.is_action_pressed("ui_accept") and not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
				kb_select.call_deferred(id)
			else:
				begin_drag(id, true, get_viewport().get_mouse_position()))
		tray.add_child(b)


func set_ghost_size(room: float) -> void:
	(ghost.mesh as BoxMesh).size = Vector3(room - 0.2, 0.4, room - 0.2)


func begin_drag(id: String, from_tray: bool, pos: Vector2) -> void:
	if not _is_building.call():
		return
	drag_id = id
	drag_from_tray = from_tray
	drag_active = false
	drag_origin = pos


func end_drag(pos: Vector2) -> void:
	var id := drag_id
	drag_id = ""
	ghost.visible = false
	if id == "":
		return
	if not drag_active:
		if drag_from_tray:
			kb_active = false
			selected = "" if selected == id else id
			_refresh_tray.call()
		else:
			unplace_requested.emit(id)
		return
	var slot = _screen_to_slot.call(pos)
	if _allowed.call(id, slot):
		if drag_from_tray:
			place_requested.emit(id, slot)
		else:
			move_requested.emit(id, slot)
	elif drag_from_tray:
		_refresh_validation.call()
	else:
		move_requested.emit(id, _placed[id])
	drag_active = false


func drag_to(pos: Vector2) -> void:
	if drag_id == "":
		return
	if not drag_active and pos.distance_to(drag_origin) > DRAG_START_PX:
		drag_active = true
		selected = ""
	if drag_active:
		show_ghost(drag_id, pos)
		if not drag_from_tray and _has_room.call(drag_id):
			var slot = _screen_to_slot.call(pos)
			if slot != null:
				_preview.call(drag_id, _center.call(slot.x, slot.y) + Vector3(0, 0.8, 0))


func abort_pinch() -> void:
	if drag_id != "" and not drag_from_tray and _placed.has(drag_id):
		move_requested.emit(drag_id, _placed[drag_id])
	drag_id = ""
	ghost.visible = false


func handle_drag_input(event: InputEvent) -> void:
	if drag_id == "":
		return
	if event is InputEventMouseMotion:
		drag_to(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		end_drag(event.position)
		get_viewport().set_input_as_handled()


func show_ghost(id: String, screen_pos: Vector2) -> void:
	var slot = _screen_to_slot.call(screen_pos)
	if slot == null:
		ghost.visible = false
		return
	var ok: bool = _allowed.call(id, slot)
	var loose: bool = ok and _loose.call(id, slot)
	ghost.visible = true
	ghost.position = _center.call(slot.x, slot.y) + Vector3(0, 0.3, 0)
	ghost_mat.albedo_color = GHOST_BAD if not ok else (GHOST_LOOSE if loose else GHOST_OK)
	var label: String = _label.call(id)
	if not ok:
		var why := "off the board" if not _in_board.call(slot) else "another room is there"
		_set_status.call("Can't place here: %s." % why)
	elif loose:
		_set_status.call("%s here would not touch any room yet." % label)
	else:
		_set_status.call("Drop %s here." % label)


func kb_select(id: String) -> void:
	if not _is_building.call() or _placed.has(id):
		return
	selected = id
	kb_active = true
	kb_slot = Vector2i.ZERO
	for other in _order:
		var base: Vector2i = _placed[other]
		for d in [Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(0, 1)]:
			if _allowed.call(id, base + d):
				kb_slot = base + d
				break
	get_viewport().gui_release_focus()
	_refresh_tray.call()
	_kb_show()


func _kb_show() -> void:
	var world: Vector3 = _center.call(kb_slot.x, kb_slot.y)
	show_ghost(selected, _unproject.call(world))
	_set_status.call(_get_status.call() + "  Arrows move, Enter places, Esc cancels.")


func kb_key(e: InputEventKey) -> bool:
	if selected == "" or not _is_building.call() or _placed.has(selected):
		kb_active = false
		if _is_building.call():
			ghost.visible = false
			_refresh_validation.call()
		return false
	if e.keycode == KEY_TAB:
		cancel()
		return false
	var moves := {KEY_LEFT: Vector2i(-1, 0), KEY_RIGHT: Vector2i(1, 0), KEY_UP: Vector2i(0, 1), KEY_DOWN: Vector2i(0, -1)}
	if moves.has(e.keycode):
		var next: Vector2i = kb_slot + moves[e.keycode]
		if _in_board.call(next):
			kb_slot = next
		_kb_show()
		return true
	if e.echo:
		return false
	if e.keycode == KEY_ENTER or e.keycode == KEY_KP_ENTER or e.keycode == KEY_SPACE:
		if _allowed.call(selected, kb_slot):
			var id := selected
			selected = ""
			kb_active = false
			ghost.visible = false
			place_requested.emit(id, kb_slot)
			_focus_after_drop.call_deferred()
		else:
			_kb_show()
		return true
	if e.keycode == KEY_ESCAPE:
		cancel()
		_focus_after_drop.call_deferred()
		return true
	return false


func cancel() -> void:
	selected = ""
	kb_active = false
	ghost.visible = false
	_refresh_tray.call()
	_refresh_validation.call()


func _focus_after_drop() -> void:
	for b in tray.get_children():
		if not b.is_queued_for_deletion():
			b.grab_focus()
			return
	_focus_play.call()


func on_board_press(pos: Vector2) -> void:
	if not _is_building.call():
		return
	var slot = _screen_to_slot.call(pos)
	if selected != "":
		if _allowed.call(selected, slot):
			var id := selected
			selected = ""
			kb_active = false
			ghost.visible = false
			place_requested.emit(id, slot)
		else:
			show_ghost(selected, pos)
		return
	if slot != null:
		var here: String = _occupant.call(slot)
		if here != "":
			begin_drag(here, false, pos)
