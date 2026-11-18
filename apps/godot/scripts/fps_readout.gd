class_name ZorgFpsReadout
extends Label
## FPS counter in the top-right of the level screen. Visual only.
## The level screen calls set_visible_fps(), set_line(), and set_top_offset().
## F3 stays on the level screen (a popup already swallows that key) and
## calls toggle(), which emits toggled. This node does not read the rules
## engine and does not change quality (NFR-1).

signal toggled(shown: bool)

## Top-right anchors before the node enters the tree. set_anchors_preset()
## inside _ready leaves a control at 0×0. PRESET_TOP_RIGHT is the preset
## this label had when it lived in the level screen; it is not full-rect.
func _init() -> void:
	name = "FpsReadout"
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	add_theme_font_size_override("font_size", 16)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

func set_visible_fps(on: bool) -> void:
	if visible == on:
		return
	visible = on
	toggled.emit(on)

func toggle() -> void:
	set_visible_fps(not visible)

func set_line(text: String) -> void:
	self.text = text

## Drop the line below the top-right buttons. Called when the HUD lays out.
func set_top_offset(y: float) -> void:
	offset_top = y
