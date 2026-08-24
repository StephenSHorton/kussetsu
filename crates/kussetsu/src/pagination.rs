//! Page buttons. Parent owns `page` (`seed.choice`). Copy Button + Switch spring.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaginationKind {
    /// Page numbers only.
    Pages,
    /// Prev + pages + Next.
    Controls,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaginationSize {
    Sm,
    Md,
    Lg,
}

impl PaginationSize {
    pub fn metrics(self) -> Size {
        match self {
            PaginationSize::Sm => SM,
            PaginationSize::Md => MD,
            PaginationSize::Lg => LG,
        }
    }
}

const PAGE_LABELS: [&str; 16] = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16",
];

/// Returns the page that was clicked (0-based), if any.
pub fn pagination(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    page: u32,
    pages: u32,
    kind: PaginationKind,
    size: PaginationSize,
    disabled: bool,
) -> Option<u32> {
    let s = size.metrics();
    let pages = pages.clamp(1, PAGE_LABELS.len() as u32);
    let page = page.min(pages - 1);
    let digits = if pages < 10 { 1.0 } else { 2.0 };
    let cell_w = s.pad_x * 2.0 + digits * s.font * MONO_ADVANCE;
    let prev_w = item_w("Prev", s);
    let gap = s.gap;
    let mut cx = x;
    let mut picked = None;

    if kind == PaginationKind::Controls {
        let off = disabled || page == 0;
        if chip(
            draw,
            ptr,
            motion,
            dt,
            cx,
            y,
            prev_w,
            "Prev",
            Chip::Outline,
            off,
            s,
        ) {
            picked = Some(page.saturating_sub(1));
        }
        cx += prev_w + gap;
    }

    let pages_x0 = cx;
    for i in 0..pages {
        let label = PAGE_LABELS[i as usize];
        let chip_kind = if i == page {
            Chip::Primary
        } else {
            Chip::Outline
        };
        if chip(
            draw, ptr, motion, dt, cx, y, cell_w, label, chip_kind, disabled, s,
        ) {
            picked = Some(i);
        }
        cx += cell_w + gap;
    }

    // Sliding jade underline — Switch spring on the selected page.
    let target = pages_x0 + page as f32 * (cell_w + gap);
    let ux = motion.spring(pages_x0, y + s.height, target, dt);
    let rule = if disabled { MUTED } else { JADE };
    draw.quad(
        ux + 8.0,
        y + s.height + 2.0,
        (cell_w - 16.0).max(8.0),
        2.0,
        rule,
        1.0,
        1.0,
    );

    if kind == PaginationKind::Controls {
        let off = disabled || page + 1 >= pages;
        let next_w = item_w("Next", s);
        if chip(
            draw,
            ptr,
            motion,
            dt,
            cx,
            y,
            next_w,
            "Next",
            Chip::Outline,
            off,
            s,
        ) {
            picked = Some((page + 1).min(pages - 1));
        }
    }

    picked
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Chip {
    Primary,
    Outline,
}

fn item_w(label: &str, s: Size) -> f32 {
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE
}

fn chip(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    label: &str,
    kind: Chip,
    disabled: bool,
    s: Size,
) -> bool {
    let h = s.height;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let selected = kind == Chip::Primary;
    let sel = if disabled {
        if selected {
            1.0
        } else {
            0.0
        }
    } else {
        motion
            .spring_slot(x, y, 2, if selected { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0)
    };
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
    let (fill, ink, border, bw) = if disabled {
        (WELL, MUTED, BORDER, 1.0)
    } else {
        let rest = [JADE[0], JADE[1], JADE[2], 0.92];
        let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
        let primary = (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0);
        let outline = (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0);
        (
            lerp(outline.0, primary.0, sel),
            lerp(outline.1, primary.1, sel),
            lerp(outline.2, primary.2, sel),
            outline.3 + (primary.3 - outline.3) * sel,
        )
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    draw.label_in(label, x, y, w, h, s.font, ink, scale);
    !disabled && hot && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
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
    const PAGES: u32 = 5;
    seed.choice %= PAGES;

    draw.label("Parent owns the page.", 36.0 + x0, 36.0 + y0, 14.0, MUTED);

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    if let Some(p) = pagination(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        PAGES,
        PaginationKind::Controls,
        PaginationSize::Md,
        false,
    ) {
        seed.choice = p;
    }
    y += MD.height + 16.0;
    draw.label(
        format!("Page {} of {}", seed.choice + 1, PAGES),
        x,
        y,
        14.0,
        FG,
    );

    y += 32.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 20.0;
    if let Some(p) = pagination(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        PAGES,
        PaginationKind::Controls,
        PaginationSize::Sm,
        false,
    ) {
        seed.choice = p;
    }

    y += SM.height + 16.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 20.0;
    if let Some(p) = pagination(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        PAGES,
        PaginationKind::Controls,
        PaginationSize::Lg,
        false,
    ) {
        seed.choice = p;
    }

    y += LG.height + 20.0;
    draw.label("Pages only", x, y, 12.0, MUTED);
    y += 20.0;
    if let Some(p) = pagination(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        PAGES,
        PaginationKind::Pages,
        PaginationSize::Md,
        false,
    ) {
        seed.choice = p;
    }

    y += MD.height + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 20.0;
    let _ = pagination(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        PAGES,
        PaginationKind::Controls,
        PaginationSize::Md,
        true,
    );
}
