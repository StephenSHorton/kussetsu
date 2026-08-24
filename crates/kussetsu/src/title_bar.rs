//! Fake window chrome. WELL bar, title, traffic-light dots (paint only).
//! Stateless click — copy Button. Parent handles the returned bool.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TitleBarKind {
    /// Lights rest at MUTED / FG / JADE (inkstone traffic lights).
    Focused,
    /// Dim BORDER lights; the cluster wakes on hover.
    Inactive,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TitleBarSize {
    Sm,
    Md,
    Lg,
}

impl TitleBarSize {
    pub fn metrics(self) -> Size {
        match self {
            TitleBarSize::Sm => SM,
            TitleBarSize::Md => MD,
            TitleBarSize::Lg => LG,
        }
    }

    fn dot(self) -> f32 {
        match self {
            TitleBarSize::Sm => 8.0,
            TitleBarSize::Md => 10.0,
            TitleBarSize::Lg => 12.0,
        }
    }
}

const LIGHTS: u32 = 3;

pub fn title_bar(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    title: &str,
    kind: TitleBarKind,
    size: TitleBarSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let h = s.height;
    let font = s.font;
    let pad = s.pad_x;
    let d = size.dot();
    let hit = (d + s.gap).max(16.0);
    let focused = kind == TitleBarKind::Focused;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;

    // Sit on the parent glass. Hairline only — Suzuri does not fill chrome with WELL.
    let mut rule = if disabled {
        lerp(BORDER, MUTED, 0.25)
    } else {
        BORDER
    };
    rule[3] *= 0.7;
    draw.quad(x + 10.0, y + h - 1.0, (w - 20.0).max(0.0), 1.0, rule, 0.0, 1.0);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.2;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let cluster = pad + LIGHTS as f32 * hit;
    for i in 0..LIGHTS {
        let dx = x + pad + i as f32 * hit;
        let dy = y + (h - hit) * 0.5;
        let light_hot = !disabled && ptr.hit(dx, dy, hit, hit);
        let pressed = active || (light_hot && ptr.down);
        let (scale, u) = if disabled {
            (1.0, 0.0)
        } else if pressed {
            motion.snap_slot(dx, dy, 0, HOVER_SCALE);
            motion.snap_slot(dx, dy, 1, 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(dx, dy, 0, if light_hot { HOVER_SCALE } else { 1.0 }, dt),
                motion.spring_slot(dx, dy, 1, if light_hot { 1.0 } else { 0.0 }, dt),
            )
        };
        let want = if disabled {
            0.0
        } else if focused || hot {
            1.0
        } else {
            0.0
        };
        let lit = motion.spring_slot(dx, dy, 2, want, dt).clamp(0.0, 1.0);
        let accent = light_accent(i);
        let rest = lerp(BORDER, accent, lit);
        let hover = lerp(rest, accent, 0.65);
        let press = lerp(hover, INK, 0.18);
        let (color, ring, bw) = if disabled {
            (lerp(BORDER, MUTED, lit * 0.55), BORDER, 1.0)
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
    }

    let max_title = (w - cluster - pad).max(0.0);
    let tw = (title.chars().count() as f32 * font * MONO_ADVANCE).min(max_title);
    let mut tx = x + (w - tw) * 0.5;
    if tx < x + cluster {
        tx = x + cluster;
    }
    let (title_scale, tu) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 0, HOVER_SCALE);
        motion.snap_slot(x, y, 1, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let rest_ink = if focused { FG } else { MUTED };
    let ink = if disabled {
        MUTED
    } else {
        mix_phase(rest_ink, FG, JADE, tu)
    };
    if tw > 0.0 {
        draw.label_in(title, tx, y, tw, h, font, ink, title_scale);
    }

    !disabled && hot && ptr.pressed
}

fn light_accent(i: u32) -> [f32; 4] {
    match i {
        0 => MUTED,
        1 => FG,
        _ => JADE,
    }
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

const WINDOWS: [&str; 3] = ["Untitled", "notes.md", "Settings"];

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    let n = WINDOWS.len() as u32;
    if n > 0 {
        seed.choice %= n;
    }
    let focused = seed.choice;
    let name = WINDOWS[focused as usize];
    draw.label(
        format!(
            "Fake chrome — lights are paint. focused {name} · clicks {}",
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
    for (i, title) in WINDOWS.iter().enumerate() {
        let on = i as u32 == focused;
        let kind = if on {
            TitleBarKind::Focused
        } else {
            TitleBarKind::Inactive
        };
        if title_bar(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            title,
            kind,
            TitleBarSize::Md,
            false,
        ) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        if on {
            let body_y = y + MD.height;
            let body_h = 48.0;
            draw.outline(
                x,
                body_y,
                w,
                body_h,
                lerp(WELL, INK, 0.45),
                BORDER,
                0.0,
                1.0,
                1.0,
            );
            draw.label(
                "host chrome · traffic lights do not close",
                x + MD.pad_x,
                body_y + (body_h - MD.font) * 0.5,
                MD.font,
                MUTED,
            );
            y += MD.height + body_h + 16.0;
        } else {
            y += MD.height + 10.0;
        }
    }

    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 20.0;
    let _ = title_bar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        "offline",
        TitleBarKind::Focused,
        TitleBarSize::Md,
        true,
    );

    y += MD.height + 20.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 20.0;
    if title_bar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        name,
        TitleBarKind::Focused,
        TitleBarSize::Sm,
        false,
    ) {
        seed.clicks += 1;
    }

    y += SM.height + 16.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 20.0;
    if title_bar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        name,
        TitleBarKind::Focused,
        TitleBarSize::Lg,
        false,
    ) {
        seed.clicks += 1;
    }
}
