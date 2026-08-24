// Rounded rect. Layout box is unscaled; `scale` grows around the center.

struct FrameU {
    res: vec4f,
}

struct Quad {
    rect: vec4f,
    color: vec4f,
    border: vec4f,
    params: vec4f, // radius, border_w, scale, opacity
    fx: vec4f,     // taper, blur, skew, unused
}

@group(0) @binding(0) var<uniform> u: FrameU;
@group(0) @binding(1) var<storage, read> quads: array<Quad>;
@group(0) @binding(2) var photos: texture_2d<f32>;
@group(0) @binding(3) var photos_samp: sampler;

struct VsOut {
    @builtin(position) pos: vec4f,
    @location(0) local: vec2f,
    @location(1) size: vec2f,
    @location(2) color: vec4f,
    @location(3) border: vec4f,
    @location(4) params: vec4f,
    @location(5) fx: vec4f,
}

@vertex
fn vs(@location(0) corner: vec2f, @builtin(instance_index) i: u32) -> VsOut {
    let q = quads[i];
    let sc = max(q.params.z, 0.01);
    let cx = q.rect.x + q.rect.z * 0.5;
    let cy = q.rect.y + q.rect.w * 0.5;
    let w = q.rect.z * sc;
    let h = q.rect.w * sc;
    let t = corner.y + 0.5;
    let bot = mix(1.0, 0.84, q.fx.x);
    let width = mix(1.0, bot, t);
    let px = cx + corner.x * w * width + q.fx.z * t;
    let py = cy + corner.y * h;
    var o: VsOut;
    o.pos = vec4f(px / u.res.x * 2.0 - 1.0, 1.0 - py / u.res.y * 2.0, 0.0, 1.0);
    o.local = vec2f((corner.x + 0.5) * w, (corner.y + 0.5) * h);
    o.size = vec2f(w, h);
    o.color = q.color;
    o.border = q.border;
    o.params = q.params;
    o.fx = q.fx;
    return o;
}

fn sd_round(p: vec2f, b: vec2f, r: f32) -> f32 {
    let q = abs(p) - b + vec2f(r);
    return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment
fn fs(v: VsOut) -> @location(0) vec4f {
    let half = v.size * 0.5;
    let p = v.local - half;
    let r = min(v.params.x * max(v.params.z, 0.01), min(half.x, half.y));
    let d = sd_round(p, half, r);
    let aa = 1.0 + max(v.fx.y, 0.0);
    let fill = 1.0 - smoothstep(-aa, aa, d);
    let bw = v.params.y;
    var rgb = v.color.rgb;
    var a = v.color.a * fill;
    if (v.fx.w > 0.5 && fill > 0.01) {
        let tile = clamp(v.fx.w, 1.0, 3.0) - 1.0;
        let lu = clamp(v.local.x / max(v.size.x, 1.0), 0.0, 1.0);
        let lv = clamp(v.local.y / max(v.size.y, 1.0), 0.0, 1.0);
        let tw = 1.0 / 3.0;
        let pad = 0.5 / 384.0;
        let u0 = tile * tw + pad;
        let u1 = (tile + 1.0) * tw - pad;
        let uv = vec2f(mix(u0, u1, lu), mix(pad, 1.0 - pad, lv));
        let tex = textureSample(photos, photos_samp, uv);
        rgb = tex.rgb * v.color.rgb;
        a = tex.a * v.color.a * fill;
    }
    if (bw > 0.05) {
        let edge = 1.0 - smoothstep(bw - aa, bw + aa, abs(d));
        rgb = mix(rgb, v.border.rgb, edge);
        a = max(a, v.border.a * edge);
    }
    a *= v.params.w;
    if (a < 0.01) { discard; }
    return vec4f(rgb, a);
}
