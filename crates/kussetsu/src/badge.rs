//! Stateless click. Count / status mark. Copy Button.
//! Parent handles the returned bool (clicked). Empty label → status dot.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeKind {
    Primary,
    Ghost,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeSize {
    Sm,
    Md,
    Lg,
}

impl BadgeSize {
    pub fn metrics(self) -> Size {
        let s = match self {
            BadgeSize::Sm => SM,
            BadgeSize::Md => MD,
            BadgeSize::Lg => LG,
        };
        let height = s.height * 0.64;
        Size {
            height,
            pad_x: s.pad_x * 0.65,
            font: s.font - 2.0,
            radius: height * 0.5,
            gap: s.gap,
        }
    }
}

pub fn width(label: &str, size: BadgeSize) -> f32 {
    let s = size.metrics();
    let nchars = label.chars().count() as f32;
    if nchars < 1.0 {
        s.height
    } else {
        (s.pad_x * 2.0 + nchars * s.font * MONO_ADVANCE).max(s.height)
    }
}

pub fn badge(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    kind: BadgeKind,
    size: BadgeSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let nchars = label.chars().count() as f32;
    let w = width(label, size);
    let h = s.height;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == BadgeKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == BadgeKind::Ghost {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == BadgeKind::Ghost {
            1.0
        } else if hot {
            HOVER_SCALE
        } else {
            1.0
        };
        (
            motion.spring_slot(x, y, 0, scale_to, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let (fill, ink, border, bw) = if disabled {
        match kind {
            BadgeKind::Ghost => (WELL, MUTED, CLEAR, 0.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            BadgeKind::Primary => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            BadgeKind::Ghost => {
                let hover = lerp(JADE_DIM, JADE, 0.22);
                let press = lerp(JADE_DIM, JADE, 0.38);
                (mix_phase(JADE_DIM, hover, press, u), JADE, CLEAR, 0.0)
            }
            BadgeKind::Outline => (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    if nchars >= 1.0 {
        draw.label_in(label, x, y, w, h, s.font, ink, scale);
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

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    let n = seed.clicks;
    let count = if n > 99 {
        "99+".to_string()
    } else {
        n.to_string()
    };
    draw.label(
        format!("Parent owns the count ({n}). Click a pill."),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    const GAP: f32 = 8.0;
    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    for (label, kind, disabled) in [
        ("Solid", BadgeKind::Primary, false),
        ("Ghost", BadgeKind::Ghost, false),
        ("Outline", BadgeKind::Outline, false),
        ("Off", BadgeKind::Primary, true),
    ] {
        if badge(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            kind,
            BadgeSize::Md,
            disabled,
        ) {
            seed.clicks += 1;
        }
        x += width(label, BadgeSize::Md) + GAP;
    }

    x = 36.0 + x0;
    let y2 = y + 44.0;
    for (label, kind, size) in [
        ("Sm", BadgeKind::Ghost, BadgeSize::Sm),
        ("Md", BadgeKind::Primary, BadgeSize::Md),
        ("Lg", BadgeKind::Primary, BadgeSize::Lg),
    ] {
        if badge(draw, ptr, motion, dt, x, y2, label, kind, size, false) {
            seed.clicks += 1;
        }
        x += width(label, size) + GAP;
    }

    x = 36.0 + x0;
    let y3 = y2 + 48.0;
    if badge(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        &count,
        BadgeKind::Primary,
        BadgeSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += width(&count, BadgeSize::Md) + GAP;
    let live = if seed.on[1] { "LIVE" } else { "OFF" };
    let live_kind = if seed.on[1] {
        BadgeKind::Primary
    } else {
        BadgeKind::Ghost
    };
    if badge(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        live,
        live_kind,
        BadgeSize::Md,
        false,
    ) {
        seed.on[1] = !seed.on[1];
    }
    x += width(live, BadgeSize::Md) + GAP;
    if badge(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        "NEW",
        BadgeKind::Outline,
        BadgeSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    x += width("NEW", BadgeSize::Md) + GAP;
    let mark = if seed.on[3] {
        BadgeKind::Primary
    } else {
        BadgeKind::Ghost
    };
    if badge(draw, ptr, motion, dt, x, y3, "", mark, BadgeSize::Sm, false) {
        seed.on[3] = !seed.on[3];
    }
    x += width("", BadgeSize::Sm) + GAP;
    let _ = badge(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        "",
        BadgeKind::Primary,
        BadgeSize::Sm,
        true,
    );
    x += width("", BadgeSize::Sm) + GAP;
    let _ = badge(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        "0",
        BadgeKind::Primary,
        BadgeSize::Sm,
        true,
    );
}
