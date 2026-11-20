class_name ZorgLevelCamera
extends Node3D
## Orbit camera and the on-screen pad. The level screen feeds geometry and
## keeps gesture rules. This node does not read the rules engine. [[NFR-1]]

signal became_manual
signal needs_fit(instant: bool)
signal zoom_step(delta: float)
signal tilt_step(delta: float)
signal turn_step(degrees: float)
signal fit_pressed
signal view_pressed

const ZOOM_LIMITS := Vector2(12.0, 140.0)  # 140: the 8x6 board still fits at ~360 dp portrait
const PITCH_LIMITS := Vector2(30.0, 80.0)   # degrees above the board
const CAM_SMOOTH := 12.0                    # 1/s, exponential ease for zoom and tilt
const FOLLOW_ZOOM := 0.6                    # follow view zooms to 60% of the current distance
const FOLLOW_MIN := 7.0                     # ... and may come closer than the normal zoom limit
const FOLLOW_SMOOTH := 4.0                  # 1/s, exponential ease of the pivot onto the hero
## Dungeon look: the default view is lower and more angled (was 53.13°,
## the round 1-5 angle), so the walls and torch pools read as a room you
## look into rather than a map. Follow hero tilts FOLLOW_TILT lower still.
const DEFAULT_PITCH := 42.0
const FOLLOW_TILT := 8.0

var yaw := 45.0
var target_yaw := 45.0
var zoom := 24.0
var target_zoom := 24.0
var pitch := DEFAULT_PITCH
var target_pitch := DEFAULT_PITCH
var manual := false                         # user zoomed/panned: stop auto-fit until Fit or a new level
var follow := false                         # true: the camera tracks the first living hero
var follow_zoomed := false                  # the current zoom is already a follow close-up
var _follow_pitch := -1.0                   # pitch follow tilted to (-1: none); restored on exit
var _pre_follow_pitch := DEFAULT_PITCH

var pad: GridContainer
var view_button: Button
var camera_3d: Camera3D

var _yaw_tween: Tween
var _move_tween: Tween
var _fit_pending := 0                       # 1 = smooth refit, 2 = instant (after the HUD re-lays out)
var _fit_wait := 0


func _init() -> void:
	name = "CameraRig"
	# Anchors before the level screen parents the pad. A preset applied after
	# the control is in the tree leaves it at 0×0.
	pad = GridContainer.new()
	pad.name = "CamGrid"
	pad.columns = 2
	pad.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	pad.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	pad.grow_vertical = Control.GROW_DIRECTION_BOTH
	pad.add_theme_constant_override("h_separation", 6)
	pad.add_theme_constant_override("v_separation", 6)
	# Icon pad: stable node names, hover tooltip, long-press name on
	# phones. Actions and signals are unchanged.
	pad.add_child(_pad_button("ZoomIn", "zoom_in", "Zoom +", func() -> void: zoom_step.emit(-4.0)))
	pad.add_child(_pad_button("ZoomOut", "zoom_out", "Zoom -", func() -> void: zoom_step.emit(4.0)))
	pad.add_child(_pad_button("TiltUp", "tilt_up", "Tilt +", func() -> void: tilt_step.emit(8.0)))
	pad.add_child(_pad_button("TiltDown", "tilt_down", "Tilt -", func() -> void: tilt_step.emit(-8.0)))
	pad.add_child(_pad_button("TurnLeft", "turn_left", "Turn left 90°", func() -> void: turn_step.emit(-90.0)))
	pad.add_child(_pad_button("TurnRight", "turn_right", "Turn right 90°", func() -> void: turn_step.emit(90.0)))
	pad.add_child(_pad_button("Fit", "fit", "Fit (F)", func() -> void: fit_pressed.emit()))
	view_button = _pad_button("View", "view_all", "View: All (C)", func() -> void: view_pressed.emit())
	view_button.set_meta("mode", "all")
	view_button.visible = false
	pad.add_child(view_button)


func _ready() -> void:
	camera_3d = $Camera3D


func ease(delta: float) -> void:
	var k := 1.0 - exp(-CAM_SMOOTH * delta)
	zoom = target_zoom if absf(target_zoom - zoom) < 0.01 else lerpf(zoom, target_zoom, k)
	pitch = target_pitch if absf(target_pitch - pitch) < 0.01 else lerpf(pitch, target_pitch, k)
	update_transform()


func consume_fit(allow_fit: bool) -> void:
	if _fit_wait > 0:
		_fit_wait -= 1
	elif _fit_pending != 0 and allow_fit:
		if follow:
			pass                                 # no auto-fit while following a hero
		elif _fit_pending == 2 or not manual:
			needs_fit.emit(_fit_pending == 2)
		_fit_pending = 0


func follow_step(delta: float, follow_point: Variant) -> void:
	if follow and follow_point != null:
		var goal_pos := Vector3(follow_point.x, 0, follow_point.z)
		position = position.lerp(goal_pos, 1.0 - exp(-FOLLOW_SMOOTH * delta))


