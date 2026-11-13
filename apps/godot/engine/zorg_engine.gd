class_name ZorgEngine
extends RefCounted
## Pure-logic GDScript port of the slice of packages/engine that the
## shipped levels need (ADR-0008). No nodes, no visuals: scenes call
## this and replay its events; they never change outcomes.
##
## Ported from the TS engine (the formal spec GAME_SPEC.md wins):
##   tiles.ts      default 4-hatch 5x5 tile, CCW rotation, tie order (FR-31)
##   placement.ts  validateLayout (FR-5–FR-8)
##   pathing.ts    walk grid, water/ice movement, distanceToRooms,
##                 chooseWarriorStep (FR-14, FR-20)
##   elf.ts        chooseElfStep: most HP kept, then shortest (FR-21)
##   weights.ts    reachable rooms + default {Z:1} weights
##   simulation.ts createRun / stepRun for A, Z, D, E (FR-11–FR-14, FR-26–FR-31)
##   elements.ts   fire, water, ice, poison + immunities (FR-14)
##   constraints.ts dist(r, s) compare, "∃s ∈ Π, dist(s,A) = dist(s,Z) = n"
##                 and the "no hero below 0 HP" floor (FR-10, FR-43)
##   simulation.ts castSpell / canCastNow for Attack(x) and Teleport(n)
##                 (FR-32–FR-35)
##   portals.ts    P(n, f): i-th entry teleports to the f(i)-th most recent
##                 earlier visit, else the waiting room (FR-15)
##   gold.ts       O(x) pickup, the purse dropping in the death room, FIFO
##                 T(x, elem) tolls refunded to the source rooms (FR-16, FR-17)
##   pathing.ts / elf.ts  gold and tolls in Warrior and Elf planning
## Everything else fails closed (NFR-8): other room types, other heroes,
## other spells, variables, mirror worlds -> load_level() returns an error.
## Room C, the Gunner duration and FR-4 gating are not touched here.

const ROOM_SIZE := 5
const BASE_TIE := ["right", "up", "left", "down"]
const DELTA := {"right": Vector2i(1, 0), "up": Vector2i(0, 1), "left": Vector2i(-1, 0), "down": Vector2i(0, -1)}
const SUPPORTED_ROOMS := ["A", "Z", "D", "E", "O", "P", "T"]
const SUPPORTED_ELEMENTS := ["fire", "water", "ice", "poison"]
const SUPPORTED_HEROES := ["Warrior", "Elf"]
const SUPPORTED_SPELLS := ["Attack", "Teleport"]

# ---------------------------------------------------------------- level

## Returns {ok, error, level, supplied}. `data` is apps/godot/levels/*.json
## (written by packages/engine/scripts/godot-golden.mjs from the real fixture).
static func load_level(data: Dictionary) -> Dictionary:
	var level: Dictionary = data.get("level", {})
	var supplied: Array = data.get("supplied", [])
	for key in ["variables", "mirrorWorlds", "opaqueAssignments"]:
		if level.has(key) and not (level[key] as Array).is_empty():
			return _fail("The Godot engine has no support for '%s' yet (NFR-8 fail-closed)." % key)
	var spells = expand_spells(level.get("spells", []))
	if spells is String:
		return _fail(spells)
	for s in supplied:
		var t: String = s["def"]["type"]
		if not SUPPORTED_ROOMS.has(t):
			return _fail("Room type %s is not ported yet (NFR-8 fail-closed)." % t)
		if t == "E" and not SUPPORTED_ELEMENTS.has(String(s["def"].get("element", ""))):
			return _fail("E(%s) is not a ported element (NFR-8 fail-closed)." % s["def"].get("element", "?"))
		if t == "D" and not _num(s["def"]["damage"]):
			return _fail("D room %s has a non-numeric damage." % s["id"])
		if t == "O" and not _num(s["def"].get("gold")):
			return _fail("O room %s has a non-numeric amount (NFR-8 fail-closed)." % s["id"])
		if t == "T" and (not _num(s["def"].get("cost")) or not SUPPORTED_ELEMENTS.has(String(s["def"].get("element", "")))):
			return _fail("T room %s needs a numeric cost and a ported element (NFR-8 fail-closed)." % s["id"])
		if t == "P":
			if not _num(s["def"].get("entries")):
				return _fail("P room %s has a non-numeric entry count (NFR-8 fail-closed)." % s["id"])
			if portal_formula(String(s["def"].get("formula", ""))).is_empty():
				return _fail("P room %s has an unsupported formula (NFR-8 fail-closed)." % s["id"])
	for h in level.get("heroes", []):
		if typeof(h) != TYPE_DICTIONARY or not SUPPORTED_HEROES.has(h.get("type", "")):
			return _fail("Only Warrior and Elf heroes are ported yet (NFR-8 fail-closed).")
		if not (h["hp"] is float or h["hp"] is int):
			return _fail("Hero HP is unresolved.")
	return {"ok": true, "error": "", "level": level, "supplied": supplied, "spells": spells}

