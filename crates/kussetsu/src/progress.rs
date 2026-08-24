//! Determinate transfer bar. Copy Switch: parent owns `value` (0..1).
//! Motion springs the jade fill inside a WELL track.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::switch::switch;
use crate::tokens::{
    lerp, Size, BORDER, FG, HOVER_SCALE, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE,
    SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProgressSize {
    Sm,
    Md,
    Lg,
}

impl ProgressSize {
    pub fn metrics(self) -> Size {
        match self {
            ProgressSize::Sm => SM,
            ProgressSize::Md => MD,
            ProgressSize::Lg => LG,
        }
    }
}

/// Jade fill in a WELL track. Returns a new 0..1 value when the track is clicked.
pub fn progress(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    value: f32,
    size: ProgressSize,
    disabled: bool,
) -> Option<f32> {
    let s = size.metrics();
    let hit_h = s.height;
    let bar_h = s.radius;
    let bar_y = y + (hit_h - bar_h) * 0.5;
    let value = value.clamp(0.0, 1.0);
    let hot = !disabled && ptr.hit(x, y, w, hit_h);
    let active = hot && ptr.down;
    let t = motion.spring(x, y, value, dt).clamp(0.0, 1.0);
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 1, HOVER_SCALE);
        motion.snap_slot(x, y, 2, 1.0);
        (PRESS_SCALE, 1.0)
    } else {
        (
            motion.spring_slot(x, y, 1, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 2, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let track = if disabled {
        WELL
    } else {
        lerp(WELL, JADE_DIM, u.clamp(0.0, 1.0))
    };
    draw.outline(x, bar_y, w, bar_h, track, BORDER, bar_h * 0.5, 1.0, scale);
    const INSET: f32 = 2.0;
    let inner_h = (bar_h - INSET * 2.0).max(1.0);
    let inner_w = (w - INSET * 2.0).max(0.0);
    let fill_w = inner_w * t;
    if fill_w > 0.75 {
        let fill = if disabled { MUTED } else { JADE };
        draw.quad(
            x + INSET,
            bar_y + INSET,
            fill_w,
            inner_h,
            fill,
            inner_h * 0.5,
            1.0,
        );
    }
    let pct = format!("{}%", (t * 100.0).round() as i32);
    let lx = x + w + s.gap;
    let ly = y + (hit_h - s.font) * 0.5;
    draw.label(pct, lx, ly, s.font, if disabled { MUTED } else { FG });
    if !disabled && hot && ptr.pressed {
        Some(((ptr.x - x) / w.max(1.0)).clamp(0.0, 1.0))
    } else {
        None
    }
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
    if seed.on[0] {
        seed.value += dt * 0.12;
        if seed.value >= 1.0 {
            seed.value = 0.0;
        }
    }
    seed.value = seed.value.clamp(0.0, 1.0);

    draw.label(
        "Parent owns 0..1. Click the track to set.",
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let bar_w = 280.0;
    if let Some(v) = progress(
        draw,
        ptr,
        motion,
        dt,
        x,
        64.0 + y0,
        bar_w,
        seed.value,
        ProgressSize::Md,
        false,
    ) {
        seed.value = v;
    }

    let y_btn = 64.0 + y0 + MD.height + 12.0;
    let mut bx = x;
    let presets: [(&str, f32); 5] = [
        ("0%", 0.0),
        ("25%", 0.25),
        ("50%", 0.5),
        ("75%", 0.75),
        ("100%", 1.0),
    ];
    for (label, v) in presets {
        if button(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y_btn,
            label,
            ButtonKind::Ghost,
            ButtonSize::Sm,
            false,
        ) {
            seed.value = v;
        }
        let bw = SM.pad_x * 2.0 + label.chars().count() as f32 * SM.font * MONO_ADVANCE;
        bx += bw + SM.gap;
    }
    if button(
        draw,
        ptr,
        motion,
        dt,
        bx,
        y_btn,
        "+10%",
        ButtonKind::Outline,
        ButtonSize::Sm,
        false,
    ) {
        seed.value = (seed.value + 0.1).min(1.0);
    }

    let y_auto = y_btn + SM.height + 16.0;
    if switch(draw, ptr, motion, dt, x, y_auto, seed.on[0], "Auto", false) {
        seed.on[0] = !seed.on[0];
    }

    let mut y = y_auto + 26.0 + 28.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 22.0;
    for (name, size) in [
        ("Sm", ProgressSize::Sm),
        ("Md", ProgressSize::Md),
        ("Lg", ProgressSize::Lg),
    ] {
        let s = size.metrics();
        let lw = name.chars().count() as f32 * s.font * MONO_ADVANCE;
        draw.label(name, x, y + (s.height - s.font) * 0.5, s.font, MUTED);
        if let Some(v) = progress(
            draw,
            ptr,
            motion,
            dt,
            x + lw + s.gap,
            y,
            bar_w,
            seed.value,
            size,
            false,
        ) {
            seed.value = v;
        }
        y += s.height + s.gap;
    }

    y += 8.0;
    draw.label("Disabled", x, y, 14.0, MUTED);
    y += 22.0;
    let _ = progress(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        bar_w,
        0.62,
        ProgressSize::Md,
        true,
    );
}
