//! Notes / guests. Title + MUTED subtitle rows in a WELL.
//! Copy Button: parent owns `selected`; click returns the row index.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListKind {
    Well,
    Outline,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListSize {
    Sm,
    Md,
    Lg,
}

impl ListSize {
    pub fn metrics(self) -> Size {
        match self {
            ListSize::Sm => SM,
            ListSize::Md => MD,
            ListSize::Lg => LG,
        }
    }
}

fn sub_font(s: Size) -> f32 {
    (s.font - 2.0).max(11.0)
}

fn row_h(s: Size) -> f32 {
    s.gap * 2.0 + s.font + sub_font(s) + 4.0
}

fn list_h(n: usize, kind: ListKind, s: Size) -> f32 {
    if n == 0 {
        return if kind == ListKind::Ghost {
            0.0
        } else {
            s.pad_x * 2.0
        };
    }
    let rows = n as f32 * row_h(s);
    if kind == ListKind::Ghost {
        rows
    } else {
        rows + s.pad_x * 2.0
    }
}

/// Inner content width from mono advances, plus pad and the jade tick.
pub fn width(items: &[(&str, &str)], size: ListSize) -> f32 {
    let s = size.metrics();
    let sub = sub_font(s);
    let mut inner = 0.0f32;
    for (title, subtitle) in items {
        let tw = title.chars().count() as f32 * s.font * MONO_ADVANCE;
        let sw = subtitle.chars().count() as f32 * sub * MONO_ADVANCE;
        inner = inner.max(tw).max(sw);
    }
    inner + s.pad_x * 2.0 + 10.0
}

pub fn height(n: usize, kind: ListKind, size: ListSize) -> f32 {
    list_h(n, kind, size.metrics())
}

/// Returns the row that was clicked (0-based), if any.
pub fn list(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    items: &[(&str, &str)],
    selected: u32,
    kind: ListKind,
    size: ListSize,
    disabled: bool,
) -> Option<u32> {
    let s = size.metrics();
    let n = items.len();
    let total_h = list_h(n, kind, s);
    if n == 0 || w < 8.0 {
        return None;
    }
    let chrome = kind != ListKind::Ghost;
    let pad = s.pad_x;
    let (fill, border, bw) = if disabled {
        match kind {
            ListKind::Ghost => (CLEAR, CLEAR, 0.0),
            _ => (WELL, BORDER, 1.0),
        }
    } else {
        match kind {
            ListKind::Well => (WELL, BORDER, 1.0),
            ListKind::Outline => (CLEAR, BORDER, 1.0),
            ListKind::Ghost => (CLEAR, CLEAR, 0.0),
        }
    };
    if chrome && (fill[3] > 0.02 || bw > 0.0) {
        draw.outline(x, y, w, total_h, fill, border, s.radius, bw, 1.0);
    }
    let (inner_x, inner_w, mut ry) = if chrome {
        (x + pad, (w - pad * 2.0).max(8.0), y + pad)
    } else {
        (x, w, y)
    };
    if disabled {
        let mut veil = SCRIM;
        veil[3] = 0.18;
        draw.quad(
            x,
            y,
            w,
            total_h,
            veil,
            if chrome { s.radius } else { 0.0 },
            1.0,
        );
    }
    let rh = row_h(s);
    let radius = if chrome {
        (s.radius * 0.6).max(6.0)
    } else {
        s.radius
    };
    let mut picked = None;
    for (i, (title, subtitle)) in items.iter().copied().enumerate() {
        let last = i + 1 == n;
        if row(
            draw,
            ptr,
            motion,
            dt,
            inner_x,
            ry,
            inner_w,
            rh,
            title,
            subtitle,
            selected == i as u32,
            disabled,
            last,
            s,
            radius,
        ) {
            picked = Some(i as u32);
        }
        ry += rh;
    }
    picked
}