func request_fit(mode: int) -> void:
	_fit_pending = maxi(_fit_pending, mode)
	_fit_wait = 2


func zoom_by(d: float) -> void:
	set_zoom(target_zoom + d)


## Zoom within the limits. The follow close-up may sit below ZOOM_LIMITS.x;
## from there (even after follow ends) zooming in stops where it is and
## zooming out works, so no gesture or button snaps the camera the wrong way.
func set_zoom(z: float) -> void:
	var lo := FOLLOW_MIN if follow else minf(ZOOM_LIMITS.x, target_zoom)
	var before := target_zoom
	target_zoom = clampf(z, lo, ZOOM_LIMITS.y)
	# Only a zoom OUT to an overview distance re-arms the close-in; zooming
	# in from a far close-up (40 -> 24 -> 20) must not let View stack again.
	if not follow and target_zoom > before and target_zoom >= ZOOM_LIMITS.x:
		follow_zoomed = false


func tilt_by(d: float) -> void:
	target_pitch = clampf(target_pitch + d, PITCH_LIMITS.x, PITCH_LIMITS.y)
	request_fit(1)


## On-screen +/- buttons, wheel and keys: the user takes over the zoom.
func zoom_button(d: float) -> void:
	if not manual:
		became_manual.emit()
	manual = true
	zoom_by(d)


func set_follow(on: bool) -> void:
	var was := follow
	follow = on
	_set_view_icon(on)
	if on and not was:
		# A little lower behind the hero; undone on exit unless the user
		# tilted meanwhile.
		_pre_follow_pitch = target_pitch
		target_pitch = clampf(target_pitch - FOLLOW_TILT, PITCH_LIMITS.x, PITCH_LIMITS.y)
		_follow_pitch = target_pitch
	elif not on and was:
		if is_equal_approx(target_pitch, _follow_pitch):
			target_pitch = _pre_follow_pitch
		_follow_pitch = -1.0
	if on:
		if _move_tween:
			_move_tween.kill()
		# Close in once per overview: until the camera refits or the user
		# zooms back out to an overview distance, View again (e.g. after a pan) keeps the
		# close-up instead of stacking another 60%.
		if not follow_zoomed:
			target_zoom = maxf(FOLLOW_MIN, target_zoom * FOLLOW_ZOOM)
			follow_zoomed = true


## Smooth 90° turn (ease out) from the current yaw. Does not snap to the
## 45° + n·90° grid; Fit / double-tap does that (snap_yaw_to_sector).
func rotate_by(deg: float) -> void:
	_tween_yaw(target_yaw + deg)


## Free yaw, from a right/middle drag or a two-finger twist. Takes over
## from Follow hero the same way pan() does.
func yaw_by(deg: float) -> void:
	if follow:
		set_follow(false)
	if not manual:
		became_manual.emit()
	manual = true
	if _yaw_tween:
		_yaw_tween.kill()
	target_yaw += deg
	yaw = target_yaw


## Snap yaw to the nearest 45° + n·90° sector (45, 135, 225, 315).
func snap_yaw_to_sector() -> void:
	var y := fposmod(target_yaw, 360.0)
	var best := 45.0
	var best_d := 999.0
	for n in 5:
		var c := 45.0 + float(n) * 90.0
		var d := absf(fposmod(y - c + 180.0, 360.0) - 180.0)
		if d < best_d:
			best_d = d
			best = fposmod(c, 360.0)
	_tween_yaw(best)


