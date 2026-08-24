//! Bottom sheet overlay. Copy of Dialog; slides in from below (`apply_close`).
//! Parent owns `open` (don't call this when closed).

use crate::button::{button, button_zoom, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    self, lerp, BORDER, CLEAR, FG, HOVER_SCALE, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM,
};

#[derive(Clone, Copy, Debug, Default)]
pub struct SheetEvent {
    pub close: bool,
    pub gone: bool,
    pub confirm: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SheetSize {
    Sm,
    Md,
    Lg,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SheetSide {
    Bottom,
    Top,
    Left,
    Right,
}

impl SheetSize {
    pub fn metrics(self) -> tokens::Size {
        match self {
            SheetSize::Sm => SM,
            SheetSize::Md => MD,
            SheetSize::Lg => LG,
        }
    }

    fn frac(self) -> f32 {
        match self {
            SheetSize::Sm => 0.42,
            SheetSize::Md => 0.56,
            SheetSize::Lg => 0.72,
        }
    }

    fn buttons(self) -> ButtonSize {
        match self {
            SheetSize::Sm => ButtonSize::Sm,
            SheetSize::Md => ButtonSize::Md,
            SheetSize::Lg => ButtonSize::Lg,
        }
    }
}

/// Overlay panel. Enter/exit is a Y slide (bottom: from below, top: from above).
pub fn sheet(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    vw: f32,
    vh: f32,
    title: &str,
    body: &str,
    size: SheetSize,
    side: SheetSide,
    disabled: bool,
    fresh: &mut bool,
    leaving: bool,
) -> SheetEvent {
    let s = size.metrics();
    let pad = (s.pad_x + 8.0).max(18.0);
    let title_size = (s.font + 4.0).max(16.0);
    let body_size = s.font;
    let body_top = pad + 16.0 + title_size * 1.3 + s.gap;
    let foot = s.height + pad + 8.0;
    let guess_w = match side {
        SheetSide::Left | SheetSide::Right => (vw * size.frac()).max(280.0).min(vw.max(280.0) * 0.92),
        _ => vw.max(160.0),
    };
    let inner = (guess_w - pad * 2.0).max(48.0);
    let cols = (inner / (body_size * MONO_ADVANCE)).max(8.0) as usize;
    let nlines = wrap_line_count(body, cols).max(1);
    let body_h = nlines as f32 * body_size * 1.3;
    let (px, py, pw, ph) = match side {
        SheetSide::Bottom | SheetSide::Top => {
            let cap = (vh * size.frac()).max(180.0);
            let ph = (body_top + body_h + foot).clamp(160.0, cap.min(vh.max(180.0) * 0.92));
            let py = if side == SheetSide::Bottom { vh - ph } else { 0.0 };
            (0.0, py, vw.max(160.0), ph)
        }
        SheetSide::Left | SheetSide::Right => {
            let cap = (vw * size.frac()).max(280.0);
            let pw = cap.min(vw.max(280.0) * 0.92);
            let px = if side == SheetSide::Right { vw - pw } else { 0.0 };
            (px, 0.0, pw, vh.max(160.0))
        }
    };
    if *fresh {
        motion.snap_slot(px, py, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(px, py, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    let e = t * t * (3.0 - 2.0 * t);
    // Full-height Y slide; scale stays at rest so this is not a Dialog pop.
    let scale = 1.0;
    let dx = match side {
        SheetSide::Left => -(1.0 - e) * pw,
        SheetSide::Right => (1.0 - e) * pw,
        _ => 0.0,
    };
    let dy = match side {
        SheetSide::Bottom => (1.0 - e) * ph,
        SheetSide::Top => -(1.0 - e) * ph,
        _ => 0.0,
    };
    let taper = if matches!(side, SheetSide::Left | SheetSide::Right) {
        0.0
    } else {
        (1.0 - e) * 0.55
    };
    let skew = 0.0;
    let blur = (1.0 - e) * 10.0;
    let fade = if leaving {
        t.clamp(0.0, 1.0)
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let scrim = lerp(CLEAR, SCRIM, fade);
    let prev_layer = draw.layer;
    draw.layer = DrawList::OVERLAY;
    draw.quad(0.0, 0.0, vw, vh, scrim, 0.0, 1.0);
    let vis_x = px + dx;
    let vis_y = py + dy;
    crate::glass::chrome(draw, vis_x, vis_y, pw, ph, 16.0);
    draw.card(
        vis_x, vis_y, pw, ph, CLEAR, BORDER, 16.0, 1.0, scale, fade, taper, blur, skew,
    );
    let mut title_c = if disabled { MUTED } else { FG };
    let mut body_c = MUTED;
    title_c[3] *= fade;
    body_c[3] *= fade;
    let cx = vis_x + pw * 0.5;
    let cy = vis_y + ph * 0.5;
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    draw.label_swoop(
        title,
        vis_x + pad,
        vis_y + pad + 12.0,
        title_size,
        title_c,
        scale,
        cx,
        cy,
        inner,
        title_size * 1.3 * 2.0,
    );
    draw.label_swoop(
        body,
        vis_x + pad,
        vis_y + body_top,
        body_size,
        body_c,
        scale,
        cx,
        cy,
        inner,
        body_h + body_size,
    );

    let live = t > 0.96 && !leaving;
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

    let handle = if matches!(side, SheetSide::Top | SheetSide::Bottom) {
        grabber(draw, ptr, motion, dt, vis_x, vis_y, pw, fade, disabled)
    } else {
        false
    };
    let btn = size.buttons();
    let cancel_w = btn_w("Cancel", btn);
    let done_w = btn_w("Done", btn);
    let by = vis_y + ph - s.height - pad * 0.45;
    let done_x = vis_x + pw - pad - done_w;
    let cancel_x = done_x - s.gap - cancel_w;
    let cancel = button_zoom(
        draw,
        ptr,
        motion,
        dt,
        cancel_x,
        by,
        "Cancel",
        ButtonKind::Ghost,
        btn,
        false,
        scale,
    );
    let done = button_zoom(
        draw,
        ptr,
        motion,
        dt,
        done_x,
        by,
        "Done",
        ButtonKind::Primary,
        btn,
        disabled,
        scale,
    );
    draw.opacity = prev_op;
    draw.layer = prev_layer;
    let in_overlay = ptr.hit(0.0, 0.0, vw, vh);
    let scrim_hit = ptr.released && in_overlay && !ptr.hit(vis_x, vis_y, pw, ph);
    SheetEvent {
        confirm: !leaving && done,
        close: !leaving && (cancel || done || handle || scrim_hit),
        gone: leaving && t < 0.03,
    }
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: SheetEvent,
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

fn grabber(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    px: f32,
    vis_y: f32,
    pw: f32,
    fade: f32,
    disabled: bool,
) -> bool {
    const HW: f32 = 40.0;
    const HH: f32 = 4.0;
    let hx = px + (pw - HW) * 0.5;
    let hy = vis_y + 10.0;
    let hit_x = hx - 12.0;
    let hit_y = vis_y + 2.0;
    let hit_w = HW + 24.0;
    let hit_h = 22.0;
    let hot = !disabled && ptr.hit(hit_x, hit_y, hit_w, hit_h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(hx, hy, 0, HOVER_SCALE);
        motion.snap_slot(hx, hy, 1, 1.0);
        (PRESS_SCALE, 1.0)
    } else {
        (
            motion.spring_slot(hx, hy, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(hx, hy, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let rest = MUTED;
    let hover = JADE;
    let mut fill = if disabled {
        lerp(MUTED, BORDER, 0.35)
    } else {
        lerp(rest, hover, u.clamp(0.0, 1.0))
    };
    fill[3] *= fade;
    if fill[3] > 0.02 {
        draw.outline(hx, hy, HW, HH, fill, CLEAR, HH * 0.5, 0.0, scale);
    }
    hot && ptr.pressed
}

fn btn_w(label: &str, size: ButtonSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE
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

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
    vw: f32,
    vh: f32,
) {
    let size = match seed.choice % 3 {
        0 => SheetSize::Sm,
        1 => SheetSize::Md,
        _ => SheetSize::Lg,
    };
    let side = match seed.tab % 4 {
        0 => SheetSide::Bottom,
        1 => SheetSide::Top,
        2 => SheetSide::Left,
        _ => SheetSide::Right,
    };
    let size_name = match size {
        SheetSize::Sm => "sm",
        SheetSize::Md => "md",
        SheetSize::Lg => "lg",
    };
    let side_name = match side {
        SheetSide::Bottom => "bottom",
        SheetSide::Top => "top",
        SheetSide::Left => "left",
        SheetSide::Right => "right",
    };
    draw.label(
        format!(
            "Slides from the edge. {} {} · clicks {} · {}",
            size_name,
            side_name,
            seed.clicks,
            if seed.dialog { "open" } else { "closed" }
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let mut x = 36.0 + x0;
    let y = 72.0 + y0;
    for (i, label) in [(0u32, "Sm"), (1, "Md"), (2, "Lg")] {
        let kind = if seed.choice % 3 == i {
            ButtonKind::Primary
        } else {
            ButtonKind::Ghost
        };
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            kind,
            ButtonSize::Sm,
            false,
        ) && !seed.dialog
        {
            seed.choice = i;
            seed.clicks += 1;
        }
        x += 64.0;
    }
    x += 12.0;
    for (i, label) in [(0u32, "Bottom"), (1, "Top"), (2, "Left"), (3, "Right")] {
        let kind = if seed.tab == i {
            ButtonKind::Primary
        } else {
            ButtonKind::Outline
        };
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            kind,
            ButtonSize::Sm,
            false,
        ) && !seed.dialog
        {
            seed.tab = i;
            seed.clicks += 1;
        }
        x += 80.0;
    }

    x = 36.0 + x0;
    let y2 = y + 44.0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Open sheet",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) && !seed.dialog
    {
        seed.on[0] = false;
        seed.open_dialog();
        seed.clicks += 1;
    }
    x += 140.0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Locked",
        ButtonKind::Outline,
        ButtonSize::Md,
        false,
    ) && !seed.dialog
    {
        seed.on[0] = true;
        seed.open_dialog();
        seed.clicks += 1;
    }
    x += 108.0;
    let _ = button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Disabled",
        ButtonKind::Primary,
        ButtonSize::Md,
        true,
    );

    if seed.dialog {
        let ev = sheet(
            draw,
            ptr,
            motion,
            dt,
            vw,
            vh,
            "Sheet",
            "Slides in from the edge. Handle, scrim, Cancel, or Done. Values stay in the parent.",
            size,
            side,
            seed.on[0],
            &mut seed.dialog_fresh,
            seed.dialog_leaving,
        );
        if ev.confirm {
            seed.clicks += 1;
        }
        apply_close(
            &mut seed.dialog,
            &mut seed.dialog_hold,
            &mut seed.dialog_leaving,
            ev,
            ptr,
        );
    }
}
