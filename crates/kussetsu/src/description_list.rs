//! Key / value rows. Keys MUTED, values FG. Copy Button.
//! Parent owns `selected`. Click returns the row index.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DescriptionListKind {
    Inline,
    Stacked,
    Well,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DescriptionListSize {
    Sm,
    Md,
    Lg,
}

impl DescriptionListSize {
    pub fn metrics(self) -> Size {
        match self {
            DescriptionListSize::Sm => SM,
            DescriptionListSize::Md => MD,
            DescriptionListSize::Lg => LG,
        }
    }
}

/// Returns the row that was clicked (0-based), if any.
pub fn description_list(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    items: &[(&str, &str)],
    selected: u32,
    kind: DescriptionListKind,
    size: DescriptionListSize,
    disabled: bool,
) -> Option<u32> {
    let s = size.metrics();
    let n = items.len();
    let total_h = list_h(n, kind, s);
    if n == 0 || w < 8.0 {
        return None;
    }
    let stacked = kind == DescriptionListKind::Stacked;
    let well = kind == DescriptionListKind::Well;
    let pad = s.pad_x;
    let (inner_x, inner_w, mut ry) = if well {
        draw.outline(x, y, w, total_h, WELL, BORDER, s.radius, 1.0, 1.0);
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
            if well { s.radius } else { 0.0 },
            1.0,
        );
    }
    let rh = row_h(kind, s);
    let col = if stacked {
        0.0
    } else {
        key_col(items, s.font, pad, inner_w)
    };
    let radius = if well {
        (s.radius * 0.6).max(6.0)
    } else {
        s.radius
    };
    let mut picked = None;
    for (i, (key, value)) in items.iter().copied().enumerate() {
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
            key,
            value,
            stacked,
            col,
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

fn row_h(kind: DescriptionListKind, s: Size) -> f32 {
    match kind {
        DescriptionListKind::Stacked => s.gap * 2.0 + s.font * 2.0 + 4.0,
        DescriptionListKind::Inline | DescriptionListKind::Well => s.height,
    }
}

fn list_h(n: usize, kind: DescriptionListKind, s: Size) -> f32 {
    if n == 0 {
        return if kind == DescriptionListKind::Well {
            s.pad_x * 2.0
        } else {
            0.0
        };
    }
    let rows = n as f32 * row_h(kind, s);
    if kind == DescriptionListKind::Well {
        rows + s.pad_x * 2.0
    } else {
        rows
    }
}

fn key_col(items: &[(&str, &str)], font: f32, pad: f32, w: f32) -> f32 {
    let max_k = items
        .iter()
        .map(|(k, _)| k.chars().count() as f32 * font * MONO_ADVANCE)
        .fold(0.0_f32, |a, b| a.max(b));
    let col = max_k + pad + 10.0;
    col.min((w * 0.5).max(pad + 10.0))
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
    key: &str,
    value: &str,
    stacked: bool,
    col: f32,
    selected: bool,
    disabled: bool,
    last: bool,
    s: Size,
    radius: f32,
) -> bool {
    let font = s.font;
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
    let key_c = if disabled {
        MUTED
    } else {
        lerp(MUTED, JADE, sel)
    };
    let val_c = if disabled { MUTED } else { FG };
    let cx = x + w * 0.5;
    let cy = y + h * 0.5;
    let text_x = x + s.pad_x;
    if stacked {
        let ky = y + s.gap;
        let vy = ky + font + 2.0;
        draw.label_swoop(key, text_x, ky, font, key_c, scale, cx, cy, 0.0, 0.0);
        draw.label_swoop(value, text_x, vy, font, val_c, scale, cx, cy, 0.0, 0.0);
    } else {
        let ty = y + (h - font) * 0.5;
        let kw = (key.chars().count() as f32 * font * MONO_ADVANCE).min(col.max(0.0));
        draw.label_swoop(key, text_x, ty, font, key_c, scale, cx, cy, 0.0, 0.0);
        let vx = x + col.max(kw + s.gap);
        draw.label_swoop(value, vx, ty, font, val_c, scale, cx, cy, 0.0, 0.0);
    }
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
    let clicks = seed.clicks.to_string();
    let fill = format!("{}%", (seed.value.clamp(0.0, 1.0) * 100.0).round() as i32);
    let clock = format!("{:.0}s", seed.clock % 60.0);
    let rain = if seed.rain { "on" } else { "off" };
    let live: [(&str, &str); 5] = [
        ("Name", "kussetsu"),
        ("Clicks", clicks.as_str()),
        ("Fill", fill.as_str()),
        ("Rain", rain),
        ("Clock", clock.as_str()),
    ];
    let stacked_items: [(&str, &str); 3] =
        [("Host", "native"), ("Crate", "kussetsu"), ("Slot", "gpu")];
    let size_items: [(&str, &str); 2] = [("Name", "kussetsu"), ("Clicks", clicks.as_str())];

    draw.label(
        format!(
            "Key MUTED / value FG. Selected {} · clicks {}",
            seed.choice, seed.clicks
        ),
        ox,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 64.0 + y0;
    draw.label("Inline", ox, y, 12.0, MUTED);
    let ly = y + 18.0;
    let inline_w = 300.0;
    if let Some(i) = description_list(
        draw,
        ptr,
        motion,
        dt,
        ox,
        ly,
        inline_w,
        &live,
        seed.choice,
        DescriptionListKind::Inline,
        DescriptionListSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
        if i == 3 {
            seed.rain = !seed.rain;
        }
    }
    let stacked_x = ox + inline_w + 24.0;
    draw.label("Stacked", stacked_x, y, 12.0, MUTED);
    if let Some(i) = description_list(
        draw,
        ptr,
        motion,
        dt,
        stacked_x,
        ly,
        200.0,
        &stacked_items,
        seed.tab,
        DescriptionListKind::Stacked,
        DescriptionListSize::Md,
        false,
    ) {
        seed.tab = i;
        seed.clicks += 1;
    }

    let s_md = DescriptionListSize::Md.metrics();
    let inline_h = list_h(live.len(), DescriptionListKind::Inline, s_md);
    let stacked_h = list_h(stacked_items.len(), DescriptionListKind::Stacked, s_md);
    let mut y2 = ly + inline_h.max(stacked_h) + 20.0;
    draw.label("Sizes", ox, y2, 12.0, MUTED);
    y2 += 18.0;
    let mut sx = ox;
    let sw = 168.0;
    for (cap, size) in [
        ("Sm", DescriptionListSize::Sm),
        ("Md", DescriptionListSize::Md),
        ("Lg", DescriptionListSize::Lg),
    ] {
        draw.label(cap, sx, y2, 12.0, MUTED);
        if let Some(i) = description_list(
            draw,
            ptr,
            motion,
            dt,
            sx,
            y2 + 16.0,
            sw,
            &size_items,
            seed.choice,
            DescriptionListKind::Inline,
            size,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        sx += sw + 16.0;
    }
    let size_block = 16.0
        + list_h(
            size_items.len(),
            DescriptionListKind::Inline,
            DescriptionListSize::Lg.metrics(),
        );
    let mut y3 = y2 + size_block + 20.0;
    draw.label("Well", ox, y3, 12.0, MUTED);
    let well_items: [(&str, &str); 3] = [
        ("Name", "kussetsu"),
        ("Fill", fill.as_str()),
        ("Rain", rain),
    ];
    y3 += 18.0;
    let well_w = 300.0;
    if let Some(i) = description_list(
        draw,
        ptr,
        motion,
        dt,
        ox,
        y3,
        well_w,
        &well_items,
        seed.choice,
        DescriptionListKind::Well,
        DescriptionListSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
        if i == 2 {
            seed.rain = !seed.rain;
        }
    }
    let dx = ox + well_w + 24.0;
    draw.label("Disabled", dx, y3 - 18.0, 12.0, MUTED);
    let _ = description_list(
        draw,
        ptr,
        motion,
        dt,
        dx,
        y3,
        220.0,
        &[("Key", "value"), ("Muted", "swallows")],
        0,
        DescriptionListKind::Inline,
        DescriptionListSize::Md,
        true,
    );
}
