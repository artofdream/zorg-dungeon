class_name ZorgLevelPicker
extends Control
## Level grid and the corner Level button. The level screen passes the
## list of levels in. This node does not read the rules engine (NFR-1).

signal level_picked(index: int)
signal closed
signal quality_toggled

var level_button: Button
var panel: PanelContainer
var grid: GridContainer
var quality_button: Button

## Full-rect root so the corner button and the centered grid share the HUD.
## Anchors are set before add_child. The root ignores the mouse so the
## board still receives taps outside the button and the panel.
func _init() -> void:
	name = "LevelPicker"
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	level_button = Button.new()
	level_button.text = "Levels"
	level_button.custom_minimum_size = Vector2(134, ZorgHud.TARGET)
	level_button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	level_button.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	level_button.pressed.connect(_toggle)
	add_child(level_button)

	panel = PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	panel.visible = false
	add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	panel.add_child(box)
	var title := Label.new()
	title.add_theme_font_size_override("font_size", 18)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = "Choose a level"
	box.add_child(title)
	grid = GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	box.add_child(grid)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	box.add_child(row)
	quality_button = Button.new()
	quality_button.text = "Graphics: Low"
	quality_button.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	quality_button.custom_minimum_size.x = 180
	quality_button.tooltip_text = "High: more torches, shadows and glow. Low: faster."
	quality_button.pressed.connect(func(): quality_toggled.emit())
	row.add_child(quality_button)
	var close := Button.new()
	close.text = "Close"
	close.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	close.pressed.connect(close_panel)
	row.add_child(close)

## rows: [{label, tip}] in the order the level screen will open them.
func set_entries(rows: Array) -> void:
	for c in grid.get_children():
		c.queue_free()
	for i in rows.size():
		var idx := i
		var row: Dictionary = rows[i]
		var b := Button.new()
		b.text = String(row["label"])
		b.tooltip_text = String(row["tip"])
		b.custom_minimum_size = Vector2(72, ZorgHud.TARGET)
		b.pressed.connect(func(): level_picked.emit(idx))
		grid.add_child(b)

func set_current(index: int) -> void:
	for b in grid.get_children():
		if b is Button and not b.is_queued_for_deletion():
			b.modulate = Color(1, 1, 0.5) if b.get_index() == index else Color.WHITE

func set_caption(text: String) -> void:
	level_button.text = text

func set_quality_label(text: String) -> void:
	quality_button.text = text

func set_open(on: bool) -> void:
	panel.visible = on

func close_panel() -> void:
	if not panel.visible:
		return
	panel.visible = false
	closed.emit()

func _toggle() -> void:
	set_open(not panel.visible)
