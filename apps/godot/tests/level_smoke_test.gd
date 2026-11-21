extends SceneTree
## Headless smoke test of the Level scene, driven through the same calls the
## tap/drag input uses:
##  - for every level in the picker, place its first golden layout (usually a
##    win), step the replay to the end and expect the banner for its outcome;
##  - drag a room straight out of the tray onto the board;
##  - drag onto an occupied spot: red ghost, nothing placed;
##  - rotate 90° and check the camera settles on a 45° + n·90° yaw;
##  - free yaw (100°) works, Fit snaps to the 135°/45° sector, and near
##    walls stay low at two different yaws;
##  - round 9: torch light / shadow limits per quality and the follow camera;
##  - round 11: Back/Esc, the ? legend and hint, Next level, Undo, turn lines;
##  - the FPS readout: hidden until F3, then a non-zero top-right label;
##  - the end banner: win and loss lines have a non-zero size in the HUD column;
##  - the room legend covers the HUD, and the first-run hint sits under the goal.
##  - spell bar: icon buttons stay disabled at stepCount 0, enable and pulse
##    after the first Step, and cast_spell still spends a spell (FR-32/FR-33).
##  - round 12: room labels never cover the HUD text on the end screens.
##  - low-severity UX: button/panel/plate border contrast, swatch outlines,
##    and the board fitting the width of a ~360 dp portrait window.
##  - phone HUD: Levels and ? stay on a 2340×1080 landscape canvas, the
##    first-run spell hint stays in the text column off the hero HP label,
##    and tap-vs-pan slop is at least 12 px and about 2.5 mm.
##  - level picker: a modal over the HUD (above the room tray), every button
##    inside the viewport on landscape, 2340×1080 and 360-wide portrait.
##  - FR-47 Show a solution: the ? dialog asks before it clears the board;
##    every stored solution plays to the win banner with a caption per step;
##    unsolved levels say so; the caption plate stays in the HUD text column,
##    off the tray, the run controls and the Levels / ? corner (also on a
##    2340×1080 landscape canvas). `-- --solution-shot=path.png` saves one.
##  - hitch fix (CF-015): the warm-up pools every room and hero off-screen,
##    a tray drop with no ready room shows a placeholder and finishes it a
##    few frames later, and the Play button builds the walls over frames
##    with the first step after them.
## Optional: `-- --shot=path.png` saves a screenshot (needs a display).

var level: Node
var failures := 0

func _check(ok: bool, what: String) -> void:
	if ok:
		print("PASS ", what)
	else:
		failures += 1
		printerr("FAIL ", what)

## Drive the board path even in headless (no GUI pick needed).
func _board_mouse(pos: Vector2, pressed: bool) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.pressed = pressed
	e.position = pos
	e.global_position = pos
	e.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	if pressed:
		level._unhandled_input(e)
	else:
		# A room-drag release is handled in _input (handle_drag_input marks
		# it handled), so _left_press never sees it. Mirror that here so the
		# pan-flag assertions would fail without the _input clear.
		var room_drag: bool = level.drag_id != ""
		level._input(e)
		if not room_drag:
			level._unhandled_input(e)


func _board_move(pos: Vector2) -> void:
	var e := InputEventMouseMotion.new()
	e.position = pos
	e.global_position = pos
	e.button_mask = MOUSE_BUTTON_MASK_LEFT
	level._input(e)
	level._unhandled_input(e)


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
	level.level_picker.set_open(true)
	await process_frame
	_check(level.levels_panel.size.x > 1.0 and level.levels_panel.size.y > 1.0
		and level.picker.get_child_count() > 1,
		"picker: open grid has a non-zero size (%s) and %d levels" % [level.levels_panel.size, level.picker.get_child_count()])
	_key(KEY_ESCAPE)
	_check(not level.levels_panel.visible and not level.quit_dlg.visible, "back: Esc closes the Levels popup first")
	level.picker.get_child(1).pressed.emit()
	_check(level.level_index == 1 and not level.levels_panel.visible, "picker: level_picked opens that level and closes the grid")
	level.levels_btn.grab_focus()
	_key(KEY_TAB)
	var focus_owner: Control = level.get_viewport().gui_get_focus_owner()
	_check(focus_owner == level.help_btn, "picker: Tab from Level moves to ? (got %s)" % (focus_owner.name if focus_owner else "none"))
	level.get_viewport().gui_release_focus()
	await _picker_modal_checks("default canvas", true)
	level._open_level(0)
	level.open_help()
	level.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	_check(not level.help_dlg.visible and not level.quit_dlg.visible, "back: Android Back closes the room legend")
	level.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	_check(level.quit_dlg.visible, "back: with nothing open, Back asks 'Quit Zorg?'")
	_check(level.quit_dlg.get_global_rect().grow(1.0).encloses(level.ui_root.get_global_rect()),
		"quit dialog covers the HUD (%s vs %s)" % [level.quit_dlg.get_global_rect(), level.ui_root.get_global_rect()])
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
	var legend_r: Rect2 = level.help_dlg.get_global_rect()
	var hud_r: Rect2 = level.ui_root.get_global_rect()
	_check(legend_r.size.x > 1.0 and legend_r.size.y > 1.0 and legend_r.grow(1.0).encloses(hud_r),
		"help: legend covers the HUD and has a non-zero size (%s vs %s)" % [legend_r, hud_r])
	_check(level.help_box.get_combined_minimum_size().y > 1.0,
		"help: legend body has a non-zero size %s" % level.help_box.get_combined_minimum_size())
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
	level.hint.show_hint(true)
	await process_frame
	var hint_r: Rect2 = level.hint.get_global_rect()
	var goal_r: Rect2 = level.goal.get_global_rect()
	var col_r: Rect2 = level.hud_top.get_global_rect()
	_check(level.hint.visible and hint_r.size.x > 1.0 and hint_r.size.y > 1.0
		and hint_r.position.y + 1.0 >= goal_r.position.y
		and hint_r.position.x >= col_r.position.x - 1.0 and hint_r.end.x <= col_r.end.x + 1.0,
		"help: hint is non-zero under the goal in the HUD column (%s)" % hint_r)
	var got_it: Button = level.hint.find_children("*", "Button", true, false)[0]
	got_it.pressed.emit()
	_check(not level.hint.visible and ZorgHelp.hint_seen(level.settings_path), "help: 'Got it' hides the first-run hint and saves it")
	level.hint.show_hint(true)
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
		"next: Next level signal opens %s ready to build" % engine.levels[1]["id"])

	# (4) Undo button while building (keyboard reachable), still there during a run.
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
	# Board UX: Undo stays on screen and usable after Play (back to build).
	_check(level.undo_btn.visible and not level.undo_btn.disabled, "undo: still shown and enabled during a run")
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
		if c is ZorgEndBanner:
			for child in c.get_children():
				if not (child is Control) or not child.is_visible_in_tree():
					continue
				var br: Rect2 = child.get_global_rect()
				if child is Label:
					if child.text.strip_edges() == "":
						continue
					var bz: Vector2 = child.get_theme_font("font").get_multiline_string_size(child.text, HORIZONTAL_ALIGNMENT_LEFT, br.size.x, child.get_theme_font_size("font_size"))
					br.size.x = minf(bz.x, br.size.x)
					out.append([child.text.substr(0, 20), br])
				else:
					out.append([String(child.name), br])
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


func _rel_lum(c: Color) -> float:
	var ch := func(v: float) -> float:
		return v / 12.92 if v <= 0.04045 else pow((v + 0.055) / 1.055, 2.4)
	return 0.2126 * ch.call(c.r) + 0.7152 * ch.call(c.g) + 0.0722 * ch.call(c.b)

func _contrast(a: Color, b: Color) -> float:
	var lo := minf(_rel_lum(a), _rel_lum(b))
	var hi := maxf(_rel_lum(a), _rel_lum(b))
	return (hi + 0.05) / (lo + 0.05)

func _patch(img: Image, at: Vector2, r := 4) -> Color:
	var sum := Color(0, 0, 0)
	var n := 0
	for dy in range(-r, r + 1):
		for dx in range(-r, r + 1):
			var x := clampi(int(at.x) + dx, 0, img.get_width() - 1)
			var y := clampi(int(at.y) + dy, 0, img.get_height() - 1)
			sum += img.get_pixel(x, y)
			n += 1
	return Color(sum.r / n, sum.g / n, sum.b / n)

