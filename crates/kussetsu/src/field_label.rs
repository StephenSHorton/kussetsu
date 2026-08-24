//! Field label + optional required mark. Copy Button (stateless click).
//! Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE, SM, Size,
    WELL, lerp,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LabelKind {
    Default,
    Required,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LabelSize {
    Sm,
    Md,
    Lg,
}

impl LabelSize {
    pub fn metrics(self) -> Size {
        match self {
            LabelSize::Sm => SM,
            LabelSize::Md => MD,
            LabelSize::Lg => LG,
        }
    }
}

pub fn field_label(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    text: &str,
    kind: LabelKind,
    size: LabelSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let font = s.font;
    let required = kind == LabelKind::Required;
    let text_w = text.chars().count() as f32 * font * MONO_ADVANCE;
    let gap = if required { s.gap * 0.5 } else { 0.0 };
    let mark_w = if required { font * MONO_ADVANCE } else { 0.0 };
    let w = text_w + gap + mark_w;
    let h = s.height;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        let scale_to = if hot { HOVER_SCALE } else { 1.0 };
        (
            motion.spring_slot(x, y, 0, scale_to, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let ink = if disabled {
        MUTED
    } else {
        lerp(FG, JADE, u.min(1.0))
    };
    let star = if disabled { MUTED } else { JADE };
    let ox = x + w * 0.5;
    let oy = y + h * 0.5;
    let ty = y + (h - font) * 0.5;
    draw.label_swoop(text, x, ty, font, ink, scale, ox, oy, 0.0, 0.0);
    if required {
        draw.label_swoop("*", x + text_w + gap, ty, font, star, scale, ox, oy, 0.0, 0.0);
    }
    !disabled && hot && ptr.pressed
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
    let focused = ["Name", "Email", "Token"]
        .get(seed.choice as usize)
        .copied()
        .unwrap_or("Name");
    draw.label(
        format!("onClick fired {} times · focus {focused}", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let rows: [(&str, LabelKind, bool); 3] = [
        ("Name", LabelKind::Required, false),
        ("Email", LabelKind::Default, false),
        ("Token", LabelKind::Default, true),
    ];
    let mut y = 72.0 + y0;
    for (i, (name, kind, disabled)) in rows.iter().copied().enumerate() {
        let x = 36.0 + x0;
        if field_label(draw, ptr, motion, dt, x, y, name, kind, LabelSize::Md, disabled) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        let wx = x + 140.0;
        let ww = 240.0;
        let on = seed.choice == i as u32 && !disabled;
        let (fill, border) = if disabled {
            (WELL, BORDER)
        } else if on {
            (INK, JADE)
        } else {
            (CLEAR, BORDER)
        };
        draw.outline(wx, y, ww, MD.height, fill, border, MD.radius, 1.0, 1.0);
        if disabled {
            draw.label_in("-", wx, y, ww, MD.height, 13.0, MUTED, 1.0);
        } else if on && ((seed.clock * 2.0) as u32) % 2 == 0 {
            draw.quad(wx + MD.pad_x, y + 8.0, 2.0, MD.height - 16.0, JADE, 1.0, 1.0);
        }
        if !disabled && ptr.hit(wx, y, ww, MD.height) && ptr.pressed {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        y += 52.0;
    }

    draw.label("Sizes", 36.0 + x0, y + 8.0, 14.0, MUTED);
    y += 36.0;
    let mut x = 36.0 + x0;
    if field_label(draw, ptr, motion, dt, x, y, "Small", LabelKind::Default, LabelSize::Sm, false) {
        seed.clicks += 1;
        seed.tab = 0;
    }
    x += 88.0;
    if field_label(draw, ptr, motion, dt, x, y, "Medium", LabelKind::Required, LabelSize::Md, false) {
        seed.clicks += 1;
        seed.tab = 1;
    }
    x += 118.0;
    if field_label(draw, ptr, motion, dt, x, y, "Large", LabelKind::Default, LabelSize::Lg, false) {
        seed.clicks += 1;
        seed.tab = 2;
    }
}
