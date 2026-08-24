//! Indeterminate wait. Copy this for Skeleton.
//! Parent owns `spinning`. Phase is parent `clock` (catalog advances `seed.clock`).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE, SM,
    WELL,
};
use std::f32::consts::TAU;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpinnerKind {
    Ticks,
    Arc,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpinnerSize {
    Sm,
    Md,
    Lg,
}

impl SpinnerSize {
    pub fn metrics(self) -> Size {
        match self {
            SpinnerSize::Sm => SM,
            SpinnerSize::Md => MD,
            SpinnerSize::Lg => LG,
        }
    }

    fn diameter(self) -> f32 {
        self.metrics().height
    }
}

pub fn spinner(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    clock: f32,
    spinning: bool,
    label: &str,
    kind: SpinnerKind,
    size: SpinnerSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let d = size.diameter();
    let lw = if label.is_empty() {
        0.0
    } else {
        label.chars().count() as f32 * s.font * MONO_ADVANCE
    };
    let w = if lw > 0.0 { d + s.gap + lw } else { d };
    let h = d;
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
    let hover = u.min(1.0);
    let fill = if disabled {
        WELL
    } else {
        lerp(CLEAR, WELL, hover)
    };
    let border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, hover)
    };
    draw.outline(x, y, d, d, fill, border, d * 0.5, 1.0, scale);
    let phase = if spinning && !disabled {
        (clock * 1.05).rem_euclid(1.0)
    } else {
        0.0
    };
    let cx = x + d * 0.5;
    let cy = y + d * 0.5;
    let base_dot = (d * 0.16).clamp(2.5, 7.0);
    let dot = base_dot * scale;
    let radius = (d * 0.5 - base_dot * 0.5 - 1.5) * scale;
    paint_beads(draw, cx, cy, radius, dot, phase, kind, disabled);
    if !label.is_empty() {
        draw.label(
            label,
            x + d + s.gap,
            y + (d - s.font) * 0.5,
            s.font,
            if disabled { MUTED } else { FG },
        );
    }
    !disabled && hot && ptr.pressed
}

fn paint_beads(
    draw: &mut DrawList,
    cx: f32,
    cy: f32,
    radius: f32,
    dot: f32,
    phase: f32,
    kind: SpinnerKind,
    disabled: bool,
) {
    const N: i32 = 12;
    let n = N as f32;
    for i in 0..N {
        let i_f = i as f32;
        let (ang, w, size) = if disabled {
            (i_f / n * TAU, 0.34, dot)
        } else {
            match kind {
                SpinnerKind::Ticks => {
                    let u = i_f / n;
                    let rel = (u - phase).rem_euclid(1.0);
                    (u * TAU, 0.10 + 0.90 * (1.0 - rel).powf(2.5), dot)
                }
                SpinnerKind::Arc => {
                    let t = i_f / (n - 1.0);
                    let head = i == N - 1;
                    (
                        (phase + t * 0.68) * TAU,
                        0.06 + 0.94 * t.powf(1.8),
                        if head { dot * 1.22 } else { dot },
                    )
                }
            }
        };
        let color = if disabled {
            lerp(WELL, MUTED, 0.85)
        } else {
            lerp(WELL, JADE, w)
        };
        let px = cx + ang.cos() * radius - size * 0.5;
        let py = cy + ang.sin() * radius - size * 0.5;
        draw.quad(px, py, size, size, color, size * 0.5, 1.0);
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
    let spinning = !seed.on[0];
    let kind = if seed.choice == 0 {
        SpinnerKind::Ticks
    } else {
        SpinnerKind::Arc
    };
    draw.label(
        format!(
            "onClick fired {} times · {}",
            seed.clicks,
            if spinning { "spinning" } else { "paused" }
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    if spinner(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.clock,
        spinning,
        "Ticks",
        SpinnerKind::Ticks,
        SpinnerSize::Md,
        false,
    ) {
        seed.clicks += 1;
        seed.choice = 0;
        seed.on[0] = !seed.on[0];
    }
    x += 128.0;
    if spinner(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.clock,
        spinning,
        "Arc",
        SpinnerKind::Arc,
        SpinnerSize::Md,
        false,
    ) {
        seed.clicks += 1;
        seed.choice = 1;
        seed.on[0] = !seed.on[0];
    }
    x += 112.0;
    let _ = spinner(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.clock,
        spinning,
        "Disabled",
        kind,
        SpinnerSize::Md,
        true,
    );
    x = 36.0 + x0;
    let y2 = y + 64.0;
    if spinner(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        seed.clock,
        spinning,
        "Small",
        kind,
        SpinnerSize::Sm,
        false,
    ) {
        seed.clicks += 1;
        seed.tab = 0;
        seed.on[0] = !seed.on[0];
    }
    x += 120.0;
    if spinner(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        seed.clock,
        spinning,
        "Medium",
        kind,
        SpinnerSize::Md,
        false,
    ) {
        seed.clicks += 1;
        seed.tab = 1;
        seed.on[0] = !seed.on[0];
    }
    x += 148.0;
    if spinner(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        seed.clock,
        spinning,
        "Large",
        kind,
        SpinnerSize::Lg,
        false,
    ) {
        seed.clicks += 1;
        seed.tab = 2;
        seed.on[0] = !seed.on[0];
    }
}
