//! Toast overlay. Copy Dialog: parent owns `open` (don't call this when closed).
//! `apply_close` drops the opening mouse-up and plays the exit swoop before unmount.
//! WELL card. Auto-dismiss is parent-owned elapsed time.

use crate::button::{button, button_zoom, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::switch::switch;
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

const DISMISS: &str = "Dismiss";
const AUTO_SECS: f32 = 3.0;
const TOAST_W: f32 = 380.0;
const BAR_H: f32 = 3.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationKind {
    Info,
    Success,
    Warn,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationSize {
    Sm,
    Md,
    Lg,
}

impl NotificationSize {
    pub fn metrics(self) -> Size {
        match self {
            NotificationSize::Sm => SM,
            NotificationSize::Md => MD,
            NotificationSize::Lg => LG,
        }
    }

    fn button(self) -> ButtonSize {
        match self {
            NotificationSize::Sm => ButtonSize::Sm,
            NotificationSize::Md => ButtonSize::Md,
            NotificationSize::Lg => ButtonSize::Lg,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NotificationEvent {
    pub close: bool,
    pub gone: bool,
}

/// Paint a toast at `x, y`. `remaining` is 0..1 when `auto` (depletes to the left).
/// Snap `fresh` so the enter swoop starts at 0; parent owns `leaving`.
pub fn notification(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    title: &str,
    body: &str,
    kind: NotificationKind,
    size: NotificationSize,
    remaining: f32,
    auto: bool,
    fresh: &mut bool,
    leaving: bool,
    disabled: bool,
) -> NotificationEvent {
    let g = geo(w, title, body, size, auto);
    let h = g.h;
    if *fresh {
        motion.snap_slot(x, y, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(x, y, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    let e = t * t * (3.0 - 2.0 * t);
    let dy = (1.0 - e) * -28.0;
    let taper = 1.0 - e;
    let skew = (1.0 - e) * 16.0;
    let blur = (1.0 - e) * 12.0;
    let fade = if leaving {
        t.clamp(0.0, 1.0)
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let prev_layer = draw.layer;
    draw.layer = 12;
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    let hot = !disabled && !leaving && t > 0.5 && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let hover_scale = if disabled || leaving {
        1.0
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        PRESS_SCALE
    } else {
        motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt)
    };
    let scale = (0.90 + 0.10 * e) * hover_scale;
    let (fill, border, mut title_c, mut body_c) = if disabled {
        (lerp(WELL, INK, 0.35), BORDER, MUTED, MUTED)
    } else {
        match kind {
            NotificationKind::Info => (WELL, BORDER, FG, MUTED),
            NotificationKind::Success => (WELL, JADE, JADE, MUTED),
            NotificationKind::Warn => (lerp(WELL, INK, 0.22), BORDER, FG, MUTED),
        }
    };
    title_c[3] *= fade;
    body_c[3] *= fade;
    let mut shade = SCRIM;
    shade[3] *= fade * 0.45;
    draw.quad(x, y + dy + 3.0, w, h, shade, g.radius, scale);
    draw.card(
        x,
        y + dy,
        w,
        h,
        fill,
        border,
        g.radius,
        1.0,
        scale,
        fade,
        taper,
        blur,
        skew,
    );
    let cx = x + w * 0.5;
    let cy = y + h * 0.5;
    let cy_d = cy + dy;
    draw.label_swoop(
        title,
        x + g.pad,
        y + g.pad + dy,
        g.title_size,
        title_c,
        scale,
        cx,
        cy_d,
        g.title_w,
        g.title_h + g.title_size,
    );
    if !body.is_empty() {
        draw.label_swoop(
            body,
            x + g.pad,
            y + g.body_top + dy,
            g.body_size,
            body_c,
            scale,
            cx,
            cy_d,
            g.inner,
            g.body_h + g.body_size,
        );
    }
    if auto {
        let bx = x + g.pad;
        let by = y + dy + h - g.pad - BAR_H;
        let mut track = lerp(CLEAR, INK, fade);
        track[3] *= 0.55;
        draw.quad(bx, by, g.inner, BAR_H, track, BAR_H * 0.5, 1.0);
        let fw = g.inner * remaining.clamp(0.0, 1.0);
        if fw > 0.5 {
            let mut bar = JADE;
            bar[3] *= fade;
            draw.quad(bx, by, fw, BAR_H, bar, BAR_H * 0.5, 1.0);
        }
    }
    let live = t > 0.96 && !leaving;
    let ptr = if live && !disabled {
        ptr
    } else {
        Pointer {
            pressed: false,
            released: false,
            down: false,
            ..ptr
        }
    };
    let btn_x = cx + (x + w - g.pad - g.btn_w - cx) * scale;
    let btn_y = cy_d + (y + g.pad - cy) * scale;
    let dismiss = button_zoom(
        draw,
        ptr,
        motion,
        dt,
        btn_x,
        btn_y,
        DISMISS,
        ButtonKind::Ghost,
        size.button(),
        disabled,
        scale,
    );
    let timed_out = auto && remaining <= 0.001;
    draw.opacity = prev_op;
    draw.layer = prev_layer;
    NotificationEvent {
        close: !leaving && (dismiss || timed_out),
        gone: leaving && t < 0.03,
    }
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: NotificationEvent,
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

pub fn height_for(w: f32, title: &str, body: &str, size: NotificationSize, auto: bool) -> f32 {
    geo(w, title, body, size, auto).h
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
    if seed.on[0] && !seed.on[5] && seed.on[1] && !seed.on[2] {
        seed.value = (seed.value + dt).min(AUTO_SECS);
    }

    let kind = kind_of(seed.choice);
    let size = size_of(seed.tab);
    let status = if seed.toasts > 0 {
        format!("{} stacked", seed.toasts)
    } else if seed.on[0] {
        "manual".to_string()
    } else {
        "closed".to_string()
    };
    let x = 36.0 + x0;
    draw.label(
        format!(
            "open={}  auto={}  {}  clicks {}",
            seed.on[0] as u8, seed.on[1] as u8, status, seed.clicks
        ),
        x,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y_open = 64.0 + y0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_open,
        "Open",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) {
        const MAX: u8 = 3;
        if seed.toasts < MAX {
            seed.toasts += 1;
        } else {
            seed.toast_age[0] = seed.toast_age[1];
            seed.toast_age[1] = seed.toast_age[2];
        }
        let i = (seed.toasts as usize - 1).min(2);
        seed.toast_age[i] = 0.0;
        seed.on[0] = true;
        seed.on[2] = true;
        seed.on[4] = true;
        seed.on[5] = false;
        seed.clicks += 1;
    }
    let open_w = btn_w("Open", ButtonSize::Md);
    let _ = button(
        draw,
        ptr,
        motion,
        dt,
        x + open_w + MD.gap,
        y_open,
        "Open",
        ButtonKind::Primary,
        ButtonSize::Md,
        true,
    );

    let y_auto = y_open + MD.height + 16.0;
    if switch(draw, ptr, motion, dt, x, y_auto, seed.on[1], "Auto", false) {
        seed.on[1] = !seed.on[1];
        if seed.on[1] {
            seed.value = 0.0;
        }
    }

    let y_kind = y_auto + 26.0 + 16.0;
    draw.label("Kind", x, y_kind, 14.0, MUTED);
    let mut kx = x + btn_w("Kind", ButtonSize::Sm) + SM.gap;
    for (i, name) in ["Info", "Success", "Warn"].iter().enumerate() {
        let i = i as u32;
        let selected = seed.choice % 3 == i;
        if button(
            draw,
            ptr,
            motion,
            dt,
            kx,
            y_kind - 4.0,
            name,
            if selected {
                ButtonKind::Primary
            } else {
                ButtonKind::Outline
            },
            ButtonSize::Sm,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        kx += btn_w(name, ButtonSize::Sm) + SM.gap;
    }

    let y_size = y_kind + SM.height + 14.0;
    draw.label("Size", x, y_size, 14.0, MUTED);
    let mut sx = x + btn_w("Size", ButtonSize::Sm) + SM.gap;
    for (i, name) in ["Sm", "Md", "Lg"].iter().enumerate() {
        let i = i as u32;
        let selected = seed.tab % 3 == i;
        if button(
            draw,
            ptr,
            motion,
            dt,
            sx,
            y_size - 4.0,
            name,
            if selected {
                ButtonKind::Primary
            } else {
                ButtonKind::Outline
            },
            ButtonSize::Sm,
            false,
        ) {
            seed.tab = i;
            seed.clicks += 1;
        }
        sx += btn_w(name, ButtonSize::Sm) + SM.gap;
    }

    let (title, body) = copy_for(kind);
    let y_toast = y_size + SM.height + 20.0;
    let n = seed.toasts.min(3);
    let mut drop = None;
    for i in 0..n {
        let i = i as usize;
        if seed.on[1] {
            seed.toast_age[i] += dt;
        }
        let remaining = if seed.on[1] {
            (1.0 - seed.toast_age[i] / AUTO_SECS).clamp(0.0, 1.0)
        } else {
            1.0
        };
        let stack_y = y_toast + i as f32 * 92.0;
        let mut fresh = i == (n as usize - 1) && seed.on[4];
        let leaving = remaining <= 0.001;
        let ev = notification(
            draw, ptr, motion, dt, x, stack_y, TOAST_W, title, body, kind, size, remaining,
            seed.on[1], &mut fresh, leaving, false,
        );
        if i == n as usize - 1 {
            seed.on[4] = fresh;
        }
        if ev.close || ev.gone || leaving && ev.gone {
            drop = Some(i);
        }
    }
    if let Some(i) = drop {
        for j in i..2 {
            seed.toast_age[j] = seed.toast_age[j + 1];
        }
        seed.toast_age[2] = 0.0;
        seed.toasts = seed.toasts.saturating_sub(1);
        seed.on[0] = seed.toasts > 0;
    }

    let slot = height_for(
        TOAST_W,
        "Check this",
        "Still inkstone. No new hues.",
        NotificationSize::Lg,
        true,
    );
    let y_prev = y_toast + slot + 20.0;
    let mut preview_fresh = false;
    let preview = notification(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_prev,
        TOAST_W,
        "Preview",
        "Hover the WELL card. Dismiss counts; parent keeps it open.",
        NotificationKind::Info,
        NotificationSize::Md,
        1.0,
        false,
        &mut preview_fresh,
        false,
        false,
    );
    if preview.close {
        seed.clicks += 1;
    }

    let prev_h = height_for(
        TOAST_W,
        "Preview",
        "Hover the WELL card. Dismiss counts; parent keeps it open.",
        NotificationSize::Md,
        false,
    );
    let y_off = y_prev + prev_h + 14.0;
    let mut off_fresh = false;
    let _ = notification(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_off,
        TOAST_W,
        "Disabled",
        "Clicks are swallowed.",
        NotificationKind::Info,
        NotificationSize::Md,
        1.0,
        false,
        &mut off_fresh,
        false,
        true,
    );
}

fn copy_for(kind: NotificationKind) -> (&'static str, &'static str) {
    match kind {
        NotificationKind::Info => ("Heads up", "Toast. Parent owns open."),
        NotificationKind::Success => ("Saved", "Copied to the well."),
        NotificationKind::Warn => ("Check this", "Still inkstone. No new hues."),
    }
}

fn kind_of(choice: u32) -> NotificationKind {
    match choice % 3 {
        1 => NotificationKind::Success,
        2 => NotificationKind::Warn,
        _ => NotificationKind::Info,
    }
}

fn size_of(tab: u32) -> NotificationSize {
    match tab % 3 {
        0 => NotificationSize::Sm,
        2 => NotificationSize::Lg,
        _ => NotificationSize::Md,
    }
}

fn btn_w(label: &str, size: ButtonSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE
}

struct Geo {
    h: f32,
    pad: f32,
    radius: f32,
    title_size: f32,
    body_size: f32,
    title_w: f32,
    title_h: f32,
    body_h: f32,
    body_top: f32,
    inner: f32,
    btn_w: f32,
}

fn geo(w: f32, title: &str, body: &str, size: NotificationSize, auto: bool) -> Geo {
    let s = size.metrics();
    let pad = s.pad_x;
    let bsz = size.button();
    let bs = bsz.metrics();
    let btn_w = btn_w(DISMISS, bsz);
    let btn_h = bs.height;
    let title_size = s.font;
    let body_size = (s.font - 2.0).max(11.0);
    let inner = (w - pad * 2.0).max(48.0);
    let title_w = (inner - btn_w - s.gap).max(48.0);
    let tcols = (title_w / (title_size * MONO_ADVANCE)).max(8.0) as usize;
    let bcols = (inner / (body_size * MONO_ADVANCE)).max(8.0) as usize;
    let title_h = wrap_line_count(title, tcols).max(1) as f32 * title_size * 1.3;
    let body_h = if body.is_empty() {
        0.0
    } else {
        wrap_line_count(body, bcols).max(1) as f32 * body_size * 1.3
    };
    let row_h = title_h.max(btn_h);
    let body_gap = if body_h > 0.0 { s.gap } else { 0.0 };
    let bar_space = if auto { s.gap + BAR_H } else { 0.0 };
    let h = pad + row_h + body_gap + body_h + bar_space + pad;
    Geo {
        h,
        pad,
        radius: s.radius,
        title_size,
        body_size,
        title_w,
        title_h,
        body_h,
        body_top: pad + row_h + body_gap,
        inner,
        btn_w,
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
