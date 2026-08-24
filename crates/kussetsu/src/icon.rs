//! GPU geometry icons (check, x, chevron, plus) from quads. Copy Button.
//! Parent handles the returned bool (clicked). No SVG files.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IconMark {
    Check,
    X,
    Chevron,
    Plus,
}

impl IconMark {
    pub fn name(self) -> &'static str {
        match self {
            IconMark::Check => "Check",
            IconMark::X => "X",
            IconMark::Chevron => "Chevron",
            IconMark::Plus => "Plus",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IconKind {
    Primary,
    Ghost,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IconSize {
    Sm,
    Md,
    Lg,
}

impl IconSize {
    pub fn metrics(self) -> Size {
        match self {
            IconSize::Sm => SM,
            IconSize::Md => MD,
            IconSize::Lg => LG,
        }
    }
}

pub fn icon(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    mark: IconMark,
    kind: IconKind,
    size: IconSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let d = s.height;
    let hot = !disabled && ptr.hit(x, y, d, d);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == IconKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == IconKind::Ghost {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == IconKind::Ghost {
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
            IconKind::Ghost => (CLEAR, MUTED, CLEAR, 0.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            IconKind::Primary => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            IconKind::Ghost => {
                let hover = JADE_DIM;
                let press = [JADE[0], JADE[1], JADE[2], 0.22];
                (
                    mix_phase(CLEAR, hover, press, u),
                    lerp(FG, JADE, u.min(1.0)),
                    CLEAR,
                    0.0,
                )
            }
            IconKind::Outline => (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, d, d, fill, border, s.radius, bw, scale);
    }
    if disabled && kind != IconKind::Ghost {
        let mut veil = SCRIM;
        veil[3] *= 0.25;
        draw.quad(x, y, d, d, veil, s.radius, 1.0);
    }
    paint_mark(draw, mark, x, y, d, ink, scale);
    !disabled && hot && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn paint_mark(
    draw: &mut DrawList,
    mark: IconMark,
    x: f32,
    y: f32,
    d: f32,
    color: [f32; 4],
    scale: f32,
) {
    let ox = x + d * 0.5;
    let oy = y + d * 0.5;
    let inset = d * 0.22;
    let x0 = x + inset;
    let y0 = y + inset;
    let inner = (d - inset * 2.0).max(4.0);
    let thick = (d * (2.0 / 24.0)).clamp(1.75, 3.75);
    match mark {
        IconMark::Plus => {
            let cx = x0 + inner * 0.5;
            let cy = y0 + inner * 0.5;
            bar(
                draw,
                x0,
                cy - thick * 0.5,
                inner,
                thick,
                color,
                ox,
                oy,
                scale,
            );
            bar(
                draw,
                cx - thick * 0.5,
                y0,
                thick,
                inner,
                color,
                ox,
                oy,
                scale,
            );
        }
        IconMark::X => {
            stroke(
                draw,
                x0,
                y0,
                x0 + inner,
                y0 + inner,
                thick,
                color,
                ox,
                oy,
                scale,
            );
            stroke(
                draw,
                x0 + inner,
                y0,
                x0,
                y0 + inner,
                thick,
                color,
                ox,
                oy,
                scale,
            );
        }
        IconMark::Check => {
            let ax = x0 + inner * 0.05;
            let ay = y0 + inner * 0.50;
            let bx = x0 + inner * 0.36;
            let by = y0 + inner * 0.84;
            let cx = x0 + inner * 0.98;
            let cy = y0 + inner * 0.16;
            stroke(draw, ax, ay, bx, by, thick, color, ox, oy, scale);
            stroke(draw, bx, by, cx, cy, thick, color, ox, oy, scale);
        }
        IconMark::Chevron => {
            let ax = x0 + inner * 0.30;
            let ay = y0 + inner * 0.12;
            let bx = x0 + inner * 0.72;
            let by = y0 + inner * 0.50;
            let cx = x0 + inner * 0.30;
            let cy = y0 + inner * 0.88;
            stroke(draw, ax, ay, bx, by, thick, color, ox, oy, scale);
            stroke(draw, bx, by, cx, cy, thick, color, ox, oy, scale);
        }
    }
}

/// Axis-aligned stadium. Scale is around the icon origin, not the bar center.
fn bar(
    draw: &mut DrawList,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color: [f32; 4],
    ox: f32,
    oy: f32,
    sc: f32,
) {
    let mx = ox + (x + w * 0.5 - ox) * sc;
    let my = oy + (y + h * 0.5 - oy) * sc;
    let w = w * sc;
    let h = h * sc;
    let r = w.min(h) * 0.5;
    draw.quad(mx - w * 0.5, my - h * 0.5, w, h, color, r, 1.0);
}

/// Round-capped stroke from overlapping circular quads (same trick as spinner beads).
fn stroke(
    draw: &mut DrawList,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    thick: f32,
    color: [f32; 4],
    ox: f32,
    oy: f32,
    sc: f32,
) {
    let ax = ox + (x0 - ox) * sc;
    let ay = oy + (y0 - oy) * sc;
    let bx = ox + (x1 - ox) * sc;
    let by = oy + (y1 - oy) * sc;
    let t = (thick * sc).max(1.2);
    let dx = bx - ax;
    let dy = by - ay;
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let step = (t * 0.38).max(0.55);
    let n = ((len / step).ceil() as i32).clamp(2, 28);
    for i in 0..=n {
        let u = i as f32 / n as f32;
        let px = ax + dx * u - t * 0.5;
        let py = ay + dy * u - t * 0.5;
        draw.quad(px, py, t, t, color, t * 0.5, 1.0);
    }
}

fn caption(draw: &mut DrawList, x: f32, y: f32, d: f32, text: &str) {
    let font = SM.font;
    let tw = text.chars().count() as f32 * font * MONO_ADVANCE;
    draw.label(text, x + (d - tw) * 0.5, y + d + 6.0, font, MUTED);
}

const MARKS: [IconMark; 4] = [
    IconMark::Check,
    IconMark::X,
    IconMark::Chevron,
    IconMark::Plus,
];

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    const GAP: f32 = 16.0;
    let picked = (seed.choice as usize) % MARKS.len();
    let mark = MARKS[picked];
    draw.label(
        format!("onClick fired {} times · {}", seed.clicks, mark.name()),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    let md = IconSize::Md.metrics().height;
    for (i, m) in MARKS.iter().copied().enumerate() {
        let kind = if i == picked {
            IconKind::Primary
        } else {
            IconKind::Ghost
        };
        if icon(draw, ptr, motion, dt, x, y, m, kind, IconSize::Md, false) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        caption(draw, x, y, md, m.name());
        x += md + GAP;
    }

    let y2 = y + md + 32.0;
    x = 36.0 + x0;
    for (kind, name) in [
        (IconKind::Ghost, "Ghost"),
        (IconKind::Outline, "Outline"),
        (IconKind::Primary, "Primary"),
    ] {
        if icon(
            draw,
            ptr,
            motion,
            dt,
            x,
            y2,
            mark,
            kind,
            IconSize::Md,
            false,
        ) {
            seed.clicks += 1;
        }
        caption(draw, x, y2, md, name);
        x += md + GAP;
    }
    let _ = icon(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        mark,
        IconKind::Primary,
        IconSize::Md,
        true,
    );
    caption(draw, x, y2, md, "Disabled");

    let y3 = y2 + md + 32.0;
    x = 36.0 + x0;
    let tab = seed.tab % 3;
    for (i, (size, name)) in [
        (IconSize::Sm, "Sm"),
        (IconSize::Md, "Md"),
        (IconSize::Lg, "Lg"),
    ]
    .into_iter()
    .enumerate()
    {
        let d = size.metrics().height;
        let kind = if tab == i as u32 {
            IconKind::Primary
        } else {
            IconKind::Outline
        };
        if icon(draw, ptr, motion, dt, x, y3, mark, kind, size, false) {
            seed.clicks += 1;
            seed.tab = i as u32;
        }
        caption(draw, x, y3, d, name);
        x += d + GAP;
    }
}
