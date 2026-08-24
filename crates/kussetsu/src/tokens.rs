//! Inkstone tokens. Widgets import these — they do not invent hex.

pub type Rgba = [f32; 4];

pub const INK: Rgba = [0.020, 0.031, 0.024, 1.0];
pub const WELL: Rgba = [0.043, 0.086, 0.063, 1.0];
pub const FG: Rgba = [0.910, 1.0, 0.941, 1.0];
pub const MUTED: Rgba = [0.478, 0.604, 0.518, 1.0];
pub const JADE: Rgba = [0.0, 0.902, 0.463, 1.0];
pub const JADE_DIM: Rgba = [0.055, 0.165, 0.110, 1.0];
pub const BORDER: Rgba = [0.102, 0.180, 0.133, 1.0];
pub const SCRIM: Rgba = [0.0, 0.0, 0.0, 0.48];
pub const CLEAR: Rgba = [0.0, 0.0, 0.0, 0.0];

pub fn lerp(a: Rgba, b: Rgba, t: f32) -> Rgba {
    let t = t.clamp(0.0, 1.0);
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
    ]
}

#[derive(Clone, Copy)]
pub struct Size {
    pub height: f32,
    pub pad_x: f32,
    pub font: f32,
    pub radius: f32,
    pub gap: f32,
}

pub const SM: Size = Size { height: 28.0, pad_x: 10.0, font: 12.0, radius: 8.0, gap: 6.0 };
pub const MD: Size = Size { height: 36.0, pad_x: 14.0, font: 14.0, radius: 10.0, gap: 8.0 };
pub const LG: Size = Size { height: 44.0, pad_x: 18.0, font: 16.0, radius: 12.0, gap: 10.0 };

pub const HOVER_SCALE: f32 = 1.06;
/// IBM Plex Mono advance / em. Hit boxes must use this so they match glyphs.
pub const MONO_ADVANCE: f32 = 0.6;
pub const PRESS_SCALE: f32 = 0.98;
