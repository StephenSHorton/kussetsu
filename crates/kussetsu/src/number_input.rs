//! Numeric stepper. Copy Switch: parent owns `value`; Motion springs the digits.
//! Input well + minus / plus Buttons.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, JADE, LG, MD, MONO_ADVANCE, MUTED, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberInputKind {
    Outline,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberInputSize {
    Sm,
    Md,
    Lg,
}

impl NumberInputSize {
    pub fn metrics(self) -> Size {
        match self {
            NumberInputSize::Sm => SM,
            NumberInputSize::Md => MD,
            NumberInputSize::Lg => LG,
        }
    }

    fn button(self) -> ButtonSize {
        match self {
            NumberInputSize::Sm => ButtonSize::Sm,
            NumberInputSize::Md => ButtonSize::Md,
            NumberInputSize::Lg => ButtonSize::Lg,
        }
    }
}

const MINUS: &str = "-";
const PLUS: &str = "+";

fn btn_w(label: &str, size: ButtonSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE
}

fn format_value(v: f32) -> String {
    format!("{:.2}", v)
}

fn field_chars(min: f32, max: f32) -> f32 {
    let n = format_value(min)
        .chars()
        .count()
        .max(format_value(max).chars().count())
        .max(4);
    n as f32
}

fn field_w(min: f32, max: f32, s: Size) -> f32 {
    s.pad_x * 2.0 + field_chars(min, max) * s.font * MONO_ADVANCE
}

pub fn number_input_width(min: f32, max: f32, size: NumberInputSize) -> f32 {
    let s = size.metrics();
    let bs = size.button();
    btn_w(MINUS, bs) + s.gap + field_w(min, max, s) + s.gap + btn_w(PLUS, bs)
}

fn nudge(value: f32, dir: f32, step: f32, min: f32, max: f32) -> f32 {
    let step = step.abs();
    if step < 1e-6 {
        return value.clamp(min, max);
    }
    (value + dir * step).clamp(min, max)
}

