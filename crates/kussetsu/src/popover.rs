//! Anchored overlay. Copy Dialog; no modal scrim.
//! Parent owns `open` (don't call this when closed).

use crate::button::{button, button_zoom, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE,
    SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PopoverSide {
    Top,
    Bottom,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PopoverSize {
    Sm,
    Md,
    Lg,
}

impl PopoverSize {
    pub fn metrics(self) -> crate::tokens::Size {
        match self {
            PopoverSize::Sm => SM,
            PopoverSize::Md => MD,
            PopoverSize::Lg => LG,
        }
    }

    fn btn(self) -> ButtonSize {
        match self {
            PopoverSize::Sm => ButtonSize::Sm,
            PopoverSize::Md => ButtonSize::Md,
            PopoverSize::Lg => ButtonSize::Lg,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PopoverEvent {
    pub close: bool,
    pub gone: bool,
    pub confirm: bool,
}

/// Paint a small card against an anchor rect. Outside click, ×, or Done closes.
pub fn popover(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    ax: f32,
    ay: f32,
    aw: f32,
    ah: f32,
    title: &str,
    body: &str,
    side: PopoverSide,
    size: PopoverSize,
    disabled: bool,
    fresh: &mut bool,
    leaving: bool,
) -> PopoverEvent {
    let g = geo(ax, ay, aw, ah, title, body, side, size);
    let px = g.x;
    let py = g.y;
    let pw = g.w;
    let ph = g.h;
    if *fresh {
        motion.snap_slot(px, py, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(px, py, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    let e = t * t * (3.0 - 2.0 * t);
    let enter = 0.90 + 0.10 * e;
    let dx = (1.0 - e) * 16.0 * g.dir_x;
    let dy = (1.0 - e) * 16.0 * g.dir_y;
    let taper = 1.0 - e;
    let skew = (1.0 - e) * 10.0;
    let blur = (1.0 - e) * 8.0;
    let fade = if leaving {
        t.clamp(0.0, 1.0)
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let live = t > 0.96 && !leaving && !disabled;
    let ptr = if live {
        ptr
    } else {
        Pointer {
            pressed: false,
            released: false,
            down: false,
            ..ptr
        }
    };
    let prev_layer = draw.layer;
    draw.layer = 12;
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    let ox = px + dx;
    let oy = py + dy;
    let cx = ox + pw * 0.5;
    let cy = oy + ph * 0.5;
    let hot = ptr.hit(px, py, pw, ph) || ptr.hit(g.kx, g.ky, CARET, CARET);
    let press = hot && ptr.down;
    let (hover_sc, u) = if disabled {
        (1.0, 0.0)
    } else if press {
        motion.snap_slot(px, py, 0, HOVER_SCALE);
        motion.snap_slot(px, py, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(px, py, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(px, py, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let scale = enter * hover_sc;
    let fill = if disabled {
        WELL
    } else {
        mix_phase(WELL, lerp(WELL, BORDER, 0.7), lerp(WELL, INK, 0.28), u)
    };
    let mut shade = SCRIM;
    shade[3] *= fade * 0.32;
    let mut border = BORDER;
    border[3] *= fade;
    let mut title_c = if disabled { MUTED } else { FG };
    let mut body_c = MUTED;
    title_c[3] *= fade;
    body_c[3] *= fade;
    draw.quad(ox, oy + 2.0, pw, ph, shade, g.radius, scale);
    draw.quad(
        g.kx + dx,
        g.ky + dy,
        CARET,
        CARET,
        lerp(CLEAR, INK, fade),
        2.0,
        scale,
    );
    draw.quad(
        g.kx + dx + 1.5,
        g.ky + dy + 1.5,
        CARET - 3.0,
        CARET - 3.0,
        lerp(CLEAR, JADE, fade),
        1.0,
        scale,
    );
    draw.card(
        ox, oy, pw, ph, fill, border, g.radius, 1.0, scale, fade, taper, blur, skew,
    );
    draw.label_swoop(
        title,
        ox + g.pad,
        oy + g.title_top,
        g.title_size,
        title_c,
        scale,
        cx,
        cy,
        g.title_w,
        g.title_h + g.title_size,
    );
    if !body.is_empty() {
        draw.label_swoop(
            body,
            ox + g.pad,
            oy + g.body_top,
            g.body_size,
            body_c,
            scale,
            cx,
            cy,
            g.inner,
            g.body_h + g.body_size,
        );
    }

    let mark = "×";
    let mark_w = g.title_size * MONO_ADVANCE;
    let mark_h = g.title_size;
    let mark_x = ox + pw - g.pad - mark_w;
    let mark_y = oy + g.title_top;
    let mark_hot = !disabled && ptr.hit(mark_x, mark_y, mark_w, mark_h);
    let mark_active = mark_hot && ptr.down;
    let mark_sc = if disabled {
        1.0
    } else if mark_active {
        motion.snap_slot(mark_x, mark_y, 0, HOVER_SCALE);
        PRESS_SCALE
    } else {
        motion.spring_slot(
            mark_x,
            mark_y,
            0,
            if mark_hot { HOVER_SCALE } else { 1.0 },
            dt,
        )
    };
    let mut mark_c = if disabled {
        MUTED
    } else {
        lerp(MUTED, JADE, if mark_hot { 1.0 } else { 0.0 })
    };
    mark_c[3] *= fade;
    draw.label_in(
        mark,
        mark_x,
        mark_y,
        mark_w,
        mark_h,
        g.title_size,
        mark_c,
        mark_sc,
    );
    let mark_hit = mark_hot && ptr.pressed;

    let bs = size.btn();
    let done_x = cx + (ox + pw - g.pad - g.done_w - cx) * scale;
    let done_y = cy + (oy + ph - g.pad - g.btn_h - cy) * scale;
    let done = button_zoom(
        draw,
        ptr,
        motion,
        dt,
        done_x,
        done_y,
        "Done",
        ButtonKind::Primary,
        bs,
        disabled,
        scale,
    );
    let outside = ptr.released && !hot;
    draw.opacity = prev_op;
    draw.layer = prev_layer;
    PopoverEvent {
        close: !leaving && !disabled && (mark_hit || done || outside),
        gone: leaving && t < 0.03,
        confirm: !disabled && done,
    }
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: PopoverEvent,
    ptr: Pointer,
) {
    if *hold {
        if !ptr.down {
            *hold = false;
        }
        return;
    }
    if ev.close {
        *leaving = true;
    }
    if ev.gone {
        *open = false;
        *leaving = false;
    }
}

const GAP: f32 = 8.0;
const CARET: f32 = 7.0;

struct Geo {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    kx: f32,
    ky: f32,
    dir_x: f32,
    dir_y: f32,
    pad: f32,
    radius: f32,
    title_size: f32,
    body_size: f32,
    inner: f32,
    title_top: f32,
    body_top: f32,
    title_h: f32,
    body_h: f32,
    title_w: f32,
    done_w: f32,
    btn_h: f32,
}

fn geo(
    ax: f32,
    ay: f32,
    aw: f32,
    ah: f32,
    title: &str,
    body: &str,
    side: PopoverSide,
    size: PopoverSize,
) -> Geo {
    let s = size.metrics();
    let pad = s.pad_x;
    let title_size = s.font + 2.0;
    let body_size = s.font;
    let w = match size {
        PopoverSize::Sm => 200.0,
        PopoverSize::Md => 244.0,
        PopoverSize::Lg => 288.0,
    };
    let inner = (w - pad * 2.0).max(48.0);
    let mark_w = title_size * MONO_ADVANCE;
    let title_w = (inner - mark_w - s.gap).max(48.0);
    let tcols = (title_w / (title_size * MONO_ADVANCE)).max(8.0) as usize;
    let bcols = (inner / (body_size * MONO_ADVANCE)).max(8.0) as usize;
    let tlines = if title.is_empty() {
        1
    } else {
        wrap_line_count(title, tcols).max(1)
    };
    let blines = if body.is_empty() {
        0
    } else {
        wrap_line_count(body, bcols).max(1)
    };
    let title_h = tlines as f32 * title_size * 1.3;
    let body_h = blines as f32 * body_size * 1.3;
    let body_gap = if blines == 0 { 0.0 } else { s.gap };
    let bs = size.btn().metrics();
    let done_w = bs.pad_x * 2.0 + 4.0 * bs.font * MONO_ADVANCE;
    let btn_h = bs.height;
    let title_top = pad;
    let body_top = title_top + title_h + body_gap;
    let h = (body_top + body_h + s.gap + btn_h + pad).max(s.height * 2.0);
    let (x, y, kx, ky, dir_x, dir_y) = match side {
        PopoverSide::Top => (
            ax + (aw - w) * 0.5,
            ay - GAP - h,
            ax + aw * 0.5 - CARET * 0.5,
            ay - GAP - CARET * 0.5,
            0.0,
            1.0,
        ),
        PopoverSide::Bottom => (
            ax + (aw - w) * 0.5,
            ay + ah + GAP,
            ax + aw * 0.5 - CARET * 0.5,
            ay + ah + GAP - CARET * 0.5,
            0.0,
            -1.0,
        ),
        PopoverSide::Left => (
            ax - GAP - w,
            ay + (ah - h) * 0.5,
            ax - GAP - CARET * 0.5,
            ay + ah * 0.5 - CARET * 0.5,
            1.0,
            0.0,
        ),
        PopoverSide::Right => (
            ax + aw + GAP,
            ay + (ah - h) * 0.5,
            ax + aw + GAP - CARET * 0.5,
            ay + ah * 0.5 - CARET * 0.5,
            -1.0,
            0.0,
        ),
    };
    Geo {
        x,
        y,
        w,
        h,
        kx,
        ky,
        dir_x,
        dir_y,
        pad,
        radius: s.radius,
        title_size,
        body_size,
        inner,
        title_top,
        body_top,
        title_h,
        body_h,
        title_w,
        done_w,
        btn_h,
    }
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

fn btn_box(label: &str, size: ButtonSize) -> (f32, f32) {
    let s = size.metrics();
    (
        s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE,
        s.height,
    )
}

fn side_of(choice: u32) -> PopoverSide {
    match choice % 4 {
        1 => PopoverSide::Top,
        2 => PopoverSide::Left,
        3 => PopoverSide::Right,
        _ => PopoverSide::Bottom,
    }
}

fn size_of(tab: u32) -> PopoverSize {
    match tab % 3 {
        1 => PopoverSize::Md,
        2 => PopoverSize::Lg,
        _ => PopoverSize::Sm,
    }
}

fn open_popover(seed: &mut crate::ui::SeedState) {
    seed.on[0] = true;
    seed.on[1] = true;
    seed.on[2] = false;
    seed.on[3] = true;
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
        "Copy Dialog. Anchored card, no scrim. Outside click closes.",
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    draw.label(
        format!(
            "open={}  side={}  size={}  clicks={}",
            seed.on[0] as u8,
            match seed.choice % 4 {
                1 => "top",
                2 => "left",
                3 => "right",
                _ => "bottom",
            },
            match seed.tab % 3 {
                1 => "md",
                2 => "lg",
                _ => "sm",
            },
            seed.clicks
        ),
        36.0 + x0,
        58.0 + y0,
        13.0,
        MUTED,
    );

    let y_side = 88.0 + y0;
    let mut x = 36.0 + x0;
    for (i, name) in ["Bottom", "Top", "Left", "Right"].iter().enumerate() {
        let i = i as u32;
        let kind = if seed.choice % 4 == i {
            ButtonKind::Primary
        } else {
            ButtonKind::Outline
        };
        let (w, _) = btn_box(name, ButtonSize::Sm);
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y_side,
            name,
            kind,
            ButtonSize::Sm,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        x += w + 10.0;
    }

    let y_sz = 124.0 + y0;
    x = 36.0 + x0;
    for (i, (name, bsz)) in [
        ("Sm", ButtonSize::Sm),
        ("Md", ButtonSize::Md),
        ("Lg", ButtonSize::Lg),
    ]
    .into_iter()
    .enumerate()
    {
        let i = i as u32;
        let kind = if seed.tab % 3 == i {
            ButtonKind::Primary
        } else {
            ButtonKind::Ghost
        };
        let (w, _) = btn_box(name, bsz);
        if button(draw, ptr, motion, dt, x, y_sz, name, kind, bsz, false) {
            seed.tab = i;
            seed.clicks += 1;
        }
        x += w + 12.0;
    }

    let ax = 36.0 + x0 + 180.0;
    let ay = 176.0 + y0;
    let alabel = "Open";
    let (aw, ah) = btn_box(alabel, ButtonSize::Md);
    if button(
        draw,
        ptr,
        motion,
        dt,
        ax,
        ay,
        alabel,
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) && !seed.on[0]
    {
        open_popover(seed);
        seed.clicks += 1;
    }
    let _ = button(
        draw,
        ptr,
        motion,
        dt,
        ax + aw + 12.0,
        ay,
        "Disabled",
        ButtonKind::Primary,
        ButtonSize::Md,
        true,
    );

    if seed.on[0] {
        let mut fresh = seed.on[1];
        let leaving = seed.on[2];
        let ev = popover(
            draw,
            ptr,
            motion,
            dt,
            ax,
            ay,
            aw,
            ah,
            "Share note",
            "Anchored to the trigger. Parent owns open.",
            side_of(seed.choice),
            size_of(seed.tab),
            false,
            &mut fresh,
            leaving,
        );
        seed.on[1] = fresh;
        if ev.confirm {
            seed.clicks += 1;
        }
        let mut open = seed.on[0];
        let mut hold = seed.on[3];
        let mut leaving = seed.on[2];
        apply_close(&mut open, &mut hold, &mut leaving, ev, ptr);
        seed.on[0] = open;
        seed.on[3] = hold;
        seed.on[2] = leaving;
    }
}
