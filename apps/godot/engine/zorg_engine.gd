class_name ZorgEngine
extends RefCounted
## Pure-logic GDScript port of the slice of packages/engine that one
## Warrior-only level needs (ADR-0008). No nodes, no visuals: scenes call
## this and replay its events; they never change outcomes.
##
## Ported from the TS engine (the formal spec GAME_SPEC.md wins):
##   tiles.ts      default 4-hatch 5x5 tile, CCW rotation, tie order (FR-31)
##   placement.ts  validateLayout (FR-5–FR-8)
##   pathing.ts    walk grid, distanceToRooms, chooseWarriorStep (FR-20)
##   weights.ts    reachable rooms + default {Z:1} weights
##   simulation.ts createRun / stepRun for A, Z, D (FR-11–FR-13, FR-26–FR-31)
##   elements.ts   E(fire) only: 1 damage per entry onto a green cell (FR-14)
##   constraints.ts dist(r, s) compare only (FR-10, FR-43)
## Everything else fails closed (NFR-8): other room types, other heroes,
## spells, variables, mirror worlds -> load_level() returns an error.
## Room C, the Gunner duration and FR-4 gating are not touched here.

const ROOM_SIZE := 5
const BASE_TIE := ["right", "up", "left", "down"]
const DELTA := {"right": Vector2i(1, 0), "up": Vector2i(0, 1), "left": Vector2i(-1, 0), "down": Vector2i(0, -1)}
const SUPPORTED_ROOMS := ["A", "Z", "D", "E"]
const SUPPORTED_ELEMENTS := ["fire"]

# ---------------------------------------------------------------- level

## Returns {ok, error, level, supplied}. `data` is apps/godot/levels/*.json
## (written by packages/engine/scripts/godot-golden.mjs from the real fixture).
static func load_level(data: Dictionary) -> Dictionary:
	var level: Dictionary = data.get("level", {})
	var supplied: Array = data.get("supplied", [])
	for key in ["spells", "variables", "mirrorWorlds", "opaqueAssignments"]:
		if level.has(key) and not (level[key] as Array).is_empty():
			return _fail("Milestone 1 engine has no support for '%s' (NFR-8 fail-closed)." % key)
	for s in supplied:
		var t: String = s["def"]["type"]
		if not SUPPORTED_ROOMS.has(t):
			return _fail("Room type %s is not ported yet (NFR-8 fail-closed)." % t)
		if t == "E" and not SUPPORTED_ELEMENTS.has(String(s["def"].get("element", ""))):
			return _fail("E(%s) is not ported yet; only fire is (NFR-8 fail-closed)." % s["def"].get("element", "?"))
		if t == "D" and not (s["def"]["damage"] is float or s["def"]["damage"] is int):
			return _fail("D room %s has a non-numeric damage." % s["id"])
	for h in level.get("heroes", []):
		if typeof(h) != TYPE_DICTIONARY or h.get("type", "") != "Warrior":
			return _fail("Only Warrior heroes are ported yet (NFR-8 fail-closed).")
		if not (h["hp"] is float or h["hp"] is int):
			return _fail("Warrior HP is unresolved.")
	return {"ok": true, "error": "", "level": level, "supplied": supplied}

static func _fail(msg: String) -> Dictionary:
	return {"ok": false, "error": msg, "level": {}, "supplied": []}

## A placed room: {id, def, x, y, orientation}.
static func make_room(supplied_room: Dictionary, x: int, y: int, orientation: int = 0) -> Dictionary:
	return {"id": supplied_room["id"], "def": supplied_room["def"], "x": x, "y": y, "orientation": orientation}

# ---------------------------------------------------------------- tiles

static func default_tile() -> Array:
	var tile: Array = []
	for y in ROOM_SIZE:
		var row: Array = []
		for x in ROOM_SIZE:
			var on_edge := x == 0 or x == ROOM_SIZE - 1 or y == 0 or y == ROOM_SIZE - 1
			var hatch := (x == 2 and (y == 0 or y == ROOM_SIZE - 1)) or (y == 2 and (x == 0 or x == ROOM_SIZE - 1))
			row.append("wall" if on_edge and not hatch else "open")
		tile.append(row)
	return tile

