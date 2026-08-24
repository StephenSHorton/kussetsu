//! Stateless text link. MUTED rest, JADE + underline on hover.
//! Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, FG, HOVER_SCALE, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkKind {
    Muted,
    Jade,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkSize {
    Sm,
    Md,
    Lg,
}

impl LinkSize {
    pub fn metrics(self) -> Size {
        match self {
            LinkSize::Sm => SM,
            LinkSize::Md => MD,
            LinkSize::Lg => LG,
        }
    }
}

pub fn link(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    kind: LinkKind,
    size: LinkSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let font = s.font;
    let w = label.chars().count() as f32 * font * MONO_ADVANCE;
    let h = font;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let rest = match kind {
        LinkKind::Muted => MUTED,
        LinkKind::Jade => JADE,
    };
    let (_scale, t) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 1.0)
    } else {
        (
            motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let t = t.clamp(0.0, 1.0);
    let ink = if disabled { MUTED } else { lerp(rest, JADE, t) };
    draw.label(label, x, y, font, ink);
    if t > 0.02 {
        let uw = w * t;
        let ux = x + (w - uw) * 0.5;
        let uy = y + font + 1.0;
        let mut line = JADE;
        line[3] *= t;
        draw.quad(ux, uy, uw, 1.0, line, 0.0, 1.0);
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
    draw.label(
        format!("onClick fired {} times", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    let font = MD.font;
    draw.label("Read the ", x, y, font, FG);
    x += "Read the ".chars().count() as f32 * font * MONO_ADVANCE;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "docs",
        LinkKind::Muted,
        LinkSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += "docs".chars().count() as f32 * font * MONO_ADVANCE;
    draw.label(" and the ", x, y, font, FG);
    x += " and the ".chars().count() as f32 * font * MONO_ADVANCE;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "source",
        LinkKind::Jade,
        LinkSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += "source".chars().count() as f32 * font * MONO_ADVANCE;
    draw.label(".", x, y, font, FG);

    let y2 = y + 52.0;
    x = 36.0 + x0;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Muted",
        LinkKind::Muted,
        LinkSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += "Muted".chars().count() as f32 * MD.font * MONO_ADVANCE + 24.0;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Jade",
        LinkKind::Jade,
        LinkSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += "Jade".chars().count() as f32 * MD.font * MONO_ADVANCE + 24.0;
    let _ = link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Disabled",
        LinkKind::Muted,
        LinkSize::Md,
        true,
    );

    let y3 = y2 + 52.0;
    x = 36.0 + x0;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        "Small",
        LinkKind::Muted,
        LinkSize::Sm,
        false,
    ) {
        seed.clicks += 1;
    }
    x += "Small".chars().count() as f32 * SM.font * MONO_ADVANCE + 24.0;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        "Medium",
        LinkKind::Jade,
        LinkSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += "Medium".chars().count() as f32 * MD.font * MONO_ADVANCE + 24.0;
    if link(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        "Large",
        LinkKind::Jade,
        LinkSize::Lg,
        false,
    ) {
        seed.clicks += 1;
    }
}
