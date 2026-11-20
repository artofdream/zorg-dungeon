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
var _dead := {}          # hero id -> true once the engine reports its death
var _preview := {}       # hero id -> pending Attack damage (presentation only)
var _preview_nums: Array = []  # sticky preview labels
var _waiting_preview: Control
var _chrome_bottom := -1.0  # overlay-space y of the top of the bottom chrome
var _chrome_top := -1.0     # canvas y; HP labels stay below the HUD text column
## Fluidity: seconds one turn's moves may take (Play sets it to its step
## cadence; INF while stepping by hand). A long ice slide is compressed to
## fit, so the next turn never kills it halfway and cuts the corner.
const STEP_MOVE_SECONDS := 0.13
const MIN_MOVE_SECONDS := 0.015
var move_budget := INF

## Where the follow camera looks: the first living hero on the board (lowest
## id), so it moves on to the next hero when one dies. null if none.
func follow_point() -> Variant:
	var ids: Array = _figures.keys()
	ids.sort()
	for id in ids:
		var f: Node3D = _figures[id]
		if not _dead.has(id) and is_instance_valid(f) and f.visible:
			return f.global_position
	return null

func label_rects() -> Array[Rect2]:
	return _rects.duplicate()

func _name(id: int) -> String:
	return "%s %d" % [names.get(id, "Hero"), id + 1]

## Figures are scaled about their origin, which would lift the feet (and
## ring) from FLOOR_H to SCALE * FLOOR_H; sinking the origin keeps them on it.
const FOOT_Y := ZorgLook.FLOOR_H * (1.0 - SCALE)

static func cell_to_world(c: Dictionary) -> Vector3:
	return Vector3((float(c["x"]) + 0.5) * CELL, FOOT_Y, -(float(c["y"]) + 0.5) * CELL)

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
	_dead.clear()
	_hp.clear()
	_gold.clear()
	_tweens.clear()
	clear_attack_preview()

func _label_text(id: int) -> String:
	var g := int(_gold.get(id, 0))
	var text := "%s HP %d" % [_name(id), int(_hp.get(id, 0))] + ("  $%d" % g if g > 0 else "")
	if _preview.has(id):
		text += "  (-%d)" % int(_preview[id])
	return text

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
	root.scale = Vector3.ONE * SCALE
	# Bright ring under the feet so the hero stands out from the floor.
	var ring := StandardMaterial3D.new()
	ring.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring.albedo_color = Color(1.0, 0.95, 0.5, 0.75)
	ZorgLook.add_mesh(root, ZorgLook.ring(0.2, 0.27), ring, Vector3(0, ZorgLook.FLOOR_H + 0.02, 0), false)
	root.set_meta("ring_mat", ring)
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
		for taken_r in taken:
			if taken_r.intersects(r):
				r.position.y = taken_r.position.y - size.y - 2.0
		# Stay below the HUD text column (title, hints) so a first-run
		# spell hint cannot cover the HP label.
		if _chrome_top >= 0.0 and r.position.y < _chrome_top:
			r.position.y = _chrome_top
			for taken_r in taken:
				if taken_r.intersects(r):
					r.position.y = maxf(r.position.y, taken_r.end.y + 2.0)
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
	for item in _preview_nums:
		var pnum: Label = item[0]
		var pf: Node3D = item[1]
		if not is_instance_valid(pnum) or not is_instance_valid(pf):
			continue
		pnum.size = pnum.get_combined_minimum_size()
		var q2 := cam.unproject_position(pf.global_position + Vector3(0.45, 1.2 * SCALE, 0)) - Vector2(pnum.size.x / 2.0, pnum.size.y)
		pnum.position = q2 - base

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
	tw.tween_property(f, "position:y", FOOT_Y - 0.25, 0.7).set_delay(0.2)
	for m in f.get_meta("mats"):
		(m as StandardMaterial3D).transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		tw.tween_property(m, "albedo_color:a", 0.0, 0.6).set_delay(0.25)
	if _plates.has(f.get_meta("id", -1)):
		tw.tween_property(_plates[f.get_meta("id")], "modulate:a", 0.0, 0.6).set_delay(0.25)
	tw.chain().tween_callback(func(): f.visible = false)

## One cell of movement: slide, with a small hop, facing the way it goes.
func _step_to(tw: Tween, f: Node3D, to: Vector3, secs: float = STEP_MOVE_SECONDS) -> void:
	var body: Node3D = f.get_meta("body")
	tw.tween_callback(func():
		var d := to - f.position
		if d.length() > 0.01:
			f.rotation.y = atan2(d.x, d.z))
	tw.tween_property(f, "position", to, secs).set_trans(Tween.TRANS_SINE)
	tw.parallel().tween_property(body, "position:y", 0.16, secs / 2.0).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(body, "position:y", 0.0, secs / 2.0).set_ease(Tween.EASE_IN).set_delay(secs / 2.0)

## Seconds per cell for a hero that moves `cells` cells this turn.
## The floor yields when it would run past move_budget, so a long slide
## still finishes inside one Play step.
func move_seconds(cells: int) -> float:
	if cells <= 0:
		return STEP_MOVE_SECONDS
	var per := move_budget / float(cells)
	if per < MIN_MOVE_SECONDS:
		return per
	return minf(per, STEP_MOVE_SECONDS)