## spells.ts expandSpells: "2*Teleport(2)" arrives as {type: Repeat, count,
## spell}. Returns the flat list (index = spell id) or an error string.
static func expand_spells(slots: Array) -> Variant:
	var out: Array = []
	for slot in slots:
		if typeof(slot) != TYPE_DICTIONARY:
			return "Spell slot is unresolved (NFR-8 fail-closed)."
		var count := 1
		var def: Dictionary = slot
		if slot.get("type", "") == "Repeat":
			if not (slot.get("count") is float or slot.get("count") is int):
				return "Spell repeat count is unresolved (NFR-8 fail-closed)."
			count = int(slot["count"])
			def = slot["spell"]
		var t := String(def.get("type", ""))
		if not SUPPORTED_SPELLS.has(t):
			return "Spell %s is not ported yet (NFR-8 fail-closed)." % t
		var arg = def.get("damage" if t == "Attack" else "steps")
		if not (arg is float or arg is int):
			return "Spell %s has a non-numeric argument." % t
		for i in count:
			out.append(def)
	return out

static func _num(v) -> bool:
	return v is float or v is int

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

## FR-17 default T tile: 3×3 interior dark (elemental), the 4 hatches light (toll).
static func toll_tile() -> Array:
	var tile := default_tile()
	for y in range(1, ROOM_SIZE - 1):
		for x in range(1, ROOM_SIZE - 1):
			if tile[y][x] != "wall":
				tile[y][x] = "dark"
	tile[0][2] = "light"
	tile[ROOM_SIZE - 1][2] = "light"
	tile[2][0] = "light"
	tile[2][ROOM_SIZE - 1] = "light"
	return tile

static func base_tile(def: Dictionary) -> Array:
	match String(def.get("type", "")):
		"E": return elemental_tile()
		"T": return toll_tile()
	return default_tile()

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
				if (kind == "green" and room["def"]["type"] == "E") or (kind == "dark" and room["def"]["type"] == "T"):
					element = String(room["def"]["element"])
				var toll = null   # light T cells: gold needed to cross (FR-17)
				if kind == "light" and room["def"]["type"] == "T":
					toll = int(room["def"]["cost"])
				cells[_key(w)] = {"world": w, "roomId": room["id"], "roomType": room["def"]["type"], "kind": kind, "element": element, "toll": toll}
	return cells

# ---------------------------------------------------------------- elements (FR-14)

## FR-21 / FR-14: only an Elf lists immunities (valid element names only).
static func hero_immunities(def: Dictionary) -> Array:
	if def.get("type", "") != "Elf":
		return []
	return (def.get("immunities", []) as Array).filter(func(e): return SUPPORTED_ELEMENTS.has(e))

## elements.ts elementalTick: immune -> ignored; fire -1; water dies; ice 0
## (movement only); poison +1 on a cell's first visit, -3 after.
static func elemental_tick(element: String, immunities: Array, poison_visited: bool) -> Dictionary:
	if element == "" or immunities.has(element):
		return {"hpDelta": 0, "die": false, "recordPoisonVisit": false, "ignored": true}
	match element:
		"fire": return {"hpDelta": -1, "die": false, "recordPoisonVisit": false, "ignored": false}
		"water": return {"hpDelta": 0, "die": true, "recordPoisonVisit": false, "ignored": false}
		"ice": return {"hpDelta": 0, "die": false, "recordPoisonVisit": false, "ignored": false}
		"poison": return {"hpDelta": -3 if poison_visited else 1, "die": false, "recordPoisonVisit": true, "ignored": false}
	return {"hpDelta": 0, "die": false, "recordPoisonVisit": false, "ignored": true}

## Water (unless immune) and a light cell the hero can't pay for are not
## voluntary steps (pathing.ts isPassable, FR-14 / FR-17).
static func _passable(grid: Dictionary, pos: Vector2i, immunities: Array = [], gold: int = 0) -> bool:
	var cell = grid.get(_key(pos))
	if cell == null or cell["kind"] == "wall":
		return false
	if cell["element"] == "water" and not immunities.has("water"):
		return false
	if cell["toll"] != null and gold < int(cell["toll"]):
		return false
	return true

static func _open(grid: Dictionary, pos: Vector2i) -> bool:
	var cell = grid.get(_key(pos))
	return cell != null and cell["kind"] != "wall"

## pathing.ts resolveStep: the first cell must be passable; entering ice
## (not immune) slides on until a wall or a missing cell, stopping in Z.
## The slide may land on water or an unpaid light cell (the simulator then
## kills the hero); only the first cell is checked against the gold in hand.
static func resolve_step(grid: Dictionary, from: Vector2i, dir: String, immunities: Array = [], gold: int = 0) -> Array:
	var first: Vector2i = from + DELTA[dir]
	if not _passable(grid, first, immunities, gold):
		return []
	var path: Array = [first]
	var fc: Dictionary = grid[_key(first)]
	if fc["element"] != "ice" or immunities.has("ice"):
		return path
	if fc["roomType"] == "Z":
		return path
	var cur := first
	while true:
		var nxt: Vector2i = cur + DELTA[dir]
		var cell = grid.get(_key(nxt))
		if cell == null or cell["kind"] == "wall":
			break
		path.append(nxt)
		if cell["roomType"] == "Z":
			break
		cur = nxt
	return path

static func _room_at(grid: Dictionary, pos: Vector2i) -> Variant:
	var cell = grid.get(_key(pos))
	return null if cell == null else cell["roomId"]

