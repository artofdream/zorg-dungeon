extends SceneTree
## Headless smoke test of the Level scene, driven through the same calls the
## tap/drag input uses:
##  - for every level in the picker, place its first golden layout (usually a
##    win), step the replay to the end and expect the banner for its outcome;
##  - drag a room straight out of the tray onto the board;
##  - drag onto an occupied spot: red ghost, nothing placed;
##  - rotate 90° and check the camera settles on a 45° + n·90° yaw;
##  - round 9: torch light / shadow limits per quality and the follow camera.
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

func _key(code: Key) -> void:
	for down in [true, false]:
		var e := InputEventKey.new()
		e.keycode = code
		e.pressed = down
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
		# Most first cases are wins; a level with no winnable layout under the
		# ported rules (5.8) leads with the outcome its golden records.
		var want: String = {"win": "You win", "loss": "You lose", "unresolved": "Not won yet"}[String(case0["score"]["outcome"])]
		_check(level.result.text.begins_with(want), "%s: %s banner (%s)" % [engine.levels[i]["id"], case0["score"]["outcome"], level.result.text])
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

	# Round 7 phone UX: every button >= 52 UI units (48 dp once scaled) and
	# no two room labels overlap on a busy level (5.5).
	var five: int = engine.levels.map(func(e): return e["id"]).find("deluxe-5.5")
	level._open_level(five)
	var g5 = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[five]["golden"]))
	for p in g5["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	for i in 10:
		await process_frame
	var small: Array = []
	var stack: Array = [level.ui_root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		stack.append_array(n.get_children())
		if n is Button and n.get_combined_minimum_size().y < 52.0:
			small.append(n.text)
	_check(small.is_empty(), "every button is at least 52 units tall %s" % [small])
	var plates: Array = level.label_layer.get_children().filter(func(c): return c.visible and not c.is_queued_for_deletion())
	var overlap: int = 0
	for a in plates.size():
		for b in range(a + 1, plates.size()):
			if plates[a].get_rect().intersects(plates[b].get_rect()):
				overlap += 1
	_check(plates.size() >= 6 and overlap == 0, "5.5: %d room labels, %d overlaps" % [plates.size(), overlap])

	# Keyboard placement (WCAG 2.1.1): pick a room, arrows move, Enter drops;
	# Backspace undoes the last placement.
	level._open_level(0)
	for i in 5:
		await process_frame
	level._kb_select("A:0")
	_key(KEY_ENTER)
	_check(level.placed.get("A:0") == Vector2i(0, 0), "keyboard: Enter places A at (0, 0)")
	level._kb_select("Z:0")
	_key(KEY_RIGHT)
	_key(KEY_ENTER)
	_check(level.placed.get("Z:0") == Vector2i(2, 0), "keyboard: Right then Enter places Z at (2, 0)")
	_key(KEY_BACKSPACE)
	_check(not level.placed.has("Z:0") and level.placed.has("A:0"), "keyboard: Backspace undoes the last placement")
	# A pick-up ended by other means (a tap elsewhere) must not leave Enter armed.
	level._kb_select("Z:0")
	level.selected = ""
	_key(KEY_ENTER)
	_check(not level.kb_active and not level.placed.has("Z:0"), "keyboard: a cleared selection disarms Enter")
	level._kb_select("Z:0")
	_key(KEY_TAB)
	_check(not level.kb_active and level.selected == "", "keyboard: Tab cancels the pick-up")
	level.get_viewport().gui_release_focus()

	# Round 9 look: quality limits on torch lights and shadows.
	var five2: int = engine.levels.map(func(e): return e["id"]).find("deluxe-5.5")
	level._open_level(five2)
	for p in g5["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	level.set_quality("low", false)
	var lit: Array = level.torch_lights().filter(func(l): return l.visible)
	var shadowed: Array = level.torch_lights().filter(func(l): return l.visible and l.shadow_enabled)
	_check(lit.size() <= ZorgAtmos.LOW_LIGHTS and lit.size() > 0 and shadowed.is_empty() and not level.get_node("Sun").shadow_enabled,
		"quality Low: %d torch lights (max %d), no shadows" % [lit.size(), ZorgAtmos.LOW_LIGHTS])
	level.set_quality("high", false)
	lit = level.torch_lights().filter(func(l): return l.visible)
	shadowed = level.torch_lights().filter(func(l): return l.visible and l.shadow_enabled)
	_check(lit.size() > ZorgAtmos.LOW_LIGHTS and lit.size() <= ZorgAtmos.HIGH_LIGHTS and shadowed.size() == mini(ZorgAtmos.HIGH_SHADOWS, lit.size()),
		"quality High: %d torch lights, %d with shadows" % [lit.size(), shadowed.size()])
	level.set_quality("low", false)

	# Follow camera: only during a run, tracks the first living hero, and
	# Build goes back to the fitted overview.
	level._open_level(0)
	var g1 = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[0]["golden"]))
	for p in g1["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	for i in 5:
		await process_frame
	_check(not level.view_btn.visible, "follow camera: View button hidden while building")
	level._on_cam_mode()
	_check(not level.follow, "follow camera: no follow while building")
	for i in 4:
		level._on_step()
	_check(level.view_btn.visible and level.view_btn.get_combined_minimum_size().y >= 52.0, "follow camera: View button shown during a run (>= 52 units)")
	await create_timer(0.5).timeout
	var overview_zoom: float = level.target_zoom
	_key(KEY_C)
	_check(level.follow and level.view_btn.text.contains("Hero"), "follow camera: key C switches to Follow hero")
	_check(level.target_zoom < overview_zoom * 0.7, "follow camera: zooms in closer than the overview (%.1f -> %.1f)" % [overview_zoom, level.target_zoom])
	await create_timer(1.5).timeout
	var fig: Node3D = level.heroes._figures.get(0)
	var hero_pos: Variant = fig.global_position if fig else null
	_check(hero_pos != null and Vector2(level.rig.position.x - hero_pos.x, level.rig.position.z - hero_pos.z).length() < 0.6,
		"follow camera: pivot tracks the hero (%s vs %s)" % [level.rig.position, hero_pos])
	level._on_reset()
	_check(not level.follow and not level.view_btn.visible and not level.cam_manual, "follow camera: Build returns to the fitted overview")
	# Two heroes: when the followed one dies, the camera moves on to the next.
	var hs: Node = level.heroes
	hs.clear()
	hs.apply_turn([{"type": "spawn", "heroId": 0, "cell": {"x": 0, "y": 0}, "roomId": "A:0"},
		{"type": "spawn", "heroId": 1, "cell": {"x": 3, "y": 1}, "roomId": "A:0"}])
	var first: Variant = hs.follow_point()
	hs.apply_turn([{"type": "death", "heroId": 0}])
	var second: Variant = hs.follow_point()
	_check(first != null and second != null and is_equal_approx(first.x, 0.5) and is_equal_approx(second.x, 3.5),
		"follow camera: switches to the next living hero after a death (%s -> %s)" % [first, second])
	hs.clear()

	# Rotate and let the camera settle.
	level._rotate(90.0)
	await create_timer(0.8).timeout
	_check(level.camera_settled(), "camera snaps to 45° + n·90° after rotating (yaw %s)" % level.yaw)

	var shot := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			shot = a.substr(7)
	if shot != "":
		# Last level mid-run (gold and tolls on the board).
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
