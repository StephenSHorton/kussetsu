//! Stateless click. Copy this for Badge / Tag / Toggle / Dropdown Button.
//! Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    self, BORDER, CLEAR, HOVER_SCALE, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE, SM,
    Size, FG, WELL, lerp,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ButtonKind {
    Primary,
    Ghost,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ButtonSize {
    Sm,
    Md,
    Lg,
}

impl ButtonSize {
    pub fn metrics(self) -> Size {
        match self {
            ButtonSize::Sm => SM,
            ButtonSize::Md => MD,
            ButtonSize::Lg => LG,
        }
    }
}

pub fn button(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    kind: ButtonKind,
    size: ButtonSize,
    disabled: bool,
) -> bool {
    button_zoom(draw, ptr, motion, dt, x, y, label, kind, size, disabled, 1.0)
}

pub fn button_zoom(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    kind: ButtonKind,
    size: ButtonSize,
    disabled: bool,
    zoom: f32,
) -> bool {
    let s = size.metrics();
    let zoom = zoom.max(0.01);
    let font = s.font * zoom;
    let w = (s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE) * zoom;
    let h = s.height * zoom;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == ButtonKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(x, y, 0, if kind == ButtonKind::Ghost { 1.0 } else { HOVER_SCALE });
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == ButtonKind::Ghost {
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
            ButtonKind::Ghost => (CLEAR, MUTED, CLEAR, 0.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            ButtonKind::Primary => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), tokens::INK, CLEAR, 0.0)
            }
            ButtonKind::Ghost => {
                let hover = JADE_DIM;
                let press = [JADE[0], JADE[1], JADE[2], 0.22];
                (mix_phase(CLEAR, hover, press, u), FG, CLEAR, 0.0)
            }
            ButtonKind::Outline => (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius * zoom, bw, scale);
    }
    draw.label_in(label, x, y, w, h, font, ink, scale);
    !disabled && hot && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}
