//! Calendar + Input. Copy Select: parent owns `open` + the date string.
//! Field is always painted; the month grid mounts while `open` (including the exit swoop).

use crate::button::{button, ButtonKind, ButtonSize};
use crate::calendar::{
    calendar, height as cal_h, step_month, width as cal_w, CalendarEvent, CalendarSize,
};
use crate::draw::{DrawList, Motion, Pointer};
use crate::input::paint_field_text;
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED, SCRIM, SM,
    WELL,
};

const GAP: f32 = 6.0;
const YEAR: u32 = 2026;



#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DatePickerSize {
    Sm,
    Md,
    Lg,
}

impl DatePickerSize {
    pub fn metrics(self) -> Size {
        match self {
            DatePickerSize::Sm => SM,
            DatePickerSize::Md => MD,
            DatePickerSize::Lg => LG,
        }
    }

    fn calendar(self) -> CalendarSize {
        match self {
            DatePickerSize::Sm => CalendarSize::Sm,
            DatePickerSize::Md => CalendarSize::Md,
            DatePickerSize::Lg => CalendarSize::Lg,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct DatePickerEvent {
    pub opened: bool,
    pub close: bool,
    pub gone: bool,
    pub focused: bool,
    pub picked: Option<(u32, u32)>,
    pub month: Option<u32>,
    pub year: Option<u32>,
    pub year_toggle: bool,
}

pub fn format_date(month: u32, day: u32, year: u32) -> String {
    if day == 0 {
        String::new()
    } else {
        format!("{:02}/{:02}/{year}", (month % 12) + 1, day)
    }
}

struct DateParts {
    month: String,
    day: String,
    year: String,
}

fn digits_col(s: &str, max: usize) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).take(max).collect()
}

fn parse_parts(s: &str) -> DateParts {
    let mut cols: Vec<String> = s.split('/').map(|p| digits_col(p, 4)).collect();
    while cols.len() < 3 {
        cols.push(String::new());
    }
    DateParts {
        month: digits_col(&cols[0], 2),
        day: digits_col(&cols[1], 2),
        year: digits_col(&cols[2], 4),
    }
}

fn pad2(s: &str) -> String {
    match s.len() {
        0 => String::new(),
        1 => format!("0{s}"),
        _ => s.chars().take(2).collect(),
    }
}

fn normalize_month(m: &mut String) {
    if m.is_empty() {
        return;
    }
    let c: Vec<char> = m.chars().collect();
    if c.len() == 1 && c[0] > '1' {
        *m = format!("0{}", c[0]);
        return;
    }
    if c.len() >= 2 {
        let v = c[0].to_digit(10).unwrap_or(0) * 10 + c[1].to_digit(10).unwrap_or(0);
        *m = format!("{:02}", v.clamp(1, 12));
    }
}

fn normalize_day(d: &mut String) {
    if d.is_empty() {
        return;
    }
    let c: Vec<char> = d.chars().collect();
    if c.len() == 1 && c[0] > '2' {
        *d = format!("0{}", c[0]);
        return;
    }
    if c.len() >= 2 {
        let v = c[0].to_digit(10).unwrap_or(0) * 10 + c[1].to_digit(10).unwrap_or(0);
        *d = format!("{:02}", v.clamp(1, 31));
    }
}

fn format_parts(p: &DateParts) -> String {
    if p.month.is_empty() {
        return String::new();
    }
    let month = if p.month.len() == 1 && (!p.day.is_empty() || !p.year.is_empty()) {
        pad2(&p.month)
    } else {
        p.month.clone()
    };
    if p.day.is_empty() && p.year.is_empty() {
        if month.len() == 2 {
            return format!("{month}/");
        }
        return month;
    }
    let day = if p.day.len() == 1 && !p.year.is_empty() {
        pad2(&p.day)
    } else {
        p.day.clone()
    };
    if p.year.is_empty() {
        if day.len() == 2 {
            return format!("{month}/{day}/");
        }
        return format!("{month}/{day}");
    }
    format!("{month}/{day}/{}", p.year)
}

fn push_digit(p: &mut DateParts, c: char) {
    if p.month.len() < 2 && p.day.is_empty() && p.year.is_empty() {
        p.month.push(c);
        normalize_month(&mut p.month);
        return;
    }
    if p.month.len() < 2 {
        p.month.push(c);
        normalize_month(&mut p.month);
        return;
    }
    if p.day.len() < 2 && p.year.is_empty() {
        p.day.push(c);
        normalize_day(&mut p.day);
        return;
    }
    if p.day.len() < 2 {
        p.day.push(c);
        normalize_day(&mut p.day);
        return;
    }
    if p.year.len() < 4 {
        p.year.push(c);
    }
}

fn commit_slash(p: &mut DateParts) {
    if p.month.is_empty() {
        return;
    }
    if p.month.len() == 1 && p.day.is_empty() && p.year.is_empty() {
        p.month = pad2(&p.month);
        normalize_month(&mut p.month);
        return;
    }
    if p.month.len() < 2 {
        return;
    }
    if p.day.is_empty() {
        return;
    }
    if p.day.len() == 1 && p.year.is_empty() {
        p.day = pad2(&p.day);
        normalize_day(&mut p.day);
    }
}

fn backspace_part(p: &mut DateParts) {
    if !p.year.is_empty() {
        p.year.pop();
        return;
    }
    if !p.day.is_empty() {
        p.day.pop();
        return;
    }
    p.month.pop();
}

fn digits_only(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).take(8).collect()
}

