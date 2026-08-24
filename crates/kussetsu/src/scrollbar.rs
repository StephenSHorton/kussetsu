//! Overflow chrome. Copy Switch: parent owns `value` (0..1); spring the thumb.
//! Track + thumb. Drag while `ptr.down` on the thumb; click the track to jump.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

const INSET: f32 = 2.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrollbarOrientation {
    Vertical,
    Horizontal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrollbarSize {
    Sm,
    Md,
    Lg,
}

impl ScrollbarSize {
    pub fn metrics(self) -> Size {
        match self {
            ScrollbarSize::Sm => SM,
            ScrollbarSize::Md => MD,
            ScrollbarSize::Lg => LG,
        }
    }

    fn thickness(self) -> f32 {
        self.metrics().radius
    }

    fn hit_cross(self) -> f32 {
        self.thickness().max(16.0)
    }

    fn min_thumb(self) -> f32 {
        match self {
            ScrollbarSize::Sm => 20.0,
            ScrollbarSize::Md => 24.0,
            ScrollbarSize::Lg => 28.0,
        }
    }
}

/// Jade thumb in a WELL gutter. Returns a new 0..1 value while dragging
/// (`ptr.down` on the thumb) or on a track jump.
pub fn scrollbar(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    length: f32,
    value: f32,
    thumb_frac: f32,
    orientation: ScrollbarOrientation,
    size: ScrollbarSize,
    disabled: bool,
) -> Option<f32> {
    let thick = size.thickness();
    let hit_c = size.hit_cross();
    let length = length.max(size.min_thumb() + INSET * 2.0 + 1.0);
    let inner = (length - INSET * 2.0).max(1.0);
    let frac = thumb_frac.clamp(0.08, 1.0);
    let thumb_len = (inner * frac).max(size.min_thumb()).min(inner);
    let travel = (inner - thumb_len).max(0.0);
    let value = value.clamp(0.0, 1.0);

    let (hx, hy, hw, hh, track_x, track_y, track_w, track_h) = match orientation {
        ScrollbarOrientation::Vertical => {
            let pad = (hit_c - thick) * 0.5;
            (x, y, hit_c, length, x + pad, y, thick, length)
        }
        ScrollbarOrientation::Horizontal => {
            let pad = (hit_c - thick) * 0.5;
            (x, y, length, hit_c, x, y + pad, length, thick)
        }
    };

    let along0 = INSET + value * travel;
    let (tx, ty, tw, th) = match orientation {
        ScrollbarOrientation::Vertical => (
            track_x + INSET,
            track_y + along0,
            (track_w - INSET * 2.0).max(2.0),
            thumb_len,
        ),
        ScrollbarOrientation::Horizontal => (
            track_x + along0,
            track_y + INSET,
            thumb_len,
            (track_h - INSET * 2.0).max(2.0),
        ),
    };

    let track_hot = !disabled && ptr.hit(hx, hy, hw, hh);
    // Hit the unscaled gutter × thumb, not the inset paint.
    let thumb_hot = !disabled
        && match orientation {
            ScrollbarOrientation::Vertical => ptr.hit(hx, ty, hw, th),
            ScrollbarOrientation::Horizontal => ptr.hit(tx, hy, tw, hh),
        };
    // Drag while down on the thumb. Track press jumps (same mapping) so the
    // next frames keep the thumb under the cursor. Hit boxes are unscaled.
    let dragging = !disabled
        && motion.drag_latch(x, y, 3, ptr.down, ptr.pressed, thumb_hot || track_hot);
    let wheeled = !disabled && (track_hot || thumb_hot) && ptr.scroll.abs() > 0.1 && travel > 0.5;
    let next = if dragging && travel > 0.5 {
        Some(map_ptr(
            ptr,
            track_x,
            track_y,
            thumb_len,
            travel,
            orientation,
        ))
    } else if wheeled {
        let delta = match orientation {
            ScrollbarOrientation::Vertical => ptr.scroll / travel,
            ScrollbarOrientation::Horizontal => ptr.scroll / travel,
        };
        Some((value + delta).clamp(0.0, 1.0))
    } else {
        None
    };
    let active = next.is_some();
    let target = next.unwrap_or(value);
    if active {
        motion.snap_slot(x, y, 0, target);
    }
    let t = motion.spring_toggle(x, y, target, dt).clamp(0.0, 1.0);

    let hot = track_hot || thumb_hot;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 1, HOVER_SCALE);
        motion.snap_slot(x, y, 2, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, y, 1, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 2, if hot { 1.0 } else { 0.0 }, dt),
        )
    };

    let hover = u.min(1.0);
    let track = if disabled {
        WELL
    } else {
        lerp(WELL, JADE_DIM, hover)
    };
    let radius = thick * 0.5;
    draw.outline(
        track_x, track_y, track_w, track_h, track, BORDER, radius, 1.0, 1.0,
    );
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(
            track_x, track_y, track_w, track_h, wash, CLEAR, radius, 0.0, 1.0,
        );
    }

    let along = INSET + t * travel;
    let (px, py, pw, ph) = match orientation {
        ScrollbarOrientation::Vertical => (
            track_x + INSET,
            track_y + along,
            (track_w - INSET * 2.0).max(2.0),
            thumb_len,
        ),
        ScrollbarOrientation::Horizontal => (
            track_x + along,
            track_y + INSET,
            thumb_len,
            (track_h - INSET * 2.0).max(2.0),
        ),
    };
    let thumb = if disabled {
        MUTED
    } else {
        mix_phase(lerp(JADE_DIM, JADE, 0.45), JADE, lerp(JADE, INK, 0.22), u)
    };
    let (ring, bw) = if disabled {
        (BORDER, 1.0)
    } else {
        (CLEAR, 0.0)
    };
    let thumb_r = pw.min(ph) * 0.5;
    draw.outline(px, py, pw, ph, thumb, ring, thumb_r, bw, scale);
    next
}

