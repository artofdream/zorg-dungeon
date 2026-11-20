class_name ZorgCamPadButton
extends Button
## Icon camera-pad button. Desktop hover uses tooltip_text; a long press
## (phones, and a held mouse) shows the same accessible name as a plate
## beside the pad. Visual only: it never reads the rules engine.

const HOLD := 0.45
const ICON := 32

var label_text := ""
var _held := 0.0
var _down := false

static var _hint: Label


func setup(id: String, tex: Texture2D, accessible: String, cb: Callable) -> void:
	name = id
	icon = tex
	expand_icon = true
	text = ""
	tooltip_text = accessible
	label_text = accessible
	accessibility_name = accessible
	focus_mode = Control.FOCUS_ALL
	custom_minimum_size = Vector2(ZorgHud.TARGET, ZorgHud.TARGET)
	add_theme_constant_override("icon_max_width", ICON)
	pressed.connect(cb)
	gui_input.connect(_on_gui_input)
	set_process(false)


func set_accessible(accessible: String) -> void:
	label_text = accessible
	tooltip_text = accessible
	accessibility_name = accessible


func _on_gui_input(event: InputEvent) -> void:
	var press := false
	if event is InputEventScreenTouch:
		press = true
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		press = true
	if not press:
		return
	if event.pressed:
		_down = true
		_held = 0.0
		set_process(true)
	else:
		_down = false
		set_process(false)
		_hide_hint()


func _process(delta: float) -> void:
	if not _down:
		set_process(false)
		return
	_held += delta
	if _held >= HOLD:
		_show_hint()
		set_process(false)


func _show_hint() -> void:
	var h := _hint_label()
	h.text = label_text
	h.visible = true
	# Pad sits on the right: put the plate to the left of this button.
	h.reset_size()
	var r := get_global_rect()
	h.global_position = Vector2(r.position.x - h.size.x - 8.0, r.position.y + (r.size.y - h.size.y) / 2.0)


func _hide_hint() -> void:
	if _hint:
		_hint.visible = false


func _hint_label() -> Label:
	if _hint and is_instance_valid(_hint):
		return _hint
	var h := Label.new()
	h.name = "CamPadHint"
	h.visible = false
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_theme_color_override("font_color", Color(0.95, 0.96, 1.0))
	h.add_theme_stylebox_override("normal", ZorgHud.plate())
	# Prefer the HUD root (child of the UI CanvasLayer) so the plate is
	# not clipped by the grid and stays in the same canvas.
	var host: Node = self
	while host:
		var p: Node = host.get_parent()
		if p is CanvasLayer and host is Control:
			break
		host = p
	if host == null or not (host is Control):
		host = get_parent()
	host.add_child(h)
	_hint = h
	return h
