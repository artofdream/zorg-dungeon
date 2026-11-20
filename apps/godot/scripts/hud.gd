class_name ZorgHud
extends RefCounted
## Round 7 HUD helpers: one theme for every control, DPI-aware UI scale,
## safe-area margins and room colour swatches for the tray. Visual only.

const TARGET := 52.0      # min button height in UI units (>= 48 dp once scaled)
const FONT := 18          # body text in UI units (>= 16 dp once scaled)

## UI units -> dp: aim for 1 UI unit = 1 dp on phones (1 CSS px on the web,
## where the reported DPI is 96 x devicePixelRatio). Desktop and desktop
## web (low DPI) stay at the 1280x720 layout (factor 1). `--ui-scale=X`
## after `--` on the command line overrides it, for testing.
static func ui_scale(win: Window) -> float:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--ui-scale="):
			return clampf(float(a.substr(11)), 0.5, 4.0)
	if DisplayServer.get_name() == "headless" or win.size.y < 240:
		return 1.0
	var dpi := float(DisplayServer.screen_get_dpi())
	# canvas_items + expand stretch: px per unit before content scale.
	var px_per_unit := minf(float(win.size.x) / 1280.0, float(win.size.y) / 720.0)
	if dpi <= 0.0 or px_per_unit <= 0.0:
		return 1.0
	var px_per_dp := dpi / (96.0 if OS.has_feature("web") else 160.0)
	return clampf(px_per_dp / px_per_unit, 1.0, 4.0)

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

## Finger slop for tap vs. pan, in viewport pixels. About 2.5 mm, but never
## tighter than 12 px so the Xvfb press-drag checks stay as they are on a
## 96-dpi display.
const TAP_MIN_PX := 12.0
const TAP_MM := 2.5

static func tap_slop_px(dpi: float = -1.0) -> float:
	if dpi < 0.0:
		dpi = float(DisplayServer.screen_get_dpi())
	if dpi <= 0.0:
		return TAP_MIN_PX
	return maxf(TAP_MIN_PX, (TAP_MM / 25.4) * dpi)

static func _box(bg: Color, border: Color, radius := 10, pad := Vector2(12, 6)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(2)  # 2 px so the 3:1 outline stays visible at 52-unit buttons
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad.x
	s.content_margin_right = pad.x
	s.content_margin_top = pad.y
	s.content_margin_bottom = pad.y
	return s

static func make_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = FONT
	t.set_stylebox("normal", "Button", _box(Color(0.15, 0.17, 0.22, 0.92), Color(0.70, 0.74, 0.86)))  # 7.5:1
	t.set_stylebox("hover", "Button", _box(Color(0.21, 0.24, 0.31, 0.95), Color(0.78, 0.82, 0.94)))  # 7.1:1
	t.set_stylebox("pressed", "Button", _box(Color(0.28, 0.42, 0.62, 0.98), Color(0.85, 0.92, 1.0)))  # 4.5:1
	t.set_stylebox("disabled", "Button", _box(Color(0.12, 0.13, 0.16, 0.7), Color(0.22, 0.24, 0.28)))
	# Keyboard focus ring (WCAG 2.4.7): 3 px amber, ~12:1 on the dark HUD.
	# Godot shows it for keyboard navigation, not after taps or clicks.
	var focus := _box(Color(0, 0, 0, 0), Color(1.0, 0.8, 0.25), 12)
	focus.draw_center = false
	focus.set_border_width_all(3)
	focus.set_expand_margin_all(3)
	t.set_stylebox("focus", "Button", focus)
	t.set_color("font_color", "Button", Color(0.95, 0.96, 1.0))
	t.set_color("font_disabled_color", "Button", Color(0.55, 0.57, 0.62))
	t.set_constant("h_separation", "Button", 8)
	t.set_constant("outline_size", "Label", 4)
	t.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.85))
	t.set_stylebox("panel", "PanelContainer", _box(Color(0.08, 0.09, 0.12, 0.88), Color(0.62, 0.66, 0.78), 12, Vector2(10, 10)))  # 7.6:1
	return t

## Small backing plate for labels drawn over the 3D view.
static func plate() -> StyleBoxFlat:
	return _box(Color(0.05, 0.06, 0.08, 0.72), Color(0.70, 0.74, 0.84), 6, Vector2(6, 2))  # 10:1, was 0.15-alpha white (~1.5:1)

## 24x24 colour swatch for a room (or element) used as the tray button icon
## and the room-legend rows. A light outer ring and a dark inner ring keep
## every fill (ice, poison, muted browns) at >= 3:1 on the dark HUD.
const SWATCH := 24

static func swatch(def: Dictionary) -> ImageTexture:
	var key := String(def.get("type", ""))
	var c: Color
	match key:
		"E": c = ZorgLook.mat(String(def.get("element", "fire"))).albedo_color
		"T": c = ZorgLook.mat("hatch").albedo_color.lightened(0.2)
		"Z": c = Color(0.85, 0.2, 0.2)
		_: c = ZorgLook.mat("floor_" + key).albedo_color
	c.a = 1.0
	var img := Image.create(SWATCH, SWATCH, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.95, 0.96, 0.98))                 # light outer ring
	img.fill_rect(Rect2i(1, 1, SWATCH - 2, SWATCH - 2), Color(0.08, 0.08, 0.10))  # dark inner
	img.fill_rect(Rect2i(2, 2, SWATCH - 4, SWATCH - 4), c)
	return ImageTexture.create_from_image(img)
