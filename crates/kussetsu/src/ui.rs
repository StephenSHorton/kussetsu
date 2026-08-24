//! Widget façade. Agents copy `button.rs` / `switch.rs` / `dialog.rs`, not this file.

pub use crate::button::{button, ButtonKind, ButtonSize};
pub use crate::dialog::{apply_close, dialog, DialogEvent};
pub use crate::lens::{Lens, LensU, LensView};
pub use crate::glass::{Glass, pane as glass_pane};
pub use crate::draw::{DrawList, FrameU, Label, Motion, Pointer, Quad, UNIT_CORNERS};
pub use crate::switch::switch;

/// One frame of text-editing keys. Host fills this; widgets consume it.
#[derive(Clone, Debug, Default)]
pub struct EditKeys {
    pub typed: String,
    pub backspace: bool,
    pub delete: bool,
    pub left: bool,
    pub right: bool,
    pub up: bool,
    pub down: bool,
    pub home: bool,
    pub end: bool,
    pub select_all: bool,
    pub copy: bool,
    pub cut: bool,
    pub paste: bool,
    pub shift: bool,
    pub enter: bool,
    /// Paste payload from the host clipboard.
    pub clip: String,
}

use crate::button::button as draw_button;
use crate::tokens::{FG, MUTED};

pub struct SeedState {
    pub clicks: u32,
    pub rain: bool,
    pub caffeine: bool,
    pub dialog: bool,
    pub dialog_hold: bool,
    pub dialog_fresh: bool,
    pub dialog_leaving: bool,
    /// Shared playground for new stories (clock, toggles, choice, slider, tab).
    pub clock: f32,
    pub on: [bool; 8],
    pub choice: u32,
    pub value: f32,
    pub tab: u32,
    pub field: String,
    pub note: String,
    pub typed: String,
    pub backspace: bool,
    pub caret: usize,
    pub sel: usize,
    pub edit: EditKeys,
    pub wheel_taken: bool,
    /// +1 Tab, −1 Shift+Tab, 0 none. Stories call `tab_cycle` and it clears.
    pub tab_dir: i8,
    pub toasts: u8,
    pub toast_age: [f32; 3],
    /// Table column pixel widths. Zeros mean "auto".
    pub widths: [f32; 8],
    /// Shell Guests. Reset when the catalog changes slug.
    pub guests: Vec<Guest>,
    /// 0 none, 1 name, 2 role, 3 joined.
    pub focus: u32,
    pub view_month: u32,
    pub view_year: u32,
}

#[derive(Clone, Debug)]
pub struct Guest {
    pub name: String,
    pub role: String,
    pub status: String,
    pub joined: String,
}

impl Guest {
    pub fn new(name: &str, role: &str, status: &str, joined: &str) -> Self {
        Self {
            name: name.to_string(),
            role: role.to_string(),
            status: status.to_string(),
            joined: joined.to_string(),
        }
    }
}

pub fn starter_guests() -> Vec<Guest> {
    vec![
        Guest::new("Mori", "Owner", "Active", "03/12/2024"),
        Guest::new("Hana", "Editor", "Active", "06/02/2024"),
        Guest::new("Kenji", "Viewer", "Away", "11/18/2025"),
        Guest::new("Yuki", "Editor", "Active", "01/09/2026"),
        Guest::new("Aoi", "Viewer", "Paused", "08/01/2026"),
    ]
}

impl Default for SeedState {
    fn default() -> Self {
        Self {
            clicks: 0,
            rain: true,
            caffeine: true,
            dialog: false,
            dialog_hold: false,
            dialog_fresh: false,
            dialog_leaving: false,
            clock: 0.0,
            on: [false, true, false, true, false, false, true, false],
            choice: 0,
            value: 0.42,
            tab: 0,
            field: String::new(),
            note: String::new(),
            typed: String::new(),
            backspace: false,
            caret: 0,
            sel: 0,
            edit: EditKeys::default(),
            wheel_taken: false,
            tab_dir: 0,
            toasts: 0,
            toast_age: [0.0; 3],
            widths: [0.0; 8],
            guests: starter_guests(),
            focus: 0,
            view_month: 7,
            view_year: 2026,
        }
    }
}

impl SeedState {
    pub fn open_dialog(&mut self) {
        self.dialog = true;
        self.dialog_hold = true;
        self.dialog_fresh = true;
        self.dialog_leaving = false;
    }

    pub fn request_close_dialog(&mut self) {
        if self.dialog {
            self.dialog_leaving = true;
        }
    }

    /// Move `choice` through `stops`. Tab with nothing focused goes to the first stop.
    pub fn tab_cycle(&mut self, stops: &[u32]) {
        let dir = self.tab_dir as i32;
        self.tab_dir = 0;
        if dir == 0 || stops.is_empty() {
            return;
        }
        let n = stops.len() as i32;
        let pos = stops
            .iter()
            .position(|&id| self.on[0] && self.choice == id);
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
        self.on[0] = true;
        self.choice = stops[next];
    }
}

pub fn seed(draw: &mut DrawList, ptr: Pointer, vw: f32, y0: f32, state: &mut SeedState) {
    seed_at(draw, ptr, vw, 36.0, y0, state);
}

pub fn seed_at(
    draw: &mut DrawList,
    ptr: Pointer,
    vw: f32,
    x0: f32,
    y0: f32,
    state: &mut SeedState,
) {
    seed_at_motion(draw, ptr, &mut Motion::default(), 1.0 / 60.0, vw, x0, y0, state);
}

pub fn seed_at_motion(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    vw: f32,
    x0: f32,
    y0: f32,
    state: &mut SeedState,
) {
    draw.label("SEED", x0, y0, 12.0, MUTED);
    draw.label("Button · Switch · Dialog", x0, y0 + 20.0, 22.0, FG);
    draw.label(
        format!("Parent owns state. Clicks: {}", state.clicks),
        x0,
        y0 + 48.0,
        13.0,
        MUTED,
    );
    let mut x = x0;
    let y = y0 + 78.0;
    if draw_button(draw, ptr, motion, dt, x, y, "Primary", ButtonKind::Primary, ButtonSize::Md, false) {
        state.clicks += 1;
    }
    x += 108.0;
    if draw_button(draw, ptr, motion, dt, x, y, "Ghost", ButtonKind::Ghost, ButtonSize::Md, false) {
        state.clicks += 1;
    }
    x += 96.0;
    if draw_button(draw, ptr, motion, dt, x, y, "Outline", ButtonKind::Outline, ButtonSize::Md, false)
    {
        state.clicks += 1;
    }
    x += 108.0;
    let _ = draw_button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        "Disabled",
        ButtonKind::Primary,
        ButtonSize::Md,
        true,
    );
    x = x0;
    let y2 = y + 52.0;
    if draw_button(
        draw,
        ptr,
        motion,
        dt,
        x,
        y2,
        "Open dialog",
        ButtonKind::Primary,
        ButtonSize::Md,
        false,
    ) {
        state.open_dialog();
    }
    let y3 = y2 + 56.0;
    if crate::switch::switch(draw, ptr, motion, dt, x0, y3, state.caffeine, "Caffeine", false) {
        state.caffeine = !state.caffeine;
    }
    if crate::switch::switch(draw, ptr, motion, dt, x0, y3 + 36.0, state.rain, "Glyph rain", false)
    {
        state.rain = !state.rain;
    }
    let _ = vw;
}
