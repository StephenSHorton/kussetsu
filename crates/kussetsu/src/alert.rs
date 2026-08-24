//! Inline banner, not a modal. Copy Button (stateless click).
//! Parent owns dismissed / kind. WELL + BORDER + title/body.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertKind {
    Info,
    Success,
    Warn,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertSize {
    Sm,
    Md,
    Lg,
}

impl AlertSize {
    pub fn metrics(self) -> Size {
        match self {
            AlertSize::Sm => SM,
            AlertSize::Md => MD,
            AlertSize::Lg => LG,
        }
    }
}

pub fn alert(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    title: &str,
    body: &str,
    kind: AlertKind,
    size: AlertSize,
    disabled: bool,
) -> bool {
    let g = geo(w, title, body, size);
    let h = g.h;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let (fill, border, title_c, body_c, rail, mark_c) = if disabled {
        (WELL, BORDER, MUTED, MUTED, BORDER, MUTED)
    } else {
        match kind {
            AlertKind::Info => (
                mix_phase(WELL, lerp(WELL, BORDER, 0.7), BORDER, u),
                BORDER,
                FG,
                MUTED,
                MUTED,
                MUTED,
            ),
            AlertKind::Success => (
                mix_phase(WELL, JADE_DIM, lerp(JADE_DIM, JADE, 0.18), u),
                JADE,
                JADE,
                MUTED,
                JADE,
                MUTED,
            ),
            AlertKind::Warn => (
                mix_phase(WELL, lerp(WELL, FG, 0.06), lerp(WELL, INK, 0.35), u),
                BORDER,
                FG,
                MUTED,
                FG,
                FG,
            ),
        }
    };
    draw.outline(x, y, w, h, fill, border, g.radius, 1.0, scale);
    let cx = x + w * 0.5;
    let cy = y + h * 0.5;
    let rail_x = x + 6.0;
    let rail_y = y + 8.0;
    let rail_h = (h - 16.0).max(8.0);
    let rx = cx + (rail_x - cx) * scale;
    let ry = cy + (rail_y - cy) * scale;
    draw.quad(
        rx,
        ry,
        g.rail_w * scale,
        rail_h * scale,
        rail,
        g.rail_w * 0.5 * scale,
        1.0,
    );
    let tx = x + g.text_dx;
    let ty = y + g.pad;
    draw.label_swoop(
        title,
        tx,
        ty,
        g.title_size,
        title_c,
        scale,
        cx,
        cy,
        g.text_w,
        g.title_h + g.title_size,
    );
    if !body.is_empty() {
        draw.label_swoop(
            body,
            tx,
            ty + g.title_h + g.body_gap,
            g.body_size,
            body_c,
            scale,
            cx,
            cy,
            g.text_w,
            g.body_h + g.body_size,
        );
    }
    draw.label_swoop(
        "×",
        x + w - g.pad - g.mark_w,
        ty,
        g.title_size,
        mark_c,
        scale,
        cx,
        cy,
        0.0,
        0.0,
    );
    !disabled && hot && ptr.pressed
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
    let x = 36.0 + x0;
    let w = 440.0;
    draw.label(
        format!(
            "Inline, not modal. Clicks {} · banner {}",
            seed.clicks,
            if seed.on[0] { "hidden" } else { "shown" }
        ),
        x,
        36.0 + y0,
        14.0,
        MUTED,
    );
    let samples: [(AlertKind, AlertSize, &str, &str); 3] = [
        (
            AlertKind::Info,
            AlertSize::Sm,
            "Info",
            "WELL + BORDER. Click to acknowledge.",
        ),
        (
            AlertKind::Success,
            AlertSize::Md,
            "Success",
            "Jade accent. Parent owns the click count.",
        ),
        (
            AlertKind::Warn,
            AlertSize::Lg,
            "Warn",
            "High contrast, still inkstone. No new hues.",
        ),
    ];
    let mut y = 72.0 + y0;
    for (i, (kind, size, title, body)) in samples.iter().enumerate() {
        let h = geo(w, title, body, *size).h;
        if alert(
            draw, ptr, motion, dt, x, y, w, title, body, *kind, *size, false,
        ) {
            seed.clicks += 1;
            seed.choice = i as u32;
        }
        y += h + 14.0;
    }
    let disabled_title = "Disabled";
    let disabled_body = "Clicks are swallowed.";
    let dh = geo(w, disabled_title, disabled_body, AlertSize::Md).h;
    let _ = alert(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        disabled_title,
        disabled_body,
        AlertKind::Info,
        AlertSize::Md,
        true,
    );
    y += dh + 18.0;
    if !seed.on[0] {
        let kind = match seed.choice % 3 {
            0 => AlertKind::Info,
            1 => AlertKind::Success,
            _ => AlertKind::Warn,
        };
        let title = "Dismissible";
        let body = "Click the banner to hide it. State stays in the parent.";
        if alert(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            title,
            body,
            kind,
            AlertSize::Md,
            false,
        ) {
            seed.on[0] = true;
            seed.clicks += 1;
        }
    } else if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "Show alert",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) {
        seed.on[0] = false;
    }
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

struct Geo {
    h: f32,
    pad: f32,
    radius: f32,
    title_size: f32,
    body_size: f32,
    text_dx: f32,
    text_w: f32,
    title_h: f32,
    body_h: f32,
    body_gap: f32,
    rail_w: f32,
    mark_w: f32,
}

fn geo(w: f32, title: &str, body: &str, size: AlertSize) -> Geo {
    let s = size.metrics();
    let pad = s.pad_x;
    let rail_w = 3.0;
    let title_size = s.font;
    let body_size = (s.font - 2.0).max(11.0);
    let mark_w = title_size * MONO_ADVANCE;
    let text_dx = pad + rail_w + s.gap;
    let text_w = (w - text_dx - pad - mark_w - s.gap).max(48.0);
    let tcols = (text_w / (title_size * MONO_ADVANCE)).max(8.0) as usize;
    let bcols = (text_w / (body_size * MONO_ADVANCE)).max(8.0) as usize;
    let tlines = if title.is_empty() {
        0
    } else {
        wrap_line_count(title, tcols).max(1)
    };
    let blines = if body.is_empty() {
        0
    } else {
        wrap_line_count(body, bcols).max(1)
    };
    let title_h = tlines as f32 * title_size * 1.3;
    let body_h = blines as f32 * body_size * 1.3;
    let body_gap = if blines == 0 { 0.0 } else { s.gap };
    let h = (pad + title_h + body_gap + body_h + pad).max(s.height);
    Geo {
        h,
        pad,
        radius: s.radius,
        title_size,
        body_size,
        text_dx,
        text_w,
        title_h,
        body_h,
        body_gap,
        rail_w,
        mark_w,
    }
}

fn wrap_line_count(text: &str, cols: usize) -> usize {
    if text.is_empty() {
        return 1;
    }
    let mut lines = 0;
    for para in text.split('\n') {
        lines += 1;
        let mut col = 0;
        for word in para.split_whitespace() {
            let w = word.chars().count().max(1);
            if col == 0 {
                col = w;
                continue;
            }
            if col + 1 + w <= cols {
                col += 1 + w;
            } else {
                lines += 1 + w.saturating_sub(1) / cols;
                col = w % cols;
            }
        }
    }
    lines.max(1)
}
