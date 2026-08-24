//! Guests window on the kit: Title Bar + Sidebar + Table + fields + Date Picker + confirm.

use crate::alert_dialog::{
    alert_dialog, apply_close as alert_close, AlertDialogKind, AlertDialogSize,
};
use crate::button::{button, ButtonKind, ButtonSize};
use crate::calendar::step_month;
use crate::date_picker::{
    apply_close as date_close, apply_date_mask, date_picker, format_date, parse_date, DatePickerSize,
};
use crate::draw::{DrawList, Motion, Pointer};
use crate::glass::{pane, Glass};
use crate::input::{apply_edit, hit_caret, input_ex, InputSize};
use crate::settings::{settings, SettingsKind, SettingsSize};
use crate::sidebar::{sidebar, SidebarKind, SidebarSize};
use crate::table::{next_sort, table, height as table_h, TableKind, TableSize};
use crate::title_bar::{title_bar, TitleBarKind, TitleBarSize};
use crate::tokens::{FG, JADE, MD, MONO_ADVANCE, MUTED};
use crate::ui::{Guest, SeedState};

const NAV: [&str; 2] = ["Guests", "Settings"];
const COLS: [&str; 4] = ["Guest", "Role", "Status", "Joined"];

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x0: f32,
    y0: f32,
    vw: f32,
    vh: f32,
) {
    if seed.guests.is_empty() {
        seed.guests = crate::ui::starter_guests();
    }
    if seed.view_year < 1900 {
        seed.view_year = 2026;
        seed.view_month = 7;
    }
    seed.tab = seed.tab.min(seed.guests.len().saturating_sub(1) as u32);

    if seed.rain {
        crate::rain::enable(draw);
    }

    let wx = 24.0 + x0;
    let wy = 24.0 + y0;
    let ww = (vw - 48.0).max(520.0);
    let th = MD.height;
    let body_h = (vh - 48.0 - th).max(280.0);
    let (sw, _) = crate::sidebar::sidebar_size(&NAV, SidebarKind::Rail, SidebarSize::Md);

    pane(
        draw,
        wx - 8.0,
        wy - 8.0,
        ww + 16.0,
        th + body_h + 16.0,
        Glass::vanilla(),
    );

    let blocking = seed.dialog;
    let ptr_ui = if blocking {
        Pointer {
            pressed: false,
            released: false,
            down: false,
            ..ptr
        }
    } else {
        ptr
    };

    let _ = title_bar(
        draw,
        ptr_ui,
        motion,
        dt,
        wx,
        wy,
        ww,
        "Guests",
        TitleBarKind::Focused,
        TitleBarSize::Md,
        false,
    );

    let by = wy + th;

    let nav = seed.choice.min(1);
    if let Some(i) = sidebar(
        draw,
        ptr_ui,
        motion,
        dt,
        wx,
        by,
        &NAV,
        nav,
        SidebarKind::Rail,
        SidebarSize::Md,
        blocking,
    ) {
        seed.choice = i;
        seed.focus = 0;
        if i == 0 {
            sync_view_from_guest(seed);
        }
    }

    let cx = wx + sw;
    let cw = (ww - sw).max(200.0);
    let pad = MD.pad_x;
    let ix = cx + pad;
    let iy = by + pad;
    let iw = (cw - pad * 2.0).max(160.0);

    match nav {
        0 => guests_pane(draw, ptr_ui, motion, dt, seed, ix, iy, iw, body_h - pad * 2.0),
        _ => settings_pane(draw, ptr_ui, motion, dt, seed, ix, iy, iw),
    }

    if seed.dialog {
        let who = seed
            .guests
            .get(seed.tab as usize)
            .map(|g| {
                if g.name.is_empty() {
                    "this guest"
                } else {
                    g.name.as_str()
                }
            })
            .unwrap_or("this guest");
        let body = format!("Remove {who} from the list?");
        let ev = alert_dialog(
            draw,
            ptr,
            motion,
            dt,
            x0,
            y0,
            vw,
            vh,
            "Remove guest",
            &body,
            AlertDialogKind::Destructive,
            AlertDialogSize::Md,
            false,
            &mut seed.dialog_fresh,
            seed.dialog_leaving,
        );
        if ev.confirm {
            seed.toasts = 1;
        }
        alert_close(
            &mut seed.dialog,
            &mut seed.dialog_hold,
            &mut seed.dialog_leaving,
            ev,
            ptr,
        );
        if !seed.dialog && seed.toasts == 1 {
            seed.toasts = 0;
            remove_guest(seed);
        }
        if !seed.dialog {
            seed.toasts = 0;
        }
    }
}