static func rotate_tile(tile: Array, orientation: int) -> Array:
	var cur := tile
	for i in (orientation / 90) % 4:
		var nxt: Array = []
		for y in ROOM_SIZE:
			var row: Array = []
			row.resize(ROOM_SIZE)
			nxt.append(row)
		for y in ROOM_SIZE:
			for x in ROOM_SIZE:
				nxt[x][ROOM_SIZE - 1 - y] = cur[y][x]
		cur = nxt
	return cur

## FR-14 default E tile: the 4-hatch cross with the 3×3 interior green.
static func elemental_tile() -> Array:
	var tile := default_tile()
	for y in range(1, ROOM_SIZE - 1):
		for x in range(1, ROOM_SIZE - 1):
			if tile[y][x] != "wall":
				tile[y][x] = "green"
	return tile

static func base_tile(def: Dictionary) -> Array:
	return elemental_tile() if def.get("type", "") == "E" else default_tile()

static func resolved_tile(room: Dictionary) -> Array:
	return rotate_tile(base_tile(room["def"]), int(room["orientation"]))

static func rotate_cardinal(dir: String, orientation: int) -> String:
	var order := ["right", "up", "left", "down"]
	return order[(order.find(dir) + (orientation / 90) % 4) % 4]

static func oriented_tie_break(orientation: int) -> Array:
	var out: Array = []
	for d in BASE_TIE:
		out.append(rotate_cardinal(d, orientation))
	return out

static func edge_profile(tile: Array, side: String) -> Array:
	var cells: Array = []
	var last := ROOM_SIZE - 1
	for i in ROOM_SIZE:
		match side:
			"east": cells.append(tile[i][last])
			"west": cells.append(tile[i][0])
			"north": cells.append(tile[last][i])
			"south": cells.append(tile[0][i])
	return cells

static func _walkable(kind: String) -> String:
	return "wall" if kind == "wall" else "open"

# ---------------------------------------------------------------- placement (FR-5–FR-8)

static func validate_layout(supplied: Array, rooms: Array) -> Dictionary:
	var issues: Array = []
	var supplied_by_id := {}
	for s in supplied:
		supplied_by_id[s["id"]] = s
	var seen := {}
	var occupied := {}
	for room in rooms:
		if seen.has(room["id"]):
			issues.append({"code": "duplicate_id", "roomIds": [room["id"]]})
		seen[room["id"]] = true
		var spec = supplied_by_id.get(room["id"])
		if spec == null or spec["def"]["type"] != room["def"]["type"]:
			issues.append({"code": "extra", "roomIds": [room["id"]]})
		var key := "%d,%d" % [room["x"], room["y"]]
		if occupied.has(key):
			issues.append({"code": "overlap", "roomIds": [occupied[key], room["id"]]})
		else:
			occupied[key] = room["id"]
	for s in supplied:
		if not seen.has(s["id"]):
			issues.append({"code": "missing", "roomIds": [s["id"]]})
	var a_rooms := rooms.filter(func(r): return r["def"]["type"] == "A")
	var z_rooms := rooms.filter(func(r): return r["def"]["type"] == "Z")
	if a_rooms.is_empty():
		issues.append({"code": "no_spawn", "roomIds": []})
	if z_rooms.is_empty():
		issues.append({"code": "no_zorg", "roomIds": []})
	if not a_rooms.is_empty():
		var anchor_ori: int = a_rooms[0]["orientation"]
		var a_dis := a_rooms.filter(func(r): return r["orientation"] != anchor_ori)
		if not a_dis.is_empty():
			issues.append({"code": "orientation", "roomIds": []})
		else:
			var others := rooms.filter(func(r): return r["def"]["type"] != "A" and r["orientation"] != anchor_ori)
			if not others.is_empty():
				issues.append({"code": "orientation", "roomIds": []})
	if not rooms.is_empty():
		var by_pos := {}
		for r in rooms:
			by_pos["%d,%d" % [r["x"], r["y"]]] = r
		var adjacency := {}
		var any_edge := false
		for r in rooms:
			var list: Array = []
			for d in BASE_TIE:
				var n = by_pos.get("%d,%d" % [r["x"] + DELTA[d].x, r["y"] + DELTA[d].y])
				if n != null:
					list.append(n["id"])
					any_edge = true
			if adjacency.has(r["id"]):
				(adjacency[r["id"]] as Array).append_array(list)
			else:
				adjacency[r["id"]] = list
		var diag := false
		for i in rooms.size():
			for j in range(i + 1, rooms.size()):
				if absi(rooms[i]["x"] - rooms[j]["x"]) == 1 and absi(rooms[i]["y"] - rooms[j]["y"]) == 1:
					diag = true
		if rooms.size() > 1 and not any_edge and diag:
			issues.append({"code": "diagonal_only", "roomIds": []})
		var comp := {rooms[0]["id"]: true}
		var queue: Array = [rooms[0]["id"]]
		while not queue.is_empty():
			var id = queue.pop_front()
			for nxt in adjacency.get(id, []):
				if not comp.has(nxt):
					comp[nxt] = true
					queue.append(nxt)
		if comp.size() != rooms.size():
			issues.append({"code": "disconnected", "roomIds": []})
		var sides := {"right": "east", "up": "north", "left": "west", "down": "south"}
		var opposite := {"east": "west", "west": "east", "north": "south", "south": "north"}
		var pairs := {}
		for r in rooms:
			for d in BASE_TIE:
				var n = by_pos.get("%d,%d" % [r["x"] + DELTA[d].x, r["y"] + DELTA[d].y])
				if n == null:
					continue
				var ids := [str(r["id"]), str(n["id"])]
				ids.sort()
				var pk := "|".join(ids)
				if pairs.has(pk):
					continue
				pairs[pk] = true
				var a_edge := edge_profile(resolved_tile(r), sides[d])
				var b_edge := edge_profile(resolved_tile(n), opposite[sides[d]])
				for k in ROOM_SIZE:
					if _walkable(a_edge[k]) != _walkable(b_edge[k]):
						issues.append({"code": "edge_mismatch", "roomIds": [r["id"], n["id"]]})
						break
	var codes: Array = []
	for i in issues:
		codes.append(i["code"])
	return {"ok": issues.is_empty(), "issues": issues, "codes": codes}

