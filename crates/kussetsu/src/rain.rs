//! Glyph rain backdrop — Suzuri `rain.wgsl` / Canvas UI GlyphRain.
//! Host composites this into the scene RT (glass samples it).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{FG, JADE, MUTED};

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct RainU {
    pub res_time: [f32; 4],
    pub params: [f32; 4],
    pub params2: [f32; 4],
    pub params3: [f32; 4],
    pub color: [f32; 4],
    pub head_color: [f32; 4],
}

pub const CELL: f32 = 15.0;
pub const SPEED: f32 = 0.14;
pub const SPEED_VARIANCE: f32 = 1.0;
pub const DENSITY: f32 = 0.4;
pub const TRAIL: f32 = 0.52;
pub const GLOW: f32 = 1.75;
pub const MUTATE: f32 = 0.0;
pub const FLICKER: f32 = 0.0;
pub const LAYERS: f32 = 1.0;
pub const COLOR: [f32; 3] = [JADE[0], JADE[1], JADE[2]];
pub const HEAD_COLOR: [f32; 3] = [0.15, 1.0, 0.55];

pub const CHARSET: &str =
    "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z*+-<>¦=:.";

pub fn enable(draw: &mut DrawList) {
    draw.rain = true;
}

impl RainU {
    /// `scale` is the window scale factor (DPR). Cell size is CSS px × scale,
    /// same as Suzuri `CELL * scale_factor`, so retina density matches.
    pub fn frame(
        fb_w: f32,
        fb_h: f32,
        time: f32,
        glyph_count: f32,
        atlas_grid: f32,
        scale: f32,
    ) -> Self {
        Self {
            res_time: [fb_w, fb_h, time, 1.0],
            params: [
                CELL * scale.max(0.5),
                SPEED,
                SPEED_VARIANCE,
                DENSITY,
            ],
            params2: [TRAIL, GLOW, MUTATE, FLICKER],
            params3: [LAYERS, glyph_count, atlas_grid, 0.0],
            color: [COLOR[0], COLOR[1], COLOR[2], 1.0],
            head_color: [HEAD_COLOR[0], HEAD_COLOR[1], HEAD_COLOR[2], 1.0],
        }
    }
}

pub fn story(
    draw: &mut DrawList,
    _ptr: Pointer,
    _motion: &mut Motion,
    _dt: f32,
    _seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    enable(draw);
    draw.label("Glyph rain", 36.0 + x0, 36.0 + y0, 22.0, FG);
    draw.label(
        "Suzuri compositor. Glyphs stay put; the bright head glides down the column.",
        36.0 + x0,
        64.0 + y0,
        14.0,
        MUTED,
    );
}
