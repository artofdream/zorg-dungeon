class_name ZorgRunPlayback
extends Node
## Play, Step, the spell buttons, and the turn line. The level screen
## steps and casts through the rules engine and passes the text in. [[NFR-1]]

signal play_toggled
signal step_requested
signal cast_requested(spell_id: int)
signal advance_requested
signal preview_started(spell_id: int)
signal preview_ended(spell_id: int)
signal spell_hint_dismissed

const STEP_SECONDS := 0.18

var turn_line: Label
var spell_wrap: VBoxContainer
var spell_bar: HBoxContainer
var play_button: Button
var step_button: Button
var play_hint: Label
var spell_hint: PanelContainer

var _playing := false
var _timer := 0.0
var _window_open := false
var window_just_opened := false
var _buttons: Array = []
var _has_unused := false


func _init() -> void:
	name = "RunPlayback"
	# These controls are children of the HUD column and the bottom bar.
	# They take no anchors; a preset would fight those containers.
	turn_line = Label.new()
	turn_line.name = "TurnLine"
	turn_line.add_theme_font_size_override("font_size", 16)
	turn_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn_line.autowrap_mode = TextServer.AUTOWRAP_WORD
	spell_wrap = VBoxContainer.new()
	spell_wrap.name = "SpellWrap"
	spell_wrap.add_theme_constant_override("separation", 4)
	spell_wrap.size_flags_vertical = Control.SIZE_SHRINK_END
	play_hint = Label.new()
	play_hint.name = "PlayHint"
	play_hint.text = "Pause to cast a spell"
	play_hint.visible = false
	play_hint.add_theme_font_size_override("font_size", 14)
	play_hint.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	play_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	spell_wrap.add_child(play_hint)
	spell_hint = _make_spell_hint()
	spell_wrap.add_child(spell_hint)
	spell_bar = HBoxContainer.new()
	spell_bar.name = "Spells"
	spell_bar.add_theme_constant_override("separation", 6)
	spell_bar.size_flags_vertical = Control.SIZE_SHRINK_END
	spell_wrap.add_child(spell_bar)
	play_button = _bar_button("Play", play_toggled)
	step_button = _bar_button("Step", step_requested)


func set_playing(on: bool) -> void:
	_playing = on
	play_button.text = "Pause" if on else "Play"
	if on:
		_timer = 0.0
	_refresh_play_hint()


func is_playing() -> bool:
	return _playing


func set_turn_line(text: String) -> void:
	turn_line.text = text


func apply_turn_visible(running: bool) -> void:
	turn_line.visible = turn_line.text != "" or running


func set_spells(spells: Array, allowed: bool, show: bool, block_reason: String = "", playing: bool = false) -> void:
	spell_wrap.visible = show
	spell_bar.visible = show
	_playing = playing
	_has_unused = false
	while _buttons.size() > spells.size():
		var extra: Control = _buttons.pop_back()
		extra.queue_free()
	for i in spells.size():
		var idx := int(i)
		var sp: Dictionary = spells[i]
		if not bool(sp["consumed"]):
			_has_unused = true
		var b: ZorgSpellButton
		if idx < _buttons.size() and is_instance_valid(_buttons[idx]):
			b = _buttons[idx]
		else:
			b = ZorgSpellButton.new()
			b.pressed.connect(func() -> void: cast_requested.emit(b.spell_id))
			b.preview_started.connect(func(sid: int) -> void: preview_started.emit(sid))
			b.preview_ended.connect(func(sid: int) -> void: preview_ended.emit(sid))
			spell_bar.add_child(b)
			if idx < _buttons.size():
				_buttons[idx] = b
			else:
				_buttons.append(b)
		b.apply(idx, sp, allowed, block_reason)
	var window := show and allowed and _has_unused
	window_just_opened = window and not _window_open
	if window_just_opened:
		for b in _buttons:
			if is_instance_valid(b) and not b.disabled:
				b.pulse_once()
	elif not window:
		for b in _buttons:
			if is_instance_valid(b):
				b.reset_pulse()
	_window_open = window
	if not show:
		show_spell_hint(false)
		play_hint.visible = false
	else:
		_refresh_play_hint()


func show_spell_hint(on: bool) -> void:
	spell_hint.visible = on


func tick(delta: float) -> void:
	if not _playing:
		return
	_timer -= delta
	if _timer <= 0.0:
		_timer = STEP_SECONDS
		advance_requested.emit()


func _refresh_play_hint() -> void:
	play_hint.visible = spell_bar.visible and _playing and _has_unused


func _bar_button(text: String, which: Signal) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	b.pressed.connect(func() -> void: which.emit())
	return b


func _make_spell_hint() -> PanelContainer:
	var plate := PanelContainer.new()
	plate.name = "SpellHint"
	plate.visible = false
	plate.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	plate.add_theme_stylebox_override("panel", ZorgHud.plate())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	plate.add_child(row)
	var label := Label.new()
	label.name = "Text"
	label.add_theme_font_size_override("font_size", 16)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text = "Cast a spell between steps to hit the heroes"
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(label)
	var got_it := Button.new()
	got_it.name = "GotIt"
	got_it.text = "Got it"
	got_it.custom_minimum_size = Vector2(64, ZorgHud.TARGET)
	got_it.pressed.connect(_dismiss_spell_hint)
	row.add_child(got_it)
	return plate


func _dismiss_spell_hint() -> void:
	if not spell_hint.visible:
		return
	spell_hint.visible = false
	spell_hint_dismissed.emit()
