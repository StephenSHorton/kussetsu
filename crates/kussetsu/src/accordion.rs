//! Expand rows. Copy Switch: parent owns the open index; Motion springs body height.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

const MAX: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccordionKind {
    Well,
    Outline,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccordionSize {
    Sm,
    Md,
    Lg,
}

impl AccordionSize {
    pub fn metrics(self) -> Size {
        match self {
            AccordionSize::Sm => SM,
            AccordionSize::Md => MD,
            AccordionSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct AccordionEvent {
    /// Next open index (`>= items.len()` means folded) when a header is clicked.
    pub open: Option<u32>,
    pub height: f32,
}

/// Exclusive rows. `open >= items.len()` folds every row. Click the open row to fold.
pub fn accordion(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    items: &[(&str, &str)],
    open: u32,
    kind: AccordionKind,
    size: AccordionSize,
    disabled: bool,
) -> AccordionEvent {
    let s = size.metrics();
    let n = items.len().min(MAX);
    if n == 0 || w <= 1.0 {
        return AccordionEvent {
            open: None,
            height: 0.0,
        };
    }

    let inner = (w - s.pad_x * 2.0).max(48.0);
    let body_size = (s.font - 2.0).max(11.0);
    let mut t = [0.0f32; MAX];
    let mut bh = [0.0f32; MAX];
    let mut hy = [0.0f32; MAX];
    let mut scale = [1.0f32; MAX];
    let mut u = [0.0f32; MAX];
    let mut hot = [false; MAX];

    let mut cy = y;
    for i in 0..n {
        let content = content_h(items[i].1, inner, body_size, s);
        let is_open = open == i as u32;
        t[i] = motion.spring_slot(x, y, i as u32, if is_open { 1.0 } else { 0.0 }, dt);
        bh[i] = t[i].max(0.0) * content;
        hy[i] = cy;
        let row_hot = !disabled && ptr.hit(x, hy[i], w, s.height);
        hot[i] = row_hot;
        let active = row_hot && ptr.down;
            // Scale is paint-only on the mark + title, not the layout box.
        let (sc, uu) = if disabled {
            (1.0, 0.0)
        } else if active {
            motion.snap_slot(x, y, 8 + i as u32, HOVER_SCALE);
            motion.snap_slot(x, y, 16 + i as u32, 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(
                    x,
                    y,
                    8 + i as u32,
                    if row_hot { HOVER_SCALE } else { 1.0 },
                    dt,
                ),
                motion.spring_slot(x, y, 16 + i as u32, if row_hot { 1.0 } else { 0.0 }, dt),
            )
        };
        scale[i] = sc;
        u[i] = uu;
        cy += s.height + bh[i];
    }
    let height = (cy - y).max(s.height);
    let open_amt = t
        .iter()
        .take(n)
        .copied()
        .fold(0.0f32, f32::max)
        .clamp(0.0, 1.0);

    let (fill, border, bw) = if disabled {
        match kind {
            AccordionKind::Ghost => (CLEAR, CLEAR, 0.0),
            _ => (WELL, BORDER, 1.0),
        }
    } else {
        match kind {
            AccordionKind::Well => (WELL, BORDER, 1.0),
            AccordionKind::Outline => (CLEAR, lerp(BORDER, JADE, open_amt), 1.0),
            AccordionKind::Ghost => (CLEAR, CLEAR, 0.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, height, fill, border, s.radius, bw, 1.0);
    }

    for i in 0..n {
        let ot = t[i].clamp(0.0, 1.0);
        let rest = lerp(CLEAR, JADE_DIM, ot);
        let head_fill = if disabled {
            CLEAR
        } else {
            mix_phase(rest, JADE_DIM, WELL, u[i])
        };
        if head_fill[3] > 0.02 {
            draw.quad(
                x + 1.0,
                hy[i],
                (w - 2.0).max(1.0),
                s.height,
                head_fill,
                0.0,
                1.0,
            );
        }
        if i > 0 {
            draw.quad(x + 1.0, hy[i], (w - 2.0).max(1.0), 1.0, BORDER, 0.0, 1.0);
        }

        let mark = s.font;
        let mx = x + s.pad_x;
        let my = hy[i] + (s.height - mark) * 0.5;
        let cx = mx + mark * 0.5;
        let cy_m = my + mark * 0.5;
        let bar = mark * 0.5;
        let th = 2.0;
        let plus_c = if disabled {
            MUTED
        } else {
            lerp(MUTED, JADE, ot.max(u[i].min(1.0)))
        };
        draw.quad(
            cx - bar * 0.5,
            cy_m - th * 0.5,
            bar,
            th,
            plus_c,
            1.0,
            scale[i],
        );
        let vt = 1.0 - ot;
        if vt > 0.02 {
            let mut vc = plus_c;
            vc[3] *= vt;
            draw.quad(cx - th * 0.5, cy_m - bar * 0.5, th, bar, vc, 1.0, scale[i]);
        }

        let tx = mx + mark + s.gap;
        let tw = (w - (tx - x) - s.pad_x).max(8.0);
        let title_c = if disabled {
            MUTED
        } else {
            lerp(FG, JADE, ot.max(u[i].min(1.0)))
        };
        draw.label_in(
            items[i].0, tx, hy[i], tw, s.height, s.font, title_c, scale[i],
        );

        if bh[i] > 2.0 {
            let by = hy[i] + s.height;
            let mut panel = lerp(WELL, INK, 0.35);
            panel[3] *= ot;
            draw.quad(x + 1.0, by, (w - 2.0).max(1.0), bh[i], panel, 0.0, 1.0);
            let mut body_c = MUTED;
            body_c[3] *= ot;
            draw.label_swoop(
                items[i].1,
                x + s.pad_x,
                by + s.gap * 0.5,
                body_size,
                body_c,
                1.0,
                x + w * 0.5,
                by + bh[i] * 0.5,
                inner,
                (bh[i] - s.gap * 0.25).max(body_size),
            );
        }
    }

    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, height, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let mut next = None;
    for i in 0..n {
        if hot[i] && ptr.pressed {
            next = Some(if open == i as u32 { n as u32 } else { i as u32 });
            break;
        }
    }
    AccordionEvent { open: next, height }
}

fn content_h(body: &str, inner: f32, font: f32, s: Size) -> f32 {
    if body.is_empty() {
        return 0.0;
    }
    let cols = (inner / (font * MONO_ADVANCE)).max(8.0) as usize;
    let lines = wrap_line_count(body, cols).max(1);
    s.gap + lines as f32 * font * 1.3 + s.gap
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
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

fn apply(ev: AccordionEvent, seed: &mut crate::ui::SeedState) -> f32 {
    if let Some(i) = ev.open {
        seed.choice = i;
        seed.clicks += 1;
    }
    ev.height
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
    const ITEMS: [(&str, &str); 3] = [
        ("Inkstone", "Parent owns the open index."),
        ("Jade", "Primary fill. No new greens."),
        ("Motion", "Body height springs. Click again to fold."),
    ];
    const N: u32 = 3;
    let name = ITEMS
        .get(seed.choice as usize)
        .map(|(title, _)| *title)
        .unwrap_or("folded");
    draw.label(
        format!("open {name} · {} clicks", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let w = 400.0;
    let mut y = 72.0 + y0;
    y += apply(
        accordion(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            &ITEMS,
            seed.choice,
            AccordionKind::Well,
            AccordionSize::Md,
            false,
        ),
        seed,
    ) + 18.0;

    draw.label("Outline", x, y, 12.0, MUTED);
    y += 18.0;
    y += apply(
        accordion(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            &ITEMS,
            seed.choice,
            AccordionKind::Outline,
            AccordionSize::Md,
            false,
        ),
        seed,
    ) + 18.0;

    draw.label("Ghost · Sm / Well · Lg", x, y, 12.0, MUTED);
    y += 18.0;
    let col = 192.0;
    let gap = 16.0;
    let sm = accordion(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        col,
        &ITEMS,
        seed.choice,
        AccordionKind::Ghost,
        AccordionSize::Sm,
        false,
    );
    let lg = accordion(
        draw,
        ptr,
        motion,
        dt,
        x + col + gap,
        y,
        col,
        &ITEMS,
        seed.choice,
        AccordionKind::Well,
        AccordionSize::Lg,
        false,
    );
    let h = apply(sm, seed).max(apply(lg, seed));
    y += h + 18.0;

    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 18.0;
    let _ = accordion(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &ITEMS,
        seed.choice.min(N - 1),
        AccordionKind::Well,
        AccordionSize::Md,
        true,
    );
}
