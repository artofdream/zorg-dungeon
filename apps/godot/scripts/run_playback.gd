class_name ZorgRunPlayback
extends Node
## Play, Step, the spell buttons, and the turn line. The level screen
## steps and casts through the rules engine and passes the text in. [[NFR-1]]

signal play_toggled
signal step_requested
signal cast_requested(spell_id: int)
signal advance_requested

const STEP_SECONDS := 0.18

var turn_line: Label
var spell_bar: HBoxContainer
var play_button: Button
var step_button: Button

var _playing := false
var _timer := 0.0


func _init() -> void:
	name = "RunPlayback"
	# These controls are children of the HUD column and the bottom bar.
	# They take no anchors; a preset would fight those containers.
	turn_line = Label.new()
	turn_line.name = "TurnLine"
	turn_line.add_theme_font_size_override("font_size", 16)
	turn_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn_line.autowrap_mode = TextServer.AUTOWRAP_WORD
	spell_bar = HBoxContainer.new()
	spell_bar.name = "Spells"
	spell_bar.add_theme_constant_override("separation", 6)
	spell_bar.size_flags_vertical = Control.SIZE_SHRINK_END
	play_button = _bar_button("Play", play_toggled)
	step_button = _bar_button("Step", step_requested)


func set_playing(on: bool) -> void:
	_playing = on
	play_button.text = "Pause" if on else "Play"
	if on:
		_timer = 0.0


func is_playing() -> bool:
	return _playing


func set_turn_line(text: String) -> void:
	turn_line.text = text


func apply_turn_visible(running: bool) -> void:
	turn_line.visible = turn_line.text != "" or running


func set_spells(spells: Array, allowed: bool, show: bool) -> void:
	for c in spell_bar.get_children():
		c.queue_free()
	spell_bar.visible = show
	for i in spells.size():
		var idx := int(i)
		var sp: Dictionary = spells[i]
		var b := Button.new()
		b.text = _spell_label(sp["def"])
		b.custom_minimum_size = Vector2(120, ZorgHud.TARGET)
		b.disabled = bool(sp["consumed"]) or not allowed
		if sp["consumed"]:
			b.text += " (used)"
		b.pressed.connect(func() -> void: cast_requested.emit(idx))
		spell_bar.add_child(b)


func tick(delta: float) -> void:
	if not _playing:
		return
	_timer -= delta
	if _timer <= 0.0:
		_timer = STEP_SECONDS
		advance_requested.emit()


func _spell_label(def: Dictionary) -> String:
	match String(def["type"]):
		"Attack": return "Attack(%d)" % int(def["damage"])
		"Teleport": return "Teleport(%d)" % int(def["steps"])
	return String(def["type"])


func _bar_button(text: String, which: Signal) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	b.pressed.connect(func() -> void: which.emit())
	return b
