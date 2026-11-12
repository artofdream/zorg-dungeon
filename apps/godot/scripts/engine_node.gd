extends Node
## Scene-side wrapper around the pure ZorgEngine. Holds the loaded level and
## produces the turn-by-turn recording the Heroes node replays.

const LEVEL_PATH := "res://levels/deluxe-1.2.json"

var loaded: Dictionary = {}

func load_default_level() -> String:
	var data = JSON.parse_string(FileAccess.get_file_as_string(LEVEL_PATH))
	if typeof(data) != TYPE_DICTIONARY:
		return "Cannot read %s" % LEVEL_PATH
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

func validate(rooms: Array) -> Dictionary:
	return ZorgEngine.validate_layout(supplied(), rooms)

## Returns {turns, outcome, score} or {error}.
func run(rooms: Array) -> Dictionary:
	var state := ZorgEngine.create_run(loaded, rooms)
	if state.has("error"):
		return state
	var turns := ZorgEngine.run_turns(state)
	return {"turns": turns, "outcome": state["outcome"], "score": ZorgEngine.score(loaded, state)}
