class_name ZorgDungeonDressing
extends Node3D
## Dungeon look, part 2 (visual only): tall, irregular stone walls along the
## dungeon's outer edges, a narrow corridor between them and the rooms, and
## a few props there (a gold-filled chest beside each gold room, barrels and
## crates). Built when a run starts and cleared for Build, so empty slots
## stay clear while you place rooms. Walls on the camera side drop to a low
## broken rim so they never hide the floor, heroes, labels or tap targets;
## the dressing is never inside a room and nothing here reads the rules
## engine (NFR-1). Pieces are CC0 KayKit (see CREDITS.md).

const ROOM := 5.0
## Gap between a room's edge and the wall line (the corridor props sit in).
const CORRIDOR := 1.2
## KayKit wall: 4 x 4 x 1 m; one board cell is 1 unit (2 m = 1 unit).
const WALL_S := 0.5
## Tall walls stand WALL_TALL x 4 m (about 1.7 hero heights).
const WALL_TALL := 0.7
## Height scale of the low rim on the camera side.
const RIM_Y := 0.12
## Props per quality: Low (web, phones) / High.
const LOW_PROPS := 6
const HIGH_PROPS := 12
const DIRS := [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]

## Per direction: [tall merged meshes, low rim merged meshes].
var _sides := {}
var _props: Array[Node3D] = []
var _back := Vector3.ZERO
var prop_cap := LOW_PROPS

## World centre of a slot (same formula as the level's slot_center).
static func _center(s: Vector2i) -> Vector3:
	return Vector3(s.x * ROOM + ROOM / 2.0, 0, -(s.y * ROOM + ROOM / 2.0))

## Outward normal in world space for a slot direction (+y slot is -z).
static func _normal(d: Vector2i) -> Vector3:
	return Vector3(d.x, 0, -d.y)

static func _hash(a: int, b: int, c: int) -> float:
	var h := (a * 73856093) ^ (b * 19349663) ^ (c * 83492791)
	return float(absi(h) % 1000) / 1000.0

func clear() -> void:
	for c in get_children():
		c.queue_free()
	_sides.clear()
	_props.clear()
	_back = Vector3.ZERO

func count_props() -> int:
	return _props.size()

## Build walls and props around `slots` (room id -> Vector2i). `types`
## maps room id -> room type letter.
func build(slots: Dictionary, types: Dictionary) -> void:
	clear()
	var taken := {}
	for id in slots:
		taken[slots[id]] = id
	var batches := {}
	for d in DIRS:
		batches[d] = [{}, {}, []]          # tall, rim, halo positions
	var spots: Array = []          # [priority, pos, yaw, kind]
	var ids: Array = slots.keys()
	ids.sort()
	for id in ids:
		var s: Vector2i = slots[id]
		for d in DIRS:
			if taken.has(s + d):
				continue
			_edge(s, d, taken, batches[d], spots, String(types.get(id, "")))
	for d in DIRS:
		var tall := Node3D.new()
		tall.name = "Walls_%d_%d" % [d.x, d.y]
		add_child(tall)
		ZorgLook.flush(tall, batches[d][0])
		for hp in batches[d][2]:
			ZorgAtmos.add_halo(tall, hp, 0.8)
		var rim := Node3D.new()
		rim.name = "Rim_%d_%d" % [d.x, d.y]
		add_child(rim)
		ZorgLook.flush(rim, batches[d][1])
		_sides[d] = [tall, rim]
	spots.sort_custom(func(a, b): return a[0] > b[0])
	for sp in spots:
		_add_prop(sp[1], sp[2], sp[3])
	set_prop_cap(prop_cap)
	_back = Vector3.ZERO

