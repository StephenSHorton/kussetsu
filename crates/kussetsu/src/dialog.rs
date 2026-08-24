//! Overlay. Copy this for Sheet / Popover / Alert Dialog / Menu / Notification.
//! Parent owns `open` (don't call this when closed).

use crate::button::{button_zoom, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{self, FG, MONO_ADVANCE, MUTED, SCRIM};

#[derive(Clone, Copy, Debug, Default)]
pub struct DialogEvent {
    pub close: bool,
    pub gone: bool,
}

pub fn dialog(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    vw: f32,
    vh: f32,
    title: &str,
    body: &str,
    fresh: &mut bool,
    leaving: bool,
) -> DialogEvent {
    let pw = vw.min(400.0).max(280.0);
    const PAD: f32 = 22.0;
    const TITLE_SIZE: f32 = 18.0;
    const BODY_SIZE: f32 = 14.0;
    const BODY_TOP: f32 = 52.0;
    const FOOT: f32 = 72.0;
    let inner = (pw - PAD * 2.0).max(48.0);
    let cols = (inner / (BODY_SIZE * MONO_ADVANCE)).max(8.0) as usize;
    let nlines = wrap_line_count(body, cols).max(1);
    let body_h = nlines as f32 * BODY_SIZE * 1.3;
    let ph = (BODY_TOP + body_h + FOOT).clamp(200.0, vh.max(220.0) * 0.86);
    let px = (vw - pw) * 0.5;
    let py = (vh - ph) * 0.5;
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
    let mut scrim = SCRIM;
    scrim[3] *= fade;
    let prev_layer = draw.layer;
    draw.layer = DrawList::OVERLAY;
    draw.quad(0.0, 0.0, vw, vh, scrim, 0.0, 1.0);
    crate::glass::chrome(draw, px, py + dy, pw, ph, 16.0);
    draw.card(
        px,
        py + dy,
        pw,
        ph,
        tokens::CLEAR,
        tokens::BORDER,
        16.0,
        1.0,
        scale,
        fade,
        taper,
        blur,
        skew,
    );
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    let title_c = FG;
    let body_c = MUTED;
    draw.label_swoop(
        title,
        px + PAD,
        py + 20.0 + dy,
        TITLE_SIZE,
        title_c,
        scale,
        cx,
        cy + dy,
        inner,
        TITLE_SIZE * 1.3 * 2.0,
    );
    draw.label_swoop(
        body,
        px + PAD,
        py + BODY_TOP + dy,
        BODY_SIZE,
        body_c,
        scale,
        cx,
        cy + dy,
        inner,
        body_h + BODY_SIZE,
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
    let cancel_x = cx + (px + pw - 180.0 - cx) * scale;
    let cancel_y = cy_d + (py + ph - 56.0 - cy) * scale;
    let done_x = cx + (px + pw - 96.0 - cx) * scale;
    let done_y = cy_d + (py + ph - 56.0 - cy) * scale;
    let cancel = button_zoom(
        draw,
        ptr,
        motion,
        dt,
        cancel_x,
        cancel_y,
        "Cancel",
        ButtonKind::Ghost,
        ButtonSize::Md,
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
        "Done",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
        scale,
    );
    draw.opacity = prev_op;
    draw.layer = prev_layer;
    let scrim_hit = ptr.released && !ptr.hit(px, py, pw, ph);
    DialogEvent {
        close: !leaving && (cancel || done || scrim_hit),
        gone: leaving && t < 0.03,
    }
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: DialogEvent,
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