## Dungeon look: the darker scene must still read on the renderer CI draws
## with (Compatibility under Xvfb, Low). On 1.2 while building: each room's
## floor stands out from an empty slot next to it, an empty slot stands out
## from the black beyond the board, and rooms of different types differ in
## colour. #112's unreadable board measured ~1.07:1.
func _readability_render(engine: Node) -> void:
	if DisplayServer.get_name() == "headless":
		print("SKIP readability render: headless")
		return
	var one2: int = engine.levels.map(func(e): return e["id"]).find("deluxe-1.2")
	level._open_level(one2)
	level.set_quality("low", false)
	var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[one2]["golden"]))
	for p in g["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	level._on_fit()
	for i in 60:
		await process_frame
	var img: Image = level.get_viewport().get_texture().get_image()
	var vis: Rect2 = level.get_viewport().get_visible_rect()
	var k := Vector2(img.get_width(), img.get_height()) / vis.size
	var cam: Camera3D = level.get_viewport().get_camera_3d()
	var to_px := func(w: Vector3) -> Vector2: return (cam.unproject_position(w) - vis.position) * k
	var worst := INF
	var by_type := {}
	var empty := Color(0, 0, 0)
	var empty_n := 0
	for id in level.placed:
		var slot: Vector2i = level.placed[id]
		var c: Vector3 = level.slot_center(slot.x, slot.y)
		var room := _patch(img, to_px.call(c + Vector3(1.0, ZorgLook.FLOOR_H, 0)))
		by_type[String(level._supplied(id)["def"]["type"])] = room
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var q: Vector2i = slot + d
			if level._in_board(q) and level._room_at_slot(q) == "":
				var e := _patch(img, to_px.call(level.slot_center(q.x, q.y)))
				worst = minf(worst, _contrast(room, e))
				empty += e
				empty_n += 1
	empty = empty / maxf(1.0, empty_n)
	var bg := _patch(img, Vector2(6, img.get_height() - 6), 3)
	var min_gap := INF
	var types: Array = by_type.keys()
	for i in types.size():
		for j in range(i + 1, types.size()):
			var a: Color = by_type[types[i]]
			var b: Color = by_type[types[j]]
			min_gap = minf(min_gap, Vector3(a.r - b.r, a.g - b.g, a.b - b.b).length())
	print("readability: room/slot %.2f:1, slot/background %.2f:1, type gap %.3f (%s)" % [worst, _contrast(empty, bg), min_gap, types])
	_check(worst >= 1.5, "dungeon look: every room floor stands out from an empty slot beside it (%.2f:1 >= 1.5)" % worst)
	_check(_contrast(empty, bg) >= 1.12, "dungeon look: empty slots stand out from the black beyond the board (%.2f:1 >= 1.12, #112 was 1.07)" % _contrast(empty, bg))
	_check(types.size() < 2 or min_gap >= 0.08, "dungeon look: room types differ in colour (min RGB gap %.3f >= 0.08)" % min_gap)

## Dungeon look, walls and props: only during a run, never inside a room,
## tall walls only on the sides away from the camera, props under the cap.
func _dressing_checks(engine: Node) -> void:
	var i58: int = engine.levels.map(func(e): return e["id"]).find("deluxe-5.8")
	level._open_level(i58)
	var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[i58]["golden"]))
	for p in g["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	await process_frame
	var dr: ZorgDungeonDressing = level.dressing
	_check(dr == null or dr.get_child_count() == 0 or dr.get_children().all(func(c): return c.is_queued_for_deletion()),
		"dressing: no walls or props while building")
	level.set_quality("low", false)
	level._on_step()
	await process_frame
	dr = level.dressing
	var props: Array = dr.get_children().filter(func(c): return String(c.name).begins_with("Prop_"))
	var shown: Array = props.filter(func(c): return c.visible)
	var inside := 0
	for pr in props:
		var pos: Vector3 = pr.global_position
		for id in level.placed:
			var c: Vector3 = level.slot_center(level.placed[id].x, level.placed[id].y)
			if absf(pos.x - c.x) < ZorgLook.ROOM / 2.0 and absf(pos.z - c.z) < ZorgLook.ROOM / 2.0:
				inside += 1
	var chests := props.filter(func(c): return String(c.name) == "Prop_chest_gold").size()
	var gold_rooms: int = level.placed.keys().filter(func(id): return String(level._supplied(id)["def"].get("type", "")) == "O").size()
	_check(props.size() > 0 and shown.size() <= ZorgDungeonDressing.LOW_PROPS and inside == 0 and chests == gold_rooms and gold_rooms >= 1,
		"dressing: %d props (%d shown, Low cap %d), %d gold chest(s) for %d gold room(s), %d inside a room" % [props.size(), shown.size(), ZorgDungeonDressing.LOW_PROPS, chests, gold_rooms, inside])
	var back: Vector3 = level.get_viewport().get_camera_3d().global_transform.basis.z
	var tall_ok := true
	var tall_n := 0
	for c in dr.get_children():
		if String(c.name).begins_with("Walls_") and c.visible:
			tall_n += 1
			var parts := String(c.name).split("_")
			var n := Vector3(int(parts[1]), 0, -int(parts[2]))
			tall_ok = tall_ok and n.dot(Vector3(back.x, 0, back.z)) < 0.0
	_check(tall_n == 2 and tall_ok, "dressing: tall walls on the %d sides away from the camera only" % tall_n)
	level._on_reset()
	await process_frame
	_check(dr.get_children().all(func(c): return c.is_queued_for_deletion()), "dressing: Build clears the walls and props")

## Dungeon look camera: lower default angle; Follow hero tilts lower still
## and gives the angle back on exit unless the user tilted meanwhile.
func _camera_look_checks() -> void:
	var c: ZorgLevelCamera = level.cam
	c.target_pitch = ZorgLevelCamera.DEFAULT_PITCH
	c.set_follow(true)
	var tilted := c.target_pitch
	c.set_follow(false)
	var back := c.target_pitch
	c.set_follow(true)
	c.tilt_by(8.0)
	var user := c.target_pitch
	c.set_follow(false)
	_check(is_equal_approx(tilted, ZorgLevelCamera.DEFAULT_PITCH - ZorgLevelCamera.FOLLOW_TILT) and is_equal_approx(back, ZorgLevelCamera.DEFAULT_PITCH)
		and is_equal_approx(c.target_pitch, user),
		"camera look: default %.0f°, follow tilts to %.0f° and back to %.0f°; a user tilt in follow is kept (%.0f°)" % [ZorgLevelCamera.DEFAULT_PITCH, tilted, back, c.target_pitch])
	c.target_pitch = ZorgLevelCamera.DEFAULT_PITCH

## Free yaw, Fit snap, and view-dependent low walls at two headings.
func _camera_orbit_checks(engine: Node) -> void:
	var i58: int = engine.levels.map(func(e): return e["id"]).find("deluxe-5.8")
	level._open_level(i58)
	var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[i58]["golden"]))
	for p in g["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	level.set_quality("low", false)
	level._on_step()
	await process_frame
	# From the default 45°, a free yaw of +55° is 100°.
	level._yaw_by(55.0)
	level._update_camera()
	await process_frame
	_check(is_equal_approx(fposmod(level.yaw, 360.0), 100.0) and is_equal_approx(fposmod(level.target_yaw, 360.0), 100.0),
		"free yaw: 100° works (yaw %.1f, target %.1f)" % [level.yaw, level.target_yaw])
	_check(_near_walls_low(), "dressing: near walls are low at yaw 100°")
	# 90° buttons step from the current (free) yaw, not from the sector grid.
	level._rotate(90.0)
	await create_timer(0.8).timeout
	_check(is_equal_approx(fposmod(level.yaw, 360.0), 190.0),
		"free yaw: 90° step from 100° lands on 190° (yaw %.1f)" % level.yaw)
	level._yaw_by(-90.0)
	level._update_camera()
	# Fit snaps 100° to the 135° sector.
	level._on_fit()
	await create_timer(0.8).timeout
	_check(level.camera_settled() and is_equal_approx(fposmod(level.yaw, 360.0), 135.0),
		"free yaw: Fit snaps 100° back to the 135° sector (yaw %.1f)" % level.yaw)
	_check(_near_walls_low(), "dressing: near walls are low at yaw 135°")
	# A rotate gesture leaves Follow hero, same as a pan.
	level._on_cam_mode()
	_check(level.follow, "free yaw: follow can be turned on before a rotate gesture")
	level._yaw_by(5.0)
	_check(not level.follow, "free yaw: a rotate gesture takes over from follow")
	level._on_fit()
	await create_timer(0.8).timeout


func _near_walls_low() -> bool:
	var dr: ZorgDungeonDressing = level.dressing
	if dr == null:
		return false
	level.cam.update_transform()
	dr.face_yaw(level.yaw)
	var back: Vector3 = level.get_viewport().get_camera_3d().global_transform.basis.z
	var flat := Vector3(back.x, 0, back.z)
	var tall_n := 0
	var tall_ok := true
	for c in dr.get_children():
		if String(c.name).begins_with("Walls_") and c.visible:
			tall_n += 1
			var parts := String(c.name).split("_")
			var n := Vector3(int(parts[1]), 0, -int(parts[2]))
			tall_ok = tall_ok and n.dot(flat) < 0.0
	return tall_n == 2 and tall_ok


## Pan/orbit always take over auto-fit; a still click on a placed room
## unplaces, and a press-drag moves it (the drag starts on press).
func _camera_manual_and_room_press_checks(engine: Node) -> void:
	var i0 := 0
	level._open_level(i0)
	level._place("A:0", Vector2i(0, 0))
	level.cam_manual = false
	level._set_follow(false)
	level._pan(Vector2(24, 0))
	_check(level.cam_manual, "pan sets cam_manual even when not following")
	level.cam_manual = false
	level._yaw_by(12.0)
	_check(level.cam_manual, "orbit sets cam_manual even when not following")
	level._on_fit()
	await _settle_board_camera()
	var cam: Camera3D = level.get_node("CameraRig/Camera3D")
	var pos: Vector2 = cam.unproject_position(level.slot_center(0, 0))
	_board_mouse(pos, true)
	# Press on a placed room must start the drag before release.
	_check(level.drag_id == "A:0" and not level.board_build.drag_active,
		"board press: still press on a placed room starts a drag (id %s, pos %s, slot %s)" % [level.drag_id, pos, level._screen_to_slot(pos)])
	_board_mouse(pos, false)
	await process_frame
	_check(not level.placed.has("A:0") and level.drag_id == "" and not level._press_left and not level._press_dragged,
		"board press: still release on a placed room unplaces it and clears the pan flags")
	level._place("A:0", Vector2i(0, 0))
	# Unplace + re-place re-fit the camera; aim from where it settles, not
	# from the screen point taken before (CF: stale aim under slow frames).
	await _settle_board_camera()
	pos = cam.unproject_position(level.slot_center(0, 0))
	var dest: Vector2 = cam.unproject_position(level.slot_center(1, 0))
	_board_mouse(pos, true)
	_check(level.drag_id == "A:0",
		"board press: press on the re-placed room starts a drag (id %s, pos %s, slot %s)" % [level.drag_id, pos, level._screen_to_slot(pos)])
	for k in 6:
		_board_move(pos.lerp(dest, (k + 1) / 6.0))
		await process_frame
	_board_mouse(dest, false)
	await process_frame
	_check(level.placed.get("A:0") == Vector2i(1, 0) and level.drag_id == "" and not level._press_left and not level._press_dragged,
		"board press: press-drag moves the room to %s and clears the pan flags" % level.placed.get("A:0"))
	level._on_fit()


## Deterministic board camera for screen-space input checks. A fit glides
## the pivot with a 0.35 s wall-clock tween, and a board change queues a
## refit two frames later, so a screen point read one frame after a fit
## depends on frame time (slow software GL under a loaded Xvfb moved the
## camera ~40 px and the press missed the room). Let queued refits fire,
## then snap the camera to the fit target.
func _settle_board_camera() -> void:
	for i in 4:
		await process_frame
	level.cam.stop_glide()
	level._fit_camera(true)
	await process_frame
	_check(not level.cam.is_gliding() and level.cam._fit_pending == 0,
		"board press: camera is settled before screen-space input (gliding %s, pending fit %d)" % [level.cam.is_gliding(), level.cam._fit_pending])


## Icon camera pad: stable names, icons, tooltips, 52-unit targets.
func _camera_pad_checks() -> void:
	var want := {
		"ZoomIn": "Zoom +",
		"ZoomOut": "Zoom -",
		"TiltUp": "Tilt +",
		"TiltDown": "Tilt -",
		"TurnLeft": "Turn left 90°",
		"TurnRight": "Turn right 90°",
		"Fit": "Fit",
		"View": "View:"
	}
	for id in want:
		var b: Button = level.cam_grid.get_node_or_null(id)
		_check(b != null and b.icon != null and b.custom_minimum_size.y >= 52.0 and b.text == ""
			and String(b.tooltip_text).contains(want[id]) and b.accessibility_name == b.tooltip_text,
			"camera pad: %s is an icon button (>= 52), tooltip/accessible '%s'" % [id, b.tooltip_text if b else ""])
	_check(level.view_btn != null and level.view_btn.name == "View", "camera pad: View button is looked up by name, not by caption")


func _round13() -> void:
	# WCAG 1.4.11: enabled chrome borders are at least 3:1 on their fill.
	# Disabled is exempt (1.4.3).
	var theme: Theme = level.ui_root.theme
	for kind in ["normal", "hover", "pressed"]:
		var s: StyleBoxFlat = theme.get_stylebox(kind, "Button")
		_check(_contrast(s.bg_color, s.border_color) >= 3.0,
			"UX: Button %s border contrast %.2f:1 is at least 3:1" % [kind, _contrast(s.bg_color, s.border_color)])
	var panel: StyleBoxFlat = theme.get_stylebox("panel", "PanelContainer")
	_check(_contrast(panel.bg_color, panel.border_color) >= 3.0,
		"UX: panel border contrast %.2f:1 is at least 3:1" % _contrast(panel.bg_color, panel.border_color))
	var plate: StyleBoxFlat = ZorgHud.plate()
	_check(_contrast(plate.bg_color, plate.border_color) >= 3.0,
		"UX: plate border contrast %.2f:1 is at least 3:1" % _contrast(plate.bg_color, plate.border_color))
	# Every legend swatch has a light outer pixel and a dark ring so muted
	# browns and ice stay readable on the dark HUD.
	var defs: Array = [
		{"type": "A"}, {"type": "Z"}, {"type": "D"}, {"type": "T"}, {"type": "O"}, {"type": "P"},
		{"type": "E", "element": "fire"}, {"type": "E", "element": "water"},
		{"type": "E", "element": "ice"}, {"type": "E", "element": "poison"},
	]
	for def in defs:
		var img: Image = ZorgHud.swatch(def).get_image()
		var light: Color = img.get_pixel(0, 0)
		var dark: Color = img.get_pixel(1, 1)
		var mid: Color = img.get_pixel(img.get_width() / 2, img.get_height() / 2)
		var ok := _rel_lum(light) > 0.7 and _rel_lum(dark) < 0.05 and mid.a > 0.9 and img.get_width() >= 22
		_check(ok, "UX: swatch %s has a light/dark outline (edge lum %.2f / %.2f)" % [def, _rel_lum(light), _rel_lum(dark)])
	# Narrow portrait (~360 dp): the visible board must sit inside the window.
	# Headless windows stay 64x64, so this only runs under Xvfb (or a display).
	var win := level.get_window()
	var old := win.size
	DisplayServer.window_set_size(Vector2i(360, 800))
	win.size = Vector2i(360, 800)
	level._on_resized()
	for i in 40:
		await process_frame
	var vpsz := Vector2(level.get_viewport().size)
	print("UX: portrait window %s viewport %s visible %s zoom %.1f scale %.2f" % [win.size, vpsz, level.get_viewport().get_visible_rect(), level.zoom, win.content_scale_factor])
	if vpsz.x < 300:
		print("UX: skip portrait board-fit (viewport is %s, needs a display)" % vpsz)
	else:
		level.cam_manual = false
		level._fit_camera(true)
		await process_frame
		# unproject lives in visible_rect / canvas space, not window pixels.
		var vis := level.get_viewport().get_visible_rect()
		var hole: Rect2 = level._fit_area()
		var clipped := 0
		var n := 0
		for x in [level.SLOTS_X.x, level.SLOTS_X.y + 1]:
			for y in [level.SLOTS_Y.x, level.SLOTS_Y.y + 1]:
				for h in [0.0, level.FIT_HEIGHT]:
					var w := Vector3(x * level.ROOM, h, -y * level.ROOM)
					n += 1
					var q: Vector2 = level.camera.unproject_position(w)
					if level.camera.is_position_behind(w) or not vis.grow(-2.0).has_point(q):
						clipped += 1
						if clipped <= 4:
							print("UX: clipped corner %s -> %s behind=%s vis=%s hole=%s" % [w, q, level.camera.is_position_behind(w), vis, hole])
		_check(clipped == 0 and n > 0,
			"UX: %d/%d board corners fit inside a %s portrait canvas (zoom %.1f, area %s)" % [n - clipped, n, vis.size, level.zoom, hole])
	DisplayServer.window_set_size(old)
	win.size = old
	level._on_resized()
	for i in 10:
		await process_frame

func _fps_readout() -> void:
	var fps: ZorgFpsReadout = level.fps_readout
	_check(fps != null, "fps: readout exists")
	if fps == null:
		return
	_check(not fps.visible, "fps: hidden until ?fps=1 or F3")
	_check(is_equal_approx(fps.offset_top, ZorgHud.TARGET + 6.0),
		"fps: sits under the top buttons (offset %s)" % fps.offset_top)
	_key(KEY_F3)
	await process_frame
	await process_frame
	_check(fps.visible, "fps: F3 shows the readout")
	_check(fps.size.x > 0.0 and fps.size.y > 0.0, "fps: shown readout has a non-zero size %s" % fps.size)
	_check(fps.text.contains("FPS"), "fps: line is the counter (%s)" % fps.text)
	var ui: Control = level.ui_root
	var r := fps.get_global_rect()
	var u := ui.get_global_rect()
	_check(absf(r.end.x - u.end.x) <= 2.0 and r.position.y >= u.position.y - 1.0 and r.end.y <= u.position.y + ZorgHud.TARGET + 48.0,
		"fps: readout is at the top right (%s vs %s)" % [r, u])
	level.back_pressed()
	_key(KEY_F3)
	await process_frame
	_check(level.quit_dlg.visible and fps.visible, "fps: F3 does nothing behind the quit question")
	level.quit_dlg.close()
	_key(KEY_F3)
	await process_frame
	_check(not fps.visible and not level.quit_dlg.visible, "fps: F3 hides the readout again")

func _initialize() -> void:
	level = load("res://scenes/level.tscn").instantiate()
	level.settings_path = "user://smoke_settings.cfg"   # leave the real settings alone
	DirAccess.remove_absolute(ProjectSettings.globalize_path(level.settings_path))
	root.add_child(level)
	await process_frame
	await _fps_readout()
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
		var outcome := String(case0["score"]["outcome"])
		if outcome == "win" or outcome == "loss":
			var banner: ZorgEndBanner = level.end_banner
			var br: Rect2 = banner.get_global_rect()
			var hr: Rect2 = level.hud_top.get_global_rect()
			var title_r: Rect2 = level.title.get_global_rect()
			_check(banner.is_showing() and br.size.x > 1.0 and br.size.y > 1.0
				and br.position.x >= hr.position.x - 1.0 and br.end.x <= hr.end.x + 1.0
				and br.position.y + 1.0 >= title_r.end.y,
				"%s: end banner shown, non-zero, in the HUD column under the title (%s in %s)" % [engine.levels[i]["id"], br, hr])
			_check(level.result.get_global_rect().size.y > 1.0, "%s: banner line has a non-zero height" % engine.levels[i]["id"])
			if next_wanted:
				var nr: Rect2 = level.next_btn.get_global_rect()
				_check(nr.size.x > 1.0 and nr.size.y > 1.0 and nr.position.y >= level.result.get_global_rect().position.y,
					"%s: Next level sits in the banner under the line (%s)" % [engine.levels[i]["id"], nr])
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
	var rooms: int = level.room_nodes.size()
	var lit: Array = level.torch_lights().filter(func(l): return l.visible)
	var shadowed: Array = level.torch_lights().filter(func(l): return l.visible and l.shadow_enabled)
	_check(lit.size() == mini(rooms, ZorgAtmos.LOW_LIGHTS) and shadowed.is_empty() and not level.get_node("Sun").shadow_enabled
		and is_equal_approx(level.get_viewport().scaling_3d_scale, ZorgAtmos.LOW_3D_SCALE),
		"quality Low: %d/%d torch lights (cap %d), no shadows, 3D scale %.2f" % [lit.size(), rooms, ZorgAtmos.LOW_LIGHTS, level.get_viewport().scaling_3d_scale])
	level.set_quality("high", false)
	lit = level.torch_lights().filter(func(l): return l.visible)
	shadowed = level.torch_lights().filter(func(l): return l.visible and l.shadow_enabled)
	_check(lit.size() == mini(rooms, ZorgAtmos.HIGH_LIGHTS) and shadowed.size() == mini(ZorgAtmos.HIGH_SHADOWS, lit.size())
		and is_equal_approx(level.get_viewport().scaling_3d_scale, 1.0),
		"quality High: %d torch lights, %d with shadows, 3D scale %.2f" % [lit.size(), shadowed.size(), level.get_viewport().scaling_3d_scale])
	# The board has to stay readable with no torch at all. Dungeon look
	# (agent/grok/dungeon-look-torchlit): the fill is now cool and dim on
	# purpose (round 9 asked for >= 0.5 warm ambient), and readability comes
	# from glow instead: the flagstone board, every room floor and the runes
	# are emissive. #112's unreadable render had ambient 0.17, fog 0.012 and
	# no emissive floor; these floors stop that coming back. The rendered
	# contrast itself is measured under Xvfb (_readability_render).
	var board_glow: float = ZorgLook.board_mat().get_shader_parameter("glow")
	var floors_ok := true
	for t in ZorgLook.FLOORS:
		var fm: StandardMaterial3D = ZorgLook.mat("floor_" + t)
		floors_ok = floors_ok and fm.emission_enabled and fm.emission_energy_multiplier >= 0.3
	_check(level.env.ambient_light_energy >= ZorgAtmos.AMBIENT_MIN and level.env.fog_density <= 0.008
		and board_glow >= 0.1 and floors_ok,
		"board readable without a torch (ambient %.2f, fog %.3f, board glow %.2f, room floors emissive %s)" % [level.env.ambient_light_energy, level.env.fog_density, board_glow, floors_ok])
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

	# Declared cosmetic lights (visual-lights.json). Damage rooms get a
	# brazier. The omni cap still holds: torches first, then braziers.
	var one2: int = engine.levels.map(func(e): return e["id"]).find("deluxe-1.2")
	level._open_level(one2)
	var g12 = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[one2]["golden"]))
	for p in g12["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	level.set_quality("low", false)
	var d_rooms := 0
	var braziers := 0
	var omnis := 0
	var torch_on := 0
	for id in level.room_nodes:
		var rn: Node3D = level.room_nodes[id]
		if String(id).begins_with("D:"):
			d_rooms += 1
			if rn.get_node_or_null("Brazier") and rn.get_node_or_null("Brazier/Flame"):
				braziers += 1
		for light in rn.get_meta("lights", []):
			if (light as OmniLight3D).visible:
				omnis += 1
		if (rn.get_meta("torch") as OmniLight3D).visible:
			torch_on += 1
	_check(d_rooms == 3 and braziers == 3 and torch_on == 5 and omnis <= ZorgAtmos.HIGH_LIGHTS and omnis >= torch_on,
		"1.2 lights: %d damage braziers, %d torches on, %d omnis (cap %d)" % [braziers, torch_on, omnis, ZorgAtmos.HIGH_LIGHTS])
	_check(ZorgAtmos.specs_for("deluxe-1.2", "D:0", "D").size() == 1 and ZorgAtmos.specs_for("nope", "A:0", "A").is_empty(),
		"declared lights: D rooms have a brazier spec, other types do not")

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
	_check(level.follow and String(level.view_btn.get_meta("mode")) == "hero" and String(level.view_btn.tooltip_text).contains("Hero"),
		"follow camera: key C switches to Follow hero (mode %s)" % level.view_btn.get_meta("mode"))
	_check(level.target_zoom < overview_zoom * 0.7, "follow camera: zooms in closer than the overview (%.1f -> %.1f)" % [overview_zoom, level.target_zoom])
	# Bugbot (#98): a pan leaves follow without stacking the close-up, and
	# zooming in from the close-up never zooms out.
	var close_zoom: float = level.target_zoom
	level._pan(Vector2(1, 0))
	level._zoom_by(-4.0)
	var after_zoom_in: float = level.target_zoom
	_check(not level.follow and after_zoom_in <= close_zoom + 0.01, "follow camera: Zoom + after a pan out of follow doesn't zoom out (%.1f -> %.1f)" % [close_zoom, after_zoom_in])
	_key(KEY_C)
	# Don't stack another 60%; keep the zoom as it is after the Zoom + (which
	# may have closed in a little when the overview is farther than 12).
	_check(level.follow and is_equal_approx(level.target_zoom, after_zoom_in), "follow camera: View after a pan doesn't stack the zoom (%.1f)" % level.target_zoom)
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
	# Let the reset refit so follow_zoomed clears before the next View.
	for i in 8:
		await process_frame
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
	# Low-severity UX (borders, swatches, 360 dp portrait board fit).
	await _round13()
	# Dungeon look: rendered readability (needs a display).
	await _readability_render(engine)
	await _dressing_checks(engine)
	_camera_look_checks()
	await _camera_orbit_checks(engine)
	_camera_pad_checks()
	await _camera_manual_and_room_press_checks(engine)
	_tap_slop_checks()
	await _tap_slop_input()
	await _spell_visibility(engine)
	await _board_ux(engine)
	_fluidity_checks()
	await _hitch_checks(engine)
	await _solution_checks(engine)

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

## FR-47: Show a solution plays the engine's stored solution, step captions on.
func _solution_checks(engine: Node) -> void:
	var sp: ZorgSolutionPlayer = level.solution
	var solved := 0
	for i in engine.levels.size():
		var id := String(engine.levels[i]["id"])
		level._open_level(i)
		await process_frame
		if sp.has_solution(id):
			solved += 1
			var outcome := sp.run_to_end(id)
			for f in 3:
				await process_frame
			_check(outcome == "win", "%s: stored solution plays to a win (%s)" % [id, outcome])
			_check(level.result.text.begins_with("You win"), "%s: solution ends on the win banner (%s)" % [id, level.result.text])
			_check(level.solution_guide.visible and level.solution_guide.header.text.begins_with("Solution step"),
				"%s: the caption shows the last solution step (%s)" % [id, level.solution_guide.header.text])
			_check(level.solution_guide.get_parent() == level.hud_top, "%s: the caption sits in the HUD text column" % id)
			_guide_clear_of_chrome(id)
		else:
			_check(not sp.start(id), "%s: no stored solution, Show a solution does not build" % id)
			_check(level.solution_guide.text.text.begins_with("No stored solution yet"), "%s: says there is no stored solution yet" % id)
		sp.stop()
	_check(solved > 0, "at least one level has a stored solution (%d)" % solved)
	# The ? dialog path: first tap asks, second tap starts.
	var first := -1
	for i in engine.levels.size():
		if sp.has_solution(String(engine.levels[i]["id"])):
			first = i
			break
	level._open_level(first)
	await process_frame
	level.open_help()
	await process_frame
	level.help_dlg.solution_button.pressed.emit()
	_check(level.help_dlg.visible and level.help_dlg.solution_note.visible and not sp.active(),
		"Show a solution asks first (the board is not cleared on the first tap)")
	level.help_dlg.solution_button.pressed.emit()
	await process_frame
	_check(not level.help_dlg.visible and sp.active() and level.solution_guide.visible,
		"the second tap closes ? and starts the solution with a caption")
	_check(level.placed.is_empty(), "the board was cleared; the first caption is the orientation step (%d placed)" % level.placed.size())
	sp.toggle_pause()
	_check(level.solution_guide.pause_button.text == "Play", "Pause stops the solution and offers Play")
	var before: int = level.placed.size()
	sp.next()
	_check(level.placed.size() == before + 1, "Next drops the next room while paused")
	level.back_pressed()
	_check(not sp.active() and not level.solution_guide.visible, "Back / Esc stops the solution")
	await _solution_input_checks(engine)
	await _solution_non_win_check(engine)
	await _solution_phone_landscape(engine, first)
	var shot := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--solution-shot="):
			shot = a.substr(16)
	if shot != "":
		await _solution_shot(engine, shot)

## Index of the first level whose stored solution casts a spell, or -1.
func _first_with_casts(engine: Node, sp: ZorgSolutionPlayer, skip := -1, from := 0) -> int:
	for i in range(from, engine.levels.size()):
		var e: Dictionary = sp.levels.get(String(engine.levels[i]["id"]), {})
		if i != skip and String(e.get("status", "")) == "solved" and not (e.get("casts", []) as Array).is_empty():
			return i
	return -1

## Bugbot #142: during a replay, Play / Step / Space and the spell bar must
## not drive the engine through the normal runner (that walked stepCount past
## a stored cast). They go to the replay's own controls; Stop gives them back.
func _solution_input_checks(engine: Node) -> void:
	var sp: ZorgSolutionPlayer = level.solution
	var i := _first_with_casts(engine, sp)
	_check(i >= 0, "a stored solution with a spell cast exists for the replay input checks")
	if i < 0:
		return
	var id := String(engine.levels[i]["id"])
	level._open_level(i)
	await process_frame
	sp.start(id)
	var guard := 0
	while sp.phase == "place" and guard < 200:
		sp._tick()
		guard += 1
	_check(sp.phase == "run", "%s: replay reached the run phase" % id)
	sp.toggle_pause()                         # paused: only explicit input could move it
	var sc0 := int(level.engine.state.get("stepCount", 0))
	level._on_play(true)
	_check(not level.playback.is_playing(), "%s: Play during a replay does not start the normal runner" % id)
	_check(sp.playing, "%s: Play during a replay resumes the replay instead" % id)
	level._on_play(true)
	_check(not sp.playing and not level.playback.is_playing(), "%s: Play again pauses the replay" % id)
	level._on_auto_advance()
	_check(int(level.engine.state.get("stepCount", 0)) == sc0, "%s: a stray auto-advance does not step the engine" % id)
	# Step and Space: one replay tick each (never more than one engine action).
	level._on_step(true)
	var sc1 := int(level.engine.state.get("stepCount", 0))
	_check(sc1 - sc0 <= 1 and sp.owns_run() and not sp.playing, "%s: Step during a replay is one replay step (%d -> %d)" % [id, sc0, sc1])
	var space := InputEventKey.new()
	space.keycode = KEY_SPACE
	space.pressed = true
	level._unhandled_input(space)
	var sc2 := int(level.engine.state.get("stepCount", 0))
	_check(sc2 - sc1 <= 1 and sp.owns_run(), "%s: Space during a replay is one replay step (%d -> %d)" % [id, sc1, sc2])
	var cast_id := int((sp.sol["casts"] as Array)[0].get("spellId", 0))
	_check(not level.cast_spell(cast_id), "%s: the spell bar can't cast over a running replay" % id)
	# Interleaved Play / Step / Space must not cost the stored win.
	guard = 0
	while sp.owns_run() and guard < 20000:
		if guard % 7 == 0:
			level._on_step(true)
		elif guard % 11 == 0:
			level._unhandled_input(space)
		else:
			sp._tick()
		guard += 1
	_check(sp.last_outcome == "win" and not sp.mismatch, "%s: replay with Play/Step/Space mixed in still wins (%s)" % [id, sp.last_outcome])
	_check(level.solution_guide.header.text.begins_with("Solution step"), "%s: a won replay ends on the stored result caption" % id)
	# A finished replay hands Play back to the normal runner.
	sp.stop()
	level._on_reset()
	level._on_play(true)
	_check(not sp.active() and level.playback.is_playing(), "%s: after Stop, Play drives the normal run again" % id)
	level._on_reset()

## Bugbot #142: if the replay does not win (here: the stored casts are
## dropped), the caption says so instead of showing the stored win text.
func _solution_non_win_check(engine: Node) -> void:
	var sp: ZorgSolutionPlayer = level.solution
	var outcome := "win"
	var id := ""
	for i in engine.levels.size():
		var e: Dictionary = sp.levels.get(String(engine.levels[i]["id"]), {})
		if String(e.get("status", "")) != "solved" or (e.get("casts", []) as Array).is_empty():
			continue
		id = String(engine.levels[i]["id"])
		level._open_level(i)
		await process_frame
		sp.start(id)
		sp.steps = sp.steps.filter(func(st: Dictionary) -> bool: return String(st["kind"]) != "cast")
		var guard := 0
		while sp.owns_run() and guard < 20000:
			sp._tick()
			guard += 1
		outcome = sp.last_outcome
		if outcome != "win":
			break
	_check(outcome != "win", "a stored solution loses without its casts (%s: %s)" % [id, outcome])
	if outcome == "win":
		return
	_check(sp.mismatch, "%s: a non-win replay is flagged" % id)
	_check(level.solution_guide.header.text == "Solution replay did not win", "%s: non-win replay header is honest (%s)" % [id, level.solution_guide.header.text])
	_check(level.solution_guide.text.text.begins_with("This replay ended in a") and not level.solution_guide.text.text.contains("All heroes are dead"),
		"%s: non-win caption does not show the stored win text (%s)" % [id, level.solution_guide.text.text])
	_check(not level.result.text.begins_with("You win"), "%s: the banner agrees (%s)" % [id, level.result.text])
	# Bugbot #143: score() reports a stalemate as "unresolved"; the caption
	# must still use the stuck-hero wording.
	_check(ZorgSolutionPlayer._outcome_words("unresolved", "stalemate").begins_with("stalemate"),
		"a stalled replay is worded as a stalemate, not 'unresolved'")
	_check(ZorgSolutionPlayer._outcome_words("unresolved", "win").contains("rule"),
		"a replay that kills every hero but breaks a rule says a rule broke")
	sp.stop()
	level._on_reset()

## The caption plate must not cover the tray / run controls or the corner buttons.
func _guide_clear_of_chrome(what: String) -> void:
	var vis := level.get_viewport().get_visible_rect()
	if vis.size.x < 300.0:
		print("UX: skip caption overlap check for %s (viewport is %s)" % [what, vis])
		return
	var g: Rect2 = level.solution_guide.get_global_rect()
	_check(not g.intersects(level.bottom_bar.get_global_rect()), "%s: caption %s clears the bottom bar %s" % [what, g, level.bottom_bar.get_global_rect()])
	_check(not g.intersects(level.levels_btn.get_global_rect()) and not g.intersects(level.help_btn.get_global_rect()),
		"%s: caption clears Levels and ?" % what)
	_check(vis.grow(1.0).encloses(g), "%s: caption %s stays on the canvas %s" % [what, g, vis])

func _solution_phone_landscape(engine: Node, i: int) -> void:
	var vis := level.get_viewport().get_visible_rect()
	if vis.size.x < 300.0:
		print("UX: skip 2340x1080 solution caption fit (viewport is %s, needs a display)" % vis)
		return
	var win := level.get_window()
	var old := win.size
	var old_scale := win.content_scale_factor
	DisplayServer.window_set_size(Vector2i(2340, 1080))
	win.size = Vector2i(2340, 1080)
	win.content_scale_factor = 1.65
	level.ui_scale = 1.65
	level._apply_margins()
	for f in 10:
		await process_frame
	var id := String(engine.levels[i]["id"])
	level._open_level(i)
	level.solution.run_to_end(id)
	for f in 10:
		await process_frame
	_guide_clear_of_chrome("2340x1080 " + id)
	level.solution.stop()
	# A spell level (phone check, PR #143): the caption at a cast and at the
	# end must also clear the spell bar, with the turn line / status / spell
	# hint making way for it.
	var ci := _first_with_casts(engine, level.solution)
	while ci >= 0:
		var cid := String(engine.levels[ci]["id"])
		var sp: ZorgSolutionPlayer = level.solution
		level._open_level(ci)
		await process_frame
		sp.start(cid)
		var guard := 0
		while sp.owns_run() and guard < 20000 and not (sp.phase == "run" and String(sp.steps[sp.step_i]["kind"]) == "cast" \
				and level.solution_guide.header.text.begins_with(sp._head(sp.step_i))):
			sp._tick()
			guard += 1
		level.playback.show_spell_hint(true)  # as on a first run: the caption must still win
		for f in 10:
			await process_frame
		_check(not level.playback.spell_hint.visible and not level.status.visible and not level.log_label.visible,
			"2340x1080 %s: the caption replaces the spell hint, status and turn line" % cid)
		_guide_clear_of_chrome("2340x1080 %s at a cast" % cid)
		while sp.owns_run() and guard < 40000:
			sp._tick()
			guard += 1
		for f in 10:
			await process_frame
		_guide_clear_of_chrome("2340x1080 %s at the end" % cid)
		sp.stop()
		ci = _first_with_casts(engine, sp, -1, ci + 1)
	win.content_scale_factor = old_scale
	level.ui_scale = old_scale
	DisplayServer.window_set_size(old)
	win.size = old
	level._on_resized()
	for f in 10:
		await process_frame

## Screenshot of a solution mid-run with its caption (manual check / PR shots).
func _solution_shot(engine: Node, path: String) -> void:
	var want := "deluxe-4.3"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--solution-level="):
			want = a.substr(17)
	for i in engine.levels.size():
		if String(engine.levels[i]["id"]) == want:
			level._open_level(i)
	await process_frame
	var sp: ZorgSolutionPlayer = level.solution
	sp.start(want)
	sp.toggle_pause()
	var stop_at := "cast"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--solution-stop="):
			stop_at = a.substr(16)
	var guard := 0
	while sp.active() and sp.phase != "done" and guard < 2000:
		if sp.step_i < sp.steps.size() and String(sp.steps[sp.step_i]["kind"]) == stop_at \
				and level.solution_guide.header.text.begins_with("Solution step %d" % (sp.step_i + 1)):
			break
		sp.next()
		guard += 1
		await process_frame
	for f in 40:
		await process_frame
	root.get_viewport().get_texture().get_image().save_png(path)
	print("solution shot: ", path)
	sp.stop()

## Icon spell bar: disabled before the first action, enabled and pulsed after
## the first Step, preview data comes from the engine, and cast_spell works.
func _spell_visibility(engine: Node) -> void:
	var i14: int = engine.levels.map(func(e): return e["id"]).find("deluxe-1.4")
	_check(i14 >= 0, "spell vis: deluxe-1.4 is in the index")
	if i14 < 0:
		return
	ZorgHelp.set_spell_hint_seen(level.settings_path, false)
	level._open_level(i14)
	await process_frame
	var golden = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[i14]["golden"]))
	for p in golden["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	_check(level.spell_bar.get_child_count() > 0, "spell vis: Attack button exists after placing rooms")
	var btn: ZorgSpellButton = level.spell_bar.get_child(0)
	_check(btn.disabled and btn.custom_minimum_size.x >= 48.0 and btn.custom_minimum_size.y >= 48.0,
		"spell vis: button is disabled and at least 48 units before the run (%s)" % btn.custom_minimum_size)
	_check(btn.tooltip_text.begins_with("Attack"), "spell vis: tooltip names Attack (%s)" % btn.tooltip_text)
	_check(level._ensure_recording(), "spell vis: run starts")
	await process_frame
	_check(int(engine.state["stepCount"]) == 0, "spell vis: stepCount is 0 before the first action")
	_check(level.spell_bar.get_children().all(func(b): return b.disabled),
		"spell vis: buttons stay disabled at stepCount 0 (FR-33)")
	_check(btn.tooltip_text.contains("first hero action"),
		"spell vis: disabled tooltip explains the closed window (%s)" % btn.tooltip_text)
	btn._on_down()
	btn._process(ZorgSpellButton.LONG_PRESS)
	_check(btn.hint_visible(), "spell vis: long-press on a disabled button shows the name and reason")
	btn._on_up()
	level._on_step()
	await process_frame
	await process_frame
	_check(not btn.disabled, "spell vis: Attack is enabled after the first Step (FR-33)")
	_check(btn.did_pulse, "spell vis: enabled button pulses once when the window opens")
	_check(level.playback.spell_hint.visible, "spell vis: first-run hint shows when spells become available")
	_check(level.playback.spell_hint.get_parent() == level.hud_top,
		"spell vis: first-run hint sits in the HUD text column, not in the Play/Step row")
	var hint_r: Rect2 = level.playback.spell_hint.get_global_rect()
	var vis_r := level.get_viewport().get_visible_rect()
	if vis_r.size.x >= 300.0:
		_check(vis_r.grow(1.0).encloses(hint_r),
			"spell vis: first-run hint stays on the canvas (%s in %s)" % [hint_r, vis_r])
		# Phone-width: the wrapping plate and Got it must remain reachable.
		var win := level.get_window()
		var old_size := win.size
		DisplayServer.window_set_size(Vector2i(360, 800))
		win.size = Vector2i(360, 800)
		level._on_resized()
		for i in 10:
			await process_frame
		var got: Button = level.playback.spell_hint.find_child("GotIt", true, false)
		var phone := level.get_viewport().get_visible_rect()
		var ok_phone := got != null and phone.grow(1.0).encloses(level.playback.spell_hint.get_global_rect()) and phone.grow(1.0).encloses(got.get_global_rect())
		_check(ok_phone, "spell vis: first-run hint and Got it fit on a 360-wide canvas (hint %s, got %s, vis %s)" % [
			level.playback.spell_hint.get_global_rect(), got.get_global_rect() if got else Rect2(), phone])
		_assert_top_right_on_canvas(phone, "360-wide canvas")
		await _picker_modal_checks("360x800 portrait", false)
		DisplayServer.window_set_size(old_size)
		win.size = old_size
		level._on_resized()
		for i in 10:
			await process_frame
		await _phone_landscape_hud()
	btn._on_down()
	_check(not btn._suppress_press, "spell vis: a disabled long-press does not swallow the next tap")
	btn._on_up()
	var preview: Dictionary = engine.attack_preview(0)
	_check(preview["ok"] and int(preview["damage"]) == 3 and preview["targets"].size() > 0,
		"spell vis: engine preview lists living heroes and Attack(3) damage (%s)" % preview)
	level.heroes.show_attack_preview(preview)
	_check(level.heroes.preview_count() == preview["targets"].size(),
		"spell vis: preview highlights as many heroes as the engine listed")
	# Unspawned targets use a waiting plate; it must sit above the bottom chrome.
	level.heroes.show_attack_preview({
		"ok": true, "damage": 3, "error": "",
		"targets": [{"id": 99, "hp": 4, "spawned": false}],
	})
	var wait_r: Rect2 = level.heroes.waiting_preview_rect()
	_check(wait_r.size != Vector2.ZERO and wait_r.end.y <= level.bottom_bar.get_global_rect().position.y + 1.0,
		"spell vis: waiting preview sits above the bottom bar (%s vs bar %s)" % [wait_r, level.bottom_bar.get_global_rect()])
	level.heroes.clear_attack_preview()
	btn._on_down()
	btn._process(ZorgSpellButton.LONG_PRESS)
	_check(btn.hint_visible(), "spell vis: long-press on a ready button shows the name")
	btn._on_up()
	btn.pressed.emit()
	_check(not bool(engine.state["spells"][0]["consumed"]),
		"spell vis: releasing a long-press does not spend the spell")
	_check(level.cast_spell(0), "spell vis: cast_spell still spends Attack between actions")
	await process_frame
	_check(btn.disabled, "spell vis: Attack is disabled after it is spent (FR-32)")
	_check(btn.modulate == Color.WHITE, "spell vis: a spent spell does not keep the ready glow (%s)" % btn.modulate)
	var got_it: Button = level.playback.spell_hint.find_child("GotIt", true, false)
	if got_it:
		got_it.pressed.emit()
	await process_frame
	_check(not level.playback.spell_hint.visible and ZorgHelp.spell_hint_seen(level.settings_path),
		"spell vis: Got it hides the first-run spell hint and saves it")
	level._on_reset()


## Levels and ? must stay on a 2340×1080 landscape canvas, and the first-run
## spell hint must not cover a hero HP label.
func _phone_landscape_hud() -> void:
	var vis := level.get_viewport().get_visible_rect()
	if vis.size.x < 300.0:
		print("UX: skip landscape HUD fit (viewport is %s, needs a display)" % vis)
		return
	_assert_top_right_on_canvas(vis, "default canvas")
	var win := level.get_window()
	var old := win.size
	DisplayServer.window_set_size(Vector2i(2340, 1080))
	win.size = Vector2i(2340, 1080)
	# Match the ROG Phone's content scale so the original off-canvas offsets would return.
	var old_scale := win.content_scale_factor
	win.content_scale_factor = 1.65
	level.ui_scale = 1.65
	level._apply_margins()
	if not level.cam_manual:
		level._fit_camera(true)
	for i in 20:
		await process_frame
	var phone := level.get_viewport().get_visible_rect()
	if phone.size.x < 300.0:
		print("UX: skip 2340x1080 HUD fit (viewport is %s)" % phone)
	else:
		_assert_top_right_on_canvas(phone, "2340x1080 landscape")
		var hint_r: Rect2 = level.playback.spell_hint.get_global_rect()
		_check(level.playback.spell_hint.visible and phone.grow(1.0).encloses(hint_r),
			"phone HUD: spell hint stays on the 2340x1080 canvas (%s in %s)" % [hint_r, phone])
		_check(level.playback.spell_hint.get_parent() == level.hud_top,
			"phone HUD: spell hint stays in the HUD text column")
		var overlap := 0
		for r in level.heroes.label_rects():
			if hint_r.intersects(r):
				overlap += 1
				print("phone HUD: hint %s overlaps HP %s" % [hint_r, r])
		_check(overlap == 0, "phone HUD: spell hint does not cover a hero HP label (%d overlaps, hint %s, labels %s)" % [overlap, hint_r, level.heroes.label_rects()])
		await _picker_modal_checks("2340x1080 landscape", false)
	win.content_scale_factor = old_scale
	level.ui_scale = old_scale
	DisplayServer.window_set_size(old)
	win.size = old
	level._on_resized()
	for i in 10:
		await process_frame


## Level picker (phone bug: the grid drew under the room tray, hiding
## Graphics and Close). The open grid must sit
## on a layer above the HUD, every button must be inside the viewport, and the
## dimmed backdrop must cover the HUD and stop taps. With `clicks` (on level
## 5.8, six tray tiles; real taps need a display), real input checks it too: a tap on a tray tile only closes the grid, and the
## Close and level buttons take taps where tray tiles used to cover them.
func _picker_modal_checks(label: String, clicks: bool) -> void:
	var vis := level.get_viewport().get_visible_rect()
	if vis.size.x < 300.0:
		print("UX: skip picker modal checks on the %s (viewport is %s)" % [label, vis])
		return
	if clicks:
		# Level 5.8 has the fullest tray (six tiles, two rows on a phone).
		# The size-only passes keep the current level: they run inside the
		# spell checks, which still hold its run.
		var eng: Node = level.get_node("Engine")
		var idx := 0
		for i in eng.levels.size():
			if String(eng.levels[i]["id"]) == "deluxe-5.8":
				idx = i
		level._open_level(idx)
		for i in 10:
			await process_frame
	var lp: ZorgLevelPicker = level.level_picker
	lp.set_open(true)
	for i in 3:
		await process_frame
	vis = level.get_viewport().get_visible_rect()
	_check(lp.is_open() and lp.get_parent() == level.picker_root and level.picker_layer.layer > level.ui.layer,
		"picker modal (%s): the open grid sits on a layer above the HUD (%d > %d)" % [label, level.picker_layer.layer, level.ui.layer])
	var buttons: Array = [lp.quality_button]
	for b in lp.panel.find_children("*", "Button", true, false):
		if not b in buttons and not b.is_queued_for_deletion():
			buttons.append(b)
	var outside: Array = []
	var under_tray := 0
	var tiles: Array = []
	for t in level.tray.get_children():
		if t is Control and t.is_visible_in_tree():
			tiles.append(t)
	for b in buttons:
		var r: Rect2 = (b as Control).get_global_rect()
		# Grid buttons may scroll; only the visible part of the scroll counts.
		if b.get_parent() == lp.grid and not lp.scroll.get_global_rect().grow(1.0).encloses(r):
			continue
		if not vis.grow(1.0).encloses(r):
			outside.append("%s %s" % [b.text, r])
		for t in tiles:
			if r.intersects((t as Control).get_global_rect()):
				under_tray += 1
	_check(outside.is_empty() and buttons.size() >= 3,
		"picker modal (%s): %d picker buttons all inside the viewport %s (outside: %s)" % [label, buttons.size(), vis, outside])
	var close_btn: Button = buttons[buttons.size() - 1]
	for b in buttons:
		if b.text == "Close":
			close_btn = b
	_check(vis.grow(1.0).encloses(close_btn.get_global_rect()) and vis.grow(1.0).encloses(lp.quality_button.get_global_rect()),
		"picker modal (%s): Graphics and Close stay on screen (%s, %s)" % [label, lp.quality_button.get_global_rect(), close_btn.get_global_rect()])
	_check(lp.overlay.mouse_filter == Control.MOUSE_FILTER_STOP and lp.overlay.get_global_rect().grow(1.0).encloses(level.ui_root.get_global_rect()),
		"picker modal (%s): the dimmed backdrop covers the HUD and stops taps (%s vs %s; %d button/tile overlaps now drawn over the tray)" % [
			label, lp.overlay.get_global_rect(), level.ui_root.get_global_rect(), under_tray])
	if clicks and DisplayServer.get_name() == "headless":
		print("SKIP picker modal real taps (headless; CI runs them under Xvfb)")
	elif clicks:
		var panel_r: Rect2 = lp.panel.get_global_rect()
		var tile: Control = null
		for t in tiles:
			if not panel_r.has_point((t as Control).get_global_rect().get_center()):
				tile = t
				break
		if tile:
			var c := tile.get_global_rect().get_center()
			_mouse_button(c, true)
			await process_frame
			_mouse_button(c, false)
			await process_frame
			_check(level.selected == "" and level.drag_id == "" and not lp.is_open(),
				"picker modal: a tap on a tray tile behind the grid only closes the grid (selected '%s')" % level.selected)
			# A phone tap: a touch plus the emulated mouse press and release
			# (emulate_mouse_from_touch), all of which must stop at the backdrop.
			lp.set_open(true)
			await process_frame
			for down in [true, false]:
				var t := InputEventScreenTouch.new()
				t.index = 0
				t.pressed = down
				t.position = c
				Input.parse_input_event(t)
				await process_frame
			await process_frame
			_check(level.selected == "" and level.drag_id == "" and not lp.is_open(),
				"picker modal: a phone touch on a tray tile behind the grid only closes the grid (selected '%s')" % level.selected)
		lp.set_open(true)
		await process_frame
		var cc := close_btn.get_global_rect().get_center()
		_mouse_button(cc, true)
		await process_frame
		_mouse_button(cc, false)
		await process_frame
		_check(not lp.is_open(), "picker modal: a real tap on Close closes the grid")
		lp.set_open(true)
		await process_frame
		var first: Button = lp.grid.get_child(0)
		var fc := first.get_global_rect().get_center()
		_mouse_button(fc, true)
		await process_frame
		_mouse_button(fc, false)
		await process_frame
		_check(level.level_index == 0 and not lp.is_open(), "picker modal: a real tap on a level button opens it (level %d)" % level.level_index)
	lp.set_open(false)
	await process_frame


func _assert_top_right_on_canvas(vis: Rect2, label: String) -> void:
	var levels_r: Rect2 = level.levels_btn.get_global_rect()
	var help_r: Rect2 = level.help_btn.get_global_rect()
	var slack := vis.grow(1.0)
	_check(level.levels_btn.visible and slack.encloses(levels_r) and levels_r.size.x >= 100.0 and levels_r.size.y >= 52.0,
		"phone HUD: Levels is visible on the %s (%s in %s, text %s)" % [label, levels_r, vis, level.levels_btn.text])
	_check(level.help_btn.visible and slack.encloses(help_r) and help_r.size.x >= 52.0,
		"phone HUD: ? is visible on the %s (%s in %s)" % [label, help_r, vis])
	# They must not sit on top of each other, and Levels stays at the right.
	_check(not levels_r.intersects(help_r), "phone HUD: Levels and ? do not overlap on the %s" % label)


func _tap_slop_checks() -> void:
	_check(is_equal_approx(ZorgHud.tap_slop_px(96), 12.0),
		"tap slop: 96 dpi stays at the 12 px floor (%s)" % ZorgHud.tap_slop_px(96))
	_check(is_equal_approx(ZorgHud.tap_slop_px(0), 12.0),
		"tap slop: a missing dpi stays at 12 px")
	var want := (2.5 / 25.4) * 380.0
	_check(is_equal_approx(ZorgHud.tap_slop_px(380), want),
		"tap slop: 380 dpi is 2.5 mm (%s, want %s)" % [ZorgHud.tap_slop_px(380), want])
	_check(ZorgHud.tap_slop_px() >= 12.0, "tap slop: live display is at least 12 px (%s)" % ZorgHud.tap_slop_px())


## A jitter under the slop is still a tap; a move past it becomes a pan.
func _tap_slop_input() -> void:
	level._open_level(0)
	for i in 8:
		await process_frame
	var slop := ZorgHud.tap_slop_px()
	var pos: Vector2 = level.get_viewport().get_visible_rect().get_center()
	# An empty board: this press must not start a room drag.
	_board_mouse(pos, true)
	_check(level._press_left and not level._press_dragged and level.drag_id == "",
		"tap slop: still press on an empty board is a pending tap")
	_board_move(pos + Vector2(slop - 1.0, 0.0))
	_check(not level._press_dragged, "tap slop: a %.1f px jitter under the slop is still a tap" % (slop - 1.0))
	_board_move(pos + Vector2(slop + 1.0, 0.0))
	_check(level._press_dragged, "tap slop: a move past %.1f px becomes a pan" % slop)
	_board_mouse(pos + Vector2(slop + 1.0, 0.0), false)
	_check(not level._press_left and not level._press_dragged, "tap slop: release clears the pan flags")



## Board UX (web play-through findings): stable tray slots, a refused drop
## goes back to the tray with a toast and a shaking red ghost, Undo works
## after Play, and the build overlay marks free and droppable slots.
func _board_ux(engine: Node) -> void:
	level._open_level(0)
	for i in 10:
		await process_frame
	var rejected: Array = []
	var on_reject := func(id: String, why: String, _t: bool) -> void: rejected.append([id, why])
	level.board_build.drop_rejected.connect(on_reject)
	var cam: Camera3D = level.camera

	# (3) Stable tray: one slot per supplied room, in supply order; placing
	# greys a slot out in place instead of reflowing the row.
	var ids: Array = engine.supplied().map(func(s): return String(s["id"]))
	var before: Array = level.board_build.slot_ids()
	var count0: int = level.tray.get_child_count()
	var z_btn: Button = level.board_build.slot_button("Z:0")
	var z_index: int = z_btn.get_index() if z_btn else -1
	level._place("A:0", Vector2i(0, 0))
	await process_frame
	var a_btn: Button = level.board_build.slot_button("A:0")
	_check(before == ids and level.board_build.slot_ids() == ids and level.tray.get_child_count() == count0 and count0 == ids.size(),
		"tray: one slot per room, same order after a placement (%s)" % [level.board_build.slot_ids()])
	_check(a_btn != null and a_btn.disabled and level.board_build.slot_is_empty("A:0") and a_btn.focus_mode == Control.FOCUS_NONE
		and a_btn.get_combined_minimum_size().x >= a_btn.get_meta("full_size", Vector2.ZERO).x - 0.5,
		"tray: a placed room's slot empties in place, same size")
	_check(level.board_build.slot_button("Z:0") == z_btn and z_btn.get_index() == z_index and not z_btn.disabled,
		"tray: the next room keeps its slot and button (no reflow)")
	level.undo()
	_check(not a_btn.disabled and a_btn.text != "" and a_btn.icon != null and level.board_build.slot_button("A:0") == a_btn,
		"tray: Undo brings the room back to the same slot")

	# (1) Refused drops: off the board and onto another room.
	level._place("A:0", Vector2i(0, 0))
	var occupied: Vector2 = cam.unproject_position(level.slot_center(0, 0))
	var off_slot := Vector2i(level.SLOTS_X.y + 3, 0)
	var off: Vector2 = cam.unproject_position(level.slot_center(off_slot.x, off_slot.y))
	level._begin_drag("Z:0", true, off + Vector2(0, 300))
	level.drag_to(off + Vector2(0, 150))
	level.drag_to(off)
	_check(level.cell_focus() == "Z:0", "overlay: the dragged room is the overlay focus")
	level.end_drag(off)
	await process_frame
	_check(not level.placed.has("Z:0") and not level.board_build.slot_button("Z:0").disabled,
		"drop off the board: Z goes back to its tray slot")
	_check(level.toast.visible and level.toast.last_text == "Can't place here: off the board",
		"drop off the board: toast says why (%s)" % level.toast.last_text)
	_check(level.board_build.is_rejecting() and level.ghost.visible and level.ghost_mat.albedo_color == level.GHOST_BAD,
		"drop off the board: the red ghost shakes on the spot")
	_check(rejected.size() == 1 and rejected[0] == ["Z:0", "off the board"], "drop off the board: drop_rejected fired once %s" % [rejected])
	level._begin_drag("Z:0", true, occupied + Vector2(0, 300))
	level.drag_to(occupied + Vector2(0, 150))
	level.drag_to(occupied)
	level.end_drag(occupied)
	_check(not level.placed.has("Z:0") and level.toast.last_text == "Can't place here: another room is there",
		"drop on another room: refused with a toast (%s)" % level.toast.last_text)
	await create_timer(ZorgBoardBuild.SHAKE_SECONDS + 0.1).timeout
	_check(not level.ghost.visible, "refused drop: the ghost hides after the shake")
	# Tap-to-place on a refused spot gets the same cue.
	level.selected = "Z:0"
	level.board_build.on_board_press(occupied)
	_check(not level.placed.has("Z:0") and rejected.size() == 3 and level.toast.visible, "tap on a refused spot: same cue, nothing placed")
	level.selected = ""
	# Moving a placed room off the board snaps it back to its slot.
	level._place("Z:0", Vector2i(1, 0))
	var z_at: Vector2 = cam.unproject_position(level.slot_center(1, 0))
	level._begin_drag("Z:0", false, z_at)
	level.drag_to(z_at + Vector2(0, 120))
	level.drag_to(off)
	level.end_drag(off)
	_check(level.placed.get("Z:0") == Vector2i(1, 0) and level.room_nodes["Z:0"].position.is_equal_approx(level.slot_center(1, 0)),
		"move off the board: Z snaps back to (1, 0)")
	await process_frame

	# (4) Build overlay: grid on free slots, near-green beside rooms, focus
	# colours while dragging, off during a run. Board shader, no new meshes.
	_check(level.cell_state(Vector2i(0, 0)) == "" and level.cell_state(Vector2i(2, 0)) == "near"
		and level.cell_state(Vector2i(4, 2)) == "grid" and level.cell_state(off_slot) == "",
		"overlay: room '', beside '%s', far '%s'" % [level.cell_state(Vector2i(2, 0)), level.cell_state(Vector2i(4, 2))])
	var mat: ShaderMaterial = ZorgLook.board_mat()
	_check(float(mat.get_shader_parameter("cell_mix")) == 1.0 and mat.get_shader_parameter("cell_tex") != null,
		"overlay: on while building")
	level._unplace("Z:0")
	level._begin_drag("Z:0", true, occupied + Vector2(0, 300))
	level.drag_to(occupied + Vector2(0, 150))
	await process_frame
	_check(level.cell_state(Vector2i(1, 0)) == "ok" and level.cell_state(Vector2i(4, 2)) == "loose" and level.cell_state(Vector2i(0, 0)) == "",
		"overlay: dragging Z marks touching slots ok and far ones loose")
	_check(float(mat.get_shader_parameter("cell_fill")) > 0.2, "overlay: slots fill in while dragging")
	level.board_build.abort_pinch()
	await process_frame
	var board_meshes: int = level.board.get_children().filter(func(c): return c is MeshInstance3D).size()
	_check(board_meshes == (level.SLOTS_X.y - level.SLOTS_X.x + 1) * (level.SLOTS_Y.y - level.SLOTS_Y.x + 1),
		"overlay: no extra board meshes (%d)" % board_meshes)

	# (2) Undo after Play: back to build, last room taken back.
	level._open_level(0)
	var g0 = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[0]["golden"]))
	for p in g0["cases"][0]["placements"]:
		level._place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	var last_id: String = level.place_order.back()
	var n_placed: int = level.placed.size()
	level._on_play()
	level._on_step()
	await process_frame
	_check(not level._building() and level.undo_btn.visible and not level.undo_btn.disabled, "undo: available after Play")
	await process_frame
	_check(float(mat.get_shader_parameter("cell_mix")) == 0.0, "overlay: off during a run")
	level.undo_btn.pressed.emit()
	_check(level._building() and level.engine.state.is_empty() and not level.placed.has(last_id) and level.placed.size() == n_placed - 1
		and not level.playback.is_playing() and level.tray.visible,
		"undo after Play: back to build, %s taken back, the other rooms stay" % last_id)
	level._place(last_id, Vector2i(int(g0["cases"][0]["placements"].back()["x"]), int(g0["cases"][0]["placements"].back()["y"])))
	var guard := 0
	while not level.run_over() and guard < 1000:
		level._on_step()
		guard += 1
	_check(level.run_over() and level.undo_btn.visible and not level.undo_btn.disabled, "undo: available after the run ends")
	_key(KEY_BACKSPACE)
	_check(level._building() and not level.placed.has(last_id), "undo: Backspace after a run goes back to build and takes back %s" % last_id)
	level.board_build.drop_rejected.disconnect(on_reject)
	level._open_level(0)


