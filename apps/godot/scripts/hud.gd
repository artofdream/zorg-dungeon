class_name ZorgHud
extends RefCounted
## Round 7 HUD helpers: one theme for every control, DPI-aware UI scale,
## safe-area margins and room colour swatches for the tray. Visual only.

const TARGET := 52.0      # min button height in UI units (>= 48 dp once scaled)
const FONT := 18          # body text in UI units (>= 16 dp once scaled)

## UI units -> dp: aim for 1 UI unit = 1 dp on phones. Desktop and desktop
## web (low DPI) stay at the 1280x720 layout (factor 1). `--ui-scale=X`
## after `--` on the command line overrides it, for testing.
static func ui_scale(win: Window) -> float:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--ui-scale="):
			return clampf(float(a.substr(11)), 0.5, 4.0)
	if DisplayServer.get_name() == "headless" or win.size.y < 240:
		return 1.0
	var dpi := float(DisplayServer.screen_get_dpi())
	var px_per_unit := float(win.size.y) / 720.0   # what canvas_items stretch gives
	if dpi <= 0.0 or px_per_unit <= 0.0:
		return 1.0
	return clampf((dpi / 160.0) / px_per_unit, 1.0, 2.5)

## Safe area (notch, rounded corners, system bars) in UI units, as
## [left, top, right, bottom] insets.
static func safe_insets(win: Window) -> Array:
	var safe := DisplayServer.get_display_safe_area()
	var full := Rect2i(Vector2i.ZERO, DisplayServer.screen_get_size())
	if safe.size.x <= 0 or safe.size.y <= 0 or not OS.has_feature("mobile"):
		return [0.0, 0.0, 0.0, 0.0]
	var k := float(win.size.y) / maxf(1.0, win.get_visible_rect().size.y) # px per UI unit
	return [safe.position.x / k, safe.position.y / k,
		(full.end.x - safe.end.x) / k, (full.end.y - safe.end.y) / k]

static func _box(bg: Color, border: Color, radius := 10, pad := Vector2(12, 6)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad.x
	s.content_margin_right = pad.x
	s.content_margin_top = pad.y
	s.content_margin_bottom = pad.y
	return s

static func make_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = FONT
	t.set_stylebox("normal", "Button", _box(Color(0.15, 0.17, 0.22, 0.92), Color(0.36, 0.4, 0.5)))
	t.set_stylebox("hover", "Button", _box(Color(0.21, 0.24, 0.31, 0.95), Color(0.55, 0.6, 0.72)))
	t.set_stylebox("pressed", "Button", _box(Color(0.28, 0.42, 0.62, 0.98), Color(0.6, 0.75, 1.0)))
	t.set_stylebox("disabled", "Button", _box(Color(0.12, 0.13, 0.16, 0.7), Color(0.22, 0.24, 0.28)))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_color("font_color", "Button", Color(0.95, 0.96, 1.0))
	t.set_color("font_disabled_color", "Button", Color(0.55, 0.57, 0.62))
	t.set_constant("h_separation", "Button", 8)
	t.set_constant("outline_size", "Label", 4)
	t.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.85))
	t.set_stylebox("panel", "PanelContainer", _box(Color(0.08, 0.09, 0.12, 0.88), Color(0.3, 0.33, 0.4), 12, Vector2(10, 10)))
	return t

## Small backing plate for labels drawn over the 3D view.
static func plate() -> StyleBoxFlat:
	return _box(Color(0.05, 0.06, 0.08, 0.72), Color(1, 1, 1, 0.15), 6, Vector2(6, 2))

## 22x22 colour swatch for a room (or element) used as the tray button icon.
static func swatch(def: Dictionary) -> ImageTexture:
	var key := String(def.get("type", ""))
	var c: Color
	match key:
		"E": c = ZorgLook.mat(String(def.get("element", "fire"))).albedo_color
		"T": c = ZorgLook.mat("hatch").albedo_color.lightened(0.2)
		"Z": c = Color(0.85, 0.2, 0.2)
		_: c = ZorgLook.mat("floor_" + key).albedo_color
	c.a = 1.0
	var img := Image.create(22, 22, false, Image.FORMAT_RGBA8)
	img.fill(c.darkened(0.45))
	img.fill_rect(Rect2i(2, 2, 18, 18), c)
	return ImageTexture.create_from_image(img)
