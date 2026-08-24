//! Chip. Copy Button outline/ghost. Optional dismiss x returns clicked.
//! Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TagKind {
    Ghost,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TagSize {
    Sm,
    Md,
    Lg,
}

impl TagSize {
    pub fn metrics(self) -> Size {
        match self {
            TagSize::Sm => SM,
            TagSize::Md => MD,
            TagSize::Lg => LG,
        }
    }
}

pub fn tag(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    kind: TagKind,
    size: TagSize,
    dismiss: bool,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let font = s.font;
    let label_w = label.chars().count() as f32 * font * MONO_ADVANCE;
    let mark_w = font * MONO_ADVANCE;
    let extra = if dismiss { s.gap + mark_w } else { 0.0 };
    let w = s.pad_x * 2.0 + label_w + extra;
    let h = s.height;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let mark_x = x + s.pad_x + label_w + s.gap;
    let x_hot = dismiss && !disabled && ptr.hit(mark_x - s.gap, y, mark_w + s.gap + s.pad_x, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == TagKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == TagKind::Ghost {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == TagKind::Ghost {
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
            TagKind::Ghost => (CLEAR, MUTED, CLEAR, 0.0),
            TagKind::Outline => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            TagKind::Ghost => {
                let hover = JADE_DIM;
                let press = [JADE[0], JADE[1], JADE[2], 0.22];
                (mix_phase(CLEAR, hover, press, u), FG, CLEAR, 0.0)
            }
            TagKind::Outline => (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    if dismiss {
        draw.label_in(label, x + s.pad_x, y, label_w, h, font, ink, scale);
        draw.label_in("×", mark_x, y, mark_w, h, font, MUTED, scale);
    } else {
        draw.label_in(label, x, y, w, h, font, ink, scale);
    }
    let fire = if dismiss { x_hot } else { hot };
    !disabled && fire && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn width(label: &str, size: TagSize, dismiss: bool) -> f32 {
    let s = size.metrics();
    let extra = if dismiss {
        s.gap + s.font * MONO_ADVANCE
    } else {
        0.0
    };
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE + extra
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
    const GAP: f32 = 8.0;
    draw.label(
        format!(
            "onClick fired {} times · × dismisses (parent owns on[])",
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    for (label, kind, disabled) in [
        ("Ghost", TagKind::Ghost, false),
        ("Outline", TagKind::Outline, false),
        ("Disabled", TagKind::Outline, true),
    ] {
        if tag(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            kind,
            TagSize::Md,
            false,
            disabled,
        ) {
            seed.clicks += 1;
        }
        x += width(label, TagSize::Md, false) + GAP;
    }

    x = 36.0 + x0;
    let y2 = y + 52.0;
    for (label, size, kind) in [
        ("Small", TagSize::Sm, TagKind::Ghost),
        ("Medium", TagSize::Md, TagKind::Outline),
        ("Large", TagSize::Lg, TagKind::Outline),
    ] {
        if tag(
            draw, ptr, motion, dt, x, y2, label, kind, size, false, false,
        ) {
            seed.clicks += 1;
        }
        x += width(label, size, false) + GAP;
    }

    x = 36.0 + x0;
    let y3 = y2 + 52.0;
    for (i, label) in ["All", "GPU", "Native"].iter().enumerate() {
        let on = seed.choice == i as u32;
        let kind = if on { TagKind::Outline } else { TagKind::Ghost };
        if tag(
            draw,
            ptr,
            motion,
            dt,
            x,
            y3,
            label,
            kind,
            TagSize::Md,
            false,
            false,
        ) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        x += width(label, TagSize::Md, false) + GAP;
    }

    x = 36.0 + x0;
    let y4 = y3 + 52.0;
    const CHIPS: [&str; 4] = ["Ink", "Jade", "Well", "Rain"];
    for (i, label) in CHIPS.iter().enumerate() {
        if seed.on[i] {
            continue;
        }
        if tag(
            draw,
            ptr,
            motion,
            dt,
            x,
            y4,
            label,
            TagKind::Outline,
            TagSize::Md,
            true,
            false,
        ) {
            seed.on[i] = true;
            seed.clicks += 1;
        }
        x += width(label, TagSize::Md, true) + GAP;
    }
    if seed.on.iter().take(4).any(|gone| *gone) {
        if tag(
            draw,
            ptr,
            motion,
            dt,
            x,
            y4,
            "Restore",
            TagKind::Ghost,
            TagSize::Md,
            false,
            false,
        ) {
            for slot in seed.on.iter_mut().take(4) {
                *slot = false;
            }
            seed.clicks += 1;
        }
    }
}