# ---------------------------------------------------------------- pathing (FR-20, FR-27–FR-31)

static func _key(c: Vector2i) -> String:
	return "%d,%d" % [c.x, c.y]

static func build_walk_grid(rooms: Array) -> Dictionary:
	var cells := {}
	for room in rooms:
		var tile := resolved_tile(room)
		for ly in ROOM_SIZE:
			for lx in ROOM_SIZE:
				var w := Vector2i(int(room["x"]) * ROOM_SIZE + lx, int(room["y"]) * ROOM_SIZE + ly)
				var kind: String = tile[ly][lx]
				var element := ""
				if kind == "green" and room["def"]["type"] == "E":
					element = String(room["def"]["element"])
				cells[_key(w)] = {"world": w, "roomId": room["id"], "kind": kind, "element": element}
	return cells

static func _passable(grid: Dictionary, pos: Vector2i) -> bool:
	var cell = grid.get(_key(pos))
	return cell != null and cell["kind"] != "wall"

## A/Z/D tiles carry no ice, water or tolls, so a step is one cell.
static func resolve_step(grid: Dictionary, from: Vector2i, dir: String) -> Array:
	var first: Vector2i = from + DELTA[dir]
	if not _passable(grid, first):
		return []
	return [first]

static func _room_at(grid: Dictionary, pos: Vector2i) -> Variant:
	var cell = grid.get(_key(pos))
	return null if cell == null else cell["roomId"]

static func distance_to_rooms(rooms: Array, grid: Dictionary, targets: Array) -> Dictionary:
	var incoming := {}
	for cell in grid.values():
		if not _passable(grid, cell["world"]):
			continue
		for d in BASE_TIE:
			var path := resolve_step(grid, cell["world"], d)
			if path.is_empty():
				continue
			var land: Vector2i = path[path.size() - 1]
			var hit = null
			for p in path:
				if targets.has(_room_at(grid, p)):
					hit = p
					break
			var to_key := _key(hit if hit != null else land)
			if not incoming.has(to_key):
				incoming[to_key] = []
			incoming[to_key].append(cell["world"])
	var dist := {}
	var queue: Array = []
	for room in rooms:
		if not targets.has(room["id"]):
			continue
		for ly in ROOM_SIZE:
			for lx in ROOM_SIZE:
				var w := Vector2i(int(room["x"]) * ROOM_SIZE + lx, int(room["y"]) * ROOM_SIZE + ly)
				if not _passable(grid, w):
					continue
				if not dist.has(_key(w)):
					dist[_key(w)] = 0
					queue.append(w)
	var head := 0
	while head < queue.size():
		var cur: Vector2i = queue[head]
		head += 1
		var cd: int = dist[_key(cur)]
		for prev in incoming.get(_key(cur), []):
			var pk := _key(prev)
			if dist.has(pk):
				continue
			dist[pk] = cd + 1
			queue.append(prev)
	return dist

