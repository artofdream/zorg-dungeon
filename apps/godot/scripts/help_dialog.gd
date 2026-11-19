class_name ZorgHelpDialog
extends Control
## "?" room legend. Wording stays in ZorgHelp. This node only shows it.
## It does not read the rules engine and does not decide an outcome (NFR-1).

signal closed

var scroll: ScrollContainer
var legend: VBoxContainer

## Full-rect anchors before the node enters the tree. set_anchors_preset()
## inside _ready leaves the overlay at 0×0.
func _init() -> void:
	name = "HelpDialog"
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
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
	title.text = "Rooms (from the game rules)"
	box.add_child(title)

	scroll = ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	legend = VBoxContainer.new()
	legend.add_theme_constant_override("separation", 8)
	legend.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(legend)
	ZorgHelp.fill(legend, 520)

	var close := Button.new()
	close.text = "Close"
	close.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	close.custom_minimum_size.x = 120
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(close_dialog)
	box.add_child(close)

## `area` is the HUD root size in UI units, inside the safe area.
func open(area: Vector2) -> void:
	scroll.custom_minimum_size = Vector2(minf(680.0, area.x - 60.0), maxf(140.0, area.y - 150.0))
	ZorgHelp.fill(legend, scroll.custom_minimum_size.x - 160.0)
	visible = true

func close_dialog() -> void:
	if not visible:
		return
	visible = false
	closed.emit()
