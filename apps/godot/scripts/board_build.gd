class_name ZorgBoardBuild
extends Node
## Tray, ghost, drag, and keyboard placement. It asks the level screen
## whether a spot is legal and emits the drop. It does not read the rules
## engine. [[NFR-1]]
## Board UX: tray slots are stable (a placed room's slot empties to an
## outline of the same size instead of the row reflowing), and a refused drop emits drop_rejected so the
## level screen can show a toast while the red ghost shakes and the room
## goes back to its tray slot.

signal place_requested(id: String, slot: Vector2i)
signal move_requested(id: String, slot: Vector2i)
signal unplace_requested(id: String)
signal undo_requested
signal drop_rejected(id: String, why: String, from_tray: bool)

const GHOST_OK := Color(0.2, 1.0, 0.3, 0.45)
const GHOST_LOOSE := Color(1.0, 0.6, 0.1, 0.5)
const GHOST_BAD := Color(1.0, 0.1, 0.1, 0.6)
const DRAG_START_PX := 12.0
const SHAKE_SECONDS := 0.32

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
var _tray_ids: Array = []          # tray slot order (stable: one slot per supplied room)
var _reject_tween: Tween
var _flash_tween: Tween

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
		drag_active = false
		_stop_reject()
		ghost.visible = false


## One button per supplied room, in supply order. A placed room keeps its
## slot (greyed out, disabled) so the row never reflows under the finger.
## Buttons are reused while the room list is the same, so a placement only
## restyles two slots instead of rebuilding the row.
func set_tray(rows: Array, theme: Theme) -> void:
	var ids: Array = rows.map(func(r): return String(r["id"]))
	if ids != _tray_ids or tray.get_child_count() != ids.size():
		for c in tray.get_children():
			tray.remove_child(c)
			c.queue_free()
		for row in rows:
			tray.add_child(_tray_button(String(row["id"]), row))
		_tray_ids = ids
	var buttons := tray.get_children()
	for i in rows.size():
		_style_slot(buttons[i], rows[i], theme)


func _tray_button(id: String, row: Dictionary) -> Button:
	var b := Button.new()
	b.name = "Slot_" + id.replace(":", "_")
	b.set_meta("room_id", id)
	b.text = row["text"]
	b.icon = row["icon"]
	b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	b.button_down.connect(func() -> void:
		if b.disabled:
			return
		# Enter/Space on a focused tray button: keyboard placement (WCAG 2.1.1).
		if Input.is_action_pressed("ui_accept") and not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			kb_select.call_deferred(id)
		else:
			begin_drag(id, true, get_viewport().get_mouse_position()))
	return b


func _style_slot(b: Button, row: Dictionary, theme: Theme) -> void:
	var placed := bool(row.get("placed", false))
	b.disabled = placed
	b.focus_mode = Control.FOCUS_NONE if placed else Control.FOCUS_ALL
	if placed:
		# Empty slot outline, same size: one stylebox draw instead of a
		# swatch + text + box, so a full board keeps the 2D draw budget.
		if b.text != "":
			b.set_meta("full_size", b.get_combined_minimum_size())
		b.custom_minimum_size = b.get_meta("full_size", b.custom_minimum_size)
		b.text = ""
		b.icon = null
		b.add_theme_stylebox_override("disabled", _empty_slot_box())
		b.accessibility_name = "%s (on the board)" % String(row["text"])
		b.tooltip_text = "%s is on the board (drag it there to move it, Undo takes it back)" % String(row["text"])
	else:
		b.text = row["text"]
		b.icon = row["icon"]
		b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
		b.remove_theme_stylebox_override("disabled")
		b.accessibility_name = String(row["text"])
		b.tooltip_text = "Drag onto the board, or tap then tap a spot"
	if row["selected"] and not placed:
		# From the HUD theme directly: b may not be in the tree yet.
		b.add_theme_stylebox_override("normal", theme.get_stylebox("pressed", "Button"))
	else:
		b.remove_theme_stylebox_override("normal")


static var _empty_box: StyleBoxFlat

