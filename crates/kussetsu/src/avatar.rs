//! Stateless click. Circle WELL, initials via `label_in`.
//! Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AvatarKind {
    Well,
    Jade,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AvatarSize {
    Sm,
    Md,
    Lg,
}

impl AvatarSize {
    pub fn metrics(self) -> Size {
        match self {
            AvatarSize::Sm => SM,
            AvatarSize::Md => MD,
            AvatarSize::Lg => LG,
        }
    }
}

pub fn avatar(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    initials: &str,
    kind: AvatarKind,
    size: AvatarSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let d = s.height;
    let n = initials.chars().count() as f32;
    let font = if n > 0.0 {
        s.font.min((d * 0.72) / (n * MONO_ADVANCE))
    } else {
        s.font
    };
    let hot = !disabled && ptr.hit(x, y, d, d);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
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
    let (fill, ink, border, bw) = if disabled {
        match kind {
            AvatarKind::Outline => (CLEAR, MUTED, BORDER, 1.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            AvatarKind::Well => (mix_phase(WELL, BORDER, INK, u), FG, BORDER, 1.0),
            AvatarKind::Jade => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            AvatarKind::Outline => (mix_phase(CLEAR, WELL, SCRIM, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, d, d, fill, border, d * 0.5, bw, scale);
    }
    draw.label_in(initials, x, y, d, d, font, ink, scale);
    !disabled && hot && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn caption(draw: &mut DrawList, x: f32, y: f32, d: f32, text: &str) {
    let font = SM.font;
    let tw = text.chars().count() as f32 * font * MONO_ADVANCE;
    draw.label(text, x + (d - tw) * 0.5, y + d + 6.0, font, MUTED);
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
    const GAP: f32 = 16.0;
    let guests = ["SH", "KS", "AK"];
    let g = guests[(seed.choice as usize) % guests.len()];
    draw.label(
        format!("onClick fired {} times · guest {g}", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    let md = AvatarSize::Md.metrics().height;
    if avatar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "KS",
        AvatarKind::Well,
        AvatarSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    caption(draw, x, y, md, "Well");
    x += md + GAP;
    if avatar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "KS",
        AvatarKind::Jade,
        AvatarSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    caption(draw, x, y, md, "Jade");
    x += md + GAP;
    if avatar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "KS",
        AvatarKind::Outline,
        AvatarSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    caption(draw, x, y, md, "Outline");
    x += md + GAP;
    let _ = avatar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "KS",
        AvatarKind::Well,
        AvatarSize::Md,
        true,
    );
    caption(draw, x, y, md, "Disabled");

    let y2 = y + md + 32.0;
    x = 36.0 + x0;
    for (size, name) in [
        (AvatarSize::Sm, "Sm"),
        (AvatarSize::Md, "Md"),
        (AvatarSize::Lg, "Lg"),
    ] {
        let d = size.metrics().height;
        if avatar(
            draw,
            ptr,
            motion,
            dt,
            x,
            y2,
            "KS",
            AvatarKind::Well,
            size,
            false,
        ) {
            seed.clicks += 1;
        }
        caption(draw, x, y2, d, name);
        x += d + GAP;
    }

    let y3 = y2 + LG.height + 40.0;
    draw.label("Pick a guest", 36.0 + x0, y3, 14.0, MUTED);
    let y4 = y3 + 24.0;
    x = 36.0 + x0;
    for (i, initials) in guests.iter().enumerate() {
        let kind = if (seed.choice as usize) % guests.len() == i {
            AvatarKind::Jade
        } else {
            AvatarKind::Well
        };
        if avatar(
            draw,
            ptr,
            motion,
            dt,
            x,
            y4,
            initials,
            kind,
            AvatarSize::Md,
            false,
        ) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        caption(draw, x, y4, md, initials);
        x += md + GAP;
    }
}
