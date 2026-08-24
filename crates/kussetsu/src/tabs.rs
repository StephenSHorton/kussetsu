//! Tab list + panel. Copy Switch: parent owns `selected`. Jade underline springs.
//! Melts into WELL — not a pill on a panel.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TabsSize {
    Sm,
    Md,
    Lg,
}

impl TabsSize {
    pub fn metrics(self) -> Size {
        match self {
            TabsSize::Sm => SM,
            TabsSize::Md => MD,
            TabsSize::Lg => LG,
        }
    }
}

const HAIR: f32 = 1.0;
const RULE: f32 = 2.0;

fn tab_w(label: &str, s: Size) -> f32 {
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE
}

fn wrap_line_count(text: &str, cols: usize) -> usize {
    if text.is_empty() {
        return 0;
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

fn panel_h(panel: &str, inner_w: f32, s: Size) -> f32 {
    let cols = (inner_w / (s.font * MONO_ADVANCE)).max(8.0) as usize;
    let body = if panel.is_empty() {
        0.0
    } else {
        wrap_line_count(panel, cols).max(1) as f32 * s.font * 1.3
    };
    let title = s.font + s.gap;
    (title + body + s.pad_x * 2.0).max(s.height * 2.0)
}

fn height_for(panel: &str, w: f32, size: TabsSize) -> f32 {
    let s = size.metrics();
    let inner = (w - s.pad_x * 2.0).max(8.0);
    s.height + panel_h(panel, inner, s)
}

/// Returns the tab that was clicked (0-based), if any.
pub fn tabs(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    labels: &[&str],
    selected: u32,
    panel: &str,
    size: TabsSize,
    disabled: bool,
) -> Option<u32> {
    let n = labels.len();
    if n == 0 {
        return None;
    }
    let s = size.metrics();
    let tab_h = s.height;
    let inner = (w - s.pad_x * 2.0).max(8.0);
    let ph = panel_h(panel, inner, s);
    let h = tab_h + ph;
    let selected = selected.min(n as u32 - 1);

    let mut sel_x = x;
    let mut sel_w = tab_w(labels[selected as usize], s);
    let mut cx = x;
    for (i, label) in labels.iter().enumerate() {
        let tw = tab_w(label, s);
        if i as u32 == selected {
            sel_x = cx;
            sel_w = tw;
        }
        cx += tw;
    }

    let fill = if disabled {
        lerp(WELL, INK, 0.35)
    } else {
        WELL
    };
    let border = if disabled {
        lerp(BORDER, MUTED, 0.25)
    } else {
        BORDER
    };
    draw.outline(x, y, w, h, fill, border, s.radius, 1.0, 1.0);

    // Hairline under the list; WELL overpaint opens a melt into the panel.
    draw.quad(
        x + 1.0,
        y + tab_h,
        (w - 2.0).max(0.0),
        HAIR,
        border,
        0.0,
        1.0,
    );
    let jx = motion.spring_slot(x, y, 3, sel_x, dt);
    let jw = motion.spring_slot(x, y, 4, sel_w, dt).max(8.0);
    draw.quad(jx, y + tab_h - 1.0, jw, 3.0, fill, 0.0, 1.0);
    let rule = if disabled { MUTED } else { JADE };
    let inset = (s.pad_x * 0.5).min(jw * 0.25);
    draw.quad(
        jx + inset,
        y + tab_h - 1.0,
        (jw - inset * 2.0).max(8.0),
        RULE,
        rule,
        1.0,
        1.0,
    );

    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.2;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let mut picked = None;
    let mut tx = x;
    for (i, label) in labels.iter().enumerate() {
        let tw = tab_w(label, s);
        let on = i as u32 == selected;
        let hot = !disabled && ptr.hit(tx, y, tw, tab_h);
        let active = hot && ptr.down;
            let (scale, u) = if disabled {
            (1.0, 0.0)
        } else if active {
            motion.snap_slot(tx, y, 0, HOVER_SCALE);
            motion.snap_slot(tx, y, 1, 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(tx, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
                motion.spring_slot(tx, y, 1, if hot { 1.0 } else { 0.0 }, dt),
            )
        };
        let rest = if on { JADE } else { MUTED };
        let ink = if disabled {
            MUTED
        } else {
            lerp(rest, JADE, u.min(1.0))
        };
        draw.label_in(*label, tx, y, tw, tab_h, s.font, ink, scale);
        if hot && ptr.pressed {
            picked = Some(i as u32);
        }
        tx += tw;
    }

    let title = labels[selected as usize];
    let px = x + s.pad_x;
    let py = y + tab_h + s.pad_x;
    let title_c = if disabled { MUTED } else { FG };
    draw.label(title, px, py, s.font, title_c);
    if !panel.is_empty() {
        let by = py + s.font + s.gap;
        let bh = (y + h - by - s.pad_x).max(s.font);
        draw.label_swoop(
            panel,
            px,
            by,
            s.font,
            MUTED,
            1.0,
            x + w * 0.5,
            y + tab_h + ph * 0.5,
            inner,
            bh,
        );
    }
    picked
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
    const LABELS: [&str; 3] = ["Overview", "Tokens", "Motion"];
    const BODIES: [&str; 3] = [
        "Tab list + panel. Parent owns seed.tab.",
        "Inkstone + jade. Selected underline is JADE.",
        "Indicator springs like Switch. Hover is paint-only.",
    ];
    let n = LABELS.len() as u32;
    seed.tab %= n;
    let name = LABELS[seed.tab as usize];

    draw.label(
        format!("tab {} {name} · {} clicks", seed.tab, seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let w = 420.0;
    let mut y = 72.0 + y0;
    let body = BODIES[seed.tab as usize];
    if let Some(i) = tabs(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &LABELS,
        seed.tab,
        body,
        TabsSize::Md,
        false,
    ) {
        seed.tab = i;
        seed.clicks += 1;
    }

    y += height_for(body, w, TabsSize::Md) + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 18.0;
    let body = BODIES[seed.tab as usize];
    let _ = tabs(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &LABELS,
        seed.tab,
        body,
        TabsSize::Md,
        true,
    );

    y += height_for(body, w, TabsSize::Md) + 20.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 18.0;
    let body = BODIES[seed.tab as usize];
    if let Some(i) = tabs(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &LABELS,
        seed.tab,
        body,
        TabsSize::Sm,
        false,
    ) {
        seed.tab = i;
        seed.clicks += 1;
    }

    y += height_for(body, w, TabsSize::Sm) + 20.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 18.0;
    let body = BODIES[seed.tab as usize];
    if let Some(i) = tabs(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &LABELS,
        seed.tab,
        body,
        TabsSize::Lg,
        false,
    ) {
        seed.tab = i;
        seed.clicks += 1;
    }
}
