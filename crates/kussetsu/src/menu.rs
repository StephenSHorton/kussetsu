//! Overlay list. Copy Dialog. Click an item to return. Parent owns `open`.
//! Don't call `menu` when closed (keep calling while `leaving` so the swoop can finish).
//! Arrows / Enter move and pick. A `sub_of` item opens `sub_items` to the right.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};
use crate::ui::EditKeys;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuSize {
    Sm,
    Md,
    Lg,
}

impl MenuSize {
    pub fn metrics(self) -> Size {
        match self {
            MenuSize::Sm => SM,
            MenuSize::Md => MD,
            MenuSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct MenuEvent {
    pub close: bool,
    pub gone: bool,
    /// 0-based index into `items`. Separators never appear here.
    pub item: Option<u32>,
    pub highlight: Option<u32>,
    pub sub_open: Option<bool>,
    pub sub_item: Option<u32>,
    pub sub_highlight: Option<u32>,
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: MenuEvent,
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

/// Scrim + panel. `x,y` is the panel's rest origin. `vw,vh` is the scrim far corner from (0,0).
pub fn menu(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    vw: f32,
    vh: f32,
    x: f32,
    y: f32,
    items: &[&str],
    selected: u32,
    disabled_item: Option<u32>,
    size: MenuSize,
    fresh: &mut bool,
    leaving: bool,
    keys: &EditKeys,
    sub_items: &[&str],
    sub_of: Option<u32>,
    sub_open: bool,
    sub_sel: u32,
) -> MenuEvent {
    let (pw, ph) = panel_size(items, size);
    if *fresh {
        motion.snap_slot(x, y, 7, 0.0);
        *fresh = false;
    }
    let t = motion
        .spring_enter(x, y, if leaving { 0.0 } else { 1.0 }, dt)
        .clamp(0.0, 1.0);
    let e = t * t * (3.0 - 2.0 * t);
    let scale = 0.90 + 0.10 * e;
    let dy = (1.0 - e) * 36.0;
    let taper = 1.0 - e;
    let skew = (1.0 - e) * 22.0;
    let blur = (1.0 - e) * 14.0;
    let fade = if leaving {
        t.clamp(0.0, 1.0)
    } else {
        (t / 0.5).clamp(0.0, 1.0)
    };
    let mut scrim = SCRIM;
    scrim[3] *= fade;
    let prev_layer = draw.layer;
    draw.layer = DrawList::OVERLAY;
    draw.quad(0.0, 0.0, vw, vh, scrim, 0.0, 1.0);
    crate::glass::chrome(draw, x, y + dy, pw, ph, 12.0);
    draw.card(
        x,
        y + dy,
        pw,
        ph,
        CLEAR,
        BORDER,
        12.0,
        1.0,
        scale,
        fade,
        taper,
        blur,
        skew,
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
    let picked = rows(
        draw,
        ptr_live,
        motion,
        dt,
        x,
        y,
        items,
        selected,
        disabled_item,
        size,
        false,
        fade,
        scale,
        dy,
        live,
        sub_of,
    );
    let mut ev = MenuEvent {
        close: false,
        gone: leaving && t < 0.03,
        item: None,
        highlight: picked.highlight,
        sub_open: None,
        sub_item: None,
        sub_highlight: None,
    };

    let mut sub_hit = false;
    let mut sub_open_now = sub_open;
    if live {
        if let Some(h) = picked.highlight {
            if sub_of == Some(h) {
                sub_open_now = true;
                ev.sub_open = Some(true);
            }
        }
        if keys.right && sub_of == Some(selected) {
            sub_open_now = true;
            ev.sub_open = Some(true);
        }
        if keys.left && sub_open {
            sub_open_now = false;
            ev.sub_open = Some(false);
        }
        if !sub_open_now {
            if keys.up {
                ev.highlight = Some(step_item(items, disabled_item, selected, -1));
            }
            if keys.down {
                ev.highlight = Some(step_item(items, disabled_item, selected, 1));
            }
        }
    }

    if live && sub_open_now && sub_of.is_some() && !sub_items.is_empty() {
        let parent = sub_of.unwrap();
        let (sw, sh) = panel_size(sub_items, size);
        let sx = x + pw - 8.0;
        let sy = y + row_top(items, size, parent);
        let prev = draw.layer;
        draw.layer = prev.saturating_add(1);
        draw.card(
            sx,
            sy + dy,
            sw,
            sh,
            WELL,
            BORDER,
            12.0,
            1.0,
            scale,
            fade,
            taper * 0.4,
            blur * 0.4,
            skew * 0.3,
        );
        let sub_rows = rows(
            draw,
            ptr_live,
            motion,
            dt,
            sx,
            sy,
            sub_items,
            sub_sel,
            None,
            size,
            false,
            fade,
            scale,
            dy,
            live,
            None,
        );
        draw.layer = prev;
        sub_hit = ptr.hit(sx, sy + dy, sw, sh);
        ev.sub_highlight = sub_rows.highlight;
        if let Some(i) = sub_rows.picked {
            ev.sub_item = Some(i);
        }
        if live {
            if keys.up && sub_open {
                ev.sub_highlight = Some(step_item(sub_items, None, sub_sel, -1));
                ev.highlight = None;
            }
            if keys.down && sub_open {
                ev.sub_highlight = Some(step_item(sub_items, None, sub_sel, 1));
                ev.highlight = None;
            }
            if keys.enter && sub_open {
                let i = sub_sel.min(sub_items.len().saturating_sub(1) as u32);
                if !is_sep(sub_items[i as usize]) {
                    ev.sub_item = Some(i);
                }
            }
        }
    }

    if live && keys.enter && !sub_open_now {
        if sub_of == Some(selected) {
            ev.sub_open = Some(true);
        } else if enabled_item(items, disabled_item, selected) {
            ev.item = Some(selected);
        }
    }

    if live {
        if let Some(i) = picked.picked {
            if sub_of == Some(i) {
                ev.sub_open = Some(true);
            } else {
                ev.item = Some(i);
            }
        }
        if sub_open_now {
            if let Some(h) = ev.highlight {
                if sub_of != Some(h) && !sub_hit && picked.highlight != sub_of {
                    ev.sub_open = Some(false);
                }
            }
        }
    }

    let scrim_hit = ptr_live.released && !ptr.hit(x, y, pw, ph) && !sub_hit;
    ev.close = !leaving && (ev.item.is_some() || ev.sub_item.is_some() || scrim_hit);
    draw.layer = prev_layer;
    ev
}

/// Panel + items, no scrim. Used for the disabled surface in the story.
pub fn surface(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    items: &[&str],
    selected: u32,
    disabled_item: Option<u32>,
    size: MenuSize,
    disabled: bool,
) -> Option<u32> {
    let (pw, ph) = panel_size(items, size);
    crate::glass::chrome(draw, x, y, pw, ph, 12.0);
    draw.card(
        x, y, pw, ph, CLEAR, BORDER, 12.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0,
    );
    rows(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        items,
        selected,
        disabled_item,
        size,
        disabled,
        1.0,
        1.0,
        0.0,
        true,
        Some(1),
    )
    .picked
}

fn is_sep(label: &str) -> bool {
    label == "-"
}

fn label_w(font: f32, label: &str) -> f32 {
    label.chars().count() as f32 * font * MONO_ADVANCE
}

fn panel_size(items: &[&str], size: MenuSize) -> (f32, f32) {
    let s = size.metrics();
    let mut max_tw = 0.0f32;
    let mut h = INSET;
    for label in items {
        if is_sep(label) {
            h += SEP_H;
        } else {
            max_tw = max_tw.max(label_w(s.font, label));
            h += s.height;
        }
    }
    h += INSET;
    let w = (s.pad_x * 2.0 + RAIL + s.gap + max_tw).max(160.0);
    (w, h.max(s.height + INSET * 2.0))
}

fn row_top(items: &[&str], size: MenuSize, index: u32) -> f32 {
    let s = size.metrics();
    let mut iy = INSET;
    for (i, label) in items.iter().copied().enumerate() {
        if i as u32 == index {
            return iy;
        }
        iy += if is_sep(label) { SEP_H } else { s.height };
    }
    iy
}

fn enabled_item(items: &[&str], disabled_item: Option<u32>, i: u32) -> bool {
    let Some(label) = items.get(i as usize) else {
        return false;
    };
    !is_sep(label) && disabled_item != Some(i)
}

pub fn step_item(items: &[&str], disabled_item: Option<u32>, from: u32, dir: i32) -> u32 {
    let n = items.len() as i32;
    if n <= 0 {
        return 0;
    }
    let dir = if dir < 0 { -1 } else { 1 };
    let mut i = from as i32;
    for _ in 0..n {
        i = (i + dir).rem_euclid(n);
        let u = i as u32;
        if enabled_item(items, disabled_item, u) {
            return u;
        }
    }
    from
}

const INSET: f32 = 6.0;
const SEP_H: f32 = 8.0;
const RAIL: f32 = 3.0;

struct RowsEv {
    picked: Option<u32>,
    highlight: Option<u32>,
}

fn rows(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    px: f32,
    py: f32,
    items: &[&str],
    selected: u32,
    disabled_item: Option<u32>,
    size: MenuSize,
    disabled: bool,
    fade: f32,
    enter: f32,
    dy: f32,
    live: bool,
    sub_of: Option<u32>,
) -> RowsEv {
    let s = size.metrics();
    let (pw, ph) = panel_size(items, size);
    let cx = px + pw * 0.5;
    let cy = py + ph * 0.5;
    let cy_d = cy + dy;
    let mut iy = py + INSET;
    let mut picked = None;
    let mut highlight = None;
    for (i, label) in items.iter().copied().enumerate() {
        if is_sep(label) {
            let (x, y, w, h) = xform(
                px + s.pad_x,
                iy + SEP_H * 0.5 - 0.5,
                pw - s.pad_x * 2.0,
                1.0,
                cx,
                cy,
                cy_d,
                enter,
            );
            let mut line = BORDER;
            line[3] *= fade;
            draw.quad(x, y, w, h, line, 0.0, 1.0);
            iy += SEP_H;
            continue;
        }
        let rest_x = px + INSET;
        let rest_y = iy;
        let rest_w = pw - INSET * 2.0;
        let rest_h = s.height;
        let (x, y, w, h) = xform(rest_x, rest_y, rest_w, rest_h, cx, cy, cy_d, enter);
        let item_off = disabled || disabled_item == Some(i as u32);
        let hot = live && !item_off && ptr.hit(x, y, w, h);
        let active = hot && ptr.down;
        let (scale, u) = if item_off {
            (1.0, 0.0)
        } else if active {
            motion.snap_slot(rest_x, rest_y, 0, HOVER_SCALE);
            motion.snap_slot(rest_x, rest_y, 1, 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(rest_x, rest_y, 0, if hot { HOVER_SCALE } else { 1.0 }, dt),
                motion.spring_slot(rest_x, rest_y, 1, if hot { 1.0 } else { 0.0 }, dt),
            )
        };
        let on = selected == i as u32;
        let fill = if item_off {
            CLEAR
        } else if on {
            mix_phase(
                JADE_DIM,
                lerp(JADE_DIM, JADE, 0.18),
                lerp(JADE_DIM, JADE, 0.32),
                u,
            )
        } else {
            mix_phase(CLEAR, JADE_DIM, lerp(JADE_DIM, JADE, 0.18), u)
        };
        let mut fill = fill;
        fill[3] *= fade;
        if fill[3] > 0.02 {
            draw.outline(x, y, w, h, fill, CLEAR, s.radius, 0.0, scale);
        }
        if on && !item_off {
            let (rx, ry, rw, rh) = xform(
                rest_x + 5.0,
                rest_y + 6.0,
                RAIL,
                rest_h - 12.0,
                cx,
                cy,
                cy_d,
                enter,
            );
            let mut rail = JADE;
            rail[3] *= fade;
            draw.quad(rx, ry, rw, rh.max(2.0), rail, 1.0, scale);
        }
        let mut ink = if item_off {
            MUTED
        } else if on && u > 1.2 {
            INK
        } else {
            FG
        };
        ink[3] *= fade;
        draw.label_in(label, x, y, w, h, s.font * enter, ink, scale);
        if sub_of == Some(i as u32) && !item_off {
            let mut chev = if on { JADE } else { MUTED };
            chev[3] *= fade;
            draw.label_in("▸", x + w - 22.0, y, 18.0, h, s.font * enter, chev, scale);
        }
        if hot {
            highlight = Some(i as u32);
        }
        if live && !item_off && hot && ptr.pressed {
            picked = Some(i as u32);
        }
        iy += s.height;
    }
    RowsEv { picked, highlight }
}

fn xform(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    cx: f32,
    cy: f32,
    cy_d: f32,
    scale: f32,
) -> (f32, f32, f32, f32) {
    (
        cx + (x - cx) * scale,
        cy_d + (y - cy) * scale,
        w * scale,
        h * scale,
    )
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn size_of(tab: u32) -> MenuSize {
    match tab % 3 {
        1 => MenuSize::Md,
        2 => MenuSize::Lg,
        _ => MenuSize::Sm,
    }
}

fn button_size(tab: u32) -> ButtonSize {
    match tab % 3 {
        1 => ButtonSize::Md,
        2 => ButtonSize::Lg,
        _ => ButtonSize::Sm,
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
    vw: f32,
    vh: f32,
) {
    const ITEMS: [&str; 6] = ["New", "Open", "Save", "-", "Locked", "Quit"];
    const OPEN_SUB: [&str; 3] = ["File", "Folder", "Recent"];
    const LOCKED: Option<u32> = Some(4);
    const SUB_OF: Option<u32> = Some(1);
    let size = size_of(seed.tab);
    let bsz = button_size(seed.tab);
    let picked = ITEMS
        .get(seed.choice as usize)
        .copied()
        .filter(|s| !is_sep(s))
        .unwrap_or("-");
    let sub_open = seed.on[3];
    let sub_name = OPEN_SUB.get(seed.sel).copied().unwrap_or("File");
    draw.label(
        "Arrows + Enter. Open has a submenu. Locked swallows.",
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );
    draw.label(
        format!(
            "picked {picked} · sub {sub_name} · clicks {} · {}",
            seed.clicks,
            if seed.dialog { "open" } else { "closed" }
        ),
        36.0 + x0,
        56.0 + y0,
        13.0,
        MUTED,
    );

    let y_sz = 84.0 + y0;
    let mut x = 36.0 + x0;
    let blocking = seed.dialog;
    for (i, name) in ["Sm", "Md", "Lg"].iter().enumerate() {
        let tab = i as u32;
        let kind = if seed.tab % 3 == tab {
            ButtonKind::Primary
        } else {
            ButtonKind::Outline
        };
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y_sz,
            name,
            kind,
            ButtonSize::Sm,
            blocking,
        ) {
            seed.tab = tab;
            seed.clicks += 1;
        }
        x += 56.0;
    }

    let ax = 36.0 + x0;
    let ay = 128.0 + y0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        ax,
        ay,
        "Open menu",
        ButtonKind::Primary,
        bsz,
        blocking,
    ) {
        seed.open_dialog();
        seed.on[3] = false;
    }
    let s = bsz.metrics();
    let open_w = s.pad_x * 2.0 + label_w(s.font, "Open menu");
    let _ = button(
        draw,
        ptr,
        motion,
        dt,
        ax + open_w + 12.0,
        ay,
        "Disabled",
        ButtonKind::Primary,
        bsz,
        true,
    );

    let panel_y = ay + s.height + 12.0;
    let _ = surface(
        draw,
        ptr,
        motion,
        dt,
        ax + 280.0,
        panel_y,
        &ITEMS,
        seed.choice,
        LOCKED,
        size,
        true,
    );
    draw.label("Disabled", ax + 280.0, panel_y - 18.0, 12.0, MUTED);

    if seed.dialog {
        let ev = menu(
            draw,
            ptr,
            motion,
            dt,
            vw,
            vh,
            ax,
            panel_y,
            &ITEMS,
            seed.choice,
            LOCKED,
            size,
            &mut seed.dialog_fresh,
            seed.dialog_leaving,
            &seed.edit,
            &OPEN_SUB,
            SUB_OF,
            sub_open,
            seed.sel as u32,
        );
        if let Some(h) = ev.highlight {
            seed.choice = h;
        }
        if let Some(h) = ev.sub_highlight {
            seed.sel = h as usize;
        }
        if let Some(open) = ev.sub_open {
            seed.on[3] = open;
        }
        if let Some(i) = ev.item {
            seed.choice = i;
            seed.clicks += 1;
            seed.on[3] = false;
        }
        if let Some(i) = ev.sub_item {
            seed.sel = i as usize;
            seed.choice = 1;
            seed.clicks += 1;
            seed.on[3] = false;
        }
        apply_close(
            &mut seed.dialog,
            &mut seed.dialog_hold,
            &mut seed.dialog_leaving,
            ev,
            ptr,
        );
        if !seed.dialog {
            seed.on[3] = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_skips_sep_and_locked() {
        let items = ["New", "Open", "Save", "-", "Locked", "Quit"];
        assert_eq!(step_item(&items, Some(4), 2, 1), 5);
        assert_eq!(step_item(&items, Some(4), 5, 1), 0);
        assert_eq!(step_item(&items, Some(4), 0, -1), 5);
        assert_eq!(step_item(&items, Some(4), 5, -1), 2);
    }
}
