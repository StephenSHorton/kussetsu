//! Overlay. Destructive confirm. Copy Dialog.
//! Parent owns `open` (don't call this when closed). Scrim does not dismiss.

use crate::button::{button, button_zoom, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    self, lerp, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertDialogKind {
    Default,
    Destructive,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertDialogSize {
    Sm,
    Md,
    Lg,
}

impl AlertDialogSize {
    pub fn metrics(self) -> tokens::Size {
        match self {
            AlertDialogSize::Sm => SM,
            AlertDialogSize::Md => MD,
            AlertDialogSize::Lg => LG,
        }
    }

    fn cap(self) -> f32 {
        match self {
            AlertDialogSize::Sm => 320.0,
            AlertDialogSize::Md => 400.0,
            AlertDialogSize::Lg => 480.0,
        }
    }

    fn buttons(self) -> ButtonSize {
        match self {
            AlertDialogSize::Sm => ButtonSize::Sm,
            AlertDialogSize::Md => ButtonSize::Md,
            AlertDialogSize::Lg => ButtonSize::Lg,
        }
    }
}

impl AlertDialogKind {
    fn confirm(self) -> &'static str {
        match self {
            AlertDialogKind::Default => "Continue",
            AlertDialogKind::Destructive => "Delete",
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct AlertDialogEvent {
    pub close: bool,
    pub gone: bool,
    pub confirm: bool,
}

pub fn alert_dialog(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    ox: f32,
    oy: f32,
    vw: f32,
    vh: f32,
    title: &str,
    body: &str,
    kind: AlertDialogKind,
    size: AlertDialogSize,
    disabled: bool,
    fresh: &mut bool,
    leaving: bool,
) -> AlertDialogEvent {
    let s = size.metrics();
    let pw = vw.min(size.cap()).max(280.0);
    let pad = (s.pad_x + 8.0).max(18.0);
    let title_size = (s.font + 4.0).max(16.0);
    let body_size = s.font;
    let body_top = pad + title_size * 1.3 + s.gap;
    let foot = s.height + pad + 8.0;
    let inner = (pw - pad * 2.0).max(48.0);
    let cols = (inner / (body_size * MONO_ADVANCE)).max(8.0) as usize;
    let nlines = wrap_line_count(body, cols).max(1);
    let body_h = nlines as f32 * body_size * 1.3;
    let ph = (body_top + body_h + foot).clamp(180.0, vh.max(200.0) * 0.86);
    let px = ox + (vw - pw) * 0.5;
    let py = oy + (vh - ph) * 0.5;
    let cx = px + pw * 0.5;
    let cy = py + ph * 0.5;
    if *fresh {
        motion.snap_slot(px, py, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(px, py, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    let e = t * t * (3.0 - 2.0 * t);
    let scale = 0.90 + 0.10 * e;
    let dy = (1.0 - e) * 36.0;
    let taper = 1.0 - e;
    let skew = (1.0 - e) * 22.0;
    let blur = (1.0 - e) * 14.0;
    let fade = if leaving {
        t.clamp(0.0, 1.0)
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let scrim = lerp(CLEAR, SCRIM, fade);
    let prev_layer = draw.layer;
    draw.layer = DrawList::OVERLAY;
    draw.quad(ox, oy, vw, vh, scrim, 0.0, 1.0);
    let mut accent = match kind {
        AlertDialogKind::Destructive => lerp(INK, JADE, 0.92),
        AlertDialogKind::Default => lerp(BORDER, JADE, 0.35),
    };
    accent[3] *= fade;
    const RADIUS: f32 = 16.0;
    const STRIP: f32 = 2.0;
    crate::glass::chrome(draw, px, py + dy, pw, ph, RADIUS);
    draw.card(
        px,
        py + dy,
        pw,
        ph,
        CLEAR,
        BORDER,
        RADIUS,
        1.0,
        scale,
        fade,
        taper,
        blur,
        skew,
    );
    let inset = RADIUS.min(pw * 0.5);
    draw.quad(
        px + inset,
        py + dy,
        (pw - inset * 2.0).max(0.0),
        STRIP,
        accent,
        STRIP * 0.5,
        1.0,
    );
    let mut title_c = FG;
    let mut body_c = MUTED;
    title_c[3] *= fade;
    body_c[3] *= fade;
    draw.label_swoop(
        title,
        px + pad,
        py + pad + dy,
        title_size,
        title_c,
        scale,
        cx,
        cy + dy,
        inner,
        title_size * 1.3 * 2.0,
    );
    draw.label_swoop(
        body,
        px + pad,
        py + body_top + dy,
        body_size,
        body_c,
        scale,
        cx,
        cy + dy,
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
    let cy_d = cy + dy;
    let confirm = kind.confirm();
    let btn = size.buttons();
    let gap = s.gap;
    let cancel_w = btn_w("Cancel", btn);
    let confirm_w = btn_w(confirm, btn);
    let by = py + ph - s.height - pad * 0.45;
    let confirm_x0 = px + pw - pad - confirm_w;
    let cancel_x0 = confirm_x0 - gap - cancel_w;
    let cancel_x = cx + (cancel_x0 - cx) * scale;
    let cancel_y = cy_d + (by - cy) * scale;
    let done_x = cx + (confirm_x0 - cx) * scale;
    let done_y = cy_d + (by - cy) * scale;
    let cancel = button_zoom(
        draw,
        ptr,
        motion,
        dt,
        cancel_x,
        cancel_y,
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
        done_y,
        confirm,
        ButtonKind::Primary,
        btn,
        disabled,
        scale,
    );
    draw.layer = prev_layer;
    AlertDialogEvent {
        confirm: !leaving && done,
        close: !leaving && (cancel || done),
        gone: leaving && t < 0.03,
    }
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: AlertDialogEvent,
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

fn closed_hint(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> bool {
    let hot = ptr.hit(x, y, w, h);
    let scale = if hot && ptr.down {
        motion.snap_slot(x, y, 0, PRESS_SCALE);
        PRESS_SCALE
    } else {
        motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt)
    };
    draw.label_in(
        "Alert dialog closed",
        x,
        y,
        w,
        h,
        13.0,
        if hot { FG } else { MUTED },
        scale,
    );
    hot && ptr.pressed
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
    let last = match seed.choice {
        1 => "cancel",
        2 => "confirm",
        _ => "none",
    };
    draw.label(
        format!("Last {} · confirmed {} times", last, seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    let mut x = 36.0 + x0;
    let y = 72.0 + y0;
    let sizes = [(1u32, "Sm"), (0u32, "Md"), (2u32, "Lg")];
    for (id, label) in sizes {
        let on = seed.tab == id;
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            if on {
                ButtonKind::Primary
            } else {
                ButtonKind::Ghost
            },
            ButtonSize::Sm,
            false,
        ) && !seed.dialog
        {
            seed.tab = id;
        }
        x += 56.0;
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
        "Delete item",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) && !seed.dialog
    {
        seed.on[0] = true;
        seed.on[1] = false;
        seed.open_dialog();
    }
    x += 132.0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Continue",
        ButtonKind::Outline,
        ButtonSize::Md,
        false,
    ) && !seed.dialog
    {
        seed.on[0] = false;
        seed.on[1] = false;
        seed.open_dialog();
    }
    x += 118.0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Locked",
        ButtonKind::Ghost,
        ButtonSize::Md,
        false,
    ) && !seed.dialog
    {
        seed.on[0] = true;
        seed.on[1] = true;
        seed.open_dialog();
    }
    x += 96.0;
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

    const STAGE_W: f32 = 520.0;
    const STAGE_H: f32 = 360.0;
    let ox = 36.0 + x0;
    let oy = y2 + 56.0;
    draw.outline(ox, oy, STAGE_W, STAGE_H, INK, BORDER, 16.0, 1.0, 1.0);
    if seed.dialog {
        let kind = if seed.on[0] {
            AlertDialogKind::Destructive
        } else {
            AlertDialogKind::Default
        };
        let size = match seed.tab {
            1 => AlertDialogSize::Sm,
            2 => AlertDialogSize::Lg,
            _ => AlertDialogSize::Md,
        };
        let (title, body) = match kind {
            AlertDialogKind::Destructive => (
                "Delete this item?",
                "This cannot be undone. Cancel ghost, Primary confirm. Parent owns the choice.",
            ),
            AlertDialogKind::Default => (
                "Leave this page?",
                "Unsaved notes stay in the parent. Continue commits, Cancel keeps you here.",
            ),
        };
        let ev = alert_dialog(
            draw,
            ptr,
            motion,
            dt,
            ox,
            oy,
            STAGE_W,
            STAGE_H,
            title,
            body,
            kind,
            size,
            seed.on[1],
            &mut seed.dialog_fresh,
            seed.dialog_leaving,
        );
        if ev.confirm {
            seed.clicks += 1;
            seed.choice = 2;
        } else if ev.close {
            seed.choice = 1;
        }
        apply_close(
            &mut seed.dialog,
            &mut seed.dialog_hold,
            &mut seed.dialog_leaving,
            ev,
            ptr,
        );
    } else if closed_hint(draw, ptr, motion, dt, ox, oy, STAGE_W, STAGE_H) {
        seed.open_dialog();
    }
}
