//! Taller input. Same engine, multiline — wrap later.
//! Parent owns `focused`. WELL + BORDER; jade border when focused. Click toggles. No key events.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED, SCRIM, SM,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextareaSize {
    Sm,
    Md,
    Lg,
}

impl TextareaSize {
    pub fn metrics(self) -> Size {
        match self {
            TextareaSize::Sm => SM,
            TextareaSize::Md => MD,
            TextareaSize::Lg => LG,
        }
    }

    fn rows(self) -> u32 {
        match self {
            TextareaSize::Sm => 3,
            TextareaSize::Md => 4,
            TextareaSize::Lg => 5,
        }
    }
}

fn line_h(s: Size) -> f32 {
    s.font * 1.35
}

fn field_h(size: TextareaSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + size.rows() as f32 * line_h(s)
}

/// WELL field + jade focus ring. `focused` is parent-owned. Returns whether it was clicked.
/// Lines split on `\n` only — wrap later.
pub fn textarea(
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
    size: TextareaSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let w = w.max(s.pad_x * 2.0 + s.font * MONO_ADVANCE);
    let h = field_h(size);
    let font = s.font;
    let pad = s.pad_x;
    let lh = line_h(s);
    let rows = size.rows() as usize;
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let t = motion
        .spring_toggle(x, y, if focused { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
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
    let empty = value.is_empty();
    let shown = if empty { placeholder } else { value };
    let ink = if disabled || empty { MUTED } else { FG };
    let ox = x + w * 0.5;
    let oy = y + h * 0.5;
    let tx = x + pad;
    let mut ly = y + pad;
    let mut last_n = 0usize;
    let mut painted = 0usize;
    if !shown.is_empty() {
        for line in shown.split('\n') {
            if painted >= rows {
                break;
            }
            draw.label_swoop(line, tx, ly, font, ink, 1.0, ox, oy, 0.0, 0.0);
            last_n = line.chars().count();
            ly += lh;
            painted += 1;
        }
    }
    let caret_on = focused && !disabled && ((clock * 2.0) as u32) % 2 == 0;
    if caret_on {
        let caret_line = if empty { 0 } else { painted.saturating_sub(1) };
        let n = if empty { 0.0 } else { last_n as f32 };
        let text_w = n * font * MONO_ADVANCE;
        let cx = (tx + text_w).min(x + w - pad - 2.0);
        let cy = y + pad + caret_line as f32 * lh;
        let ch = (lh - 2.0).max(font);
        draw.quad(cx, cy, 2.0, ch, JADE, 1.0, 1.0);
    }
    !disabled && hot && ptr.released
}

fn label_col(size: TextareaSize) -> f32 {
    8.0 * size.metrics().font * MONO_ADVANCE
}

fn tap(seed: &mut crate::ui::SeedState, id: u32) {
    if seed.on[1] && seed.choice == id {
        seed.on[1] = false;
    } else {
        seed.on[1] = true;
        seed.choice = id;
    }
    seed.clicks += 1;
}

fn focused(seed: &crate::ui::SeedState, id: u32) -> bool {
    seed.on[1] && seed.choice == id
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
    let which = if seed.on[1] {
        match seed.choice {
            1 => "body",
            2 => "sm",
            3 => "md",
            4 => "lg",
            _ => "note",
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

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    let clock = seed.clock;
    seed.tab_cycle(&[0, 1]);
    if focused(seed, 0) {
        crate::input::apply_keys(&mut seed.field, &seed.typed, seed.backspace);
    } else if focused(seed, 1) {
        crate::input::apply_keys(&mut seed.note, &seed.typed, seed.backspace);
    }
    let lw = label_col(TextareaSize::Md);
    let field_w = 240.0;
    let md_h = field_h(TextareaSize::Md);
    let label_y = y + MD.pad_x;

    draw.label(
        "Note",
        x,
        label_y,
        MD.font,
        if focused(seed, 0) { JADE } else { MUTED },
    );
    if textarea(
        draw,
        ptr,
        motion,
        dt,
        x + lw,
        y,
        field_w,
        &seed.field,
        "Write a note",
        focused(seed, 0),
        clock,
        TextareaSize::Md,
        false,
    ) {
        tap(seed, 0);
    }

    y += md_h + 16.0;
    draw.label(
        "Body",
        x,
        y + MD.pad_x,
        MD.font,
        if focused(seed, 1) { JADE } else { MUTED },
    );
    if textarea(
        draw,
        ptr,
        motion,
        dt,
        x + lw,
        y,
        field_w,
        &seed.note,
        "Body",
        focused(seed, 1),
        clock,
        TextareaSize::Md,
        false,
    ) {
        tap(seed, 1);
    }

    y += md_h + 16.0;
    draw.label("Locked", x, y + MD.pad_x, MD.font, MUTED);
    let _ = textarea(
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
        TextareaSize::Md,
        true,
    );

    y += md_h + 16.0;
    draw.label("Sizes", x, y, 14.0, MUTED);
    y += 22.0;
    let mut fx = x;
    for (i, (name, size, w)) in [
        ("sm", TextareaSize::Sm, 120.0),
        ("md", TextareaSize::Md, 168.0),
        ("lg", TextareaSize::Lg, 216.0),
    ]
    .into_iter()
    .enumerate()
    {
        let id = 2 + i as u32;
        if textarea(
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
