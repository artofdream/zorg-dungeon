extends SceneTree
## Headless smoke test of the Level scene, driven through the same calls the
## tap/drag input uses:
##  - for every level in the picker, place its first golden layout (usually a
##    win), step the replay to the end and expect the banner for its outcome;
##  - drag a room straight out of the tray onto the board;
##  - drag onto an occupied spot: red ghost, nothing placed;
##  - rotate 90° and check the camera settles on a 45° + n·90° yaw;
##  - round 9: torch light / shadow limits per quality and the follow camera;
##  - round 11: Back/Esc, the ? legend and hint, Next level, Undo, turn lines;
##  - round 12: room labels never cover the HUD text on the end screens.
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


func _round11(engine: Node) -> void:
	# (1) Back / Esc: close the top popup, else ask "Quit Zorg?" (Stay/Quit).
	_check(not level.get_tree().quit_on_go_back, "back: Android Back doesn't quit the app by itself")
	level._open_level(0)
	await process_frame
	level.levels_panel.visible = true
	_key(KEY_ESCAPE)
	_check(not level.levels_panel.visible and not level.quit_dlg.visible, "back: Esc closes the Levels popup first")
	level.open_help()
	level.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	_check(not level.help_dlg.visible and not level.quit_dlg.visible, "back: Android Back closes the room legend")
	level.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	_check(level.quit_dlg.visible, "back: with nothing open, Back asks 'Quit Zorg?'")
	level.quit_stay.pressed.emit()
	_check(not level.quit_dlg.visible, "back: Stay closes the quit question")
	_key(KEY_ESCAPE)
	_check(level.quit_dlg.visible, "back: Esc asks 'Quit Zorg?' too")
	_key(KEY_ESCAPE)
	_check(not level.quit_dlg.visible, "back: Esc again closes it (stays in the game)")
	level._kb_select("A:0")
	_key(KEY_ESCAPE)
	_check(not level.kb_active and level.selected == "" and not level.placed.has("A:0") and not level.quit_dlg.visible,
		"back: Esc still cancels a keyboard placement, without the quit question")
	level.selected = "A:0"
	level.back_pressed()
	_check(level.selected == "" and not level.quit_dlg.visible, "back: Back drops a tapped room before asking to quit")
	level.get_viewport().gui_release_focus()

	# Keys behind a popup: no undo, step or camera change while it is up.
	level._place("A:0", Vector2i(0, 0))
	level._place("Z:0", Vector2i(1, 0))
	var zoom_before: float = level.target_zoom
	for popup in ["help", "quit"]:
		if popup == "help":
			level.open_help()
		else:
			level.back_pressed()
		_key(KEY_BACKSPACE)
		_key(KEY_SPACE)
		_key(KEY_MINUS)
		_check(level.placed.has("Z:0") and level._building() and is_equal_approx(level.target_zoom, zoom_before),
			"back: Backspace/Space/- do nothing behind the %s popup" % popup)
		_key(KEY_ESCAPE)
	_check(not level.popup_open(), "back: Esc closed both popups")
	level._unplace("Z:0")
	level._unplace("A:0")
	level.get_viewport().gui_release_focus()
	# Web in an iframe (itch.io): no Quit; Back/Esc only closes popups.
	_check(not level.embedded and level.quit_btn.visible, "embed: top level (not embedded) keeps the Quit button")
	var js_values: Array = [[true, true], [1, true], [1.0, true], ["1", true], [false, false], [0, false], [null, false], ["0", false]]
	_check(js_values.all(func(v): return level.embedded_from_js(v[0]) == v[1]),
		"embed: the JS answer is read right whether it comes back as bool, int or text (the web bridge returns 1/0)")
	level.set_embedded(true)
	_check(not level.quit_btn.visible, "embed: inside an iframe the Quit button is hidden")
	_key(KEY_ESCAPE)
	var after_esc: bool = level.quit_dlg.visible
	level.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	_check(not after_esc and not level.quit_dlg.visible, "embed: Esc and Back with nothing open do nothing")
	level.open_help()
	_key(KEY_ESCAPE)
	_check(not level.help_dlg.visible and not level.quit_dlg.visible, "embed: Esc still closes a popup")
	level.set_embedded(false)
	_check(level.quit_btn.visible, "embed: back at top level, Quit is shown again")
	level.get_viewport().gui_release_focus()

	# (2) "?" legend: every room type and element, GAME_SPEC wording only.
	level.help_btn.pressed.emit()
	await process_frame
	_check(level.help_dlg.visible, "help: ? opens the room legend")
	var text := ""
	for n in level.help_box.find_children("*", "Label", true, false):
		text += (n as Label).text + "\n"
	var keys: Array = ["A", "Z", "D(x)", "T(x, elem)", "P(n, f)", "O(x)", "fire", "water", "ice", "poison"]
	var missing: Array = keys.filter(func(k): return not text.contains(k))
	_check(missing.is_empty(), "help: legend covers A, Z, D, T, P, O and the element floors %s" % [missing])
	var spec_path := ProjectSettings.globalize_path("res://").path_join("../../GAME_SPEC.md")
	var spec := ZorgHelp.ascii(FileAccess.get_file_as_string(spec_path))
	var invented: Array = ZorgHelp.spec_phrases().filter(func(t): return not spec.contains(t))
	_check(spec != "" and invented.is_empty(), "help: every legend line is GAME_SPEC wording %s" % [invented])
	level.close_help()
	# First-run hint: shown until dismissed, then remembered.
	ZorgHelp.set_hint_seen(level.settings_path, false)
	level.hint.visible = true
	var got_it: Button = level.hint.find_children("*", "Button", true, false)[0]
	got_it.pressed.emit()
	_check(not level.hint.visible and ZorgHelp.hint_seen(level.settings_path), "help: 'Got it' hides the first-run hint and saves it")
	level.hint.visible = true
	level.open_help()
	_check(not level.hint.visible, "help: opening the legend also retires the hint")
	level.close_help()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(level.settings_path))

	# (3) Next level on the win banner.
	level._open_level(0)
	var g0 = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[0]["golden"]))
	for p in g0["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	var guard := 0
	while not level.run_over() and guard < 1000:
		level._on_step()
		guard += 1
	level.next_btn.pressed.emit()
	_check(level.level_index == 1 and level._building() and not level.next_btn.visible and level.result.text == "",
		"next: Next level opens %s ready to build" % engine.levels[1]["id"])

	# (4) Undo button while building (keyboard reachable), gone during a run.
	level._open_level(0)
	await process_frame
	_check(level.undo_btn.visible and level.undo_btn.disabled, "undo: shown while building, disabled with nothing placed")
	level._place("A:0", Vector2i(0, 0))
	level._place("Z:0", Vector2i(1, 0))
	_check(not level.undo_btn.disabled, "undo: enabled after a placement")
	level.undo_btn.pressed.emit()
	_check(level.placed.has("A:0") and not level.placed.has("Z:0"), "undo: the button takes back the last room")
	level.undo_btn.grab_focus()
	_key(KEY_ENTER)
	await process_frame
	_check(level.undo_btn.focus_mode == Control.FOCUS_ALL and not level.placed.has("A:0"), "undo: focusable, Enter on it undoes too")
	level.get_viewport().gui_release_focus()
	for p in g0["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	level._on_step()
	_check(not level.undo_btn.visible, "undo: hidden during a run")
	level._on_reset()
	# Targets: the new buttons are at least 52 units (51 dp measured on the phone).
	var targets: Array = [level.help_btn, level.undo_btn, level.next_btn, level.quit_stay, got_it]
	_check(targets.all(func(b): return b.get_combined_minimum_size().y >= ZorgHud.TARGET and b.get_combined_minimum_size().x >= ZorgHud.TARGET),
		"round 11 buttons are at least %d x %d units" % [ZorgHud.TARGET, ZorgHud.TARGET])

## Visible HUD text lines, measured from the drawn text (not the column).
func _hud_text(l: Node) -> Array:
	var out: Array = []
	for c in l.hud_top.get_children():
		if not (c is Control) or not c.is_visible_in_tree():
			continue
		var r: Rect2 = c.get_global_rect()
		if c is Label:
			if c.text.strip_edges() == "":
				continue
			var sz: Vector2 = c.get_theme_font("font").get_multiline_string_size(c.text, HORIZONTAL_ALIGNMENT_LEFT, r.size.x, c.get_theme_font_size("font_size"))
			r.size.x = minf(sz.x, r.size.x)
			out.append([c.text.substr(0, 20), r])
		else:
			out.append([String(c.name), r])
	return out

func _round12(engine: Node) -> void:
	var ids: Array = engine.levels.map(func(e): return e["id"])
	var win := level.get_window()
	var scale0: float = win.content_scale_factor
	for scale in [1.0, 1.75]:
		win.content_scale_factor = scale
		for lv in ["deluxe-1.1", "deluxe-2.2", "deluxe-5.2", "deluxe-5.5"]:
			var idx: int = ids.find(lv)
			level._open_level(idx)
			var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[idx]["golden"]))
			for p in g["cases"][0]["placements"]:
				level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
			level._on_play()                 # real Play pace, so each turn's animations run
			var guard := 0
			while not level.run_over() and guard < 3000:
				await process_frame
				guard += 1
			# Let the death fades and hit numbers finish (what the player sees).
			await create_timer(1.5).timeout
			var text := _hud_text(level)
			var plates: Array = level.label_layer.get_children() + level.hero_layer.get_children()
			plates = plates.filter(func(c): return c is Control and c.is_visible_in_tree() and c.modulate.a > 0.05 and not c.is_queued_for_deletion())
			var hits: Array = []
			for pl in plates:
				for t in text:
					if (pl as Control).get_global_rect().intersects(t[1]):
						hits.append("%s over '%s'" % [pl.get_child(0).text if pl.get_child_count() > 0 and pl.get_child(0) is Label else pl.name, t[0]])
			_check(level.result.text != "" and text.size() >= 3 and plates.size() >= 3 and hits.is_empty(),
				"end screen %s at UI scale %.2f: %d labels, %d HUD lines, no overlap %s" % [lv, scale, plates.size(), text.size(), hits])
	win.content_scale_factor = scale0
	level._on_reset()

