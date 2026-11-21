class_name ZorgSolutionPlayer
extends Node
## FR-47 "Show a solution": replays the engine's stored solution for the
## open level (levels/solutions.json, written by
## packages/engine/scripts/godot-golden.mjs from fixtures/solutions/).
## Order: clear the board, drop each room with its caption, then run the
## heroes and cast each stored spell at its stored step, then the result.
## Presentation only (NFR-1): the layout, the casts and every caption come
## from the TS engine; the run itself is the normal engine run, and the
## parity test checks it ends the same way as in TS.

signal finished(won: bool)

const PATH := "res://levels/solutions.json"
const PLACE_SECONDS := 2.2   # one room step while playing
const STEP_SECONDS := 0.3    # one hero action while playing
const CAST_SECONDS := 2.2    # a cast caption stays up this long before the cast
const DROP_HEIGHT := 4.0

var level: Node               # the Level scene (level.gd)
var guide: ZorgSolutionGuide
var levels := {}              # level id -> solution entry
var sol := {}
var steps: Array = []
var step_i := 0               # next step to apply
var phase := ""               # "" | "place" | "run" | "done"
var playing := true
var timer := 0.0
var driving := false          # true while this node calls into the level
var last_outcome := ""        # engine outcome of the last replay ("win", "loss", ...)
var mismatch := false         # true when the last replay did not end in the stored win

func _init() -> void:
	name = "SolutionPlayer"

func _ready() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if typeof(data) == TYPE_DICTIONARY:
		levels = data.get("levels", {})

func attach(lvl: Node, plate: ZorgSolutionGuide) -> void:
	level = lvl
	guide = plate
	guide.pause_toggled.connect(toggle_pause)
	guide.next_pressed.connect(next)
	guide.stop_pressed.connect(stop)

func active() -> bool:
	return phase != ""

## True while the replay is placing rooms or running the heroes: it owns the
## run, so the normal Play / Step / Space / spell bar must not drive the
## engine (they would walk stepCount past a stored cast and desync it).
func owns_run() -> bool:
	return phase == "place" or phase == "run"

func has_solution(level_id: String) -> bool:
	return String(levels.get(level_id, {}).get("status", "")) == "solved"

## Start for `level_id`. Returns false (and says so) when the engine has
## no stored solution for it.
func start(level_id: String) -> bool:
	stop()
	sol = levels.get(level_id, {})
	if String(sol.get("status", "")) != "solved":
		guide.show_message("No stored solution yet for this level: the engine's search has not found one.")
		phase = "done"
		return false
	steps = sol["steps"]
	last_outcome = ""
	mismatch = false
	driving = true
	level._on_reset()
	for id in level.placed.keys():
		level._unplace(id)
	driving = false
	phase = "place"
	step_i = 0
	playing = true
	guide.show_controls(true, true)
	guide.set_playing(true)
	_tick()
	return true

func stop() -> void:
	var was := phase != ""
	phase = ""
	steps = []
	if guide:
		guide.close()
	if was:
		finished.emit(false)

func toggle_pause() -> void:
	playing = not playing
	guide.set_playing(playing)
	timer = 0.0

## Next: apply the next step now (one room, one hero action or the cast).
func next() -> void:
	if phase == "place" or phase == "run":
		timer = 0.0
		_tick()

func _process(delta: float) -> void:
	if not playing or (phase != "place" and phase != "run"):
		return
	timer -= delta
	if timer <= 0.0:
		_tick()

## Play the whole solution at once (smoke test). Returns the score outcome.
func run_to_end(level_id: String) -> String:
	if not start(level_id):
		return "none"
	var guard := 0
	while (phase == "place" or phase == "run") and guard < 20000:
		_tick()
		guard += 1
	return String(level.engine.score()["outcome"]) if not level.engine.state.is_empty() else "none"

func _head(i: int) -> String:
	return "Solution step %d of %d" % [i + 1, steps.size()]

func _show(i: int) -> void:
	var st: Dictionary = steps[i]
	guide.show_step(_head(i), String(st["text"]), st.get("rules", []))

func _tick() -> void:
	if phase == "place":
		_place_tick()
	elif phase == "run":
		_run_tick()

func _place_tick() -> void:
	var st: Dictionary = steps[step_i]
	var kind := String(st["kind"])
	if kind == "cast" or kind == "result":
		# Every room is down: start the run (walls go up over a few frames).
		driving = true
		var ok: bool = level._ensure_recording(true)
		driving = false
		if not ok:
			guide.show_message("The stored layout did not start a run.")
			phase = "done"
			return
		level.heroes.move_budget = STEP_SECONDS * 0.8
		phase = "run"
		guide.show_step("Run", "The heroes set off. Casts happen at the stored steps.", [])
		timer = STEP_SECONDS * 3.0
		return
	_show(step_i)
	if kind == "place":
		var id := String(st["roomId"])
		driving = true
		level._place(id, Vector2i(int(st["x"]), int(st["y"])))
		driving = false
		var n: Node3D = level.room_nodes.get(id)
		if n:
			var to := n.position
			n.position = to + Vector3(0, DROP_HEIGHT, 0)
			n.create_tween().tween_property(n, "position", to, 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	step_i += 1
	timer = PLACE_SECONDS

func _run_tick() -> void:
	var st: Dictionary = steps[step_i] if step_i < steps.size() else {}
	var kind := String(st.get("kind", ""))
	var engine: Node = level.engine
	if kind == "cast" and int(engine.state.get("stepCount", 0)) == int(st["afterSteps"]):
		if guide.header.text.begins_with(_head(step_i)):
			driving = true
			var ok: bool = level.cast_spell(int(st["spellId"]))
			driving = false
			if not ok:
				guide.show_message("The engine refused the stored cast; the stored solution is out of date.")
				phase = "done"
				return
			step_i += 1
			timer = STEP_SECONDS
		else:
			_show(step_i)                    # caption first, cast on the next tick
			timer = CAST_SECONDS
		_check_end()
		return
	if engine.over():
		_check_end()
		return
	driving = true
	level._advance()
	driving = false
	timer = STEP_SECONDS
	_check_end()

func _check_end() -> void:
	if not level.engine.over():
		return
	last_outcome = String(level.engine.score()["outcome"])
	var won := last_outcome == "win"
	while step_i < steps.size() and String(steps[step_i]["kind"]) != "result":
		step_i += 1
	if won:
		if step_i < steps.size():
			_show(step_i)
	else:
		# Honest caption: the stored "result" text explains a win, so it
		# must not be shown when this replay ended otherwise.
		mismatch = true
		push_warning("FR-47: solution replay for %s ended in '%s', not the stored win" % [String(sol.get("levelId", "?")), last_outcome])
		print("zorg: solution replay did not win (%s)" % last_outcome)
		guide.show_step("Solution replay did not win",
			"This replay ended in a %s, not the stored win: the run drifted from the engine's stored solution. Press Stop and try Show a solution again." % _outcome_words(last_outcome), [])
	phase = "done"
	guide.show_controls(false, false)
	finished.emit(won)

static func _outcome_words(outcome: String) -> String:
	match outcome:
		"loss": return "loss (a hero reached Zorg)"
		"stalemate": return "stalemate (a hero is stuck)"
	return "'%s' result" % outcome
