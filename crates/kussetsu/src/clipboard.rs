//! Copy affordance. Stateless click; parent owns the copied flash.
//! Button that flashes "Copied". Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipboardKind {
    Primary,
    Ghost,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipboardSize {
    Sm,
    Md,
    Lg,
}

impl ClipboardSize {
    pub fn metrics(self) -> Size {
        match self {
            ClipboardSize::Sm => SM,
            ClipboardSize::Md => MD,
            ClipboardSize::Lg => LG,
        }
    }
}

/// Value well + Copy button. `copied` is parent-owned; returns clicked.
pub fn clipboard(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    value: &str,
    copied: bool,
    kind: ClipboardKind,
    size: ClipboardSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let font = s.font;
    let n = value.chars().count().max(1) as f32;
    let field_w = s.pad_x * 2.0 + n * font * MONO_ADVANCE;
    // Size to "Copied" so the layout box does not jump when the label swaps.
    let btn_w = s.pad_x * 2.0 + 6.0 * font * MONO_ADVANCE;
    let h = s.height;
    let bx = x + field_w + s.gap;
    let hot = !disabled && ptr.hit(x, y, field_w + s.gap + btn_w, h);
    let active = hot && ptr.down;
    let clicked = hot && ptr.pressed;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == ClipboardKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == ClipboardKind::Ghost {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == ClipboardKind::Ghost {
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
    let flash = motion
        .spring_slot(x, y, 2, if copied { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    let flash = if clicked {
        motion.snap_slot(x, y, 2, 1.0);
        1.0
    } else {
        flash
    };

    let field_fill = if disabled {
        lerp(WELL, SCRIM, 0.35)
    } else {
        lerp(WELL, JADE, flash * 0.18)
    };
    let field_border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, flash)
    };
    let field_ink = if disabled {
        MUTED
    } else {
        lerp(FG, JADE, flash * 0.55)
    };
    draw.outline(
        x,
        y,
        field_w,
        h,
        field_fill,
        field_border,
        s.radius,
        1.0,
        1.0,
    );
    draw.label_in(value, x, y, field_w, h, font, field_ink, 1.0);

    let (mut fill, mut ink, mut border, mut bw) = if disabled {
        match kind {
            ClipboardKind::Ghost => (CLEAR, MUTED, CLEAR, 0.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            ClipboardKind::Primary => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            ClipboardKind::Ghost => {
                let hover = JADE_DIM;
                let press = [JADE[0], JADE[1], JADE[2], 0.22];
                (mix_phase(CLEAR, hover, press, u), FG, CLEAR, 0.0)
            }
            ClipboardKind::Outline => (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0),
        }
    };
    if !disabled && flash > 0.0 {
        let jade = [JADE[0], JADE[1], JADE[2], 0.92];
        fill = lerp(fill, jade, flash);
        ink = lerp(ink, INK, flash);
        border = lerp(border, CLEAR, flash);
        bw *= 1.0 - flash;
    }
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(bx, y, btn_w, h, fill, border, s.radius, bw, scale);
    }
    let caption = if copied || flash > 0.45 {
        "Copied"
    } else {
        "Copy"
    };
    draw.label_in(caption, bx, y, btn_w, h, font, ink, scale);
    if clicked {
        draw.copy_text = Some(value.to_string());
    }
    clicked
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn width(value: &str, size: ClipboardSize) -> f32 {
    let s = size.metrics();
    let n = value.chars().count().max(1) as f32;
    let field_w = s.pad_x * 2.0 + n * s.font * MONO_ADVANCE;
    let btn_w = s.pad_x * 2.0 + 6.0 * s.font * MONO_ADVANCE;
    field_w + s.gap + btn_w
}

fn tap(seed: &mut crate::ui::SeedState) {
    seed.on[0] = true;
    seed.value = 1.4;
    seed.clicks += 1;
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
        seed.value -= dt;
        if seed.value <= 0.0 {
            seed.on[0] = false;
            seed.value = 0.0;
        }
    }

    let copied = seed.on[0];
    draw.label(
        format!(
            "Parent owns the flash. Copied {} times{}",
            seed.clicks,
            if copied { " · live" } else { "" }
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    if clipboard(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "npx kussetsu add",
        copied,
        ClipboardKind::Primary,
        ClipboardSize::Md,
        false,
    ) {
        tap(seed);
    }

    x = 36.0 + x0;
    let y2 = y + 52.0;
    for (value, kind, disabled) in [
        ("ghost", ClipboardKind::Ghost, false),
        ("outline", ClipboardKind::Outline, false),
        ("locked", ClipboardKind::Primary, true),
    ] {
        if clipboard(
            draw,
            ptr,
            motion,
            dt,
            x,
            y2,
            value,
            seed.on[0] && !disabled,
            kind,
            ClipboardSize::Md,
            disabled,
        ) {
            tap(seed);
        }
        x += width(value, ClipboardSize::Md) + MD.gap;
    }

    x = 36.0 + x0;
    let y3 = y2 + 52.0;
    for (value, size, kind) in [
        ("sm", ClipboardSize::Sm, ClipboardKind::Ghost),
        ("md", ClipboardSize::Md, ClipboardKind::Primary),
        ("lg", ClipboardSize::Lg, ClipboardKind::Outline),
    ] {
        if clipboard(
            draw, ptr, motion, dt, x, y3, value, seed.on[0], kind, size, false,
        ) {
            tap(seed);
        }
        x += width(value, size) + MD.gap;
    }
}
