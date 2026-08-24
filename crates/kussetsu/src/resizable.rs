//! Two WELL panes split by a BORDER handle. Copy Switch: parent owns `value`.
//! `value` is the first pane's fraction, clamped 0.2..0.8.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

pub const SPLIT_MIN: f32 = 0.2;
pub const SPLIT_MAX: f32 = 0.8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResizableAxis {
    /// Left | right. Vertical handle.
    Horizontal,
    /// Top / bottom. Horizontal handle.
    Vertical,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResizableSize {
    Sm,
    Md,
    Lg,
}

impl ResizableSize {
    pub fn metrics(self) -> Size {
        match self {
            ResizableSize::Sm => SM,
            ResizableSize::Md => MD,
            ResizableSize::Lg => LG,
        }
    }

    fn gap(self) -> f32 {
        self.metrics().gap + 4.0
    }

    fn bar(self) -> f32 {
        match self {
            ResizableSize::Sm => 3.0,
            ResizableSize::Md => 4.0,
            ResizableSize::Lg => 5.0,
        }
    }
}

struct SplitGeo {
    ax: f32,
    ay: f32,
    aw: f32,
    ah: f32,
    bx: f32,
    by: f32,
    bw: f32,
    bh: f32,
    hx: f32,
    hy: f32,
    hw: f32,
    hh: f32,
    usable: f32,
}

fn geo(x: f32, y: f32, w: f32, h: f32, t: f32, gap: f32, axis: ResizableAxis) -> SplitGeo {
    match axis {
        ResizableAxis::Horizontal => {
            let usable = (w - gap).max(1.0);
            let aw = usable * t;
            let bw = (usable - aw).max(0.0);
            SplitGeo {
                ax: x,
                ay: y,
                aw,
                ah: h,
                bx: x + aw + gap,
                by: y,
                bw,
                bh: h,
                hx: x + aw,
                hy: y,
                hw: gap,
                hh: h,
                usable,
            }
        }
        ResizableAxis::Vertical => {
            let usable = (h - gap).max(1.0);
            let ah = usable * t;
            let bh = (usable - ah).max(0.0);
            SplitGeo {
                ax: x,
                ay: y,
                aw: w,
                ah,
                bx: x,
                by: y + ah + gap,
                bw: w,
                bh,
                hx: x,
                hy: y + ah,
                hw: w,
                hh: gap,
                usable,
            }
        }
    }
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn paint_grip(
    draw: &mut DrawList,
    axis: ResizableAxis,
    hx: f32,
    hy: f32,
    hw: f32,
    hh: f32,
    s: Size,
    fill: [f32; 4],
    border: [f32; 4],
    pip: [f32; 4],
    scale: f32,
) {
    let vertical = axis == ResizableAxis::Horizontal;
    let (gw, gh) = if vertical {
        ((s.height * 0.34).max(8.0), (s.height * 0.72).max(16.0))
    } else {
        ((s.height * 0.72).max(16.0), (s.height * 0.34).max(8.0))
    };
    let gx = hx + (hw - gw) * 0.5;
    let gy = hy + (hh - gh) * 0.5;
    let rad = gw.min(gh) * 0.45;
    draw.outline(gx, gy, gw, gh, fill, border, rad, 1.0, scale);
    let pip_s = (s.gap * 0.45).clamp(2.0, 3.5);
    let span = pip_s * 3.0 + 2.0 * 2.0;
    let cx = gx + gw * 0.5;
    let cy = gy + gh * 0.5;
    for i in 0..3 {
        let o = i as f32 * (pip_s + 2.0) - span * 0.5 + pip_s * 0.5;
        let (px, py) = if vertical { (cx, cy + o) } else { (cx + o, cy) };
        let qx = cx + (px - cx) * scale - pip_s * scale * 0.5;
        let qy = cy + (py - cy) * scale - pip_s * scale * 0.5;
        draw.quad(qx, qy, pip_s * scale, pip_s * scale, pip, pip_s * 0.5, 1.0);
    }
}

fn paint_pane(
    draw: &mut DrawList,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    title: &str,
    pct: &str,
    s: Size,
    fill: [f32; 4],
    border: [f32; 4],
    title_c: [f32; 4],
    muted: [f32; 4],
    radius: f32,
) {
    if w < 2.0 || h < 2.0 {
        return;
    }
    draw.outline(x, y, w, h, fill, border, radius, 1.0, 1.0);
    let pad = s.pad_x.min(w * 0.5).max(4.0);
    let inner_w = (w - pad * 2.0).max(0.0);
    if inner_w < 8.0 || h < s.font + 4.0 {
        return;
    }
    let ty = y + (s.gap).min((h - s.font) * 0.35).max(4.0);
    if !title.is_empty() {
        draw.label_in(
            title,
            x + pad,
            ty,
            inner_w,
            s.font + 2.0,
            s.font,
            title_c,
            1.0,
        );
    }
    let py = ty + s.font + (s.gap * 0.5).max(2.0);
    if py + s.font <= y + h - 4.0 {
        draw.label_in(pct, x + pad, py, inner_w, s.font + 2.0, s.font, muted, 1.0);
    }
}

/// Jade handle between two wells. Returns a new 0.2..0.8 split while dragged.
pub fn resizable(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    value: f32,
    a: &str,
    b: &str,
    axis: ResizableAxis,
    size: ResizableSize,
    disabled: bool,
) -> Option<f32> {
    let s = size.metrics();
    let gap = size.gap();
    let value = value.clamp(SPLIT_MIN, SPLIT_MAX);
    // Slot 3 latches a drag that started on this handle (fast moves leave the strip).
    let was = motion.spring_slot(x, y, 3, 0.0, 0.0);
    let t0 = motion
        .spring_toggle(x, y, value, dt)
        .clamp(SPLIT_MIN, SPLIT_MAX);
    let g0 = geo(x, y, w, h, t0, gap, axis);
    let hot = !disabled && ptr.hit(g0.hx, g0.hy, g0.hw, g0.hh);
    let grabbing = if disabled || !ptr.down {
        motion.snap_slot(x, y, 3, 0.0);
        false
    } else if ptr.pressed {
        motion.snap_slot(x, y, 3, if hot { 1.0 } else { 0.0 });
        hot
    } else {
        let g = was > 0.5;
        motion.snap_slot(x, y, 3, if g { 1.0 } else { 0.0 });
        g
    };
    let next = if grabbing {
        let v = match axis {
            ResizableAxis::Horizontal => (ptr.x - x - gap * 0.5) / g0.usable,
            ResizableAxis::Vertical => (ptr.y - y - gap * 0.5) / g0.usable,
        };
        Some(v.clamp(SPLIT_MIN, SPLIT_MAX))
    } else {
        None
    };
    let t = if let Some(v) = next {
        motion.snap_slot(x, y, 0, v);
        v
    } else {
        t0
    };
    let g = geo(x, y, w, h, t, gap, axis);
    let active = grabbing;
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
    let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
    let handle = if disabled {
        MUTED
    } else {
        mix_phase(BORDER, JADE, press, u)
    };
    let pane = if disabled { lerp(WELL, INK, 0.2) } else { WELL };
    let ink = if disabled { MUTED } else { FG };
    paint_pane(
        draw,
        g.ax,
        g.ay,
        g.aw,
        g.ah,
        a,
        &format!("{}%", (t * 100.0).round() as i32),
        s,
        pane,
        BORDER,
        ink,
        MUTED,
        s.radius,
    );
    paint_pane(
        draw,
        g.bx,
        g.by,
        g.bw,
        g.bh,
        b,
        &format!("{}%", ((1.0 - t) * 100.0).round() as i32),
        s,
        pane,
        BORDER,
        ink,
        MUTED,
        s.radius,
    );
    let bar = size.bar();
    match axis {
        ResizableAxis::Horizontal => {
            let bx = g.hx + (g.hw - bar) * 0.5;
            let inset = s.gap.max(4.0);
            draw.outline(
                bx,
                g.hy + inset,
                bar,
                (g.hh - inset * 2.0).max(bar),
                handle,
                CLEAR,
                bar * 0.5,
                0.0,
                1.0,
            );
        }
        ResizableAxis::Vertical => {
            let by = g.hy + (g.hh - bar) * 0.5;
            let inset = s.gap.max(4.0);
            draw.outline(
                g.hx + inset,
                by,
                (g.hw - inset * 2.0).max(bar),
                bar,
                handle,
                CLEAR,
                bar * 0.5,
                0.0,
                1.0,
            );
        }
    }
    let grip_fill = if disabled {
        WELL
    } else {
        mix_phase(WELL, lerp(WELL, JADE, 0.22), press, u)
    };
    let grip_border = if disabled { BORDER } else { handle };
    let pip = if disabled {
        MUTED
    } else {
        mix_phase(MUTED, INK, INK, u.min(1.0))
    };
    paint_grip(
        draw,
        axis,
        g.hx,
        g.hy,
        g.hw,
        g.hh,
        s,
        grip_fill,
        grip_border,
        pip,
        scale,
    );
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    next
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
    seed.value = seed.value.clamp(SPLIT_MIN, SPLIT_MAX);

    let x = 36.0 + x0;
    draw.label(
        format!(
            "Parent owns 0.2..0.8. split {:.0}% · {} drags",
            seed.value * 100.0,
            seed.clicks
        ),
        x,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let live_w = 480.0;
    let live_h = 132.0;
    let y_live = 64.0 + y0;
    if let Some(v) = resizable(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_live,
        live_w,
        live_h,
        seed.value,
        "Notes",
        "Preview",
        ResizableAxis::Horizontal,
        ResizableSize::Md,
        false,
    ) {
        if ptr.pressed {
            seed.clicks += 1;
        }
        seed.value = v;
    }

    let y_btn = y_live + live_h + 12.0;
    let mut bx = x;
    let presets: [(&str, f32); 5] = [
        ("20%", 0.2),
        ("40%", 0.4),
        ("50%", 0.5),
        ("60%", 0.6),
        ("80%", 0.8),
    ];
    for (label, v) in presets {
        if button(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y_btn,
            label,
            ButtonKind::Ghost,
            ButtonSize::Sm,
            false,
        ) {
            seed.value = v;
        }
        let bw = SM.pad_x * 2.0 + label.chars().count() as f32 * SM.font * MONO_ADVANCE;
        bx += bw + SM.gap;
    }

    let y_pair = y_btn + SM.height + 24.0;
    draw.label("Vertical", x, y_pair, 12.0, MUTED);
    draw.label("Disabled", x + 252.0, y_pair, 12.0, MUTED);
    let y_pv = y_pair + 18.0;
    let pair_w = 220.0;
    let pair_h = 168.0;
    if let Some(v) = resizable(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_pv,
        pair_w,
        pair_h,
        seed.value,
        "Top",
        "Bottom",
        ResizableAxis::Vertical,
        ResizableSize::Md,
        false,
    ) {
        if ptr.pressed {
            seed.clicks += 1;
        }
        seed.value = v;
    }
    let _ = resizable(
        draw,
        ptr,
        motion,
        dt,
        x + 252.0,
        y_pv,
        pair_w,
        pair_h,
        seed.value,
        "Locked",
        "Off",
        ResizableAxis::Horizontal,
        ResizableSize::Md,
        true,
    );

    let mut y = y_pv + pair_h + 24.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 20.0;
    for (name, size, h) in [
        ("Sm", ResizableSize::Sm, 64.0),
        ("Md", ResizableSize::Md, 80.0),
        ("Lg", ResizableSize::Lg, 96.0),
    ] {
        let s = size.metrics();
        draw.label(name, x, y + (h - s.font) * 0.5, s.font, MUTED);
        let lw = name.chars().count() as f32 * s.font * MONO_ADVANCE;
        if let Some(v) = resizable(
            draw,
            ptr,
            motion,
            dt,
            x + lw + s.gap,
            y,
            live_w - lw - s.gap,
            h,
            seed.value,
            "A",
            "B",
            ResizableAxis::Horizontal,
            size,
            false,
        ) {
            if ptr.pressed {
                seed.clicks += 1;
            }
            seed.value = v;
        }
        y += h + s.gap;
    }
}
