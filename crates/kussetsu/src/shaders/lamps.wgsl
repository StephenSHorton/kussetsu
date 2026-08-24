struct LampsU {
    res: vec4f,
    scroll: vec4f,
}

@group(0) @binding(0) var<uniform> u: LampsU;

struct VsOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vs(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VsOut {
    var o: VsOut;
    o.pos = vec4f(pos, 0.0, 1.0);
    o.uv = uv;
    return o;
}

fn hsv2rgb(c: vec3f) -> vec3f {
    let k = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
    return c.z * mix(k.xxx, clamp(p - k.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

@fragment
fn fs(v: VsOut) -> @location(0) vec4f {
    let asp = u.res.x / max(u.res.y, 1.0);
    let p = vec2f(v.uv.x * asp, v.uv.y);
    let cx = 0.5 * asp;
    let scroll = u.scroll.x;
    let vh = max(u.res.y, 1.0);
    let halfW = 0.20 * asp;
    var c = vec3f(0.012, 0.016, 0.035);
    // Viewport-relative Y so a short native catalog still sees the bar
    // (old 360px world-Y sat off-screen when css height < ~400).
    for (var i = 0; i < 4; i = i + 1) {
        let ly = fract(0.22 + f32(i) * 0.31 - scroll / max(vh, 1.0));
        let col = hsv2rgb(vec3f(fract(0.55 + f32(i) * 0.13), 0.72, 1.0));
        let dx = (p.x - cx) / (halfW * 2.2);
        let dyB = max(0.0, p.y - ly) / 0.62;
        let dyA = max(0.0, ly - p.y) / 0.13;
        c += col * exp(-(dx * dx + dyB * dyB + dyA * dyA)) * 0.5;
        let dl = (p.y - ly) / 0.004;
        let xMask = smoothstep(halfW, halfW * 0.78, abs(p.x - cx));
        c += (col * 0.5 + vec3f(0.28)) * xMask / (1.0 + dl * dl);
    }
    return vec4f(c, 1.0);
}
