//! Shortcut chip. Outline well, mono keys, plus between chords.
//! Stateless click — copy Button. Parent handles the returned bool.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KbdKind {
    Outline,
    Ghost,
    Jade,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KbdSize {
    Sm,
    Md,
    Lg,
}

impl KbdSize {
    pub fn metrics(self) -> Size {
        match self {
            KbdSize::Sm => SM,
            KbdSize::Md => MD,
            KbdSize::Lg => LG,
        }
    }
}

fn key_kind(label: &str) -> &'static str {
    let t = label.trim();
    let lower = t.to_ascii_lowercase();
    match t {
        "⌘" | "cmd" | "command" | "meta" | "super" => "cmd",
        "⇧" | "shift" => "shift",
        "⌥" | "alt" | "option" => "opt",
        "⌃" | "ctrl" | "control" => "ctrl",
        "⏎" | "enter" | "return" => "ret",
        "⌫" | "backspace" => "bsp",
        "⇥" | "tab" => "tab",
        _ => {
            if matches!(lower.as_str(), "cmd" | "command" | "meta" | "super") {
                "cmd"
            } else if lower == "shift" {
                "shift"
            } else if matches!(lower.as_str(), "alt" | "option") {
                "opt"
            } else if matches!(lower.as_str(), "ctrl" | "control") {
                "ctrl"
            } else {
                "text"
            }
        }
    }
}

fn key_width(label: &str, s: Size) -> f32 {
    if key_kind(label) != "text" {
        return s.height;
    }
    let text = label.chars().count() as f32 * s.font * MONO_ADVANCE;
    (s.pad_x * 2.0 + text).max(s.height)
}

fn plus_span(s: Size) -> f32 {
    s.gap + s.font * MONO_ADVANCE + s.gap
}

pub fn kbd_width(keys: &[&str], size: KbdSize) -> f32 {
    if keys.is_empty() {
        return 0.0;
    }
    let s = size.metrics();
    let mut w = 0.0;
    for (i, key) in keys.iter().enumerate() {
        if i > 0 {
            w += plus_span(s);
        }
        w += key_width(key, s);
    }
    w
}

