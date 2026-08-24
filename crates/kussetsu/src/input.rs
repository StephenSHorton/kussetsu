//! Visual text field. Copy Switch: parent owns `focused`, caret, and selection.
//! WELL + BORDER; jade border when focused. Click places the caret.

use crate::draw::{DrawList, Motion, Pointer};
use crate::ui::EditKeys;
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED, SCRIM, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputSize {
    Sm,
    Md,
    Lg,
}

impl InputSize {
    pub fn metrics(self) -> Size {
        match self {
            InputSize::Sm => SM,
            InputSize::Md => MD,
            InputSize::Lg => LG,
        }
    }
}

/// WELL field + jade focus ring. `focused` is parent-owned. Returns whether it was clicked.
pub fn input(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    value: &str,
    placeholder: &str,
    focused: bool,
    clock: f32,
    size: InputSize,
    disabled: bool,
) -> bool {
    let n = value.chars().count();
    input_ex(
        draw, ptr, motion, dt, x, y, w, value, placeholder, focused, clock, size, disabled, n, n,
    )
}

pub fn input_ex(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    value: &str,
    placeholder: &str,
    focused: bool,
    clock: f32,
    size: InputSize,
    disabled: bool,
    caret: usize,
    sel: usize,
) -> bool {
    let s = size.metrics();
    let w = w.max(s.pad_x * 2.0 + s.font * MONO_ADVANCE);
    let h = s.height;
    let font = s.font;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let t = motion
        .spring_toggle(x, y, if focused { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    // Slot 0 is the focus ring. Color hover on 2 — fields do not scale like buttons.
    let u = if disabled {
        0.0
    } else if active {
        motion.snap_slot(x, y, 2, 1.0);
        2.0
    } else {
        motion.spring_slot(x, y, 2, if hot { 1.0 } else { 0.0 }, dt)
    };
    let hover = u.min(1.0);
    crate::glass::chrome(draw, x, y, w, h, s.radius);
    if hover > 0.02 && !disabled {
        let mut wash = JADE_DIM;
        wash[3] *= hover * 0.22;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    let border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, t.max(hover))
    };
    draw.outline(x, y, w, h, CLEAR, border, s.radius, 1.0, 1.0);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    let ink = if disabled || value.is_empty() { MUTED } else { FG };
    paint_field_text(
        draw,
        motion,
        ptr,
        x,
        y,
        w,
        h,
        s.pad_x,
        0.0,
        value,
        placeholder,
        focused,
        disabled,
        clock,
        font,
        1.0,
        ink,
        x + w * 0.5,
        y + h * 0.5,
        caret,
        sel,
    );
    !disabled && hot && ptr.released
}

pub fn hit_caret(value: &str, font: f32, inner_x: f32, scroll: f32, px: f32) -> usize {
    let n = value.chars().count();
    let adv = font * MONO_ADVANCE;
    if adv < 0.01 {
        return n;
    }
    let rel = ((px - inner_x + scroll) / adv).round();
    rel.clamp(0.0, n as f32) as usize
}

/// Clip + horizontal scroll. Caret stays in view; selection is a jade wash.
pub fn paint_field_text(
    draw: &mut DrawList,
    motion: &mut Motion,
    ptr: Pointer,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    pad_x: f32,
    inset_right: f32,
    value: &str,
    placeholder: &str,
    focused: bool,
    disabled: bool,
    clock: f32,
    font: f32,
    scale: f32,
    ink: [f32; 4],
    ox: f32,
    oy: f32,
    caret: usize,
    sel: usize,
) {
    let inner_x = x + pad_x;
    let right = if inset_right > 0.5 { inset_right } else { pad_x };
    let inner_w = (w - pad_x - right).max(8.0);
    let inner_y = y;
    let empty = value.is_empty();
    let shown = if empty { placeholder } else { value };
    let n = value.chars().count();
    let caret = caret.min(n);
    let sel = sel.min(n);
    let adv = font * MONO_ADVANCE;
    let text_w = n as f32 * adv;
    let caret_w = 2.0;
    let caret_px = caret as f32 * adv;
    let max_s = (text_w + caret_w - inner_w).max(0.0);
    let mut scroll = motion.get_slot(x, y, 8).clamp(0.0, max_s);
    if focused && !disabled {
        if caret_px - scroll > inner_w - 4.0 {
            scroll = (caret_px - inner_w + 4.0).max(0.0);
        }
        if caret_px - scroll < 0.0 {
            scroll = caret_px;
        }
        scroll = scroll.clamp(0.0, max_s);
    }
    if !disabled && ptr.hit(x, y, w, h) && ptr.scroll.abs() > 0.1 && max_s > 0.5 {
        scroll = (scroll + ptr.scroll).clamp(0.0, max_s);
        draw.wheel_taken = true;
    }
    motion.snap_slot(x, y, 8, scroll);
    let sc = scale.max(0.01);
    if caret != sel && !empty {
        let a = caret.min(sel) as f32 * adv;
        let b = caret.max(sel) as f32 * adv;
        let mut wash = JADE;
        wash[3] = 0.28;
        let x0 = (inner_x - scroll + a).clamp(inner_x, inner_x + inner_w);
        let x1 = (inner_x - scroll + b).clamp(inner_x, inner_x + inner_w);
        if x1 > x0 + 0.5 {
            let ch = (h - 12.0).max(font);
            draw.quad(x0, y + (h - ch) * 0.5, x1 - x0, ch, wash, 2.0, 1.0);
        }
    }
    if !shown.is_empty() {
        draw.label_clip(
            shown,
            inner_x - scroll,
            y + (h - font) * 0.5,
            font,
            ink,
            sc,
            ox,
            oy,
            [inner_x, inner_y, inner_w, h],
        );
    }
    let caret_on = focused && !disabled && ((clock * 2.0) as u32) % 2 == 0;
    if caret_on {
        let cx0 = (inner_x - scroll + caret_px).clamp(inner_x, inner_x + inner_w - caret_w);
        let ch = (h - 16.0).max(font);
        let cy0 = y + (h - ch) * 0.5;
        let cx = ox + (cx0 - ox) * sc;
        let cy = oy + (cy0 - oy) * sc;
        draw.quad(cx, cy, caret_w * sc, ch * sc, JADE, 1.0, 1.0);
    }
}

fn clen(s: &str) -> usize {
    s.chars().count()
}

fn split_chars(s: &str, i: usize) -> (&str, &str) {
    let i = i.min(clen(s));
    match s.char_indices().nth(i) {
        Some((b, _)) => s.split_at(b),
        None => (s, ""),
    }
}

fn slice_chars(s: &str, a: usize, b: usize) -> String {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let (_, rest) = split_chars(s, lo);
    let (mid, _) = split_chars(rest, hi - lo);
    mid.to_string()
}

/// Returns text to copy when Copy/Cut fired.
pub fn apply_edit(
    buf: &mut String,
    caret: &mut usize,
    sel: &mut usize,
    keys: &EditKeys,
) -> Option<String> {
    let n = clen(buf);
    *caret = (*caret).min(n);
    *sel = (*sel).min(n);
    let mut copied = None;
    if keys.select_all {
        *sel = 0;
        *caret = n;
    }
    let has_sel = *caret != *sel;
    if keys.left {
        if keys.shift {
            *caret = caret.saturating_sub(1);
        } else if has_sel {
            *caret = (*caret).min(*sel);
            *sel = *caret;
        } else {
            *caret = caret.saturating_sub(1);
            *sel = *caret;
        }
    }
    if keys.right {
        let n = clen(buf);
        if keys.shift {
            *caret = (*caret + 1).min(n);
        } else if has_sel {
            *caret = (*caret).max(*sel);
            *sel = *caret;
        } else {
            *caret = (*caret + 1).min(n);
            *sel = *caret;
        }
    }
    if keys.home {
        *caret = 0;
        if !keys.shift {
            *sel = 0;
        }
    }
    if keys.end {
        *caret = clen(buf);
        if !keys.shift {
            *sel = *caret;
        }
    }
    if (keys.copy || keys.cut) && *caret != *sel {
        copied = Some(slice_chars(buf, *caret, *sel));
    }
    if keys.cut && *caret != *sel {
        delete_range(buf, caret, sel);
    }
    if keys.backspace {
        if *caret != *sel {
            delete_range(buf, caret, sel);
        } else if *caret > 0 {
            *sel = *caret - 1;
            delete_range(buf, caret, sel);
        }
    }
    if keys.delete {
        if *caret != *sel {
            delete_range(buf, caret, sel);
        } else if *caret < clen(buf) {
            *sel = *caret + 1;
            delete_range(buf, caret, sel);
        }
    }
    if keys.paste && !keys.clip.is_empty() {
        if *caret != *sel {
            delete_range(buf, caret, sel);
        }
        insert_at(buf, *caret, &keys.clip);
        *caret += clen(&keys.clip);
        *sel = *caret;
    }
    if !keys.typed.is_empty() {
        if *caret != *sel {
            delete_range(buf, caret, sel);
        }
        insert_at(buf, *caret, &keys.typed);
        *caret += clen(&keys.typed);
        *sel = *caret;
    }
    copied
}

fn delete_range(buf: &mut String, caret: &mut usize, sel: &mut usize) {
    let (lo, hi) = if *caret <= *sel {
        (*caret, *sel)
    } else {
        (*sel, *caret)
    };
    let (pre, rest) = split_chars(buf, lo);
    let (_, post) = split_chars(rest, hi - lo);
    *buf = format!("{pre}{post}");
    *caret = lo;
    *sel = lo;
}

fn insert_at(buf: &mut String, at: usize, s: &str) {
    let (pre, post) = split_chars(buf, at);
    *buf = format!("{pre}{s}{post}");
}

pub fn apply_keys(buf: &mut String, typed: &str, backspace: bool) {
    let mut caret = clen(buf);
    let mut sel = caret;
    let keys = EditKeys {
        typed: typed.to_string(),
        backspace,
        ..EditKeys::default()
    };
    let _ = apply_edit(buf, &mut caret, &mut sel, &keys);
}

fn label_col(size: InputSize) -> f32 {
    8.0 * size.metrics().font * MONO_ADVANCE
}

fn tap(seed: &mut crate::ui::SeedState, id: u32) {
    if seed.on[0] && seed.choice == id {
        seed.on[0] = false;
    } else {
        seed.on[0] = true;
        seed.choice = id;
    }
    seed.clicks += 1;
}

fn focused(seed: &crate::ui::SeedState, id: u32) -> bool {
    seed.on[0] && seed.choice == id
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
    let which = if seed.on[0] {
        match seed.choice {
            1 => "handle",
            2 => "sm",
            3 => "md",
            4 => "lg",
            _ => "name",
        }
    } else {
        "idle"
    };
    draw.label(
        format!(
            "Parent owns focus. Click the field · {which} · {} clicks",
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    seed.tab_cycle(&[0, 1, 2, 3, 4]);
    if focused(seed, 0) {
        if let Some(s) = apply_edit(
            &mut seed.field,
            &mut seed.caret,
            &mut seed.sel,
            &seed.edit,
        ) {
            draw.copy_text = Some(s);
        }
    } else if focused(seed, 1) {
        if let Some(s) = apply_edit(
            &mut seed.note,
            &mut seed.caret,
            &mut seed.sel,
            &seed.edit,
        ) {
            draw.copy_text = Some(s);
        }
    }
    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    let clock = seed.clock;
    let lw = label_col(InputSize::Md);
    let field_w = 240.0;

    draw.label(
        "Name",
        x,
        y + (MD.height - MD.font) * 0.5,
        MD.font,
        if focused(seed, 0) { JADE } else { MUTED },
    );
    if input_ex(
        draw,
        ptr,
        motion,
        dt,
        x + lw,
        y,
        field_w,
        &seed.field,
        "Your name",
        focused(seed, 0),
        clock,
        InputSize::Md,
        false,
        seed.caret,
        seed.sel,
    ) {
        tap(seed, 0);
        seed.caret = seed.field.chars().count();
        seed.sel = seed.caret;
    }
    if focused(seed, 0) && ptr.hit(x + lw, y, field_w, MD.height) && (ptr.pressed || ptr.down) {
        let c = hit_caret(
            &seed.field,
            MD.font,
            x + lw + MD.pad_x,
            0.0,
            ptr.x,
        );
        seed.caret = c;
        if ptr.pressed && !seed.edit.shift {
            seed.sel = c;
        }
    }

    y += 52.0;
    draw.label(
        "Handle",
        x,
        y + (MD.height - MD.font) * 0.5,
        MD.font,
        if focused(seed, 1) { JADE } else { MUTED },
    );
    if input_ex(
        draw,
        ptr,
        motion,
        dt,
        x + lw,
        y,
        field_w,
        &seed.note,
        "Handle",
        focused(seed, 1),
        clock,
        InputSize::Md,
        false,
        seed.caret,
        seed.sel,
    ) {
        tap(seed, 1);
        seed.caret = seed.note.chars().count();
        seed.sel = seed.caret;
    }
    if focused(seed, 1) && ptr.hit(x + lw, y, field_w, MD.height) && (ptr.pressed || ptr.down) {
        let c = hit_caret(&seed.note, MD.font, x + lw + MD.pad_x, 0.0, ptr.x);
        seed.caret = c;
        if ptr.pressed && !seed.edit.shift {
            seed.sel = c;
        }
    }

    y += 52.0;
    draw.label("Locked", x, y + (MD.height - MD.font) * 0.5, MD.font, MUTED);
    let _ = input(
        draw,
        ptr,
        motion,
        dt,
        x + lw,
        y,
        field_w,
        "npx kussetsu add",
        "",
        false,
        clock,
        InputSize::Md,
        true,
    );

    y += MD.height + 16.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 22.0;
    let mut fx = x;
    for (i, (name, size, w)) in [
        ("sm", InputSize::Sm, 120.0),
        ("md", InputSize::Md, 168.0),
        ("lg", InputSize::Lg, 216.0),
    ]
    .into_iter()
    .enumerate()
    {
        let id = 2 + i as u32;
        if input(
            draw,
            ptr,
            motion,
            dt,
            fx,
            y,
            w,
            "",
            name,
            focused(seed, id),
            clock,
            size,
            false,
        ) {
            tap(seed, id);
            seed.tab = i as u32;
        }
        fx += w + size.metrics().gap + 8.0;
    }
}
