//! Single fold. Parent owns `open`. Height springs (`Motion::spring_toggle`).
//! Copy Switch.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollapsibleKind {
    Well,
    Outline,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollapsibleSize {
    Sm,
    Md,
    Lg,
}

impl CollapsibleSize {
    pub fn metrics(self) -> Size {
        match self {
            CollapsibleSize::Sm => SM,
            CollapsibleSize::Md => MD,
            CollapsibleSize::Lg => LG,
        }
    }
}

/// Trigger click returns `true`. Parent flips `open` (do not store it here).
pub fn collapsible(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    open: bool,
    title: &str,
    body: &str,
    kind: CollapsibleKind,
    size: CollapsibleSize,
    disabled: bool,
) -> bool {
    let g = geo(w, title, body, kind, size);
    let w = g.w;
    let header_h = g.header_h;
    // Slot 0 is the height spring. Hover/press live on 1/2.
    let t = motion
        .spring_toggle(x, y, if open { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    let body_h = g.body_full_h * t;
    let h = header_h + body_h;
    let hot = !disabled && ptr.hit(x, y, g.hit_w, header_h);
    let active = hot && ptr.down;
    let ghost = kind == CollapsibleKind::Ghost;
    // Scale is paint-only on the mark + title, not the layout box.
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if ghost { 1.0 } else { PRESS_SCALE };
        motion.snap_slot(x, y, 1, if ghost { 1.0 } else { HOVER_SCALE });
        motion.snap_slot(x, y, 2, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if ghost {
            1.0
        } else if hot {
            HOVER_SCALE
        } else {
            1.0
        };
        (
            motion.spring_slot(x, y, 1, scale_to, dt),
            motion.spring_slot(x, y, 2, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let accent = (u.min(1.0) * 0.45 + t).clamp(0.0, 1.0);
    let (fill, border, bw) = if disabled {
        match kind {
            CollapsibleKind::Ghost => (CLEAR, CLEAR, 0.0),
            _ => (WELL, BORDER, 1.0),
        }
    } else {
        match kind {
            CollapsibleKind::Well => (
                mix_phase(WELL, lerp(WELL, JADE, 0.14), lerp(WELL, JADE, 0.22), u),
                lerp(BORDER, JADE, accent),
                1.0,
            ),
            CollapsibleKind::Outline => (
                mix_phase(CLEAR, WELL, lerp(WELL, JADE, 0.18), u),
                lerp(BORDER, JADE, accent),
                1.0,
            ),
            CollapsibleKind::Ghost => (CLEAR, CLEAR, 0.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h.max(header_h), fill, border, g.radius, bw, 1.0);
    }
    if disabled && !ghost {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, h.max(header_h), wash, CLEAR, g.radius, 0.0, 1.0);
    }

    let gx = x + g.pad;
    let gy = y + (header_h - g.gem) * 0.5;
    let mark = if disabled {
        MUTED
    } else {
        lerp(MUTED, JADE, accent)
    };
    paint_mark(draw, gx, gy, g.gem, t, mark, scale);

    let title_c = if disabled {
        MUTED
    } else {
        lerp(FG, JADE, accent)
    };
    let tx = gx + g.gem + g.gap;
    let ty = y + (header_h - g.font) * 0.5;
    let title_box = (w - (tx - x) - g.pad).max(8.0);
    let ox = tx + g.title_w.min(title_box) * 0.5;
    let oy = y + header_h * 0.5;
    draw.label_swoop(title, tx, ty, g.font, title_c, scale, ox, oy, 0.0, 0.0);

    if t > 0.06 && body_h > 2.0 {
        let mut panel = lerp(WELL, INK, 0.35);
        panel[3] *= t;
        if !ghost {
            draw.quad(
                x + 1.0,
                y + header_h,
                (w - 2.0).max(1.0),
                body_h,
                panel,
                0.0,
                1.0,
            );
        }
        let mut rule = if disabled {
            BORDER
        } else {
            lerp(BORDER, JADE, t)
        };
        rule[3] *= t;
        draw.quad(
            x + g.pad,
            y + header_h,
            (w - g.pad * 2.0).max(0.0),
            1.0,
            rule,
            0.0,
            1.0,
        );
        let wrap_h = (body_h - g.gap).max(0.0);
        if wrap_h > 4.0 && !body.is_empty() {
            let mut body_c = MUTED;
            body_c[3] *= t;
            let by = y + header_h + g.gap;
            draw.label_swoop(
                body,
                x + g.pad,
                by,
                g.body_font,
                body_c,
                1.0,
                x + w * 0.5,
                y + h * 0.5,
                g.inner_w,
                wrap_h,
            );
        }
    }
    !disabled && hot && ptr.pressed
}

fn paint_mark(
    draw: &mut DrawList,
    gx: f32,
    gy: f32,
    gem: f32,
    t: f32,
    color: [f32; 4],
    scale: f32,
) {
    let bar = gem * 0.5;
    let th = 2.0;
    let cx = gx + gem * 0.5;
    let cy = gy + gem * 0.5;
    draw.quad(cx - bar * 0.5, cy - th * 0.5, bar, th, color, 1.0, scale);
    let vt = 1.0 - t;
    if vt > 0.02 {
        let mut v = color;
        v[3] *= vt;
        draw.quad(cx - th * 0.5, cy - bar * 0.5, th, bar, v, 1.0, scale);
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
    w: f32,
    header_h: f32,
    font: f32,
    body_font: f32,
    pad: f32,
    gap: f32,
    radius: f32,
    gem: f32,
    title_w: f32,
    inner_w: f32,
    body_full_h: f32,
    hit_w: f32,
}

fn geo(w: f32, title: &str, body: &str, kind: CollapsibleKind, size: CollapsibleSize) -> Geo {
    let s = size.metrics();
    let font = s.font;
    let body_font = (s.font - 2.0).max(11.0);
    let gem = (font * 0.85).clamp(10.0, 16.0);
    let title_w = title.chars().count() as f32 * font * MONO_ADVANCE;
    let min_w = s.pad_x * 2.0 + gem + s.gap + title_w.max(8.0);
    let w = if w <= 0.0 {
        min_w.max(160.0)
    } else {
        w.max(96.0)
    };
    let inner_w = (w - s.pad_x * 2.0).max(8.0);
    let cols = (inner_w / (body_font * MONO_ADVANCE)).max(8.0) as usize;
    let blines = if body.is_empty() {
        0
    } else {
        wrap_line_count(body, cols).max(1)
    };
    let body_full_h = if blines == 0 {
        0.0
    } else {
        s.gap + blines as f32 * body_font * 1.3 + s.gap
    };
    let text_hit = s.pad_x * 2.0 + gem + s.gap + title_w;
    let hit_w = match kind {
        CollapsibleKind::Ghost => text_hit.min(w).max(gem + s.pad_x),
        _ => w,
    };
    Geo {
        w,
        header_h: s.height,
        font,
        body_font,
        pad: s.pad_x,
        gap: s.gap,
        radius: s.radius,
        gem,
        title_w,
        inner_w,
        body_full_h,
        hit_w,
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

fn tap(seed: &mut crate::ui::SeedState, slot: usize) {
    seed.on[slot] = !seed.on[slot];
    seed.clicks += 1;
    seed.choice = slot as u32;
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
    draw.label(
        format!(
            "Parent owns open. {} · clicks {} · last {}",
            if seed.on[0] { "Open" } else { "Closed" },
            seed.clicks,
            seed.choice
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let primary_w = 420.0;
    if collapsible(
        draw,
        ptr,
        motion,
        dt,
        x,
        68.0 + y0,
        primary_w,
        seed.on[0],
        "Notes",
        "Single fold. Parent owns open. Height springs with Motion.",
        CollapsibleKind::Well,
        CollapsibleSize::Md,
        false,
    ) {
        tap(seed, 0);
    }

    draw.label("Sizes", x, 176.0 + y0, 14.0, MUTED);
    let y_sz = 198.0 + y0;
    let col_w = 176.0;
    let gap = 12.0;
    let sizes = [
        (CollapsibleSize::Sm, 2usize, "Sm", "SM tokens."),
        (CollapsibleSize::Md, 3, "Md", "MD tokens."),
        (CollapsibleSize::Lg, 4, "Lg", "LG tokens."),
    ];
    for (i, (size, slot, title, body)) in sizes.iter().enumerate() {
        let bx = x + i as f32 * (col_w + gap);
        if collapsible(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y_sz,
            col_w,
            seed.on[*slot],
            title,
            body,
            CollapsibleKind::Well,
            *size,
            false,
        ) {
            tap(seed, *slot);
        }
    }

    draw.label("Variants", x, 314.0 + y0, 14.0, MUTED);
    let y_k = 336.0 + y0;
    let kinds = [
        (CollapsibleKind::Outline, 5usize, "Outline", "CLEAR rest."),
        (CollapsibleKind::Ghost, 6, "Ghost", "No chrome."),
        (CollapsibleKind::Well, 1, "Disabled", "Swallows clicks."),
    ];
    for (i, (kind, slot, title, body)) in kinds.iter().enumerate() {
        let bx = x + i as f32 * (col_w + gap);
        let disabled = *slot == 1;
        if collapsible(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y_k,
            col_w,
            seed.on[*slot],
            title,
            body,
            *kind,
            CollapsibleSize::Md,
            disabled,
        ) {
            tap(seed, *slot);
        }
    }
}