func _initialize() -> void:
	level = load("res://scenes/level.tscn").instantiate()
	level.settings_path = "user://smoke_settings.cfg"   # leave the real settings alone
	DirAccess.remove_absolute(ProjectSettings.globalize_path(level.settings_path))
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
		var empty_turns := 0
		while not level.run_over() and guard < 1000:
			level._on_step()
			guard += 1
			if level.log_label.text.strip_edges().ends_with(":"):
				empty_turns += 1
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
		_check(empty_turns == 0, "%s: no empty 'Turn N:' line (%d empty)" % [engine.levels[i]["id"], empty_turns])
		var next_wanted: bool = String(case0["score"]["outcome"]) == "win" and i + 1 < engine.levels.size()
		_check(level.next_btn.visible == next_wanted, "%s: Next level button %s" % [engine.levels[i]["id"], "shown" if next_wanted else "hidden"])
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
	_check(lit.size() <= ZorgAtmos.LOW_LIGHTS and lit.size() > 0 and shadowed.is_empty() and not level.get_node("Sun").shadow_enabled
		and is_equal_approx(level.get_viewport().scaling_3d_scale, ZorgAtmos.LOW_3D_SCALE),
		"quality Low: %d torch lights (max %d), no shadows, 3D scale %.2f" % [lit.size(), ZorgAtmos.LOW_LIGHTS, level.get_viewport().scaling_3d_scale])
	level.set_quality("high", false)
	lit = level.torch_lights().filter(func(l): return l.visible)
	shadowed = level.torch_lights().filter(func(l): return l.visible and l.shadow_enabled)
	_check(lit.size() > ZorgAtmos.LOW_LIGHTS and lit.size() <= ZorgAtmos.HIGH_LIGHTS and shadowed.size() == mini(ZorgAtmos.HIGH_SHADOWS, lit.size())
		and is_equal_approx(level.get_viewport().scaling_3d_scale, 1.0),
		"quality High: %d torch lights, %d with shadows, 3D scale %.2f" % [lit.size(), shadowed.size(), level.get_viewport().scaling_3d_scale])
	level.set_quality("low", false)

	# Round 10: every room is built from the vendored CC0 KayKit models: stone
	# block walls, floor tiles and a wall sconce on its torch.
	var sconce: Mesh = ZorgLook.parts("torch_mounted")[0][0]
	var with_walls := 0
	var with_sconce := 0
	for id in level.room_nodes:
		var rn: Node3D = level.room_nodes[id]
		var merged: Array = rn.find_children("Merged*", "MeshInstance3D", false, false)
		if merged.any(func(m): return "floor_foundation_allsides" in m.get_meta("pieces", [])) and merged.size() <= 8:
			with_walls += 1
		var torch: Node = rn.get_node_or_null("Torch")
		if torch and torch.find_children("*", "MeshInstance3D", true, false).any(func(m): return m.mesh == sconce):
			with_sconce += 1
	_check(level.room_nodes.size() >= 6 and with_walls == level.room_nodes.size() and with_sconce == level.room_nodes.size(),
		"models: %d rooms, %d with merged KayKit walls (<= 8 meshes), %d with a wall sconce" % [level.room_nodes.size(), with_walls, with_sconce])

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
	# Bugbot (#98): a pan leaves follow without stacking the close-up, and
	# zooming in from the close-up never zooms out.
	var close_zoom: float = level.target_zoom
	level._pan(Vector2(1, 0))
	level._zoom_by(-4.0)
	_check(not level.follow and level.target_zoom <= close_zoom + 0.01, "follow camera: Zoom + after a pan out of follow doesn't zoom out (%.1f -> %.1f)" % [close_zoom, level.target_zoom])
	_key(KEY_C)
	_check(level.follow and is_equal_approx(level.target_zoom, close_zoom), "follow camera: View after a pan doesn't stack the zoom (%.1f)" % level.target_zoom)
	await create_timer(1.5).timeout
	var fig: Node3D = level.heroes._figures.get(0)
	var hero_pos: Variant = fig.global_position if fig else null
	var anim: AnimationPlayer = fig.find_child("AnimationPlayer", true, false) if fig else null
	_check(anim != null and anim.is_playing() and anim.current_animation == "Idle" and (fig.get_meta("mats") as Array).size() > 0
		and fig.get_meta("mats").all(func(m): return m is StandardMaterial3D and m.emission_enabled),
		"models: the hero is a KayKit figure playing Idle, with its own flashable materials")
	_check(hero_pos != null and Vector2(level.rig.position.x - hero_pos.x, level.rig.position.z - hero_pos.z).length() < 0.6,
		"follow camera: pivot tracks the hero (%s vs %s)" % [level.rig.position, hero_pos])
	level._on_reset()
	_check(not level.follow and not level.view_btn.visible and not level.cam_manual, "follow camera: Build returns to the fitted overview")
	# Bugbot (#99): a far overview (zoom 40) closes in to 24 once; View,
	# pan, View keeps 24 instead of stacking to 14.4.
	for i in 2:
		level._on_step()
	level._set_zoom(40.0)
	_key(KEY_C)
	var far_close: float = level.target_zoom
	level._pan(Vector2(1, 0))
	_key(KEY_C)
	_check(is_equal_approx(far_close, 24.0) and is_equal_approx(level.target_zoom, far_close), "follow camera: from a far overview, View/pan/View doesn't stack (%.1f -> %.1f)" % [far_close, level.target_zoom])
	# Bugbot (#100): zooming IN from that far close-up (24 -> 20) and View
	# again keeps 20; only a zoom out to an overview distance re-arms it.
	level._pan(Vector2(1, 0))
	level._set_zoom(20.0)
	_key(KEY_C)
	var after_in: float = level.target_zoom
	level._pan(Vector2(1, 0))
	level._set_zoom(30.0)
	_key(KEY_C)
	_check(is_equal_approx(after_in, 20.0) and is_equal_approx(level.target_zoom, 18.0), "follow camera: zoom in keeps the close-up, zoom out re-arms it (%.1f, %.1f)" % [after_in, level.target_zoom])
	level._on_reset()

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

	# Round 11 UX audit fixes.
	await _round11(engine)
	# Round 12: end screens (wins on 1.1/2.2/5.2; 5.5 has no winning golden,
	# so its loss screen) at desktop scale and at the phone's 1.75.
	await _round12(engine)

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