pub fn kbd(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    keys: &[&str],
    kind: KbdKind,
    size: KbdSize,
    disabled: bool,
) -> bool {
    let s = size.metrics();
    let w = kbd_width(keys, size);
    let h = s.height;
    let hot = !disabled && w > 0.0 && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let (scale, u) = if disabled {
        (1.0, 0.0)
    } else if active {
        let scale = if kind == KbdKind::Ghost {
            1.0
        } else {
            PRESS_SCALE
        };
        motion.snap_slot(
            x,
            y,
            0,
            if kind == KbdKind::Ghost {
                1.0
            } else {
                HOVER_SCALE
            },
        );
        motion.snap_slot(x, y, 1, 1.0);
        (scale, 2.0)
    } else {
        let scale_to = if kind == KbdKind::Ghost {
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
    let (fill, ink, border, bw) = if disabled {
        match kind {
            KbdKind::Ghost => (CLEAR, MUTED, CLEAR, 0.0),
            _ => (WELL, MUTED, BORDER, 1.0),
        }
    } else {
        match kind {
            KbdKind::Jade => {
                let rest = [JADE[0], JADE[1], JADE[2], 0.92];
                let press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
                (mix_phase(rest, JADE, press, u), INK, CLEAR, 0.0)
            }
            KbdKind::Ghost => (mix_phase(CLEAR, WELL, SCRIM, u), FG, CLEAR, 0.0),
            KbdKind::Outline => (mix_phase(WELL, BORDER, SCRIM, u), FG, JADE, 1.0),
        }
    };
    let plus_ink = if disabled {
        MUTED
    } else if kind == KbdKind::Jade {
        JADE
    } else {
        lerp(MUTED, JADE, u.min(1.0))
    };
    let mut cx = x;
    for (i, key) in keys.iter().enumerate() {
        if i > 0 {
            let pw = plus_span(s);
            draw.label_in("+", cx, y, pw, h, s.font, plus_ink, scale);
            cx += pw;
        }
        let kw = key_width(key, s);
        if fill[3] > 0.02 || bw > 0.0 {
            draw.outline(cx, y, kw, h, fill, border, s.radius, bw, scale);
        }
        paint_key_face(draw, cx, y, kw, h, key, ink, scale);
        cx += kw;
    }
    !disabled && hot && ptr.pressed
}

fn paint_key_face(
    draw: &mut DrawList,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    key: &str,
    ink: [f32; 4],
    scale: f32,
) {
    let kind = key_kind(key);
    if kind == "text" {
        draw.label_in(key, x, y, w, h, (h * 0.42).max(10.0), ink, scale);
        return;
    }
    let ox = x + w * 0.5;
    let oy = y + h * 0.5;
    let s = (w.min(h) * 0.42).max(8.0);
    let l = ox - s * 0.5;
    let t = oy - s * 0.5;
    match kind {
        "cmd" => {
            let g = s * 0.22;
            let d = s * 0.28;
            for (dx, dy) in [(0.0, 0.0), (s - d, 0.0), (0.0, s - d), (s - d, s - d)] {
                draw.quad(l + dx, t + dy, d, d, ink, d * 0.35, scale);
            }
            draw.quad(l + g, t + s * 0.38, s - g * 2.0, s * 0.24, ink, 1.0, scale);
            draw.quad(l + s * 0.38, t + g, s * 0.24, s - g * 2.0, ink, 1.0, scale);
        }
        "shift" => {
            let bar_w = s * 0.38;
            let bar_h = s * 0.18;
            draw.quad(ox - s * 0.12, t, s * 0.24, s * 0.55, ink, 1.0, scale);
            draw.quad(ox - s * 0.32, t + s * 0.28, s * 0.28, s * 0.18, ink, 1.0, scale);
            draw.quad(ox + s * 0.04, t + s * 0.28, s * 0.28, s * 0.18, ink, 1.0, scale);
            draw.quad(ox - bar_w * 0.5, t + s * 0.72, bar_w, bar_h, ink, 1.0, scale);
        }
        "opt" => {
            draw.quad(l, t + s * 0.15, s * 0.42, s * 0.16, ink, 1.0, scale);
            draw.quad(l + s * 0.28, t + s * 0.15, s * 0.16, s * 0.7, ink, 1.0, scale);
            draw.quad(l + s * 0.48, t + s * 0.7, s * 0.42, s * 0.16, ink, 1.0, scale);
        }
        "ctrl" => draw.label_in("^", x, y, w, h, s * 0.7, ink, scale),
        "ret" => {
            draw.quad(l + s * 0.15, t + s * 0.55, s * 0.7, s * 0.18, ink, 1.0, scale);
            draw.quad(l + s * 0.15, t + s * 0.28, s * 0.18, s * 0.45, ink, 1.0, scale);
            draw.quad(l + s * 0.65, t + s * 0.18, s * 0.18, s * 0.55, ink, 1.0, scale);
        }
        "bsp" => {
            draw.quad(l + s * 0.1, t + s * 0.4, s * 0.8, s * 0.2, ink, 1.0, scale);
            draw.quad(l + s * 0.1, t + s * 0.22, s * 0.22, s * 0.56, ink, 1.0, scale);
        }
        "tab" => {
            draw.quad(l + s * 0.1, t + s * 0.42, s * 0.8, s * 0.16, ink, 1.0, scale);
            draw.quad(l + s * 0.68, t + s * 0.22, s * 0.22, s * 0.56, ink, 1.0, scale);
        }
        _ => draw.label_in(key, x, y, w, h, (h * 0.42).max(10.0), ink, scale),
    }
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn caption(draw: &mut DrawList, x: f32, y: f32, w: f32, h: f32, text: &str) {
    let font = SM.font;
    let tw = text.chars().count() as f32 * font * MONO_ADVANCE;
    draw.label(text, x + (w - tw) * 0.5, y + h + 6.0, font, MUTED);
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
    const GAP: f32 = 16.0;
    let chords: [&[&str]; 3] = [&["⌘", "K"], &["⌘", "⇧", "P"], &["Esc"]];
    let names = ["palette", "command", "escape"];
    let picked = (seed.choice as usize) % chords.len();
    draw.label(
        format!("onClick fired {} times · {}", seed.clicks, names[picked]),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    let md_h = MD.height;
    for (kind, name) in [
        (KbdKind::Outline, "Outline"),
        (KbdKind::Ghost, "Ghost"),
        (KbdKind::Jade, "Jade"),
    ] {
        let keys: &[&str] = &["⌘", "K"];
        let w = kbd_width(keys, KbdSize::Md);
        if kbd(draw, ptr, motion, dt, x, y, keys, kind, KbdSize::Md, false) {
            seed.clicks += 1;
        }
        caption(draw, x, y, w, md_h, name);
        x += w + GAP;
    }
    {
        let keys: &[&str] = &["⌘", "Q"];
        let w = kbd_width(keys, KbdSize::Md);
        let _ = kbd(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            keys,
            KbdKind::Outline,
            KbdSize::Md,
            true,
        );
        caption(draw, x, y, w, md_h, "Disabled");
    }

    let y2 = y + md_h + 32.0;
    x = 36.0 + x0;
    let tab = seed.tab % 3;
    for (i, (size, name)) in [
        (KbdSize::Sm, "Sm"),
        (KbdSize::Md, "Md"),
        (KbdSize::Lg, "Lg"),
    ]
    .into_iter()
    .enumerate()
    {
        let keys: &[&str] = &["⌘", "C"];
        let h = size.metrics().height;
        let w = kbd_width(keys, size);
        let kind = if tab == i as u32 {
            KbdKind::Jade
        } else {
            KbdKind::Outline
        };
        if kbd(draw, ptr, motion, dt, x, y2, keys, kind, size, false) {
            seed.clicks += 1;
            seed.tab = i as u32;
        }
        caption(draw, x, y2, w, h, name);
        x += w + GAP;
    }

    let y3 = y2 + LG.height + 40.0;
    draw.label("Pick a shortcut", 36.0 + x0, y3, 14.0, MUTED);
    let y4 = y3 + 24.0;
    x = 36.0 + x0;
    for (i, (keys, name)) in chords.iter().zip(names).enumerate() {
        let kind = if picked == i {
            KbdKind::Jade
        } else {
            KbdKind::Outline
        };
        let w = kbd_width(keys, KbdSize::Md);
        if kbd(draw, ptr, motion, dt, x, y4, keys, kind, KbdSize::Md, false) {
            seed.choice = i as u32;
            seed.clicks += 1;
        }
        caption(draw, x, y4, w, md_h, name);
        x += w + GAP;
    }
}