fn map_ptr(
    ptr: Pointer,
    track_x: f32,
    track_y: f32,
    thumb_len: f32,
    travel: f32,
    orientation: ScrollbarOrientation,
) -> f32 {
    let along = match orientation {
        ScrollbarOrientation::Vertical => ptr.y - track_y - INSET,
        ScrollbarOrientation::Horizontal => ptr.x - track_x - INSET,
    };
    let travel = travel.max(1.0);
    ((along - thumb_len * 0.5) / travel).clamp(0.0, 1.0)
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

const LINES: [&str; 14] = [
    "Overflow chrome.",
    "Parent owns 0..1.",
    "Drag the jade thumb.",
    "Click the track to jump.",
    "Inkstone well.",
    "Jade for primary.",
    "Hit box stays put.",
    "Scale is paint-only.",
    "Disabled swallows clicks.",
    "Sizes copy tokens.",
    "Vertical and horizontal.",
    "Motion springs the thumb.",
    "Seed value is shared.",
    "Thumb is the viewport.",
];

fn overflow_pane(draw: &mut DrawList, x: f32, y: f32, w: f32, h: f32, value: f32) {
    draw.outline(x, y, w, h, WELL, BORDER, MD.radius, 1.0, 1.0);
    let pad = 10.0;
    let font = 12.0;
    let line_h = font + 6.0;
    let inner_h = (h - pad * 2.0).max(line_h);
    let content_h = LINES.len() as f32 * line_h;
    let extra = (content_h - inner_h).max(0.0);
    let scroll = value.clamp(0.0, 1.0) * extra;
    let top = y + pad;
    let bot = y + h - pad;
    for (i, line) in LINES.iter().enumerate() {
        let ly = top + i as f32 * line_h - scroll;
        if ly + font < top || ly > bot - 2.0 {
            continue;
        }
        let max_w = (w - pad * 2.0).max(0.0);
        let n = (max_w / (font * MONO_ADVANCE)).floor() as usize;
        if n == 0 {
            continue;
        }
        let shown: String = line.chars().take(n).collect();
        draw.label(shown, x + pad, ly, font, FG);
    }
}

fn pane_thumb_frac(h: f32) -> f32 {
    let pad = 10.0;
    let font = 12.0;
    let line_h = font + 6.0;
    let inner_h = (h - pad * 2.0).max(line_h);
    let content_h = LINES.len() as f32 * line_h;
    (inner_h / content_h.max(1.0)).clamp(0.12, 1.0)
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
    seed.value = seed.value.clamp(0.0, 1.0);

    let pct = (seed.value * 100.0).round() as i32;
    draw.label(
        format!("Parent owns 0..1. Hover the pane and scroll · {pct}%"),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let pane_w = 280.0;
    let pane_h = 112.0;
    let y_pane = 64.0 + y0;
    overflow_pane(draw, x, y_pane, pane_w, pane_h, seed.value);

    let frac = pane_thumb_frac(pane_h);
    let hbar_h = ScrollbarSize::Md.hit_cross();
    let pad = 10.0;
    let line_h = 18.0;
    let extra = ((LINES.len() as f32 * line_h) - (pane_h - pad * 2.0)).max(1.0);
    let over_pane = ptr.hit(x, y_pane, pane_w, pane_h);
    if over_pane && ptr.scroll.abs() > 0.1 {
        seed.wheel_taken = true;
        seed.value = (seed.value + ptr.scroll / extra).clamp(0.0, 1.0);
    }

    let vbar_x = x + pane_w + MD.gap;
    if let Some(v) = scrollbar(
        draw,
        ptr,
        motion,
        dt,
        vbar_x,
        y_pane,
        pane_h,
        seed.value,
        frac,
        ScrollbarOrientation::Vertical,
        ScrollbarSize::Md,
        false,
    ) {
        seed.value = v;
        if ptr.scroll.abs() > 0.1 {
            seed.wheel_taken = true;
        }
    }

    let y_hbar = y_pane + pane_h + MD.gap;
    if let Some(v) = scrollbar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_hbar,
        pane_w,
        seed.value,
        frac,
        ScrollbarOrientation::Horizontal,
        ScrollbarSize::Md,
        false,
    ) {
        seed.value = v;
        if ptr.scroll.abs() > 0.1 {
            seed.wheel_taken = true;
        }
    }

    let y_btn = y_hbar + hbar_h + 12.0;
    let mut bx = x;
    let presets: [(&str, f32); 5] = [
        ("0%", 0.0),
        ("25%", 0.25),
        ("50%", 0.5),
        ("75%", 0.75),
        ("100%", 1.0),
    ];
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
    let bar_len = 88.0;
    let mut vx = x;
    for (name, size) in [
        ("Sm", ScrollbarSize::Sm),
        ("Md", ScrollbarSize::Md),
        ("Lg", ScrollbarSize::Lg),
    ] {
        let font = size.metrics().font;
        draw.label(name, vx, y, font, MUTED);
        if let Some(v) = scrollbar(
            draw,
            ptr,
            motion,
            dt,
            vx,
            y + font + 6.0,
            bar_len,
            seed.value,
            0.28,
            ScrollbarOrientation::Vertical,
            size,
            false,
        ) {
            seed.value = v;
        }
        vx += size.hit_cross() + 36.0;
    }

    y += font_row() + 6.0 + bar_len + 16.0;
    draw.label("Disabled", x, y, 14.0, MUTED);
    y += 22.0;
    let _ = scrollbar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        bar_len,
        0.62,
        0.28,
        ScrollbarOrientation::Vertical,
        ScrollbarSize::Md,
        true,
    );
    let _ = scrollbar(
        draw,
        ptr,
        motion,
        dt,
        x + ScrollbarSize::Md.hit_cross() + MD.gap,
        y,
        pane_w - ScrollbarSize::Md.hit_cross() - MD.gap,
        0.62,
        0.28,
        ScrollbarOrientation::Horizontal,
        ScrollbarSize::Md,
        true,
    );
}

fn font_row() -> f32 {
    LG.font.max(MD.font).max(SM.font)
}
