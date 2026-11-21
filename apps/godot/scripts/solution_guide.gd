class_name ZorgSolutionGuide
extends PanelContainer
## FR-47 caption plate for "Show a solution": step counter, the engine's
## reason for the step (with its rule IDs), and Pause / Next / Stop.
## It sits in the HUD text column, so it never covers the tray, the run
## controls or the Levels / ? corner. Shows text only; the reasons are
## written by the TS engine (NFR-1).

signal pause_toggled
signal next_pressed
signal stop_pressed

var header: Label
var text: Label
var pause_button: Button
var next_button: Button
var stop_button: Button

func _init() -> void:
	name = "SolutionGuide"
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", ZorgHud.plate())
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)
	header = Label.new()
	header.name = "Header"
	header.add_theme_font_size_override("font_size", 14)
	header.mouse_filter = Control.MOUSE_FILTER_IGNORE
	header.autowrap_mode = TextServer.AUTOWRAP_WORD
	col.add_child(header)
	text = Label.new()
	text.name = "Text"
	text.add_theme_font_size_override("font_size", 16)
	text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text.autowrap_mode = TextServer.AUTOWRAP_WORD
	col.add_child(text)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	pause_button = _button("Pause", pause_toggled)
	next_button = _button("Next", next_pressed)
	stop_button = _button("Stop", stop_pressed)
	for b in [pause_button, next_button, stop_button]:
		row.add_child(b)

func _button(label: String, which: Signal) -> Button:
	var b := Button.new()
	b.text = label
	b.custom_minimum_size = Vector2(76, ZorgHud.TARGET)
	b.pressed.connect(func() -> void: which.emit())
	return b

## `width`: the HUD text column width in UI units.
func set_width(width: float) -> void:
	custom_minimum_size.x = width
	text.custom_minimum_size.x = maxf(0.0, width - 16.0)
	header.custom_minimum_size.x = maxf(0.0, width - 16.0)

func show_step(head: String, body: String, rules: Array) -> void:
	header.text = head + ("" if rules.is_empty() else "  ·  " + " ".join(rules))
	text.text = body
	visible = true

func set_playing(on: bool) -> void:
	pause_button.text = "Pause" if on else "Play"

## Message-only state (no stored solution): just a Close button.
func show_message(body: String) -> void:
	header.text = "Show a solution"
	text.text = body
	pause_button.visible = false
	next_button.visible = false
	stop_button.text = "Close"
	visible = true

func show_controls(pause_on: bool, next_on: bool) -> void:
	pause_button.visible = pause_on
	next_button.visible = next_on
	stop_button.text = "Stop" if pause_on or next_on else "Close"

func close() -> void:
	visible = false