## Movement fluidity: frame-rate independent playback cadence, no fit glide
## fighting a pan, ice slides fit inside one Play step, delta-based easing.
func _fluidity_checks() -> void:
	var pb: ZorgRunPlayback = level.playback
	var was_playing := pb.is_playing()
	var steps := [0]
	var count := func() -> void: steps[0] += 1
	pb.advance_requested.disconnect(level._on_auto_advance)
	pb.advance_requested.connect(count)
	pb.set_playing(true)
	for i in 90:                       # 3 s at 30 FPS
		pb.tick(1.0 / 30.0)
	var at30: int = steps[0]
	steps[0] = 0
	pb.set_playing(true)
	for i in 360:                      # 3 s at 120 FPS
		pb.tick(1.0 / 120.0)
	var at120: int = steps[0]
	pb.set_playing(was_playing)
	pb.advance_requested.disconnect(count)
	pb.advance_requested.connect(level._on_auto_advance)
	var want := int(3.0 / ZorgRunPlayback.STEP_SECONDS)
	# Resetting the timer each step rounded it up to whole frames: 15 steps
	# at 30 FPS (0.20 s each). Keeping the overshoot gives ~16.7 at any rate.
	_check(mini(at30, at120) >= want and absi(at30 - at120) <= 1,
		"fluidity: Play cadence is frame-rate independent (%d steps at 30 FPS, %d at 120, want ~%d)" % [at30, at120, want])
	# A fit glide stops as soon as the finger pans.
	level.cam_manual = false
	level.cam.fit(false, level.placed, true, level._fit_area(), level.ROOM, level.SLOTS_X, level.SLOTS_Y, level.FIT_HEIGHT, level.get_viewport().get_visible_rect().size)
	var gliding: bool = level.cam.is_gliding()
	level._pan(Vector2(5, 0))
	_check(not level.cam.is_gliding(), "fluidity: a pan stops the fit glide (was gliding %s)" % gliding)
	# Ice slides: a 9-cell turn fits inside one Play step.
	var hs: Node = level.heroes
	hs.move_budget = ZorgRunPlayback.STEP_SECONDS * 0.8
	var nine: float = hs.move_seconds(9) * 9.0
	var one: float = hs.move_seconds(1)
	hs.move_budget = INF
	_check(nine <= ZorgRunPlayback.STEP_SECONDS and is_equal_approx(one, hs.STEP_MOVE_SECONDS) and is_equal_approx(hs.move_seconds(9), hs.STEP_MOVE_SECONDS),
		"fluidity: a 9-cell slide takes %.2f s in Play (step %.2f s); by hand each cell stays %.2f s" % [nine, ZorgRunPlayback.STEP_SECONDS, hs.STEP_MOVE_SECONDS])
	var c: ZorgLevelCamera = level.cam
	# A free yaw drag during a 90° turn continues from the current angle
	# (it used to jump to the turn's destination first).
	var y0: float = c.yaw
	c.rotate_by(90.0)
	c.yaw_by(5.0)
	_check(absf(c.yaw - (y0 + 5.0)) < 0.5, "fluidity: a yaw drag mid-turn does not jump (%.1f -> %.1f)" % [y0, c.yaw])
	c.yaw = y0
	c.target_yaw = y0
	c.update_transform()
	# Zoom easing is delta-based: two 1/60 s frames == one 1/30 s frame.
	var z0: float = c.zoom
	c.zoom = 40.0
	c.target_zoom = 20.0
	c.ease(1.0 / 60.0)
	c.ease(1.0 / 60.0)
	var z60: float = c.zoom
	c.zoom = 40.0
	c.ease(1.0 / 30.0)
	_check(absf(z60 - c.zoom) < 0.001, "fluidity: zoom easing matches at 60 and 30 FPS (%.4f vs %.4f)" % [z60, c.zoom])
	c.zoom = z0
	c.target_zoom = z0


