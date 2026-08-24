//! Header + rows. Copy List: parent owns `selected`; click returns the row.
//! Header click cycles sort. Drag a column rule to resize.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, INK, JADE, LG, MD, MONO_ADVANCE, MUTED, SCRIM, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableKind {
    Well,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableSize {
    Sm,
    Md,
    Lg,
}

impl TableSize {
    pub fn metrics(self) -> Size {
        match self {
            TableSize::Sm => SM,
            TableSize::Md => MD,
            TableSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TableEvent {
    pub row: Option<u32>,
    pub sort: Option<u32>,
    pub widths: Option<[f32; 8]>,
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn row_h(s: Size) -> f32 {
    s.height
}

fn table_h(n_rows: usize, s: Size) -> f32 {
    s.pad_x * 2.0 + row_h(s) * (n_rows as f32 + 1.0)
}

fn min_col(s: Size) -> f32 {
    s.pad_x * 2.0 + s.font * MONO_ADVANCE * 2.0
}

fn col_widths(cols: &[&str], rows: &[&[&str]], w: f32, s: Size) -> [f32; 8] {
    let n = cols.len().min(8);
    let mut raw = [0.0f32; 8];
    let min_c = min_col(s);
    for i in 0..n {
        let mut inner = cols[i].chars().count() as f32 * s.font * MONO_ADVANCE;
        for row in rows {
            if let Some(cell) = row.get(i) {
                inner = inner.max(cell.chars().count() as f32 * s.font * MONO_ADVANCE);
            }
        }
        raw[i] = (inner + s.pad_x * 2.0).max(min_c);
    }
    scale_to(&mut raw, n, (w - s.pad_x * 2.0).max(8.0));
    raw
}

fn scale_to(raw: &mut [f32; 8], n: usize, inner: f32) {
    let sum: f32 = raw.iter().take(n).sum();
    if sum > 0.5 && (sum - inner).abs() > 0.5 {
        let k = inner / sum;
        for i in 0..n {
            raw[i] *= k;
        }
    }
}

fn live_widths(
    cols: &[&str],
    rows: &[&[&str]],
    w: f32,
    s: Size,
    stored: [f32; 8],
) -> [f32; 8] {
    let n = cols.len().min(8);
    let inner = (w - s.pad_x * 2.0).max(8.0);
    let sum: f32 = stored.iter().take(n).sum();
    if sum < 8.0 {
        return col_widths(cols, rows, w, s);
    }
    let mut raw = stored;
    scale_to(&mut raw, n, inner);
    raw
}

pub fn width(cols: &[&str], rows: &[&[&str]], size: TableSize) -> f32 {
    let s = size.metrics();
    let n = cols.len().min(8);
    let mut inner = 0.0f32;
    for i in 0..n {
        let mut col = cols[i].chars().count() as f32 * s.font * MONO_ADVANCE;
        for row in rows {
            if let Some(cell) = row.get(i) {
                col = col.max(cell.chars().count() as f32 * s.font * MONO_ADVANCE);
            }
        }
        inner += col + s.pad_x * 2.0;
    }
    inner.max(s.pad_x * 2.0 + 80.0)
}

pub fn height(n_rows: usize, size: TableSize) -> f32 {
    table_h(n_rows, size.metrics())
}

pub fn next_sort(current: Option<u32>, desc: bool, clicked: u32) -> (Option<u32>, bool) {
    match current {
        Some(c) if c == clicked && !desc => (Some(clicked), true),
        Some(c) if c == clicked && desc => (None, false),
        _ => (Some(clicked), false),
    }
}

/// Returns the body row that was clicked (0-based), a header sort, or new widths.
pub fn table(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    cols: &[&str],
    rows: &[&[&str]],
    selected: u32,
    sort_col: Option<u32>,
    sort_desc: bool,
    widths: [f32; 8],
    kind: TableKind,
    size: TableSize,
    disabled: bool,
) -> TableEvent {
    let s = size.metrics();
    let n_cols = cols.len().min(8);
    let n_rows = rows.len();
    if n_cols == 0 || w < 32.0 {
        return TableEvent::default();
    }
    let total_h = table_h(n_rows, s);
    let _ = kind;
    crate::glass::chrome(draw, x, y, w, total_h, s.radius);
    if disabled {
        let mut veil = SCRIM;
        veil[3] = 0.18;
        draw.quad(x, y, w, total_h, veil, s.radius, 1.0);
    }

    let pad = s.pad_x;
    let inner_x = x + pad;
    let inner_w = (w - pad * 2.0).max(8.0);
    let mut col_w = live_widths(cols, rows, w, s, widths);
    let rh = row_h(s);
    let hy = y + pad;
    let handle = 8.0;
    let min_c = min_col(s);

    let mut ev = TableEvent::default();
    let mut grabbing = None;
    let mut cx = inner_x;
    for i in 0..n_cols.saturating_sub(1) {
        let hx = cx + col_w[i] - handle * 0.5;
        let hot = !disabled && ptr.hit(hx, hy, handle, rh);
        let slot = 10 + i as u32;
        let was = motion.get_slot(x, y, slot);
        let hold = if disabled || !ptr.down {
            motion.snap_slot(x, y, slot, 0.0);
            false
        } else if ptr.pressed {
            motion.snap_slot(x, y, slot, if hot { 1.0 } else { 0.0 });
            hot
        } else {
            let g = was > 0.5;
            motion.snap_slot(x, y, slot, if g { 1.0 } else { 0.0 });
            g
        };
        if hold {
            grabbing = Some(i);
            let pair = col_w[i] + col_w[i + 1];
            let left = (ptr.x - cx).clamp(min_c, (pair - min_c).max(min_c));
            col_w[i] = left;
            col_w[i + 1] = pair - left;
            ev.widths = Some(col_w);
        }
        let u = if hold {
            2.0
        } else {
            motion.spring_slot(hx, hy, 1, if hot { 1.0 } else { 0.0 }, dt)
        };
        if u > 0.04 {
            let mut pip = JADE;
            pip[3] *= (u.min(1.0) * 0.85).max(if hold { 1.0 } else { 0.0 });
            draw.quad(cx + col_w[i] - 1.0, hy + 2.0, 2.0, rh - 4.0, pip, 0.0, 1.0);
        }
        cx += col_w[i];
    }

    let mut cx = inner_x;
    let mut header_hit = None;
    for i in 0..n_cols {
        let cw = col_w[i];
        let hot = !disabled && grabbing.is_none() && ptr.hit(cx, hy, cw, rh);
        let u = if disabled {
            0.0
        } else if hot && ptr.down {
            motion.snap_slot(cx, hy, 1, 1.0);
            2.0
        } else {
            motion.spring_slot(cx, hy, 1, if hot { 1.0 } else { 0.0 }, dt)
        };
        if u > 0.04 && grabbing.is_none() {
            let hover = [JADE[0], JADE[1], JADE[2], 0.10];
            let fill = mix_phase(CLEAR, hover, lerp(hover, INK, 0.35), u);
            draw.outline(
                cx,
                hy,
                cw,
                rh,
                fill,
                CLEAR,
                (s.radius * 0.5).max(4.0),
                0.0,
                1.0,
            );
        }
        let mark = match sort_col {
            Some(c) if c == i as u32 => {
                if sort_desc {
                    " ▾"
                } else {
                    " ▴"
                }
            }
            _ => "",
        };
        let mut ink = if disabled { MUTED } else { MUTED };
        if sort_col == Some(i as u32) {
            ink = if disabled { MUTED } else { JADE };
        }
        draw.label_swoop(
            format!("{}{mark}", cols[i]),
            cx + s.pad_x * 0.35,
            hy + (rh - s.font) * 0.5,
            s.font,
            ink,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
        );
        if i + 1 < n_cols && grabbing != Some(i) {
            let mut rule = BORDER;
            rule[3] *= 0.7;
            draw.quad(cx + cw - 1.0, hy + 4.0, 1.0, rh - 8.0, rule, 0.0, 1.0);
        }
        if hot && ptr.released && grabbing.is_none() {
            header_hit = Some(i as u32);
        }
        cx += cw;
    }
    draw.quad(inner_x, hy + rh - 1.0, inner_w, 1.0, BORDER, 0.0, 1.0);
    if grabbing.is_none() {
        ev.sort = header_hit;
    }

    let mut picked = None;
    for (r, row) in rows.iter().enumerate() {
        let ry = hy + rh * (r as f32 + 1.0);
        let last = r + 1 == n_rows;
        if body_row(
            draw,
            ptr,
            motion,
            dt,
            inner_x,
            ry,
            inner_w,
            rh,
            &col_w,
            n_cols,
            row,
            selected == r as u32,
            disabled || grabbing.is_some(),
            last,
            s,
        ) {
            picked = Some(r as u32);
        }
    }
    ev.row = picked;
    if ev.widths.is_none() && widths.iter().take(n_cols).sum::<f32>() < 8.0 {
        ev.widths = Some(col_w);
    }
    ev
}

fn body_row(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    widths: &[f32; 8],
    n_cols: usize,
    row: &[&str],
    selected: bool,
    disabled: bool,
    last: bool,
    s: Size,
) -> bool {
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let u = if disabled {
        0.0
    } else if active {
        motion.snap_slot(x, y, 1, 1.0);
        2.0
    } else {
        motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt)
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
        draw.outline(x, y, w, h, fill, CLEAR, (s.radius * 0.5).max(4.0), 0.0, 1.0);
    }
    if sel > 0.04 {
        let mut tick = JADE;
        tick[3] *= sel;
        let th = (h - 10.0).max(8.0);
        draw.quad(x + 2.0, y + (h - th) * 0.5, 2.0, th, tick, 1.0, 1.0);
    }
    let ink = if disabled { MUTED } else { FG };
    let mut cx = x;
    for i in 0..n_cols {
        let cw = widths[i];
        let text = row.get(i).copied().unwrap_or("");
        draw.label_swoop(
            text,
            cx + s.pad_x * 0.35,
            y + (h - s.font) * 0.5,
            s.font,
            ink,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
        );
        if i + 1 < n_cols {
            let mut rule = BORDER;
            rule[3] *= 0.55;
            draw.quad(cx + cw - 1.0, y + 4.0, 1.0, h - 8.0, rule, 0.0, 1.0);
        }
        cx += cw;
    }
    if !last {
        draw.quad(x, y + h - 1.0, w, 1.0, BORDER, 0.0, 1.0);
    }
    !disabled && hot && ptr.released
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
    let cols = ["Guest", "Role", "Status"];
    let rows: [&[&str]; 5] = [
        &["Mori", "Owner", "Active"],
        &["Hana", "Editor", "Active"],
        &["Kenji", "Viewer", "Away"],
        &["Yuki", "Editor", "Active"],
        &["Aoi", "Viewer", "Paused"],
    ];
    let sort_col = if seed.tab == 0 {
        None
    } else {
        Some(seed.tab - 1)
    };
    let sort_desc = seed.on[5];
    let mut view: Vec<&[&str]> = rows.iter().copied().collect();
    if let Some(c) = sort_col {
        let c = c as usize;
        view.sort_by(|a, b| {
            let av = a.get(c).copied().unwrap_or("");
            let bv = b.get(c).copied().unwrap_or("");
            let ord = av.cmp(bv);
            if sort_desc {
                ord.reverse()
            } else {
                ord
            }
        });
    }
    let picked = if (seed.choice as usize) < view.len() {
        view[seed.choice as usize][0]
    } else {
        "none"
    };
    let sort_name = match sort_col {
        Some(0) => {
            if sort_desc {
                "Guest ▾"
            } else {
                "Guest ▴"
            }
        }
        Some(1) => {
            if sort_desc {
                "Role ▾"
            } else {
                "Role ▴"
            }
        }
        Some(2) => {
            if sort_desc {
                "Status ▾"
            } else {
                "Status ▴"
            }
        }
        _ => "unsorted",
    };
    draw.label(
        format!("Click header to sort · drag rules · {picked} · {sort_name} · {} clicks", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let y = 72.0 + y0;
    let w = width(&cols, &rows, TableSize::Md).max(420.0);
    let view_rows: Vec<&[&str]> = view;
    let ev = table(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &cols,
        &view_rows,
        seed.choice,
        sort_col,
        sort_desc,
        seed.widths,
        TableKind::Well,
        TableSize::Md,
        false,
    );
    if let Some(i) = ev.row {
        seed.choice = i;
        seed.clicks += 1;
    }
    if let Some(col) = ev.sort {
        let (next, desc) = next_sort(sort_col, sort_desc, col);
        seed.tab = next.map(|c| c + 1).unwrap_or(0);
        seed.on[5] = desc;
        seed.clicks += 1;
    }
    if let Some(ws) = ev.widths {
        seed.widths = ws;
    }

    let y2 = y + height(rows.len(), TableSize::Md) + 24.0;
    draw.label("Outline · disabled", x, y2, 12.0, MUTED);
    let _ = table(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2 + 18.0,
        w,
        &cols,
        &rows[..3],
        0,
        None,
        false,
        [0.0; 8],
        TableKind::Outline,
        TableSize::Sm,
        true,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sort_cycles_asc_desc_off() {
        assert_eq!(next_sort(None, false, 1), (Some(1), false));
        assert_eq!(next_sort(Some(1), false, 1), (Some(1), true));
        assert_eq!(next_sort(Some(1), true, 1), (None, false));
        assert_eq!(next_sort(Some(0), false, 2), (Some(2), false));
    }

    #[test]
    fn auto_widths_fill_inner() {
        let cols = ["A", "BB"];
        let rows: [&[&str]; 1] = [&["x", "yyyy"]];
        let s = MD;
        let w = 240.0;
        let raw = col_widths(&cols, &rows, w, s);
        let inner = w - s.pad_x * 2.0;
        let sum = raw[0] + raw[1];
        assert!((sum - inner).abs() < 0.6);
        assert!(raw[0] >= min_col(s) - 0.1);
    }
}
