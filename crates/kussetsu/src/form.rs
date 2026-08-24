//! Labeled field stack. Copy Switch: parent owns values + focus.
//! Layout + labels. Fields are DrawList wells; actions use Button / Switch.

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::switch::switch;
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormKind {
    Well,
    Outline,
    Stack,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormSize {
    Sm,
    Md,
    Lg,
}

impl FormSize {
    pub fn metrics(self) -> Size {
        match self {
            FormSize::Sm => SM,
            FormSize::Md => MD,
            FormSize::Lg => LG,
        }
    }

    fn button(self) -> ButtonSize {
        match self {
            FormSize::Sm => ButtonSize::Sm,
            FormSize::Md => ButtonSize::Md,
            FormSize::Lg => ButtonSize::Lg,
        }
    }

    fn box_side(self) -> f32 {
        match self {
            FormSize::Sm => 16.0,
            FormSize::Md => 20.0,
            FormSize::Lg => 24.0,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FormField<'a> {
    pub label: &'a str,
    pub value: &'a str,
    pub placeholder: &'a str,
    pub required: bool,
    pub disabled: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct FormEvent {
    pub submit: bool,
    pub reset: bool,
    pub focus: Option<u32>,
    pub agree: bool,
    pub notify: bool,
    pub caret_at: Option<usize>,
}

const SWITCH_H: f32 = 26.0;

/// Stacked labels + wells + checkbox + switch + Reset/Submit.
/// Parent owns `focused`, `agree`, `notify`. Returns the action this frame.
pub fn form(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    title: &str,
    fields: &[FormField],
    focused: Option<u32>,
    agree: bool,
    agree_label: &str,
    notify: bool,
    notify_label: &str,
    clock: f32,
    kind: FormKind,
    size: FormSize,
    disabled: bool,
    caret: usize,
    sel: usize,
) -> FormEvent {
    let s = size.metrics();
    let pad = s.pad_x;
    let w = w.max(s.pad_x * 2.0 + 8.0 * s.font * MONO_ADVANCE);
    let inner_x = x + pad;
    let inner_w = (w - pad * 2.0).max(8.0);
    let h = form_height(
        fields.len(),
        !agree_label.is_empty(),
        !notify_label.is_empty(),
        size,
    );

    match kind {
        FormKind::Stack => {}
        FormKind::Well => {
            crate::glass::chrome(draw, x, y, w, h, s.radius);
            draw.outline(x, y, w, h, CLEAR, BORDER, s.radius, 1.0, 1.0);
        }
        FormKind::Outline => {
            draw.outline(x, y, w, h, CLEAR, BORDER, s.radius, 1.0, 1.0);
        }
    }
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        let r = if kind == FormKind::Stack {
            0.0
        } else {
            s.radius
        };
        draw.outline(x, y, w, h, wash, CLEAR, r, 0.0, 1.0);
    }

    let mut cy = y + pad;
    if !title.is_empty() {
        draw.label(
            title,
            inner_x,
            cy,
            s.font,
            if disabled { MUTED } else { FG },
        );
    }
    cy += s.font + s.gap;

    let mut ev = FormEvent::default();
    for (i, field) in fields.iter().copied().enumerate() {
        let id = i as u32;
        let on = focused == Some(id) && !field.disabled && !disabled;
        let row_h = s.font + 4.0 + s.height;
        let hit = field_block(
            draw,
            ptr,
            motion,
            dt,
            inner_x,
            cy,
            inner_w,
            field,
            on,
            clock,
            size,
            disabled || field.disabled,
            if on { caret } else { field.value.chars().count() },
            if on { sel } else { field.value.chars().count() },
        );
        if hit.clicked {
            ev.focus = Some(id);
        }
        if on {
            ev.caret_at = hit.caret;
        }
        cy += row_h + s.gap;
    }

    if !agree_label.is_empty() {
        if check_row(
            draw,
            ptr,
            motion,
            dt,
            inner_x,
            cy,
            inner_w,
            agree,
            agree_label,
            size,
            disabled,
            focused == Some(fields.len() as u32),
        ) {
            ev.agree = true;
        }
        cy += s.height.max(size.box_side()) + s.gap;
    }

    if !notify_label.is_empty() {
        let keyed = focused == Some(fields.len() as u32 + 1);
        if keyed && !disabled {
            let mut ring = JADE;
            ring[3] = 0.35;
            draw.outline(
                inner_x - 4.0,
                cy - 4.0,
                inner_w + 8.0,
                SWITCH_H + 8.0,
                CLEAR,
                ring,
                s.radius,
                1.0,
                1.0,
            );
        }
        if switch(
            draw,
            ptr,
            motion,
            dt,
            inner_x,
            cy,
            notify,
            notify_label,
            disabled,
        ) {
            ev.notify = true;
        }
    }

    let btn = size.button();
    let submit_w = btn_w("Submit", btn);
    let reset_w = btn_w("Reset", btn);
    let by = y + h - pad - s.height;
    let submit_x = inner_x + inner_w - submit_w;
    let reset_x = submit_x - s.gap - reset_w;
    if button(
        draw,
        ptr,
        motion,
        dt,
        reset_x,
        by,
        "Reset",
        ButtonKind::Ghost,
        btn,
        disabled,
    ) {
        ev.reset = true;
    }
    if button(
        draw,
        ptr,
        motion,
        dt,
        submit_x,
        by,
        "Submit",
        ButtonKind::Primary,
        btn,
        disabled,
    ) {
        ev.submit = true;
    }
    ev
}

pub fn form_height(n_fields: usize, has_agree: bool, has_notify: bool, size: FormSize) -> f32 {
    let s = size.metrics();
    let pad = s.pad_x;
    let title = s.font + s.gap;
    let field = s.font + 4.0 + s.height + s.gap;
    let mut h = pad + title + field * n_fields as f32;
    if has_agree {
        h += s.height.max(size.box_side()) + s.gap;
    }
    if has_notify {
        h += SWITCH_H + s.gap;
    }
    h + s.height + pad
}

fn btn_w(label: &str, size: ButtonSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE
}

struct FieldHit {
    clicked: bool,
    caret: Option<usize>,
}

fn field_block(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    field: FormField,
    focused: bool,
    clock: f32,
    size: FormSize,
    disabled: bool,
    caret: usize,
    sel: usize,
) -> FieldHit {
    let s = size.metrics();
    let font = s.font;
    let h = s.height;
    let label_c = if disabled {
        MUTED
    } else if focused {
        JADE
    } else {
        FG
    };
    draw.label(field.label, x, y, font, label_c);
    if field.required {
        let lw = field.label.chars().count() as f32 * font * MONO_ADVANCE;
        draw.label(
            "*",
            x + lw + 2.0,
            y,
            font,
            if disabled { MUTED } else { JADE },
        );
    }
    let fy = y + font + 4.0;
    paint_field(
        draw,
        ptr,
        motion,
        dt,
        x,
        fy,
        w,
        h,
        field.value,
        field.placeholder,
        focused,
        clock,
        size,
        disabled,
        caret,
        sel,
    )
}

fn paint_field(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    value: &str,
    placeholder: &str,
    focused: bool,
    clock: f32,
    size: FormSize,
    disabled: bool,
    caret: usize,
    sel: usize,
) -> FieldHit {
    let s = size.metrics();
    let font = s.font;
    let n = value.chars().count();
    let caret = caret.min(n);
    let sel = sel.min(n);
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
    let ink = if disabled || value.is_empty() { MUTED } else { FG };
    crate::input::paint_field_text(
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
    let caret_at = if focused && hot && (ptr.pressed || ptr.down) {
        Some(crate::input::hit_caret(
            value,
            font,
            x + s.pad_x,
            0.0,
            ptr.x,
        ))
    } else {
        None
    };
    FieldHit {
        clicked: !disabled && hot && ptr.released,
        caret: caret_at,
    }
}

fn check_row(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    checked: bool,
    label: &str,
    size: FormSize,
    disabled: bool,
    keyed: bool,
) -> bool {
    let s = size.metrics();
    let box_s = size.box_side();
    let lw = label.chars().count() as f32 * s.font * MONO_ADVANCE;
    let h = s.height.max(box_s);
    let hit_w = (box_s + s.gap + lw).min(w);
    let hot = !disabled && ptr.hit(x, y, hit_w, h);
    let active = hot && ptr.down;
    let t = motion
        .spring_toggle(x, y, if checked { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
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
    let hover = u.min(1.0);
    let fill = if disabled {
        WELL
    } else {
        mix_phase(WELL, JADE_DIM, lerp(JADE_DIM, INK, 0.18), u)
    };
    let border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, t.max(hover))
    };
    let by = y + (h - box_s) * 0.5;
    draw.outline(x, by, box_s, box_s, fill, border, box_s * 0.2, 1.0, scale);
    paint_check(
        draw,
        x,
        by,
        box_s,
        t,
        if disabled { MUTED } else { JADE },
        scale,
    );
    if lw > 0.0 {
        draw.label(
            label,
            x + box_s + s.gap,
            y + (h - s.font) * 0.5,
            s.font,
            if disabled {
                MUTED
            } else if keyed {
                JADE
            } else {
                lerp(FG, JADE, hover)
            },
        );
    }
    !disabled && hot && ptr.released
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn paint_check(draw: &mut DrawList, x: f32, y: f32, s: f32, t: f32, color: [f32; 4], scale: f32) {
    if t <= 0.02 {
        return;
    }
    let cx = x + s * 0.5;
    let cy = y + s * 0.5;
    let w = (s * 0.14).clamp(2.0, 4.5) * scale;
    let p0x = cx + (x + s * 0.20 - cx) * scale;
    let p0y = cy + (y + s * 0.52 - cy) * scale;
    let p1x = cx + (x + s * 0.40 - cx) * scale;
    let p1y = cy + (y + s * 0.74 - cy) * scale;
    let p2x = cx + (x + s * 0.80 - cx) * scale;
    let p2y = cy + (y + s * 0.26 - cy) * scale;
    const N: i32 = 12;
    for i in 0..N {
        let u = (i as f32 + 0.5) / N as f32;
        if u > t {
            break;
        }
        let (px, py) = if u < 0.32 {
            let k = u / 0.32;
            (p0x + (p1x - p0x) * k, p0y + (p1y - p0y) * k)
        } else {
            let k = (u - 0.32) / 0.68;
            (p1x + (p2x - p1x) * k, p1y + (p2y - p1y) * k)
        };
        draw.quad(px - w * 0.5, py - w * 0.5, w, w, color, w * 0.5, 1.0);
    }
}

fn tap_focus(seed: &mut crate::ui::SeedState, id: u32) {
    if seed.on[0] && seed.choice == id {
        seed.on[0] = false;
    } else {
        seed.on[0] = true;
        seed.choice = id;
    }
    seed.clicks += 1;
}

fn apply_event(seed: &mut crate::ui::SeedState, ev: FormEvent) {
    if let Some(id) = ev.focus {
        tap_focus(seed, id);
    }
    if ev.agree {
        seed.on[1] = !seed.on[1];
        seed.clicks += 1;
    }
    if ev.notify {
        seed.on[2] = !seed.on[2];
        seed.clicks += 1;
    }
    if ev.reset {
        seed.on[0] = false;
        seed.on[1] = false;
        seed.on[2] = false;
        seed.choice = 0;
        seed.clicks += 1;
    }
    if ev.submit {
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
    let size = match seed.tab {
        1 => FormSize::Sm,
        2 => FormSize::Lg,
        _ => FormSize::Md,
    };
    let who = if seed.on[0] {
        match seed.choice {
            1 => "handle",
            2 => "token",
            _ => "name",
        }
    } else {
        "idle"
    };
    let agree = if seed.on[1] { "on" } else { "off" };
    let notify = if seed.on[2] { "on" } else { "off" };
    draw.label(
        format!(
            "Parent owns values. {who} · remember {agree} · notify {notify} · {} clicks",
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let mut bx = 36.0 + x0;
    let by = 60.0 + y0;
    for (label, tab, sz) in [
        ("Small", 1u32, ButtonSize::Sm),
        ("Medium", 0u32, ButtonSize::Md),
        ("Large", 2u32, ButtonSize::Lg),
    ] {
        let kind = if seed.tab == tab {
            ButtonKind::Primary
        } else {
            ButtonKind::Ghost
        };
        if button(draw, ptr, motion, dt, bx, by, label, kind, sz, false) {
            seed.tab = tab;
            seed.clicks += 1;
        }
        let s = sz.metrics();
        bx += s.pad_x * 2.0 + label.chars().count() as f32 * s.font * MONO_ADVANCE + s.gap + 8.0;
    }

    let x = 36.0 + x0;
    let y = 108.0 + y0;
    let w_live = 320.0;
    let focused = if seed.on[0] { Some(seed.choice) } else { None };
    let name = seed.field.clone();
    let handle = seed.note.clone();
    let live_fields = [
        FormField {
            label: "Name",
            value: name.as_str(),
            placeholder: "Your name",
            required: true,
            disabled: false,
        },
        FormField {
            label: "Handle",
            value: handle.as_str(),
            placeholder: "Handle",
            required: false,
            disabled: false,
        },
        FormField {
            label: "Token",
            value: "npx kussetsu add",
            placeholder: "",
            required: false,
            disabled: true,
        },
    ];
    let ev = form(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w_live,
        "Account",
        &live_fields,
        focused,
        seed.on[1],
        "Remember me",
        seed.on[2],
        "Notify me",
        seed.clock,
        FormKind::Well,
        size,
        false,
        seed.caret,
        seed.sel,
    );
    apply_event(seed, ev);
    if let Some(c) = ev.caret_at {
        seed.caret = c;
        if ptr.pressed && !seed.edit.shift {
            seed.sel = c;
        }
    }
    if seed.on[0] && seed.choice == 0 {
        if let Some(s) = crate::input::apply_edit(
            &mut seed.field,
            &mut seed.caret,
            &mut seed.sel,
            &seed.edit,
        ) {
            draw.copy_text = Some(s);
        }
    } else if seed.on[0] && seed.choice == 1 {
        if let Some(s) = crate::input::apply_edit(
            &mut seed.note,
            &mut seed.caret,
            &mut seed.sel,
            &seed.edit,
        ) {
            draw.copy_text = Some(s);
        }
    }
    seed.tab_cycle(&[0, 1, 3, 4]);

    let y_dis = y + form_height(live_fields.len(), true, true, size) + 16.0;
    let dis_fields = [FormField {
        label: "Token",
        value: "npx kussetsu add",
        placeholder: "",
        required: false,
        disabled: true,
    }];
    let _ = form(
        draw,
        ptr,
        motion,
        dt,
        x,
        y_dis,
        w_live,
        "Disabled",
        &dis_fields,
        None,
        false,
        "",
        false,
        "",
        seed.clock,
        FormKind::Outline,
        FormSize::Md,
        true,
        0,
        0,
    );
}