static func distance_to_rooms(rooms: Array, grid: Dictionary, targets: Array, immunities: Array = [], gold: int = 0) -> Dictionary:
	var incoming := {}
	for cell in grid.values():
		if not _passable(grid, cell["world"], immunities, gold):
			continue
		for d in BASE_TIE:
			var path := resolve_step(grid, cell["world"], d, immunities, gold)
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
				if not _open(grid, w):
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

static func reachable_room_ids(grid: Dictionary, from: Vector2i, immunities: Array = [], gold: int = 0) -> Dictionary:
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
		if not _passable(grid, cur, immunities, gold) and head > 1:
			continue
		for d in BASE_TIE:
			var path := resolve_step(grid, cur, d, immunities, gold)
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

static func choose_warrior_step(grid: Dictionary, dist: Dictionary, from: Vector2i, orientation: int, targets: Array, immunities: Array = [], gold: int = 0) -> Variant:
	if not dist.has(_key(from)):
		return null
	var here: int = dist[_key(from)]
	for d in oriented_tie_break(orientation):
		var path := resolve_step(grid, from, d, immunities, gold)
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

# ---------------------------------------------------------------- gold in planning (FR-16, FR-17)

## gold.ts pilesKey: "id:amount" for non-empty piles, sorted by room id.
static func piles_key(piles: Dictionary) -> String:
	var ids: Array = []
	for id in piles.keys():
		if int(piles[id]) > 0:
			ids.append(String(id))
	ids.sort()
	var parts: Array = []
	for id in ids:
		parts.append("%s:%d" % [id, int(piles[id])])
	return ";".join(parts)

static func _parse_piles(key: String) -> Dictionary:
	var out := {}
	if key == "":
		return out
	for part in key.split(";"):
		var at := part.rfind(":")
		if at <= 0:
			continue
		var amount := int(part.substr(at + 1))
		if amount > 0:
			out[part.substr(0, at)] = amount
	return out

## pathing.ts shouldUseEconomy: gold in hand, gold on the map, or any O/T room.
static func _use_economy(rooms: Array, gold: int, piles: Dictionary) -> bool:
	if gold > 0:
		return true
	for v in piles.values():
		if int(v) > 0:
			return true
	return rooms.any(func(r): return r["def"]["type"] == "T" or r["def"]["type"] == "O")

## pathing.ts applyPlannedEconomy: entering a room takes its pile; a light
## cell is paid when the plan has the gold (an unpaid one later in a slide is
## planned through, as with D, FR-28).
static func _plan_gold(grid: Dictionary, cell: Vector2i, room_id: String, gold: int, piles: Dictionary, targets: Array) -> Dictionary:
	var next_room = _room_at(grid, cell)
	if next_room == null:
		return {"invalid": true}
	var reached := false
	var piles_now := piles
	if next_room != room_id:
		if targets.has(next_room):
			reached = true
		var pile := int(piles.get(next_room, 0))
		if pile > 0:
			gold += pile
			piles_now = piles.duplicate()
			piles_now[next_room] = 0
	var toll = grid[_key(cell)]["toll"]
	if toll != null and gold >= int(toll):
		gold -= int(toll)
	return {"invalid": false, "gold": gold, "roomId": next_room, "piles": piles_now, "reached": reached}

## pathing.ts chooseWarriorEconomy: BFS over (cell, room, gold, piles) for
## the shortest way into a target room, so a pickup can open a later toll.
## Ignores HP (FR-28) and portals, as the TS engine does.
static func _choose_warrior_economy(grid: Dictionary, from: Vector2i, room_id: String, orientation: int,
		immunities: Array, gold: int, piles: Dictionary, targets: Array) -> Variant:
	var dirs := oriented_tie_break(orientation)
	var start := {"cell": from, "roomId": room_id, "gold": gold, "piles": piles_key(piles), "length": 0, "firstDir": null}
	var seen := {"%s|%s|%d|%s" % [_key(from), room_id, gold, start["piles"]]: true}
	var queue: Array = [start]
	var max_length := maxi(8, _passable_count(grid) * 4)
	var head := 0
	while head < queue.size():
		var cur: Dictionary = queue[head]
		head += 1
		if cur["length"] >= max_length:
			continue
		for d in dirs:
			var path := resolve_step(grid, cur["cell"], d, immunities, cur["gold"])
			if path.is_empty():
				continue
			var gold_now: int = cur["gold"]
			var room_now: String = cur["roomId"]
			var piles_now := _parse_piles(cur["piles"])
			var reached := false
			var invalid := false
			var last: Vector2i = path[path.size() - 1]
			for cell in path:
				var r := _plan_gold(grid, cell, room_now, gold_now, piles_now, targets)
				if r["invalid"]:
					invalid = true
					break
				gold_now = r["gold"]
				room_now = r["roomId"]
				piles_now = r["piles"]
				last = cell
				if r["reached"]:
					reached = true
					break
			if invalid:
				continue
			var first_dir = d if cur["firstDir"] == null else cur["firstDir"]
			if reached:
				return first_dir
			var pk := piles_key(piles_now)
			var nk := "%s|%s|%d|%s" % [_key(last), room_now, gold_now, pk]
			if seen.has(nk):
				continue
			seen[nk] = true
			queue.append({"cell": last, "roomId": room_now, "gold": gold_now, "piles": pk, "length": cur["length"] + 1, "firstDir": first_dir})
	return null

