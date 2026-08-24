//! Month grid. Copy Switch: parent owns `selected` (day in month), `month`, `year`.
//! Real Gregorian lengths. Jade selected, MUTED other-month.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, JADE_DIM, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CalendarSize {
    Sm,
    Md,
    Lg,
}

impl CalendarSize {
    pub fn metrics(self) -> Size {
        match self {
            CalendarSize::Sm => SM,
            CalendarSize::Md => MD,
            CalendarSize::Lg => LG,
        }
    }
}

/// Day in the current month, header month step, or year picker.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CalendarEvent {
    Day(u32),
    Prev,
    Next,
    YearToggle,
    Year(u32),
}

const COLS: usize = 7;
const ROWS: usize = 6;
const CELLS: usize = COLS * ROWS;
/// Catalog "today" — 2026-08-24.
const TODAY_Y: u32 = 2026;
const TODAY_M: u32 = 7;
const TODAY_D: u32 = 24;

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const WEEKDAYS: [&str; 7] = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DAYS: [&str; 31] = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17",
    "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31",
];

fn cell_side(s: Size) -> f32 {
    s.height
}

fn cell_gap(s: Size) -> f32 {
    (s.gap * 0.5).max(2.0)
}

fn grid_w(s: Size) -> f32 {
    let d = cell_side(s);
    let g = cell_gap(s);
    COLS as f32 * d + (COLS as f32 - 1.0) * g
}

fn grid_h(s: Size) -> f32 {
    let d = cell_side(s);
    let g = cell_gap(s);
    ROWS as f32 * d + (ROWS as f32 - 1.0) * g
}

fn chevron_w(s: Size) -> f32 {
    (s.pad_x * 2.0 + s.font * MONO_ADVANCE).max(s.height)
}

const MIN_YEAR: u32 = 1900;
const MAX_YEAR: u32 = 2100;
const YEAR_COLS: usize = 4;
const YEAR_ROWS: usize = 3;
const YEAR_CELLS: usize = YEAR_COLS * YEAR_ROWS;

