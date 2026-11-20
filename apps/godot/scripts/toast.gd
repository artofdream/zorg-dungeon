class_name ZorgToast
extends PanelContainer
## Short message over the board ("Can't place here: off the board"). Shows
## for a moment, then fades. Mouse passes through. Visual only. [[NFR-1]]

const SHOW_SECONDS := 1.6
const FADE_SECONDS := 0.35

var label: Label
var last_text := ""
var _tween: Tween


func _init() -> void:
	name = "Toast"
	visible = false
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := ZorgHud.plate()
	box.bg_color = Color(0.32, 0.06, 0.06, 0.92)        # dark red plate, white text ~11:1
	box.border_color = Color(1.0, 0.55, 0.5)
	box.content_margin_left = 14
	box.content_margin_right = 14
	box.content_margin_top = 8
	box.content_margin_bottom = 8
	add_theme_stylebox_override("panel", box)
	label = Label.new()
	label.name = "Text"
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color(1, 1, 1))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)


## Show `text` centred horizontally, its bottom edge at `bottom_y` (in the
## parent's space), then fade out. A new message restarts the timer.
func show_text(text: String, center_x: float, bottom_y: float) -> void:
	last_text = text
	label.text = text
	visible = true
	modulate.a = 1.0
	reset_size()
	var sz := get_combined_minimum_size()
	size = sz
	position = Vector2(center_x - sz.x / 2.0, bottom_y - sz.y)
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween()
	_tween.tween_interval(SHOW_SECONDS)
	_tween.tween_property(self, "modulate:a", 0.0, FADE_SECONDS)
	_tween.tween_callback(func() -> void: visible = false)


func hide_now() -> void:
	if _tween and _tween.is_valid():
		_tween.kill()
	visible = false
