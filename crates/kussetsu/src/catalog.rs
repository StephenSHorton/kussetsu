//! Catalog registry + stories. One source of truth for the rail and the GPU stage.

use crate::tokens::{self, FG, INK, JADE, JADE_DIM, MUTED, WELL};
use crate::button::{ButtonKind, ButtonSize};
use crate::draw::{DrawList, Motion, Pointer};
use crate::input::{input, InputSize};
use crate::ui::{self, SeedState, button, dialog, switch};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Done,
    Wip,
    Todo,
}

#[derive(Clone, Copy, Debug)]
pub struct Entry {
    pub slug: &'static str,
    pub name: &'static str,
    pub group: &'static str,
    pub blurb: &'static str,
    pub status: Status,
}

pub const CATALOG: &[Entry] = &[
    Entry { slug: "welcome", name: "Welcome", group: "Overview", status: Status::Done, blurb: "The seed: Button, Switch, Dialog. Everything else copies these." },
    Entry { slug: "shell", name: "Shell", group: "Overview", status: Status::Done, blurb: "Guests window. Table, form, date, confirm." },
    Entry { slug: "theme", name: "Theme", group: "Foundation", status: Status::Done, blurb: "Inkstone tokens. Not a widget." },
    Entry { slug: "glass", name: "Glass", group: "Foundation", status: Status::Done, blurb: "Suzuri IOR compositor. Vanilla / dense / prism / frost." },
    Entry { slug: "lens", name: "Lens", group: "Foundation", status: Status::Done, blurb: "Cursor magnifier. Pinch or ⌃/⌘+scroll — keep going to grow it." },
    Entry { slug: "rain", name: "Rain", group: "Foundation", status: Status::Done, blurb: "Suzuri glyph rain. Backdrop for glass." },
    Entry { slug: "button", name: "Button", group: "Actions", status: Status::Done, blurb: "Stateless click. variant, size, disabled." },
    Entry { slug: "dropdown-button", name: "Dropdown Button", group: "Actions", status: Status::Done, blurb: "Button + Menu." },
    Entry { slug: "toggle", name: "Toggle", group: "Actions", status: Status::Done, blurb: "Pressed button group." },
    Entry { slug: "icon", name: "Icon", group: "Actions", status: Status::Done, blurb: "SVG set." },
    Entry { slug: "kbd", name: "Kbd", group: "Actions", status: Status::Done, blurb: "Shortcut chip." },
    Entry { slug: "label", name: "Label", group: "Actions", status: Status::Done, blurb: "Field label." },
    Entry { slug: "separator", name: "Separator", group: "Actions", status: Status::Done, blurb: "Hairline rule." },
    Entry { slug: "tag", name: "Tag", group: "Actions", status: Status::Done, blurb: "Chip. Copy Button." },
    Entry { slug: "badge", name: "Badge", group: "Actions", status: Status::Done, blurb: "Count / status mark." },
    Entry { slug: "spinner", name: "Spinner", group: "Actions", status: Status::Done, blurb: "Indeterminate wait." },
    Entry { slug: "skeleton", name: "Skeleton", group: "Actions", status: Status::Done, blurb: "Loading stand-in." },
    Entry { slug: "tooltip", name: "Tooltip", group: "Actions", status: Status::Done, blurb: "Hover hint." },
    Entry { slug: "link", name: "Link", group: "Actions", status: Status::Done, blurb: "Text link." },
    Entry { slug: "input", name: "Input", group: "Forms", status: Status::Done, blurb: "One text engine." },
    Entry { slug: "textarea", name: "Textarea", group: "Forms", status: Status::Done, blurb: "Same engine, multiline." },
    Entry { slug: "number-input", name: "Number Input", group: "Forms", status: Status::Done, blurb: "Numeric stepper." },
    Entry { slug: "otp-input", name: "OTP Input", group: "Forms", status: Status::Done, blurb: "Digit cells." },
    Entry { slug: "checkbox", name: "Checkbox", group: "Forms", status: Status::Done, blurb: "Copy Switch." },
    Entry { slug: "radio", name: "Radio", group: "Forms", status: Status::Done, blurb: "Copy Switch." },
    Entry { slug: "switch", name: "Switch", group: "Forms", status: Status::Done, blurb: "Controlled boolean." },
    Entry { slug: "slider", name: "Slider", group: "Forms", status: Status::Done, blurb: "Copy Switch’s spring." },
    Entry { slug: "select", name: "Select", group: "Forms", status: Status::Done, blurb: "Copy Dialog + list." },
    Entry { slug: "combobox", name: "Combobox", group: "Forms", status: Status::Done, blurb: "Input + list." },
    Entry { slug: "color-picker", name: "Color Picker", group: "Forms", status: Status::Done, blurb: "Jade / theme." },
    Entry { slug: "form", name: "Form", group: "Forms", status: Status::Done, blurb: "Layout + labels." },
    Entry { slug: "settings", name: "Settings", group: "Forms", status: Status::Done, blurb: "Pref rows of Switch. Not a window." },
    Entry { slug: "clipboard", name: "Clipboard", group: "Forms", status: Status::Done, blurb: "Copy affordance." },
    Entry { slug: "dialog", name: "Dialog", group: "Overlays", status: Status::Done, blurb: "open + onOpenChange. Escape, scrim." },
    Entry { slug: "alert-dialog", name: "Alert Dialog", group: "Overlays", status: Status::Done, blurb: "Copy Dialog." },
    Entry { slug: "alert", name: "Alert", group: "Overlays", status: Status::Done, blurb: "Inline, not modal." },
    Entry { slug: "sheet", name: "Sheet", group: "Overlays", status: Status::Done, blurb: "Copy Dialog." },
    Entry { slug: "popover", name: "Popover", group: "Overlays", status: Status::Done, blurb: "Copy Dialog." },
    Entry { slug: "hover-card", name: "Hover Card", group: "Overlays", status: Status::Done, blurb: "Copy Dialog." },
    Entry { slug: "menu", name: "Menu", group: "Overlays", status: Status::Done, blurb: "Arrows, Enter, submenu." },
    Entry { slug: "notification", name: "Notification", group: "Overlays", status: Status::Done, blurb: "Toast." },
    Entry { slug: "tabs", name: "Tabs", group: "Navigation", status: Status::Done, blurb: "Melts into the well." },
    Entry { slug: "sidebar", name: "Sidebar", group: "Navigation", status: Status::Done, blurb: "Workspace channels." },
    Entry { slug: "breadcrumb", name: "Breadcrumb", group: "Navigation", status: Status::Done, blurb: "Path." },
    Entry { slug: "pagination", name: "Pagination", group: "Navigation", status: Status::Done, blurb: "Pages." },
    Entry { slug: "status-bar", name: "Status Bar", group: "Navigation", status: Status::Done, blurb: "Footer dots." },
    Entry { slug: "stepper", name: "Stepper", group: "Navigation", status: Status::Done, blurb: "Steps." },
    Entry { slug: "accordion", name: "Accordion", group: "Navigation", status: Status::Done, blurb: "Expand." },
    Entry { slug: "collapsible", name: "Collapsible", group: "Navigation", status: Status::Done, blurb: "Single fold." },
    Entry { slug: "group-box", name: "Group Box", group: "Navigation", status: Status::Done, blurb: "Fieldset." },
    Entry { slug: "avatar", name: "Avatar", group: "Navigation", status: Status::Done, blurb: "Face / initials." },
    Entry { slug: "list", name: "List", group: "Collections", status: Status::Done, blurb: "Notes / guests." },
    Entry { slug: "virtual-list", name: "Virtual List", group: "Collections", status: Status::Done, blurb: "Visible range only." },
    Entry { slug: "table", name: "Table", group: "Collections", status: Status::Done, blurb: "Sort + resize." },
    Entry { slug: "data-table", name: "Data Table", group: "Collections", status: Status::Todo, blurb: "Last." },
    Entry { slug: "tree", name: "Tree", group: "Collections", status: Status::Done, blurb: "Hierarchy." },
    Entry { slug: "description-list", name: "Description List", group: "Collections", status: Status::Done, blurb: "Key / value." },
    Entry { slug: "resizable", name: "Resizable", group: "Window", status: Status::Done, blurb: "Splits." },
    Entry { slug: "scrollbar", name: "Scrollbar", group: "Window", status: Status::Done, blurb: "Overflow chrome." },
    Entry { slug: "native-menu", name: "Native Menu", group: "Window", status: Status::Todo, blurb: "Desktop only." },
    Entry { slug: "title-bar", name: "Title Bar", group: "Window", status: Status::Done, blurb: "Host chrome." },
    Entry { slug: "calendar", name: "Calendar", group: "Content", status: Status::Done, blurb: "Month grid." },
    Entry { slug: "date-picker", name: "Date Picker", group: "Content", status: Status::Done, blurb: "Calendar + input." },
    Entry { slug: "chart", name: "Chart", group: "Content", status: Status::Todo, blurb: "After the kit." },
    Entry { slug: "editor", name: "Editor", group: "Content", status: Status::Todo, blurb: "Not the PTY." },
    Entry { slug: "image", name: "Image", group: "Content", status: Status::Done, blurb: "GPU atlas." },
    Entry { slug: "progress", name: "Progress", group: "Content", status: Status::Done, blurb: "Transfer bar." },

];

