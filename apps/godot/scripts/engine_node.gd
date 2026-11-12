extends Node
## Scene-side wrapper around the pure ZorgEngine. Holds the loaded level and
## the live run: the level screen steps it one action at a time and casts
## spells between actions (FR-33), exactly like run_turns() in the tests.

const INDEX_PATH := "res://levels/index.json"

var loaded: Dictionary = {}
var levels: Array = []
var state: Dictionary = {}
const MAX_STEPS := 10000

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

## Start a run on this layout. Returns "" or the FR-8 error.
func start(rooms: Array) -> String:
	var s := ZorgEngine.create_run(loaded, rooms)
	if s.has("error"):
		state = {}
		return s["error"]
	state = s
	return ""

func over() -> bool:
	return state.is_empty() or state["outcome"] != "in_progress"

## One hero action. Same end rule as run_turns(): no events or the step cap
## means stalemate.
func step() -> Array:
	if over():
		return []
	var ev := ZorgEngine.step_run(state)
	if state["outcome"] == "in_progress" and (ev.is_empty() or state["stepCount"] >= MAX_STEPS):
		state["outcome"] = "stalemate"
		ev.append({"type": "stalemate"})
	return ev

func can_cast() -> bool:
	return not state.is_empty() and ZorgEngine.can_cast_now(state)

## {ok, events, error}
func cast(spell_id: int) -> Dictionary:
	if state.is_empty():
		return {"ok": false, "events": [], "error": "not_running"}
	return ZorgEngine.cast_spell(state, spell_id)

## Spell list: [{def, consumed}] for the run, or the level's list while building.
func spells() -> Array:
	if not state.is_empty():
		return state["spells"]
	return loaded.get("spells", []).map(func(d): return {"def": d, "consumed": false})

func hero_hp(id: int) -> int:
	return int(state["heroes"][id]["hp"])

func score() -> Dictionary:
	return ZorgEngine.score(loaded, state)
