//! Digit cells. Parent owns the code string. Keyboard digits and paste fill cells.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED, SCRIM, SM,
    WELL,
};



#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OtpKind {
    Digits,
    Masked,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OtpSize {
    Sm,
    Md,
    Lg,
}

impl OtpSize {
    pub fn metrics(self) -> Size {
        match self {
            OtpSize::Sm => SM,
            OtpSize::Md => MD,
            OtpSize::Lg => LG,
        }
    }
}

fn clamp_len(len: u32) -> u32 {
    len.clamp(4, 6)
}

fn cell_side(s: Size) -> f32 {
    (s.pad_x * 2.0 + s.font * MONO_ADVANCE).max(s.height)
}

pub fn width(len: u32, size: OtpSize) -> f32 {
    let n = clamp_len(len) as f32;
    let s = size.metrics();
    n * cell_side(s) + (n - 1.0) * s.gap
}

/// Parent owns `value` (digit string). Returns true on click (focus).
pub fn otp_input(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    value: &str,
    len: u32,
    kind: OtpKind,
    size: OtpSize,
    disabled: bool,
) -> bool {
    let len = clamp_len(len);
    let digits: Vec<char> = value.chars().filter(|c| c.is_ascii_digit()).take(len as usize).collect();
    let filled = digits.len() as u32;
    let s = size.metrics();
    let cell = cell_side(s);
    let gap = s.gap;
    let h = s.height;
    let w = width(len, size);
    let hot = !disabled && ptr.hit(x, y, w, h);
    let jade92 = [JADE[0], JADE[1], JADE[2], 0.92];
    let jade_press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];

    for i in 0..len {
        let cx = x + i as f32 * (cell + gap);
        let cell_hot = hot && ptr.hit(cx, y, cell, h);
        let active = cell_hot && ptr.down;
        let insert = i == filled && filled < len;
        let t = motion
            .spring_toggle(cx, y, if i < filled { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0);
            let u = if disabled {
            0.0
        } else if active {
            motion.snap_slot(cx, y, 2, 1.0);
            2.0
        } else {
            motion.spring_slot(cx, y, 2, if cell_hot { 1.0 } else { 0.0 }, dt)
        };
        let focus = if disabled {
            0.0
        } else {
            motion
                .spring_slot(cx, y, 3, if insert { 1.0 } else { 0.0 }, dt)
                .clamp(0.0, 1.0)
        };
        let hover = u.min(1.0);
        let (fill, ink, border, bw) = if disabled {
            (WELL, MUTED, BORDER, 1.0)
        } else {
            let (rest_fill, rest_ink, rest_border, rest_bw) = match kind {
                OtpKind::Digits => (WELL, FG, BORDER, 1.0),
                OtpKind::Masked => (WELL, MUTED, BORDER, 1.0),
            };
            let (done_fill, done_ink, done_border, done_bw) = match kind {
                OtpKind::Digits => (jade92, INK, CLEAR, 0.0),
                OtpKind::Masked => (JADE_DIM, JADE, JADE, 1.0),
            };
            let fill = mix_phase(
                lerp(rest_fill, done_fill, t),
                lerp(JADE_DIM, jade92, t),
                jade_press,
                u,
            );
            let ink = lerp(rest_ink, done_ink, t);
            let border = lerp(lerp(rest_border, done_border, t), JADE, hover.max(focus));
            let bw = (rest_bw + (done_bw - rest_bw) * t).max(focus).max(hover);
            (fill, ink, border, bw)
        };
        if fill[3] > 0.02 || bw > 0.0 {
            draw.outline(cx, y, cell, h, fill, border, s.radius, bw, 1.0);
        }
        if t > 0.08 {
            match kind {
                OtpKind::Digits => {
                    let mut glyph = ink;
                    glyph[3] *= t;
                    let ch = digits.get(i as usize).copied().unwrap_or(' ');
                    draw.label_in(ch.to_string(), cx, y, cell, h, s.font, glyph, 1.0);
                }
                OtpKind::Masked => {
                    let d = (s.font * 0.42 * t).max(2.0);
                    let mut dot = ink;
                    dot[3] *= t;
                    draw.quad(
                        cx + (cell - d) * 0.5,
                        y + (h - d) * 0.5,
                        d,
                        d,
                        dot,
                        d * 0.5,
                        1.0,
                    );
                }
            }
        }
        let caret = focus * (1.0 - t);
        if caret > 0.08 {
            let mut bar = JADE;
            bar[3] *= caret;
            if u > 1.0 {
                bar = lerp(bar, INK, (u - 1.0) * SCRIM[3]);
            }
            draw.quad(
                cx + (cell - 2.0) * 0.5,
                y + h * 0.28,
                2.0,
                h * 0.44,
                bar,
                1.0,
                1.0,
            );
        }
    }
    !disabled && hot && ptr.released
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn apply_otp(seed: &mut crate::ui::SeedState, len: usize) {
    let mut d: String = seed
        .field
        .chars()
        .filter(|c| c.is_ascii_digit())
        .take(len)
        .collect();
    if seed.edit.backspace {
        d.pop();
    }
    for c in seed.edit.typed.chars().chain(seed.edit.clip.chars()) {
        if c.is_ascii_digit() && d.len() < len {
            d.push(c);
        }
    }
    if seed.field != d {
        seed.field = d;
        seed.clicks += 1;
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
    apply_otp(seed, 6);
    let filled = seed.field.chars().filter(|c| c.is_ascii_digit()).count() as u32;
    let status = if filled >= 6 { "complete" } else { "type digits" };
    draw.label(
        format!(
            "Parent owns filled · {filled} / 6 · {status} · {} clicks",
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        if filled == 0 { MUTED } else { JADE },
    );

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    if otp_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &seed.field,
        6,
        OtpKind::Digits,
        OtpSize::Md,
        false,
    ) {
        seed.on[0] = true;
        seed.clicks += 1;
    }

    y += MD.height + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 20.0;
    let _ = otp_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "482",
        6,
        OtpKind::Digits,
        OtpSize::Md,
        true,
    );

    y += MD.height + 20.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 20.0;
    if otp_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &seed.field,
        6,
        OtpKind::Digits,
        OtpSize::Sm,
        false,
    ) {
        seed.on[0] = true;
    }

    y += SM.height + 16.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 20.0;
    if otp_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &seed.field,
        6,
        OtpKind::Digits,
        OtpSize::Lg,
        false,
    ) {
        seed.on[0] = true;
    }

    y += LG.height + 20.0;
    draw.label("4 digits", x, y, 12.0, MUTED);
    y += 20.0;
    if otp_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &seed.field,
        4,
        OtpKind::Digits,
        OtpSize::Md,
        false,
    ) {
        seed.on[0] = true;
    }

    y += MD.height + 20.0;
    draw.label("Masked", x, y, 12.0, MUTED);
    y += 20.0;
    if otp_input(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &seed.field,
        6,
        OtpKind::Masked,
        OtpSize::Md,
        false,
    ) {
        seed.on[0] = true;
    }
}
