class_name ZorgHelp
extends RefCounted
## Round 11: the "?" room legend and the first-run hint. Every legend line
## is GAME_SPEC.md wording (Rooms table), only made ASCII for the web
## font (<= for the less-or-equal sign, - for the minus sign); the smoke
## test checks each line against GAME_SPEC.md so no number is invented.

const HINT_KEY := ["ui", "hint_seen"]

## [title, swatch def, GAME_SPEC wording]
const ROOMS := [
	["A", {"type": "A"}, "Spawn room. Heroes appear here."],
	["Z", {"type": "Z"}, "Zorg's room. A hero entering it ends the level in an instant loss."],
	["D(x)", {"type": "D"}, "Deals x damage on every entry. Negative x heals."],
	["T(x, elem)", {"type": "T"}, "Dark cells behave like `E(elem)`. Light cells charge the first x gold a hero has collected (FIFO, refunded to its source rooms) to cross; can't-pay heroes can't pass, and one shoved onto an unpayable cell dies instantly."],
	["P(n, f)", {"type": "P"}, "On a hero's i-th entry (i <= n), teleports them to the first cell of their f(i)-th-most-recent room visit. If f(i) overshoots their history, they return to the waiting room and respawn."],
	["O(x)", {"type": "O"}, "First hero to enter takes all x gold. If that hero later dies, the gold attaches to the death room (which becomes an `O` room too). Pickup pre-empts any other effect of entering."],
]
const ELEMENTS_INTRO := "Green cells act per element"
const ELEMENTS := [
	["fire", {"type": "E", "element": "fire"}, "fire deals 1 dmg/entry"],
	["water", {"type": "E", "element": "water"}, "water is impassable and kills a non-immune hero who ends up on it"],
	["ice", {"type": "E", "element": "ice"}, "ice forces sliding until a wall stops the hero"],
	["poison", {"type": "E", "element": "poison"}, "poison gives +1 HP on a cell's first visit, -3 HP every visit after"],
]
const ELEMENTS_OUTRO := "Immune heroes ignore the cell entirely."

## Every wording above, for the GAME_SPEC check.
static func spec_phrases() -> Array:
	var out: Array = [ELEMENTS_INTRO, ELEMENTS_OUTRO]
	for r in ROOMS + ELEMENTS:
		out.append(r[2])
	return out

## GAME_SPEC text made ASCII the same way as the legend.
static func ascii(s: String) -> String:
	return s.replace("≤", "<=").replace("−", "-")

static func display(s: String) -> String:
	return s.replace("`", "")

static func hint_seen(path: String) -> bool:
	var cfg := ConfigFile.new()
	return cfg.load(path) == OK and bool(cfg.get_value(HINT_KEY[0], HINT_KEY[1], false))

static func set_hint_seen(path: String, seen: bool) -> void:
	var cfg := ConfigFile.new()
	cfg.load(path)
	cfg.set_value(HINT_KEY[0], HINT_KEY[1], seen)
	cfg.save(path)

static func _row(parent: Control, name: String, def: Dictionary, text: String, width: float) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var icon := TextureRect.new()
	icon.texture = ZorgHud.swatch(def)
	icon.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	icon.custom_minimum_size = Vector2(22, 24)
	icon.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(icon)
	var key := Label.new()
	key.text = name
	key.custom_minimum_size.x = 96
	key.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45))
	key.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(key)
	var body := Label.new()
	body.text = display(text)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD
	body.custom_minimum_size.x = width
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(body)

## Legend rows (rooms, then element floors) into `box`.
static func fill(box: VBoxContainer, width: float) -> void:
	for c in box.get_children():
		c.queue_free()
	for r in ROOMS:
		_row(box, r[0], r[1], r[2], width)
	var e := Label.new()
	e.text = "E(elem) - element floors. " + ELEMENTS_INTRO + ":"
	e.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45))
	box.add_child(e)
	for r in ELEMENTS:
		_row(box, r[0], r[1], r[2][0].to_upper() + r[2].substr(1) + ".", width)
	var o := Label.new()
	o.text = ELEMENTS_OUTRO
	box.add_child(o)