/// Input well between minus / plus. Returns a new clamped value when a stepper fires.
pub fn number_input(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    value: f32,
    step: f32,
    min: f32,
    max: f32,
    label: &str,
    kind: NumberInputKind,
    size: NumberInputSize,
    disabled: bool,
    typed: Option<&str>,
) -> Option<f32> {
    let s = size.metrics();
    let bs = size.button();
    let bk = match kind {
        NumberInputKind::Outline => ButtonKind::Outline,
        NumberInputKind::Ghost => ButtonKind::Ghost,
    };
    let h = s.height;
    let minus_w = btn_w(MINUS, bs);
    let plus_w = btn_w(PLUS, bs);
    let field = field_w(min, max, s);
    let fx = x + minus_w + s.gap;
    let px = fx + field + s.gap;
    let min = min.min(max);
    let max = max.max(min);
    let value = value.clamp(min, max);
    let lo = value <= min + 1e-4;
    let hi = value >= max - 1e-4;

    let hot = !disabled && ptr.hit(fx, y, field, h);
    let active = hot && ptr.down;
    let u = if disabled {
        0.0
    } else if active {
        motion.snap_slot(fx, y, 1, 1.0);
        2.0
    } else {
        motion.spring_slot(fx, y, 1, if hot { 1.0 } else { 0.0 }, dt)
    };

    crate::glass::chrome(draw, fx, y, field, h, s.radius);
    let (border, bw, ink) = if disabled {
        (BORDER, 1.0, MUTED)
    } else {
        match kind {
            NumberInputKind::Outline => (
                lerp(BORDER, JADE, u.min(1.0)),
                1.0,
                lerp(FG, JADE, u.min(1.0) * 0.35),
            ),
            NumberInputKind::Ghost => (
                lerp(CLEAR, JADE, u.min(1.0)),
                if u > 0.04 { 1.0 } else { 0.0 },
                lerp(MUTED, FG, u.min(1.0)),
            ),
        }
    };

    let shown = motion.spring_slot(fx, y, 5, value, dt).clamp(min, max);
    let text = typed
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format_value(shown));

    if bw > 0.0 {
        draw.outline(fx, y, field, h, CLEAR, border, s.radius, bw, 1.0);
    }
    draw.label_in(text, fx, y, field, h, s.font, ink, 1.0);

    let minus = button(draw, ptr, motion, dt, x, y, MINUS, bk, bs, disabled || lo);
    let plus = button(draw, ptr, motion, dt, px, y, PLUS, bk, bs, disabled || hi);

    if !label.is_empty() {
        let lx = px + plus_w + s.gap;
        draw.label(
            label,
            lx,
            y + (h - s.font) * 0.5,
            s.font,
            if disabled { MUTED } else { FG },
        );
    }

    if minus {
        Some(nudge(value, -1.0, step, min, max))
    } else if plus {
        Some(nudge(value, 1.0, step, min, max))
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
    const STEP: f32 = 0.1;
    const MIN: f32 = 0.0;
    const MAX: f32 = 1.0;
    seed.value = seed.value.clamp(MIN, MAX);
    if seed.on[0] {
        crate::input::apply_keys(&mut seed.note, &seed.typed, seed.backspace);
        let cleaned: String = seed
            .note
            .chars()
            .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
            .collect();
        if cleaned != seed.note {
            seed.note = cleaned;
        }
        if let Ok(v) = seed.note.parse::<f32>() {
            seed.value = v.clamp(MIN, MAX);
        }
    } else if seed.note.is_empty() {
        seed.note = format_value(seed.value);
    }

    draw.label(
        format!(
            "Parent owns 0..1. Step 0.1 · {:.2} · {} steps",
            seed.value, seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    if let Some(v) = number_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        64.0 + y0,
        seed.value,
        STEP,
        MIN,
        MAX,
        "Live",
        NumberInputKind::Outline,
        NumberInputSize::Md,
        false,
        if seed.on[0] {
            Some(seed.note.as_str())
        } else {
            None
        },
    ) {
        seed.value = v;
        seed.note = format_value(v);
        seed.on[0] = false;
        seed.clicks += 1;
    }
    let live_field = x + btn_w(MINUS, ButtonSize::Md) + MD.gap;
    if ptr.released && ptr.hit(live_field, 64.0 + y0, field_w(MIN, MAX, MD), MD.height) {
        seed.on[0] = true;
        seed.note = format_value(seed.value);
    }

    let y_btn = 64.0 + y0 + MD.height + 12.0;
    let mut bx = x;
    let presets: [(&str, f32); 3] = [("0.00", 0.0), ("0.50", 0.5), ("1.00", 1.0)];
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
        ("Sm", NumberInputSize::Sm),
        ("Md", NumberInputSize::Md),
        ("Lg", NumberInputSize::Lg),
    ] {
        let s = size.metrics();
        let lw = name.chars().count() as f32 * s.font * MONO_ADVANCE;
        draw.label(name, x, y + (s.height - s.font) * 0.5, s.font, MUTED);
        if let Some(v) = number_input(
            draw,
            ptr,
            motion,
            dt,
            x + lw + s.gap,
            y,
            seed.value,
            STEP,
            MIN,
            MAX,
            "",
            NumberInputKind::Outline,
            size,
            false,
            None,
        ) {
            seed.value = v;
            seed.clicks += 1;
        }
        y += s.height + s.gap;
    }

    y += 8.0;
    draw.label("Ghost", x, y, 14.0, MUTED);
    y += 22.0;
    if let Some(v) = number_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.value,
        STEP,
        MIN,
        MAX,
        "Quiet",
        NumberInputKind::Ghost,
        NumberInputSize::Md,
        false,
        None,
    ) {
        seed.value = v;
        seed.clicks += 1;
    }

    y += MD.height + 20.0;
    draw.label("Disabled", x, y, 14.0, MUTED);
    y += 22.0;
    let _ = number_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        0.62,
        STEP,
        MIN,
        MAX,
        "Off",
        NumberInputKind::Outline,
        NumberInputSize::Md,
        true,
        None,
    );
}
