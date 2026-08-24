//! Controlled boolean. Copy Switch. Square WELL, jade check when on.
//! Parent owns `checked`. Motion is shared (`Motion::spring`).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CheckboxSize {
    Sm,
    Md,
    Lg,
}

impl CheckboxSize {
    pub fn metrics(self) -> Size {
        match self {
            CheckboxSize::Sm => SM,
            CheckboxSize::Md => MD,
            CheckboxSize::Lg => LG,
        }
    }

    fn box_side(self) -> f32 {
        match self {
            CheckboxSize::Sm => 16.0,
            CheckboxSize::Md => 20.0,
            CheckboxSize::Lg => 24.0,
        }
    }
}

/// Square WELL + jade check. Label is part of the hit target. Returns whether it was clicked.
pub fn checkbox(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    checked: bool,
    label: &str,
    size: CheckboxSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let box_s = size.box_side();
    let lw = label.chars().count() as f32 * s.font * MONO_ADVANCE;
    let h = s.height.max(box_s);
    let w = if lw > 0.0 { box_s + s.gap + lw } else { box_s };
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let t = motion
        .spring_toggle(x, y, if checked { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    // Slot 0 is the check (`spring_toggle`); hover lives on 1 / 2.
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        motion.snap_slot(x, y, 1, HOVER_SCALE);
        motion.snap_slot(x, y, 2, 1.0);
        (PRESS_SCALE, 2.0)
    } else {
        (
            motion.spring_slot(x, y, 1, if hot { HOVER_SCALE } else { 1.0 }, dt),
            motion.spring_slot(x, y, 2, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let hover = u.min(1.0);
    let fill = if disabled {
        WELL
    } else {
        mix_phase(WELL, JADE_DIM, lerp(JADE_DIM, INK, 0.18), u)
    };
    let border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, t.max(hover))
    };
    let by = y + (h - box_s) * 0.5;
    draw.outline(x, by, box_s, box_s, fill, border, box_s * 0.2, 1.0, scale);
    let check = if disabled { MUTED } else { JADE };
    paint_check(draw, x, by, box_s, t, check, scale);
    if lw > 0.0 {
        draw.label(
            label,
            x + box_s + s.gap,
            y + (h - s.font) * 0.5,
            s.font,
            if disabled {
                MUTED
            } else {
                lerp(FG, JADE, hover)
            },
        );
    }
    !disabled && hot && ptr.released
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

/// Jade tick as overlapping quads (Plex subset has no ✓). Gated by spring `t`.
fn paint_check(draw: &mut DrawList, x: f32, y: f32, s: f32, t: f32, color: [f32; 4], scale: f32) {
    if t <= 0.02 {
        return;
    }
    let cx = x + s * 0.5;
    let cy = y + s * 0.5;
    let w = (s * 0.14).clamp(2.0, 4.5) * scale;
    let p0x = cx + (x + s * 0.20 - cx) * scale;
    let p0y = cy + (y + s * 0.52 - cy) * scale;
    let p1x = cx + (x + s * 0.40 - cx) * scale;
    let p1y = cy + (y + s * 0.74 - cy) * scale;
    let p2x = cx + (x + s * 0.80 - cx) * scale;
    let p2y = cy + (y + s * 0.26 - cy) * scale;
    const N: i32 = 12;
    for i in 0..N {
        let u = (i as f32 + 0.5) / N as f32;
        if u > t {
            break;
        }
        let (px, py) = if u < 0.32 {
            let k = u / 0.32;
            (p0x + (p1x - p0x) * k, p0y + (p1y - p0y) * k)
        } else {
            let k = (u - 0.32) / 0.68;
            (p1x + (p2x - p1x) * k, p1y + (p2y - p1y) * k)
        };
        draw.quad(px - w * 0.5, py - w * 0.5, w, w, color, w * 0.5, 1.0);
    }
}

fn row_width(label: &str, size: CheckboxSize) -> f32 {
    let s = size.metrics();
    let box_s = size.box_side();
    let lw = label.chars().count() as f32 * s.font * MONO_ADVANCE;
    if lw > 0.0 {
        box_s + s.gap + lw
    } else {
        box_s
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
    let n_on = seed.on.iter().take(6).filter(|on| **on).count();
    draw.label(
        format!("Parent owns on[] · {n_on} checked · {} clicks", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    for (i, label) in ["Glyph rain", "Caffeine", "Quiet hours"].iter().enumerate() {
        if checkbox(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            seed.on[i],
            label,
            CheckboxSize::Md,
            false,
        ) {
            seed.on[i] = !seed.on[i];
            seed.clicks += 1;
        }
        y += MD.height;
    }

    let _ = checkbox(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        true,
        "Disabled on",
        CheckboxSize::Md,
        true,
    );
    y += MD.height;
    let _ = checkbox(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        false,
        "Disabled off",
        CheckboxSize::Md,
        true,
    );

    y += MD.height + 8.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 22.0;
    let mut cx = x;
    for (i, (label, size)) in [
        ("Small", CheckboxSize::Sm),
        ("Medium", CheckboxSize::Md),
        ("Large", CheckboxSize::Lg),
    ]
    .iter()
    .enumerate()
    {
        let slot = i + 3;
        if checkbox(
            draw,
            ptr,
            motion,
            dt,
            cx,
            y,
            seed.on[slot],
            label,
            *size,
            false,
        ) {
            seed.on[slot] = !seed.on[slot];
            seed.clicks += 1;
            seed.tab = i as u32;
        }
        cx += row_width(label, *size) + 24.0;
    }
}
