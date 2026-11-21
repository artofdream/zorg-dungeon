extends SceneTree
## Opt-in hitch probe (not in CI): worst frame time around the first-use
## events the ROG Phone profile flagged (room drop, Play start, first
## spawn, first death). Run with a window (Xvfb) and an empty shader cache:
##   XDG_DATA_HOME=$(mktemp -d) XDG_CACHE_HOME=$(mktemp -d) MESA_SHADER_CACHE_DISABLE=true \
##   xvfb-run -a -s "-screen 0 1280x720x24" godot --path apps/godot \
##     --script res://tests/hitch_probe.gd -- --level=deluxe-5.8
## Prints one HITCH line per event: worst frame (ms) in the frames after it
## and the median frame of the steady state, so numbers are relative.

var a := {}
var level: Node
var last := 0
var deltas: Array = []

func _initialize() -> void:
	for s in OS.get_cmdline_user_args():
		var kv := String(s).trim_prefix("--").split("=", true, 1)
		a[kv[0]] = kv[1] if kv.size() > 1 else "1"
	_run.call_deferred()

func _frame() -> float:
	await process_frame
	var now := Time.get_ticks_usec()
	var d := (now - last) / 1000.0
	last = now
	if a.has("verbose") and d > 40.0 and level:
		var vp := root.get_viewport().get_viewport_rid()
		print("SLOW %.1f ms (process %.1f, render cpu %.1f) turn %d: %s | dead %d figs %d over %s" % [d, Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0, RenderingServer.viewport_get_measured_render_time_cpu(vp) + RenderingServer.get_frame_setup_time_cpu(), level.turn_index, level.log_label.text, level.heroes._dead.size(), level.heroes._figures.size(), level.run_over()])
	return d

## Worst frame over the next n frames (the event's own frame included).
func _window(n: int) -> Dictionary:
	var worst := 0.0
	var at := 0
	for i in n:
		var d: float = await _frame()
		deltas.append(d)
		if d > worst:
			worst = d
			at = i
	return {"worst": worst, "at": at}

func _run() -> void:
	RenderingServer.viewport_set_measure_render_time(root.get_viewport().get_viewport_rid(), true)
	level = load("res://scenes/level.tscn").instantiate()
	level.settings_path = "user://hitch_probe.cfg"
	root.add_child(level)
	last = Time.get_ticks_usec()
	for i in 30:
		await _frame()
	var engine: Node = level.get_node("Engine")
	var lid := String(a.get("level", "deluxe-5.8"))
	var idx: int = engine.levels.map(func(e): return e["id"]).find(lid)
	if level.hint and level.hint.visible:
		level._on_hint_dismissed()
	level.set_quality(String(a.get("quality", "low")), false)
	var t0 := Time.get_ticks_usec()
	level._open_level(idx)
	var open_ms := (Time.get_ticks_usec() - t0) / 1000.0
	var open_frames: Array = []
	var worst_open := 0.0
	for i in int(a.get("settle", "60")):
		var d: float = await _frame()
		worst_open = maxf(worst_open, d)
		if d > 30.0:
			open_frames.append("f%d:%.0f" % [i, d])
	print("HITCH %s open: call %.1f ms, worst frame %.1f ms (frames > 30 ms: %s)" % [lid, open_ms, worst_open, " ".join(open_frames)])
	var w: Dictionary
	var base: Array = []
	for i in 30:
		base.append(await _frame())
	base.sort()
	var med: float = base[base.size() / 2]
	var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[idx]["golden"]))
	var drops: Array = []
	for p in g["cases"][0]["placements"]:
		t0 = Time.get_ticks_usec()
		# The tray-drop path when it exists (same as _place on older builds).
		if level.has_method("_on_drop_place"):
			level._on_drop_place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
		else:
			level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
		var call_ms := (Time.get_ticks_usec() - t0) / 1000.0
		w = await _window(20)
		drops.append("%s %.1f/%.1f" % [p["id"], call_ms, w["worst"]])
	print("HITCH %s drops (call ms / worst frame ms): %s" % [lid, ", ".join(drops)])
	for i in 30:
		await _frame()
	var heroes: Node = level.heroes
	t0 = Time.get_ticks_usec()
	level.playback.play_toggled.emit()       # the Play button
	var play_call := (Time.get_ticks_usec() - t0) / 1000.0
	# Play start window: the press frame and the next 20 (first spawn lands here).
	w = await _window(20)
	print("HITCH %s play: call %.1f ms, worst frame %.1f ms (frame %d of 20)" % [lid, play_call, w["worst"], w["at"]])
	# First spawn / first death: watch the figures until the run ends.
	var seen_spawn: bool = heroes._figures.size() > 0
	var spawn_worst := -1.0
	var death_worst := -1.0
	var guard := 0
	var run_worst := 0.0
	while guard < 4000 and not level.run_over():
		var nfig: int = heroes._figures.size()
		var ndead: int = heroes._dead.size()
		var d: float = await _frame()
		run_worst = maxf(run_worst, d)
		if not seen_spawn and heroes._figures.size() > nfig:
			seen_spawn = true
			spawn_worst = (await _window(6))["worst"]
			spawn_worst = maxf(spawn_worst, d)
		if death_worst < 0.0 and heroes._dead.size() > ndead:
			death_worst = maxf(d, (await _window(10))["worst"])
		guard += 1
	if death_worst < 0.0:
		death_worst = (await _window(30))["worst"]
	print("HITCH %s spawn: worst %s ms (if -1 the spawn was in the Play window); first death: worst %.1f ms; run worst %.1f ms" % [lid, ("%.1f" % spawn_worst), death_worst, run_worst])
	print("HITCH %s steady median frame %.1f ms" % [lid, med])
	quit(0)