static func _passable_count(grid: Dictionary) -> int:
	var n := 0
	for c in grid.values():
		if c["kind"] != "wall":
			n += 1
	return n

# ---------------------------------------------------------------- Elf (FR-21)

static func _elf_better(a: Dictionary, b: Dictionary) -> bool:
	if a["hp"] != b["hp"]:
		return a["hp"] > b["hp"]
	if a["length"] != b["length"]:
		return a["length"] < b["length"]
	return false

static func _poison_key(visits: Dictionary) -> String:
	var keys: Array = visits.keys()
	keys.sort()
	return ";".join(keys)

static func _parse_poison(key: String) -> Dictionary:
	var out := {}
	if key == "":
		return out
	for k in key.split(";", false):
		out[k] = true
	return out

## elf.ts chooseElfStep: BFS over (cell, room, poison memory); keep the state
## with more HP (then fewer actions); the winner is the best state that
## reaches a target room, and its first direction is the step. Planning
## ignores death (FR-28). Gold is map knowledge: entering a room takes its
## pile, a light cell is paid, and a plan that can't pay a light cell is
## dropped (FR-16, FR-17). The state key includes gold and piles.
static func choose_elf_step(rooms: Array, grid: Dictionary, from: Vector2i, hp: int, room_id: String,
		poison_visits: Dictionary, immunities: Array, orientation: int, targets: Array,
		gold: int = 0, piles: Dictionary = {}) -> Variant:
	if targets.has(room_id):
		return null
	var dirs := oriented_tie_break(orientation)
	var start := {"cell": from, "roomId": room_id, "hp": hp, "poison": _poison_key(poison_visits),
		"gold": gold, "piles": piles_key(piles), "length": 0, "firstDir": null}
	var best := {}
	best[_elf_key(start)] = start
	var queue: Array = [start]
	var winner = null
	var max_length := maxi(8, _passable_count(grid) * 4)
	var head := 0
	while head < queue.size():
		var cur: Dictionary = queue[head]
		head += 1
		if cur["length"] >= max_length:
			continue
		var known = best.get(_elf_key(cur))
		if known != null and _elf_better(known, cur):
			continue
		for d in dirs:
			var path := resolve_step(grid, cur["cell"], d, immunities, cur["gold"])
			if path.is_empty():
				continue
			var hp_now: int = cur["hp"]
			var room_now: String = cur["roomId"]
			var poison_now := _parse_poison(cur["poison"])
			var gold_now: int = cur["gold"]
			var piles_now := _parse_piles(cur["piles"])
			var reached := false
			var invalid := false
			var last: Vector2i = path[path.size() - 1]
			for cell in path:
				var walk: Dictionary = grid[_key(cell)]
				var next_room: String = walk["roomId"]
				if next_room != room_now:
					if targets.has(next_room):
						reached = true
					if walk["roomType"] == "D":
						hp_now -= int(_room_def_in(rooms, next_room)["damage"])
					var pile := int(piles_now.get(next_room, 0))
					if pile > 0:
						gold_now += pile
						piles_now = piles_now.duplicate()
						piles_now[next_room] = 0
				if walk["toll"] != null:
					if gold_now < int(walk["toll"]):
						invalid = true   # elf.ts: an unpaid light cell is not a route
						break
					gold_now -= int(walk["toll"])
				var el: String = walk["element"]
				var tick := elemental_tick(el, immunities, el == "poison" and poison_now.has(_key(cell)))
				hp_now += int(tick["hpDelta"])
				if tick["recordPoisonVisit"]:
					poison_now = poison_now.duplicate()
					poison_now[_key(cell)] = true
				room_now = next_room
				last = cell
				if reached:
					break
			if invalid:
				continue
			var nxt := {"cell": last, "roomId": room_now, "hp": hp_now, "poison": _poison_key(poison_now),
				"gold": gold_now, "piles": piles_key(piles_now),
				"length": cur["length"] + 1, "firstDir": d if cur["firstDir"] == null else cur["firstDir"]}
			if reached:
				if winner == null or _elf_better(nxt, winner):
					winner = nxt
				continue
			var nk := _elf_key(nxt)
			var prev = best.get(nk)
			if prev == null or _elf_better(nxt, prev):
				best[nk] = nxt
				queue.append(nxt)
	return null if winner == null else winner["firstDir"]

static func _elf_key(st: Dictionary) -> String:
	return "%s|%s|%s|%d|%s" % [_key(st["cell"]), st["roomId"], st["poison"], st["gold"], st["piles"]]

static func _room_def_in(rooms: Array, id: String) -> Dictionary:
	for r in rooms:
		if r["id"] == id:
			return r["def"]
	return {}

# ---------------------------------------------------------------- simulation (FR-11–FR-13, FR-26–FR-31)