## Apply one turn's events. Returns a short line for the log. Moves in one
## turn (an ice slide) chain into one tween; a teleport or the waiting room
## kills it first, so the figure stays where the engine put it.
func apply_turn(events: Array) -> String:
	var lines: Array = []
	var moved := {}
	var cells := {}
	for e in events:
		if String(e["type"]) == "move":
			var hid := int(e.get("heroId", -1))
			cells[hid] = int(cells.get(hid, 0)) + 1
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
					_step_to(_tweens[id], f, cell_to_world(e["to"]), move_seconds(int(cells.get(id, 1))))
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
				_dead[id] = true
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
	# Round 11: a plain step inside a room has no other event; say so
	# instead of leaving an empty "Turn N:" line.
	if lines.is_empty():
		var who: Array = []
		for e in events:
			var id := int(e.get("heroId", -1))
			if String(e["type"]) == "move" and id >= 0 and not who.has(_name(id)):
				who.append(_name(id))
		if not who.is_empty():
			lines.append(" and ".join(who) + " moves")
	return ", ".join(lines)

## Show HP (and gold) on spawn (spawn events carry no HP).
func set_start_hp(id: int, hp: int, gold: int = 0) -> void:
	_hp[id] = hp
	_gold[id] = gold
	_refresh_label(id)

## FR-34 Attack preview from engine data: highlight living heroes and show
## the damage they would take. Does not change HP or outcomes.
func show_attack_preview(preview: Dictionary) -> void:
	clear_attack_preview()
	if not preview.get("ok", false):
		return
	var damage := int(preview["damage"])
	var waiting: Array = []
	for t in preview["targets"]:
		var id := int(t["id"])
		_preview[id] = damage
		_refresh_label(id)
		var f: Node3D = _figures.get(id)
		if f and is_instance_valid(f) and f.visible:
			if f.has_meta("ring_mat"):
				(f.get_meta("ring_mat") as StandardMaterial3D).albedo_color = Color(1.0, 0.25, 0.08, 0.95)
			var num := Label.new()
			num.text = "-%d" % damage
			num.add_theme_font_size_override("font_size", 26)
			num.add_theme_color_override("font_color", Color(1.0, 0.45, 0.2))
			num.add_theme_constant_override("outline_size", 6)
			num.add_theme_color_override("font_outline_color", Color.BLACK)
			num.mouse_filter = Control.MOUSE_FILTER_IGNORE
			if overlay:
				overlay.add_child(num)
			else:
				add_child(num)
			num.size = num.get_combined_minimum_size()
			_preview_nums.append([num, f])
		else:
			waiting.append("%s (-%d)" % [_name(id), damage])
	if not waiting.is_empty():
		var plate := PanelContainer.new()
		plate.add_theme_stylebox_override("panel", ZorgHud.plate())
		plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var lab := Label.new()
		lab.text = "Waiting: " + ", ".join(waiting)
		lab.add_theme_font_size_override("font_size", 16)
		lab.add_theme_color_override("font_color", Color(1.0, 0.55, 0.3))
		lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		plate.add_child(lab)
		if overlay:
			overlay.add_child(plate)
			# Bottom-left, above the bottom chrome — not on the title/goal/status column.
			plate.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		_waiting_preview = plate
		_layout_waiting_preview()


func clear_attack_preview() -> void:
	var ids: Array = _preview.keys()
	_preview.clear()
	for id in ids:
		_refresh_label(id)
		var f: Node3D = _figures.get(id)
		if f and is_instance_valid(f) and f.has_meta("ring_mat"):
			(f.get_meta("ring_mat") as StandardMaterial3D).albedo_color = Color(1.0, 0.95, 0.5, 0.75)
	for item in _preview_nums:
		var num: Label = item[0]
		if is_instance_valid(num):
			num.queue_free()
	_preview_nums.clear()
	if _waiting_preview and is_instance_valid(_waiting_preview):
		_waiting_preview.queue_free()
	_waiting_preview = null


func preview_count() -> int:
	return _preview.size()


## `top_y` is the top of the bottom HUD chrome in canvas space (spell bar,
## first-run hint, and run controls). The waiting plate sits just above it.
func set_chrome_bottom(top_y: float) -> void:
	_chrome_bottom = top_y

func set_chrome_top(bottom_y: float) -> void:
	_chrome_top = bottom_y
	_layout_waiting_preview()


func waiting_preview_rect() -> Rect2:
	if _waiting_preview and is_instance_valid(_waiting_preview):
		return _waiting_preview.get_global_rect()
	return Rect2()


func _layout_waiting_preview() -> void:
	if _waiting_preview == null or not is_instance_valid(_waiting_preview) or overlay == null:
		return
	var sz := _waiting_preview.get_combined_minimum_size()
	var ov := overlay.get_global_rect()
	var margin := 8.0
	var gap := 88.0 if _chrome_bottom < 0.0 else maxf(margin, ov.end.y - _chrome_bottom + margin)
	_waiting_preview.offset_left = 8
	_waiting_preview.offset_right = 8 + sz.x
	_waiting_preview.offset_bottom = -gap
	_waiting_preview.offset_top = -gap - sz.y