pub fn story_ticks(slug: &str, seed: &SeedState) -> bool {
    seed.dialog
        || seed.dialog_leaving
        || matches!(
            slug,
            "spinner"
                | "skeleton"
                | "clipboard"
                | "progress"
                | "notification"
                | "tooltip"
                | "input"
                | "textarea"
                | "glass"
                | "shell"
                | "rain"
                | "date-picker"
        )
}

pub fn overlay_slug(slug: &str) -> bool {
    matches!(
        slug,
        "select"
            | "dropdown-button"
            | "combobox"
            | "popover"
            | "hover-card"
            | "menu"
            | "notification"
            | "tooltip"
            | "date-picker"
    )
}

pub fn find(slug: &str) -> &'static Entry {
    CATALOG.iter().find(|e| e.slug == slug).unwrap_or(&CATALOG[0])
}

pub fn paint(
    draw: &mut DrawList,
    ptr: Pointer,
    vw: f32,
    vh: f32,
    slug: &str,
    seed: &mut SeedState,
    motion: &mut Motion,
    dt: f32,
    x0: f32,
    y0: f32,
) {
    seed.clock = (seed.clock + dt) % 1000.0;
    // Glyph rain is the Suzuri backdrop. Shell owns its own toggle.
    if slug != "shell" {
        crate::rain::enable(draw);
    }
    match slug {
        "shell" => crate::shell::story(draw, ptr, motion, dt, seed, x0, y0, vw, vh),
        "welcome" => {
            ui::seed_at_motion(draw, ptr, motion, dt, vw, 36.0 + x0, 36.0 + y0, seed);
            if seed.dialog {
                let ev = dialog(
                    draw,
                    ptr,
                    motion,
                    dt,
                    x0 + vw,
                    y0 + vh,
                    "Settings",
                    "Escape, scrim, Cancel, or Done. Values stay in the parent.",
                    &mut seed.dialog_fresh,
                    seed.dialog_leaving,
                );
                ui::apply_close(
                    &mut seed.dialog,
                    &mut seed.dialog_hold,
                    &mut seed.dialog_leaving,
                    ev,
                    ptr,
                );
            }
        }
        "button" => story_button(draw, ptr, motion, dt, seed, x0, y0),
        "switch" => story_switch(draw, ptr, motion, dt, seed, x0, y0),
        "dialog" => story_dialog(draw, ptr, motion, dt, x0 + vw, y0 + vh, seed, x0, y0),
        "theme" => story_theme(draw, x0, y0),
        "lens" => story_lens(draw, x0, y0),
        "glass" => crate::glass::story(draw, ptr, motion, dt, seed, x0, y0),
        "rain" => crate::rain::story(draw, ptr, motion, dt, seed, x0, y0),
        "dropdown-button" => crate::dropdown_button::story(draw, ptr, motion, dt, seed, x0, y0),
        "toggle" => crate::toggle::story(draw, ptr, motion, dt, seed, x0, y0),
        "icon" => crate::icon::story(draw, ptr, motion, dt, seed, x0, y0),
        "kbd" => crate::kbd::story(draw, ptr, motion, dt, seed, x0, y0),
        "label" => crate::field_label::story(draw, ptr, motion, dt, seed, x0, y0),
        "separator" => crate::separator::story(draw, ptr, motion, dt, seed, x0, y0),
        "tag" => crate::tag::story(draw, ptr, motion, dt, seed, x0, y0),
        "badge" => crate::badge::story(draw, ptr, motion, dt, seed, x0, y0),
        "spinner" => crate::spinner::story(draw, ptr, motion, dt, seed, x0, y0),
        "skeleton" => crate::skeleton::story(draw, ptr, motion, dt, seed, x0, y0),
        "tooltip" => crate::tooltip::story(draw, ptr, motion, dt, seed, x0, y0),
        "link" => crate::link::story(draw, ptr, motion, dt, seed, x0, y0),
        "input" => crate::input::story(draw, ptr, motion, dt, seed, x0, y0),
        "textarea" => crate::textarea::story(draw, ptr, motion, dt, seed, x0, y0),
        "number-input" => crate::number_input::story(draw, ptr, motion, dt, seed, x0, y0),
        "otp-input" => crate::otp_input::story(draw, ptr, motion, dt, seed, x0, y0),
        "checkbox" => crate::checkbox::story(draw, ptr, motion, dt, seed, x0, y0),
        "radio" => crate::radio::story(draw, ptr, motion, dt, seed, x0, y0),
        "slider" => crate::slider::story(draw, ptr, motion, dt, seed, x0, y0),
        "select" => crate::select::story(draw, ptr, motion, dt, seed, x0, y0),
        "combobox" => crate::combobox::story(draw, ptr, motion, dt, seed, x0, y0),
        "color-picker" => crate::color_picker::story(draw, ptr, motion, dt, seed, x0, y0),
        "form" => crate::form::story(draw, ptr, motion, dt, seed, x0, y0),
        "clipboard" => crate::clipboard::story(draw, ptr, motion, dt, seed, x0, y0),
        "alert-dialog" => crate::alert_dialog::story(draw, ptr, motion, dt, seed, x0, y0),
        "alert" => crate::alert::story(draw, ptr, motion, dt, seed, x0, y0),
        "sheet" => crate::sheet::story(draw, ptr, motion, dt, seed, x0, y0, x0 + vw, y0 + vh),
        "popover" => crate::popover::story(draw, ptr, motion, dt, seed, x0, y0),
        "hover-card" => crate::hover_card::story(draw, ptr, motion, dt, seed, x0, y0),
        "menu" => crate::menu::story(draw, ptr, motion, dt, seed, x0, y0, x0 + vw, y0 + vh),
        "notification" => crate::notification::story(draw, ptr, motion, dt, seed, x0, y0),
        "tabs" => crate::tabs::story(draw, ptr, motion, dt, seed, x0, y0),
        "sidebar" => crate::sidebar::story(draw, ptr, motion, dt, seed, x0, y0),
        "breadcrumb" => crate::breadcrumb::story(draw, ptr, motion, dt, seed, x0, y0),
        "pagination" => crate::pagination::story(draw, ptr, motion, dt, seed, x0, y0),
        "status-bar" => crate::status_bar::story(draw, ptr, motion, dt, seed, x0, y0),
        "stepper" => crate::stepper::story(draw, ptr, motion, dt, seed, x0, y0),
        "accordion" => crate::accordion::story(draw, ptr, motion, dt, seed, x0, y0),
        "collapsible" => crate::collapsible::story(draw, ptr, motion, dt, seed, x0, y0),
        "group-box" => crate::group_box::story(draw, ptr, motion, dt, seed, x0, y0),
        "avatar" => crate::avatar::story(draw, ptr, motion, dt, seed, x0, y0),
        "list" => crate::list::story(draw, ptr, motion, dt, seed, x0, y0),
        "virtual-list" => crate::virtual_list::story(draw, ptr, motion, dt, seed, x0, y0),
        "tree" => crate::tree::story(draw, ptr, motion, dt, seed, x0, y0),
        "table" => crate::table::story(draw, ptr, motion, dt, seed, x0, y0),
        "description-list" => crate::description_list::story(draw, ptr, motion, dt, seed, x0, y0),
        "resizable" => crate::resizable::story(draw, ptr, motion, dt, seed, x0, y0),
        "scrollbar" => crate::scrollbar::story(draw, ptr, motion, dt, seed, x0, y0),
        "settings" => crate::settings::story(draw, ptr, motion, dt, seed, x0, y0),
        "title-bar" => crate::title_bar::story(draw, ptr, motion, dt, seed, x0, y0),
        "calendar" => crate::calendar::story(draw, ptr, motion, dt, seed, x0, y0),
        "date-picker" => crate::date_picker::story(draw, ptr, motion, dt, seed, x0, y0),
        "image" => crate::image::story(draw, ptr, motion, dt, seed, x0, y0),
        "progress" => crate::progress::story(draw, ptr, motion, dt, seed, x0, y0),

        _ => {
            let e = find(slug);
            draw.label(e.name, 36.0 + x0, 36.0 + y0, 28.0, FG);
            draw.label(e.blurb, 36.0 + x0, 76.0 + y0, 14.0, MUTED);
            draw.label(
                "Not built. Copy Button, Switch, or Dialog — then mark Done in the registry.",
                36.0 + x0,
                104.0 + y0,
                14.0,
                MUTED,
            );
        }
    }
}

