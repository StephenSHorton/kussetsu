// Optical glass panes — Suzuri composite.wgsl `eval_glass_panel` (Canvas UI lens model).
// Samples a backdrop RT (lamps / scene). Per-pane ior, edge, bevel, depth, CA, blur.

struct FrameU {
    size: vec4f,  // xy logical, zw framebuffer
    misc: vec4f,  // x = panel count
}

struct Pane {
    rect: vec4f,   // xywh logical
    radius: f32,
    darken: f32,
    _pad: vec2f,
    glass: vec4f,  // ior, edge, bevel, depth
    glass2: vec4f, // aberration, blur, reflection, shine
}

@group(0) @binding(0) var<uniform> u: FrameU;
@group(0) @binding(1) var<storage, read> panes: array<Pane>;
@group(0) @binding(2) var scene_tex: texture_2d<f32>;
@group(0) @binding(3) var scene_samp: sampler;

const PI: f32 = 3.14159265358979;
const AIR_IOR: f32 = 1.0003;
const MAX_PANES: u32 = 16u;

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
fn sd_round_box(p: vec2f, b: vec2f, r: f32) -> f32 {
    let q = abs(p) - b + vec2f(r);
    return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn fresnel_schlick(cos_theta: f32, f0: f32) -> f32 {
    return f0 + (1.0 - f0) * pow5(1.0 - cos_theta);
}
fn ior_for_wavelength(base_ior: f32, aberration: f32, wavelength: f32) -> f32 {
    let ab = aberration * 0.1;
    return mix(
        base_ior + ab,
        base_ior - ab,
        1.0 - pow(1.0 - linear_step(450.0, 650.0, wavelength), 4.0),
    );
}

fn sample_scene(fb_px: vec2f) -> vec3f {
    let fb = max(u.size.zw, vec2f(1.0));
    let uv = clamp(fb_px / fb, vec2f(0.001), vec2f(0.999));
    return textureSampleLevel(scene_tex, scene_samp, uv, 0.0).rgb;
}

fn eval_pane(px: vec2f, fb_scale: vec2f, p: Pane) -> vec4f {
    let ior = max(p.glass.x, 1.01);
    let edge = p.glass.y;
    let bevel = max(p.glass.z, 0.5);
    let aberration = p.glass2.x;
    let blur = p.glass2.y;
    let reflection = p.glass2.z;
    let shine = max(p.glass2.w, 0.08);
    let optical = 120.0;
    let depth = min(p.glass.w, max(optical * 2.2, 40.0));

    let center = p.rect.xy + p.rect.zw * 0.5;
    let half = p.rect.zw * 0.5;
    let radius = min(p.radius, min(half.x, half.y));
    let local = px - center;
    let sd = sd_round_box(local, half, radius);
    let aa = 1.5;
    let mask = 1.0 - smoothstep(-aa, 0.0, sd);
    if (mask <= 0.001) {
        return vec4f(0.0);
    }

    let edge_w = max(optical * (1.0 - clamp(edge, 0.0, 0.98)), 1.0);
    let rim = pow(linear_step(-edge_w, 0.0, sd), bevel);
    let scatter = min(blur, 1.0) * 0.02;
    let rand_angle = ign(px) * PI * 2.0;
    let flat_n = normalize(vec3f(sin(rand_angle) * scatter, cos(rand_angle) * scatter, 1.0));
    let e = 1.0;
    let grad = vec2f(
        sd_round_box(local + vec2f(e, 0.0), half, radius) - sd_round_box(local - vec2f(e, 0.0), half, radius),
        sd_round_box(local + vec2f(0.0, e), half, radius) - sd_round_box(local - vec2f(0.0, e), half, radius),
    );
    let g2 = normalize(grad + vec2f(1e-5));
    let normal = normalize(mix(flat_n, vec3f(g2, 0.0), rim));

    let eta = AIR_IOR / ior;
    let incident = vec3f(0.0, 0.0, -1.0);
    var rv = refract(incident, normal, eta);
    if (dot(rv, rv) < 1e-8) {
        rv = vec3f(g2 * rim * 8.0, -1.0);
    }
    let z = max(abs(rv.z), 1e-4);
    let disp = rv.xy * (depth / z) * fb_scale;

    let px_fb = px * fb_scale;
    var refracted: vec3f;
    if (aberration > 0.001) {
        let d0 = disp * (ior_for_wavelength(ior, aberration, 611.4) / ior);
        let d1 = disp * (ior_for_wavelength(ior, aberration, 549.1) / ior);
        let d2 = disp * (ior_for_wavelength(ior, aberration, 464.2) / ior);
        refracted = vec3f(
            sample_scene(px_fb + d0).r,
            sample_scene(px_fb + d1).g,
            sample_scene(px_fb + d2).b,
        );
    } else {
        refracted = sample_scene(px_fb + disp);
    }

    var glass = refracted * (1.0 - clamp(p.darken, 0.0, 0.95));
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
    let outline = 1.0 - smoothstep(0.0, 1.2, abs(sd));
    glass += vec3f(0.28, 0.45, 0.38) * outline * 0.04;
    return vec4f(glass, mask);
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let fb = max(u.size.zw, vec2f(1.0));
    let logical = max(u.size.xy, vec2f(1.0));
    let fb_scale = fb / logical;
    let px = frag.xy / fb_scale;
    var col = sample_scene(frag.xy);
    let n = u32(clamp(u.misc.x, 0.0, f32(MAX_PANES)));
    for (var i = 0u; i < MAX_PANES; i++) {
        if (i >= n) { break; }
        let g = eval_pane(px, fb_scale, panes[i]);
        col = mix(col, g.rgb, g.a);
    }
    return vec4f(col, 1.0);
}
