// Dark flagstone board (dungeon look, visual only). Staggered stones with
// grout and a faint per-slot checker so empty slots still read when you
// place a room. Everything outside the focus rectangle (the board while
// building, the placed rooms during a run) fades to black over `fade`
// world units: the "fog to black" of the target look, without darkening
// the rooms themselves. Works on the Mobile and Compatibility renderers.
// Build overlay: a tiny per-slot texture (one texel per board slot, set by
// the level screen) tints slot outlines and fills: a faint grid while
// building, green where a dragged room may go. Same draw calls as before.
shader_type spatial;
render_mode diffuse_lambert, specular_disabled;

uniform vec2 focus_min = vec2(-5.0, -15.0);
uniform vec2 focus_max = vec2(35.0, 10.0);
uniform float fade = 12.0;
uniform vec3 stone_a : source_color = vec3(0.13, 0.13, 0.15);
uniform vec3 stone_b : source_color = vec3(0.21, 0.2, 0.2);
uniform float checker = 0.16;   // slot-to-slot brightness step
uniform float glow = 0.14;      // emission so the board reads with no torch
uniform float slot = 5.0;
uniform sampler2D noise_tex : hint_default_white, filter_linear_mipmap, repeat_enable;
uniform sampler2D cell_tex : hint_default_transparent, filter_nearest, repeat_disable;
uniform vec2 cells_origin = vec2(-1.0, -2.0);  // first slot (x, y) in cell_tex
uniform vec2 cells_size = vec2(8.0, 6.0);      // slots across, slots deep
uniform float cell_mix = 0.0;                  // 0 = overlay off (during a run)
uniform float cell_fill = 0.12;                // fill strength inside a slot

varying vec3 wpos;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = wpos.xz;
	// Four stones across a slot, six rows, every other row offset by half.
	vec2 sz = vec2(slot / 4.0, slot / 6.0);
	vec2 q = p / sz;
	float row = floor(q.y);
	q.x += mod(row, 2.0) * 0.5;
	vec2 id = floor(q);
	vec2 f = fract(q);
	float h = hash(id);
	vec2 e = min(f, 1.0 - f) * sz;
	float grout = smoothstep(0.015, 0.06, min(e.x, e.y));
	float n = texture(noise_tex, p * 0.31).r;
	vec3 c = mix(stone_a, stone_b, h) * (0.55 + 0.5 * n);
	// Hairline cracks across some stones.
	float cr = abs(texture(noise_tex, p * 0.09 + vec2(h * 3.1, h * 1.7)).r - 0.82);
	c *= mix(0.55, 1.0, smoothstep(0.0, 0.006, cr) + step(h, 0.7));
	c *= mix(0.3, 1.0, grout);
	vec2 s = floor(p / slot);
	c *= 1.0 + checker * (mod(s.x + s.y, 2.0) - 0.5);
	vec2 d = max(max(focus_min - p, p - focus_max), vec2(0.0));
	float k = 1.0 - smoothstep(0.0, fade, length(d));
	k *= k;
	vec3 em = c * glow;
	if (cell_mix > 0.0) {
		// Slot (x, y) the way the level screen counts them: z runs to -y.
		vec2 sl = vec2(p.x, -p.y) / slot;
		vec2 uv = (floor(sl) - cells_origin + 0.5) / cells_size;
		if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
			vec4 cs = texture(cell_tex, uv);
			vec2 fe = min(fract(sl), 1.0 - fract(sl)) * slot;
			float edge = 1.0 - smoothstep(0.07, 0.24, min(fe.x, fe.y));
			float w = cs.a * clamp(edge + cell_fill, 0.0, 1.0) * cell_mix;
			c = mix(c, cs.rgb * 0.5, w * 0.45);
			em += cs.rgb * w * 0.55;
		}
	}
	ALBEDO = c * k;
	ROUGHNESS = 0.95;
	EMISSION = em * k;
}