## Returns a run state, or {error} when FR-8 blocks extermination.
static func create_run(loaded: Dictionary, rooms: Array) -> Dictionary:
	var report := validate_layout(loaded["supplied"], rooms)
	if not report["ok"]:
		return {"error": "FR-8: cannot start extermination until FR-5–FR-7 hold.", "report": report}
	var heroes: Array = []
	var i := 0
	for h in loaded["level"]["heroes"]:
		heroes.append({"id": i, "type": h["type"], "immunities": hero_immunities(h), "hp": int(h["hp"]), "visits": [],
			"gold": [], "portalEntries": {},
			"spawned": false, "dead": false, "stuck": false, "cell": null, "roomId": null})
		i += 1
	var main_a := ""
	var orientation := 0
	for r in rooms:
		if r["def"]["type"] == "A":
			main_a = r["id"]
			orientation = int(r["orientation"])
			break
	# gold.ts initialRoomGold: only authored O(x) rooms start with a pile.
	var room_gold := {}
	for r in rooms:
		if r["def"]["type"] == "O":
			room_gold[r["id"]] = int(r["def"]["gold"])
	return {"rooms": rooms.duplicate(true), "heroes": heroes, "mainAId": main_a, "orientation": orientation,
		"outcome": "in_progress", "stepCount": 0, "events": [], "poisonVisits": {}, "roomGold": room_gold,
		"spells": loaded.get("spells", []).map(func(d): return {"def": d, "consumed": false})}

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
		# FR-16: the purse stays in the room where the hero died (an O pile on top).
		var purse: Array = hero["gold"]
		if hero["roomId"] != null and not purse.is_empty():
			var room_gold: Dictionary = state["roomGold"]
			room_gold[hero["roomId"]] = int(room_gold.get(hero["roomId"], 0)) + purse.size()
			events.append({"type": "gold_drop", "heroId": hero["id"], "roomId": hero["roomId"], "amount": purse.size()})
			purse.clear()
		events.append({"type": "death", "heroId": hero["id"]})
		if state["heroes"].all(func(h): return h["dead"]):
			state["outcome"] = "win"
			events.append({"type": "win"})

## simulation.ts enterRoom. Returns true when a portal moved the hero (a
## teleport or the waiting room), which ends the rest of the step.
static func _enter_room(state: Dictionary, hero: Dictionary, room_id: String, first_cell: Vector2i, events: Array, grid: Dictionary) -> bool:
	var prior: Array = (hero["visits"] as Array).duplicate()
	hero["visits"].append({"roomId": room_id, "firstCell": first_cell})   # FR-15 / FR-35 history
	hero["roomId"] = room_id
	return _apply_entry(state, hero, room_id, events, prior, grid, 0)

## simulation.ts applyEntry: the gold pickup comes first (FR-16), then A / Z
## / D, then death, then the portal (FR-15). `prior` is the visit history
## before this entry (the entry itself is never a destination).
static func _apply_entry(state: Dictionary, hero: Dictionary, room_id: String, events: Array, prior: Array, grid: Dictionary, depth: int) -> bool:
	var def := _room_def(state, room_id)
	events.append({"type": "enter", "heroId": hero["id"], "roomId": room_id, "roomType": def["type"]})
	var room_gold: Dictionary = state["roomGold"]
	var pile := int(room_gold.get(room_id, 0))
	if pile > 0:
		for i in pile:
			hero["gold"].append(room_id)   # FIFO purse: each coin remembers its source room
		room_gold[room_id] = 0
		events.append({"type": "pickup", "heroId": hero["id"], "roomId": room_id, "amount": pile, "gold": hero["gold"].size()})
	if def["type"] == "A":
		state["mainAId"] = room_id
	if def["type"] == "Z":
		state["outcome"] = "loss"
		events.append({"type": "loss", "heroId": hero["id"]})
		return false
	if def["type"] == "D":
		var amount := int(def["damage"])
		hero["hp"] -= amount
		events.append({"type": "damage", "heroId": hero["id"], "amount": amount, "hp": hero["hp"]})
	_check_death(state, hero, events)
	if state["outcome"] != "in_progress" or hero["dead"]:
		return false
	if def["type"] == "P":
		return _apply_portal(state, hero, room_id, def, events, prior, grid, depth)
	return false

## portals.ts evalPortalIndex: "1", "i", "x↦7x-6", "i->i-1" ... as [a, b]
## for a·i + b; [] when the formula is not one of those forms.
static func portal_formula(formula: String) -> Array:
	var t := formula.strip_edges()
	if t == "":
		return []
	var parts := RegEx.create_from_string("\\s*(?:↦|->|=>)\\s*").sub(t, "\u0001", true).split("\u0001")
	var expr := (parts[1] if parts.size() == 2 else parts[0]).strip_edges()
	var token := RegEx.create_from_string("[xnXN]").sub(RegEx.create_from_string("\\s+").sub(expr, "", true), "i", true)
	if RegEx.create_from_string("^-?\\d+$").search(token) != null:
		return [0, int(token)]
	var m := RegEx.create_from_string("^(-?\\d*)\\*?i([+-]\\d+)?$").search(token)
	if m == null:
		return []
	var a_tok := m.get_string(1)
	var a := 1 if a_tok == "" else (-1 if a_tok == "-" else int(a_tok))
	var b := int(m.get_string(2)) if m.get_start(2) >= 0 else 0
	return [a, b]

