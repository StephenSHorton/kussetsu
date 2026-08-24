//! Input-looking field + list on open. Copy Dialog.
//! Parent owns `open` and `selected` (`seed.on[2]`, `seed.choice`).

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

const MAX: usize = 8;
const LIST_PAD: f32 = 4.0;
const LIST_GAP: f32 = 4.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ComboboxKind {
    Well,
    Outline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ComboboxSize {
    Sm,
    Md,
    Lg,
}

impl ComboboxSize {
    pub fn metrics(self) -> Size {
        match self {
            ComboboxSize::Sm => SM,
            ComboboxSize::Md => MD,
            ComboboxSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ComboboxEvent {
    pub opened: bool,
    pub close: bool,
    pub gone: bool,
    pub select: Option<u32>,
}

/// Field is always painted. List mounts while `open` (including the exit swoop).
pub fn combobox(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    items: &[&str],
    query: &str,
    selected: u32,
    open: bool,
    kind: ComboboxKind,
    size: ComboboxSize,
    disabled: bool,
    fresh: &mut bool,
    leaving: bool,
) -> ComboboxEvent {
    let s = size.metrics();
    let n = items.len().min(MAX);
    let selected = if n == 0 {
        0
    } else {
        selected.min((n - 1) as u32)
    };
    let h = s.height;
    let chev = (h * 0.42).max(12.0);
    let w = w.max(s.pad_x * 2.0 + chev + s.gap);
    let inner = (w - s.pad_x * 2.0 - chev).max(8.0);
    let filtered: Vec<usize> = (0..n)
        .filter(|&i| {
            query.is_empty()
                || items[i]
                    .to_ascii_lowercase()
                    .contains(&query.to_ascii_lowercase())
        })
        .collect();
    let label = if open && !query.is_empty() {
        query
    } else if n == 0 {
        "Select"
    } else {
        items[selected as usize]
    };
    let field_hot = !disabled && ptr.hit(x, y, w, h);
    let active = field_hot && ptr.down;
    let u = if disabled {
        0.0
    } else if active {
        motion.snap_slot(x, y, 1, 1.0);
        2.0
    } else {
        motion.spring_slot(x, y, 1, if field_hot { 1.0 } else { 0.0 }, dt)
    };
    let open_amt = if disabled {
        0.0
    } else {
        motion
            .spring_slot(x, y, 6, if open && !leaving { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0)
    };
    let hover = u.min(1.0);
    crate::glass::chrome(draw, x, y, w, h, s.radius);
    let (border, ink) = if disabled {
        (BORDER, MUTED)
    } else {
        let rest_b = lerp(BORDER, JADE, hover);
        (
            lerp(rest_b, JADE, open_amt),
            lerp(FG, JADE, (hover * 0.35).max(open_amt)),
        )
    };
    let _ = kind;
    if hover > 0.02 && !disabled {
        let mut wash = JADE_DIM;
        wash[3] *= hover * 0.22;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    draw.outline(x, y, w, h, CLEAR, border, s.radius, 1.0, 1.0);
    draw.label_swoop(
        label,
        x + s.pad_x,
        y + (h - s.font) * 0.5,
        s.font,
        ink,
        1.0,
        x + w * 0.5,
        y + h * 0.5,
        0.0,
        0.0,
    );
    let caret_x = x + s.pad_x + label.chars().count() as f32 * s.font * MONO_ADVANCE + 3.0;
    if !disabled && open && !leaving && caret_x < x + s.pad_x + inner {
        draw.quad(
            caret_x.min(x + w - chev - s.pad_x),
            y + h * 0.28,
            2.0,
            h * 0.44,
            JADE,
            1.0,
            1.0,
        );
    }
    let cx = x + w - s.pad_x - chev * 0.5;
    let cy = y + h * 0.5;
    paint_chevron(
        draw,
        cx,
        cy,
        s.font,
        open_amt,
        if disabled {
            MUTED
        } else {
            lerp(MUTED, JADE, open_amt.max(hover))
        },
        1.0,
    );

    let mut ev = ComboboxEvent::default();
    let list_y = y + h + LIST_GAP;
    let list_h = LIST_PAD * 2.0 + filtered.len().max(1) as f32 * h;
    let mut list_hot = false;
    let mut live_list = false;
    if open && !disabled && n > 0 {
        if *fresh {
            motion.snap_slot(x, list_y, 7, 0.0);
            *fresh = false;
        }
        let t = motion
            .spring_enter(x, list_y, if leaving { 0.0 } else { 1.0 }, dt)
            .clamp(0.0, 1.0);
        let e = t * t * (3.0 - 2.0 * t);
        let fade = if leaving {
            t.clamp(0.0, 1.0)
        } else {
            (t / 0.5).clamp(0.0, 1.0)
        };
        ev.gone = leaving && t < 0.03;
        live_list = t > 0.96 && !leaving;
        if fade > 0.02 {
            let prev_layer = draw.layer;
            draw.layer = DrawList::OVERLAY;
            let dy = (1.0 - e) * -8.0;
            let pop = 0.96 + 0.04 * e;
            let taper = (1.0 - e) * 0.6;
            let skew = (1.0 - e) * 8.0;
            let blur = (1.0 - e) * 8.0;
            let mut shade = SCRIM;
            shade[3] *= fade * 0.35;
            draw.quad(x, list_y + dy + 3.0, w, list_h, shade, s.radius, pop);
            crate::glass::chrome(draw, x, list_y + dy, w, list_h, s.radius);
            draw.card(
                x,
                list_y + dy,
                w,
                list_h,
                CLEAR,
                BORDER,
                s.radius,
                1.0,
                pop,
                fade,
                taper,
                blur,
                skew,
            );
            let list_ptr = if live_list {
                ptr
            } else {
                Pointer {
                    pressed: false,
                    released: false,
                    down: false,
                    ..ptr
                }
            };
            list_hot = ptr.hit(x, list_y + dy, w, list_h);
            for (row_i, &i) in filtered.iter().enumerate() {
                let base_y = list_y + LIST_PAD + row_i as f32 * h;
                let ry = base_y + dy;
                let row_hot = list_ptr.hit(x + LIST_PAD, ry, (w - LIST_PAD * 2.0).max(1.0), h);
                let row_active = row_hot && list_ptr.down;
                let (row_scale, ru) = if row_active {
                    motion.snap_slot(x, base_y, 0, HOVER_SCALE);
                    motion.snap_slot(x, base_y, 1, 1.0);
                    (PRESS_SCALE, 2.0)
                } else {
                    (
                        motion.spring_slot(
                            x,
                            base_y,
                            0,
                            if row_hot { HOVER_SCALE } else { 1.0 },
                            dt,
                        ),
                        motion.spring_slot(x, base_y, 1, if row_hot { 1.0 } else { 0.0 }, dt),
                    )
                };
                let on = selected == i as u32;
                let rest = if on { JADE_DIM } else { CLEAR };
                let row_fill = mix_phase(rest, lerp(WELL, JADE_DIM, 0.8), WELL, ru);
                let mut row_fill = row_fill;
                row_fill[3] *= fade;
                if row_fill[3] > 0.02 {
                    draw.outline(
                        x + LIST_PAD,
                        ry,
                        (w - LIST_PAD * 2.0).max(1.0),
                        h,
                        row_fill,
                        CLEAR,
                        (s.radius - 2.0).max(4.0),
                        0.0,
                        row_scale,
                    );
                }
                if on {
                    let mut pip = JADE;
                    pip[3] *= fade;
                    draw.quad(
                        x + LIST_PAD + 4.0,
                        ry + h * 0.28,
                        2.0,
                        h * 0.44,
                        pip,
                        1.0,
                        1.0,
                    );
                }
                let mut row_ink = if on {
                    JADE
                } else {
                    lerp(FG, JADE, ru.min(1.0))
                };
                row_ink[3] *= fade;
                draw.label_swoop(
                    items[i],
                    x + s.pad_x,
                    ry + (h - s.font) * 0.5,
                    s.font,
                    row_ink,
                    row_scale,
                    x + w * 0.5,
                    ry + h * 0.5,
                    0.0,
                    0.0,
                );
                if row_hot && list_ptr.pressed {
                    ev.select = Some(i as u32);
                    break;
                }
            }
            draw.layer = prev_layer;
        }
    }

    if ev.select.is_some() {
        ev.close = true;
    } else if !disabled && field_hot && ptr.pressed {
        if open && !leaving {
            ev.close = true;
        } else if !open && !leaving {
            ev.opened = true;
        }
    } else if live_list && ptr.released && !field_hot && !list_hot {
        ev.close = true;
    }
    ev
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: ComboboxEvent,
    ptr: Pointer,
) {
    if ev.opened && !*open && !*leaving {
        *open = true;
        *hold = true;
        *leaving = false;
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

fn paint_chevron(
    draw: &mut DrawList,
    cx: f32,
    cy: f32,
    em: f32,
    t: f32,
    color: [f32; 4],
    scale: f32,
) {
    let t = t.clamp(0.0, 1.0);
    let w = em * 0.28 * scale;
    let h = em * 0.16 * scale;
    let wing_y = cy + mix(-h, h, t);
    let tip_y = cy + mix(h, -h, t);
    let p0x = cx - w;
    let p1x = cx + w;
    let stamp = (em * 0.10 * scale).clamp(1.6, 3.2);
    const N: i32 = 7;
    for i in 0..N {
        let k = (i as f32 + 0.5) / N as f32;
        let ax = p0x + (cx - p0x) * k;
        let ay = wing_y + (tip_y - wing_y) * k;
        let bx = p1x + (cx - p1x) * k;
        let by = wing_y + (tip_y - wing_y) * k;
        draw.quad(
            ax - stamp * 0.5,
            ay - stamp * 0.5,
            stamp,
            stamp,
            color,
            stamp * 0.5,
            1.0,
        );
        draw.quad(
            bx - stamp * 0.5,
            by - stamp * 0.5,
            stamp,
            stamp,
            color,
            stamp * 0.5,
            1.0,
        );
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
    const OPTIONS: [&str; 4] = ["Jade", "Inkstone", "Well", "Muted"];
    seed.choice %= OPTIONS.len() as u32;
    let size = match seed.tab % 3 {
        1 => ComboboxSize::Sm,
        2 => ComboboxSize::Lg,
        _ => ComboboxSize::Md,
    };
    let kind = if seed.on[1] {
        ComboboxKind::Well
    } else {
        ComboboxKind::Outline
    };
    let size_name = match size {
        ComboboxSize::Sm => "sm",
        ComboboxSize::Md => "md",
        ComboboxSize::Lg => "lg",
    };
    let kind_name = match kind {
        ComboboxKind::Well => "well",
        ComboboxKind::Outline => "outline",
    };
    let name = OPTIONS[seed.choice as usize];
    draw.label(
        format!(
            "Parent owns open + index. {name} · {kind_name} {size_name} · {} · {} clicks",
            if seed.on[2] { "open" } else { "closed" },
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let mut x = 36.0 + x0;
    let y = 72.0 + y0;
    for (i, label) in [(0u32, "Md"), (1, "Sm"), (2, "Lg")] {
        let on = seed.tab % 3 == i;
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            if on {
                ButtonKind::Primary
            } else {
                ButtonKind::Ghost
            },
            ButtonSize::Sm,
            false,
        ) {
            seed.tab = i;
            seed.clicks += 1;
        }
        x += 56.0;
    }
    x += 8.0;
    for (well, label) in [(true, "Well"), (false, "Outline")] {
        let on = seed.on[1] == well;
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            label,
            if on {
                ButtonKind::Primary
            } else {
                ButtonKind::Outline
            },
            ButtonSize::Sm,
            false,
        ) {
            seed.on[1] = well;
            seed.clicks += 1;
        }
        x += 92.0;
    }

    let y2 = y + 52.0;
    let live_x = 36.0 + x0;
    draw.label("Tone", live_x, y2, 12.0, MUTED);
    let field_y = y2 + 18.0;
    let field_w = 280.0;
    let mut open = seed.on[2];
    let mut hold = seed.on[0];
    let mut leaving = seed.on[4];
    let mut fresh = seed.on[7];
    if open && !leaving {
        crate::input::apply_keys(&mut seed.note, &seed.typed, seed.backspace);
    }
    let ev = combobox(
        draw,
        ptr,
        motion,
        dt,
        live_x,
        field_y,
        field_w,
        &OPTIONS,
        &seed.note,
        seed.choice,
        open,
        kind,
        size,
        false,
        &mut fresh,
        leaving,
    );
    if ev.opened && !open && !leaving {
        fresh = true;
        seed.note.clear();
        seed.clicks += 1;
    }
    if let Some(i) = ev.select {
        seed.choice = i;
        seed.note.clear();
        seed.clicks += 1;
    }
    apply_close(&mut open, &mut hold, &mut leaving, ev, ptr);
    seed.on[2] = open;
    seed.on[0] = hold;
    seed.on[4] = leaving;
    seed.on[7] = fresh;

    let off_x = live_x + field_w + 24.0;
    draw.label("Disabled", off_x, y2, 12.0, MUTED);
    let mut fresh_off = false;
    let _ = combobox(
        draw,
        ptr,
        motion,
        dt,
        off_x,
        field_y,
        200.0,
        &OPTIONS,
        "",
        0,
        false,
        ComboboxKind::Well,
        ComboboxSize::Md,
        true,
        &mut fresh_off,
        false,
    );
}