static func reachable_room_ids(grid: Dictionary, from: Vector2i) -> Dictionary:
	var rooms := {}
	var here = _room_at(grid, from)
	if here != null:
		rooms[here] = true
	var seen := {_key(from): true}
	var queue: Array = [from]
	var head := 0
	while head < queue.size():
		var cur: Vector2i = queue[head]
		head += 1
		if not _passable(grid, cur) and head > 1:
			continue
		for d in BASE_TIE:
			var path := resolve_step(grid, cur, d)
			if path.is_empty():
				continue
			var land: Vector2i = path[path.size() - 1]
			if seen.has(_key(land)):
				continue
			seen[_key(land)] = true
			queue.append(land)
			var id = _room_at(grid, land)
			if id != null:
				rooms[id] = true
	return rooms

## Warrior perceives the default {Z:1} weights (no princesses are ported).
static func highest_weight_room_ids(rooms: Array, reachable: Dictionary) -> Array:
	var best := -INF
	var ids: Array = []
	for room in rooms:
		if not reachable.has(room["id"]):
			continue
		var w := 1.0 if room["def"]["type"] == "Z" else 0.0
		if w > best:
			best = w
			ids = [room["id"]]
		elif w == best:
			ids.append(room["id"])
	return ids

static func choose_warrior_step(grid: Dictionary, dist: Dictionary, from: Vector2i, orientation: int, targets: Array) -> Variant:
	if not dist.has(_key(from)):
		return null
	var here: int = dist[_key(from)]
	for d in oriented_tie_break(orientation):
		var path := resolve_step(grid, from, d)
		if path.is_empty():
			continue
		var land: Vector2i = path[path.size() - 1]
		for p in path:
			if targets.has(_room_at(grid, p)):
				land = p
				break
		var nd = dist.get(_key(land))
		if nd != null and nd < here:
			return d
	return null

# ---------------------------------------------------------------- simulation (FR-11–FR-13, FR-26–FR-31)

## Returns a run state, or {error} when FR-8 blocks extermination.
static func create_run(loaded: Dictionary, rooms: Array) -> Dictionary:
	var report := validate_layout(loaded["supplied"], rooms)
	if not report["ok"]:
		return {"error": "FR-8: cannot start extermination until FR-5–FR-7 hold.", "report": report}
	var heroes: Array = []
	var i := 0
	for h in loaded["level"]["heroes"]:
		heroes.append({"id": i, "hp": int(h["hp"]), "spawned": false, "dead": false, "stuck": false, "cell": null, "roomId": null})
		i += 1
	var main_a := ""
	var orientation := 0
	for r in rooms:
		if r["def"]["type"] == "A":
			main_a = r["id"]
			orientation = int(r["orientation"])
			break
	return {"rooms": rooms.duplicate(true), "heroes": heroes, "mainAId": main_a, "orientation": orientation,
		"outcome": "in_progress", "stepCount": 0, "events": []}

static func _cell(v: Vector2i) -> Dictionary:
	return {"x": v.x, "y": v.y}

static func _room_def(state: Dictionary, id: String) -> Dictionary:
	for r in state["rooms"]:
		if r["id"] == id:
			return r["def"]
	return {}

static func select_active_hero(heroes: Array) -> Variant:
	for h in heroes:
		if h["dead"]:
			continue
		if not h["stuck"]:
			return h
	return null

static func _check_death(state: Dictionary, hero: Dictionary, events: Array) -> void:
	if hero["hp"] <= 0 and not hero["dead"]:
		hero["dead"] = true
		hero["stuck"] = false
		events.append({"type": "death", "heroId": hero["id"]})
		if state["heroes"].all(func(h): return h["dead"]):
			state["outcome"] = "win"
			events.append({"type": "win"})