pub fn is_leap(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

pub fn days_in_month(month: u32, year: u32) -> u32 {
    match month % 12 {
        1 => {
            if is_leap(year) {
                29
            } else {
                28
            }
        }
        3 | 5 | 8 | 10 => 30,
        _ => 31,
    }
}

/// Sakamoto: 0 = Sunday. `month` is 0..=11.
pub fn weekday(year: u32, month: u32, day: u32) -> u32 {
    const T: [u32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let m = month % 12;
    let mut y = year;
    if m < 2 {
        y = y.saturating_sub(1);
    }
    (y + y / 4 - y / 100 + y / 400 + T[m as usize] + day) % 7
}

fn month_start(month: u32, year: u32) -> usize {
    weekday(year, month, 1) as usize
}

fn year_page(year: u32) -> u32 {
    let y = year.clamp(MIN_YEAR, MAX_YEAR);
    MIN_YEAR + ((y - MIN_YEAR) / YEAR_CELLS as u32) * YEAR_CELLS as u32
}

pub fn width(size: CalendarSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + grid_w(s)
}

pub fn height(size: CalendarSize) -> f32 {
    let s = size.metrics();
    s.pad_x * 2.0 + s.height + s.gap + s.font + s.gap + grid_h(s)
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn cell_at(index: usize, start: usize, dim: u32, prev_dim: u32) -> (u32, bool) {
    let span = dim as usize;
    if index < start {
        let d = prev_dim as usize - start + index + 1;
        (d as u32, false)
    } else if index < start + span {
        ((index - start + 1) as u32, true)
    } else {
        ((index - start - span + 1) as u32, false)
    }
}

fn day_label(day: u32) -> &'static str {
    DAYS[(day.clamp(1, 31) - 1) as usize]
}

/// Parent owns `selected` (0 = none, else 1..=28), `month` (0..=11), and `year`.
pub fn calendar(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    selected: u32,
    month: u32,
    year: u32,
    size: CalendarSize,
    year_open: bool,
    disabled: bool,
) -> Option<CalendarEvent> {
    let s = size.metrics();
    let month = month % 12;
    let year = year.clamp(MIN_YEAR, MAX_YEAR);
    let dim = days_in_month(month, year);
    let prev_m = if month == 0 { 11 } else { month - 1 };
    let prev_y = if month == 0 { year.saturating_sub(1) } else { year };
    let prev_dim = days_in_month(prev_m, prev_y);
    let selected = if selected == 0 {
        0
    } else {
        selected.clamp(1, dim)
    };
    let w = width(size);
    let h = height(size);
    let d = cell_side(s);
    let gap = cell_gap(s);
    let start = month_start(month, year);
    crate::glass::chrome(draw, x, y, w, h, s.radius);
    let border = if disabled {
        lerp(BORDER, MUTED, 0.25)
    } else {
        BORDER
    };
    draw.outline(x, y, w, h, CLEAR, border, s.radius, 1.0, 1.0);
    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.2;
        draw.outline(x, y, w, h, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let ix = x + s.pad_x;
    let iy = y + s.pad_x;
    let inner = grid_w(s);
    let nav_w = chevron_w(s);
    let mut hit = None;

    if nav(
        draw,
        ptr,
        motion,
        dt,
        ix,
        iy,
        nav_w,
        s.height,
        "<",
        disabled,
        s,
    ) {
        if year_open {
            let cur = {
                let s9 = motion.get_slot(x, y, 9);
                if s9 < MIN_YEAR as f32 {
                    year_page(year)
                } else {
                    s9 as u32
                }
            };
            let base = cur.saturating_sub(YEAR_CELLS as u32).max(MIN_YEAR);
            motion.snap_slot(x, y, 9, base as f32);
        } else {
            hit = Some(CalendarEvent::Prev);
        }
    }
    if nav(
        draw,
        ptr,
        motion,
        dt,
        ix + inner - nav_w,
        iy,
        nav_w,
        s.height,
        ">",
        disabled,
        s,
    ) {
        if year_open {
            let cur = {
                let s9 = motion.get_slot(x, y, 9);
                if s9 < MIN_YEAR as f32 {
                    year_page(year)
                } else {
                    s9 as u32
                }
            };
            let base = (cur + YEAR_CELLS as u32).min(MAX_YEAR - YEAR_CELLS as u32 + 1);
            motion.snap_slot(x, y, 9, base as f32);
        } else {
            hit = Some(CalendarEvent::Next);
        }
    }
    let title_x = ix + nav_w + s.gap;
    let title_w = (inner - nav_w * 2.0 - s.gap * 2.0).max(8.0);
    let year_hit = paint_header(
        draw,
        ptr,
        motion,
        dt,
        title_x,
        iy,
        title_w,
        s.height,
        month,
        year,
        year_open,
        disabled,
        s,
        x,
    );
    if year_hit {
        hit = Some(CalendarEvent::YearToggle);
        motion.snap_slot(x, y, 9, year_page(year) as f32);
    }

    let wd_y = iy + s.height + s.gap;
    let grid_y = wd_y + s.font + s.gap;
    if year_open {
        let mut base = motion.get_slot(x, y, 9);
        if base < MIN_YEAR as f32 || base > MAX_YEAR as f32 {
            base = year_page(year) as f32;
            motion.snap_slot(x, y, 9, base);
        }
        let base = (base as u32).clamp(MIN_YEAR, MAX_YEAR);
        let yw = ((inner - (YEAR_COLS as f32 - 1.0) * gap) / YEAR_COLS as f32).max(d);
        let yh = d;
        let gw = YEAR_COLS as f32 * yw + (YEAR_COLS as f32 - 1.0) * gap;
        let gh = YEAR_ROWS as f32 * yh + (YEAR_ROWS as f32 - 1.0) * gap;
        let gx = ix + (inner - gw) * 0.5;
        let gy = (wd_y + (h - s.pad_x - (wd_y - y) - gh) * 0.5).max(wd_y);
        for i in 0..YEAR_CELLS {
            let col = i % YEAR_COLS;
            let row = i / YEAR_COLS;
            let yy = base + i as u32;
            if yy > MAX_YEAR {
                break;
            }
            let cx = gx + col as f32 * (yw + gap);
            let cy = gy + row as f32 * (yh + gap);
            let label = format!("{yy}");
            if year_cell(
                draw,
                ptr,
                motion,
                dt,
                cx,
                cy,
                yw,
                yh,
                &label,
                yy == year,
                disabled,
                s,
            ) {
                hit = Some(CalendarEvent::Year(yy));
            }
        }
    } else {
        for (c, label) in WEEKDAYS.iter().enumerate() {
            let cx = ix + c as f32 * (d + gap);
            draw.label_in(*label, cx, wd_y, d, s.font, s.font, MUTED, 1.0);
        }
        for i in 0..CELLS {
            let col = i % COLS;
            let row = i / COLS;
            let cx = ix + col as f32 * (d + gap);
            let cy = grid_y + row as f32 * (d + gap);
            let (day, in_month) = cell_at(i, start, dim, prev_dim);
            let on = in_month && selected != 0 && day == selected;
            let is_today = in_month && year == TODAY_Y && month == TODAY_M && day == TODAY_D;
            if day_cell(
                draw,
                ptr,
                motion,
                dt,
                cx,
                cy,
                d,
                day_label(day),
                on,
                in_month,
                is_today,
                disabled,
                s,
            ) {
                hit = Some(CalendarEvent::Day(day));
            }
        }
    }
    hit
}

fn paint_header(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    month: u32,
    year: u32,
    year_open: bool,
    disabled: bool,
    s: Size,
    origin_x: f32,
) -> bool {
    let _ = (motion, dt, origin_x);
    let month_s = MONTHS[month as usize];
    let year_s = format!("{year}");
    if year_open {
        let lo = year_page(year);
        let hi = (lo + YEAR_CELLS as u32 - 1).min(MAX_YEAR);
        let range = format!("{lo} – {hi}");
        let hot = !disabled && ptr.hit(x, y, w, h);
        let ink = if disabled {
            MUTED
        } else if hot {
            JADE
        } else {
            FG
        };
        draw.label_in(&range, x, y, w, h, s.font, ink, 1.0);
        return !disabled && hot && ptr.pressed;
    }
    let month_w = month_s.chars().count() as f32 * s.font * MONO_ADVANCE;
    let year_w = 4.0 * s.font * MONO_ADVANCE;
    let chev = (s.font * 0.45).max(6.0);
    let gap = s.gap;
    let total = month_w + gap + year_w + 4.0 + chev;
    let start = x + (w - total).max(0.0) * 0.5;
    draw.label_in(
        month_s,
        start,
        y,
        month_w,
        h,
        s.font,
        if disabled { MUTED } else { FG },
        1.0,
    );
    let yx = start + month_w + gap;
    let yw = year_w + 4.0 + chev;
    let hot = !disabled && ptr.hit(yx - 4.0, y, yw + 8.0, h);
    let ink = if disabled {
        MUTED
    } else if hot {
        JADE
    } else {
        FG
    };
    draw.label_in(&year_s, yx, y, year_w, h, s.font, ink, 1.0);
    paint_year_chev(draw, yx + year_w + 2.0, y + (h - chev) * 0.5, chev, ink);
    !disabled && hot && ptr.pressed
}

fn paint_year_chev(draw: &mut DrawList, x: f32, y: f32, d: f32, color: [f32; 4]) {
    let w = d * 0.7;
    let h = d * 0.4;
    let x0 = x + (d - w) * 0.5;
    let y0 = y + (d - h) * 0.35;
    draw.quad(x0, y0, w, h * 0.35, color, 0.6, 1.0);
    draw.quad(x0 + w * 0.2, y0 + h * 0.35, w * 0.6, h * 0.35, color, 0.6, 1.0);
    draw.quad(x0 + w * 0.38, y0 + h * 0.7, w * 0.24, h * 0.3, color, 0.5, 1.0);
}

fn year_cell(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    label: &str,
    selected: bool,
    disabled: bool,
    s: Size,
) -> bool {
    let hot = !disabled && ptr.hit(x, y, w, h);
    let active = hot && ptr.down;
    let t = if disabled {
        if selected {
            1.0
        } else {
            0.0
        }
    } else {
        motion
            .spring_slot(x, y, 2, if selected { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0)
    };
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
    let jade92 = [JADE[0], JADE[1], JADE[2], 0.92];
    let jade_press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
    let (fill, ink, border, bw) = if disabled {
        if selected {
            (JADE_DIM, MUTED, BORDER, 1.0)
        } else {
            (CLEAR, MUTED, CLEAR, 0.0)
        }
    } else {
        let rest = mix_phase(CLEAR, WELL, JADE_DIM, u);
        let on = mix_phase(jade92, JADE, jade_press, u);
        let fill = lerp(rest, on, t);
        let ink = lerp(lerp(FG, JADE, u.min(1.0)), INK, t);
        let border = lerp(lerp(CLEAR, JADE, u.min(1.0)), CLEAR, t);
        let bw = (1.0 - t) * if u > 0.04 { 1.0 } else { 0.0 };
        (fill, ink, border, bw)
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    let font = (s.font * 0.9).max(10.0);
    draw.label_in(label, x, y, w, h, font, ink, scale);
    !disabled && hot && ptr.pressed
}

fn nav(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    label: &str,
    disabled: bool,
    s: Size,
) -> bool {
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
        (CLEAR, MUTED, CLEAR, 0.0)
    } else {
        (
            mix_phase(CLEAR, WELL, JADE_DIM, u),
            lerp(MUTED, JADE, u.min(1.0)),
            lerp(CLEAR, JADE, u.min(1.0)),
            if u > 0.04 { 1.0 } else { 0.0 },
        )
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, h, fill, border, s.radius, bw, scale);
    }
    draw.label_in(label, x, y, w, h, s.font, ink, scale);
    !disabled && hot && ptr.pressed
}

fn day_cell(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    d: f32,
    label: &str,
    selected: bool,
    in_month: bool,
    is_today: bool,
    disabled: bool,
    s: Size,
) -> bool {
    let interactive = !disabled && in_month;
    let hot = interactive && ptr.hit(x, y, d, d);
    let active = hot && ptr.down;
    let t = if disabled {
        if selected {
            1.0
        } else {
            0.0
        }
    } else {
        motion
            .spring_slot(x, y, 2, if selected { 1.0 } else { 0.0 }, dt)
            .clamp(0.0, 1.0)
    };
    let (scale, u) = if !interactive {
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
    let jade92 = [JADE[0], JADE[1], JADE[2], 0.92];
    let jade_press = [JADE[0] * 0.82, JADE[1] * 0.82, JADE[2] * 0.82, 1.0];
    let (fill, ink, border, bw) = if disabled {
        if selected {
            (JADE_DIM, MUTED, BORDER, 1.0)
        } else {
            (CLEAR, MUTED, CLEAR, 0.0)
        }
    } else if !in_month {
        (CLEAR, MUTED, CLEAR, 0.0)
    } else {
        let rest = mix_phase(CLEAR, WELL, JADE_DIM, u);
        let on = mix_phase(jade92, JADE, jade_press, u);
        let fill = lerp(rest, on, t);
        let ink = lerp(lerp(FG, JADE, u.min(1.0)), INK, t);
        let border = if is_today && t < 0.5 {
            JADE
        } else {
            lerp(lerp(CLEAR, JADE, u.min(1.0)), CLEAR, t)
        };
        let bw = if is_today && t < 0.5 {
            1.5
        } else {
            (1.0 - t) * if u > 0.04 { 1.0 } else { 0.0 }
        };
        (fill, ink, border, bw)
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, d, d, fill, border, s.radius, bw, scale);
    }
    draw.label_in(label, x, y, d, d, s.font, ink, scale);
    interactive && hot && ptr.pressed
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
    if seed.choice < 1 {
        seed.choice = 14;
    }
    seed.tab %= 12;
    if seed.value < 1900.0 {
        seed.value = 2026.0;
    }
    if seed.clicks == 0 {
        seed.on[6] = false;
    }
    let month = seed.tab;
    let year = seed.value as u32;
    draw.label(
        format!(
            "Parent owns the day. {} {} {year} · {} clicks",
            MONTHS[month as usize],
            seed.choice,
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let mut y = 72.0 + y0;
    if let Some(ev) = calendar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        month,
        year,
        CalendarSize::Md,
        seed.on[6],
        false,
    ) {
        apply_event(seed, ev);
    }

    y += height(CalendarSize::Md) + 20.0;
    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 18.0;
    let _ = calendar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        month,
        year,
        CalendarSize::Md,
        false,
        true,
    );

    y += height(CalendarSize::Md) + 20.0;
    draw.label("Small", x, y, 12.0, MUTED);
    y += 18.0;
    if let Some(ev) = calendar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        month,
        year,
        CalendarSize::Sm,
        seed.on[6],
        false,
    ) {
        apply_event(seed, ev);
    }

    y += height(CalendarSize::Sm) + 16.0;
    draw.label("Large", x, y, 12.0, MUTED);
    y += 18.0;
    if let Some(ev) = calendar(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        seed.choice,
        month,
        year,
        CalendarSize::Lg,
        seed.on[6],
        false,
    ) {
        apply_event(seed, ev);
    }
}

fn apply_event(seed: &mut crate::ui::SeedState, ev: CalendarEvent) {
    let year = if seed.value < 1900.0 {
        2026
    } else {
        seed.value as u32
    };
    match ev {
        CalendarEvent::Day(day) => {
            let y = if seed.value < 1900.0 {
                2026
            } else {
                seed.value as u32
            };
            seed.choice = day.clamp(1, days_in_month(seed.tab % 12, y));
        }
        CalendarEvent::Prev => {
            let (m, y) = step_month(seed.tab, year, -1);
            seed.tab = m;
            seed.value = y as f32;
        }
        CalendarEvent::Next => {
            let (m, y) = step_month(seed.tab, year, 1);
            seed.tab = m;
            seed.value = y as f32;
        }
        CalendarEvent::YearToggle => seed.on[6] = !seed.on[6],
        CalendarEvent::Year(y) => {
            seed.value = y as f32;
            seed.on[6] = false;
        }
    }
    seed.clicks += 1;
}

pub fn step_month(month: u32, year: u32, delta: i32) -> (u32, u32) {
    let mut m = month as i32 + delta;
    let mut y = year as i32;
    while m < 0 {
        m += 12;
        y -= 1;
    }
    while m >= 12 {
        m -= 12;
        y += 1;
    }
    (m as u32, y.clamp(MIN_YEAR as i32, MAX_YEAR as i32) as u32)
}
