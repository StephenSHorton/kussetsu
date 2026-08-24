//! Kussetsu — Rust GPU UI. Native wgpu, WASM on the web.
//!
//! The marketing hero (giant GLASS + rotating rounded cube) lives here so the
//! site crate and a future wasm page share one shader.

pub const LAMPS_WGSL: &str = include_str!("shaders/lamps.wgsl");
pub const CUBE_WGSL: &str = include_str!("shaders/cube.wgsl");
pub const BLIT_WGSL: &str = include_str!("shaders/blit.wgsl");
pub const QUAD_WGSL: &str = include_str!("shaders/quad.wgsl");
pub const LENS_WGSL: &str = include_str!("shaders/lens.wgsl");
pub const GLASS_WGSL: &str = include_str!("shaders/glass.wgsl");
pub const RAIN_WGSL: &str = include_str!("shaders/rain.wgsl");

pub mod accordion;
pub mod alert;
pub mod alert_dialog;
pub mod avatar;
pub mod badge;
pub mod breadcrumb;
pub mod button;
pub mod calendar;
pub mod catalog;
pub mod checkbox;
pub mod clipboard;
pub mod collapsible;
pub mod color_picker;
pub mod combobox;
pub mod date_picker;
pub mod description_list;
pub mod dialog;
pub mod draw;
pub mod dropdown_button;
pub mod field_label;
pub mod form;
pub mod glass;
pub mod group_box;
pub mod hover_card;
pub mod icon;
pub mod image;
pub mod input;
pub mod kbd;
pub mod lens;
pub mod link;
pub mod list;
pub mod menu;
pub mod notification;
pub mod number_input;
pub mod otp_input;
pub mod pagination;
pub mod popover;
pub mod progress;
pub mod radio;
pub mod rain;

pub mod resizable;
pub mod scrollbar;
pub mod select;
pub mod separator;
pub mod settings;
pub mod shell;
pub mod sheet;
pub mod sidebar;
pub mod skeleton;
pub mod slider;
pub mod spinner;
pub mod status_bar;
pub mod stepper;
pub mod switch;
pub mod table;
pub mod tabs;
pub mod tag;
pub mod textarea;
pub mod title_bar;
pub mod toggle;
pub mod tokens;
pub mod tooltip;
pub mod tree;
pub mod ui;
pub mod virtual_list;

/// Fullscreen-quad vertex (pos.xy clip, uv.zw).
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct VsIn {
    pub pos: [f32; 2],
    pub uv: [f32; 2],
}

pub const QUAD: [VsIn; 6] = [
    VsIn { pos: [-1.0, -1.0], uv: [0.0, 1.0] },
    VsIn { pos: [1.0, -1.0], uv: [1.0, 1.0] },
    VsIn { pos: [-1.0, 1.0], uv: [0.0, 0.0] },
    VsIn { pos: [-1.0, 1.0], uv: [0.0, 0.0] },
    VsIn { pos: [1.0, -1.0], uv: [1.0, 1.0] },
    VsIn { pos: [1.0, 1.0], uv: [1.0, 0.0] },
];

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct LampsU {
    pub res: [f32; 4],    // xy css size
    pub scroll: [f32; 4], // x = scroll
}

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct CubeU {
    pub res: [f32; 4],  // xy size, z unused, w time seconds
    pub rect: [f32; 4], // cube x y w h in css px
    pub c0: [f32; 4],   // enabled, refraction, dispersion, tint
    pub c1: [f32; 4],   // specular, rim, brighten, blur
    pub c2: [f32; 4],   // tint rgb
}

impl CubeU {
    pub fn baked(width: f32, height: f32, time: f32, cube: [f32; 4]) -> Self {
        Self {
            res: [width, height, 0.0, time],
            rect: cube,
            c0: [0.0, 0.10, 0.06, 0.05],
            c1: [0.12, 16.0, 1.04, 0.0],
            c2: [0.72, 0.82, 1.0, 0.0],
        }
    }
}