func _tween_yaw(to: float) -> void:
	if _yaw_tween:
		_yaw_tween.kill()
	# Shortest turn, including across 0°.
	while to - yaw > 180.0:
		to -= 360.0
	while yaw - to > 180.0:
		to += 360.0
	target_yaw = to
	_yaw_tween = create_tween()
	_yaw_tween.tween_property(self, "yaw", target_yaw, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_yaw_tween.tween_callback(func() -> void:
		yaw = fposmod(target_yaw, 360.0)
		target_yaw = yaw)


func pan(delta_px: Vector2) -> void:
	if follow:
		set_follow(false)                    # dragging the view takes over from the follow camera
	if not manual:
		became_manual.emit()
	manual = true
	var scale := zoom / 600.0
	var right := Vector3(cos(deg_to_rad(yaw)), 0, -sin(deg_to_rad(yaw)))
	var fwd := Vector3(-sin(deg_to_rad(yaw)), 0, -cos(deg_to_rad(yaw)))
	position -= right * delta_px.x * scale
	position += fwd * delta_px.y * scale


func update_transform() -> void:
	rotation_degrees.y = yaw
	var p := deg_to_rad(pitch)
	camera_3d.position = Vector3(0, zoom * sin(p), zoom * cos(p))
	camera_3d.look_at(global_position, Vector3.UP)


## After a rotation, glide the pivot back onto the dungeon so the board
## doesn't drift off screen. Fit (when the user has not taken over) stays
## with the level screen, which has the HUD hole.
func snap_to(placed: Dictionary, room: float) -> void:
	var lo := Vector3(INF, 0, INF)
	var hi := Vector3(-INF, 0, -INF)
	for id in placed:
		var c := _slot_center(int(placed[id].x), int(placed[id].y), room)
		lo = lo.min(c)
		hi = hi.max(c)
	var center := _slot_center(2, 0, room) if placed.is_empty() else (lo + hi) / 2.0
	if _move_tween:
		_move_tween.kill()
	_move_tween = create_tween()
	_move_tween.tween_property(self, "position", center, 0.25)


## Centre on and fit the dungeon's bounds inside the HUD hole, for the
## yaw/tilt the camera is heading to. While building, the whole drawn
## board is framed so a narrow portrait window doesn't clip the floor;
## during a run the placed rooms are framed tightly. Binary search on the
## zoom, then shift the pivot so the box sits in the middle of the hole.
func fit(instant: bool, placed: Dictionary, building: bool, area: Rect2, room: float, slots_x: Vector2i, slots_y: Vector2i, fit_height: float, view_size: Vector2) -> void:
	follow_zoomed = false                    # back to an overview distance
	var lo := Vector2i(slots_x.x, slots_y.x)
	var hi := Vector2i(slots_x.y, slots_y.y)
	var tight := not placed.is_empty() and not building
	if tight:
		lo = Vector2i(1 << 20, 1 << 20)
		hi = -lo
		for id in placed:
			lo = lo.min(placed[id])
			hi = hi.max(placed[id])
	var x0 := lo.x * room
	var x1 := (hi.x + 1) * room
	var z0 := -lo.y * room
	var z1 := -(hi.y + 1) * room
	var boxes: Array = [[x0, x1, z0, z1]]
	if tight:
		boxes = []
		for id in placed:
			var sl: Vector2i = placed[id]
			boxes.append([sl.x * room, (sl.x + 1) * room, -sl.y * room, -(sl.y + 1) * room])
	var pts: Array[Vector3] = []
	for bx in boxes:
		for x in [bx[0], bx[1]]:
			for z in [bx[2], bx[3]]:
				for h in [0.0, fit_height]:
					pts.append(Vector3(x, h, z))
	var saved := [position, yaw, pitch, zoom]
	position = Vector3((x0 + x1) / 2.0, 0, (z0 + z1) / 2.0)
	yaw = target_yaw
	pitch = target_pitch
	var best := ZOOM_LIMITS.y
	for _round in 2:
		var a := ZOOM_LIMITS.x
		var b := ZOOM_LIMITS.y
		for _i in 14:
			zoom = (a + b) / 2.0
			update_transform()
			if _fits(pts, area.size):
				b = zoom
			else:
				a = zoom
		best = b
		zoom = best
		update_transform()
		var box := Rect2(camera_3d.unproject_position(pts[0]), Vector2.ZERO)
		for p in pts:
			box = box.expand(camera_3d.unproject_position(p))
		var screen_mid := view_size / 2.0
		position = _ground_at(screen_mid - (area.get_center() - box.get_center()))
	var target_pos := position
	position = saved[0]
	yaw = saved[1]
	pitch = saved[2]
	zoom = saved[3]
	update_transform()
	if _move_tween:
		_move_tween.kill()
	target_zoom = best
	if instant:
		position = target_pos
		zoom = best
		update_transform()
	else:
		_move_tween = create_tween()
		_move_tween.tween_property(self, "position", target_pos, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _fits(pts: Array[Vector3], size: Vector2) -> bool:
	var box := Rect2()
	for i in pts.size():
		if camera_3d.is_position_behind(pts[i]):
			return false
		var q := camera_3d.unproject_position(pts[i])
		box = Rect2(q, Vector2.ZERO) if i == 0 else box.expand(q)
	return box.size.x <= size.x and box.size.y <= size.y


func _ground_at(pos: Vector2) -> Vector3:
	var o := camera_3d.project_ray_origin(pos)
	var d := camera_3d.project_ray_normal(pos)
	return o - d * (o.y / d.y) if absf(d.y) > 0.0001 else position


func _slot_center(x: int, y: int, room: float) -> Vector3:
	return Vector3(x * room + room / 2.0, 0, -(y * room + room / 2.0))


const ICON_DIR := "res://assets/ui/camera/"

func _icon(id: String) -> Texture2D:
	return load(ICON_DIR + id + ".svg") as Texture2D


func _set_view_icon(follow_on: bool) -> void:
	if view_button == null:
		return
	var hero := follow_on
	view_button.icon = _icon("view_hero" if hero else "view_all")
	var label := "View: Hero (C)" if hero else "View: All (C)"
	if view_button is ZorgCamPadButton:
		(view_button as ZorgCamPadButton).set_accessible(label)
	else:
		view_button.tooltip_text = label
	view_button.set_meta("mode", "hero" if hero else "all")


func _pad_button(id: String, icon_id: String, accessible: String, cb: Callable) -> Button:
	var b := ZorgCamPadButton.new()
	b.setup(id, _icon(icon_id), accessible, cb)
	return b
