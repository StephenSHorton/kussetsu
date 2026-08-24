//! Pref rows. Built from Switch. Parent owns each `checked`.
//! Copy Switch: `seed.on[i]`; the thumb spring lives in `crate::switch`.

use crate::draw::{DrawList, Motion, Pointer};
use crate::switch::switch;
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, INK, JADE, LG, MD, MONO_ADVANCE, MUTED, SCRIM, SM, WELL,
};

/// Track size in `switch.rs` (`TW` / `TH`).
const TW: f32 = 44.0;
const TH: f32 = 26.0;
/// Extra hit to the right of the track — matches `switch.rs` (`TW + 10 + label`).
const SWITCH_SLACK: f32 = 10.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsKind {
    Well,
    Outline,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsSize {
    Sm,
    Md,
    Lg,
}

impl SettingsSize {
    pub fn metrics(self) -> Size {
        match self {
            SettingsSize::Sm => SM,
            SettingsSize::Md => MD,
            SettingsSize::Lg => LG,
        }
    }
}

fn sub_font(s: Size) -> f32 {
    (s.font - 2.0).max(11.0)
}

fn row_h(hint: bool, s: Size) -> f32 {
    let switch_h = TH + s.gap;
    if hint {
        (s.gap * 2.0 + s.font + sub_font(s) + 4.0).max(switch_h)
    } else {
        s.height.max(switch_h)
    }
}

fn title_h(title: &str, s: Size) -> f32 {
    if title.is_empty() {
        0.0
    } else {
        s.font + s.gap
    }
}

fn list_h(title: &str, items: &[(&str, &str, bool, bool)], kind: SettingsKind, s: Size) -> f32 {
    let mut h = title_h(title, s);
    for (_, hint, _, _) in items {
        h += row_h(!hint.is_empty(), s);
    }
    if items.is_empty() {
        h = h.max(s.height);
    }
    if kind == SettingsKind::Ghost {
        h
    } else {
        h + s.pad_x * 2.0
    }
}

/// Inner labels + switch track + slack, plus side pad.
pub fn width(items: &[(&str, &str, bool, bool)], size: SettingsSize) -> f32 {
    let s = size.metrics();
    let sub = sub_font(s);
    let mut inner = 0.0f32;
    for (title, hint, _, _) in items {
        let tw = title.chars().count() as f32 * s.font * MONO_ADVANCE;
        let hw = hint.chars().count() as f32 * sub * MONO_ADVANCE;
        inner = inner.max(tw).max(hw);
    }
    inner + s.pad_x * 2.0 + s.gap + TW + SWITCH_SLACK
}

pub fn height(
    title: &str,
    items: &[(&str, &str, bool, bool)],
    kind: SettingsKind,
    size: SettingsSize,
) -> f32 {
    list_h(title, items, kind, size.metrics())
}

/// WELL / outline / ghost pref list. Returns the row that toggled (0-based).
/// `items` are `(label, hint, checked, row_disabled)`.
pub fn settings(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    title: &str,
    items: &[(&str, &str, bool, bool)],
    selected: u32,
    kind: SettingsKind,
    size: SettingsSize,
    disabled: bool,
) -> Option<u32> {
    let s = size.metrics();
    let n = items.len();
    let total_h = list_h(title, items, kind, s);
    if n == 0 || w < TW + SWITCH_SLACK + 8.0 {
        return None;
    }
    let chrome = kind != SettingsKind::Ghost;
    let pad = s.pad_x;
    let (fill, border, bw) = if disabled {
        match kind {
            SettingsKind::Ghost => (CLEAR, CLEAR, 0.0),
            _ => (WELL, BORDER, 1.0),
        }
    } else {
        match kind {
            SettingsKind::Well => (WELL, BORDER, 1.0),
            SettingsKind::Outline => (CLEAR, BORDER, 1.0),
            SettingsKind::Ghost => (CLEAR, CLEAR, 0.0),
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
    if !title.is_empty() {
        draw.label(title, inner_x, ry, s.font, MUTED);
        ry += title_h(title, s);
    }
    let radius = if chrome {
        (s.radius * 0.6).max(6.0)
    } else {
        s.radius
    };
    let mut picked = None;
    for (i, (label, hint, checked, row_off)) in items.iter().copied().enumerate() {
        let last = i + 1 == n;
        let rh = row_h(!hint.is_empty(), s);
        if row(
            draw,
            ptr,
            motion,
            dt,
            inner_x,
            ry,
            inner_w,
            rh,
            label,
            hint,
            checked,
            selected == i as u32,
            disabled || row_off,
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
    hint: &str,
    checked: bool,
    selected: bool,
    locked: bool,
    last: bool,
    s: Size,
    radius: f32,
) -> bool {
    let font = s.font;
    let sub = sub_font(s);
    let sx = x + w - TW - SWITCH_SLACK;
    let sy = y + (h - TH) * 0.5;
    let hot = !locked && ptr.hit(x, y, w, h);
    let over_sw = ptr.hit(sx, sy, TW + SWITCH_SLACK, TH);
    let active = hot && ptr.down;
    // Slot 1/2 are this row so they do not clobber Switch slot 0.
    // Pref rows do not scale like buttons — fill/tick only.
    let u = if locked {
        0.0
    } else if active {
        motion.snap_slot(x, y, 1, 1.0);
        2.0
    } else {
        motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt)
    };
    let sel = if locked {
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
    let fill = if locked { CLEAR } else { lerp(base, on, sel) };
    if fill[3] > 0.02 {
        draw.outline(x, y, w, h, fill, CLEAR, radius, 0.0, 1.0);
    }
    if sel > 0.04 {
        let mut tick = JADE;
        tick[3] *= sel;
        if locked {
            tick = MUTED;
        }
        let th = (h - 10.0).max(8.0);
        draw.quad(x + 3.0, y + (h - th) * 0.5, 2.0, th, tick, 1.0, 1.0);
    }
    let title_c = if locked { MUTED } else { FG };
    let hint_c = MUTED;
    let text_x = x + s.pad_x;
    if hint.is_empty() {
        let ty = y + (h - font) * 0.5;
        draw.label_swoop(title, text_x, ty, font, title_c, 1.0, 0.0, 0.0, 0.0, 0.0);
    } else {
        let ty = y + s.gap;
        let hy = ty + font + 2.0;
        draw.label_swoop(title, text_x, ty, font, title_c, 1.0, 0.0, 0.0, 0.0, 0.0);
        draw.label_swoop(hint, text_x, hy, sub, hint_c, 1.0, 0.0, 0.0, 0.0, 0.0);
    }
    if !last {
        let line = if locked { MUTED } else { BORDER };
        let lw = (w - s.pad_x * 2.0).max(0.0);
        if lw > 1.0 {
            draw.quad(x + s.pad_x, y + h - 1.0, lw, 1.0, line, 0.0, 1.0);
        }
    }
    let flipped = switch(draw, ptr, motion, dt, sx, sy, checked, "", locked);
    flipped || (hot && !over_sw && ptr.released)
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn apply(seed: &mut crate::ui::SeedState, i: u32, tab: u32) {
    let slot = i as usize;
    if slot < seed.on.len() {
        seed.on[slot] = !seed.on[slot];
        seed.choice = i;
        seed.clicks += 1;
        seed.tab = tab;
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
    let n_on = seed.on.iter().take(3).filter(|on| **on).count();
    draw.label(
        format!(
            "Parent owns on[] · {n_on} on · {} clicks · {:.0}s",
            seed.clicks,
            seed.clock % 60.0
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let live: [(&str, &str, bool, bool); 4] = [
        ("Glyph rain", "Falling glyphs", seed.on[0], false),
        ("Caffeine", "Keep the well awake", seed.on[1], false),
        ("Lens", "Cursor magnifier", seed.on[2], false),
        ("Telemetry", "Host lock", true, true),
    ];
    let pair: [(&str, &str, bool, bool); 2] = [
        ("Glyph rain", "", seed.on[0], false),
        ("Caffeine", "", seed.on[1], false),
    ];
    let trio: [(&str, &str, bool, bool); 3] = [
        ("Glyph rain", "", seed.on[0], false),
        ("Caffeine", "", seed.on[1], false),
        ("Lens", "", seed.on[2], false),
    ];
    let locked: [(&str, &str, bool, bool); 2] = [
        ("Glyph rain", "swallows clicks", true, false),
        ("Caffeine", "", false, false),
    ];

    let ox = 36.0 + x0;
    let y = 64.0 + y0;
    draw.label("Well", ox, y, 12.0, MUTED);
    let ly = y + 18.0;
    let well_w = 340.0;
    if let Some(i) = settings(
        draw,
        ptr,
        motion,
        dt,
        ox,
        ly,
        well_w,
        "Prefs",
        &live,
        seed.choice,
        SettingsKind::Well,
        SettingsSize::Md,
        false,
    ) {
        if i < 3 {
            apply(seed, i, 1);
        }
    }

    let dx = ox + well_w + 24.0;
    draw.label("Disabled", dx, y, 12.0, MUTED);
    let _ = settings(
        draw,
        ptr,
        motion,
        dt,
        dx,
        ly,
        220.0,
        "Prefs",
        &locked,
        0,
        SettingsKind::Well,
        SettingsSize::Md,
        true,
    );

    let well_h = height("Prefs", &live, SettingsKind::Well, SettingsSize::Md);
    let mut y2 = ly + well_h + 20.0;
    draw.label("Sizes", ox, y2, 12.0, MUTED);
    y2 += 18.0;
    let mut sx = ox;
    for (tab, (cap, size)) in [
        ("Sm", SettingsSize::Sm),
        ("Md", SettingsSize::Md),
        ("Lg", SettingsSize::Lg),
    ]
    .into_iter()
    .enumerate()
    {
        let sw = width(&pair, size).max(168.0);
        draw.label(cap, sx, y2, 12.0, MUTED);
        if let Some(i) = settings(
            draw,
            ptr,
            motion,
            dt,
            sx,
            y2 + 16.0,
            sw,
            "",
            &pair,
            seed.choice,
            SettingsKind::Well,
            size,
            false,
        ) {
            apply(seed, i, tab as u32);
        }
        sx += sw + 16.0;
    }

    let size_block = 16.0 + height("", &pair, SettingsKind::Well, SettingsSize::Lg);
    let mut y3 = y2 + size_block + 20.0;
    draw.label("Outline", ox, y3, 12.0, MUTED);
    y3 += 18.0;
    let var_w = 240.0;
    if let Some(i) = settings(
        draw,
        ptr,
        motion,
        dt,
        ox,
        y3,
        var_w,
        "",
        &trio,
        seed.choice,
        SettingsKind::Outline,
        SettingsSize::Md,
        false,
    ) {
        apply(seed, i, 1);
    }
    let gx = ox + var_w + 24.0;
    draw.label("Ghost", gx, y3 - 18.0, 12.0, MUTED);
    if let Some(i) = settings(
        draw,
        ptr,
        motion,
        dt,
        gx,
        y3,
        var_w,
        "",
        &trio,
        seed.choice,
        SettingsKind::Ghost,
        SettingsSize::Md,
        false,
    ) {
        apply(seed, i, 1);
    }
}
