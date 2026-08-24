@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

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

@fragment
fn fs(v: VsOut) -> @location(0) vec4f {
    return textureSampleLevel(src, samp, v.uv, 0.0);
}
