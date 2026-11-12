extends SceneTree
## Headless smoke test of the Level scene: place the win-line layout through
## the same calls the tap/drag input uses, step the replay to the end and
## check the result banner. Optional: `-- --shot=path.png` saves a screenshot
## (needs a real display, not --headless).

func _initialize() -> void:
	var level: Node = load("res://scenes/level.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var layout := {"A:0": Vector2i(0, 0), "D:0": Vector2i(1, 0), "D:1": Vector2i(2, 0), "D:2": Vector2i(3, 0), "Z:0": Vector2i(4, 0)}
	for id in layout:
		level._place(id, layout[id])
	if level.play_btn.disabled:
		printerr("FAIL: Play stays disabled for a valid layout: ", level.status.text)
		quit(1)
		return
	var guard := 0
	level._on_step()
	while level.turn_index < level.recording["turns"].size() and guard < 1000:
		level._on_step()
		guard += 1
	for i in 30:
		await process_frame
	var shot := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			shot = a.substr(7)
	if shot != "":
		root.get_viewport().get_texture().get_image().save_png(shot)
	print("result: ", level.result.text)
	if not level.result.text.begins_with("You win"):
		printerr("FAIL: expected a win banner")
		quit(1)
		return
	print("PASS level smoke")
	quit(0)