fn story_button(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x0: f32,
    y0: f32,
) {
    draw.label(format!("onClick fired {} times", seed.clicks), 36.0 + x0, 36.0 + y0, 14.0, MUTED);
    let y = 72.0 + y0;
    let mut x = 36.0 + x0;
    if button(draw, ptr, motion, dt, x, y, "Primary", ButtonKind::Primary, ButtonSize::Md, false) {
        seed.clicks += 1;
    }
    x += 108.0;
    if button(draw, ptr, motion, dt, x, y, "Ghost", ButtonKind::Ghost, ButtonSize::Md, false) {
        seed.clicks += 1;
    }
    x += 96.0;
    if button(draw, ptr, motion, dt, x, y, "Outline", ButtonKind::Outline, ButtonSize::Md, false) {
        seed.clicks += 1;
    }
    x += 108.0;
    let _ = button(draw, ptr, motion, dt, x, y, "Disabled", ButtonKind::Primary, ButtonSize::Md, true);
    x = 36.0 + x0;
    let y2 = y + 52.0;
    if button(draw, ptr, motion, dt, x, y2, "Small", ButtonKind::Ghost, ButtonSize::Sm, false) {
        seed.clicks += 1;
    }
    x += 88.0;
    if button(draw, ptr, motion, dt, x, y2, "Medium", ButtonKind::Primary, ButtonSize::Md, false) {
        seed.clicks += 1;
    }
    x += 118.0;
    if button(draw, ptr, motion, dt, x, y2, "Large", ButtonKind::Primary, ButtonSize::Lg, false) {
        seed.clicks += 1;
    }
}