fn row(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    title: &str,
    subtitle: &str,
    selected: bool,
    disabled: bool,
    last: bool,
    s: Size,
    radius: f32,
) -> bool {
    let font = s.font;
    let sub = sub_font(s);
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
    let hover = [JADE[0], JADE[1], JADE[2], 0.10];
    let press = lerp(hover, INK, 0.35);
    let base = mix_phase(CLEAR, hover, press, u);
    let on = [JADE[0], JADE[1], JADE[2], 0.16];
    let fill = if disabled { CLEAR } else { lerp(base, on, sel) };
    if fill[3] > 0.02 {
        draw.outline(x, y, w, h, fill, CLEAR, radius, 0.0, scale);
    }
    if sel > 0.04 {
        let mut tick = JADE;
        tick[3] *= sel;
        if disabled {
            tick = MUTED;
        }
        let th = (h - 10.0).max(8.0);
        draw.quad(x + 3.0, y + (h - th) * 0.5, 2.0, th, tick, 1.0, scale);
    }
    let title_c = if disabled { MUTED } else { lerp(FG, JADE, sel) };
    let sub_c = MUTED;
    let cx = x + w * 0.5;
    let cy = y + h * 0.5;
    let text_x = x + s.pad_x;
    let ty = y + s.gap;
    let sy = ty + font + 2.0;
    draw.label_swoop(title, text_x, ty, font, title_c, scale, cx, cy, 0.0, 0.0);
    draw.label_swoop(subtitle, text_x, sy, sub, sub_c, scale, cx, cy, 0.0, 0.0);
    if !last {
        let line = if disabled { MUTED } else { BORDER };
        let lw = (w - s.pad_x * 2.0).max(0.0);
        if lw > 1.0 {
            draw.quad(x + s.pad_x, y + h - 1.0, lw, 1.0, line, 0.0, 1.0);
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
    let ox = 36.0 + x0;
    let wait = format!("Waiting · {:.0}s", seed.clock % 60.0);
    let guests: [(&str, &str); 4] = [
        ("Mira Chen", "Checked in · lounge"),
        ("Kenji Sato", wait.as_str()),
        ("Aoi Park", "Note: late train"),
        ("Rin Wells", "Workspace · east"),
    ];
    let n = guests.len() as u32;
    if n > 0 {
        seed.choice %= n;
    }
    let name = guests
        .get(seed.choice as usize)
        .map(|(t, _)| *t)
        .unwrap_or("—");

    draw.label(
        format!("Notes / guests. Selected {name} · {} clicks", seed.clicks),
        ox,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 64.0 + y0;
    draw.label("Well", ox, y, 12.0, MUTED);
    let ly = y + 18.0;
    let well_w = 300.0;
    if let Some(i) = list(
        draw,
        ptr,
        motion,
        dt,
        ox,
        ly,
        well_w,
        &guests,
        seed.choice,
        ListKind::Well,
        ListSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }

    let dx = ox + well_w + 24.0;
    draw.label("Disabled", dx, y, 12.0, MUTED);
    let locked: [(&str, &str); 2] = [
        ("Mira Chen", "Checked in · lounge"),
        ("Kenji Sato", "Muted"),
    ];
    let _ = list(
        draw,
        ptr,
        motion,
        dt,
        dx,
        ly,
        220.0,
        &locked,
        0,
        ListKind::Well,
        ListSize::Md,
        true,
    );

    let well_h = height(guests.len(), ListKind::Well, ListSize::Md);
    let mut y2 = ly + well_h + 20.0;
    draw.label("Sizes", ox, y2, 12.0, MUTED);
    y2 += 18.0;
    let size_items: [(&str, &str); 2] = [("Inkstone", "Theme tokens"), ("Jade", "Primary accent")];
    let mut sx = ox;
    for (cap, size) in [
        ("Sm", ListSize::Sm),
        ("Md", ListSize::Md),
        ("Lg", ListSize::Lg),
    ] {
        let sw = width(&size_items, size).max(148.0).min(176.0);
        draw.label(cap, sx, y2, 12.0, MUTED);
        if let Some(i) = list(
            draw,
            ptr,
            motion,
            dt,
            sx,
            y2 + 16.0,
            sw,
            &size_items,
            seed.choice,
            ListKind::Well,
            size,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        sx += sw + 16.0;
    }

    let size_block = 16.0 + height(size_items.len(), ListKind::Well, ListSize::Lg);
    let mut y3 = y2 + size_block + 20.0;
    draw.label("Outline", ox, y3, 12.0, MUTED);
    let notes: [(&str, &str); 3] = [
        ("Ship list", "Title + MUTED subtitle"),
        ("Guests", "Mira · Kenji · Aoi"),
        ("Workspace", "kussetsu GPU kit"),
    ];
    y3 += 18.0;
    let var_w = 240.0;
    if let Some(i) = list(
        draw,
        ptr,
        motion,
        dt,
        ox,
        y3,
        var_w,
        &notes,
        seed.choice,
        ListKind::Outline,
        ListSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    let gx = ox + var_w + 24.0;
    draw.label("Ghost", gx, y3 - 18.0, 12.0, MUTED);
    if let Some(i) = list(
        draw,
        ptr,
        motion,
        dt,
        gx,
        y3,
        var_w,
        &notes,
        seed.choice,
        ListKind::Ghost,
        ListSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
}
