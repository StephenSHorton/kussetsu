//! Pressed button group. Parent owns `on` / exclusive index. Copy Switch + Button.
//! Jade fill when on. Exclusive or multi via `seed.on` / `seed.choice`.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToggleSize {
    Sm,
    Md,
    Lg,
}

impl ToggleSize {
    pub fn metrics(self) -> Size {
        match self {
            ToggleSize::Sm => SM,
            ToggleSize::Md => MD,
            ToggleSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToggleMode {
    Exclusive,
    Multi,
}

pub fn width(label: &str, size: ToggleSize) -> f32 {
    item_w(label, size.metrics())
}

fn item_w(label: &str, s: Size) -> f32 {
    (s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE).max(s.height)
}

/// One pressed button. Parent owns `on`. Returns true on release (parent flips).
pub fn toggle(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    on: bool,
    size: ToggleSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let w = item_w(label, s);
    let h = s.height;
    cell(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        h,
        label,
        on,
        Face::Chrome,
        disabled,
        s,
    )
}

/// Connected group. `on[i]` is pressed. Returns the index released this frame.
pub fn toggle_group(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    labels: &[&str],
    on: &[bool],
    mode: ToggleMode,
    size: ToggleSize,
    disabled: bool,
) -> Option<u32> {
    let n = labels.len().min(on.len());
    if n == 0 {
        return None;
    }
    let s = size.metrics();
    let h = s.height;
    let mut cell_w = s.height;
    for label in labels.iter().take(n) {
        cell_w = cell_w.max(item_w(label, s));
    }
    let w = cell_w * n as f32;
    draw.outline(x, y, w, h, WELL, BORDER, s.radius, 1.0, 1.0);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    for i in 1..n {
        let dx = x + i as f32 * cell_w;
        draw.quad(dx, y + 8.0, 1.0, (h - 16.0).max(4.0), BORDER, 0.0, 1.0);
    }
    if mode == ToggleMode::Exclusive {
        if let Some(sel) = on.iter().take(n).position(|v| *v) {
            let target = x + sel as f32 * cell_w;
            let px = motion.spring(x, y + h, target, dt);
            let inset = 3.0;
            let fill = if disabled { JADE_DIM } else { JADE };
            draw.quad(
                px + inset,
                y + inset,
                (cell_w - inset * 2.0).max(4.0),
                (h - inset * 2.0).max(4.0),
                fill,
                (s.radius - inset).max(2.0),
                1.0,
            );
        }
    }
    let face = if mode == ToggleMode::Multi {
        Face::Inset
    } else {
        Face::Label
    };
    let mut hit = None;
    for i in 0..n {
        let ix = x + i as f32 * cell_w;
        if cell(
            draw, ptr, motion, dt, ix, y, cell_w, h, labels[i], on[i], face, disabled, s,
        ) {
            hit = Some(i as u32);
        }
    }
    hit
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Face {
    /// Own well + border (standalone).
    Chrome,
    /// Inset jade when on (multi group).
    Inset,
    /// Label only (exclusive group; parent paints the sliding pill).
    Label,
}

fn cell(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    label: &str,
    on: bool,
    face: Face,
    disabled: bool,
    s: Size,
) -> bool {
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let t_on = motion
        .spring_toggle(x, y, if on { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    // Slot 0 is the on-state (`spring_toggle`); hover lives in 1 and 2.
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
    let rest_on = [JADE[0], JADE[1], JADE[2], 0.92];
    let press_on = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
    let off = mix_phase(WELL, JADE_DIM, SCRIM, u);
    let on_c = mix_phase(rest_on, JADE, press_on, u);
    let fill = if disabled {
        if on {
            JADE_DIM
        } else {
            WELL
        }
    } else {
        lerp(off, on_c, t_on)
    };
    match face {
        Face::Chrome => {
            let border = if disabled {
                BORDER
            } else {
                lerp(BORDER, CLEAR, t_on)
            };
            let bw = if disabled { 1.0 } else { (1.0 - t_on).max(0.0) };
            draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
        }
        Face::Inset => {
            let hover = hot && t_on < 0.5;
            if t_on > 0.02 || hover {
                let inset = 3.0;
                let pill = if hover && t_on < 0.02 { JADE_DIM } else { fill };
                draw.outline(
                    x + inset,
                    y + inset,
                    (w - inset * 2.0).max(4.0),
                    (h - inset * 2.0).max(4.0),
                    pill,
                    CLEAR,
                    (s.radius - inset).max(2.0),
                    0.0,
                    scale,
                );
            }
        }
        Face::Label => {
            if hot && t_on < 0.15 {
                let inset = 3.0;
                draw.outline(
                    x + inset,
                    y + inset,
                    (w - inset * 2.0).max(4.0),
                    (h - inset * 2.0).max(4.0),
                    JADE_DIM,
                    CLEAR,
                    (s.radius - inset).max(2.0),
                    0.0,
                    scale,
                );
            }
        }
    }
    let ink = if disabled { MUTED } else { lerp(FG, INK, t_on) };
    draw.label_in(label, x, y, w, h, s.font, ink, scale);
    !disabled && hot && ptr.released
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
    const GAP: f32 = 8.0;
    let x = 36.0 + x0;
    draw.label(
        format!(
            "Parent owns on[] / choice. Exclusive or multi. {} clicks",
            seed.clicks
        ),
        x,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let mut y = 72.0 + y0;
    draw.label("Standalone", x, y, 12.0, MUTED);
    y += 20.0;
    let mut cx = x;
    for (label, slot) in [("Bold", 0usize), ("Italic", 1)] {
        if toggle(
            draw,
            ptr,
            motion,
            dt,
            cx,
            y,
            label,
            seed.on[slot],
            ToggleSize::Md,
            false,
        ) {
            seed.on[slot] = !seed.on[slot];
            seed.clicks += 1;
        }
        cx += width(label, ToggleSize::Md) + GAP;
    }
    let _ = toggle(
        draw,
        ptr,
        motion,
        dt,
        cx,
        y,
        "Mute",
        false,
        ToggleSize::Md,
        true,
    );
    cx += width("Mute", ToggleSize::Md) + GAP;
    let _ = toggle(
        draw,
        ptr,
        motion,
        dt,
        cx,
        y,
        "On",
        true,
        ToggleSize::Md,
        true,
    );

    y += MD.height + 20.0;
    draw.label("Exclusive", x, y, 12.0, MUTED);
    y += 20.0;
    const ALIGN: [&str; 3] = ["Left", "Center", "Right"];
    let sel = seed.choice.min(2);
    let exclusive = [sel == 0, sel == 1, sel == 2];
    if let Some(i) = toggle_group(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &ALIGN,
        &exclusive,
        ToggleMode::Exclusive,
        ToggleSize::Md,
        false,
    ) {
        seed.choice = i;
        seed.clicks += 1;
    }
    draw.label(
        ALIGN[sel as usize],
        x + 260.0,
        y + (MD.height - MD.font) * 0.5,
        MD.font,
        JADE,
    );

    y += MD.height + 20.0;
    draw.label("Multi", x, y, 12.0, MUTED);
    y += 20.0;
    const MARKS: [&str; 3] = ["B", "I", "U"];
    let multi = [seed.on[3], seed.on[4], seed.on[5]];
    if let Some(i) = toggle_group(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &MARKS,
        &multi,
        ToggleMode::Multi,
        ToggleSize::Md,
        false,
    ) {
        let slot = 3 + i as usize;
        seed.on[slot] = !seed.on[slot];
        seed.clicks += 1;
    }

    y += MD.height + 20.0;
    draw.label("Sizes", x, y, 12.0, MUTED);
    y += 20.0;
    const NUM: [&str; 3] = ["1", "2", "3"];
    let numbered = [sel == 0, sel == 1, sel == 2];
    for (size, step) in [
        (ToggleSize::Sm, SM.height + 12.0),
        (ToggleSize::Md, MD.height + 12.0),
        (ToggleSize::Lg, LG.height + 12.0),
    ] {
        if let Some(i) = toggle_group(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            &NUM,
            &numbered,
            ToggleMode::Exclusive,
            size,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        y += step;
    }

    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 20.0;
    let _ = toggle_group(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &ALIGN,
        &exclusive,
        ToggleMode::Exclusive,
        ToggleSize::Md,
        true,
    );
}