fn story_switch(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut SeedState,
    x0: f32,
    y0: f32,
) {
    draw.label("Parent owns each boolean.", 36.0 + x0, 36.0 + y0, 14.0, MUTED);
    if switch(draw, ptr, motion, dt, 36.0 + x0, 72.0 + y0, seed.rain, "Glyph rain", false) {
        seed.rain = !seed.rain;
    }
    if switch(draw, ptr, motion, dt, 36.0 + x0, 108.0 + y0, seed.caffeine, "Caffeine", false) {
        seed.caffeine = !seed.caffeine;
    }
    let _ = switch(draw, ptr, motion, dt, 36.0 + x0, 144.0 + y0, false, "Disabled", true);
}

fn story_dialog(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    vw: f32,
    vh: f32,
    seed: &mut SeedState,
    x0: f32,
    y0: f32,
) {
    draw.label("Escape, scrim, Cancel, or Done. Values stay in the parent.", 36.0 + x0, 36.0 + y0, 14.0, MUTED);
    if button(
        draw,
        ptr,
        motion,
        dt,
        36.0 + x0,
        72.0 + y0,
        "Open settings",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) {
        seed.open_dialog();
    }
    if seed.dialog {
        let ev = dialog(
            draw,
            ptr,
            motion,
            dt,
            vw,
            vh,
            "Settings",
            "The same Switch as the Switch story.",
            &mut seed.dialog_fresh,
            seed.dialog_leaving,
        );
        ui::apply_close(
            &mut seed.dialog,
            &mut seed.dialog_hold,
            &mut seed.dialog_leaving,
            ev,
            ptr,
        );
    }
}