static func _enter_room(state: Dictionary, hero: Dictionary, room_id: String, events: Array) -> void:
	hero["roomId"] = room_id
	var def := _room_def(state, room_id)
	events.append({"type": "enter", "heroId": hero["id"], "roomId": room_id, "roomType": def["type"]})
	if def["type"] == "A":
		state["mainAId"] = room_id
	if def["type"] == "Z":
		state["outcome"] = "loss"
		events.append({"type": "loss", "heroId": hero["id"]})
		return
	if def["type"] == "D":
		var amount := int(def["damage"])
		hero["hp"] -= amount
		events.append({"type": "damage", "heroId": hero["id"], "amount": amount, "hp": hero["hp"]})
	_check_death(state, hero, events)

## FR-14 fire: 1 damage on every entry onto a green fire cell (elements.ts).
static func _apply_elemental_cell(state: Dictionary, hero: Dictionary, cell: Vector2i, grid: Dictionary, events: Array) -> void:
	var walk = grid.get(_key(cell))
	if walk == null or walk["element"] != "fire":
		return
	hero["hp"] -= 1
	events.append({"type": "damage", "heroId": hero["id"], "amount": 1, "hp": hero["hp"]})
	_check_death(state, hero, events)

static func _maybe_settle(state: Dictionary, events: Array) -> void:
	if state["outcome"] != "in_progress":
		return
	if state["heroes"].all(func(h): return h["dead"]):
		state["outcome"] = "win"
		events.append({"type": "win"})
		return
	if select_active_hero(state["heroes"]) == null and state["heroes"].any(func(h): return not h["dead"]):
		state["outcome"] = "stalemate"
		events.append({"type": "stalemate"})

## One hero action (spawn, one step, or wait). Returns the events it emitted.
static func step_run(state: Dictionary) -> Array:
	var events: Array = []
	if state["outcome"] != "in_progress":
		return events
	var hero = select_active_hero(state["heroes"])
	if hero == null:
		_maybe_settle(state, events)
		state["events"].append_array(events)
		return events
	var grid := build_walk_grid(state["rooms"])
	state["stepCount"] += 1
	if not hero["spawned"]:
		var spawn: Dictionary = {}
		for r in state["rooms"]:
			if r["id"] == state["mainAId"]:
				spawn = r
		var cell := Vector2i(int(spawn["x"]) * ROOM_SIZE + 2, int(spawn["y"]) * ROOM_SIZE + 2)
		hero["spawned"] = true
		hero["stuck"] = false
		hero["cell"] = cell
		hero["roomId"] = spawn["id"]
		events.append({"type": "spawn", "heroId": hero["id"], "cell": _cell(cell), "roomId": spawn["id"]})
		_enter_room(state, hero, spawn["id"], events)
		_apply_elemental_cell(state, hero, cell, grid, events)
		state["events"].append_array(events)
		return events
	var reachable := reachable_room_ids(grid, hero["cell"])
	var targets := highest_weight_room_ids(state["rooms"], reachable)
	var dir = null
	if not targets.is_empty():
		var dist := distance_to_rooms(state["rooms"], grid, targets)
		dir = choose_warrior_step(grid, dist, hero["cell"], state["orientation"], targets)
	var path: Array = [] if dir == null else resolve_step(grid, hero["cell"], dir)
	if path.is_empty():
		hero["stuck"] = true
		events.append({"type": "wait", "heroId": hero["id"]})
		_maybe_settle(state, events)
		state["events"].append_array(events)
		return events
	hero["stuck"] = false
	for to in path:
		var from: Vector2i = hero["cell"]
		hero["cell"] = to
		events.append({"type": "move", "heroId": hero["id"], "from": _cell(from), "to": _cell(to), "dir": dir})
		var next_room = _room_at(grid, to)
		if next_room != hero["roomId"]:
			_enter_room(state, hero, next_room, events)
		if state["outcome"] != "in_progress" or hero["dead"]:
			break
		_apply_elemental_cell(state, hero, to, grid, events)
		if state["outcome"] != "in_progress" or hero["dead"]:
			break
	state["events"].append_array(events)
	return events