fn guests_pane(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) {
    apply_guest_keys(draw, seed);
    cycle_guest_focus(seed);

    let n = seed.guests.len();
    let title = format!("{n} guests");
    draw.label(
        &title,
        x,
        y + (MD.height - 16.0) * 0.35,
        16.0,
        FG,
    );
    let add_x = x + title.chars().count() as f32 * 16.0 * MONO_ADVANCE + 12.0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        add_x,
        y,
        "Add",
        ButtonKind::Primary,
        ButtonSize::Sm,
        false,
    ) {
        add_guest(seed);
        seed.clicks += 1;
    }

    let y1 = y + MD.height + 8.0;
    let editor_w = crate::date_picker::width(DatePickerSize::Sm).max(240.0);
    let gap = 16.0;
    let side_by_side = w >= editor_w + gap + 280.0;
    let table_w = if side_by_side {
        (w - editor_w - gap).max(240.0)
    } else {
        w
    };
    let editor_x = if side_by_side {
        x + table_w + gap
    } else {
        x
    };
    let editor_y = if side_by_side {
        y1
    } else {
        y1 + table_h(n.max(1), TableSize::Sm) + 16.0
    };

    paint_table(draw, ptr, motion, dt, seed, x, y1, table_w);
    paint_editor(
        draw,
        ptr,
        motion,
        dt,
        seed,
        editor_x,
        editor_y,
        if side_by_side { editor_w } else { w },
        h - (editor_y - y),
    );
}

fn paint_table(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x: f32,
    y: f32,
    w: f32,
) {
    let n = seed.guests.len();
    let sort_col = if seed.value >= 1.0 {
        Some((seed.value as u32).saturating_sub(1).min(3))
    } else {
        None
    };
    let sort_desc = seed.on[5];
    let mut order: Vec<usize> = (0..n).collect();
    if let Some(c) = sort_col {
        let c = c as usize;
        order.sort_by(|&a, &b| {
            let av = cell(&seed.guests, a, c);
            let bv = cell(&seed.guests, b, c);
            let ord = av.cmp(&bv);
            if sort_desc {
                ord.reverse()
            } else {
                ord
            }
        });
    }
    let owned: Vec<[String; 4]> = order
        .iter()
        .map(|&i| {
            let g = &seed.guests[i];
            [
                display_name(&g.name),
                g.role.clone(),
                g.status.clone(),
                g.joined.clone(),
            ]
        })
        .collect();
    let rows: Vec<[&str; 4]> = owned
        .iter()
        .map(|r| [r[0].as_str(), r[1].as_str(), r[2].as_str(), r[3].as_str()])
        .collect();
    let row_refs: Vec<&[&str]> = rows.iter().map(|r| r.as_slice()).collect();
    let selected_vis = order
        .iter()
        .position(|&i| i == seed.tab as usize)
        .unwrap_or(0) as u32;
    let ev = table(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        &COLS,
        &row_refs,
        selected_vis,
        sort_col,
        sort_desc,
        seed.widths,
        TableKind::Well,
        TableSize::Sm,
        n == 0,
    );
    if let Some(i) = ev.row {
        if let Some(&src) = order.get(i as usize) {
            if seed.tab != src as u32 {
                seed.tab = src as u32;
                seed.focus = 0;
                seed.caret = 0;
                seed.sel = 0;
                sync_view_from_guest(seed);
            }
            seed.clicks += 1;
        }
    }
    if let Some(col) = ev.sort {
        let (next, desc) = next_sort(sort_col, sort_desc, col);
        seed.value = next.map(|c| (c + 1) as f32).unwrap_or(0.0);
        seed.on[5] = desc;
        seed.clicks += 1;
    }
    if let Some(ws) = ev.widths {
        seed.widths = ws;
    }
}