fn story_lens(draw: &mut DrawList, x0: f32, y0: f32) {
    draw.label("Magnifying glass", 36.0 + x0, 36.0 + y0, 22.0, FG);
    draw.label(
        "Pinch, or hold ⌃ / ⌘ and scroll. The bubble follows the cursor.",
        36.0 + x0,
        72.0 + y0,
        14.0,
        MUTED,
    );
    draw.label(
        "Keep scrolling to grow it — radius and zoom both climb well past Suzuri’s old cap.",
        36.0 + x0,
        96.0 + y0,
        14.0,
        MUTED,
    );
    draw.label("Escape collapses the bubble.", 36.0 + x0, 128.0 + y0, 13.0, MUTED);
}

fn story_theme(draw: &mut DrawList, x0: f32, y0: f32) {
    draw.label("Inkstone", 36.0 + x0, 36.0 + y0, 22.0, FG);
    let swatches = [
        ("ink", INK),
        ("well", WELL),
        ("fg", FG),
        ("muted", MUTED),
        ("jade", JADE),
        ("jadeDim", JADE_DIM),
        ("border", tokens::BORDER),
    ];
    for (i, (name, c)) in swatches.iter().enumerate() {
        let x = 36.0 + x0 + (i as f32) * 88.0;
        draw.quad(x, 80.0 + y0, 72.0, 72.0, *c, 12.0, 1.0);
        draw.label(*name, x, 160.0 + y0, 12.0, MUTED);
    }
}

