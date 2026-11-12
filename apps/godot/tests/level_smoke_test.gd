extends SceneTree
## Headless smoke test of the Level scene, driven through the same calls the
## tap/drag input uses:
##  - for every level in the picker, place its first golden layout (a win),
##    step the replay to the end and expect the win banner;
##  - drag a room straight out of the tray onto the board;
##  - drag onto an occupied spot: red ghost, nothing placed;
##  - rotate 90° and check the camera settles on a 45° + n·90° yaw.
## Optional: `-- --shot=path.png` saves a screenshot (needs a display).

var level: Node
var failures := 0

func _check(ok: bool, what: String) -> void:
	if ok:
		print("PASS ", what)
	else:
		failures += 1
		printerr("FAIL ", what)

func _mouse_button(pos: Vector2, pressed: bool) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.pressed = pressed
	e.position = pos
	e.global_position = pos
	e.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	root.push_input(e)

func _mouse_motion(pos: Vector2) -> void:
	var e := InputEventMouseMotion.new()
	e.position = pos
	e.global_position = pos
	e.button_mask = MOUSE_BUTTON_MASK_LEFT
	root.push_input(e)

func _real_input_drag(cam: Camera3D) -> void:
	level._open_level(1)
	for i in 20:
		await process_frame
	var btn: Button = level.tray.get_child(0)
	var room_id := ""
	for s in level.get_node("Engine").supplied():
		if not level.placed.has(s["id"]):
			room_id = s["id"]
			break
	var start := btn.get_global_rect().get_center()
	var dest: Vector2 = cam.unproject_position(level.slot_center(0, 0))
	_mouse_button(start, true)
	await process_frame
	for k in 6:
		_mouse_motion(start.lerp(dest, (k + 1) / 6.0))
		await process_frame
	_mouse_button(dest, false)
	await process_frame
	_check(level.placed.get(room_id) == Vector2i(0, 0), "real-input drag from tray places %s at (0, 0)" % room_id)


func _initialize() -> void:
	level = load("res://scenes/level.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var engine: Node = level.get_node("Engine")
	for i in engine.levels.size():
		level._open_level(i)
		await process_frame
		var golden = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[i]["golden"]))
		var case0: Dictionary = golden["cases"][0]
		for p in case0["placements"]:
			level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
		_check(not level.play_btn.disabled, "%s: Play unlocks for a valid layout" % engine.levels[i]["id"])
		var casts: Array = case0.get("casts", [])
		if not casts.is_empty():
			_check(level.spell_bar.get_child_count() > 0, "%s: spell bar shows the level's spells" % engine.levels[i]["id"])
			_check(level.spell_bar.get_children().all(func(b): return b.disabled), "%s: spells are disabled before the first action (FR-33)" % engine.levels[i]["id"])
		var guard := 0
		while not level.run_over() and guard < 1000:
			level._on_step()
			guard += 1
			await process_frame
			for c in casts:
				if int(c["afterSteps"]) == int(engine.state["stepCount"]) and not level.run_over():
					var btn: Button = level.spell_bar.get_child(int(c["spellId"]))
					_check(not btn.disabled, "%s: spell button %d is enabled between actions" % [engine.levels[i]["id"], int(c["spellId"])])
					btn.pressed.emit()          # same path as a tap or click
					await process_frame
		_check(level.result.text.begins_with("You win"), "%s: win banner (%s)" % [engine.levels[i]["id"], level.result.text])
		if not casts.is_empty():
			await process_frame
			_check(level.spell_bar.get_children().all(func(b): return b.disabled), "%s: no spell can be cast after the run ends" % engine.levels[i]["id"])

	# Drag from the tray onto the board, then onto an occupied spot.
	level._open_level(0)
	await process_frame
	var cam: Camera3D = level.get_node("CameraRig/Camera3D")
	for i in 20:
		await process_frame
	var free_slot := Vector2i(1, 0)
	var target: Vector2 = cam.unproject_position(level.slot_center(free_slot.x, free_slot.y))
	level._begin_drag("A:0", true, target + Vector2(0, 300))
	level.drag_to(target + Vector2(0, 150))
	level.drag_to(target)
	_check(level.ghost.visible and level.ghost_mat.albedo_color.g > 0.5, "ghost is green over a free spot")
	level.end_drag(target)
	_check(level.placed.get("A:0") == free_slot, "drag from tray places A at %s" % free_slot)
	level._begin_drag("Z:0", true, target + Vector2(0, 300))
	level.drag_to(target)
	_check(level.ghost.visible and level.ghost_mat.albedo_color.r > 0.9 and level.ghost_mat.albedo_color.g < 0.2, "ghost is red over an occupied spot")
	level.end_drag(target)
	_check(not level.placed.has("Z:0"), "drop on a red spot leaves Z in the tray")
	var far: Vector2 = cam.unproject_position(level.slot_center(3, 0))
	level._begin_drag("Z:0", true, far + Vector2(0, 300))
	level.drag_to(far)
	_check(level.ghost.visible and level.ghost_mat.albedo_color == level.GHOST_LOOSE, "ghost is orange where Z would not touch A")
	level.end_drag(far)
	_check(level.placed.get("Z:0") == Vector2i(3, 0), "an orange spot still accepts the drop")
	level._unplace("Z:0")

	# Same drag again with real input events through the GUI (press on a tray
	# Button, move over the board, release) to cover the actual wiring.
	# GUI picking needs a real window, so this part runs under Xvfb in CI.
	if DisplayServer.get_name() == "headless":
		print("SKIP real-input drag (headless; CI runs it under Xvfb)")
	else:
		await _real_input_drag(cam)

	# Rotate and let the camera settle.
	level._rotate(90.0)
	await create_timer(0.8).timeout
	_check(level.camera_settled(), "camera snaps to 45° + n·90° after rotating (yaw %s)" % level.yaw)

	var shot := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			shot = a.substr(7)
	if shot != "":
		# Last spell level mid-run, spell bar live, so the shot shows casting.
		var last: int = engine.levels.size() - 1
		level._open_level(last)
		var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[last]["golden"]))
		for p in g["cases"][0]["placements"]:
			level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
		for i in 4:
			level._on_step()
		for i in 30:
			await process_frame
		root.get_viewport().get_texture().get_image().save_png(shot)
	print("level smoke: %s" % ("PASS" if failures == 0 else "%d failure(s)" % failures))
	quit(1 if failures > 0 else 0)
