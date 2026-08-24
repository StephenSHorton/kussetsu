// Port of MarketingPage.tsx GLASS_CUBE — raymarched rounded box, refracts backdrop.

struct CubeU {
    res: vec4f,
    rect: vec4f,
    c0: vec4f,
    c1: vec4f,
    c2: vec4f,
}

@group(0) @binding(0) var backdrop: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u: CubeU;

struct VsOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vs(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VsOut {
    var o: VsOut;
    // Map the unit quad onto u.rect in clip space (css px, y-down → NDC y-up).
    let x = (u.rect.x + uv.x * u.rect.z) / u.res.x * 2.0 - 1.0;
    let y = 1.0 - (u.rect.y + uv.y * u.rect.w) / u.res.y * 2.0;
    o.pos = vec4f(x, y, 0.0, 1.0);
    o.uv = uv;
    return o;
}

fn sampleBackdrop(cssPx: vec2f) -> vec4f {
    let uv = cssPx / max(u.res.xy, vec2f(1.0));
    return textureSampleLevel(backdrop, samp, uv, 0.0);
}

fn sdRB(p: vec3f, b: f32, r: f32) -> f32 {
    let q = abs(p) - vec3f(b) + vec3f(r);
    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

fn nrm(p: vec3f, b: f32, r: f32) -> vec3f {
    let e = vec2f(0.0015, 0.0);
    return normalize(vec3f(
        sdRB(p + e.xyy, b, r) - sdRB(p - e.xyy, b, r),
        sdRB(p + e.yxy, b, r) - sdRB(p - e.yxy, b, r),
        sdRB(p + e.yyx, b, r) - sdRB(p - e.yyx, b, r)));
}

fn rotM(a: f32, c: f32) -> mat3x3<f32> {
    let ca = cos(a); let sa = sin(a); let cb = cos(c); let sb = sin(c);
    return mat3x3<f32>(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca)
        * mat3x3<f32>(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb);
}

fn sampleRGB(b: vec2f, d: vec2f) -> vec3f {
    return vec3f(sampleBackdrop(b + d).r, sampleBackdrop(b).g, sampleBackdrop(b - d).b);
}

@fragment
fn fs(v: VsOut) -> @location(0) vec4f {
    let uv = v.uv;
    let px = u.rect.xy + uv * u.rect.zw;
    let t = u.res.w * 0.35;
    let q = (uv - 0.5) * 2.15;
    let ro0 = vec3f(q, 2.0);
    let rd0 = vec3f(0.0, 0.0, -1.0);
    let R = rotM(t, t * 0.6);
    let Ri = transpose(R);
    let ro = Ri * ro0;
    let rd = Ri * rd0;
    let B = 0.55;
    let RAD = 0.20;
    var tt = 0.0;
    var hit = false;
    for (var i = 0; i < 48; i = i + 1) {
        let d = sdRB(ro + rd * tt, B, RAD);
        if (d < 0.0008) { hit = true; break; }
        tt = tt + d;
        if (tt > 5.0) { break; }
    }
    if (!hit) { return vec4f(0.0); }
    let p1 = ro + rd * tt;
    let n1 = nrm(p1, B, RAD);
    let rd2 = refract(rd, n1, 1.0 / 1.5);
    var ti = 0.02;
    for (var i = 0; i < 30; i = i + 1) {
        let d = sdRB(p1 + rd2 * ti, B, RAD);
        if (d > -0.0008) { break; }
        ti = ti + max(-d, 0.012);
        if (ti > 5.0) { break; }
    }
    let p2 = p1 + rd2 * ti;
    let n2 = nrm(p2, B, RAD);
    var dir = refract(rd2, -n2, 1.5);
    if (dot(dir, dir) < 0.01) { dir = reflect(rd2, -n2); }
    let dv = R * dir;
    let on = u.c0.x > 0.5;
    let strength = u.rect.z * select(0.3, u.c0.y * 3.0, on);
    let dispF = select(0.05, u.c0.z, on);
    let tintA = select(0.05, u.c0.w, on);
    let tintC = select(vec3f(0.72, 0.82, 1.0), u.c2.xyz, on);
    let glintI = select(0.7, u.c1.x * 5.0, on);
    let fresI = select(0.5, u.c1.y / 32.0, on);
    let brite = select(1.04, u.c1.z, on);
    let blurPx = select(0.0, u.c1.w, on);
    let base = px + dv.xy * strength;
    let dsp = dv.xy * strength * dispF;
    var col = sampleRGB(base, dsp);
    if (blurPx > 0.1) {
        col += sampleRGB(base + vec2f(blurPx, 0.0), dsp) + sampleRGB(base - vec2f(blurPx, 0.0), dsp)
            + sampleRGB(base + vec2f(0.0, blurPx), dsp) + sampleRGB(base - vec2f(0.0, blurPx), dsp);
        col = col / 5.0;
    }
    col = mix(col, tintC, tintA) * brite;
    let nv = R * n1;
    let fres = pow(1.0 - max(0.0, nv.z), 4.0);
    col += vec3f(0.6, 0.78, 1.0) * fres * fresI;
    let L = normalize(vec3f(-0.4, 0.7, 0.6));
    col += vec3f(1.0) * pow(max(0.0, dot(reflect(rd0, nv), L)), 28.0) * glintI;
    return vec4f(col, 1.0);
}
