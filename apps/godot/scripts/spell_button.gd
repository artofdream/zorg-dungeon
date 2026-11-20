class_name ZorgSpellButton
extends Button
## Icon spell button for the run bar. Presentation only: the level
## screen still calls the engine to cast ([[NFR-1]], [[FR-32]], [[FR-33]]).

signal preview_started(spell_id: int)
signal preview_ended(spell_id: int)
signal activated(spell_id: int)

const LONG_PRESS := 0.45
const ICON_DIR := "res://assets/kenney/board-game-icons/"
const ICONS := {
	"Attack": "attack.png",
	"Teleport": "arrow_rotate.png",
	"Move": "card_place.png",
	"Swap": "hexagon_switch.png",
	"Selection": "card_target.png",
	"Sleep": "hourglass.png",
	"Wake": "lock_open.png",
	"Banality": "shield.png",
}

var spell_id := 0
var did_pulse := false
var pulsing := false
var _pressing := false
var _press_for := 0.0
var _icon: TextureRect
var _badge: Label
var _overlay: PanelContainer
var _overlay_label: Label
var _pulse: Tween
var _hovered := false
var _catcher: Control
var _suppress_press := false


func _init() -> void:
	custom_minimum_size = Vector2(ZorgHud.TARGET, ZorgHud.TARGET)
	focus_mode = Control.FOCUS_ALL
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	text = ""
	action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	_icon = TextureRect.new()
	_icon.name = "Icon"
	_icon.set_anchors_preset(Control.PRESET_FULL_RECT)
	_icon.offset_left = 6
	_icon.offset_top = 6
	_icon.offset_right = -6
	_icon.offset_bottom = -6
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	add_child(_icon)
	_badge = Label.new()
	_badge.name = "Badge"
	_badge.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_badge.offset_left = -22
	_badge.offset_top = 1
	_badge.offset_right = -2
	_badge.offset_bottom = 20
	_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_badge.add_theme_font_size_override("font_size", 14)
	_badge.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	_badge.add_theme_constant_override("outline_size", 4)
	_badge.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_badge.visible = false
	add_child(_badge)
	_overlay = PanelContainer.new()
	_overlay.name = "Overlay"
	_overlay.add_theme_stylebox_override("panel", ZorgHud.plate())
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.visible = false
	_overlay.z_index = 20
	_overlay_label = Label.new()
	_overlay_label.add_theme_font_size_override("font_size", 16)
	_overlay_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(_overlay_label)
	add_child(_overlay)
	mouse_entered.connect(func() -> void: _set_hover(true))
	mouse_exited.connect(func() -> void: _set_hover(false))
	focus_entered.connect(func() -> void: _set_hover(true))
	focus_exited.connect(func() -> void: _set_hover(false))
	button_down.connect(_on_down)
	button_up.connect(_on_up)
	pressed.connect(_on_native_pressed)
	_catcher = Control.new()
	_catcher.name = "Catcher"
	_catcher.set_anchors_preset(Control.PRESET_FULL_RECT)
	_catcher.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_catcher.gui_input.connect(_on_catcher_input)
	add_child(_catcher)
	set_process(false)


func apply(id: int, spell: Dictionary, allowed: bool, block_reason: String) -> void:
	spell_id = id
	name = "Spell%d" % id
	var def: Dictionary = spell["def"]
	var kind := String(def["type"])
	var title := _title(def)
	var consumed := bool(spell["consumed"])
	disabled = consumed or not allowed
	var tip := title
	if consumed:
		tip += " (used)"
	elif disabled and block_reason != "":
		tip += " — %s" % block_reason
	tooltip_text = tip
	_catcher.tooltip_text = tip
	_catcher.mouse_filter = Control.MOUSE_FILTER_STOP if disabled else Control.MOUSE_FILTER_IGNORE
	accessibility_name = title
	_overlay_label.text = tip
	_icon.texture = _texture_for(kind)
	_icon.modulate = Color(0.55, 0.57, 0.62) if disabled else Color.WHITE
	if kind == "Attack":
		_badge.text = str(int(def["damage"]))
		_badge.visible = true
	else:
		_badge.visible = false
	_apply_ready_style(not disabled)
	if _hovered and not disabled:
		preview_started.emit(spell_id)
	elif _hovered and disabled:
		preview_ended.emit(spell_id)


