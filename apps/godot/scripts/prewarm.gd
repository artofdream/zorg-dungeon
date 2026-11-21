class_name ZorgPrewarm
extends Node
## Hitch fix (CF-015): draw every material the level is about to use once,
## a few pieces per frame, while the board is still idle, so the GPU
## compiles its shaders and pipelines then rather than on the frame of a
## room drop, the Play press, the first spawn or the first death (the ROG
## Phone showed 50-219 ms one-off frames there at a steady 60 FPS).
##
## The pieces stand on a stage under the board, straight behind it along
## the main camera's view, so the main camera draws them with exactly the
## variants the game will use (same viewport, 3D scale, sun, environment)
## while the opaque board hides them. Pooled rooms and heroes are handed
## back with take(); warm-only pieces (a dressing, fading heroes, glyphs)
## are freed by finish(). Nothing here reads or changes engine state. [[NFR-1]]

## Stage distance behind the board along the view (torch range is ~6, so
## nothing on the stage lights the board).
const DEPTH := 45.0
const SPACING := 6.0
const COLUMNS := 3

var stage: Node3D
var main_camera: Camera3D
var focus := Vector3.ZERO                    # board point the camera looks at
var glyphs: CanvasLayer
var _slots := 0
var _temp: Array[Node] = []
var _active := false
var _lights: Array = []
var board_light: OmniLight3D
var blocker: MeshInstance3D


func _init() -> void:
	name = "Prewarm"
	stage = Node3D.new()
	stage.name = "Stage"
	stage.visible = false
	add_child(stage)
	# Torch-lit variants: one dim omni over the whole stage (and a shadowed
	# one on High), plus one at the board's far, faded corner for the
	# board's own lit variant. Too dim and too far to see.
	for shadowed in [false, true]:
		var l := OmniLight3D.new()
		l.name = "WarmLight"
		l.omni_range = 40.0
		l.light_energy = 0.05
		l.shadow_enabled = shadowed
		l.visible = false
		l.position = Vector3(0, 0, 8.0)
		stage.add_child(l)
		_lights.append(l)
	# The board tiles have thin gaps; a black slab under them keeps the
	# stage from showing through while it is drawn.
	blocker = MeshInstance3D.new()
	blocker.name = "Blocker"
	var bm := BoxMesh.new()
	bm.size = Vector3(80, 0.05, 80)
	blocker.mesh = bm
	var bmat := StandardMaterial3D.new()
	bmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bmat.albedo_color = Color(0.006, 0.006, 0.01)   # the environment background
	bmat.disable_fog = true
	blocker.material_override = bmat
	blocker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	blocker.visible = false
	add_child(blocker)
	board_light = OmniLight3D.new()
	board_light.name = "WarmBoardLight"
	board_light.omni_range = 3.0
	board_light.light_energy = 0.02
	board_light.visible = false
	add_child(board_light)
	glyphs = CanvasLayer.new()
	glyphs.name = "Glyphs"
	glyphs.layer = -10
	add_child(glyphs)


func active() -> bool:
	return _active


## Start drawing the stage (each frame until finish()).
## `board_corner`: a board point far from the rooms (dark, faded).
func begin(cam: Camera3D, look_at: Vector3, board_corner: Vector3, shadows := false) -> void:
	main_camera = cam
	focus = look_at
	_slots = 0
	_active = true
	stage.visible = true
	_lights[0].visible = true
	_lights[1].visible = shadows
	board_light.position = board_corner + Vector3(0, 0.6, 0)
	board_light.visible = true
	blocker.position = Vector3(look_at.x, -0.35, look_at.z)
	blocker.visible = true
	_place_stage()


func _process(_delta: float) -> void:
	if _active:
		_place_stage()


func _place_stage() -> void:
	if main_camera == null:
		return
	var eye := main_camera.global_position
	var fwd := -main_camera.global_transform.basis.z
	var d := maxf((focus - eye).dot(fwd), 1.0)
	stage.global_position = eye + fwd * (d + DEPTH)
	# Spread the grid across the view so the whole stage stays behind the board.
	var b := main_camera.global_transform.basis
	stage.global_basis = Basis(b.x, b.y, b.z)


## Put `node` on the next free spot of the stage. `temp` pieces are freed by
## finish(); others are pooled and must be taken back with take().
func put(node: Node3D, temp := false) -> void:
	var i := _slots
	_slots += 1
	if node.get_parent():
		node.get_parent().remove_child(node)
	stage.add_child(node)
	var col := i % COLUMNS
	var row := i / COLUMNS
	# Screen-aligned grid centred on the view axis (x right, y up).
	node.position = Vector3((col - (COLUMNS - 1) / 2.0) * SPACING, (1.0 - row) * SPACING * 0.6, -row * 2.0)
	if temp:
		_temp.append(node)


## 2D pieces (hit numbers, plates) whose glyphs should be rasterised now;
## off-screen, so only the font cache sees them.
func put_control(c: Control) -> void:
	c.position += Vector2(-4000, -4000)
	glyphs.add_child(c)
	_temp.append(c)


## Draw `node` and leave it on the stage for the session; the stage is
## hidden after finish() (see heroes.gd fade_keepers).
func put_keeper(node: Node3D) -> void:
	put(node)
	node.set_meta("keeper", true)

## Take a pooled piece off the stage (keeps it alive, outside the tree).
func take(node: Node) -> void:
	if node and is_instance_valid(node) and node.get_parent() == stage:
		stage.remove_child(node)


## Stop drawing; free the warm-only pieces; pooled pieces still on the
## stage are taken off (they stay alive in their pool).
func finish() -> void:
	_active = false
	stage.visible = false
	board_light.visible = false
	blocker.visible = false
	for l in _lights:
		l.visible = false
	for n in _temp:
		if is_instance_valid(n):
			n.queue_free()
	_temp.clear()
	for c in stage.get_children():
		if not c.is_queued_for_deletion() and not (c in _lights) and not c.has_meta("keeper"):
			stage.remove_child(c)
