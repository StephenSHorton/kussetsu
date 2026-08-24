//! Hover hint. Parent owns `open`. No modal scrim. Delay via Motion.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED, PRESS_SCALE, SCRIM, SM,
    WELL, lerp,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TooltipSide {
    Top,
    Bottom,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TooltipSize {
    Sm,
    Md,
    Lg,
}

impl TooltipSize {
    pub fn metrics(self) -> crate::tokens::Size {
        match self {
            TooltipSize::Sm => SM,
            TooltipSize::Md => MD,
            TooltipSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TooltipEvent {
    pub hover: bool,
    pub close: bool,
    pub gone: bool,
}

/// Paint the bubble against an anchor rect. Show when `ptr.hit(anchor)` (and the
/// live bubble). Call every frame so dwell / exit can run while closed.
pub fn tooltip(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    ax: f32,
    ay: f32,
    aw: f32,
    ah: f32,
    text: &str,
    side: TooltipSide,
    size: TooltipSize,
    delayed: bool,
    disabled: bool,
    fresh: &mut bool,
    leaving: bool,
) -> TooltipEvent {
    let s = size.metrics();
    let font = s.font;
    let n = text.chars().count().max(1) as f32;
    let bw = s.pad_x * 2.0 + n * font * MONO_ADVANCE;
    let bh = s.height;
    const GAP: f32 = 8.0;
    const CARET: f32 = 7.0;
    let (bx, by, kx, ky, dir_x, dir_y) = match side {
        TooltipSide::Top => (
            ax + (aw - bw) * 0.5,
            ay - GAP - bh,
            ax + aw * 0.5 - CARET * 0.5,
            ay - GAP - CARET * 0.5,
            0.0,
            1.0,
        ),
        TooltipSide::Bottom => (
            ax + (aw - bw) * 0.5,
            ay + ah + GAP,
            ax + aw * 0.5 - CARET * 0.5,
            ay + ah + GAP - CARET * 0.5,
            0.0,
            -1.0,
        ),
        TooltipSide::Left => (
            ax - GAP - bw,
            ay + (ah - bh) * 0.5,
            ax - GAP - CARET * 0.5,
            ay + ah * 0.5 - CARET * 0.5,
            1.0,
            0.0,
        ),
        TooltipSide::Right => (
            ax + aw + GAP,
            ay + (ah - bh) * 0.5,
            ax + aw + GAP - CARET * 0.5,
            ay + ah * 0.5 - CARET * 0.5,
            -1.0,
            0.0,
        ),
    };
    let (hx, hy, hw, hh) = match side {
        TooltipSide::Top => (ax, ay - GAP, aw, ah + GAP),
        TooltipSide::Bottom => (ax, ay, aw, ah + GAP),
        TooltipSide::Left => (ax - GAP, ay, aw + GAP, ah),
        TooltipSide::Right => (ax, ay, aw + GAP, ah),
    };
    let hot_anchor = !disabled && ptr.hit(hx, hy, hw, hh);
    let hot_bubble = !disabled && ptr.hit(bx, by, bw, bh);
    let peek = motion.spring_slot(ax, ay, 6, if hot_anchor { 1.0 } else { 0.0 }, 0.0);
    let hot = hot_anchor || (peek > 0.5 && hot_bubble);
    let dwell = if delayed {
        motion.spring_slot(ax, ay, 6, if hot { 1.0 } else { 0.0 }, dt)
    } else if hot {
        motion.snap_slot(ax, ay, 6, 1.0);
        1.0
    } else {
        motion.snap_slot(ax, ay, 6, 0.0);
        0.0
    };
    let hover_ready = !disabled && dwell > 0.88;
    if *fresh {
        motion.snap_slot(bx, by, 7, 0.0);
        *fresh = false;
    }
    let target = if hover_ready { 1.0 } else { 0.0 };
    let t = motion.spring_enter(bx, by, target, dt).clamp(0.0, 1.0);
    let ev = TooltipEvent {
        hover: hover_ready,
        close: !leaving && !hover_ready && t > 0.05,
        gone: leaving && t < 0.03,
    };
    if t < 0.02 {
        return ev;
    }
    let e = t * t * (3.0 - 2.0 * t);
    let fade = t;
    let live_bubble = t > 0.35 && ptr.hit(bx, by, bw, bh);
    let press = live_bubble && ptr.down;
    let hover_scale = if press {
        motion.snap_slot(bx, by, 0, HOVER_SCALE);
        PRESS_SCALE
    } else {
        motion.spring_slot(bx, by, 0, if live_bubble { HOVER_SCALE } else { 1.0 }, dt)
    };
    let scale = (0.90 + 0.10 * e) * hover_scale;
    let dx = (1.0 - e) * 10.0 * dir_x;
    let dy = (1.0 - e) * 10.0 * dir_y;
    let taper = 1.0 - e;
    let skew = (1.0 - e) * 10.0;
    let blur = (1.0 - e) * 8.0;
    let fill = lerp(CLEAR, lerp(WELL, INK, if press { 0.55 } else { 0.0 }), fade);
    let mut border = BORDER;
    border[3] *= fade;
    let mut shade = SCRIM;
    shade[3] *= fade * 0.35;
    let caret = lerp(CLEAR, JADE, fade);
    let mut ink = FG;
    ink[3] *= fade;
    let prev_layer = draw.layer;
    draw.layer = DrawList::OVERLAY;
    draw.quad(bx + dx, by + dy + 2.0, bw, bh, shade, s.radius, scale);
    draw.quad(kx + dx, ky + dy, CARET, CARET, caret, 2.0, scale);
    draw.card(
        bx + dx,
        by + dy,
        bw,
        bh,
        fill,
        border,
        s.radius,
        1.0,
        scale,
        1.0,
        taper,
        blur,
        skew,
    );
    draw.label_in(text, bx + dx, by + dy, bw, bh, font, ink, scale);
    draw.layer = prev_layer;
    ev
}

/// Hover opens; leave plays the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: TooltipEvent,
    ptr: Pointer,
) {
    if ev.hover {
        *open = true;
        *leaving = false;
        if *hold && !ptr.down {
            *hold = false;
        }
        return;
    }
    if *hold {
        if !ptr.down {
            *hold = false;
        }
        return;
    }
    if ev.close {
        *leaving = true;
    }
    if ev.gone {
        *open = false;
        *leaving = false;
    }
}

fn btn_box(label: &str, size: ButtonSize) -> (f32, f32) {
    let s = size.metrics();
    (
        s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE,
        s.height,
    )
}

fn side_of(choice: u32) -> TooltipSide {
    match choice % 4 {
        1 => TooltipSide::Bottom,
        2 => TooltipSide::Left,
        3 => TooltipSide::Right,
        _ => TooltipSide::Top,
    }
}

fn sync(open: &mut bool, leaving: &mut bool, ev: TooltipEvent, ptr: Pointer) {
    let mut hold = false;
    apply_close(open, &mut hold, leaving, ev, ptr);
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
        "Hover a control. No modal scrim. Delay is a Motion spring.",
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    draw.label(
        format!(
            "open={}  delayed={}  side={}  clicks={}",
            seed.on[0] as u8,
            seed.on[4] as u8,
            match seed.choice % 4 {
                1 => "bottom",
                2 => "left",
                3 => "right",
                _ => "top",
            },
            seed.clicks
        ),
        36.0 + x0,
        58.0 + y0,
        13.0,
        MUTED,
    );

    let y_side = 88.0 + y0;
    let mut x = 36.0 + x0;
    for (i, name) in ["Top", "Bottom", "Left", "Right"].iter().enumerate() {
        let i = i as u32;
        let kind = if seed.choice % 4 == i {
            ButtonKind::Primary
        } else {
            ButtonKind::Outline
        };
        let (w, _) = btn_box(name, ButtonSize::Sm);
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y_side,
            name,
            kind,
            ButtonSize::Sm,
            false,
        ) {
            seed.choice = i;
            seed.clicks += 1;
        }
        x += w + 10.0;
    }

    let side = side_of(seed.choice);
    let y_row = 160.0 + y0;
    let mut x = 36.0 + x0;
    let hover_l = "Hover me";
    let (hw, hh) = btn_box(hover_l, ButtonSize::Md);
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_row,
        hover_l,
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    let mut fresh = seed.on[1];
    let ev = tooltip(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_row,
        hw,
        hh,
        "Inkstone + jade.",
        side,
        TooltipSize::Md,
        false,
        false,
        &mut fresh,
        seed.on[2],
    );
    seed.on[1] = fresh;
    let mut open = seed.on[0];
    let mut leaving = seed.on[2];
    sync(&mut open, &mut leaving, ev, ptr);
    seed.on[0] = open;
    seed.on[2] = leaving;
    x += hw + 16.0;

    let delay_l = "Delayed";
    let (dw, dh) = btn_box(delay_l, ButtonSize::Md);
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_row,
        delay_l,
        ButtonKind::Ghost,
        ButtonSize::Md,
        false,
    ) {
        seed.clicks += 1;
    }
    let mut fresh = seed.on[3];
    let delayed = seed.on[6];
    let ev = tooltip(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_row,
        dw,
        dh,
        "Waits for the spring.",
        TooltipSide::Top,
        TooltipSize::Md,
        delayed,
        false,
        &mut fresh,
        seed.on[5],
    );
    seed.on[3] = fresh;
    let mut open = seed.on[4];
    let mut leaving = seed.on[5];
    sync(&mut open, &mut leaving, ev, ptr);
    seed.on[4] = open;
    seed.on[5] = leaving;
    x += dw + 16.0;

    let off_l = "Disabled";
    let (ow, oh) = btn_box(off_l, ButtonSize::Md);
    let _ = button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_row,
        off_l,
        ButtonKind::Primary,
        ButtonSize::Md,
        true,
    );
    let mut fresh_off = false;
    let _ = tooltip(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_row,
        ow,
        oh,
        "Never shown.",
        TooltipSide::Top,
        TooltipSize::Md,
        false,
        true,
        &mut fresh_off,
        false,
    );

    if crate::switch::switch(
        draw,
        ptr,
        motion,
        dt,
        36.0 + x0,
        252.0 + y0,
        seed.on[6],
        "Delay before show",
        false,
    ) {
        seed.on[6] = !seed.on[6];
    }

    let y_sz = 300.0 + y0;
    let mut x = 36.0 + x0;
    for (i, (label, bsz, tsz, hint)) in [
        ("Sm", ButtonSize::Sm, TooltipSize::Sm, "Small hint"),
        ("Md", ButtonSize::Md, TooltipSize::Md, "Medium hint"),
        ("Lg", ButtonSize::Lg, TooltipSize::Lg, "Large hint"),
    ]
    .into_iter()
    .enumerate()
    {
        let (w, h) = btn_box(label, bsz);
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y_sz,
            label,
            ButtonKind::Ghost,
            bsz,
            false,
        ) {
            seed.clicks += 1;
            seed.tab = i as u32;
        }
        let mut fresh = false;
        let ev = tooltip(
            draw,
            ptr,
            motion,
            dt,
            x,
            y_sz,
            w,
            h,
            hint,
            TooltipSide::Bottom,
            tsz,
            false,
            false,
            &mut fresh,
            false,
        );
        if ev.hover {
            seed.tab = i as u32;
        }
        x += w + 14.0;
    }
}