func pulse_once() -> void:
	did_pulse = true
	pulsing = true
	if _pulse and _pulse.is_valid():
		_pulse.kill()
	modulate = Color.WHITE
	_pulse = create_tween()
	_pulse.tween_property(self, "modulate", Color(1.35, 1.12, 0.55), 0.12)
	_pulse.tween_property(self, "modulate", Color(1.12, 1.02, 0.78), 0.16)
	_pulse.tween_property(self, "modulate", Color(1.28, 1.08, 0.6), 0.12)
	_pulse.tween_property(self, "modulate", Color(1.1, 1.02, 0.82), 0.2)
	_pulse.finished.connect(func() -> void: pulsing = false)


func reset_pulse() -> void:
	did_pulse = false
	pulsing = false
	if _pulse and _pulse.is_valid():
		_pulse.kill()
	modulate = Color.WHITE


func _title(def: Dictionary) -> String:
	match String(def["type"]):
		"Attack":
			return "Attack(%d)" % int(def["damage"])
		"Teleport":
			return "Teleport(%d)" % int(def["steps"])
	return String(def["type"])


func _texture_for(kind: String) -> Texture2D:
	var file := String(ICONS.get(kind, ""))
	if file == "":
		return null
	var tex: Texture2D = load(ICON_DIR + file)
	return tex


func _ready_box(bg: Color, border: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(2)
	s.set_corner_radius_all(10)
	s.content_margin_left = 8
	s.content_margin_right = 8
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	return s


func _apply_ready_style(on: bool) -> void:
	if on:
		add_theme_stylebox_override("normal", _ready_box(Color(0.22, 0.18, 0.10, 0.95), Color(1.0, 0.78, 0.28)))
		add_theme_stylebox_override("hover", _ready_box(Color(0.30, 0.24, 0.12, 0.98), Color(1.0, 0.88, 0.40)))
		add_theme_stylebox_override("pressed", _ready_box(Color(0.36, 0.28, 0.12, 1.0), Color(1.0, 0.92, 0.55)))
	else:
		remove_theme_stylebox_override("normal")
		remove_theme_stylebox_override("hover")
		remove_theme_stylebox_override("pressed")


func _set_hover(on: bool) -> void:
	_hovered = on
	if on and not disabled:
		preview_started.emit(spell_id)
	else:
		preview_ended.emit(spell_id)
		if not _pressing:
			_overlay.visible = false


func _on_down() -> void:
	_pressing = true
	_press_for = 0.0
	set_process(true)
	if not disabled:
		preview_started.emit(spell_id)


func _on_up() -> void:
	if _overlay.visible or _press_for >= LONG_PRESS:
		_suppress_press = true
	_pressing = false
	set_process(false)
	_overlay.visible = false


func _on_native_pressed() -> void:
	if _suppress_press:
		_suppress_press = false
		return
	if disabled:
		return
	activated.emit(spell_id)


func _on_catcher_input(event: InputEvent) -> void:
	if not disabled:
		return
	var down := false
	var up := false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		down = event.pressed
		up = not event.pressed
	elif event is InputEventScreenTouch:
		down = event.pressed
		up = not event.pressed
	else:
		return
	if down:
		_on_down()
	elif up:
		_on_up()
	accept_event()


func _process(delta: float) -> void:
	if not _pressing:
		return
	_press_for += delta
	if _press_for >= LONG_PRESS and not _overlay.visible:
		_overlay.visible = true
		_overlay.reset_size()
		_overlay.position = Vector2((size.x - _overlay.get_combined_minimum_size().x) / 2.0, -_overlay.get_combined_minimum_size().y - 4.0)
