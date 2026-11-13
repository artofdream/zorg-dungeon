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

## True while a chained move (one step, or an ice slide of several cells at
## 0.12s each) is still playing. Play waits on this so the next action does
## not kill the slide halfway.
func moving() -> bool:
	for tw_v in _tweens.values():
		var tw: Tween = tw_v
		if tw and tw.is_valid() and tw.is_running():
			return true
	return false

func _figure(id: int, hp: int) -> Node3D:
	var root := Node3D.new()
	var mesh := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.3
	capsule.height = 1.2
	mesh.mesh = capsule
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.85, 0.4) if String(names.get(id, "")).begins_with("Elf") else Color(0.25, 0.45, 0.95)
	mesh.material_override = mat
	mesh.position.y = 0.7
	root.add_child(mesh)
	var label := Label3D.new()
	_hp[id] = hp
	label.text = _label_text(id)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 48
	label.position.y = 1.7
	label.outline_size = 8
	root.add_child(label)
	_hp_labels[id] = label
	add_child(root)
	return root

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
				f.position = cell_to_world(e["cell"])
				_figures[id] = f
				lines.append("%s appears in %s" % [_name(id), e["roomId"]])
			"move":
				var f: Node3D = _figures.get(id)
				if f:
					if not moved.has(id):
						_stop_tween(id)
						_tweens[id] = create_tween()
						moved[id] = true
					(_tweens[id] as Tween).tween_property(f, "position", cell_to_world(e["to"]), 0.12)
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
				if int(e["amount"]) < 0:
					lines.append("heals %d (HP %d)" % [-int(e["amount"]), int(e["hp"])])
				else:
					lines.append("takes %d damage (HP %d)" % [int(e["amount"]), int(e["hp"])])
			"death":
				var f: Node3D = _figures.get(id)
				if f:
					var tw := create_tween()
					tw.tween_property(f, "rotation_degrees:z", 90.0, 0.3)
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
