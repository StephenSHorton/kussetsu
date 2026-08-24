//! Footer strip. Parent owns `active`. Dots / label return clicks (copy Button).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusBarSize {
    Sm,
    Md,
    Lg,
}

impl StatusBarSize {
    pub fn metrics(self) -> Size {
        match self {
            StatusBarSize::Sm => SM,
            StatusBarSize::Md => MD,
            StatusBarSize::Lg => LG,
        }
    }

    fn dot(self) -> f32 {
        match self {
            StatusBarSize::Sm => 6.0,
            StatusBarSize::Md => 8.0,
            StatusBarSize::Lg => 10.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StatusBarEvent {
    pub label: bool,
    pub dot: Option<u32>,
}

pub fn status_bar(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    message: &str,
    n_dots: u32,
    active: u32,
    size: StatusBarSize,
    disabled: bool,
) -> StatusBarEvent {
    let s = size.metrics();
    let h = s.height;
    let font = s.font;
    let pad = s.pad_x;
    let d = size.dot();
    let hit = (d + s.gap * 2.0).max(18.0);
    let n = n_dots;
    let dots_w = n as f32 * hit;
    let dots_left = x + w - pad - dots_w;
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

    let mut ev = StatusBarEvent::default();
    for i in 0..n {
        let dx = dots_left + i as f32 * hit;
        let dy = y + (h - hit) * 0.5;
        let selected = i == active;
        let hot = !disabled && ptr.hit(dx, dy, hit, hit);
        let pressed = hot && ptr.down;
            let (scale, u) = if disabled {
            (1.0, 0.0)
        } else if pressed {
            motion.snap_slot(dx, dy, 0, HOVER_SCALE);
            motion.snap_slot(dx, dy, 1, 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(dx, dy, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
                motion.spring_slot(dx, dy, 1, if hot { 1.0 } else { 0.0 }, dt),
            )
        };
        let lit = motion
            .spring_slot(dx, dy, 2, if selected { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0);
        let rest = lerp(CLEAR, JADE, lit);
        let hover = lerp(JADE_DIM, JADE, lit);
        let press = lerp(hover, INK, 0.18);
        let (color, ring, bw) = if disabled {
            (
                lerp(CLEAR, MUTED, lit),
                lerp(BORDER, MUTED, lit),
                if lit > 0.5 { 0.0 } else { 1.0 },
            )
        } else {
            (
                mix_phase(rest, hover, press, u),
                lerp(BORDER, CLEAR, lit),
                1.0 - lit,
            )
        };
        let vx = dx + (hit - d) * 0.5;
        let vy = dy + (hit - d) * 0.5;
        draw.outline(vx, vy, d, d, color, ring, d * 0.5, bw, scale);
        if hot && ptr.pressed {
            ev.dot = Some(i);
        }
    }

    let max_label = (dots_left - s.gap - (x + pad)).max(0.0);
    let lw = (message.chars().count() as f32 * font * MONO_ADVANCE).min(max_label);
    let lx = x + pad;
    let label_hot = !disabled && lw > 0.0 && ptr.hit(lx, y, lw, h);
    let label_press = label_hot && ptr.down;
    let (label_scale, lu) = if disabled {
        (1.0, 0.0)
    } else if label_press {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, y, 0, if label_hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 1, if label_hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let ink = if disabled {
        MUTED
    } else {
        mix_phase(MUTED, FG, FG, lu)
    };
    if lw > 0.0 {
        draw.label_in(message, lx, y, lw, h, font, ink, label_scale);
    }
    if ev.dot.is_none() && label_hot && ptr.pressed {
        ev.label = true;
    }
    ev
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

const PANES: [&str; 4] = [
    "shell · ready",
    "notes · 3 unsaved",
    "workspace · 2 online",
    "transfer · idle",
];

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    let n = PANES.len() as u32;
    if n > 0 {
        seed.choice %= n;
    }
    let active = seed.choice;
    let msg = PANES[active as usize];
    draw.label(
        format!(
            "Parent owns the pane. active {active} · clicks {}",
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    let x = 36.0 + x0;
    let w = 480.0;
    let mut y = 72.0 + y0;
    apply(
        status_bar(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            msg,
            n,
            active,
            StatusBarSize::Md,
            false,
        ),
        seed,
        n,
    );

    y += MD.height + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 20.0;
    let _ = status_bar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        "offline",
        n,
        active,
        StatusBarSize::Md,
        true,
    );

    y += MD.height + 20.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 20.0;
    apply(
        status_bar(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            msg,
            n,
            active,
            StatusBarSize::Sm,
            false,
        ),
        seed,
        n,
    );

    y += SM.height + 16.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 20.0;
    apply(
        status_bar(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            msg,
            n,
            active,
            StatusBarSize::Lg,
            false,
        ),
        seed,
        n,
    );
}

fn apply(ev: StatusBarEvent, seed: &mut crate::ui::SeedState, n: u32) {
    if let Some(i) = ev.dot {
        seed.choice = i;
        seed.clicks += 1;
    } else if ev.label {
        seed.choice = if n == 0 { 0 } else { (seed.choice + 1) % n };
        seed.clicks += 1;
    }
}
