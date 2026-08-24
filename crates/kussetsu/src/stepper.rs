//! Numbered steps 1..n. Copy Switch: parent owns `current`; Motion springs the jade track.
//! Jade for done, MUTED ahead. Click returns `Some(index)`.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepperSize {
    Sm,
    Md,
    Lg,
}

impl StepperSize {
    pub fn metrics(self) -> Size {
        match self {
            StepperSize::Sm => SM,
            StepperSize::Md => MD,
            StepperSize::Lg => LG,
        }
    }
}

const NUMS: [&str; 12] = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
];

/// Parent owns `current` (0-based). Returns the step that was pressed, if any.
pub fn stepper(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    labels: &[&str],
    current: u32,
    size: StepperSize,
    disabled: bool,
) -> Option<u32> {
    let n = labels.len().min(NUMS.len());
    if n == 0 {
        return None;
    }
    let s = size.metrics();
    let d = s.height;
    let font = s.font;
    let labeled = labels.iter().any(|l| !l.is_empty());
    let mut max_lw = 0.0f32;
    for label in labels.iter().take(n) {
        let lw = label.chars().count() as f32 * font * MONO_ADVANCE;
        if lw > max_lw {
            max_lw = lw;
        }
    }
    let col = (d + s.pad_x * 2.0).max(max_lw + s.gap);
    let h = if labeled { d + s.gap + font } else { d };
    let current = current.min((n - 1) as u32);

    let first_cx = x + col * 0.5;
    let last_cx = x + col * (n as f32 - 0.5);
    let span = (last_cx - first_cx).max(0.0);
    if n > 1 && span > 0.5 {
        let progress = current as f32 / (n as f32 - 1.0);
        let t = if disabled {
            progress
        } else {
            motion.spring_toggle(x, y + d, progress, dt).clamp(0.0, 1.0)
        };
        let ty = y + d * 0.5 - 1.0;
        let inset = d * 0.5;
        let line_x = first_cx + inset;
        let line_span = (span - d).max(0.0);
        draw.quad(line_x, ty, line_span, 2.0, MUTED, 1.0, 1.0);
        let fill_w = line_span * t;
        if fill_w > 0.5 {
            let jade = if disabled { MUTED } else { JADE };
            draw.quad(line_x, ty, fill_w, 2.0, jade, 1.0, 1.0);
        }
    }

    let mut picked = None;
    for i in 0..n {
        let cx = x + i as f32 * col;
        if node(
            draw, ptr, motion, dt, cx, y, col, d, h, NUMS[i], labels[i], labeled, i as u32,
            current, disabled, s,
        ) {
            picked = Some(i as u32);
        }
    }
    picked
}

fn node(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    col: f32,
    d: f32,
    h: f32,
    num: &str,
    label: &str,
    labeled: bool,
    index: u32,
    current: u32,
    disabled: bool,
    s: Size,
) -> bool {
    let nx = x + (col - d) * 0.5;
    let hot = !disabled && ptr.hit(x, y, col, h);
    let active = hot && ptr.down;
    let phase_to = if index < current {
        2.0
    } else if index == current {
        1.0
    } else {
        0.0
    };
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(nx, y, 0, HOVER_SCALE);
        motion.snap_slot(nx, y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(nx, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(nx, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let p = if disabled {
        phase_to
    } else {
        motion.spring_slot(nx, y, 2, phase_to, dt)
    }
    .clamp(0.0, 2.0);

    let (mut fill, mut ink, mut border, mut bw) = style_at(p);
    if disabled {
        fill = if p >= 1.5 {
            lerp(WELL, MUTED, 0.7)
        } else {
            WELL
        };
        ink = MUTED;
        border = BORDER;
        bw = 1.0;
    } else {
        let hover = lerp(fill, JADE_DIM, 0.55);
        let press = lerp(fill, INK, SCRIM[3] * 0.4);
        fill = mix_phase(fill, hover, press, u);
        if p < 1.0 {
            ink = lerp(ink, JADE, u.min(1.0));
            border = lerp(border, JADE, u.min(1.0));
        }
    }
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(nx, y, d, d, fill, border, d * 0.5, bw, scale);
    }
    let nchars = num.chars().count() as f32;
    let nfont = s.font.min((d * 0.72) / (nchars * MONO_ADVANCE).max(0.01));
    draw.label_in(num, nx, y, d, d, nfont, ink, scale);

    if labeled && !label.is_empty() {
        let lw = label.chars().count() as f32 * s.font * MONO_ADVANCE;
        let lx = x + (col - lw) * 0.5;
        let ly = y + d + s.gap;
        let label_ink = if disabled {
            MUTED
        } else if p <= 1.0 {
            lerp(MUTED, FG, p)
        } else {
            lerp(FG, JADE, (p - 1.0).clamp(0.0, 1.0))
        };
        draw.label(label, lx, ly, s.font, label_ink);
    }
    !disabled && hot && ptr.pressed
}

fn style_at(p: f32) -> ([f32; 4], [f32; 4], [f32; 4], f32) {
    let ahead = (CLEAR, MUTED, BORDER, 1.0);
    let now = (WELL, FG, JADE, 1.0);
    let done = ([JADE[0], JADE[1], JADE[2], 0.92], INK, CLEAR, 0.0);
    if p <= 1.0 {
        lerp_style(ahead, now, p)
    } else {
        lerp_style(now, done, p - 1.0)
    }
}

fn lerp_style(
    a: ([f32; 4], [f32; 4], [f32; 4], f32),
    b: ([f32; 4], [f32; 4], [f32; 4], f32),
    t: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], f32) {
    let t = t.clamp(0.0, 1.0);
    (
        lerp(a.0, b.0, t),
        lerp(a.1, b.1, t),
        lerp(a.2, b.2, t),
        a.3 + (b.3 - a.3) * t,
    )
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn step_h(size: StepperSize) -> f32 {
    let s = size.metrics();
    s.height + s.gap + s.font
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
    const STEPS: [&str; 4] = ["Cart", "Ship", "Pay", "Done"];
    let n = STEPS.len() as u32;
    seed.choice = seed.choice.min(n - 1);
    let at = seed.choice;
    let here = STEPS[at as usize];
    draw.label(
        format!(
            "Parent owns the step. {} / {n} · {here} · {} clicks",
            at + 1,
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    if let Some(i) = stepper(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &STEPS,
        at,
        StepperSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    y += step_h(StepperSize::Md) + 16.0;
    let back_off = at == 0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "Back",
        ButtonKind::Ghost,
        ButtonSize::Md,
        back_off,
    ) {
        seed.choice = at.saturating_sub(1);
        seed.clicks += 1;
    }
    let back_w = MD.pad_x * 2.0 + 4.0 * MD.font * MONO_ADVANCE;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x + back_w + MD.gap,
        y,
        "Next",
        ButtonKind::Primary,
        ButtonSize::Md,
        at + 1 >= n,
    ) {
        seed.choice = (at + 1).min(n - 1);
        seed.clicks += 1;
    }

    y += MD.height + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 20.0;
    let _ = stepper(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &STEPS,
        at,
        StepperSize::Md,
        true,
    );

    y += step_h(StepperSize::Md) + 16.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 20.0;
    if let Some(i) = stepper(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &STEPS,
        at,
        StepperSize::Sm,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    y += step_h(StepperSize::Sm) + 16.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 20.0;
    if let Some(i) = stepper(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &STEPS,
        at,
        StepperSize::Lg,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
}