## Same loop as packages/engine/scripts/godot-golden.mjs runTurns().
static func run_turns(state: Dictionary, max_steps: int = 10000) -> Array:
	var turns: Array = []
	while state["outcome"] == "in_progress" and state["stepCount"] < max_steps:
		var ev := step_run(state)
		if ev.is_empty():
			break
		turns.append(ev)
	if state["outcome"] == "in_progress":
		state["outcome"] = "stalemate"
		turns.append([{"type": "stalemate"}])
	return turns

# ---------------------------------------------------------------- scoring (FR-10, FR-43)

static func _normalize(expr: String) -> String:
	var re := RegEx.create_from_string("\\s+")
	var s := re.sub(expr, " ", true)
	s = RegEx.create_from_string("[.。]\\s*$").sub(s, "")
	return s.strip_edges()

static func _room_ref(raw: String) -> Variant:
	var m := RegEx.create_from_string("^([AZDEOPTazdeopt])(?:\\(\\s*([+-]?\\d+)\\s*\\))?$").search(raw.strip_edges())
	if m == null:
		return null
	var ref := {"type": m.get_string(1).to_upper()}
	if m.get_start(2) >= 0:
		ref["arg"] = int(m.get_string(2))
	return ref

static func _dist_atom(raw: String) -> Variant:
	var m := RegEx.create_from_string("^dist\\(\\s*(.+?)\\s*,\\s*(.+?)\\s*\\)$").search(raw.strip_edges())
	if m == null:
		return null
	var l = _room_ref(m.get_string(1))
	var r = _room_ref(m.get_string(2))
	if l == null or r == null:
		return null
	return {"left": l, "right": r}

static func _unique_room(rooms: Array, ref: Dictionary) -> Variant:
	var hits: Array = []
	for room in rooms:
		if room["def"]["type"] != ref["type"]:
			continue
		if ref.has("arg"):
			if room["def"]["type"] != "D" or int(room["def"]["damage"]) != ref["arg"]:
				continue
		hits.append(room)
	return hits[0] if hits.size() == 1 else null

static func _atom_value(rooms: Array, atom: Dictionary) -> Variant:
	var a = _unique_room(rooms, atom["left"])
	var b = _unique_room(rooms, atom["right"])
	if a == null or b == null:
		return null
	return absi(int(a["x"]) - int(b["x"])) + absi(int(a["y"]) - int(b["y"]))

## Only `dist(r, s) <op> n | dist(...)` is grounded; any other prose is
## "unsupported" and refuses a win, as in constraints.ts.
static func evaluate_constraint(rooms: Array, expression: String) -> Dictionary:
	var n := _normalize(expression)
	var m := RegEx.create_from_string("^(dist\\(\\s*.+?\\s*,\\s*.+?\\s*\\))\\s*(=|!=|<=|>=|<|>)\\s*(.+)$").search(n)
	if m == null:
		return {"kind": "unsupported", "status": "unsupported"}
	var left = _dist_atom(m.get_string(1))
	var rhs_raw := m.get_string(3).strip_edges()
	var right = null
	if RegEx.create_from_string("^[+-]?\\d+$").search(rhs_raw) != null:
		right = int(rhs_raw)
	else:
		var atom = _dist_atom(rhs_raw)
		if atom != null:
			right = _atom_value(rooms, atom)
			if right == null:
				return {"kind": "distance", "status": "unsupported"}
	if left == null or right == null:
		return {"kind": "unsupported", "status": "unsupported"}
	var lv = _atom_value(rooms, left)
	if lv == null:
		return {"kind": "distance", "status": "unsupported"}
	var ok := false
	match m.get_string(2):
		"=": ok = lv == right
		"!=": ok = lv != right
		"<": ok = lv < right
		">": ok = lv > right
		"<=": ok = lv <= right
		">=": ok = lv >= right
	return {"kind": "distance", "status": "held" if ok else "failed"}

static func score(loaded: Dictionary, state: Dictionary) -> Dictionary:
	var constraints: Array = []
	for c in loaded["level"].get("constraints", []):
		var ev := evaluate_constraint(state["rooms"], c["expression"])
		constraints.append({"id": c["id"], "kind": ev["kind"], "status": ev["status"]})
	var outcome := "win"
	if state["outcome"] == "loss":
		outcome = "loss"
	elif not state["heroes"].all(func(h): return h["dead"]):
		outcome = "unresolved"
	elif constraints.any(func(c): return c["status"] != "held"):
		outcome = "unresolved"
	return {"outcome": outcome, "constraints": constraints}
