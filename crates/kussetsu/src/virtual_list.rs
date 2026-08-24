//! Visible range only. Copy Button: click a row to select.
//! Parent owns `scroll` 0..1 and `selected`. Never walks the full `count`.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VirtualListSize {
    Sm,
    Md,
    Lg,
}

impl VirtualListSize {
    pub fn metrics(self) -> Size {
        match self {
            VirtualListSize::Sm => SM,
            VirtualListSize::Md => MD,
            VirtualListSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct VirtualListEvent {
    pub item: Option<u32>,
    pub scroll: Option<f32>,
    /// Inclusive first visible index.
    pub first: u32,
    /// Exclusive end of the painted window.
    pub end: u32,
    pub took_wheel: bool,
}

const INSET: f32 = 6.0;
const SB_W: f32 = 10.0;
const SB_GAP: f32 = 4.0;
const RAIL: f32 = 2.0;
const TITLES: [&str; 8] = [
    "Inbox", "Draft", "Review", "Ship", "Later", "Hold", "Spike", "Done",
];

/// Window into `count` rows around `scroll` (0..1). `end` is exclusive.
pub fn visible_range(count: u32, scroll: f32, view_h: f32, row_h: f32) -> (u32, u32, f32) {
    if count == 0 || row_h < 1.0 {
        return (0, 0, 0.0);
    }
    let inner_h = (view_h - INSET * 2.0).max(row_h);
    let content = count as f32 * row_h;
    let max_scroll = (content - inner_h).max(0.0);
    let scroll_px = scroll.clamp(0.0, 1.0) * max_scroll;
    let first = (scroll_px / row_h).floor().max(0.0) as u32;
    let end = ((scroll_px + inner_h) / row_h).ceil() as u32;
    let end = end.min(count);
    let first = first.min(end);
    (first, end, scroll_px)
}

/// Scroll 0..1 that keeps `index` near the top third of the viewport.
pub fn scroll_to_index(index: u32, count: u32, view_h: f32, size: VirtualListSize) -> f32 {
    let row_h = size.metrics().height;
    let inner_h = (view_h - INSET * 2.0).max(row_h);
    let max_scroll = (count as f32 * row_h - inner_h).max(0.0);
    if max_scroll <= 0.0 {
        return 0.0;
    }
    let px = (index as f32 * row_h - inner_h * 0.3).clamp(0.0, max_scroll);
    px / max_scroll
}

/// Viewport of `count` rows. Only the visible slice is drawn.
/// Returns a clicked index and/or a dragged scroll.
pub fn virtual_list(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    count: u32,
    scroll: f32,
    selected: u32,
    size: VirtualListSize,
    disabled: bool,
) -> VirtualListEvent {
    let s = size.metrics();
    let row_h = s.height;
    let w = w.max(48.0);
    let h = h.max(row_h + INSET * 2.0);
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

    let inner_h = (h - INSET * 2.0).max(row_h);
    let content = count as f32 * row_h;
    let max_scroll = (content - inner_h).max(0.0);
    let sb_x = x + w - INSET - SB_W;
    let track_x = sb_x + (SB_W - 4.0) * 0.5;
    let track_y = y + INSET;
    let track_h = inner_h;
    let ratio = if content > 1.0 {
        (inner_h / content).clamp(0.08, 1.0)
    } else {
        1.0
    };
    let thumb_h = (ratio * track_h).max(16.0).min(track_h);
    let travel = (track_h - thumb_h).max(1.0);

    let list_hot = !disabled && ptr.hit(x, y, w, h);
    let took_wheel = list_hot && ptr.scroll.abs() > 0.1;
    let sb_hot = !disabled && max_scroll > 0.0 && ptr.hit(sb_x - SB_GAP, y, SB_W + SB_GAP * 2.0, h);
    let dragging = !disabled && motion.drag_latch(x + w, y, 3, ptr.down, ptr.pressed, sb_hot);
    let next = if dragging {
        Some(((ptr.y - track_y - thumb_h * 0.5) / travel).clamp(0.0, 1.0))
    } else if took_wheel && max_scroll > 0.5 {
        Some((scroll + ptr.scroll / content.max(1.0)).clamp(0.0, 1.0))
    } else {
        None
    };
    let target = next.unwrap_or(scroll).clamp(0.0, 1.0);
    if dragging {
        motion.snap_slot(x + w, y, 0, target);
    }
    let visual = motion.spring_toggle(x + w, y, target, dt).clamp(0.0, 1.0);
    let (first, end, scroll_px) = visible_range(count, visual, h, row_h);

    let rows_r = x + INSET;
    let rows_w = (sb_x - SB_GAP - rows_r).max(8.0);
    let view_top = y + INSET;
    let view_bot = y + h - INSET;
    let mut picked = None;
    for (vis, i) in (first..end).enumerate() {
        let y_i = view_top + i as f32 * row_h - scroll_px;
        let clip_top = y_i.max(view_top);
        let clip_bot = (y_i + row_h).min(view_bot);
        let vis_h = clip_bot - clip_top;
        if vis_h >= 1.0
            && row(
                draw,
                ptr,
                motion,
                dt,
                rows_r,
                y,
                y_i,
                clip_top,
                vis_h,
                rows_w,
                row_h,
                i,
                selected == i,
                disabled,
                s,
                vis as u32,
            )
        {
            picked = Some(i);
        }
    }

    if disabled {
        let mut wash = SCRIM;
        wash[3] = 0.18;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let (sb_scale, sb_u) = if disabled || max_scroll <= 0.0 {
        (1.0, 0.0)
    } else if dragging {
        motion.snap_slot(x + w, y, 1, HOVER_SCALE);
        motion.snap_slot(x + w, y, 2, 1.0);
        (PRESS_SCALE, 1.0)
    } else {
        (
            motion.spring_slot(x + w, y, 1, if sb_hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x + w, y, 2, if sb_hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let track = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE_DIM, sb_u.clamp(0.0, 1.0))
    };
    draw.quad(track_x, track_y, 4.0, track_h, track, 2.0, 1.0);
    let thumb_y = track_y + visual * travel;
    let thumb = if disabled { MUTED } else { JADE };
    draw.quad(track_x - 1.0, thumb_y, 6.0, thumb_h, thumb, 3.0, sb_scale);

    VirtualListEvent {
        item: if disabled { None } else { picked },
        scroll: if disabled { None } else { next },
        first,
        end,
        took_wheel,
    }
}

fn row(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    origin_y: f32,
    y_layout: f32,
    clip_top: f32,
    vis_h: f32,
    w: f32,
    h: f32,
    index: u32,
    selected: bool,
    disabled: bool,
    s: Size,
    slot: u32,
) -> bool {
    let hot = !disabled && ptr.hit(x, clip_top, w, vis_h);
    let active = hot && ptr.down;
    // Motion is keyed by visible slot, not item index, so cells stay bounded as you scroll.
    let key_y = origin_y + slot as f32;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, key_y, 0, HOVER_SCALE);
        motion.snap_slot(x, key_y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, key_y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, key_y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let hover = [JADE[0], JADE[1], JADE[2], 0.10];
    let press = lerp(hover, INK, 0.35);
    let fill = if disabled {
        CLEAR
    } else if selected {
        mix_phase(
            JADE_DIM,
            lerp(JADE_DIM, JADE, 0.18),
            lerp(JADE_DIM, JADE, 0.32),
            u,
        )
    } else {
        mix_phase(CLEAR, hover, press, u)
    };
    if fill[3] > 0.02 {
        draw.outline(
            x,
            clip_top,
            w,
            vis_h,
            fill,
            CLEAR,
            s.radius * 0.6,
            0.0,
            scale,
        );
    }
    if selected && vis_h > 8.0 {
        let mut tick = if disabled { MUTED } else { JADE };
        tick[3] *= (vis_h / h).clamp(0.0, 1.0);
        let th = (vis_h - 8.0).max(4.0);
        draw.quad(
            x + 4.0,
            clip_top + (vis_h - th) * 0.5,
            RAIL,
            th,
            tick,
            1.0,
            scale,
        );
    }
    if vis_h >= s.font * 0.7 {
        let cx = x + w * 0.5;
        let cy = y_layout + h * 0.5;
        let ty = y_layout + (h - s.font) * 0.5;
        let idx_w = 4.0 * s.font * MONO_ADVANCE;
        let text_x = x + s.pad_x;
        let digits = digit4(index);
        let idx = std::str::from_utf8(&digits).unwrap_or("0000");
        let title = TITLES[index as usize % TITLES.len()];
        let idx_c = if disabled {
            MUTED
        } else if selected {
            JADE
        } else {
            MUTED
        };
        let title_c = if disabled { MUTED } else { FG };
        draw.label_swoop(idx, text_x, ty, s.font, idx_c, scale, cx, cy, 0.0, 0.0);
        draw.label_swoop(
            title,
            text_x + idx_w + s.gap,
            ty,
            s.font,
            title_c,
            scale,
            cx,
            cy,
            0.0,
            0.0,
        );
    }
    !disabled && hot && ptr.pressed
}

fn digit4(i: u32) -> [u8; 4] {
    let n = i % 10000;
    [
        b'0' + ((n / 1000) % 10) as u8,
        b'0' + ((n / 100) % 10) as u8,
        b'0' + ((n / 10) % 10) as u8,
        b'0' + (n % 10) as u8,
    ]
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
    const COUNT: u32 = 1000;
    const VIEW_W: f32 = 340.0;
    const VIEW_H: f32 = 288.0;
    seed.value = seed.value.clamp(0.0, 1.0);
    seed.choice = seed.choice.min(COUNT - 1);
    seed.tab %= 3;
    let size = match seed.tab {
        1 => VirtualListSize::Sm,
        2 => VirtualListSize::Lg,
        _ => VirtualListSize::Md,
    };

    let ox = 36.0 + x0;
    let mut y = 64.0 + y0;
    let mut bx = ox;
    for (i, name) in ["Md", "Sm", "Lg"].iter().enumerate() {
        let tab = i as u32;
        let kind = if seed.tab == tab {
            ButtonKind::Primary
        } else {
            ButtonKind::Ghost
        };
        if button(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y,
            name,
            kind,
            ButtonSize::Sm,
            false,
        ) {
            seed.tab = tab;
            seed.clicks += 1;
        }
        let bw = SM.pad_x * 2.0 + name.chars().count() as f32 * SM.font * MONO_ADVANCE;
        bx += bw + SM.gap;
    }

    y += SM.height + 16.0;
    let ev = virtual_list(
        draw,
        ptr,
        motion,
        dt,
        ox,
        y,
        VIEW_W,
        VIEW_H,
        COUNT,
        seed.value,
        seed.choice,
        size,
        false,
    );
    if ev.took_wheel {
        seed.wheel_taken = true;
    }
    if let Some(v) = ev.scroll {
        seed.value = v;
    }
    if let Some(i) = ev.item {
        seed.choice = i;
        seed.clicks += 1;
    }
    let drew = ev.end.saturating_sub(ev.first);
    let window = if ev.end > ev.first {
        format!("{:04}–{:04}", ev.first, ev.end - 1)
    } else {
        "none".into()
    };
    draw.label(
        format!(
            "visible {window} of {COUNT} · drew {drew} · selected {:04} · {}%",
            seed.choice,
            (seed.value * 100.0).round() as i32
        ),
        ox,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let dx = ox + VIEW_W + 24.0;
    draw.label("Disabled", dx, y - 18.0, 12.0, MUTED);
    let _ = virtual_list(
        draw,
        ptr,
        motion,
        dt,
        dx,
        y,
        220.0,
        VIEW_H * 0.62,
        COUNT,
        0.2,
        0,
        VirtualListSize::Md,
        true,
    );

    y += VIEW_H + 14.0;
    let mut jx = ox;
    for (label, to) in [
        ("Top", 0.0),
        ("Sel", scroll_to_index(seed.choice, COUNT, VIEW_H, size)),
        ("End", 1.0),
    ] {
        if button(
            draw,
            ptr,
            motion,
            dt,
            jx,
            y,
            label,
            ButtonKind::Outline,
            ButtonSize::Sm,
            false,
        ) {
            seed.value = to;
            seed.clicks += 1;
        }
        let bw = SM.pad_x * 2.0 + label.chars().count() as f32 * SM.font * MONO_ADVANCE;
        jx += bw + SM.gap;
    }
}