pub const RAIL_W: f32 = 268.0;
pub const HEAD_H: f32 = 108.0;
const RAIL_ROW: f32 = 26.0;
const RAIL_LIST_TOP: f32 = 96.0;

fn entry_matches(e: &Entry, query: &str) -> bool {
    let q = query.trim();
    if q.is_empty() {
        return true;
    }
    let q = q.to_ascii_lowercase();
    e.name.to_ascii_lowercase().contains(&q)
        || e.slug.contains(&q)
        || e.group.to_ascii_lowercase().contains(&q)
        || e.blurb.to_ascii_lowercase().contains(&q)
}

pub fn first_match(query: &str) -> Option<&'static str> {
    CATALOG
        .iter()
        .find(|e| entry_matches(e, query))
        .map(|e| e.slug)
}

#[derive(Clone, Copy, Debug, Default)]
pub struct RailNav {
    pub slug: Option<&'static str>,
    pub search_focus: Option<bool>,
}

pub fn native_header(draw: &mut DrawList, x0: f32, w: f32, slug: &str) {
    let e = find(slug);
    draw.quad(x0, 0.0, w, HEAD_H, tokens::INK, 0.0, 1.0);
    draw.quad(x0, HEAD_H - 1.0, w, 1.0, tokens::BORDER, 0.0, 1.0);
    draw.label_serif(e.name, x0 + 28.0, 20.0, 28.0, FG);
    draw.label(e.blurb, x0 + 28.0, 56.0, 13.0, MUTED);
    let pill = match e.status {
        Status::Done => "done",
        Status::Wip => "wip",
        Status::Todo => "todo",
    };
    draw.label(pill, x0 + 28.0, 80.0, 11.0, match e.status {
        Status::Done => JADE,
        Status::Wip => [0.77, 0.47, 0.28, 1.0],
        Status::Todo => MUTED,
    });
}