/// `mm/dd/yy` or `mm/dd/yyyy`. `/` after one digit pads and advances.
/// Extra digits past a 4-digit year are ignored — the field is not wiped.
pub fn apply_date_mask(buf: &mut String, typed: &str, backspace: bool) {
    let mut p = parse_parts(buf);
    if backspace {
        backspace_part(&mut p);
    }
    for c in typed.chars() {
        if c == '/' {
            commit_slash(&mut p);
        } else if c.is_ascii_digit() {
            push_digit(&mut p, c);
        }
    }
    *buf = format_parts(&p);
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ParsedDate {
    pub month: Option<u32>,
    pub day: Option<u32>,
    pub year: Option<u32>,
}

pub fn parse_date(raw: &str) -> ParsedDate {
    let p = parse_parts(raw);
    let mut out = ParsedDate::default();
    if p.month.len() >= 2 || (p.month.len() == 1 && (!p.day.is_empty() || !p.year.is_empty())) {
        if let Ok(m) = pad2(&p.month).parse::<u32>() {
            if (1..=12).contains(&m) {
                out.month = Some(m - 1);
            }
        }
    }
    if p.day.len() >= 2 {
        if let Ok(d) = pad2(&p.day).parse::<u32>() {
            let y = match p.year.len() {
                2 => p.year.parse::<u32>().ok().map(|yy| 2000 + yy),
                4 => p.year.parse::<u32>().ok(),
                _ => None,
            }
            .unwrap_or(YEAR);
            let m = pad2(&p.month).parse::<u32>().unwrap_or(1).saturating_sub(1);
            let max = crate::calendar::days_in_month(m, y);
            if (1..=max).contains(&d) {
                out.day = Some(d);
            }
        }
    }
    out.year = match p.year.len() {
        2 => p.year.parse::<u32>().ok().map(|y| 2000 + y),
        4 => p.year.parse::<u32>().ok().filter(|y| (1900..=2100).contains(y)),
        _ => None,
    };
    out
}

pub fn width(size: DatePickerSize) -> f32 {
    cal_w(size.calendar())
}

/// Field + (when `open`) the month grid. Parent keeps `open` true through the
/// exit swoop; `apply_close` drops it after `gone`.
pub fn date_picker(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    value: &str,
    month: u32,
    day: u32,
    year: u32,
    size: DatePickerSize,
    open: bool,
    leaving: bool,
    fresh: &mut bool,
    focused: bool,
    year_open: bool,
    clock: f32,
    disabled: bool,
) -> DatePickerEvent {
    let s = size.metrics();
    let cal = size.calendar();
    let w = width(size);
    let h = s.height;
    let glyph = (h * 0.55).max(14.0);
    let latched = open && !leaving && !disabled;
    let icon_x = x + w - s.pad_x - glyph;
    let field_hot = !disabled && ptr.hit(x, y, w, h);
    let icon_hot = !disabled && ptr.hit(icon_x - 4.0, y, glyph + s.pad_x + 4.0, h);
    let hot = field_hot;
    let active = hot && ptr.down;
    let u = if disabled {
        0.0
    } else if active {
        motion.snap_slot(x, y, 1, 1.0);
        2.0
    } else {
        motion.spring_slot(
            x,
            y,
            1,
            if hot || latched || focused { 1.0 } else { 0.0 },
            dt,
        )
    };
    let hover = u.min(1.0);
    let t_focus = motion
        .spring_slot(x, y, 6, if (focused || latched) && !disabled { 1.0 } else { 0.0 }, dt)
        .clamp(0.0, 1.0);
    crate::glass::chrome(draw, x, y, w, h, s.radius);
    if hover > 0.02 && !disabled {
        let mut wash = JADE_DIM;
        wash[3] *= hover * 0.22;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    let border = if disabled {
        BORDER
    } else {
        lerp(BORDER, JADE, t_focus.max(hover))
    };
    let ink = if disabled {
        MUTED
    } else if value.is_empty() {
        MUTED
    } else {
        lerp(FG, JADE, t_focus * 0.35)
    };
    draw.outline(x, y, w, h, CLEAR, border, s.radius, 1.0, 1.0);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }
    let inset_right = (x + w - (icon_x - s.gap)).max(s.pad_x);
    paint_field_text(
        draw,
        motion,
        ptr,
        x,
        y,
        w,
        h,
        s.pad_x,
        inset_right,
        value,
        "mm/dd/yyyy",
        focused,
        disabled,
        clock,
        s.font,
        1.0,
        ink,
        x + w * 0.5,
        y + h * 0.5,
        value.chars().count(),
        value.chars().count(),
    );
    paint_cal_mark(
        draw,
        icon_x,
        y + (h - glyph) * 0.5,
        glyph,
        if disabled {
            MUTED
        } else {
            lerp(MUTED, JADE, t_focus.max(hover))
        },
        1.0,
    );

    let mut ev = DatePickerEvent {
        opened: !disabled && hot && ptr.pressed && !open && !leaving,
        close: !disabled && icon_hot && ptr.pressed && open && !leaving,
        gone: false,
        focused: !disabled && field_hot && ptr.pressed,
        picked: None,
        month: None,
        year: None,
        year_toggle: false,
    };
    if disabled || !(open || leaving) {
        return ev;
    }

    let cw = cal_w(cal);
    let ch = cal_h(cal);
    let mx = x;
    let my = y + h + GAP;
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
    let drop = (1.0 - e) * -8.0;
    let live = t > 0.96 && !leaving;
    let prev_layer = draw.layer;
    draw.layer = 12;
    let prev_op = draw.opacity;
    draw.opacity *= fade;
    let mut shade = SCRIM;
    shade[3] *= fade * 0.28;
    draw.quad(mx, my + drop + 3.0, cw, ch, shade, s.radius, 1.0);

    let cal_ptr = if live {
        ptr
    } else {
        Pointer {
            pressed: false,
            released: false,
            down: false,
            ..ptr
        }
    };
    let cy = my + drop;
    if let Some(hit) = calendar(
        draw,
        cal_ptr,
        motion,
        dt,
        mx,
        cy,
        day,
        month,
        year,
        cal,
        year_open,
        false,
    ) {
        match hit {
            CalendarEvent::Day(d) => ev.picked = Some((month % 12, d)),
            CalendarEvent::Prev => ev.month = Some((month + 11) % 12),
            CalendarEvent::Next => ev.month = Some((month + 1) % 12),
            CalendarEvent::YearToggle => ev.year_toggle = true,
            CalendarEvent::Year(y) => ev.year = Some(y),
        }
    }
    let menu_hit = ptr.hit(mx, my, cw, ch);
    let outside = live && ptr.released && !hot && !menu_hit;
    ev.close = ev.close || ev.picked.is_some() || (outside && !year_open);
    if outside && year_open {
        ev.year_toggle = true;
    }
    draw.opacity = prev_op;
    draw.layer = prev_layer;
    ev
}

/// Drop the opening click's mouse-up; play the exit swoop before unmounting.
pub fn apply_close(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    ev: DatePickerEvent,
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

fn sync(
    open: &mut bool,
    hold: &mut bool,
    leaving: &mut bool,
    fresh: &mut bool,
    ev: DatePickerEvent,
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

fn paint_cal_mark(draw: &mut DrawList, x: f32, y: f32, d: f32, color: [f32; 4], scale: f32) {
    let ox = x + d * 0.5;
    let oy = y + d * 0.5;
    let inset = d * 0.08;
    let x0 = ox + (x + inset - ox) * scale;
    let y0 = oy + (y + inset - oy) * scale;
    let side = (d - inset * 2.0) * scale;
    let r = (side * 0.12).max(1.2);
    let head = (side * 0.22).max(2.0);
    draw.quad(x0, y0, side, side, color, r, 1.0);
    let mut well = WELL;
    well[3] = color[3];
    draw.quad(x0 + 1.2, y0 + head, side - 2.4, side - head - 1.2, well, r * 0.5, 1.0);
    let ring = (side * 0.12).max(1.4);
    let gap = (side - ring * 2.0 - 4.0).max(2.0) / 1.0;
    for i in 0..2 {
        let px = x0 + 2.4 + i as f32 * (ring + gap * 0.15);
        draw.quad(px, y0 + 1.4, ring, ring, well, ring * 0.5, 1.0);
    }
    let mut pip = color;
    pip[3] *= 0.9;
    let cell = ((side - 4.0) / 4.0).max(1.4);
    for row in 0..2 {
        for col in 0..3 {
            let px = x0 + 2.2 + col as f32 * (cell + 1.0);
            let py = y0 + head + 2.0 + row as f32 * (cell + 1.0);
            draw.quad(px, py, cell * 0.7, cell * 0.7, pip, 0.6, 1.0);
        }
    }
}

fn chip_w(label: &str) -> f32 {
    SM.pad_x * 2.0 + label.chars().count() as f32 * SM.font * MONO_ADVANCE
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
    seed.tab %= 12;
    if seed.clicks == 0 {
        seed.on[6] = false;
        if seed.value < 1900.0 {
            seed.value = YEAR as f32;
        }
    }
    let size = if seed.on[5] {
        DatePickerSize::Lg
    } else if seed.on[7] {
        DatePickerSize::Sm
    } else {
        DatePickerSize::Md
    };
    if seed.on[4] {
        apply_date_mask(&mut seed.field, &seed.typed, seed.backspace);
    }
    let parsed = parse_date(&seed.field);
    if let Some(m) = parsed.month {
        seed.tab = m;
    }
    if let Some(d) = parsed.day {
        seed.choice = d;
    }
    if let Some(y) = parsed.year {
        seed.value = y as f32;
    } else if digits_only(&seed.field).is_empty() {
        seed.choice = 0;
    }
    let year = if seed.value < 1900.0 {
        YEAR
    } else {
        seed.value as u32
    };

    let shown = if seed.choice == 0 && seed.field.is_empty() {
        "none"
    } else if seed.field.is_empty() {
        "none"
    } else {
        seed.field.as_str()
    };
    draw.label(
        format!("Parent owns the date · {shown} · {} clicks", seed.clicks),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let y_sz = 72.0 + y0;
    let mut x = 36.0 + x0;
    for (i, (name, on)) in [
        ("Sm", seed.on[7] && !seed.on[5]),
        ("Md", !seed.on[7] && !seed.on[5]),
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
            seed.on[7] = i == 0;
            seed.on[5] = i == 2;
            seed.clicks += 1;
        }
        x += chip_w(name) + 10.0;
    }

    let y = 120.0 + y0;
    x = 36.0 + x0;
    let mut fresh = seed.on[3];
    let ev = date_picker(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &seed.field,
        seed.tab,
        seed.choice,
        year,
        size,
        seed.on[0],
        seed.on[2],
        &mut fresh,
        seed.on[4],
        seed.on[6],
        seed.clock,
        false,
    );
    seed.on[3] = fresh;
    if ev.opened {
        seed.clicks += 1;
        seed.on[4] = true;
    } else if ev.focused {
        seed.on[4] = true;
        seed.clicks += 1;
    }
    if let Some((m, d)) = ev.picked {
        seed.tab = m;
        seed.choice = d;
        seed.field = format_date(m, d, year);
        seed.on[4] = false;
        seed.on[6] = false;
        seed.clicks += 1;
    }
    if let Some(m) = ev.month {
        let (mm, yy) = if m == (seed.tab + 1) % 12 {
            step_month(seed.tab, year, 1)
        } else {
            step_month(seed.tab, year, -1)
        };
        seed.tab = mm;
        seed.value = yy as f32;
        if seed.choice > 0 {
            seed.field = format_date(mm, seed.choice, yy);
        }
        seed.clicks += 1;
    }
    if let Some(y) = ev.year {
        seed.value = y as f32;
        seed.on[6] = false;
        if seed.choice > 0 {
            seed.field = format_date(seed.tab, seed.choice, y);
        }
        seed.clicks += 1;
    }
    if ev.year_toggle {
        seed.on[6] = !seed.on[6];
        seed.clicks += 1;
    }
    if ev.close && ev.picked.is_none() {
        seed.on[4] = false;
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

    x += width(size) + 16.0;
    let mut fresh_off = false;
    let _ = date_picker(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "08/14/2026",
        7,
        14,
        2026,
        size,
        false,
        false,
        &mut fresh_off,
        false,
        false,
        seed.clock,
        true,
    );
    draw.label("Disabled", x, y + size.metrics().height + 10.0, 12.0, MUTED);
}

#[cfg(test)]
mod tests {
    use super::apply_date_mask;

    fn run(start: &str, typed: &str, backspace: bool) -> String {
        let mut s = start.to_string();
        apply_date_mask(&mut s, typed, backspace);
        s
    }

    #[test]
    fn digits_auto_slash() {
        assert_eq!(run("", "0", false), "0");
        assert_eq!(run("0", "8", false), "08/");
        assert_eq!(run("08/", "2", false), "08/2");
        assert_eq!(run("08/2", "1", false), "08/21/");
        assert_eq!(run("08/21/", "2", false), "08/21/2");
        assert_eq!(run("08/21/2", "6", false), "08/21/26");
    }

    #[test]
    fn four_digit_year_does_not_clear() {
        assert_eq!(run("08/21/26", "0", false), "08/21/260");
        assert_eq!(run("08/21/260", "0", false), "08/21/2600");
        assert_eq!(run("08/21/2026", "9", false), "08/21/2026");
    }

    #[test]
    fn slash_after_one_digit() {
        assert_eq!(run("1", "/", false), "01/");
        assert_eq!(run("01/", "2", false), "01/2");
        assert_eq!(run("01/2", "/", false), "01/02/");
        assert_eq!(run("01/02/", "2", false), "01/02/2");
        assert_eq!(run("01/02/2", "6", false), "01/02/26");
    }

    #[test]
    fn high_month_pads() {
        assert_eq!(run("", "8", false), "08/");
    }
}
