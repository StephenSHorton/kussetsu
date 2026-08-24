//! Controlled 0..1. Copy Switch: parent owns `value`; spring the thumb.
//! Horizontal track. Drag or click to set.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SliderSize {
    Sm,
    Md,
    Lg,
}

impl SliderSize {
    pub fn metrics(self) -> Size {
        match self {
            SliderSize::Sm => SM,
            SliderSize::Md => MD,
            SliderSize::Lg => LG,
        }
    }

    fn thumb(self) -> f32 {
        match self {
            SliderSize::Sm => 16.0,
            SliderSize::Md => 20.0,
            SliderSize::Lg => 24.0,
        }
    }

    fn track_h(self) -> f32 {
        match self {
            SliderSize::Sm => 6.0,
            SliderSize::Md => 8.0,
            SliderSize::Lg => 10.0,
        }
    }
}

/// Jade rail + spring thumb. Returns a new 0..1 value while the track is dragged.
pub fn slider(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    value: f32,
    label: &str,
    size: SliderSize,
    disabled: bool,
) -> Option<f32> {
    let s = size.metrics();
    let h = s.height;
    let thumb = size.thumb();
    let track_h = size.track_h();
    let w = w.max(thumb + 1.0);
    let value = value.clamp(0.0, 1.0);
    let travel = (w - thumb).max(1.0);
    let hot = !disabled && ptr.hit(x, y, w, h);
    let grabbing = !disabled && motion.drag_latch(x, y, 3, ptr.down, ptr.pressed, hot);
    let active = grabbing;
    let next = if active {
        Some(((ptr.x - x - thumb * 0.5) / travel).clamp(0.0, 1.0))
    } else {
        None
    };
    let target = next.unwrap_or(value);
    if active {
        motion.snap_slot(x, y, 0, target);
    }
    let t = motion.spring_toggle(x, y, target, dt).clamp(0.0, 1.0);
    // Hover scale is paint-only on the thumb; the hit box stays `w × h`.
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
    let track_y = y + (h - track_h) * 0.5;
    let tx = x + t * travel;
    let ty = y + (h - thumb) * 0.5;
    let track = if disabled {
        WELL
    } else {
        lerp(WELL, JADE_DIM, u.clamp(0.0, 1.0))
    };
    draw.outline(
        x,
        track_y,
        w,
        track_h,
        track,
        BORDER,
        track_h * 0.5,
        1.0,
        1.0,
    );
    const INSET: f32 = 2.0;
    let inner_h = (track_h - INSET * 2.0).max(1.0);
    let inner_w = (w - INSET * 2.0).max(0.0);
    let fill_w = (t * travel + thumb - INSET).clamp(0.0, inner_w);
    if fill_w > 0.75 {
        let fill = if disabled { MUTED } else { JADE };
        draw.quad(
            x + INSET,
            track_y + INSET,
            fill_w,
            inner_h,
            fill,
            inner_h * 0.5,
            1.0,
        );
    }
    let knob = if disabled { MUTED } else { lerp(FG, INK, t) };
    draw.outline(
        tx,
        ty,
        thumb,
        thumb,
        knob,
        if disabled { BORDER } else { CLEAR },
        thumb * 0.5,
        if disabled { 1.0 } else { 0.0 },
        scale,
    );
    let pct = format!("{}%", (t * 100.0).round() as i32);
    let mut lx = x + w + s.gap;
    let ly = y + (h - s.font) * 0.5;
    let ink = if disabled { MUTED } else { FG };
    draw.label(&pct, lx, ly, s.font, ink);
    if !label.is_empty() {
        lx += pct.chars().count() as f32 * s.font * MONO_ADVANCE + s.gap;
        draw.label(label, lx, ly, s.font, MUTED);
    }
    next
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
    seed.value = seed.value.clamp(0.0, 1.0);

    draw.label(
        "Parent owns 0..1. Drag the thumb.",
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let bar_w = 280.0;
    if let Some(v) = slider(
        draw,
        ptr,
        motion,
        dt,
        x,
        64.0 + y0,
        bar_w,
        seed.value,
        "Live",
        SliderSize::Md,
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

    let mut y = y_btn + SM.height + 24.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 22.0;
    for (name, size) in [
        ("Sm", SliderSize::Sm),
        ("Md", SliderSize::Md),
        ("Lg", SliderSize::Lg),
    ] {
        let s = size.metrics();
        let lw = name.chars().count() as f32 * s.font * MONO_ADVANCE;
        draw.label(name, x, y + (s.height - s.font) * 0.5, s.font, MUTED);
        if let Some(v) = slider(
            draw,
            ptr,
            motion,
            dt,
            x + lw + s.gap,
            y,
            bar_w,
            seed.value,
            "",
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
    let _ = slider(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        bar_w,
        0.62,
        "Off",
        SliderSize::Md,
        true,
    );
}
