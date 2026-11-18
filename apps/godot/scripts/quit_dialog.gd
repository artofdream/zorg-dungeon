class_name ZorgQuitDialog
extends Control
## "Quit Zorg?" modal, extracted from the level screen. Visual only.
## The level screen calls open(), close(), and set_quit_offered().
## quit_requested means the player pressed Quit. This node does not
## quit the process or touch the rules engine (NFR-1).
## dismissed means the dialog went from open to closed without quitting.

signal dismissed
signal quit_requested

var stay_button: Button
var quit_button: Button

func _ready() -> void:
	name = "QuitDialog"
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP     # taps don't reach the board
	visible = false

	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.offset_left = -64
	dim.offset_top = -64
	dim.offset_right = 64
	dim.offset_bottom = 64
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var panel := PanelContainer.new()
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)

	var title := Label.new()
	title.add_theme_font_size_override("font_size", 22)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = "Quit Zorg?"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(row)
	stay_button = _button("Stay")
	stay_button.custom_minimum_size.x = 120
	stay_button.pressed.connect(close)
	row.add_child(stay_button)
	quit_button = _button("Quit")
	quit_button.custom_minimum_size.x = 120
	quit_button.pressed.connect(func(): quit_requested.emit())
	row.add_child(quit_button)

func _button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)   # >= 48 dp once scaled
	return b

## Show the question and focus Stay, so Enter keeps the player in the game.
func open() -> void:
	visible = true
	stay_button.grab_focus.call_deferred()

## Hide the question. A second close does nothing.
func close() -> void:
	if not visible:
		return
	visible = false
	dismissed.emit()

## Embedded (itch.io iframe): no Quit button, and an open dialog closes.
func set_quit_offered(on: bool) -> void:
	quit_button.visible = on
	if not on:
		close()
