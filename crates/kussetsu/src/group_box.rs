//! Fieldset. BORDER rounded rect + legend on the rim. Copy Button.
//! Parent handles the returned bool (clicked).

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GroupBoxKind {
    Outline,
    Well,
    Jade,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GroupBoxSize {
    Sm,
    Md,
    Lg,
}

impl GroupBoxSize {
    pub fn metrics(self) -> Size {
        match self {
            GroupBoxSize::Sm => SM,
            GroupBoxSize::Md => MD,
            GroupBoxSize::Lg => LG,
        }
    }
}

pub fn group_box(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    title: &str,
    body: &str,
    kind: GroupBoxKind,
    size: GroupBoxSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let font = s.font;
    let cap = font * 0.5;
    let box_y = y + cap;
    let box_h = (h - cap).max(s.height);
    let radius = s.radius;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    // Well is a panel (Ghost analog): color hover only, so inner content stays put.
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == GroupBoxKind::Well {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == GroupBoxKind::Well {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == GroupBoxKind::Well {
            1.0
        } else if hot {
            HOVER_SCALE
        } else {
            1.0
        };
        (
            motion.spring_slot(x, y, 0, scale_to, dt),
            motion.spring_slot(x, y, 1, if hot { 1.0 } else { 0.0 }, dt),
        )
    };
    let (fill, title_c, body_c, border, bw) = if disabled {
        (WELL, MUTED, MUTED, BORDER, 1.0)
    } else {
        match kind {
            GroupBoxKind::Outline => (
                mix_phase(CLEAR, WELL, JADE_DIM, u),
                lerp(FG, JADE, u.min(1.0)),
                MUTED,
                lerp(BORDER, JADE, u.min(1.0)),
                1.0,
            ),
            GroupBoxKind::Well => (
                mix_phase(WELL, WELL, JADE_DIM, u),
                lerp(FG, JADE, u.min(1.0)),
                MUTED,
                lerp(BORDER, JADE, u.min(1.0)),
                1.0,
            ),
            GroupBoxKind::Jade => (
                mix_phase(CLEAR, JADE_DIM, JADE_DIM, u),
                JADE,
                MUTED,
                JADE,
                1.0,
            ),
        }
    };
    draw.outline(x, box_y, w, box_h, fill, border, radius, bw, scale);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, box_y, w, box_h, wash, CLEAR, radius, 0.0, 1.0);
    }
    let cx = x + w * 0.5;
    let cy = box_y + box_h * 0.5;
    let n = title.chars().count() as f32;
    if n > 0.0 {
        let legend_w = n * font * MONO_ADVANCE;
        let cut_w = (legend_w + s.gap * 2.0).min(w - s.pad_x * 2.0).max(8.0);
        let cut_x = x + s.pad_x;
        // Notch covers the top stroke so the legend sits on the page (INK) rim.
        let notch = map_scale(cut_x, box_y - 2.0, cut_w, 5.0, cx, cy, scale);
        draw.quad(notch[0], notch[1], notch[2], notch[3], INK, 0.0, 1.0);
        let lx = cut_x + s.gap;
        draw.label_swoop(title, lx, y, font, title_c, scale, cx, cy, 0.0, 0.0);
    }
    if !body.is_empty() {
        let bx = x + s.pad_x;
        let by = y + font + s.gap + 2.0;
        let bw_inner = (w - s.pad_x * 2.0).max(8.0);
        let bh_inner = (box_y + box_h - by - s.gap).max(font);
        draw.label_swoop(
            body, bx, by, font, body_c, scale, cx, cy, bw_inner, bh_inner,
        );
    }
    !disabled && hot && ptr.pressed
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn map_scale(x: f32, y: f32, w: f32, h: f32, cx: f32, cy: f32, sc: f32) -> [f32; 4] {
    [cx + (x - cx) * sc, cy + (y - cy) * sc, w * sc, h * sc]
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
    draw.label(
        format!(
            "onClick fired {} times · region {}",
            seed.clicks, seed.choice
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    let x = 36.0 + x0;
    let gap = 12.0;
    let bw = 176.0;
    let bh = 100.0;
    let y1 = 68.0 + y0;
    let kinds = [
        (GroupBoxKind::Outline, "Outline", "CLEAR fill"),
        (GroupBoxKind::Well, "Well", "WELL fill"),
        (GroupBoxKind::Jade, "Jade", "JADE stroke"),
    ];
    for (i, (kind, title, body)) in kinds.iter().enumerate() {
        let bx = x + i as f32 * (bw + gap);
        if group_box(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y1,
            bw,
            bh,
            title,
            body,
            *kind,
            GroupBoxSize::Md,
            false,
        ) {
            seed.clicks += 1;
        }
    }
    let y2 = y1 + bh + 18.0;
    let sizes = [
        (GroupBoxSize::Sm, "Small", "SM tokens"),
        (GroupBoxSize::Md, "Medium", "MD tokens"),
        (GroupBoxSize::Lg, "Large", "LG tokens"),
    ];
    for (i, (size, title, body)) in sizes.iter().enumerate() {
        let bx = x + i as f32 * (bw + gap);
        if group_box(
            draw,
            ptr,
            motion,
            dt,
            bx,
            y2,
            bw,
            bh,
            title,
            body,
            GroupBoxKind::Outline,
            *size,
            false,
        ) {
            seed.clicks += 1;
        }
    }
    let y3 = y2 + bh + 18.0;
    let _ = group_box(
        draw,
        ptr,
        motion,
        dt,
        x,
        y3,
        bw,
        124.0,
        "Disabled",
        "swallows clicks",
        GroupBoxKind::Well,
        GroupBoxSize::Md,
        true,
    );
    let rx = x + bw + gap;
    let rw = bw * 2.0 + gap;
    let rh = 124.0;
    let g = group_box(
        draw,
        ptr,
        motion,
        dt,
        rx,
        y3,
        rw,
        rh,
        "Region",
        "",
        GroupBoxKind::Well,
        GroupBoxSize::Md,
        false,
    );
    let names = ["North", "Equator", "South"];
    let inner_x = rx + MD.pad_x;
    let inner_y = y3 + MD.font + MD.gap + 6.0;
    let inner_w = rw - MD.pad_x * 2.0;
    let row_h = 26.0;
    let mut inner = false;
    for (i, name) in names.iter().enumerate() {
        let ry = inner_y + i as f32 * row_h;
        let lw = name.chars().count() as f32 * MD.font * MONO_ADVANCE;
        let hit_w = (26.0 + lw + 8.0).min(inner_w);
        let hot = ptr.hit(inner_x, ry, hit_w, row_h);
        if hot && ptr.pressed {
            seed.choice = i as u32;
            inner = true;
        }
        let on = seed.choice == i as u32;
        if on {
            draw.quad(inner_x, ry, inner_w, row_h - 2.0, JADE_DIM, 8.0, 1.0);
        } else if hot {
            draw.quad(inner_x, ry, inner_w, row_h - 2.0, WELL, 8.0, 1.0);
        }
        draw.quad(
            inner_x + 8.0,
            ry + 7.0,
            10.0,
            10.0,
            if on { JADE } else { BORDER },
            5.0,
            1.0,
        );
        draw.label(
            *name,
            inner_x + 26.0,
            ry + (row_h - 2.0 - MD.font) * 0.5,
            MD.font,
            if on { JADE } else { FG },
        );
    }
    if g && !inner {
        seed.clicks += 1;
    }
}