## Outline-only box for a placed room's tray slot (2 px, ~3:1 on the HUD).
static func _empty_slot_box() -> StyleBoxFlat:
	if _empty_box == null:
		_empty_box = StyleBoxFlat.new()
		_empty_box.draw_center = false
		_empty_box.border_color = Color(0.45, 0.48, 0.56, 0.9)
		_empty_box.set_border_width_all(2)
		_empty_box.set_corner_radius_all(10)
	return _empty_box


## True when the room's tray slot is the empty (placed) outline.
func slot_is_empty(id: String) -> bool:
	var b := slot_button(id)
	return b != null and b.disabled and b.text == ""


## Tray slot button for a room id, or null.
func slot_button(id: String) -> Button:
	for b in tray.get_children():
		if String(b.get_meta("room_id", "")) == id and not b.is_queued_for_deletion():
			return b
	return null


## Ids in tray slot order (stable across placements).
func slot_ids() -> Array:
	return _tray_ids.duplicate()


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
	drag_active = false
	if _allowed.call(id, slot):
		if drag_from_tray:
			place_requested.emit(id, slot)
		else:
			move_requested.emit(id, slot)
		return
	# Refused: the red ghost shakes on the spot, the room goes back where it
	# came from (its tray slot, or its old board slot) and the level screen
	# says why.
	var why := _why_not(slot)
	if drag_from_tray:
		_refresh_validation.call()
	else:
		move_requested.emit(id, _placed[id])
	reject(id, slot, why, drag_from_tray)


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
	drag_active = false
	ghost.visible = false


## Why a spot is refused, in the words the status line already uses.
func _why_not(slot: Variant) -> String:
	if slot == null or not _in_board.call(slot):
		return "off the board"
	return "another room is there"


## Refused drop or tap: shake the red ghost where it was dropped (if that
## is on the ground at all), flash the room's tray slot, and tell the level
## screen (toast). Visual only; nothing is placed.
func reject(id: String, slot: Variant, why: String, from_tray: bool) -> void:
	_stop_reject()
	if slot != null:
		var at: Vector3 = _center.call(slot.x, slot.y) + Vector3(0, 0.3, 0)
		ghost.visible = true
		ghost.position = at
		ghost_mat.albedo_color = GHOST_BAD
		_reject_tween = create_tween()
		var side: Vector3 = Vector3(0.35, 0, 0)
		for k in 4:
			_reject_tween.tween_property(ghost, "position", at + (side if k % 2 == 0 else -side), SHAKE_SECONDS / 5.0)
		_reject_tween.tween_property(ghost, "position", at, SHAKE_SECONDS / 5.0)
		_reject_tween.tween_callback(func() -> void:
			if drag_id == "" and not kb_active and selected == "":
				ghost.visible = false)
	if from_tray:
		var b := slot_button(id)
		if b:
			if _flash_tween:
				_flash_tween.kill()
			b.self_modulate = Color(1.0, 0.45, 0.4)
			_flash_tween = create_tween()
			_flash_tween.tween_property(b, "self_modulate", Color.WHITE, 0.5)
	drop_rejected.emit(id, why, from_tray)


func is_rejecting() -> bool:
	return _reject_tween != null and _reject_tween.is_valid() and _reject_tween.is_running()


func _stop_reject() -> void:
	if _reject_tween and _reject_tween.is_valid():
		_reject_tween.kill()
	_reject_tween = null


func handle_drag_input(event: InputEvent) -> void:
	if drag_id == "":
		return
	if event is InputEventMouseMotion:
		drag_to(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		end_drag(event.position)
		get_viewport().set_input_as_handled()


func show_ghost(id: String, screen_pos: Vector2) -> void:
	_stop_reject()
	var slot = _screen_to_slot.call(screen_pos)
	if slot == null:
		ghost.visible = false
		_set_status.call("Can't place here: off the board.")
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
		if not b.is_queued_for_deletion() and not (b as Button).disabled:
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
			# A tap on a refused spot: same cue as a refused drop. The room
			# stays selected in its tray slot, so the next tap can retry.
			reject(selected, slot, _why_not(slot), false)
		return
	if slot != null:
		var here: String = _occupant.call(slot)
		if here != "":
			begin_drag(here, false, pos)