fn paint_editor(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x: f32,
    y: f32,
    w: f32,
    _h: f32,
) {
    if seed.guests.is_empty() {
        draw.label("No guests. Add one.", x, y, 14.0, MUTED);
        return;
    }
    let i = seed.tab as usize;
    let Some(g) = seed.guests.get(i) else {
        return;
    };
    let name = g.name.clone();
    let role = g.role.clone();
    let joined = g.joined.clone();
    let status = g.status.clone();
    let s = MD;
    let dp_w = crate::date_picker::width(DatePickerSize::Sm);
    let field_w = w.min(dp_w).max(160.0);
    let clock = seed.clock;
    let mut y = y;

    draw.label("Name", x, y, s.font, label_ink(seed.focus == 1));
    y += s.font + 4.0;
    if input_ex(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        field_w,
        &name,
        "Guest name",
        seed.focus == 1,
        clock,
        InputSize::Md,
        false,
        if seed.focus == 1 { seed.caret } else { name.chars().count() },
        if seed.focus == 1 { seed.sel } else { name.chars().count() },
    ) {
        seed.focus = 1;
        seed.caret = name.chars().count();
        seed.sel = seed.caret;
        seed.clicks += 1;
    }
    if seed.focus == 1 && ptr.hit(x, y, field_w, s.height) && (ptr.pressed || ptr.down) {
        let c = hit_caret(&name, s.font, x + s.pad_x, 0.0, ptr.x);
        seed.caret = c;
        if ptr.pressed && !seed.edit.shift {
            seed.sel = c;
        }
    }
    y += s.height + s.gap;

    draw.label("Role", x, y, s.font, label_ink(seed.focus == 2));
    y += s.font + 4.0;
    if input_ex(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        field_w,
        &role,
        "Role",
        seed.focus == 2,
        clock,
        InputSize::Md,
        false,
        if seed.focus == 2 { seed.caret } else { role.chars().count() },
        if seed.focus == 2 { seed.sel } else { role.chars().count() },
    ) {
        seed.focus = 2;
        seed.caret = role.chars().count();
        seed.sel = seed.caret;
        seed.clicks += 1;
    }
    if seed.focus == 2 && ptr.hit(x, y, field_w, s.height) && (ptr.pressed || ptr.down) {
        let c = hit_caret(&role, s.font, x + s.pad_x, 0.0, ptr.x);
        seed.caret = c;
        if ptr.pressed && !seed.edit.shift {
            seed.sel = c;
        }
    }
    y += s.height + s.gap;

    draw.label("Joined", x, y, s.font, label_ink(seed.focus == 3));
    y += s.font + 4.0;
    let parsed = parse_date(&joined);
    let day = parsed.day.unwrap_or(0);
    let mut fresh = seed.on[6];
    let ev = date_picker(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &joined,
        seed.view_month,
        day,
        seed.view_year,
        DatePickerSize::Sm,
        seed.on[2],
        seed.on[4],
        &mut fresh,
        seed.focus == 3,
        seed.on[7],
        clock,
        false,
    );
    seed.on[6] = fresh;
    if ev.opened || ev.focused {
        seed.focus = 3;
        seed.clicks += 1;
    }
    if let Some((m, d)) = ev.picked {
        seed.view_month = m;
        if let Some(g) = seed.guests.get_mut(seed.tab as usize) {
            g.joined = format_date(m, d, seed.view_year);
        }
        seed.on[7] = false;
        seed.clicks += 1;
    }
    if let Some(m) = ev.month {
        let (mm, yy) = if m == (seed.view_month + 1) % 12 {
            step_month(seed.view_month, seed.view_year, 1)
        } else {
            step_month(seed.view_month, seed.view_year, -1)
        };
        seed.view_month = mm;
        seed.view_year = yy;
        seed.clicks += 1;
    }
    if let Some(yy) = ev.year {
        seed.view_year = yy;
        seed.on[7] = false;
        seed.clicks += 1;
    }
    if ev.year_toggle {
        seed.on[7] = !seed.on[7];
        seed.clicks += 1;
    }
    let mut open = seed.on[2];
    let mut hold = seed.on[3];
    let mut leaving = seed.on[4];
    let mut fresh = seed.on[6];
    if ev.opened {
        open = true;
        hold = true;
        fresh = true;
        leaving = false;
    }
    date_close(&mut open, &mut hold, &mut leaving, ev, ptr);
    if seed.focus != 3 && open && !leaving {
        leaving = true;
    }
    seed.on[2] = open;
    seed.on[3] = hold;
    seed.on[4] = leaving;
    seed.on[6] = fresh;
    y += s.height + s.gap + 10.0;

    draw.label("Status", x, y, s.font, MUTED);
    y += s.font + 4.0;
    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        &status,
        ButtonKind::Outline,
        ButtonSize::Sm,
        false,
    ) {
        if let Some(g) = seed.guests.get_mut(seed.tab as usize) {
            g.status = next_status(&g.status).to_string();
        }
        seed.clicks += 1;
    }
    y += s.height + 14.0;

    if button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "Remove",
        ButtonKind::Outline,
        ButtonSize::Sm,
        seed.guests.is_empty(),
    ) {
        seed.open_dialog();
        seed.toasts = 0;
        seed.clicks += 1;
    }
}

