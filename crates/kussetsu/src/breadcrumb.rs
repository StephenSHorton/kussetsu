//! Path crumbs. Copy Button (stateless click). Parent owns the index.
//! MUTED separators. Last crumb FG. Click returns `Some(index)`.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, FG, HOVER_SCALE, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BreadcrumbSize {
    Sm,
    Md,
    Lg,
}

impl BreadcrumbSize {
    pub fn metrics(self) -> Size {
        match self {
            BreadcrumbSize::Sm => SM,
            BreadcrumbSize::Md => MD,
            BreadcrumbSize::Lg => LG,
        }
    }
}

pub fn breadcrumb(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    crumbs: &[&str],
    size: BreadcrumbSize,
    disabled: bool,
) -> Option<u32> {
    let s = size.metrics();
    let n = crumbs.len();
    if n == 0 {
        return None;
    }
    let mut cx = x;
    let mut hit = None;
    for (i, label) in crumbs.iter().enumerate() {
        let last = i + 1 == n;
        if crumb(
            draw, ptr, motion, dt, cx, y, label, s.font, s.height, last, disabled,
        ) {
            hit = Some(i as u32);
        }
        cx += crumb_w(label, s.font);
        if !last {
            let sep = " / ";
            let ly = y + (s.height - s.font) * 0.5;
            draw.label(sep, cx, ly, s.font, MUTED);
            cx += sep_w(s.font);
        }
    }
    hit
}

fn crumb_w(label: &str, font: f32) -> f32 {
    label.chars().count() as f32 * font * MONO_ADVANCE
}

fn sep_w(font: f32) -> f32 {
    3.0 * font * MONO_ADVANCE
}

fn crumb(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    font: f32,
    h: f32,
    last: bool,
    disabled: bool,
) -> bool {
    let w = crumb_w(label, font);
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let rest = if last { FG } else { MUTED };
    let (scale, t) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 1.0)
    } else {
        (
            motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let t = t.clamp(0.0, 1.0);
    let ink = if disabled { MUTED } else { lerp(rest, JADE, t) };
    draw.label_in(label, x, y, w, h, font, ink, scale);
    if t > 0.02 {
        let uw = w * t;
        let ux = x + (w - uw) * 0.5;
        let text_top = y + (h - font) * 0.5;
        let uy = text_top + font + 1.0;
        let mut line = JADE;
        line[3] *= t;
        draw.quad(ux, uy, uw, 1.0, line, 0.0, scale);
    }
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
    const PATH: [&str; 4] = ["Home", "Projects", "Kussetsu", "Breadcrumb"];
    let n = PATH.len() as u32;
    let at = seed.choice.min(n - 1);
    let here = PATH[at as usize];
    draw.label(
        format!("choice {at} {here} · {} clicks", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let y = 72.0 + y0;
    if let Some(i) = breadcrumb(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &PATH,
        BreadcrumbSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    let y2 = y + 52.0;
    draw.label("Parent slices to the clicked crumb.", x, y2, 13.0, MUTED);
    let y3 = y2 + 22.0;
    if let Some(i) = breadcrumb(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        &PATH[..=at as usize],
        BreadcrumbSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    let y4 = y3 + 52.0;
    draw.label("Disabled", x, y4, 13.0, MUTED);
    let y5 = y4 + 22.0;
    let _ = breadcrumb(
        draw,
        ptr,
        motion,
        dt,
        x,
        y5,
        &PATH,
        BreadcrumbSize::Md,
        true,
    );

    let y6 = y5 + 52.0;
    if let Some(i) = breadcrumb(
        draw,
        ptr,
        motion,
        dt,
        x,
        y6,
        &PATH,
        BreadcrumbSize::Sm,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    let y7 = y6 + 40.0;
    if let Some(i) = breadcrumb(
        draw,
        ptr,
        motion,
        dt,
        x,
        y7,
        &PATH,
        BreadcrumbSize::Lg,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
}
