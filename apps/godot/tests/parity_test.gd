extends SceneTree
## Headless parity check (ADR-0008). Replays every placement in
## tests/golden/deluxe-1.2.json through the GDScript engine and fails unless
## validation codes, every turn's events, the run outcome and the score match
## the TypeScript engine's recording exactly.
##   godot --headless --path apps/godot --script res://tests/parity_test.gd

const LEVEL_PATH := "res://levels/deluxe-1.2.json"
const GOLDEN_PATH := "res://tests/golden/deluxe-1.2.json"

func _init() -> void:
	var failures := 0
	var loaded := ZorgEngine.load_level(_read(LEVEL_PATH))
	if not loaded["ok"]:
		printerr("load_level failed: ", loaded["error"])
		quit(1)
		return
	var golden: Dictionary = _read(GOLDEN_PATH)
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
			print("PASS ", c["name"])
		else:
			failures += 1
			printerr("FAIL ", c["name"], ": ", "; ".join(problems))
	print("parity: %d/%d cases match the TS engine" % [golden["cases"].size() - failures, golden["cases"].size()])
	quit(1 if failures > 0 else 0)

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
