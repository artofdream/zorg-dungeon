extends SceneTree
## Headless parity check (ADR-0008). For every level in levels/index.json,
## replays each placement in its tests/golden/<id>.json through the GDScript
## engine and fails unless
## validation codes, every turn's events, the run outcome and the score match
## the TypeScript engine's recording exactly.
##   godot --headless --path apps/godot --script res://tests/parity_test.gd

const INDEX_PATH := "res://levels/index.json"

func _init() -> void:
	var failures := 0
	var total := 0
	for entry in _read(INDEX_PATH)["levels"]:
		var r := _check_level(entry)
		failures += r.x
		total += r.y
	print("parity: %d/%d cases match the TS engine" % [total - failures, total])
	var tick_fail := _check_ticks()
	quit(1 if failures > 0 or tick_fail > 0 else 0)

## FR-14 tick table (elements.ts elementalTick). Poison has no shipped
## fixture yet, so this table is its only parity check.
func _check_ticks() -> int:
	var ticks: Array = _read("res://tests/golden/elements.json")["ticks"]
	var bad := 0
	for t in ticks:
		var got := ZorgEngine.elemental_tick(t["element"], t["immunities"], t["visited"])
		if not _eq(got, t["tick"]):
			bad += 1
			printerr("FAIL tick ", t["element"], " ", t["immunities"], " visited=", t["visited"], ": got ", got, " want ", t["tick"])
	print("elements: %d/%d ticks match the TS engine" % [ticks.size() - bad, ticks.size()])
	return bad

func _check_level(entry: Dictionary) -> Vector2i:
	var failures := 0
	var loaded := ZorgEngine.load_level(_read(entry["file"]))
	if not loaded["ok"]:
		printerr("FAIL ", entry["id"], " load_level: ", loaded["error"])
		return Vector2i(1, 1)
	var golden: Dictionary = _read(entry["golden"])
	var by_id := {}
	for s in loaded["supplied"]:
		by_id[s["id"]] = s
	for c in golden["cases"]:
		var rooms: Array = []
		for p in c["placements"]:
			rooms.append(ZorgEngine.make_room(by_id[p["id"]], int(p["x"]), int(p["y"]), int(c["orientation"])))
		var report := ZorgEngine.validate_layout(loaded["supplied"], rooms)
		var problems: Array = []
		if report["ok"] != c["validation"]["ok"] or not _eq(report["codes"], c["validation"]["codes"]):
			problems.append("validation %s != %s" % [report["codes"], c["validation"]["codes"]])
		if report["ok"] and c.has("turns"):
			var state := ZorgEngine.create_run(loaded, rooms)
			var turns := ZorgEngine.run_turns(state)
			if turns.size() != c["turns"].size():
				problems.append("turn count %d != %d" % [turns.size(), c["turns"].size()])
			for i in mini(turns.size(), c["turns"].size()):
				if not _eq(turns[i], c["turns"][i]):
					problems.append("turn %d: %s != %s" % [i, JSON.stringify(turns[i]), JSON.stringify(c["turns"][i])])
					break
			if state["outcome"] != c["runOutcome"]:
				problems.append("run outcome %s != %s" % [state["outcome"], c["runOutcome"]])
			var sc := ZorgEngine.score(loaded, state)
			if not _eq(sc, c["score"]):
				problems.append("score %s != %s" % [JSON.stringify(sc), JSON.stringify(c["score"])])
		if problems.is_empty():
			print("PASS ", entry["id"], " ", c["name"])
		else:
			failures += 1
			printerr("FAIL ", entry["id"], " ", c["name"], ": ", "; ".join(problems))
	return Vector2i(failures, golden["cases"].size())

func _read(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		printerr("cannot parse ", path)
		quit(1)
		return {}
	return data

## Deep equality; numbers compare by value (JSON gives floats, the engine ints).
func _eq(a, b) -> bool:
	var na := typeof(a) == TYPE_INT or typeof(a) == TYPE_FLOAT
	var nb := typeof(b) == TYPE_INT or typeof(b) == TYPE_FLOAT
	if na or nb:
		return na and nb and float(a) == float(b)
	if typeof(a) == TYPE_ARRAY and typeof(b) == TYPE_ARRAY:
		if a.size() != b.size():
			return false
		for i in a.size():
			if not _eq(a[i], b[i]):
				return false
		return true
	if typeof(a) == TYPE_DICTIONARY and typeof(b) == TYPE_DICTIONARY:
		if a.size() != b.size():
			return false
		for k in a.keys():
			if not b.has(k) or not _eq(a[k], b[k]):
				return false
		return true
	if (typeof(a) == TYPE_STRING or typeof(a) == TYPE_STRING_NAME) and (typeof(b) == TYPE_STRING or typeof(b) == TYPE_STRING_NAME):
		return str(a) == str(b)
	return typeof(a) == typeof(b) and a == b