pub fn native_rail(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    h: f32,
    slug: &str,
    scroll: f32,
    query: &str,
    search_focus: bool,
    clock: f32,
) -> RailNav {
    const ROW: f32 = RAIL_ROW;
    const TOP: f32 = RAIL_LIST_TOP;
    let bg = [0.027, 0.047, 0.035, 1.0];
    draw.quad(0.0, 0.0, RAIL_W, h, bg, 0.0, 1.0);
    let mut y = TOP - scroll;
    let mut nav = RailNav::default();
    let mut last_group = "";
    let mut shown = 0u32;
    for e in CATALOG {
        if !entry_matches(e, query) {
            continue;
        }
        shown += 1;
        if e.group != last_group {
            last_group = e.group;
            if y + ROW >= TOP && y <= h {
                draw.label(e.group, 20.0, y + 6.0, 11.0, MUTED);
            }
            y += ROW;
        }
        if y + ROW < TOP {
            y += ROW;
            continue;
        }
        if y > h {
            break;
        }
        let hot = ptr.hit(8.0, y - 2.0, RAIL_W - 16.0, ROW);
        let on = e.slug == slug;
        if on {
            draw.quad(10.0, y - 2.0, RAIL_W - 20.0, ROW - 2.0, JADE_DIM, 7.0, 1.0);
        } else if hot {
            draw.quad(10.0, y - 2.0, RAIL_W - 20.0, ROW - 2.0, WELL, 7.0, 1.0);
        }
        let color = match e.status {
            Status::Done => JADE,
            Status::Wip => [0.77, 0.47, 0.28, 1.0],
            Status::Todo => MUTED,
        };
        draw.quad(18.0, y + 7.0, 6.0, 6.0, color, 3.0, 1.0);
        draw.label(e.name, 32.0, y + 4.0, 13.0, if on { JADE } else { FG });
        if hot && (ptr.pressed || ptr.released) {
            nav.slug = Some(e.slug);
        }
        y += ROW;
    }
    if shown == 0 {
        draw.label("No matches", 20.0, TOP + 10.0, 13.0, MUTED);
    }

    draw.quad(0.0, 0.0, RAIL_W, TOP, bg, 0.0, 1.0);
    draw.label_serif("屈折", 20.0, 12.0, 22.0, FG);
    draw.label("kussetsu / ui", 20.0, 38.0, 11.0, MUTED);
    let sx = 12.0;
    let sy = 58.0;
    let sw = RAIL_W - 24.0;
    let sh = InputSize::Sm.metrics().height;
    let search_hot = ptr.hit(sx, sy, sw, sh);
    if input(
        draw,
        ptr,
        motion,
        dt,
        sx,
        sy,
        sw,
        query,
        "Search",
        search_focus,
        clock,
        InputSize::Sm,
        false,
    ) || (search_hot && ptr.pressed)
    {
        nav.search_focus = Some(true);
    } else if ptr.pressed && ptr.x >= 0.0 && ptr.x < RAIL_W && !search_hot {
        nav.search_focus = Some(false);
    }
    if nav.slug.is_some() {
        nav.search_focus = Some(false);
    }
    draw.quad(RAIL_W - 1.0, 0.0, 1.0, h, tokens::BORDER, 0.0, 1.0);
    nav
}

pub fn rail_max_scroll(h: f32, query: &str) -> f32 {
    let mut n = 0.0;
    let mut groups = 0.0;
    let mut last = "";
    for e in CATALOG {
        if !entry_matches(e, query) {
            continue;
        }
        if e.group != last {
            last = e.group;
            groups += 1.0;
        }
        n += 1.0;
    }
    let content = RAIL_LIST_TOP + n * RAIL_ROW + groups * RAIL_ROW;
    (content - h).max(0.0)
}