## FR-15: the i-th entry (i ≤ n) teleports to the first cell of the f(i)-th
## most recent earlier visit; too short a history means the waiting room.
## The landing cell's element and toll apply (an unpaid toll there kills).
static func _apply_portal(state: Dictionary, hero: Dictionary, room_id: String, def: Dictionary, events: Array,
		prior: Array, grid: Dictionary, depth: int) -> bool:
	var n := int(def["entries"])
	var entries: Dictionary = hero["portalEntries"]
	var i := int(entries.get(room_id, 0)) + 1
	entries[room_id] = i
	if i < 1 or i > n:
		return false
	var f := portal_formula(String(def["formula"]))
	var k: int = int(f[0]) * i + int(f[1])
	if k < 1 or k > prior.size():
		hero["spawned"] = false
		hero["stuck"] = false
		hero["cell"] = null
		hero["roomId"] = null
		events.append({"type": "wait_room", "heroId": hero["id"]})
		return true
	var dest: Dictionary = prior[prior.size() - k]
	hero["cell"] = dest["firstCell"]
	events.append({"type": "teleport", "heroId": hero["id"], "fromRoomId": room_id, "toRoomId": dest["roomId"], "to": _cell(dest["firstCell"])})
	if depth >= 8:
		push_error("FR-15: portal teleport chain exceeded 8 hops.")
		state["outcome"] = "error"
		return true
	if dest["roomId"] != room_id:
		var next_prior: Array = (hero["visits"] as Array).duplicate()
		hero["visits"].append({"roomId": dest["roomId"], "firstCell": dest["firstCell"]})
		hero["roomId"] = dest["roomId"]
		_apply_entry(state, hero, dest["roomId"], events, next_prior, grid, depth + 1)
	if state["outcome"] == "in_progress" and hero["spawned"] and not hero["dead"] and hero["cell"] != null:
		_apply_elemental_cell(state, hero, hero["cell"], grid, events)
		if state["outcome"] == "in_progress" and not hero["dead"]:
			_apply_toll_cell(state, hero, hero["cell"], grid, events, true)
	return true

## gold.ts payToll: take the oldest `cost` coins (FIFO) and put each back in
## its source room. Returns {paid, refunds} or null when the purse is short.
static func pay_toll(piles: Dictionary, purse: Array, cost: int) -> Variant:
	if cost <= 0:
		return {"paid": 0, "refunds": []}
	if purse.size() < cost:
		return null
	var counts := {}
	for i in cost:
		var src: String = purse.pop_front()
		counts[src] = int(counts.get(src, 0)) + 1
	var refunds: Array = []
	for src in counts:
		piles[src] = int(piles.get(src, 0)) + int(counts[src])
		refunds.append({"roomId": src, "amount": counts[src]})
	return {"paid": cost, "refunds": refunds}

## portals.ts evalPortalIndex for entry i, or null for an unsupported formula.
static func portal_index(formula: String, i: int) -> Variant:
	var f := portal_formula(formula)
	return null if f.is_empty() else int(f[0]) * i + int(f[1])

## FR-17 (simulation.ts applyTollCell): a light cell takes the oldest coins
## first and refunds each to its source room. A hero who can't pay only
## gets here by force (a slide, a portal), and dies.
static func _apply_toll_cell(state: Dictionary, hero: Dictionary, cell: Vector2i, grid: Dictionary, events: Array, forced: bool) -> void:
	var walk = grid.get(_key(cell))
	if walk == null or walk["toll"] == null or int(walk["toll"]) <= 0:
		return
	var purse: Array = hero["gold"]
	var paid = pay_toll(state["roomGold"], purse, int(walk["toll"]))
	if paid != null:
		events.append({"type": "toll", "heroId": hero["id"], "amount": paid["paid"], "gold": purse.size(), "refunds": paid["refunds"]})
		return
	if forced:
		hero["hp"] = 0
		_check_death(state, hero, events)

