extends Node3D
## Replays engine events only. Nothing here can change an outcome.

const CELL := 1.0
const SCALE := 1.8       # round 7: figures ~2 cells tall (about one cell wide), easy to see on a phone
const LABEL_Y := 1.75    # head height (unscaled) for the HP label anchor

var _figures := {}
var _hp_labels := {}
var _hp := {}        # hero id -> last HP shown
var _gold := {}      # hero id -> coins carried
var _tweens := {}    # hero id -> this turn's move tween
var names := {}      # hero id -> "Warrior" / "Elf {water}" (set by the level)
var cam: Camera3D        # set by the level; labels are drawn in screen space
var overlay: Control     # layer above the room labels
var _plates := {}        # hero id -> PanelContainer holding _hp_labels[id]
var _floats: Array = []  # [Label, world position, age] hit numbers
var _rects: Array[Rect2] = []   # this frame's HP label rects (room labels avoid them)

func label_rects() -> Array[Rect2]:
	return _rects.duplicate()

func _name(id: int) -> String:
	return "%s %d" % [names.get(id, "Hero"), id + 1]

static func cell_to_world(c: Dictionary) -> Vector3:
	return Vector3((float(c["x"]) + 0.5) * CELL, 0.0, -(float(c["y"]) + 0.5) * CELL)

func clear() -> void:
	for child in get_children():
		child.queue_free()
	_figures.clear()
	for id in _plates:
		_plates[id].queue_free()
	_plates.clear()
	for fl in _floats:
		(fl[0] as Node).queue_free()
	_floats.clear()
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
	var body: Node3D = fig["body"]
	root.set_meta("body", body)
	root.set_meta("mats", fig["mats"])
	root.scale = Vector3.ONE * SCALE
	# Scale is about the origin, so it would raise the authored sole height
	# (FLOOR_H) off the slab. Shift under the scale; the hop still moves `body`.
	var base := Node3D.new()
	root.remove_child(body)
	base.add_child(body)
	base.position.y = ZorgLook.FLOOR_H * (1.0 / SCALE - 1.0)
	root.add_child(base)
	# Bright ring under the feet so the hero stands out from the floor.
	var ring := StandardMaterial3D.new()
	ring.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring.albedo_color = Color(1.0, 0.95, 0.5, 0.75)
	ZorgLook.add_mesh(base, ZorgLook.ring(0.2, 0.27), ring, Vector3(0, ZorgLook.FLOOR_H + 0.02, 0), false)
	_hp[id] = hp
	var plate := PanelContainer.new()
	plate.add_theme_stylebox_override("panel", ZorgHud.plate())
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var label := Label.new()
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color(1.0, 0.95, 0.7))
	label.text = _label_text(id)
	plate.add_child(label)
	if overlay:
		overlay.add_child(plate)
	else:
		add_child(plate)
	_hp_labels[id] = label
	_plates[id] = plate
	add_child(root)
	return root

## Screen-space HP labels above each head (stacked if two heroes share a
## spot) and rising hit numbers. Labels never sit behind room labels.
func _process(delta: float) -> void:
	if cam == null:
		return
	_rects = []
	var base := overlay.get_global_rect().position if overlay else Vector2.ZERO
	var taken: Array[Rect2] = []
	var body_rects: Array[Rect2] = []
	for id in _plates:
		var plate: Control = _plates[id]
		var f: Node3D = _figures.get(id)
		if f == null or not is_instance_valid(f) or not f.visible:
			plate.visible = false
			continue
		var w := f.global_position + Vector3(0, LABEL_Y * SCALE, 0)
		plate.visible = not cam.is_position_behind(w)
		var size := plate.get_combined_minimum_size()
		plate.size = size
		var r := Rect2(cam.unproject_position(w) - Vector2(size.x / 2.0, size.y), size)
		for t in taken:
			if t.intersects(r):
				r.position.y = t.position.y - size.y - 2.0
		taken.append(r)
		plate.position = r.position - base
		# The figure itself (feet to head): room labels keep off it too.
		var feet := cam.unproject_position(f.global_position)
		var half := absf(cam.unproject_position(f.global_position + cam.global_transform.basis.x * 0.5 * SCALE).x - feet.x)
		body_rects.append(Rect2(feet.x - half, r.end.y, half * 2.0, maxf(0.0, feet.y - r.end.y)))
	_rects = taken + body_rects
	for i in range(_floats.size() - 1, -1, -1):
		var fl: Array = _floats[i]
		fl[2] += delta
		var num: Label = fl[0]
		if fl[2] >= 0.8:
			num.queue_free()
			_floats.remove_at(i)
			continue
		var t: float = fl[2]
		var q := cam.unproject_position(fl[1]) - Vector2(num.size.x / 2.0, num.size.y + 40.0 * ease(t / 0.8, 0.4))
		num.position = q - base
		num.modulate.a = clampf(1.0 - (t - 0.2) / 0.6, 0.0, 1.0)

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
	var num := Label.new()
	num.text = ("-%d" if hurt else "+%d") % absi(amount)
	num.add_theme_font_size_override("font_size", 26)
	num.add_theme_color_override("font_color", tint.lightened(0.3))
	num.add_theme_constant_override("outline_size", 6)
	num.add_theme_color_override("font_outline_color", Color.BLACK)
	num.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if overlay:
		overlay.add_child(num)
	else:
		add_child(num)
	num.size = num.get_combined_minimum_size()
	_floats.append([num, f.global_position + Vector3(0.4, 1.2 * SCALE, 0), 0.0])

## Death: tip over, sink a little and fade out, then hide.
func _fade_out(f: Node3D) -> void:
	var tw := f.create_tween().set_parallel()
	tw.tween_property(f, "rotation_degrees:z", 80.0, 0.35).set_ease(Tween.EASE_IN)
	tw.tween_property(f, "position:y", -0.25, 0.7).set_delay(0.2)
	for m in f.get_meta("mats"):
		(m as StandardMaterial3D).transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		tw.tween_property(m, "albedo_color:a", 0.0, 0.6).set_delay(0.25)
	if _plates.has(f.get_meta("id", -1)):
		tw.tween_property(_plates[f.get_meta("id")], "modulate:a", 0.0, 0.6).set_delay(0.25)
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
				if _plates.has(id):
					_plates[id].queue_free()
					_plates.erase(id)
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
