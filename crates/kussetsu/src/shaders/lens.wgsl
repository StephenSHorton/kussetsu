// Magnifying-glass bubble. Samples the pre-lens scene RT.
// Radius + zoom come from pinch / ⌃/⌘+scroll (see `lens.rs`).

struct LensU {
    size: vec4f,   // xy logical, zw framebuffer
    lens: vec4f,   // xy center logical, z radius logical, w presence
    glass: vec4f,  // ior, edge, bevel, depth
    glass2: vec4f, // aberration, magnify, reflection, shine
}

@group(0) @binding(0) var<uniform> u: LensU;
@group(0) @binding(1) var scene_tex: texture_2d<f32>;
@group(0) @binding(2) var scene_samp: sampler;

const PI: f32 = 3.14159265358979;
const AIR_IOR: f32 = 1.0003;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
    var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    return vec4f(p[vi], 0.0, 1.0);
}

fn pow2(x: f32) -> f32 { return x * x; }
fn pow5(x: f32) -> f32 { let x2 = x * x; return x2 * x2 * x; }
fn linear_step(e0: f32, e1: f32, x: f32) -> f32 {
    return clamp((x - e0) / (e1 - e0), 0.0, 1.0);
}

fn ign(v: vec2f) -> f32 {
    return fract(52.9829189 * fract(0.06711056 * v.x + 0.00583715 * v.y));
}

fn sample_scene(fb_px: vec2f) -> vec3f {
    let fb = max(u.size.zw, vec2f(1.0));
    if (fb_px.x < 0.0 || fb_px.y < 0.0 || fb_px.x >= fb.x || fb_px.y >= fb.y) {
        return vec3f(0.02, 0.031, 0.024);
    }
    let uv = clamp(fb_px / fb, vec2f(0.001), vec2f(0.999));
    return textureSampleLevel(scene_tex, scene_samp, uv, 0.0).rgb;
}

fn ior_for_wavelength(base_ior: f32, aberration: f32, wavelength: f32) -> f32 {
    let ab = aberration * 0.1;
    return mix(
        base_ior + ab,
        base_ior - ab,
        1.0 - pow(1.0 - linear_step(450.0, 650.0, wavelength), 4.0),
    );
}

fn fresnel_schlick(cos_theta: f32, f0: f32) -> f32 {
    return f0 + (1.0 - f0) * pow5(1.0 - cos_theta);
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let fb = max(u.size.zw, vec2f(1.0));
    let logical = max(u.size.xy, vec2f(1.0));
    let fb_px = frag.xy;
    var col = sample_scene(fb_px);

    let presence = clamp(u.lens.w, 0.0, 1.0);
    let radius_log = u.lens.z;
    if (presence < 0.01 || radius_log < 1.0) {
        return vec4f(col, 1.0);
    }

    let scale = fb / logical;
    let center_fb = u.lens.xy * scale;
    let radius_fb = radius_log * min(scale.x, scale.y);
    let magnify = max(u.glass2.y, 1.0);

    let local = fb_px - center_fb;
    let dist = length(local);
    let sd = dist - radius_fb;
    let aa = 1.5;
    let mask = 1.0 - smoothstep(-aa, 0.0, sd);
    let alpha = mask * presence;
    if (alpha < 0.001) {
        return vec4f(col, 1.0);
    }

    let ior = max(u.glass.x, 1.01);
    let edge = u.glass.y;
    let bevel = max(u.glass.z, 0.5);
    let depth = min(u.glass.w, max(radius_log * 2.2, 40.0)) * min(scale.x, scale.y);
    let aberration = u.glass2.x;
    let reflection = u.glass2.z;
    let shine = max(u.glass2.w, 0.08);

    let edge_w = max(radius_fb * (1.0 - clamp(edge, 0.0, 0.98)), 1.0);
    let rim = pow(linear_step(-edge_w, 0.0, sd), bevel);
    let g2 = normalize(local + vec2f(1e-5));
    let rand_angle = ign(fb_px) * PI * 2.0;
    let flat_n = normalize(vec3f(sin(rand_angle) * 0.0, cos(rand_angle) * 0.0, 1.0));
    let rim_n = vec3f(g2, 0.0);
    let normal = normalize(mix(flat_n, rim_n, rim));

    let eta = AIR_IOR / ior;
    let incident = vec3f(0.0, 0.0, -1.0);
    var rv = refract(incident, normal, eta);
    if (dot(rv, rv) < 1e-8) {
        rv = vec3f(g2 * rim * 8.0, -1.0);
    }
    let z = max(abs(rv.z), 1e-4);
    let disp = rv.xy * (depth / z) * 0.35;

    let t = clamp(dist / max(radius_fb, 1.0), 0.0, 1.0);
    let mag_ease = mix(magnify, 1.0, pow(t, 2.2) * 0.18);
    let sample_local = local / mag_ease + disp;

    var glass: vec3f;
    if (aberration > 0.001) {
        let base = center_fb + local / mag_ease;
        let d0 = sample_local * (ior_for_wavelength(ior, aberration, 611.4) / ior);
        let d1 = sample_local * (ior_for_wavelength(ior, aberration, 549.1) / ior);
        let d2 = sample_local * (ior_for_wavelength(ior, aberration, 464.2) / ior);
        glass = vec3f(
            sample_scene(base + d0 * 0.25).r,
            sample_scene(base + d1 * 0.25).g,
            sample_scene(base + d2 * 0.25).b,
        );
    } else {
        glass = sample_scene(center_fb + sample_local);
    }

    if (reflection > 0.001) {
        let n_dot_v = clamp(normal.z, 0.0, 1.0);
        let f0 = pow2((ior - AIR_IOR) / (ior + AIR_IOR));
        let fres = fresnel_schlick(n_dot_v, f0) * reflection;
        glass = mix(glass, glass * 0.94 + vec3f(0.4, 0.55, 0.5) * 0.06, clamp(fres * rim, 0.0, 0.1));
    }

    let ldot = dot(g2, normalize(vec2f(-0.6, 0.8)));
    let band = pow(rim, 1.8);
    let arcs = pow(abs(ldot), 3.0) * select(0.28, 0.5, ldot > 0.0);
    glass += band * (0.012 + arcs * 0.45) * shine;
    let outline = (1.0 - smoothstep(0.0, 1.2, abs(sd))) * presence;
    glass += vec3f(0.28, 0.45, 0.38) * outline * 0.05;

    let shadow = smoothstep(radius_fb * 1.08, radius_fb * 0.72, dist) * 0.12 * presence;
    col *= 1.0 - shadow * (1.0 - mask);
    col = mix(col, glass, alpha);
    return vec4f(col, 1.0);
}
