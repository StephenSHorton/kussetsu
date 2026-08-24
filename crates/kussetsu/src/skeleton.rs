//! Loading stand-in. WELL fill; parent clock pulses alpha.
//! Parent owns pulse / selection. Returns clicked like Button.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    self, lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SkeletonKind {
    Bar,
    Circle,
    Block,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SkeletonSize {
    Sm,
    Md,
    Lg,
}

impl SkeletonSize {
    pub fn metrics(self) -> Size {
        match self {
            SkeletonSize::Sm => SM,
            SkeletonSize::Md => MD,
            SkeletonSize::Lg => LG,
        }
    }
}

const LABEL_GAP: f32 = 6.0;
const LABEL_FONT: f32 = 12.0;

/// `w <= 0` uses the size default. `pulse` is parent-owned; `clock` is `seed.clock`.
pub fn skeleton(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    kind: SkeletonKind,
    size: SkeletonSize,
    clock: f32,
    pulse: bool,
    label: &str,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let (bw, bh) = dim(kind, size, w);
    let lw = if label.is_empty() {
        0.0
    } else {
        label.chars().count() as f32 * LABEL_FONT * MONO_ADVANCE
    };
    let hit_w = bw.max(lw);
    let hit_h = if label.is_empty() {
        bh
    } else {
        bh + LABEL_GAP + LABEL_FONT
    };
    let hot = !disabled && ptr.hit(x, y, hit_w, hit_h);
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
    let a = breath(clock, x, y, pulse, disabled);
    let rest = with_alpha(lerp(WELL, MUTED, 0.16), a);
    let hover = with_alpha(lerp(WELL, JADE, 0.18), a.max(0.7));
    let press = with_alpha(lerp(WELL, tokens::JADE_DIM, 0.55), 1.0);
    let (fill, border, bw_px) = if disabled {
        let mut fill = lerp(WELL, BORDER, 0.35);
        fill = lerp(fill, SCRIM, 0.2);
        fill[3] = 0.55;
        (fill, BORDER, 1.0)
    } else {
        let fill = mix_phase(rest, hover, press, u);
        let (border, bw_px) = if u > 0.04 {
            (lerp(CLEAR, JADE, u.min(1.0)), 1.0)
        } else {
            (CLEAR, 0.0)
        };
        (fill, border, bw_px)
    };
    let radius = match kind {
        SkeletonKind::Bar | SkeletonKind::Circle => bh * 0.5,
        SkeletonKind::Block => s.radius,
    };
    if fill[3] > 0.02 || bw_px > 0.0 {
        draw.outline(x, y, bw, bh, fill, border, radius, bw_px, scale);
    }
    if !label.is_empty() {
        draw.label(
            label,
            x,
            y + bh + LABEL_GAP,
            LABEL_FONT,
            if disabled {
                MUTED
            } else if hot {
                FG
            } else {
                MUTED
            },
        );
    }
    !disabled && hot && ptr.pressed
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
    let pulse = seed.on[1];
    let cap = format!(
        "Pulse {} · {} clicks",
        if pulse { "on" } else { "off" },
        seed.clicks
    );
    let cap_x = 36.0 + x0;
    let cap_y = 36.0 + y0;
    let cap_font = 14.0;
    let cap_w = cap.chars().count() as f32 * cap_font * MONO_ADVANCE;
    let cap_h = cap_font + 6.0;
    let cap_hot = ptr.hit(cap_x, cap_y, cap_w, cap_h);
    draw.label(
        &cap,
        cap_x,
        cap_y,
        cap_font,
        if cap_hot { JADE } else { MUTED },
    );
    if cap_hot && ptr.pressed {
        seed.on[1] = !seed.on[1];
    }

    let gap = MD.gap * 2.0;
    let y1 = 72.0 + y0;
    let kinds = [
        (SkeletonKind::Bar, 132.0, "Bar", 0u32),
        (SkeletonKind::Circle, 0.0, "Circle", 1),
        (SkeletonKind::Block, 88.0, "Block", 2),
    ];
    let mut x = 36.0 + x0;
    let mut kind_h = 0.0f32;
    for (kind, w, name, id) in kinds {
        let (bw, bh) = dim(kind, SkeletonSize::Md, w);
        kind_h = kind_h.max(bh);
        if skeleton(
            draw,
            ptr,
            motion,
            dt,
            x,
            y1,
            w,
            kind,
            SkeletonSize::Md,
            seed.clock,
            pulse,
            name,
            false,
        ) {
            seed.choice = id;
            seed.clicks += 1;
        }
        mark(draw, x, y1 + bh, seed.choice == id);
        let lw = name.chars().count() as f32 * LABEL_FONT * MONO_ADVANCE;
        x += bw.max(lw) + gap;
    }
    let _ = skeleton(
        draw,
        ptr,
        motion,
        dt,
        x,
        y1,
        132.0,
        SkeletonKind::Bar,
        SkeletonSize::Md,
        seed.clock,
        pulse,
        "Disabled",
        true,
    );

    let y2 = y1 + kind_h + LABEL_GAP + LABEL_FONT + 24.0;
    let sizes = [
        (SkeletonSize::Sm, 100.0, "Small", 0u32),
        (SkeletonSize::Md, 140.0, "Medium", 1),
        (SkeletonSize::Lg, 180.0, "Large", 2),
    ];
    x = 36.0 + x0;
    let mut size_h = 0.0f32;
    for (size, w, name, id) in sizes {
        let (bw, bh) = dim(SkeletonKind::Bar, size, w);
        size_h = size_h.max(bh);
        if skeleton(
            draw,
            ptr,
            motion,
            dt,
            x,
            y2,
            w,
            SkeletonKind::Bar,
            size,
            seed.clock,
            pulse,
            name,
            false,
        ) {
            seed.tab = id;
            seed.clicks += 1;
        }
        mark(draw, x, y2 + bh, seed.tab == id);
        let lw = name.chars().count() as f32 * LABEL_FONT * MONO_ADVANCE;
        x += bw.max(lw) + gap;
    }

    let sz = match seed.tab {
        0 => SkeletonSize::Sm,
        2 => SkeletonSize::Lg,
        _ => SkeletonSize::Md,
    };
    let s = sz.metrics();
    let card_w = 280.0;
    let pad = 16.0;
    let inner_w = card_w - pad * 2.0;
    let (_, block_h) = dim(SkeletonKind::Block, sz, inner_w);
    let head = s.height.max(s.font * 2.0 + 12.0);
    let card_h = pad + head + pad * 0.5 + block_h + pad;
    let cx = 36.0 + x0;
    let cy = y2 + size_h + LABEL_GAP + LABEL_FONT + 24.0;
    draw.outline(cx, cy, card_w, card_h, INK, BORDER, LG.radius, 1.0, 1.0);
    let ax = cx + pad;
    let ay = cy + pad;
    if skeleton(
        draw,
        ptr,
        motion,
        dt,
        ax,
        ay,
        0.0,
        SkeletonKind::Circle,
        sz,
        seed.clock,
        pulse,
        "",
        false,
    ) {
        seed.clicks += 1;
    }
    let tx = ax + s.height + 12.0;
    let tw = (inner_w - s.height - 12.0).max(48.0);
    if skeleton(
        draw,
        ptr,
        motion,
        dt,
        tx,
        ay + 2.0,
        tw,
        SkeletonKind::Bar,
        sz,
        seed.clock,
        pulse,
        "",
        false,
    ) {
        seed.clicks += 1;
    }
    if skeleton(
        draw,
        ptr,
        motion,
        dt,
        tx,
        ay + 2.0 + s.font + 10.0,
        (tw * 0.62).max(36.0),
        SkeletonKind::Bar,
        sz,
        seed.clock,
        pulse,
        "",
        false,
    ) {
        seed.clicks += 1;
    }
    if skeleton(
        draw,
        ptr,
        motion,
        dt,
        ax,
        ay + head + pad * 0.5,
        inner_w,
        SkeletonKind::Block,
        sz,
        seed.clock,
        pulse,
        "",
        false,
    ) {
        seed.clicks += 1;
    }
}

fn dim(kind: SkeletonKind, size: SkeletonSize, w: f32) -> (f32, f32) {
    let s = size.metrics();
    match kind {
        SkeletonKind::Bar => {
            let width = if w > 1.0 { w } else { s.pad_x * 12.0 + 48.0 };
            (width, s.font)
        }
        SkeletonKind::Circle => (s.height, s.height),
        SkeletonKind::Block => {
            let width = if w > 1.0 { w } else { s.height * 3.0 };
            (width, s.height * 1.6)
        }
    }
}

fn breath(clock: f32, x: f32, y: f32, pulse: bool, disabled: bool) -> f32 {
    if disabled {
        0.5
    } else if !pulse {
        0.72
    } else {
        let wave = (clock * 2.4 + (x + y) * 0.018).sin() * 0.5 + 0.5;
        0.40 + 0.60 * wave
    }
}

fn with_alpha(mut c: [f32; 4], a: f32) -> [f32; 4] {
    c[3] = a;
    c
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn mark(draw: &mut DrawList, x: f32, y: f32, on: bool) {
    if on {
        draw.quad(x, y + 2.0, 18.0, 2.0, JADE, 1.0, 1.0);
    }
}
