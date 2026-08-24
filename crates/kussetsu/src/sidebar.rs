//! Mini rail. WELL column, items, selected jade. Copy Button + Switch.
//! Parent owns `selected` (`seed.choice`). Click returns `Some(index)`.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SidebarKind {
    /// Glyph column.
    Mini,
    /// Labeled workspace channels.
    Rail,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SidebarSize {
    Sm,
    Md,
    Lg,
}

impl SidebarSize {
    pub fn metrics(self) -> Size {
        match self {
            SidebarSize::Sm => SM,
            SidebarSize::Md => MD,
            SidebarSize::Lg => LG,
        }
    }
}

const INSET: f32 = 6.0;
const BAR: f32 = 3.0;

pub fn sidebar_size(items: &[&str], kind: SidebarKind, size: SidebarSize) -> (f32, f32) {
    let s = size.metrics();
    let n = items.len() as f32;
    let h = INSET * 2.0 + n * s.height;
    let w = match kind {
        SidebarKind::Mini => INSET * 2.0 + s.height,
        SidebarKind::Rail => {
            let mut max_lw = 0.0f32;
            for label in items {
                let lw = label.chars().count() as f32 * s.font * MONO_ADVANCE;
                if lw > max_lw {
                    max_lw = lw;
                }
            }
            (INSET * 2.0 + s.pad_x + BAR + s.gap + max_lw + s.pad_x).max(s.height * 3.0)
        }
    };
    (w, h.max(s.height + INSET * 2.0))
}

/// Parent owns `selected` (0-based). Returns the item that was pressed, if any.
pub fn sidebar(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    items: &[&str],
    selected: u32,
    kind: SidebarKind,
    size: SidebarSize,
    disabled: bool,
) -> Option<u32> {
    let n = items.len();
    if n == 0 {
        return None;
    }
    let s = size.metrics();
    let (w, h) = sidebar_size(items, kind, size);
    let selected = selected.min(n as u32 - 1);
    let row = s.height;
    let inner_w = (w - INSET * 2.0).max(row);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.2;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let pill_to = y + INSET + selected as f32 * row;
    let pill_y = if disabled {
        pill_to
    } else {
        motion.spring_slot(x, y, 3, pill_to, dt)
    };
    let pill_x = x + INSET;
    let jade = if disabled { MUTED } else { JADE };
    match kind {
        SidebarKind::Mini => {
            let rest = [JADE[0], JADE[1], JADE[2], 0.92];
            let fill = if disabled {
                lerp(WELL, MUTED, 0.7)
            } else {
                rest
            };
            draw.outline(
                pill_x,
                pill_y,
                inner_w,
                row,
                fill,
                CLEAR,
                (s.radius - 2.0).max(4.0),
                0.0,
                1.0,
            );
        }
        SidebarKind::Rail => {
            draw.outline(
                pill_x,
                pill_y,
                inner_w,
                row,
                JADE_DIM,
                CLEAR,
                (s.radius - 2.0).max(4.0),
                0.0,
                1.0,
            );
            draw.quad(
                pill_x + 5.0,
                pill_y + 6.0,
                BAR,
                (row - 12.0).max(2.0),
                jade,
                1.0,
                1.0,
            );
        }
    }

    let mut picked = None;
    for (i, label) in items.iter().copied().enumerate() {
        let ix = x + INSET;
        let iy = y + INSET + i as f32 * row;
        if row_item(
            draw,
            ptr,
            motion,
            dt,
            ix,
            iy,
            inner_w,
            row,
            label,
            kind,
            i as u32 == selected,
            disabled,
            s,
        ) {
            picked = Some(i as u32);
        }
    }

    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    picked
}

fn glyph(label: &str) -> char {
    label
        .chars()
        .find(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_uppercase())
        .unwrap_or('·')
}

fn row_item(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    label: &str,
    kind: SidebarKind,
    on: bool,
    disabled: bool,
    s: Size,
) -> bool {
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    // Scale is paint-only — layout boxes stay put.
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
    if !on {
        let fill = if disabled {
            CLEAR
        } else {
            mix_phase(CLEAR, JADE_DIM, lerp(JADE_DIM, JADE, 0.18), u)
        };
        if fill[3] > 0.02 {
            draw.outline(
                x,
                y,
                w,
                h,
                fill,
                CLEAR,
                (s.radius - 2.0).max(4.0),
                0.0,
                scale,
            );
        }
    }
    let rest = if on { JADE } else { FG };
    let ink = if disabled {
        MUTED
    } else if kind == SidebarKind::Mini && on {
        INK
    } else {
        lerp(rest, JADE, u.min(1.0))
    };
    match kind {
        SidebarKind::Mini => {
            draw.label_in(glyph(label).to_string(), x, y, w, h, s.font, ink, scale);
        }
        SidebarKind::Rail => {
            let tx = x + 5.0 + BAR + s.gap;
            let lw =
                (label.chars().count() as f32 * s.font * MONO_ADVANCE).min((w - (tx - x)).max(8.0));
            draw.label_in(label, tx, y, lw, h, s.font, ink, scale);
        }
    }
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
    const CHANNELS: [&str; 4] = ["#general", "#design", "#build", "#random"];
    let n = CHANNELS.len() as u32;
    seed.choice %= n;
    let at = seed.choice;
    let here = CHANNELS[at as usize];
    draw.label(
        format!("choice {at} {here} · {} clicks", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    draw.label("Mini", x, y, 12.0, MUTED);
    let (mw, mh) = sidebar_size(&CHANNELS, SidebarKind::Mini, SidebarSize::Md);
    let rail_x = x + mw + 24.0;
    draw.label("Rail", rail_x, y, 12.0, MUTED);
    y += 18.0;
    if let Some(i) = sidebar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &CHANNELS,
        at,
        SidebarKind::Mini,
        SidebarSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    if let Some(i) = sidebar(
        draw,
        ptr,
        motion,
        dt,
        rail_x,
        y,
        &CHANNELS,
        at,
        SidebarKind::Rail,
        SidebarSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    y += mh + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 18.0;
    let _ = sidebar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &CHANNELS,
        at,
        SidebarKind::Mini,
        SidebarSize::Md,
        true,
    );
    let _ = sidebar(
        draw,
        ptr,
        motion,
        dt,
        rail_x,
        y,
        &CHANNELS,
        at,
        SidebarKind::Rail,
        SidebarSize::Md,
        true,
    );

    y += mh + 20.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 18.0;
    if let Some(i) = sidebar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &CHANNELS,
        at,
        SidebarKind::Mini,
        SidebarSize::Sm,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    let (smw, smh) = sidebar_size(&CHANNELS, SidebarKind::Mini, SidebarSize::Sm);
    if let Some(i) = sidebar(
        draw,
        ptr,
        motion,
        dt,
        x + smw + 24.0,
        y,
        &CHANNELS,
        at,
        SidebarKind::Rail,
        SidebarSize::Sm,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    y += smh + 20.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 18.0;
    if let Some(i) = sidebar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &CHANNELS,
        at,
        SidebarKind::Mini,
        SidebarSize::Lg,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    let (lgw, _) = sidebar_size(&CHANNELS, SidebarKind::Mini, SidebarSize::Lg);
    if let Some(i) = sidebar(
        draw,
        ptr,
        motion,
        dt,
        x + lgw + 24.0,
        y,
        &CHANNELS,
        at,
        SidebarKind::Rail,
        SidebarSize::Lg,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
}
