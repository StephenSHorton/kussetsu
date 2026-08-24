//! Button + chevron. Opens a mini menu. Copy Button + Dialog.
//! Parent owns `open` (`seed.on[0]`) and the picked index.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DropdownKind {
    Primary,
    Ghost,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DropdownSize {
    Sm,
    Md,
    Lg,
}

impl DropdownSize {
    pub fn metrics(self) -> Size {
        match self {
            DropdownSize::Sm => SM,
            DropdownSize::Md => MD,
            DropdownSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct DropdownEvent {
    pub close: bool,
    pub gone: bool,
    pub opened: bool,
    pub picked: Option<u32>,
}

fn trigger_width(label: &str, size: DropdownSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE + s.gap + s.font
}

pub fn dropdown_button(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    label: &str,
    items: &[&str],
    selected: u32,
    kind: DropdownKind,
    size: DropdownSize,
    open: bool,
    leaving: bool,
    fresh: &mut bool,
    disabled: bool,
) -> DropdownEvent {
    let s = size.metrics();
    let font = s.font;
    let w = trigger_width(label, size);
    let h = s.height;
    let chev_d = font;
    let latched = open && !leaving && !disabled;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == DropdownKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == DropdownKind::Ghost {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == DropdownKind::Ghost {
            1.0
        } else if hot || latched {
            HOVER_SCALE
        } else {
            1.0
        };
        (
            motion.spring_slot(x, y, 0, scale_to, dt),
            motion.spring_slot(x, y, 1, if hot || latched { 1.0 } else { 0.0 }, dt),
        )
    };
    let (fill, ink, border, bw) = if disabled {
        match kind {
            DropdownKind::Ghost => (CLEAR, MUTED, CLEAR, 0.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            DropdownKind::Primary => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            DropdownKind::Ghost => {
                let hover = JADE_DIM;
                let press = [JADE[0], JADE[1], JADE[2], 0.22];
                (mix_phase(CLEAR, hover, press, u), FG, CLEAR, 0.0)
            }
            DropdownKind::Outline => (mix_phase(CLEAR, WELL, JADE_DIM, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    let label_w = (w - s.pad_x * 2.0 - s.gap - chev_d).max(0.0);
    draw.label_in(label, x + s.pad_x, y, label_w, h, font, ink, scale);
    let chev_t = motion
        .spring_slot(x, y, 2, if latched { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    let chev = if disabled {
        MUTED
    } else {
        lerp(ink, JADE, chev_t)
    };
    let chev_x = x + w - s.pad_x - chev_d;
    let chev_y = y + (h - chev_d) * 0.5;
    paint_chevron(draw, chev_x, chev_y, chev_d, chev_t, chev, scale);

    let trigger_click = !disabled && hot && ptr.pressed;
    let opened = trigger_click && !open && !leaving;
    let mut ev = DropdownEvent {
        close: trigger_click && open && !leaving,
        gone: false,
        opened,
        picked: None,
    };
    if disabled || items.is_empty() || !(open || leaving) {
        return ev;
    }

    let (mx, my, mw, mh) = menu_geo(x, y, w, h, items, s);
    if *fresh {
        motion.snap_slot(mx, my, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(mx, my, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    ev.gone = leaving && t < 0.03;
    if t < 0.02 {
        return ev;
    }
    let e = t * t * (3.0 - 2.0 * t);
    let fade = if leaving {
        t
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let mscale = 0.96 + 0.04 * e;
    let drop = (1.0 - e) * -8.0;
    let dy = drop - mh * (1.0 - mscale) * 0.5;
    let taper = 0.0;
    let skew = 0.0;
    let blur = (1.0 - e) * 4.0;
    let prev_layer = draw.layer;
    draw.layer = 12;
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    let mut shade = SCRIM;
    shade[3] *= fade * 0.35;
    draw.quad(mx, my + dy + 2.0, mw, mh, shade, s.radius, mscale);
    let mut fill = WELL;
    fill[3] *= fade;
    let mut stroke_c = BORDER;
    stroke_c[3] *= fade;
    draw.card(
        mx,
        my + dy,
        mw,
        mh,
        fill,
        stroke_c,
        s.radius,
        1.0,
        mscale,
        1.0,
        taper,
        blur,
        skew,
    );

    let live = t > 0.96 && !leaving;
    let mut picked = None;
    const INSET: f32 = 6.0;
    let ih = s.height;
    for (i, item) in items.iter().enumerate() {
        let ix = mx + INSET;
        let iy = my + INSET + i as f32 * ih + dy;
        let iw = (mw - INSET * 2.0).max(8.0);
        let on = selected == i as u32;
        let hot_i = live && ptr.hit(ix, iy - dy, iw, ih);
        let active_i = hot_i && ptr.down;
        let (iscale, u) = if !live {
            (1.0, 0.0)
        } else if active_i {
            motion.snap_slot(ix, iy - dy, 0, HOVER_SCALE);
            motion.snap_slot(ix, iy - dy, 1, 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(ix, iy - dy, 0, if hot_i { HOVER_SCALE } else { 1.0 }, dt),
                motion.spring_slot(ix, iy - dy, 1, if hot_i { 1.0 } else { 0.0 }, dt),
            )
        };
        let row = if on {
            mix_phase(
                JADE_DIM,
                lerp(JADE_DIM, JADE, 0.22),
                lerp(JADE_DIM, JADE, 0.38),
                u,
            )
        } else {
            mix_phase(CLEAR, WELL, JADE_DIM, u)
        };
        let mut row_c = row;
        row_c[3] *= fade;
        if row_c[3] > 0.02 {
            draw.outline(ix, iy, iw, ih, row_c, CLEAR, s.radius * 0.6, 0.0, iscale);
        }
        if on {
            let mut rail = JADE;
            rail[3] *= fade;
            draw.quad(
                ix + 4.0,
                iy + 8.0,
                3.0,
                (ih - 16.0).max(6.0),
                rail,
                1.5,
                iscale,
            );
        }
        let mut ink = if on { JADE } else { FG };
        ink[3] *= fade;
        draw.label_in(*item, ix + 12.0, iy, iw - 16.0, ih, font, ink, iscale);
        if hot_i && ptr.pressed {
            picked = Some(i as u32);
        }
    }

    let menu_hit = ptr.hit(mx, my, mw, mh);
    let outside = live && ptr.released && !hot && !menu_hit;
    ev.picked = picked;
    ev.close = ev.close || picked.is_some() || outside;
    draw.opacity = prev_op;
    draw.layer = prev_layer;
    ev
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: DropdownEvent,
    ptr: Pointer,
) {
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

fn menu_geo(x: f32, y: f32, w: f32, h: f32, items: &[&str], s: Size) -> (f32, f32, f32, f32) {
    const INSET: f32 = 6.0;
    const GAP: f32 = 6.0;
    let mut mw = w;
    for item in items {
        let iw = INSET * 2.0 + s.pad_x * 2.0 + item.chars().count() as f32 * s.font * MONO_ADVANCE;
        if iw > mw {
            mw = iw;
        }
    }
    let mh = INSET * 2.0 + items.len() as f32 * s.height;
    (x, y + h + GAP, mw, mh)
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn mix(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t.clamp(0.0, 1.0)
}

fn paint_chevron(draw: &mut DrawList, x: f32, y: f32, d: f32, t: f32, color: [f32; 4], scale: f32) {
    let ox = x + d * 0.5;
    let oy = y + d * 0.5;
    let inset = d * 0.22;
    let inner = (d - inset * 2.0).max(4.0);
    let thick = (d * (2.0 / 24.0)).clamp(1.75, 3.75);
    let x0 = x + inset;
    let y0 = y + inset;
    let ay = y0 + inner * mix(0.32, 0.68, t);
    let by = y0 + inner * mix(0.72, 0.28, t);
    let ax = x0 + inner * 0.14;
    let cx = x0 + inner * 0.86;
    let bx = x0 + inner * 0.50;
    stroke(draw, ax, ay, bx, by, thick, color, ox, oy, scale);
    stroke(draw, bx, by, cx, ay, thick, color, ox, oy, scale);
}

fn stroke(
    draw: &mut DrawList,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    thick: f32,
    color: [f32; 4],
    ox: f32,
    oy: f32,
    sc: f32,
) {
    let ax = ox + (x0 - ox) * sc;
    let ay = oy + (y0 - oy) * sc;
    let bx = ox + (x1 - ox) * sc;
    let by = oy + (y1 - oy) * sc;
    let t = (thick * sc).max(1.2);
    let dx = bx - ax;
    let dy = by - ay;
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let step = (t * 0.38).max(0.55);
    let n = ((len / step).ceil() as i32).clamp(2, 28);
    for i in 0..=n {
        let u = i as f32 / n as f32;
        let px = ax + dx * u - t * 0.5;
        let py = ay + dy * u - t * 0.5;
        draw.quad(px, py, t, t, color, t * 0.5, 1.0);
    }
}

fn sync(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    fresh: &mut bool,
    ev: DropdownEvent,
    ptr: Pointer,
) {
    if ev.opened {
        *open = true;
        *hold = true;
        *fresh = true;
        *leaving = false;
    }
    apply_close(open, hold, leaving, ev, ptr);
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
    const ITEMS: [&str; 3] = ["Export", "Duplicate", "Archive"];
    seed.choice %= ITEMS.len() as u32;
    let pick = ITEMS[seed.choice as usize];
    let kind = match seed.tab % 3 {
        1 => DropdownKind::Ghost,
        2 => DropdownKind::Outline,
        _ => DropdownKind::Primary,
    };
    let size = if seed.on[5] {
        DropdownSize::Lg
    } else if seed.on[4] {
        DropdownSize::Sm
    } else {
        DropdownSize::Md
    };
    draw.label(
        format!(
            "open={}  {}  {pick}  clicks={}",
            seed.on[0] as u8,
            match kind {
                DropdownKind::Primary => "primary",
                DropdownKind::Ghost => "ghost",
                DropdownKind::Outline => "outline",
            },
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y_kind = 72.0 + y0;
    let mut x = 36.0 + x0;
    for (i, (name, k, bsz)) in [
        ("Primary", ButtonKind::Primary, ButtonSize::Sm),
        ("Ghost", ButtonKind::Ghost, ButtonSize::Sm),
        ("Outline", ButtonKind::Outline, ButtonSize::Sm),
    ]
    .into_iter()
    .enumerate()
    {
        let on = seed.tab % 3 == i as u32;
        let kind_btn = if on { ButtonKind::Primary } else { k };
        let w = SM.pad_x * 2.0 + name.chars().count() as f32 * SM.font * MONO_ADVANCE;
        if button(draw, ptr, motion, dt, x, y_kind, name, kind_btn, bsz, false) {
            seed.tab = i as u32;
            seed.clicks += 1;
        }
        x += w + 10.0;
    }

    let y_sz = 112.0 + y0;
    x = 36.0 + x0;
    for (i, (name, on)) in [
        ("Sm", seed.on[4] && !seed.on[5]),
        ("Md", !seed.on[4] && !seed.on[5]),
        ("Lg", seed.on[5]),
    ]
    .into_iter()
    .enumerate()
    {
        let k = if on {
            ButtonKind::Primary
        } else {
            ButtonKind::Outline
        };
        let w = SM.pad_x * 2.0 + name.chars().count() as f32 * SM.font * MONO_ADVANCE;
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y_sz,
            name,
            k,
            ButtonSize::Sm,
            false,
        ) {
            seed.on[4] = i == 0;
            seed.on[5] = i == 2;
            seed.clicks += 1;
        }
        x += w + 10.0;
    }

    let y = 168.0 + y0;
    x = 36.0 + x0;
    let mut fresh = seed.on[3];
    let ev = dropdown_button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "Actions",
        &ITEMS,
        seed.choice,
        kind,
        size,
        seed.on[0],
        seed.on[2],
        &mut fresh,
        false,
    );
    seed.on[3] = fresh;
    if ev.opened {
        seed.clicks += 1;
    }
    if let Some(i) = ev.picked {
        seed.choice = i;
        seed.clicks += 1;
    }
    let mut open = seed.on[0];
    let mut hold = seed.on[1];
    let mut leaving = seed.on[2];
    let mut fresh = seed.on[3];
    sync(&mut open, &mut hold, &mut leaving, &mut fresh, ev, ptr);
    seed.on[0] = open;
    seed.on[1] = hold;
    seed.on[2] = leaving;
    seed.on[3] = fresh;

    x += trigger_width("Actions", size) + 16.0;
    let mut fresh_off = false;
    let _ = dropdown_button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "Disabled",
        &ITEMS,
        seed.choice,
        kind,
        size,
        false,
        false,
        &mut fresh_off,
        true,
    );
}
