class_name ZorgHint
extends PanelContainer
## First-run hint under the goal line. "Got it" hides it and emits
## hint_dismissed. The level screen saves that and refits the camera.
## The settings key stays in ZorgHelp. This node does not write the file.

signal hint_dismissed

## Top-left anchors before the node enters the tree. The HUD column is a
## VBox and switches this plate to container layout on add_child.
func _init() -> void:
	name = "Hint"
	set_anchors_preset(Control.PRESET_TOP_LEFT)
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	add_theme_stylebox_override("panel", ZorgHud.plate())

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	add_child(row)
	var label := Label.new()
	label.add_theme_font_size_override("font_size", 16)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text = "New here? Tap ? to see what each room does."
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(label)
	var got_it := Button.new()
	got_it.text = "Got it"
	got_it.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	got_it.pressed.connect(dismiss)
	row.add_child(got_it)

func show_hint(on: bool) -> void:
	visible = on

## Hide only when the plate is showing, then tell the level screen.
func dismiss() -> void:
	if not visible:
		return
	visible = false
	hint_dismissed.emit()