## Hitch fix (CF-015): first-use work is moved off the drop, Play-press and
## spawn frames. Presentation only; the engine sees the same calls.
func _hitch_checks(engine: Node) -> void:
	var ids: Array = engine.levels.map(func(e): return e["id"])
	var idx: int = ids.find("deluxe-5.8")
	var g = JSON.parse_string(FileAccess.get_file_as_string(engine.levels[idx]["golden"]))
	var placements: Array = g["cases"][0]["placements"]
	# A drop before the warm-up has built anything: a placeholder now, the
	# real room (merged walls, torch) a few frames later.
	level._open_level(idx)
	var p0: Dictionary = placements[0]
	level._on_drop_place(p0["id"], Vector2i(int(p0["x"]), int(p0["y"])))
	var ph: Node3D = level.room_nodes[p0["id"]]
	var was_placeholder: bool = ph.has_meta("placeholder") and level.torch_lights().is_empty()
	for i in 4:
		await process_frame
	var rn: Node3D = level.room_nodes[p0["id"]]
	_check(was_placeholder and not rn.has_meta("placeholder") and rn.has_meta("torch")
		and not rn.find_children("Merged*", "MeshInstance3D", false, false).is_empty() and level.placed.has(p0["id"]),
		"hitch: a tray drop with no ready room shows a placeholder, then the full room within 4 frames")
	# The warm-up pools the other rooms and every hero, then stops drawing.
	var guard := 0
	while level.prewarm.active() and guard < 200:
		await process_frame
		guard += 1
	var supplied: int = engine.supplied().size()
	var heroes_n: int = engine.hero_names().size()
	_check(not level.prewarm.active() and not level.prewarm.stage.visible
		and level._room_pool.size() == supplied - 1 and level.heroes.pooled_count() == heroes_n,
		"hitch: warm-up pooled %d/%d rooms and %d/%d heroes, stage hidden after" % [level._room_pool.size(), supplied - 1, level.heroes.pooled_count(), heroes_n])
	for p in placements.slice(1):
		level._on_drop_place(p["id"], Vector2i(int(p["x"]), int(p["y"])))
	var all_ready: bool = level.room_nodes.values().all(func(n): return not n.has_meta("placeholder"))
	# The Play button: walls over a few frames, no step on the press frame,
	# the first hero from the pool once the walls are in.
	level.playback.play_toggled.emit()
	var building_on_press: bool = level.dressing.building
	var no_step_on_press: bool = level.turn_index == 0
	guard = 0
	while level.dressing.building and guard < 30:
		await process_frame
		guard += 1
	var walls_frames := guard
	var spawned_early: bool = level.turn_index > 0
	guard = 0
	while level.turn_index == 0 and guard < 30:
		await process_frame
		guard += 1
	_check(all_ready and building_on_press and no_step_on_press and not spawned_early and walls_frames >= 2
		and level.turn_index >= 1 and level.heroes.pooled_count() < heroes_n and level.dressing.count_props() > 0,
		"hitch: Play builds the walls over %d frames, then steps (pooled heroes left %d/%d)" % [walls_frames, level.heroes.pooled_count(), heroes_n])
	level.playback.set_playing(false)
	level._on_reset()

