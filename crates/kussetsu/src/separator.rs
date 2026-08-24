//! Hairline BORDER rule. Copy Button: size, disabled + Motion → clicked.
//! Parent handles the returned bool (clicked). Orientation is the variant.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SM, WELL,
};

const HAIR: f32 = 1.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeparatorOrientation {
    Horizontal,
    Vertical,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeparatorSize {
    Sm,
    Md,
    Lg,
}

impl SeparatorSize {
    pub fn metrics(self) -> Size {
        match self {
            SeparatorSize::Sm => SM,
            SeparatorSize::Md => MD,
            SeparatorSize::Lg => LG,
        }
    }

    /// Cross-axis hit size. The paint is 1px; pad from `Size::gap` so the rule is hoverable.
    pub fn cross(self) -> f32 {
        self.metrics().gap * 2.0 + HAIR
    }
}

pub fn separator(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    len: f32,
    orientation: SeparatorOrientation,
    size: SeparatorSize,
    disabled: bool,
    label: &str,
) -> bool {
    let s = size.metrics();
    let labeled = !label.is_empty();
    let font = s.font;
    let text_w = if labeled {
        label.chars().count() as f32 * font * MONO_ADVANCE
    } else {
        0.0
    };
    let (hw, hh) = match orientation {
        SeparatorOrientation::Horizontal => {
            let h = if labeled { s.height } else { size.cross() };
            (len.max(1.0), h)
        }
        SeparatorOrientation::Vertical => {
            let w = if labeled {
                size.cross().max(text_w + s.pad_x * 2.0)
            } else {
                size.cross()
            };
            (w, len.max(1.0))
        }
    };
    let hot = !disabled && ptr.hit(x, y, hw, hh);
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
    let rest = BORDER;
    let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
    let stroke = if disabled {
        MUTED
    } else {
        mix_phase(rest, JADE, press, u)
    };
    let ink = if disabled {
        MUTED
    } else {
        mix_phase(MUTED, FG, FG, u.min(1.0))
    };
    let gap = s.gap;
    match orientation {
        SeparatorOrientation::Horizontal => {
            let ly = y + (hh - HAIR) * 0.5;
            if labeled {
                let tx = x + (hw - text_w) * 0.5;
                let left = (tx - gap - x).max(0.0);
                let right_x = tx + text_w + gap;
                let right = (x + hw - right_x).max(0.0);
                hair(draw, x, ly, left, HAIR, stroke, scale);
                hair(draw, right_x, ly, right, HAIR, stroke, scale);
                draw.label_in(label, tx, y, text_w, hh, font, ink, scale);
            } else {
                hair(draw, x, ly, hw, HAIR, stroke, scale);
            }
        }
        SeparatorOrientation::Vertical => {
            let lx = x + (hw - HAIR) * 0.5;
            if labeled {
                let th = font;
                let ty = y + (hh - th) * 0.5;
                let top = (ty - gap - y).max(0.0);
                let bot_y = ty + th + gap;
                let bot = (y + hh - bot_y).max(0.0);
                hair(draw, lx, y, HAIR, top, stroke, scale);
                hair(draw, lx, bot_y, HAIR, bot, stroke, scale);
                draw.label_in(label, x, ty, hw, th, font, ink, scale);
            } else {
                hair(draw, lx, y, HAIR, hh, stroke, scale);
            }
        }
    }
    !disabled && hot && ptr.pressed
}

fn hair(draw: &mut DrawList, x: f32, y: f32, w: f32, h: f32, fill: [f32; 4], scale: f32) {
    if w < 0.5 || h < 0.5 {
        return;
    }
    draw.outline(x, y, w, h, fill, CLEAR, 0.0, 0.0, scale);
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
    let ox = 36.0 + x0;
    let size_name = match seed.choice {
        0 => "sm",
        1 => "md",
        _ => "lg",
    };
    draw.label(
        format!(
            "clicked {} · size {} · tab {} · {}",
            seed.clicks,
            size_name,
            seed.tab,
            if seed.on[0] { "and" } else { "or" }
        ),
        ox,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let mut y = 72.0 + y0;
    draw.label("Horizontal", ox, y, 12.0, MUTED);
    y += 20.0;
    for (i, (sz, len, tag)) in [
        (SeparatorSize::Sm, 160.0, "sm"),
        (SeparatorSize::Md, 240.0, "md"),
        (SeparatorSize::Lg, 320.0, "lg"),
    ]
    .into_iter()
    .enumerate()
    {
        if separator(
            draw,
            ptr,
            motion,
            dt,
            ox,
            y,
            len,
            SeparatorOrientation::Horizontal,
            sz,
            false,
            "",
        ) {
            seed.clicks += 1;
            seed.choice = i as u32;
        }
        draw.label(
            tag,
            ox + len + 12.0,
            y + (sz.cross() - 12.0) * 0.5,
            12.0,
            MUTED,
        );
        y += sz.cross() + 12.0;
    }
    let _ = separator(
        draw,
        ptr,
        motion,
        dt,
        ox,
        y,
        240.0,
        SeparatorOrientation::Horizontal,
        SeparatorSize::Md,
        true,
        "",
    );
    draw.label(
        "disabled",
        ox + 252.0,
        y + (SeparatorSize::Md.cross() - 12.0) * 0.5,
        12.0,
        MUTED,
    );
    y += SeparatorSize::Md.cross() + 24.0;

    draw.label("Labeled", ox, y, 12.0, MUTED);
    y += 20.0;
    if separator(
        draw,
        ptr,
        motion,
        dt,
        ox,
        y,
        320.0,
        SeparatorOrientation::Horizontal,
        SeparatorSize::Md,
        false,
        if seed.on[0] { "and" } else { "or" },
    ) {
        seed.clicks += 1;
        seed.on[0] = !seed.on[0];
    }
    y += MD.height + 24.0;

    draw.label("Vertical", ox, y, 12.0, MUTED);
    y += 20.0;
    let vh = 96.0;
    let mut vx = ox;
    for (i, sz) in [SeparatorSize::Sm, SeparatorSize::Md, SeparatorSize::Lg]
        .into_iter()
        .enumerate()
    {
        if separator(
            draw,
            ptr,
            motion,
            dt,
            vx,
            y,
            vh,
            SeparatorOrientation::Vertical,
            sz,
            false,
            "",
        ) {
            seed.clicks += 1;
            seed.choice = i as u32;
        }
        vx += sz.cross() + 36.0;
    }
    let _ = separator(
        draw,
        ptr,
        motion,
        dt,
        vx,
        y,
        vh,
        SeparatorOrientation::Vertical,
        SeparatorSize::Md,
        true,
        "",
    );
    draw.label(
        "disabled",
        vx + SeparatorSize::Md.cross() + 10.0,
        y + 40.0,
        12.0,
        MUTED,
    );
    y += vh + 28.0;

    draw.label("Split", ox, y, 12.0, MUTED);
    y += 18.0;
    let items = ["Inbox", "Drafts", "Sent"];
    let row_h = MD.height;
    let well_w = 340.0;
    draw.outline(ox, y, well_w, row_h, WELL, BORDER, MD.radius, 1.0, 1.0);
    let mut x = ox + MD.pad_x;
    for (i, name) in items.iter().enumerate() {
        let tw = name.chars().count() as f32 * MD.font * MONO_ADVANCE;
        let on = seed.tab == i as u32;
        let hot = ptr.hit(x, y, tw, row_h);
        if on {
            draw.outline(
                x - 6.0,
                y + 4.0,
                tw + 12.0,
                row_h - 8.0,
                JADE,
                CLEAR,
                8.0,
                0.0,
                1.0,
            );
        }
        draw.label_in(
            *name,
            x,
            y,
            tw,
            row_h,
            MD.font,
            if on { INK } else { FG },
            1.0,
        );
        if hot && ptr.pressed {
            seed.tab = i as u32;
            seed.clicks += 1;
        }
        x += tw + MD.gap;
        if i + 1 < items.len() {
            if separator(
                draw,
                ptr,
                motion,
                dt,
                x,
                y + 6.0,
                row_h - 12.0,
                SeparatorOrientation::Vertical,
                SeparatorSize::Sm,
                false,
                "",
            ) {
                seed.clicks += 1;
                seed.tab = (i as u32 + 1) % 3;
            }
            x += SeparatorSize::Sm.cross() + MD.gap;
        }
    }
}