## One exposed edge: a run of wall pieces CORRIDOR outside the room, with
## outer corners extended and inner corners trimmed so lines meet.
func _edge(s: Vector2i, d: Vector2i, taken: Dictionary, batch: Array, spots: Array, type: String) -> void:
	var n := _normal(d)
	var p := Vector2i(-d.y, d.x)                # slot step along the edge
	var along := _normal(p)                     # the same step in world space
	var lo := -ROOM / 2.0
	var hi := ROOM / 2.0
	for end in [-1, 1]:
		var side: Vector2i = s + p * end
		var ext := 0.0
		if not taken.has(side):
			ext = CORRIDOR                      # outer corner
		elif taken.has(side + d):
			ext = -CORRIDOR                     # inner corner
		if end < 0:
			lo -= ext
		else:
			hi += ext
	var c := _center(s) + n * (ROOM / 2.0 + CORRIDOR)
	var length := hi - lo
	var pieces := maxi(1, int(round(length / (4.0 * WALL_S))))
	var w := length / pieces
	var yaw := atan2(n.x, n.z)
	for i in pieces:
		var t := lo + w * (i + 0.5)
		var pos := c + along * t
		var h := _hash(s.x * 4 + d.x, s.y * 4 + d.y, i)
		var piece := "wall"
		if h < 0.3:
			piece = "wall_broken"
		elif h > 0.8 and i > 0 and i < pieces - 1:
			piece = "wall_arched"                 # never at a corner
		var sx := w / (4.0 * WALL_S)
		var sy := 0.9 + 0.2 * _hash(i, s.x, s.y + 7)     # irregular tops
		ZorgLook.queue_piece(batch[0], piece, pos, Vector3(WALL_S * sx, WALL_TALL * sy, WALL_S), ZorgLook.mat("outer_wall"), true, yaw)
		ZorgLook.queue_piece(batch[1], "wall_broken", pos, Vector3(WALL_S * sx, WALL_S * RIM_Y * (0.8 + 0.4 * h), WALL_S), ZorgLook.mat("outer_wall"), false, yaw)
	# A wall sconce mid-edge on the inner face, with a flame glow (no omni
	# light: the torch budget is unchanged). Hidden with its wall.
	var sconce_at := c + along * (lo + length * 0.5 + (w * 0.5 if pieces % 2 == 1 else 0.0)) - n * 0.3
	sconce_at.y = 1.15
	ZorgLook.queue_piece(batch[0], "torch_mounted", sconce_at, Vector3.ONE * 0.8, ZorgLook.mat("kk"), false, atan2(-n.x, -n.z))
	batch[2].append(sconce_at + Vector3(0, 0.66, 0) - n * 0.25)
	# Props stand in the corridor, never inside a room.
	var mid := _center(s) + n * (ROOM / 2.0 + CORRIDOR * 0.5)
	var face := atan2(-n.x, -n.z)
	if type == "O":
		spots.append([2.0, mid + along * 1.2, face, "chest_gold"])
	var r := _hash(s.x + 11, s.y + 5, d.x * 3 + d.y)
	if r < 0.45:
		spots.append([r, mid - along * 1.6, face, "barrel_large"])
	elif r < 0.75:
		spots.append([r, mid + along * (1.6 if type != "O" else -1.4), face, "box_large"])

func _add_prop(pos: Vector3, yaw: float, kind: String) -> void:
	var root := Node3D.new()
	root.name = "Prop_" + kind
	root.position = pos
	root.rotation.y = yaw
	add_child(root)
	var s := 0.32
	match kind:
		"barrel_large": s = 0.36
		"box_large": s = 0.42
		"chest_gold": s = 0.5
	ZorgLook.add_piece(root, kind, Vector3.ZERO, Vector3.ONE * s, null, 0.0, false)
	if kind == "chest_gold":
		# Gold glints in the dark (no light: the omni budget stays as is).
		ZorgAtmos.add_halo(root, Vector3(0, 0.45, 0.0), 0.8)
	_props.append(root)

## Props shown: the first `cap` (chests first). Low keeps fewer.
func set_prop_cap(cap: int) -> void:
	prop_cap = cap
	for i in _props.size():
		_props[i].visible = i < cap

## Tall walls on the sides facing away from the camera, a low rim on the
## sides facing it. `cam_back` is the camera's +Z (towards the viewer).
func face(cam_back: Vector3) -> void:
	var b := Vector3(cam_back.x, 0, cam_back.z).normalized()
	if b.is_equal_approx(_back):
		return
	_back = b
	for d in _sides:
		var away: bool = _normal(d).dot(b) < 0.05
		(_sides[d][0] as Node3D).visible = away
		(_sides[d][1] as Node3D).visible = not away