fn settings_pane(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x: f32,
    y: f32,
    w: f32,
) {
    draw.label("Settings", x, y, 16.0, FG);
    let items = [
        ("Glyph rain", "Behind the pane", seed.rain, false),
        ("Caffeine", "Keep the GPU awake", seed.caffeine, false),
        ("Telemetry", "Off the record", true, true),
    ];
    if let Some(i) = settings(
        draw,
        ptr,
        motion,
        dt,
        x,
        y + 28.0,
        w,
        "",
        &items,
        u32::MAX,
        SettingsKind::Ghost,
        SettingsSize::Md,
        false,
    ) {
        match i {
            0 => seed.rain = !seed.rain,
            1 => seed.caffeine = !seed.caffeine,
            _ => {}
        }
        seed.clicks += 1;
    }
}

fn apply_guest_keys(draw: &mut DrawList, seed: &mut SeedState) {
    if seed.choice != 0 || seed.guests.is_empty() {
        return;
    }
    let i = seed.tab as usize;
    if i >= seed.guests.len() {
        return;
    }
    let edit = seed.edit.clone();
    let typed = seed.typed.clone();
    let backspace = seed.backspace;
    let mut caret = seed.caret;
    let mut sel = seed.sel;
    let mut copied = None;
    match seed.focus {
        1 => {
            if let Some(g) = seed.guests.get_mut(i) {
                copied = apply_edit(&mut g.name, &mut caret, &mut sel, &edit);
            }
        }
        2 => {
            if let Some(g) = seed.guests.get_mut(i) {
                copied = apply_edit(&mut g.role, &mut caret, &mut sel, &edit);
            }
        }
        3 => {
            if let Some(g) = seed.guests.get_mut(i) {
                apply_date_mask(&mut g.joined, &typed, backspace);
            }
        }
        _ => {}
    }
    seed.caret = caret;
    seed.sel = sel;
    if let Some(s) = copied {
        draw.copy_text = Some(s);
    }
}

fn cycle_guest_focus(seed: &mut SeedState) {
    let dir = seed.tab_dir as i32;
    seed.tab_dir = 0;
    if dir == 0 || seed.choice != 0 || seed.guests.is_empty() {
        return;
    }
    let stops = [1u32, 2, 3];
    let n = stops.len() as i32;
    let pos = stops.iter().position(|&id| seed.focus == id);
    let next = match pos {
        Some(i) => (i as i32 + dir).rem_euclid(n) as usize,
        None => {
            if dir > 0 {
                0
            } else {
                n as usize - 1
            }
        }
    };
    seed.focus = stops[next];
    seed.caret = end_of_focus(seed);
    seed.sel = seed.caret;
}

fn end_of_focus(seed: &SeedState) -> usize {
    let Some(g) = seed.guests.get(seed.tab as usize) else {
        return 0;
    };
    match seed.focus {
        1 => g.name.chars().count(),
        2 => g.role.chars().count(),
        3 => g.joined.chars().count(),
        _ => 0,
    }
}

fn add_guest(seed: &mut SeedState) {
    if let Some(last) = seed.guests.last() {
        if last.name.is_empty() {
            seed.tab = seed.guests.len() as u32 - 1;
            seed.focus = 1;
            seed.caret = 0;
            seed.sel = 0;
            return;
        }
    }
    seed.guests.push(Guest::new("", "Viewer", "Active", "08/24/2026"));
    seed.tab = seed.guests.len() as u32 - 1;
    seed.focus = 1;
    seed.caret = 0;
    seed.sel = 0;
    seed.view_month = 7;
    seed.view_year = 2026;
}

fn remove_guest(seed: &mut SeedState) {
    let i = seed.tab as usize;
    if i < seed.guests.len() {
        seed.guests.remove(i);
    }
    if seed.guests.is_empty() {
        seed.tab = 0;
        seed.focus = 0;
        return;
    }
    seed.tab = seed.tab.min(seed.guests.len() as u32 - 1);
    seed.focus = 0;
    sync_view_from_guest(seed);
}

fn sync_view_from_guest(seed: &mut SeedState) {
    let Some(g) = seed.guests.get(seed.tab as usize) else {
        return;
    };
    let p = parse_date(&g.joined);
    if let Some(m) = p.month {
        seed.view_month = m;
    }
    if let Some(y) = p.year {
        seed.view_year = y;
    }
}

fn cell(guests: &[Guest], i: usize, c: usize) -> String {
    let Some(g) = guests.get(i) else {
        return String::new();
    };
    match c {
        0 => display_name(&g.name),
        1 => g.role.clone(),
        2 => g.status.clone(),
        _ => g.joined.clone(),
    }
}

fn display_name(name: &str) -> String {
    if name.is_empty() {
        "untitled".into()
    } else {
        name.to_string()
    }
}

fn next_status(s: &str) -> &'static str {
    match s {
        "Active" => "Away",
        "Away" => "Paused",
        _ => "Active",
    }
}

fn label_ink(on: bool) -> [f32; 4] {
    if on {
        JADE
    } else {
        MUTED
    }
}
