extends Node3D
## Replays engine events only. Nothing here can change an outcome.

const CELL := 1.0

var _figures := {}
var _hp_labels := {}
var _move_tweens := {}
var names := {}      # hero id -> "Warrior" / "Elf {water}" (set by the level)

func _name(id: int) -> String:
	return "%s %d" % [names.get(id, "Hero"), id + 1]

static func cell_to_world(c: Dictionary) -> Vector3:
	return Vector3((float(c["x"]) + 0.5) * CELL, 0.0, -(float(c["y"]) + 0.5) * CELL)

## A move tween writes position for 0.12s. Kill it before a teleport or a
## free, or the figure slides back to the old cell (or is freed mid-slide).
func _kill_move(id: int) -> void:
	var tw: Tween = _move_tweens.get(id)
	if tw and tw.is_valid():
		tw.kill()
	_move_tweens.erase(id)

func clear() -> void:
	for id in _move_tweens.keys():
		_kill_move(id)
	for child in get_children():
		child.queue_free()
	_figures.clear()
	_hp_labels.clear()

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
	label.text = "%s HP %d" % [_name(id), hp]
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 48
	label.position.y = 1.7
	label.outline_size = 8
	root.add_child(label)
	_hp_labels[id] = label
	add_child(root)
	return root

## Apply one turn's events. Returns a short line for the log.
func apply_turn(events: Array) -> String:
	var lines: Array = []
	for e in events:
		var id := int(e.get("heroId", -1))
		match String(e["type"]):
			"spawn":
				var f := _figure(id, 0)
				f.position = cell_to_world(e["cell"])
				_figures[id] = f
				lines.append("%s appears in %s" % [_name(id), e["roomId"]])
			"move":
				var f: Node3D = _figures.get(id)
				if f:
					_kill_move(id)
					var tw := create_tween()
					tw.tween_property(f, "position", cell_to_world(e["to"]), 0.12)
					_move_tweens[id] = tw
			"enter":
				lines.append("enters %s" % e["roomId"])
			"damage":
				if _hp_labels.has(id):
					_hp_labels[id].text = "%s HP %d" % [_name(id), int(e["hp"])]
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
				var f: Node3D = _figures.get(id)
				if f:
					_kill_move(id)
					f.position = cell_to_world(e["to"])
				lines.append("%s teleports to %s" % [_name(id), e["toRoomId"]])
			"wait_room":
				var f: Node3D = _figures.get(id)
				if f:
					_kill_move(id)
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

## Show starting HP on spawn (spawn events carry no HP).
func set_start_hp(id: int, hp: int) -> void:
	if _hp_labels.has(id):
		_hp_labels[id].text = "%s HP %d" % [_name(id), hp]