## FR-14 (simulation.ts applyElementalCell): immune heroes ignore the cell;
## a damage event carries -hpDelta (poison's first visit is a -1 "damage",
## i.e. +1 HP); water sets HP to 0 with no damage event.
static func _apply_elemental_cell(state: Dictionary, hero: Dictionary, cell: Vector2i, grid: Dictionary, events: Array) -> void:
	var walk = grid.get(_key(cell))
	if walk == null or walk["element"] == "":
		return
	var k := _key(cell)
	var tick := elemental_tick(walk["element"], hero["immunities"], state["poisonVisits"].has(k))
	if tick["ignored"]:
		return
	if tick["recordPoisonVisit"]:
		state["poisonVisits"][k] = true
	if tick["hpDelta"] != 0:
		var amount: int = -int(tick["hpDelta"])
		hero["hp"] -= amount
		events.append({"type": "damage", "heroId": hero["id"], "amount": amount, "hp": hero["hp"]})
	if tick["die"]:
		hero["hp"] = 0
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
		_enter_room(state, hero, spawn["id"], cell, events, grid)
		_apply_elemental_cell(state, hero, cell, grid, events)
		_apply_toll_cell(state, hero, cell, grid, events, false)
		state["events"].append_array(events)
		return events
	var imm: Array = hero["immunities"]
	var gold: int = hero["gold"].size()
	var reachable := reachable_room_ids(grid, hero["cell"], imm, gold)
	var targets := highest_weight_room_ids(state["rooms"], reachable)
	var dir = null
	if not targets.is_empty():
		if hero["type"] == "Elf":
			dir = choose_elf_step(state["rooms"], grid, hero["cell"], hero["hp"], hero["roomId"],
				state["poisonVisits"], imm, state["orientation"], targets, gold, state["roomGold"])
		elif _use_economy(state["rooms"], gold, state["roomGold"]):
			dir = _choose_warrior_economy(grid, hero["cell"], hero["roomId"], state["orientation"], imm, gold, state["roomGold"], targets)
		else:
			var dist := distance_to_rooms(state["rooms"], grid, targets, imm, gold)
			dir = choose_warrior_step(grid, dist, hero["cell"], state["orientation"], targets, imm, gold)
	var path: Array = [] if dir == null else resolve_step(grid, hero["cell"], dir, imm, gold)
	if path.is_empty():
		hero["stuck"] = true
		events.append({"type": "wait", "heroId": hero["id"]})
		_maybe_settle(state, events)
		state["events"].append_array(events)
		return events
	hero["stuck"] = false
	for index in path.size():
		var to: Vector2i = path[index]
		var from: Vector2i = hero["cell"]
		hero["cell"] = to
		events.append({"type": "move", "heroId": hero["id"], "from": _cell(from), "to": _cell(to), "dir": dir})
		var next_room = _room_at(grid, to)
		var teleported := false
		if next_room != hero["roomId"]:
			teleported = _enter_room(state, hero, next_room, to, events, grid)
		if teleported or state["outcome"] != "in_progress" or hero["dead"] or not hero["spawned"]:
			break
		_apply_elemental_cell(state, hero, to, grid, events)
		if state["outcome"] != "in_progress" or hero["dead"] or not hero["spawned"]:
			break
		# A chosen first step always pays; a light cell reached mid-slide is forced.
		_apply_toll_cell(state, hero, to, grid, events, index > 0)
		if state["outcome"] != "in_progress" or hero["dead"] or not hero["spawned"]:
			break
	state["events"].append_array(events)
	return events

# ---------------------------------------------------------------- spells (FR-32–FR-35)

## FR-33 (simulation.ts canCastNow): only between completed actions, after
## the first one, while the run is going and some hero is active. step_run
## is synchronous, so there is never a mid-action moment to cast in.
static func can_cast_now(state: Dictionary) -> bool:
	return state["outcome"] == "in_progress" and state["stepCount"] > 0 and select_active_hero(state["heroes"]) != null

## castSpell for Attack(x) and Teleport(n). Returns {ok, events, error}; the
## error codes are the ones godot-golden.mjs derives from the TS messages.
## A refused cast changes nothing and consumes nothing.
static func cast_spell(state: Dictionary, spell_id: int) -> Dictionary:
	if state["outcome"] != "in_progress":
		return _refuse("run_over")
	if state["stepCount"] <= 0:
		return _refuse("before_first_action")
	var active = select_active_hero(state["heroes"])
	if active == null:
		return _refuse("no_active_hero")
	var spells: Array = state["spells"]
	if spell_id < 0 or spell_id >= spells.size():
		return _refuse("no_spell")
	var spell: Dictionary = spells[spell_id]
	if spell["consumed"]:
		return _refuse("consumed")
	var events: Array = []
	match String(spell["def"]["type"]):
		"Attack":
			# FR-34: x damage to every living hero (spawned or still waiting).
			var living: Array = state["heroes"].filter(func(h): return not h["dead"])
			events.append({"type": "cast", "spellId": spell_id, "spellType": "Attack", "heroIds": living.map(func(h): return h["id"])})
			var damage := int(spell["def"]["damage"])
			for hero in living:
				if hero["dead"]:
					continue
				hero["hp"] -= damage
				events.append({"type": "damage", "heroId": hero["id"], "amount": damage, "hp": hero["hp"]})
				_check_death(state, hero, events)
				if state["outcome"] != "in_progress":
					break
		"Teleport":
			events.append({"type": "cast", "spellId": spell_id, "spellType": "Teleport", "heroIds": [active["id"]]})
			_teleport(state, active, int(spell["def"]["steps"]), events)
	spell["consumed"] = true
	_maybe_settle(state, events)
	state["events"].append_array(events)
	return {"ok": true, "events": events, "error": ""}

static func _refuse(code: String) -> Dictionary:
	return {"ok": false, "events": [], "error": code}

## FR-35: to the first cell of the n-th most recent room visit (n = 1 is
## the current room). No room effect fires. Too short a history sends the
## hero back to the waiting room; it spawns again on its next action.
static func _teleport(state: Dictionary, hero: Dictionary, n: int, events: Array) -> void:
	var from_room: String = "" if hero["roomId"] == null else hero["roomId"]
	var visits: Array = hero["visits"]
	if n < 1 or n > visits.size():
		hero["spawned"] = false
		hero["stuck"] = false
		hero["cell"] = null
		hero["roomId"] = null
		events.append({"type": "wait_room", "heroId": hero["id"]})
		return
	var dest: Dictionary = visits[visits.size() - n]
	hero["spawned"] = true
	hero["stuck"] = false
	hero["cell"] = dest["firstCell"]
	hero["roomId"] = dest["roomId"]
	if _room_def(state, dest["roomId"])["type"] == "A":
		state["mainAId"] = dest["roomId"]
	events.append({"type": "teleport", "heroId": hero["id"], "fromRoomId": from_room, "toRoomId": dest["roomId"], "to": _cell(dest["firstCell"])})

