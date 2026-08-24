//! Controlled boolean. Copy this for Checkbox / Radio / Slider.
//! Parent owns `checked`. Motion is shared (`Motion::spring`).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{self, BORDER, FG, JADE, JADE_DIM, MD, MONO_ADVANCE, MUTED, lerp};

pub fn switch(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    checked: bool,
    label: &str,
    disabled: bool,
) -> bool {
    const TW: f32 = 44.0;
    const TH: f32 = 26.0;
    const THUMB: f32 = 20.0;
    const INSET: f32 = 3.0;
    let lw = label.chars().count() as f32 * MD.font * MONO_ADVANCE;
    let hot = !disabled && ptr.hit(x, y, TW + 10.0 + lw, TH);
    let t = motion
        .spring_toggle(x, y, if checked { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    let fill = if disabled {
        BORDER
    } else {
        lerp(JADE_DIM, JADE, t)
    };
    draw.quad(x, y, TW, TH, fill, TH * 0.5, 1.0);
    let tx = x + INSET + t * (TW - THUMB - INSET * 2.0);
    let thumb = if disabled {
        MUTED
    } else {
        lerp(FG, tokens::INK, t)
    };
    draw.quad(tx, y + INSET, THUMB, THUMB, thumb, THUMB * 0.5, 1.0);
    draw.label(
        label,
        x + TW + 10.0,
        y + (TH - MD.font) * 0.5,
        MD.font,
        if disabled { MUTED } else { FG },
    );
    !disabled && hot && ptr.released
}
