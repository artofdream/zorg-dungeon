class_name ZorgLevelPicker
extends Control
## Level grid and the corner Level button. The level screen passes the
## list of levels in. This node does not read the rules engine (NFR-1).

signal level_picked(index: int)
signal closed
signal quality_toggled

var level_button: Button
var overlay: Control        # dimmed full-screen backdrop: the picker is modal
var panel: PanelContainer
var scroll: ScrollContainer
var grid: GridContainer
var quality_button: Button

const CELL_W := 72.0
const GAP := 6.0

## Full-rect root so the corner button and the centered grid share the HUD.
## Anchors are set before add_child. The root ignores the mouse so the
## board still receives taps outside the button while the grid is closed.
## The level screen mounts this node on its own CanvasLayer above the HUD,
## so the open grid draws over the room tray and run controls; the backdrop
## stops taps reaching the tray and the board (a tap on it closes the grid).
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

	overlay = Control.new()
	overlay.name = "Modal"
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay.visible = false
	overlay.gui_input.connect(_on_backdrop_input)
	add_child(overlay)
	var dim := ColorRect.new()
	dim.name = "Dim"
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.offset_left = -64                    # also under the safe-area margins
	dim.offset_top = -64
	dim.offset_right = 64
	dim.offset_bottom = 64
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(center)

	panel = PanelContainer.new()
	panel.name = "Panel"
	panel.visible = false
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	panel.add_child(box)
	var title := Label.new()
	title.add_theme_font_size_override("font_size", 18)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = "Choose a level"
	box.add_child(title)
	# The grid scrolls when the screen is too short for every row, so the
	# Graphics and Close row below it always stays on screen.
	scroll = ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	grid = GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation", int(GAP))
	grid.add_theme_constant_override("v_separation", int(GAP))
	scroll.add_child(grid)
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

func is_open() -> bool:
	return overlay.visible

func set_open(on: bool) -> void:
	if on:
		_fit()
	# This node sits on its own CanvasLayer, so Tab never leaves the HUD
	# tree and Enter still presses the button under the backdrop. Opening
	# (not a re-fit of an already open grid) moves focus into the grid.
	var opening := on and not overlay.visible
	overlay.visible = on
	panel.visible = on
	if opening:
		_focus_grid.call_deferred()

## First level button, once the open frame has shown the grid. A close
## that wins the race with this deferred call leaves focus where it was.
func _focus_grid() -> void:
	if not overlay.visible:
		return
	for b in grid.get_children():
		if b is Button and not b.is_queued_for_deletion():
			b.grab_focus()
			return
	quality_button.grab_focus()

func close_panel() -> void:
	if not overlay.visible:
		return
	overlay.visible = false
	panel.visible = false
	closed.emit()

func _toggle() -> void:
	set_open(not overlay.visible)

func _on_backdrop_input(event: InputEvent) -> void:
	# A tap or click on the dimmed area (outside the panel) closes the grid.
	var tap: bool = (event is InputEventMouseButton and event.pressed) or (event is InputEventScreenTouch and event.pressed)
	if tap:
		accept_event()
		close_panel()

## Fit the panel inside this node's rect (the HUD root, already inside the
## safe area): fewer columns on narrow screens, and a scrolling grid when
## the rows would push the bottom buttons off a short screen.
func _fit() -> void:
	var area := size
	if area.x < 1.0 or area.y < 1.0:
		area = get_viewport_rect().size
	var count := 0
	for b in grid.get_children():
		if not b.is_queued_for_deletion():
			count += 1
	var cols := clampi(int((area.x - 48.0 + GAP) / (CELL_W + GAP)), 2, 5)
	grid.columns = cols
	var rows := ceili(float(maxi(count, 1)) / cols)
	var grid_w := cols * CELL_W + (cols - 1) * GAP
	var grid_h := rows * ZorgHud.TARGET + (rows - 1) * GAP
	scroll.custom_minimum_size = Vector2(grid_w, 0)
	var chrome := panel.get_combined_minimum_size().y
	var room := area.y - chrome - 16.0
	scroll.custom_minimum_size.y = clampf(room, minf(grid_h, ZorgHud.TARGET), grid_h)
