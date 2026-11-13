extends Node3D
## Replays engine events only. Nothing here can change an outcome.

const CELL := 1.0

var _figures := {}
var _hp_labels := {}
var _hp := {}        # hero id -> last HP shown
var _gold := {}      # hero id -> coins carried
var _tweens := {}    # hero id -> this turn's move tween
var names := {}      # hero id -> "Warrior" / "Elf {water}" (set by the level)

func _name(id: int) -> String:
	return "%s %d" % [names.get(id, "Hero"), id + 1]

static func cell_to_world(c: Dictionary) -> Vector3:
	return Vector3((float(c["x"]) + 0.5) * CELL, 0.0, -(float(c["y"]) + 0.5) * CELL)

func clear() -> void:
	for child in get_children():
		child.queue_free()
	_figures.clear()
	_hp_labels.clear()
	_hp.clear()
	_gold.clear()
	_tweens.clear()

func _label_text(id: int) -> String:
	var g := int(_gold.get(id, 0))
	return "%s HP %d" % [_name(id), int(_hp.get(id, 0))] + ("  $%d" % g if g > 0 else "")

func _refresh_label(id: int) -> void:
	if _hp_labels.has(id):
		_hp_labels[id].text = _label_text(id)

## Stop a running move tween so it can't drag a teleported figure back.
func _stop_tween(id: int) -> void:
	var tw: Tween = _tweens.get(id)
	if tw and tw.is_valid():
		tw.kill()
	_tweens.erase(id)
	var f: Node3D = _figures.get(id)
	if f and f.has_meta("body"):
		(f.get_meta("body") as Node3D).position.y = 0.0

func _figure(id: int, hp: int) -> Node3D:
	var fig := ZorgLook.hero_figure(String(names.get(id, "")).begins_with("Elf"))
	var root: Node3D = fig["root"]
	root.set_meta("body", fig["body"])
	root.set_meta("mats", fig["mats"])
	var label := Label3D.new()
	_hp[id] = hp
	label.text = _label_text(id)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 44
	label.pixel_size = 0.012
	label.position.y = 1.85
	label.outline_size = 10
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(label)
	_hp_labels[id] = label
	add_child(root)
	return root

## Juice (visual only): a short red/green flash and a floating number.
func _flash(id: int, amount: int) -> void:
	var f: Node3D = _figures.get(id)
	if not f:
		return
	var hurt := amount > 0
	var tint := Color(1.0, 0.1, 0.05) if hurt else Color(0.2, 1.0, 0.3)
	for m in f.get_meta("mats"):
		var tw := f.create_tween()
		tw.tween_property(m, "emission", tint, 0.06)
		tw.tween_property(m, "emission", Color.BLACK, 0.3)
	var num := Label3D.new()
	num.text = ("-%d" if hurt else "+%d") % absi(amount)
	num.modulate = tint.lightened(0.2)
	num.font_size = 72
	num.pixel_size = 0.01
	num.outline_size = 14
	num.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	num.no_depth_test = true
	num.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	num.position = f.position + Vector3(0.35, 1.4, 0)
	add_child(num)
	var nt := num.create_tween().set_parallel()
	nt.tween_property(num, "position:y", num.position.y + 0.9, 0.8).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	nt.tween_property(num, "modulate:a", 0.0, 0.8).set_delay(0.2)
	nt.chain().tween_callback(num.queue_free)

## Death: tip over, sink a little and fade out, then hide.
func _fade_out(f: Node3D) -> void:
	var tw := f.create_tween().set_parallel()
	tw.tween_property(f, "rotation_degrees:z", 80.0, 0.35).set_ease(Tween.EASE_IN)
	tw.tween_property(f, "position:y", -0.25, 0.7).set_delay(0.2)
	for m in f.get_meta("mats"):
		(m as StandardMaterial3D).transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		tw.tween_property(m, "albedo_color:a", 0.0, 0.6).set_delay(0.25)
	if _hp_labels.has(f.get_meta("id", -1)):
		tw.tween_property(_hp_labels[f.get_meta("id")], "modulate:a", 0.0, 0.6).set_delay(0.25)
	tw.chain().tween_callback(func(): f.visible = false)

