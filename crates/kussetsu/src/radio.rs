//! Exclusive circle. Copy Switch. Parent owns `selected` (`seed.choice` is the index).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RadioSize {
    Sm,
    Md,
    Lg,
}

impl RadioSize {
    pub fn metrics(self) -> Size {
        match self {
            RadioSize::Sm => SM,
            RadioSize::Md => MD,
            RadioSize::Lg => LG,
        }
    }

    fn diameter(self) -> f32 {
        self.metrics().radius * 2.0
    }
}

fn radio_width(label: &str, size: RadioSize) -> f32 {
    let s = size.metrics();
    let d = size.diameter();
    let lw = label.chars().count() as f32 * s.font * MONO_ADVANCE;
    if lw > 0.0 {
        d + s.gap + lw
    } else {
        d
    }
}

pub fn radio(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    selected: bool,
    label: &str,
    size: RadioSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let d = size.diameter();
    let h = s.height.max(d);
    let w = radio_width(label, size);
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let t = motion
        .spring_toggle(x, y, if selected { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
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
        lerp(lerp(CLEAR, WELL, hover), JADE_DIM, t)
    };
    let border = if disabled {
        BORDER
    } else {
        lerp(lerp(BORDER, JADE, hover), JADE, t)
    };
    let ring_y = y + (h - d) * 0.5;
    draw.outline(x, ring_y, d, d, fill, border, d * 0.5, 1.0, scale);
    let inner = d * 0.5 * t;
    if inner > 0.6 {
        let ix = x + (d - inner) * 0.5;
        let iy = ring_y + (d - inner) * 0.5;
        draw.quad(
            ix,
            iy,
            inner,
            inner,
            if disabled { MUTED } else { JADE },
            inner * 0.5,
            scale,
        );
    }
    if !label.is_empty() {
        draw.label(
            label,
            x + d + s.gap,
            y + (h - s.font) * 0.5,
            s.font,
            if disabled { MUTED } else { FG },
        );
    }
    !disabled && hot && ptr.released
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
    const OPTIONS: [&str; 3] = ["Jade", "Well", "Ink"];
    seed.choice %= OPTIONS.len() as u32;
    let name = OPTIONS[seed.choice as usize];
    draw.label(
        format!("Parent owns the index · {name}"),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    for (i, label) in OPTIONS.iter().copied().enumerate() {
        if radio(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            seed.choice == i as u32,
            label,
            RadioSize::Md,
            false,
        ) {
            seed.choice = i as u32;
        }
        y += MD.height;
    }

    y += 8.0;
    let _ = radio(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        true,
        "Disabled",
        RadioSize::Md,
        true,
    );
    y += MD.height;
    let _ = radio(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        false,
        "Locked",
        RadioSize::Md,
        true,
    );

    y += MD.height + 16.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 22.0;
    let row_h = LG.height;
    let mut rx = x;
    for (i, (label, size)) in [
        ("Jade", RadioSize::Sm),
        ("Well", RadioSize::Md),
        ("Ink", RadioSize::Lg),
    ]
    .into_iter()
    .enumerate()
    {
        let h = size.metrics().height.max(size.diameter());
        let ry = y + (row_h - h) * 0.5;
        if radio(
            draw,
            ptr,
            motion,
            dt,
            rx,
            ry,
            seed.choice == i as u32,
            label,
            size,
            false,
        ) {
            seed.choice = i as u32;
        }
        rx += radio_width(label, size) + 24.0;
    }
}
