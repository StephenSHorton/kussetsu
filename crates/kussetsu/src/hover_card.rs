//! Overlay. Copy Dialog. Open on hover of a trigger; close when the
//! pointer leaves card+trigger. Parent owns `open`.

use crate::button::{button_zoom, ButtonKind, ButtonSize};
use crate::dialog::{self, DialogEvent};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HoverCardKind {
    Well,
    Jade,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HoverCardSize {
    Sm,
    Md,
    Lg,
}

impl HoverCardSize {
    pub fn metrics(self) -> Size {
        match self {
            HoverCardSize::Sm => SM,
            HoverCardSize::Md => MD,
            HoverCardSize::Lg => LG,
        }
    }

    fn button(self) -> ButtonSize {
        match self {
            HoverCardSize::Sm => ButtonSize::Sm,
            HoverCardSize::Md => ButtonSize::Md,
            HoverCardSize::Lg => ButtonSize::Lg,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HoverCardSide {
    Bottom,
    Right,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct HoverCardEvent {
    pub hover: bool,
    pub close: bool,
    pub gone: bool,
    pub clicked: bool,
}

const GAP: f32 = 8.0;
const ACTION: &str = "Follow";

pub fn trigger_size(label: &str, size: HoverCardSize) -> (f32, f32) {
    let s = size.metrics();
    (
        s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE,
        s.height,
    )
}

/// Trigger + floating card. Call every frame. Parent owns `open` / `leaving`
/// via [`apply_close`]. Set `fresh` when opening so the enter swoop starts at 0.
pub fn hover_card(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    trigger: &str,
    title: &str,
    body: &str,
    kind: HoverCardKind,
    size: HoverCardSize,
    side: HoverCardSide,
    disabled: bool,
    open: bool,
    fresh: &mut bool,
    leaving: bool,
) -> HoverCardEvent {
    let s = size.metrics();
    let (tw, th) = trigger_size(trigger, size);
    let g = card_geo(x, y, tw, th, title, body, size, side);
    let hot_trigger = !disabled && ptr.hit(x, y, tw, th);
    let clicked_trigger = hot_trigger && ptr.pressed;

    paint_trigger(
        draw, ptr, motion, dt, x, y, tw, th, trigger, kind, s, disabled,
    );

    let show = !disabled && open;
    if !show {
        return HoverCardEvent {
            hover: hot_trigger,
            close: false,
            gone: true,
            clicked: clicked_trigger,
        };
    }

    if *fresh {
        motion.snap_slot(g.cx, g.cy, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(g.cx, g.cy, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    let hot_card = ptr.hit(g.cx, g.cy, g.cw, g.ch);
    let hot_gap = match side {
        HoverCardSide::Bottom => ptr.hit(g.cx.min(x), y + th, g.cw.max(tw), GAP),
        HoverCardSide::Right => ptr.hit(x + tw, y.min(g.cy), GAP, th.max(g.ch)),
    };
    let hover = hot_trigger || hot_card || hot_gap;
    let ev = HoverCardEvent {
        hover,
        close: !leaving && !hover,
        gone: leaving && t < 0.03,
        clicked: clicked_trigger,
    };
    if t < 0.02 {
        return ev;
    }

    let e = t * t * (3.0 - 2.0 * t);
    let scale_card = 0.90 + 0.10 * e;
    let (dx, dy) = match side {
        HoverCardSide::Bottom => (0.0, (1.0 - e) * 16.0),
        HoverCardSide::Right => ((1.0 - e) * -12.0, 0.0),
    };
    let taper = 1.0 - e;
    let skew = (1.0 - e) * 14.0;
    let blur = (1.0 - e) * 10.0;
    let fade = if leaving {
        t.clamp(0.0, 1.0)
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let (fill, title_c, body_c, border) = card_colors(kind, fade);
    let mut shade = SCRIM;
    shade[3] *= fade * 0.35;
    let px = g.cx + dx;
    let py = g.cy + dy;
    let cx = px + g.cw * 0.5;
    let cy = py + g.ch * 0.5;
    let prev_layer = draw.layer;
    draw.layer = 12;
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    draw.quad(px, py + 3.0, g.cw, g.ch, shade, g.radius, scale_card);
    draw.card(
        px, py, g.cw, g.ch, fill, border, g.radius, 1.0, scale_card, 1.0, taper, blur, skew,
    );

    let mark = initials(title);
    let ad = g.avatar;
    let ax = px + g.pad;
    let ay = py + g.pad;
    let (mark_fill, mark_ink) = if kind == HoverCardKind::Jade {
        (JADE, INK)
    } else {
        (lerp(WELL, BORDER, 0.55), title_c)
    };
    let mut mark_fill = mark_fill;
    let mut mark_ink = mark_ink;
    mark_fill[3] *= fade;
    mark_ink[3] *= fade;
    draw.quad(ax, ay, ad, ad, mark_fill, ad * 0.5, scale_card);
    draw.label_in(&mark, ax, ay, ad, ad, g.body_size, mark_ink, scale_card);

    let tx = ax + ad + g.gap;
    let text_w = (px + g.cw - g.pad - tx).max(24.0);
    draw.label_swoop(
        title,
        tx,
        ay,
        g.title_size,
        title_c,
        scale_card,
        cx,
        cy,
        text_w,
        g.title_size * 1.3,
    );
    draw.label_swoop(
        body,
        tx,
        ay + g.title_size * 1.25,
        g.body_size,
        body_c,
        scale_card,
        cx,
        cy,
        text_w,
        g.body_h + g.body_size,
    );

    let live = t > 0.96 && !leaving;
    let ptr_live = if live {
        ptr
    } else {
        Pointer {
            pressed: false,
            released: false,
            down: false,
            ..ptr
        }
    };
    let bx = cx + (px + g.pad - cx) * scale_card;
    let by = cy + (py + g.ch - g.pad - g.btn_h - cy) * scale_card;
    let follow = button_zoom(
        draw,
        ptr_live,
        motion,
        dt,
        bx,
        by,
        ACTION,
        if kind == HoverCardKind::Jade {
            ButtonKind::Primary
        } else {
            ButtonKind::Outline
        },
        size.button(),
        false,
        scale_card,
    );
    draw.opacity = prev_op;
    draw.layer = prev_layer;

    HoverCardEvent {
        clicked: ev.clicked || follow,
        ..ev
    }
}

/// Hover keeps the card mounted; leave plays the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: HoverCardEvent,
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
    dialog::apply_close(
        open,
        hold,
        leaving,
        DialogEvent {
            close: ev.close,
            gone: ev.gone,
        },
        ptr,
    );
}

fn paint_trigger(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    label: &str,
    kind: HoverCardKind,
    s: Size,
    disabled: bool,
) {
    let hot = !disabled && ptr.hit(x, y, w, h);
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
        (WELL, MUTED, BORDER, 1.0)
    } else {
        match kind {
            HoverCardKind::Well => (
                mix_phase(WELL, lerp(WELL, BORDER, 0.8), BORDER, u),
                FG,
                BORDER,
                1.0,
            ),
            HoverCardKind::Jade => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            HoverCardKind::Outline => (mix_phase(CLEAR, WELL, WELL, u), FG, JADE, 1.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    draw.label_in(label, x, y, w, h, s.font, ink, scale);
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn card_colors(kind: HoverCardKind, fade: f32) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    let mut fill = WELL;
    let mut title = FG;
    let mut body = MUTED;
    let mut border = BORDER;
    match kind {
        HoverCardKind::Well => {}
        HoverCardKind::Jade => {
            title = JADE;
            border = JADE;
        }
        HoverCardKind::Outline => {
            fill = CLEAR;
            border = JADE;
        }
    }
    fill[3] *= fade;
    title[3] *= fade;
    body[3] *= fade;
    border[3] *= fade;
    (fill, title, body, border)
}

fn initials(title: &str) -> String {
    let mut out = String::new();
    for word in title.split_whitespace() {
        if let Some(c) = word.chars().next() {
            out.push(c.to_ascii_uppercase());
            if out.chars().count() == 2 {
                break;
            }
        }
    }
    if out.is_empty() {
        out.push('?');
    }
    out
}

struct CardGeo {
    cx: f32,
    cy: f32,
    cw: f32,
    ch: f32,
    pad: f32,
    gap: f32,
    radius: f32,
    avatar: f32,
    title_size: f32,
    body_size: f32,
    body_h: f32,
    btn_h: f32,
}

fn card_geo(
    x: f32,
    y: f32,
    tw: f32,
    th: f32,
    title: &str,
    body: &str,
    size: HoverCardSize,
    side: HoverCardSide,
) -> CardGeo {
    let s = size.metrics();
    let pad = s.pad_x;
    let gap = s.gap;
    let title_size = s.font;
    let body_size = (s.font - 2.0).max(11.0);
    let avatar = (s.height * 0.78).max(22.0);
    let btn_h = size.button().metrics().height;
    let btn_w = s.pad_x * 2.0 + ACTION.chars().count() as f32 * s.font * MONO_ADVANCE;
    let inner = 220.0_f32.max(tw).min(280.0);
    let text_w = (inner - pad * 2.0 - avatar - gap).max(48.0);
    let tcols = (text_w / (title_size * MONO_ADVANCE)).max(8.0) as usize;
    let bcols = (text_w / (body_size * MONO_ADVANCE)).max(8.0) as usize;
    let title_h = wrap_line_count(title, tcols).max(1) as f32 * title_size * 1.3;
    let body_h = if body.is_empty() {
        0.0
    } else {
        wrap_line_count(body, bcols).max(1) as f32 * body_size * 1.3
    };
    let header_h = avatar.max(
        title_h
            + if body_h > 0.0 {
                gap * 0.5 + body_h
            } else {
                0.0
            },
    );
    let cw = (pad * 2.0 + avatar + gap + text_w)
        .max(pad * 2.0 + btn_w)
        .max(tw);
    let ch = pad + header_h + gap + btn_h + pad;
    let (cx, cy) = match side {
        HoverCardSide::Bottom => (x, y + th + GAP),
        HoverCardSide::Right => (x + tw + GAP, y),
    };
    CardGeo {
        cx,
        cy,
        cw,
        ch,
        pad,
        gap,
        radius: s.radius,
        avatar,
        title_size,
        body_size,
        body_h,
        btn_h,
    }
}

fn wrap_line_count(text: &str, cols: usize) -> usize {
    if text.is_empty() {
        return 1;
    }
    let mut lines = 0;
    for para in text.split('\n') {
        lines += 1;
        let mut col = 0;
        for word in para.split_whitespace() {
            let w = word.chars().count().max(1);
            if col == 0 {
                col = w;
                continue;
            }
            if col + 1 + w <= cols {
                col += 1 + w;
            } else {
                lines += 1 + w.saturating_sub(1) / cols;
                col = w % cols;
            }
        }
    }
    lines.max(1)
}

fn play(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    id: u32,
    x: f32,
    y: f32,
    trigger: &str,
    title: &str,
    body: &str,
    kind: HoverCardKind,
    size: HoverCardSize,
    side: HoverCardSide,
    disabled: bool,
) {
    let (tw, th) = trigger_size(trigger, size);
    let hot = !disabled && ptr.hit(x, y, tw, th);
    if hot {
        if !seed.on[0] || seed.choice != id {
            seed.on[0] = true;
            seed.on[1] = false;
            seed.on[2] = false;
            seed.on[3] = true;
            seed.choice = id;
        } else if seed.on[2] {
            seed.on[2] = false;
        }
    }
    let open = seed.on[0] && seed.choice == id;
    let mut fresh = seed.on[3];
    let ev = hover_card(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        trigger,
        title,
        body,
        kind,
        size,
        side,
        disabled,
        open,
        &mut fresh,
        open && seed.on[2],
    );
    if open {
        seed.on[3] = fresh;
        let mut opened = seed.on[0];
        let mut hold = seed.on[1];
        let mut leaving = seed.on[2];
        apply_close(&mut opened, &mut hold, &mut leaving, ev, ptr);
        seed.on[0] = opened;
        seed.on[1] = hold;
        seed.on[2] = leaving;
    }
    if ev.clicked {
        seed.clicks += 1;
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
    draw.label(
        format!(
            "Hover a trigger. Leave card+trigger to close. open={}  card={}  clicks={}",
            seed.on[0] as u8, seed.choice, seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    play(
        draw,
        ptr,
        motion,
        dt,
        seed,
        0,
        x,
        72.0 + y0,
        "@mira",
        "Mira Sato",
        "Ships the GPU kit. Inkstone + jade.",
        HoverCardKind::Well,
        HoverCardSize::Md,
        HoverCardSide::Bottom,
        false,
    );

    let vx = 36.0 + x0 + 280.0;
    draw.label("Sizes", vx, 72.0 + y0, 13.0, MUTED);
    let mut y = 94.0 + y0;
    for (i, (label, size, title, body)) in [
        ("Sm", HoverCardSize::Sm, "Small", "SM tokens"),
        ("Md", HoverCardSize::Md, "Medium", "MD tokens"),
        ("Lg", HoverCardSize::Lg, "Large", "LG tokens"),
    ]
    .into_iter()
    .enumerate()
    {
        let h = size.metrics().height;
        play(
            draw,
            ptr,
            motion,
            dt,
            seed,
            1 + i as u32,
            vx,
            y,
            label,
            title,
            body,
            HoverCardKind::Well,
            size,
            HoverCardSide::Right,
            false,
        );
        if ptr.hit(vx, y, trigger_size(label, size).0, h) {
            seed.tab = i as u32;
        }
        y += h + 10.0;
    }

    y += 8.0;
    draw.label("Kinds", vx, y, 13.0, MUTED);
    y += 22.0;
    for (i, (label, kind)) in [
        ("Well", HoverCardKind::Well),
        ("Jade", HoverCardKind::Jade),
        ("Outline", HoverCardKind::Outline),
    ]
    .into_iter()
    .enumerate()
    {
        play(
            draw,
            ptr,
            motion,
            dt,
            seed,
            4 + i as u32,
            vx,
            y,
            label,
            label,
            "WELL card, no modal scrim.",
            kind,
            HoverCardSize::Md,
            HoverCardSide::Right,
            false,
        );
        y += MD.height + 10.0;
    }

    play(
        draw,
        ptr,
        motion,
        dt,
        seed,
        7,
        vx,
        y,
        "Disabled",
        "Disabled",
        "Hover is swallowed.",
        HoverCardKind::Well,
        HoverCardSize::Md,
        HoverCardSide::Right,
        true,
    );
}