## Same loop as packages/engine/scripts/godot-golden.mjs runTurns(): after
## each action, the scripted casts for that step count are tried in order.
## A cast is its own turn (its first event is "cast"). Returns
## {turns, castLog, castWindow}.
static func run_turns(state: Dictionary, casts: Array = [], max_steps: int = 10000) -> Dictionary:
	var turns: Array = []
	var log: Array = []
	var window: Array = [can_cast_now(state)]
	for c in casts:
		if c["afterSteps"] == 0:
			log.append(_try_cast(state, c, turns, window))
	while state["outcome"] == "in_progress" and state["stepCount"] < max_steps:
		var before: int = state["stepCount"]
		var ev := step_run(state)
		if not ev.is_empty():
			turns.append(ev)
			window.append(can_cast_now(state))
		var due := 0
		if state["stepCount"] > before:
			for c in casts:
				if int(c["afterSteps"]) == state["stepCount"]:
					due += 1
					log.append(_try_cast(state, c, turns, window))
		if due > 0:
			continue
		if ev.is_empty():
			break
	if state["outcome"] == "in_progress":
		state["outcome"] = "stalemate"
		turns.append([{"type": "stalemate"}])
		window.append(false)
	return {"turns": turns, "castLog": log, "castWindow": window}

static func _try_cast(state: Dictionary, c: Dictionary, turns: Array, window: Array) -> Dictionary:
	var r := cast_spell(state, int(c["spellId"]))
	if r["ok"]:
		turns.append(r["events"])
		window.append(can_cast_now(state))
	return {"afterSteps": c["afterSteps"], "spellId": c["spellId"], "result": "ok" if r["ok"] else r["error"]}

# ---------------------------------------------------------------- scoring (FR-10, FR-43)

static func _normalize(expr: String) -> String:
	var re := RegEx.create_from_string("\\s+")
	var s := re.sub(expr.replace("≠", "!="), " ", true)
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
	return _manhattan(a, b)

static func _manhattan(a: Dictionary, b: Dictionary) -> int:
	return absi(int(a["x"]) - int(b["x"])) + absi(int(a["y"]) - int(b["y"]))

## Only `dist(r, s) <op> n | dist(...)` is grounded; any other prose is
## "unsupported" and refuses a win, as in constraints.ts.
static func evaluate_constraint(rooms: Array, expression: String, state: Dictionary = {}, hero_defs: Array = []) -> Dictionary:
	var n := _normalize(expression)
	# "No hero may reach strictly negative HP" (constraints.ts hp_floor).
	if RegEx.create_from_string("(?i)^(?:aucun héros|le héros) ne peut(?: pas)? atteindre un nombre de points de vie strictement négatif$").search(n) != null:
		if state.is_empty():
			return {"kind": "hp_floor", "status": "unsupported"}
		for h in state["heroes"]:
			var low := int(hero_defs[h["id"]]["hp"])
			for e in state["events"]:
				if e["type"] == "damage" and e["heroId"] == h["id"]:
					low = mini(low, int(e["hp"]))
			if low < 0:
				return {"kind": "hp_floor", "status": "failed"}
		return {"kind": "hp_floor", "status": "held"}
	var also := RegEx.create_from_string("(?i)^on doit également avoir\\s+(.+)$").search(n)
	if also != null:
		n = also.get_string(1)
	# "∃s ∈ Π, dist(s, A) = dist(s, Z) = n": some placed room sits n from both.
	var adj := RegEx.create_from_string("(?i)^(?:∃|exists)\\s*s\\s*∈\\s*Π\\s*,\\s*dist\\(\\s*s\\s*,\\s*A\\s*\\)\\s*=\\s*dist\\(\\s*s\\s*,\\s*Z\\s*\\)\\s*=\\s*(\\d+)$").search(n)
	if adj != null:
		var need := int(adj.get_string(1))
		var a = _unique_room(rooms, {"type": "A"})
		var z = _unique_room(rooms, {"type": "Z"})
		if a == null or z == null:
			return {"kind": "distance", "status": "unsupported"}
		var held := rooms.any(func(r): return _manhattan(r, a) == need and _manhattan(r, z) == need)
		return {"kind": "distance", "status": "held" if held else "failed"}
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
		var ev := evaluate_constraint(state["rooms"], c["expression"], state, loaded["level"]["heroes"])
		constraints.append({"id": c["id"], "kind": ev["kind"], "status": ev["status"]})
	var outcome := "win"
	if state["outcome"] == "loss":
		outcome = "loss"
	elif not state["heroes"].all(func(h): return h["dead"]):
		outcome = "unresolved"
	elif constraints.any(func(c): return c["status"] != "held"):
		outcome = "unresolved"
	return {"outcome": outcome, "constraints": constraints}
