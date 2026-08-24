//! GPU photo well. Samples the host atlas (ink / well / jade tiles).
//! Stateless click. Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE,
    SCRIM, SM,
};

pub const PHOTO_TW: u32 = 128;
pub const PHOTO_TH: u32 = 96;
pub const PHOTO_N: u32 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageKind {
    Well,
    Jade,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageSize {
    Sm,
    Md,
    Lg,
}

impl ImageSize {
    pub fn metrics(self) -> Size {
        match self {
            ImageSize::Sm => SM,
            ImageSize::Md => MD,
            ImageSize::Lg => LG,
        }
    }

    /// 4:3 photo well. Derived from token height — not a free-form px size.
    pub fn box_size(self) -> (f32, f32) {
        let h = self.metrics().height * 3.0;
        (h * 4.0 / 3.0, h)
    }
}

impl ImageKind {
    fn tile(self) -> u32 {
        match self {
            ImageKind::Outline => 0,
            ImageKind::Well => 1,
            ImageKind::Jade => 2,
        }
    }
}

pub fn atlas_size() -> (u32, u32) {
    (PHOTO_TW * PHOTO_N, PHOTO_TH)
}

/// Ink / well / jade stone washes. Host uploads this once and the quad shader samples it.
pub fn atlas_rgba() -> Vec<u8> {
    let (w, h) = atlas_size();
    let mut out = vec![0u8; (w * h * 4) as usize];
    for tile in 0..PHOTO_N {
        for y in 0..PHOTO_TH {
            for x in 0..PHOTO_TW {
                let (r, g, b) = pixel(tile, x, y);
                let i = (((y * w) + tile * PHOTO_TW + x) * 4) as usize;
                out[i] = r;
                out[i + 1] = g;
                out[i + 2] = b;
                out[i + 3] = 255;
            }
        }
    }
    out
}

fn uhash(n: u32) -> u32 {
    let mut x = n.wrapping_mul(0x9E37_79B9);
    x ^= x >> 16;
    x = x.wrapping_mul(0x85EB_CA6B);
    x ^= x >> 13;
    x
}

fn n2(x: i32, y: i32, s: u32) -> f32 {
    let h = uhash(
        (x as u32)
            .wrapping_mul(374761393)
            .wrapping_add((y as u32).wrapping_mul(668265263))
            .wrapping_add(s),
    );
    (h >> 8) as f32 / 16_777_215.0
}

fn vnoise(x: f32, y: f32, s: u32) -> f32 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let fx = x - x0 as f32;
    let fy = y - y0 as f32;
    let u = fx * fx * (3.0 - 2.0 * fx);
    let v = fy * fy * (3.0 - 2.0 * fy);
    let a = n2(x0, y0, s);
    let b = n2(x0 + 1, y0, s);
    let c = n2(x0, y0 + 1, s);
    let d = n2(x0 + 1, y0 + 1, s);
    a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

fn fbm(x: f32, y: f32, s: u32) -> f32 {
    let mut a = 0.0;
    let mut w = 0.5;
    let mut f = 1.0;
    let mut sum = 0.0;
    for i in 0..5 {
        a += w * vnoise(x * f, y * f, s.wrapping_add(i * 19));
        sum += w;
        w *= 0.5;
        f *= 2.07;
    }
    a / sum
}

fn pixel(tile: u32, x: u32, y: u32) -> (u8, u8, u8) {
    let u = x as f32 / PHOTO_TW as f32;
    let v = y as f32 / PHOTO_TH as f32;
    let n = fbm(u * 5.5, v * 4.4, 11 + tile * 97);
    let n2 = fbm(u * 13.0 + 2.4, v * 10.0, 23 + tile * 41);
    let vein = (fbm(u * 2.8 + v * 0.9, v * 7.0, 71 + tile) - 0.48).abs();
    let vig = ((u - 0.5).powi(2) * 0.9 + (v - 0.4).powi(2) * 1.1).sqrt();
    let wash = (1.0 - vig * 0.4).clamp(0.62, 1.0);
    let grain = (n * 0.68 + n2 * 0.32).clamp(0.0, 1.0);
    let t = (grain * 0.55 + (1.0 - (vein * 2.2).min(1.0)) * 0.45).clamp(0.0, 1.0);
    let pal = match tile {
        0 => (
            [0.10, 0.14, 0.12, 1.0],
            [0.22, 0.30, 0.24, 1.0],
            [0.40, 0.50, 0.42, 1.0],
        ),
        1 => (
            [0.08, 0.18, 0.12, 1.0],
            [0.16, 0.34, 0.22, 1.0],
            [0.28, 0.52, 0.34, 1.0],
        ),
        _ => (
            [0.02, 0.28, 0.14, 1.0],
            [0.00, 0.72, 0.38, 1.0],
            FG,
        ),
    };
    let mut rgb = lerp(lerp(pal.0, pal.1, t), pal.2, (t - 0.58).max(0.0) * 0.7);
    rgb[0] *= wash;
    rgb[1] *= wash;
    rgb[2] *= wash;
    (
        (rgb[0] * 255.0).round().clamp(0.0, 255.0) as u8,
        (rgb[1] * 255.0).round().clamp(0.0, 255.0) as u8,
        (rgb[2] * 255.0).round().clamp(0.0, 255.0) as u8,
    )
}

pub fn image(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    kind: ImageKind,
    size: ImageSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let (w, h) = size.box_size();
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let (border, bw) = if disabled {
        match kind {
            ImageKind::Outline => (BORDER, 1.0),
            _ => (BORDER, 1.0),
        }
    } else {
        match kind {
            ImageKind::Well => (BORDER, 1.0),
            ImageKind::Jade => (CLEAR, 0.0),
            ImageKind::Outline => (JADE, 1.0),
        }
    };
    let tint = if disabled {
        [0.55, 0.55, 0.55, 1.0]
    } else {
        match kind {
            ImageKind::Jade => {
                let press = [0.82, 0.82, 0.82, 1.0];
                mix_phase([1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0], press, u)
            }
            _ => [1.0, 1.0, 1.0, 1.0],
        }
    };
    draw.photo(x, y, w, h, kind.tile(), tint, s.radius, scale);
    if bw > 0.0 {
        draw.outline(x, y, w, h, CLEAR, border, s.radius, bw, scale);
    }
    if disabled {
        let mut veil = SCRIM;
        veil[3] = 0.28;
        draw.outline(x, y, w, h, veil, CLEAR, s.radius, 0.0, scale);
    }
    !disabled && hot && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn caption(draw: &mut DrawList, x: f32, y: f32, w: f32, h: f32, text: &str) {
    let font = SM.font;
    let tw = text.chars().count() as f32 * font * MONO_ADVANCE;
    draw.label(text, x + (w - tw) * 0.5, y + h + 6.0, font, MUTED);
}

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    const GAP: f32 = 16.0;
    draw.label(
        format!("GPU atlas · onClick {} times", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    let (md_w, md_h) = ImageSize::Md.box_size();
    for (kind, name, disabled) in [
        (ImageKind::Well, "Well", false),
        (ImageKind::Jade, "Jade", false),
        (ImageKind::Outline, "Outline", false),
        (ImageKind::Well, "Disabled", true),
    ] {
        if image(draw, ptr, motion, dt, x, y, kind, ImageSize::Md, disabled) {
            seed.clicks += 1;
        }
        caption(draw, x, y, md_w, md_h, name);
        x += md_w + GAP;
    }

    let y2 = y + md_h + 32.0;
    x = 36.0 + x0;
    draw.label("Sizes", x, y2, 14.0, MUTED);
    let y3 = y2 + 22.0;
    for (size, name) in [
        (ImageSize::Sm, "Sm"),
        (ImageSize::Md, "Md"),
        (ImageSize::Lg, "Lg"),
    ] {
        let (w, h) = size.box_size();
        if image(draw, ptr, motion, dt, x, y3, ImageKind::Well, size, false) {
            seed.clicks += 1;
        }
        caption(draw, x, y3, w, h, name);
        x += w + GAP;
    }

    let (_, lg_h) = ImageSize::Lg.box_size();
    let y4 = y3 + lg_h + 32.0;
    draw.label("Pick a frame", 36.0 + x0, y4, 14.0, MUTED);
    let y5 = y4 + 22.0;
    x = 36.0 + x0;
    for (i, (kind, name)) in [
        (ImageKind::Outline, "ink"),
        (ImageKind::Well, "well"),
        (ImageKind::Jade, "jade"),
    ]
    .iter()
    .enumerate()
    {
        let on = seed.choice == i as u32;
        if image(draw, ptr, motion, dt, x, y5, *kind, ImageSize::Md, false) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        if on {
            let r = ImageSize::Md.metrics().radius;
            draw.outline(x, y5, md_w, md_h, CLEAR, JADE, r, 2.0, 1.0);
        }
        caption(draw, x, y5, md_w, md_h, name);
        x += md_w + GAP;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atlas_is_three_tiles() {
        let px = atlas_rgba();
        let (w, h) = atlas_size();
        assert_eq!(w, PHOTO_TW * PHOTO_N);
        assert_eq!(h, PHOTO_TH);
        assert_eq!(px.len(), (w * h * 4) as usize);
        assert_eq!(px[3], 255);
    }
}
