extends Node
## Scene-side wrapper around the pure ZorgEngine. Holds the loaded level and
## produces the turn-by-turn recording the Heroes node replays.

const INDEX_PATH := "res://levels/index.json"

var loaded: Dictionary = {}
var levels: Array = []

## Level list written by packages/engine/scripts/godot-golden.mjs.
func load_index() -> String:
	var data = JSON.parse_string(FileAccess.get_file_as_string(INDEX_PATH))
	if typeof(data) != TYPE_DICTIONARY:
		return "Cannot read %s" % INDEX_PATH
	levels = data["levels"]
	return ""

func load_level_file(path: String) -> String:
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(data) != TYPE_DICTIONARY:
		return "Cannot read %s" % path
	loaded = ZorgEngine.load_level(data)
	return "" if loaded["ok"] else loaded["error"]

func supplied() -> Array:
	return loaded.get("supplied", [])

func level_name() -> String:
	return "%s (%s)" % [loaded["level"].get("name", "?"), loaded["level"].get("id", "?")]

func constraint_texts() -> Array:
	var out: Array = []
	for c in loaded["level"].get("constraints", []):
		out.append(String(c["expression"]))
	return out

## "Warrior", "Elf {water}" … for labels, by hero id.
func hero_names() -> Dictionary:
	var out := {}
	var i := 0
	for h in loaded["level"].get("heroes", []):
		var imm: Array = ZorgEngine.hero_immunities(h)
		out[i] = String(h["type"]) + ("" if imm.is_empty() else " {%s}" % ", ".join(imm))
		i += 1
	return out

func validate(rooms: Array) -> Dictionary:
	return ZorgEngine.validate_layout(supplied(), rooms)

## Returns {turns, outcome, score} or {error}.
func run(rooms: Array) -> Dictionary:
	var state := ZorgEngine.create_run(loaded, rooms)
	if state.has("error"):
		return state
	var turns := ZorgEngine.run_turns(state)
	return {"turns": turns, "outcome": state["outcome"], "score": ZorgEngine.score(loaded, state)}