## One cell of movement: slide, with a small hop, facing the way it goes.
func _step_to(tw: Tween, f: Node3D, to: Vector3) -> void:
	var body: Node3D = f.get_meta("body")
	tw.tween_callback(func():
		var d := to - f.position
		if d.length() > 0.01:
			f.rotation.y = atan2(d.x, d.z))
	tw.tween_property(f, "position", to, 0.13).set_trans(Tween.TRANS_SINE)
	tw.parallel().tween_property(body, "position:y", 0.16, 0.065).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(body, "position:y", 0.0, 0.065).set_ease(Tween.EASE_IN).set_delay(0.065)

## Apply one turn's events. Returns a short line for the log. Moves in one
## turn (an ice slide) chain into one tween; a teleport or the waiting room
## kills it first, so the figure stays where the engine put it.
func apply_turn(events: Array) -> String:
	var lines: Array = []
	var moved := {}
	for e in events:
		var id := int(e.get("heroId", -1))
		match String(e["type"]):
			"spawn":
				_stop_tween(id)
				var f := _figure(id, int(_hp.get(id, 0)))
				f.set_meta("id", id)
				f.position = cell_to_world(e["cell"])
				_figures[id] = f
				lines.append("%s appears in %s" % [_name(id), e["roomId"]])
			"move":
				var f: Node3D = _figures.get(id)
				if f:
					if not moved.has(id):
						_stop_tween(id)
						_tweens[id] = f.create_tween()   # dies with the figure
						moved[id] = true
					_step_to(_tweens[id], f, cell_to_world(e["to"]))
			"enter":
				lines.append("enters %s" % e["roomId"])
			"pickup":
				_gold[id] = int(e["gold"])
				_refresh_label(id)
				lines.append("picks up %d gold" % int(e["amount"]))
			"toll":
				_gold[id] = int(e["gold"])
				_refresh_label(id)
				var back: Array = []
				for r in e["refunds"]:
					back.append("%d to %s" % [int(r["amount"]), r["roomId"]])
				lines.append("pays a %d gold toll (%s)" % [int(e["amount"]), ", ".join(back)])
			"gold_drop":
				_gold[id] = 0
				_refresh_label(id)
				lines.append("drops %d gold in %s" % [int(e["amount"]), e["roomId"]])
			"damage":
				_hp[id] = int(e["hp"])
				_refresh_label(id)
				if int(e["amount"]) != 0:
					# Show the hit where the hero lands, after this turn's move.
					var mt: Tween = _tweens.get(id)
					if moved.has(id) and mt and mt.is_valid():
						mt.tween_callback(_flash.bind(id, int(e["amount"])))
					else:
						_flash(id, int(e["amount"]))
				if int(e["amount"]) < 0:
					lines.append("heals %d (HP %d)" % [-int(e["amount"]), int(e["hp"])])
				else:
					lines.append("takes %d damage (HP %d)" % [int(e["amount"]), int(e["hp"])])
			"death":
				var f: Node3D = _figures.get(id)
				if f:
					# Let this turn's move finish first, then fade.
					var tw: Tween = _tweens.get(id)
					if moved.has(id) and tw and tw.is_valid():
						tw.tween_callback(_fade_out.bind(f))
					else:
						_fade_out(f)
				lines.append("%s dies" % _name(id))
			"wait":
				lines.append("waits")
			"cast":
				lines.append("spell %s cast" % String(e["spellType"]))
			"teleport":
				_stop_tween(id)
				var f: Node3D = _figures.get(id)
				if f:
					f.position = cell_to_world(e["to"])
				lines.append("%s teleports to %s" % [_name(id), e["toRoomId"]])
			"wait_room":
				_stop_tween(id)
				var f: Node3D = _figures.get(id)
				if f:
					f.queue_free()
					_figures.erase(id)
					_hp_labels.erase(id)
				lines.append("%s goes back to the waiting room" % _name(id))
			"loss":
				lines.append("reaches Zorg!")
			"win":
				lines.append("every hero is dead")
			"stalemate":
				lines.append("stalemate")
	return ", ".join(lines)

## Show HP (and gold) on spawn (spawn events carry no HP).
func set_start_hp(id: int, hp: int, gold: int = 0) -> void:
	_hp[id] = hp
	_gold[id] = gold
	_refresh_label(id)
