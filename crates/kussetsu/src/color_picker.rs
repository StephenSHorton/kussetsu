//! Theme swatches. Copy Switch: parent owns `selected` (`seed.choice`).
//! Jade underline springs onto the picked chip. Tokens only — never invent hex.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColorPickerSize {
    Sm,
    Md,
    Lg,
}

impl ColorPickerSize {
    pub fn metrics(self) -> Size {
        match self {
            ColorPickerSize::Sm => SM,
            ColorPickerSize::Md => MD,
            ColorPickerSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColorPickerKind {
    /// Palette row + selected name.
    Swatches,
    /// WELL field: preview chip, name, then the palette.
    Field,
}

/// Inkstone palette. Index is what the parent stores.
pub const SWATCHES: [(&'static str, [f32; 4]); 7] = [
    ("ink", INK),
    ("well", WELL),
    ("fg", FG),
    ("muted", MUTED),
    ("jade", JADE),
    ("jadeDim", JADE_DIM),
    ("border", BORDER),
];

const RULE: f32 = 2.0;
const RULE_GAP: f32 = 2.0;

fn side(s: Size) -> f32 {
    s.height
}

fn row_width(s: Size) -> f32 {
    let n = SWATCHES.len() as f32;
    let d = side(s);
    n * d + (n - 1.0) * s.gap
}

fn name_w(name: &str, font: f32) -> f32 {
    name.chars().count() as f32 * font * MONO_ADVANCE
}

fn max_name_w(s: Size) -> f32 {
    let mut w = 0.0f32;
    for (name, _) in SWATCHES {
        w = w.max(name_w(name, s.font));
    }
    w
}

pub fn width(kind: ColorPickerKind, size: ColorPickerSize) -> f32 {
    let s = size.metrics();
    let row = row_width(s);
    match kind {
        ColorPickerKind::Swatches => row + s.gap + max_name_w(s),
        ColorPickerKind::Field => s.pad_x * 2.0 + row,
    }
}

pub fn height(kind: ColorPickerKind, size: ColorPickerSize) -> f32 {
    let s = size.metrics();
    let d = side(s);
    let row = d + RULE_GAP + RULE;
    match kind {
        ColorPickerKind::Swatches => row,
        ColorPickerKind::Field => s.pad_x * 2.0 + d + s.gap + row,
    }
}

/// Parent owns `selected` (0-based index into [`SWATCHES`]). Returns the chip released this frame.
pub fn color_picker(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    selected: u32,
    kind: ColorPickerKind,
    size: ColorPickerSize,
    disabled: bool,
) -> Option<u32> {
    let n = SWATCHES.len() as u32;
    if n == 0 {
        return None;
    }
    let s = size.metrics();
    let d = side(s);
    let selected = selected.min(n - 1);
    let (name, color) = SWATCHES[selected as usize];
    let ink = if disabled { MUTED } else { FG };

    let (px, py) = match kind {
        ColorPickerKind::Swatches => (x, y),
        ColorPickerKind::Field => {
            let w = width(kind, size);
            let h = height(kind, size);
            draw.outline(x, y, w, h, WELL, BORDER, s.radius, 1.0, 1.0);
            if disabled {
                let mut wash = SCRIM;
                wash[3] *= 0.2;
                draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
            }
            let ix = x + s.pad_x;
            let iy = y + s.pad_x;
            let pw = (d * 2.0).min(row_width(s) * 0.4).max(d);
            draw.outline(ix, iy, pw, d, color, BORDER, s.radius, 1.0, 1.0);
            draw.label(name, ix + pw + s.gap, iy + (d - s.font) * 0.5, s.font, ink);
            (ix, iy + d + s.gap)
        }
    };

    let picked = swatch_row(draw, ptr, motion, dt, px, py, selected, s, disabled);

    if kind == ColorPickerKind::Swatches {
        draw.label(
            name,
            px + row_width(s) + s.gap,
            py + (d - s.font) * 0.5,
            s.font,
            ink,
        );
    }
    picked
}

fn swatch_row(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    selected: u32,
    s: Size,
    disabled: bool,
) -> Option<u32> {
    let d = side(s);
    let n = SWATCHES.len();
    let mut picked = None;
    let mut cx = x;
    for i in 0..n {
        let fill = SWATCHES[i].1;
        if cell(
            draw,
            ptr,
            motion,
            dt,
            cx,
            y,
            d,
            fill,
            i as u32 == selected,
            disabled,
            s.radius,
        ) {
            picked = Some(i as u32);
        }
        cx += d + s.gap;
    }
    let span = d + s.gap;
    let target = x + selected as f32 * span;
    let ux = motion.spring(x, y + d, target, dt);
    let rule = if disabled { MUTED } else { JADE };
    let inset = (d * 0.18).min(8.0);
    draw.quad(
        ux + inset,
        y + d + RULE_GAP,
        (d - inset * 2.0).max(8.0),
        RULE,
        rule,
        1.0,
        1.0,
    );
    picked
}

fn cell(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    d: f32,
    fill: [f32; 4],
    selected: bool,
    disabled: bool,
    radius: f32,
) -> bool {
    let hot = !disabled && ptr.hit(x, y, d, d);
    let active = hot && ptr.down;
    let t = if disabled {
        if selected {
            1.0
        } else {
            0.0
        }
    } else {
        motion
            .spring_slot(x, y, 2, if selected { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0)
    };
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
    let hover = u.min(1.0);
    let border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, t.max(hover * 0.55))
    };
    let bw = 1.0 + t;
    draw.outline(x, y, d, d, fill, border, radius, bw, scale);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.28;
        draw.outline(x, y, d, d, wash, CLEAR, radius, 0.0, 1.0);
    }
    !disabled && hot && ptr.released
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
    let n = SWATCHES.len() as u32;
    seed.choice %= n;
    let name = SWATCHES[seed.choice as usize].0;
    let x = 36.0 + x0;
    draw.label(
        format!("Parent owns the swatch · {name} · {} clicks", seed.clicks),
        x,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let mut y = 72.0 + y0;
    if let Some(i) = color_picker(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        ColorPickerKind::Field,
        ColorPickerSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    y += height(ColorPickerKind::Field, ColorPickerSize::Md) + 20.0;

    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 18.0;
    let _ = color_picker(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        4,
        ColorPickerKind::Field,
        ColorPickerSize::Md,
        true,
    );
    y += height(ColorPickerKind::Field, ColorPickerSize::Md) + 20.0;

    draw.label("Sizes", x, y, 12.0, MUTED);
    y += 18.0;
    for size in [
        ColorPickerSize::Sm,
        ColorPickerSize::Md,
        ColorPickerSize::Lg,
    ] {
        if let Some(i) = color_picker(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            seed.choice,
            ColorPickerKind::Swatches,
            size,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        y += height(ColorPickerKind::Swatches, size) + 12.0;
    }
}
