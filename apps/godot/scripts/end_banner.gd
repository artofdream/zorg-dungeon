class_name ZorgEndBanner
extends VBoxContainer
## Win, loss, and "not won yet" line, plus the Next level button.
## The level screen reads the engine score and passes the sentence in.
## This node does not read the rules engine and does not pick an outcome (NFR-1).

signal next_level_pressed

var line_label: Label
var next_button: Button

## Top-left anchors before the node enters the tree. The parent column is a
## VBox and switches this control to container layout on add_child.
## PRESET_FULL_RECT is the wrong preset: this is one row of the HUD column,
## not a screen-filling modal. set_anchors_preset() inside _ready leaves a
## control at 0×0, so the preset is set here in _init.
func _init() -> void:
	name = "EndBanner"
	set_anchors_preset(Control.PRESET_TOP_LEFT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 2)
	visible = false

	line_label = Label.new()
	line_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	line_label.add_theme_font_size_override("font_size", 22)
	line_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45))
	line_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(line_label)

	next_button = Button.new()
	next_button.name = "NextLevel"
	next_button.set_anchors_preset(Control.PRESET_TOP_LEFT)
	next_button.text = "Next level >"
	next_button.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	next_button.custom_minimum_size.x = 150
	next_button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	next_button.visible = false
	next_button.pressed.connect(func(): next_level_pressed.emit())
	add_child(next_button)

## The level screen already chose the words. show_next is only the button.
func show_line(text: String, show_next: bool) -> void:
	line_label.text = text
	next_button.visible = show_next
	apply_visibility()

func clear() -> void:
	show_line("", false)

## Empty text takes no row. Returns whether the line is on screen.
func apply_visibility() -> bool:
	var showing := line_label.text != ""
	line_label.visible = showing
	if not showing:
		next_button.visible = false
	visible = showing
	return showing

func is_showing() -> bool:
	return visible and line_label.text != ""

## Same rects the level screen used when the line and the button were
## direct children of the HUD column. Label width is the drawn text.
func line_rects() -> Array[Rect2]:
	var out: Array[Rect2] = []
	if not is_visible_in_tree():
		return out
	for c in get_children():
		var ctl := c as Control
		if ctl == null or not ctl.is_visible_in_tree():
			continue
		var r := ctl.get_global_rect()
		if ctl is Label:
			var l := ctl as Label
			if l.text.strip_edges() == "":
				continue
			var sz := l.get_theme_font("font").get_multiline_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, r.size.x, l.get_theme_font_size("font_size"))
			r.size.x = minf(sz.x + 8.0, r.size.x)
		out.append(r)
	return out
