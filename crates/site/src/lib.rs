//! Native + WASM Kussetsu main page — the GLASS cube hero.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

static CATALOG_MODE: AtomicBool = AtomicBool::new(false);

mod rain_atlas;

use fontdb::Source;
use glyphon::{
    Attrs, Buffer, Cache, Color, ColorMode, Family, FontSystem, Metrics, Resolution, Shaping,
    SwashCache, TextArea, TextAtlas, TextBounds, TextRenderer, Viewport, Weight,
};
use kussetsu::glass::GlassU;
use kussetsu::lens::{Lens, LensU};
use kussetsu::ui::{
    self, DrawList, EditKeys, FrameU, Motion, Pointer, Quad, SeedState, UNIT_CORNERS,
};
use kussetsu::{
    BLIT_WGSL, CUBE_WGSL, CubeU, GLASS_WGSL, LAMPS_WGSL, LENS_WGSL, RAIN_WGSL, LampsU, QUAD,
    QUAD_WGSL, VsIn,
};

const MAX_QUADS: usize = 512;
const MAX_LABELS: usize = 256;
use web_time::Instant;
use wgpu::util::DeviceExt;
use winit::application::ApplicationHandler;
use winit::event::{MouseScrollDelta, WindowEvent};
use winit::keyboard::ModifiersState;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowId};

fn write_clip(s: &str, buf: &mut String) {
    *buf = s.to_string();
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Ok(mut c) = arboard::Clipboard::new() {
            let _ = c.set_text(s.to_string());
        }
    }
}

fn read_clip(buf: &str) -> String {
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Ok(mut c) = arboard::Clipboard::new() {
            if let Ok(t) = c.get_text() {
                if !t.is_empty() {
                    return t;
                }
            }
        }
    }
    buf.to_string()
}

const INTER_BOLD: &[u8] = include_bytes!("../fonts/Inter-Bold.ttf");
const PLEX_MONO: &[u8] = include_bytes!("../fonts/IBMPlexMono-Regular.ttf");
const PLEX_MONO_MED: &[u8] = include_bytes!("../fonts/IBMPlexMono-Medium.ttf");
const SHIPPORI: &[u8] = include_bytes!("../fonts/ShipporiMincho-Bold-subset.ttf");

/// Titles and the 屈折 wordmark: Shippori Mincho Bold.
/// Body/rail: IBM Plex Mono. Named families — not generic Serif/Monospace —
/// so wasm and native cannot pick different faces.
fn ui_attrs(serif: bool) -> Attrs<'static> {
    Attrs::new()
        .family(if serif {
            Family::Name("Shippori Mincho")
        } else {
            Family::Name("IBM Plex Mono")
        })
        .weight(if serif { Weight::BOLD } else { Weight::NORMAL })
}

fn clip_quads(n: usize) -> usize {
    if n > MAX_QUADS {
        let msg = format!("kussetsu: clipped {} quads (cap {MAX_QUADS})", n - MAX_QUADS);
        eprintln!("{msg}");
        #[cfg(target_arch = "wasm32")]
        web_sys::console::warn_1(&msg.into());
    }
    n.min(MAX_QUADS)
}

fn clip_labels(n: usize, cap: usize) -> usize {
    if n > cap {
        let msg = format!("kussetsu: clipped {} labels (cap {cap})", n - cap);
        eprintln!("{msg}");
        #[cfg(target_arch = "wasm32")]
        web_sys::console::warn_1(&msg.into());
    }
    n.min(cap)
}

fn fill_label_buf(
    font_system: &mut FontSystem,
    buf: &mut Buffer,
    lab: &ui::Label,
    dpi: f32,
    css_w: f32,
) {
    let fs = lab.size * dpi;
    buf.set_metrics(font_system, Metrics::new(fs, fs * 1.3));
    let max_w = if lab.wrap_w > 0.0 {
        lab.wrap_w * dpi
    } else {
        css_w * dpi
    };
    let max_h = if lab.wrap_h > 0.0 {
        lab.wrap_h * dpi
    } else {
        fs * 2.0
    };
    buf.set_size(font_system, Some(max_w), Some(max_h));
    buf.set_text(font_system, &lab.text, ui_attrs(lab.serif), Shaping::Advanced);
    buf.shape_until_scroll(font_system, false);
}

fn label_origin(lab: &ui::Label, buf: &Buffer, dpi: f32) -> (f32, f32) {
    let mut left = lab.x * dpi;
    let mut top = lab.y * dpi;
    if lab.box_w <= 0.0 && lab.box_h <= 0.0 {
        return (left, top);
    }
    let (line_w, line_top, line_h) = match buf.layout_runs().next() {
        Some(run) => (run.line_w, run.line_top, run.line_height),
        None => (0.0, 0.0, lab.size * dpi),
    };
    if lab.box_w > 0.0 {
        left += (lab.box_w * dpi - line_w) * 0.5;
    }
    if lab.box_h > 0.0 {
        top += (lab.box_h * dpi - line_h) * 0.5 - line_top;
    }
    (left, top)
}

fn label_area<'a>(
    lab: &'a ui::Label,
    buf: &'a Buffer,
    dpi: f32,
    phys_w: u32,
    phys_h: u32,
) -> TextArea<'a> {
    let (mut left, mut top) = label_origin(lab, buf, dpi);
    let sc = if lab.scale > 0.01 { lab.scale } else { 1.0 };
    let ox = if lab.ox != 0.0 || lab.oy != 0.0 {
        lab.ox * dpi
    } else if lab.box_w > 0.0 {
        (lab.x + lab.box_w * 0.5) * dpi
    } else {
        left
    };
    let oy = if lab.ox != 0.0 || lab.oy != 0.0 {
        lab.oy * dpi
    } else if lab.box_h > 0.0 {
        (lab.y + lab.box_h * 0.5) * dpi
    } else {
        top
    };
    if (sc - 1.0).abs() > 0.001 {
        left = ox + (left - ox) * sc;
        top = oy + (top - oy) * sc;
    }
    let c = lab.color;
    let bounds = if lab.clip[2] > 0.5 && lab.clip[3] > 0.5 {
        let mut l = lab.clip[0] * dpi;
        let mut t = lab.clip[1] * dpi;
        let mut r = (lab.clip[0] + lab.clip[2]) * dpi;
        let mut b = (lab.clip[1] + lab.clip[3]) * dpi;
        if (sc - 1.0).abs() > 0.001 {
            l = ox + (l - ox) * sc;
            t = oy + (t - oy) * sc;
            r = ox + (r - ox) * sc;
            b = oy + (b - oy) * sc;
        }
        TextBounds {
            left: (l.floor() as i32).max(0),
            top: (t.floor() as i32).max(0),
            right: (r.ceil() as i32).min(phys_w as i32),
            bottom: (b.ceil() as i32).min(phys_h as i32),
        }
    } else {
        TextBounds {
            left: 0,
            top: 0,
            right: phys_w as i32,
            bottom: phys_h as i32,
        }
    };
    TextArea {
        buffer: buf,
        left,
        top,
        scale: sc,
        bounds,
        default_color: Color::rgba(
            (c[0] * 255.0) as u8,
            (c[1] * 255.0) as u8,
            (c[2] * 255.0) as u8,
            (c[3] * 255.0) as u8,
        ),
        custom_glyphs: &[],
    }
}

#[cfg(target_arch = "wasm32")]
fn detect_catalog_js() -> bool {
    let global = js_sys::global();
    if js_sys::Reflect::get(&global, &"__kussetsuCatalog".into())
        .ok()
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return true;
    }
    web_sys::window()
        .and_then(|w| w.location().href().ok())
        .map(|h| h.contains("ui.html"))
        .unwrap_or(false)
}

fn wants_catalog() -> bool {
    CATALOG_MODE.load(Ordering::SeqCst)
}

fn initial_slug() -> String {
    #[cfg(target_arch = "wasm32")]
    {
        web_sys::window()
            .and_then(|w| w.location().search().ok())
            .and_then(|q| {
                q.trim_start_matches('?')
                    .split('&')
                    .find_map(|p| p.strip_prefix("c=").map(|s| s.to_string()))
            })
            .filter(|s| !s.is_empty() && s != "true")
            .unwrap_or_else(|| "welcome".into())
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        catalog_arg_slug().unwrap_or_else(|| "welcome".into())
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn catalog_arg_slug() -> Option<String> {
    let mut args = std::env::args();
    while let Some(a) = args.next() {
        if a == "--catalog" {
            let next = args.next()?;
            if next.starts_with('-') {
                return None;
            }
            let e = kussetsu::catalog::find(&next);
            if e.slug == next {
                return Some(next);
            }
            return None;
        }
    }
    None
}

pub fn run() {
    #[cfg(target_arch = "wasm32")]
    {
        console_error_panic_hook::set_once();
        let catalog = detect_catalog_js();
        CATALOG_MODE.store(catalog, Ordering::SeqCst);
        web_sys::console::log_1(&format!("kussetsu boot catalog={catalog}").into());
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if std::env::args().any(|a| a == "--dump-rain-atlas") {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/rain_atlas.bin");
            rain_atlas::dump_bin(&path);
            return;
        }
        CATALOG_MODE.store(std::env::args().any(|a| a == "--catalog"), Ordering::SeqCst);
    }

    let event_loop = EventLoop::new().expect("event loop");
    // Poll + vsync nextDrawable blocks the native run loop (press felt ~500ms
    // late). Wait: input is handled immediately; redraw only when needed.
    event_loop.set_control_flow(ControlFlow::Wait);
    let mut app = App::default();

    #[cfg(not(target_arch = "wasm32"))]
    event_loop.run_app(&mut app).expect("run");

    #[cfg(target_arch = "wasm32")]
    {
        use winit::platform::web::EventLoopExtWebSys;
        event_loop.spawn_app(app);
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn start_kussetsu() {
    run();
}

struct App {
    window: Option<Arc<Window>>,
    gpu: Rc<RefCell<Option<Gpu>>>,
    pointer: Pointer,
    slug: Rc<RefCell<String>>,
    painted: bool,
    modifiers: ModifiersState,
}

impl Default for App {
    fn default() -> Self {
        Self {
            window: None,
            gpu: Rc::new(RefCell::new(None)),
            pointer: Pointer {
                x: 0.0,
                y: 0.0,
                down: false,
                pressed: false,
                released: false,
                scroll: 0.0,
            },
            slug: Rc::new(RefCell::new(initial_slug())),
            painted: false,
            modifiers: ModifiersState::default(),
        }
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, el: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        #[allow(unused_mut)]
        let mut attrs = Window::default_attributes().with_title("kussetsu");
        #[cfg(not(target_arch = "wasm32"))]
        {
            attrs = attrs
                .with_inner_size(winit::dpi::LogicalSize::new(1280.0, 800.0))
                .with_min_inner_size(winit::dpi::LogicalSize::new(720.0, 480.0))
                .with_resizable(true);
        }

        #[cfg(target_arch = "wasm32")]
        {
            use wasm_bindgen::JsCast;
            use winit::platform::web::WindowAttributesExtWebSys;
            if let Some(canvas) = web_sys::window()
                .and_then(|w| w.document())
                .and_then(|d| d.get_element_by_id("gpu"))
                .and_then(|e| e.dyn_into::<web_sys::HtmlCanvasElement>().ok())
            {
                // Do not with_inner_size on web — that writes a fixed px style and
                // the canvas stops following the browser window.
                attrs = attrs.with_canvas(Some(canvas));
            }
        }

        let window = Arc::new(el.create_window(attrs).expect("window"));
        window.set_ime_allowed(true);

        #[cfg(target_arch = "wasm32")]
        {
            use winit::platform::web::WindowExtWebSys;
            if let Some(canvas) = window.canvas() {
                let style = canvas.style();
                let _ = style.remove_property("width");
                let _ = style.remove_property("height");
                let _ = style.remove_property("min-width");
                let _ = style.remove_property("min-height");
                let _ = style.set_property("width", "100%");
                let _ = style.set_property("height", "100%");
                let _ = style.set_property("display", "block");
            }
        }

        self.window = Some(window.clone());
        let slot = self.gpu.clone();
        let catalog = wants_catalog();
        let slug = self.slug.clone();

        #[cfg(not(target_arch = "wasm32"))]
        {
            *slot.borrow_mut() = Some(
                pollster::block_on(Gpu::new(window, catalog, slug)).expect("gpu"),
            );
        }
        #[cfg(target_arch = "wasm32")]
        {
            let slug_nav = slug.clone();
            let win = window.clone();
            wasm_bindgen_futures::spawn_local(async move {
                match Gpu::new(window, catalog, slug).await {
                    Ok(gpu) => {
                        let _ = slug_nav;
                        *slot.borrow_mut() = Some(gpu);
                        win.request_redraw();
                    }
                    Err(err) => web_sys::console::error_1(&format!("kussetsu: {err}").into()),
                }
            });
        }
    }

    fn window_event(&mut self, el: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => el.exit(),
            WindowEvent::Resized(size) => {
                if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
                    gpu.resize(size.width, size.height);
                }
                self.request_redraw();
            }
            WindowEvent::CursorMoved { position, .. } => {
                let scale = self.window.as_ref().map(|w| w.scale_factor() as f32).unwrap_or(1.0);
                self.pointer.x = position.x as f32 / scale;
                self.pointer.y = position.y as f32 / scale;
                if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
                    gpu.lens.set_pointer(self.pointer.x, self.pointer.y);
                }
                self.request_redraw();
            }
            WindowEvent::CursorLeft { .. } => {
                self.pointer.x = -1000.0;
                self.pointer.y = -1000.0;
                self.request_redraw();
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if event.state.is_pressed() {
                    if event.logical_key
                        == winit::keyboard::Key::Named(winit::keyboard::NamedKey::Escape)
                    {
                        if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
                            if gpu.rail_search_focus {
                                if !gpu.rail_query.is_empty() {
                                    gpu.rail_query.clear();
                                } else {
                                    gpu.rail_search_focus = false;
                                }
                            } else if gpu.seed.dialog {
                                gpu.seed.request_close_dialog();
                            } else if kussetsu::catalog::overlay_slug(&gpu.slug.borrow()) {
                                gpu.seed.on = [false; 8];
                            } else if gpu.lens.live() {
                                gpu.lens.collapse();
                            }
                        }
                    } else if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
                        let cmd = self.modifiers.control_key() || self.modifiers.super_key();
                        gpu.edit.shift = self.modifiers.shift_key();
                        match &event.logical_key {
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::Tab) => {
                                gpu.tab_dir = if self.modifiers.shift_key() { -1 } else { 1 };
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::Enter)
                                if gpu.rail_search_focus =>
                            {
                                if let Some(next) = kussetsu::catalog::first_match(&gpu.rail_query) {
                                    gpu.goto_slug(next);
                                    gpu.rail_search_focus = false;
                                }
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::Enter) => {
                                gpu.edit.enter = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::Backspace) => {
                                gpu.backspace = true;
                                gpu.edit.backspace = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::Delete) => {
                                gpu.edit.delete = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::ArrowLeft) => {
                                gpu.edit.left = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::ArrowRight) => {
                                gpu.edit.right = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::ArrowUp) => {
                                gpu.edit.up = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::ArrowDown) => {
                                gpu.edit.down = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::Home) => {
                                gpu.edit.home = true;
                            }
                            winit::keyboard::Key::Named(winit::keyboard::NamedKey::End) => {
                                gpu.edit.end = true;
                            }
                            winit::keyboard::Key::Character(ch)
                                if cmd && ch.eq_ignore_ascii_case("k") =>
                            {
                                gpu.rail_search_focus = true;
                            }
                            winit::keyboard::Key::Character(ch)
                                if cmd && ch.eq_ignore_ascii_case("a") =>
                            {
                                gpu.edit.select_all = true;
                            }
                            winit::keyboard::Key::Character(ch)
                                if cmd && ch.eq_ignore_ascii_case("c") =>
                            {
                                gpu.edit.copy = true;
                            }
                            winit::keyboard::Key::Character(ch)
                                if cmd && ch.eq_ignore_ascii_case("x") =>
                            {
                                gpu.edit.cut = true;
                            }
                            winit::keyboard::Key::Character(ch)
                                if cmd && ch.eq_ignore_ascii_case("v") =>
                            {
                                gpu.edit.paste = true;
                                gpu.edit.clip = read_clip(&gpu.clip_buf);
                            }
                            winit::keyboard::Key::Character(ch)
                                if !cmd && !ch.chars().any(char::is_control) =>
                            {
                                gpu.typed.push_str(ch);
                                gpu.edit.typed.push_str(ch);
                            }
                            _ => {}
                        }
                    }
                    self.request_redraw();
                }
            }
            WindowEvent::ModifiersChanged(mods) => {
                self.modifiers = mods.state();
            }
            WindowEvent::PinchGesture { delta, phase, .. } => {
                if matches!(
                    phase,
                    winit::event::TouchPhase::Started | winit::event::TouchPhase::Moved
                ) {
                    let d = delta as f32;
                    if d.is_finite() {
                        if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
                            gpu.lens.magnify_delta(d * 3.4);
                            gpu.lens.set_pointer(self.pointer.x, self.pointer.y);
                        }
                    }
                }
                self.request_redraw();
            }
            WindowEvent::MouseWheel { delta, .. } => {
                if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
                    let magnify_mod = self.modifiers.control_key() || self.modifiers.super_key();
                    if magnify_mod {
                        let step = match delta {
                            MouseScrollDelta::LineDelta(_, y) => y * 0.28,
                            MouseScrollDelta::PixelDelta(p) => (p.y as f32 / 80.0) * 0.32,
                        };
                        gpu.lens.magnify_delta(step);
                        gpu.lens.set_pointer(self.pointer.x, self.pointer.y);
                    } else {
                        gpu.wheel += match delta {
                            MouseScrollDelta::LineDelta(_, y) => y * 28.0,
                            MouseScrollDelta::PixelDelta(p) => p.y as f32,
                        };
                    }
                }
                self.request_redraw();
            }
            WindowEvent::MouseInput { state, button, .. } => {
                if button == winit::event::MouseButton::Left {
                    let down = state.is_pressed();
                    self.pointer.pressed = down && !self.pointer.down;
                    self.pointer.released = !down && self.pointer.down;
                    self.pointer.down = down;
                    // Paint this turn — don't wait for the next rAF / Poll tick.
                    self.paint();
                }
                self.request_redraw();
            }
            WindowEvent::RedrawRequested => self.paint(),
            _ => {}
        }
    }

    fn about_to_wait(&mut self, el: &ActiveEventLoop) {
        el.set_control_flow(ControlFlow::Wait);
        let animating = self
            .gpu
            .borrow()
            .as_ref()
            .map(|g| {
                if !g.catalog || g.motion.busy() || g.lens.live() || g.rail_search_focus {
                    return true;
                }
                kussetsu::catalog::story_ticks(&g.slug.borrow(), &g.seed)
            })
            .unwrap_or(false);
        if !self.painted || animating {
            self.request_redraw();
        }
    }
}

impl App {
    fn request_redraw(&self) {
        if let Some(w) = &self.window {
            w.request_redraw();
        }
    }

    fn paint(&mut self) {
        if let Some(gpu) = self.gpu.borrow_mut().as_mut() {
            self.pointer.scroll = gpu.wheel;
            gpu.wheel = 0.0;
            gpu.edit.shift = self.modifiers.shift_key();
            if gpu.rail_search_focus {
                if let Some(s) = kussetsu::input::apply_edit(
                    &mut gpu.rail_query,
                    &mut gpu.rail_caret,
                    &mut gpu.rail_sel,
                    &gpu.edit,
                ) {
                    write_clip(&s, &mut gpu.clip_buf);
                }
                if gpu.rail_query.chars().count() > 48 {
                    gpu.rail_query = gpu.rail_query.chars().take(48).collect();
                }
                gpu.typed.clear();
                gpu.backspace = false;
                gpu.edit = EditKeys::default();
                gpu.seed.typed.clear();
                gpu.seed.backspace = false;
            } else {
                gpu.seed.typed = gpu.typed.clone();
                gpu.seed.backspace = gpu.backspace;
                gpu.seed.edit = gpu.edit.clone();
                gpu.typed.clear();
                gpu.backspace = false;
                gpu.edit = EditKeys::default();
            }
            gpu.seed.tab_dir = gpu.tab_dir;
            gpu.tab_dir = 0;
            gpu.seed.wheel_taken = false;
            gpu.frame(self.pointer);
            gpu.seed.typed.clear();
            gpu.seed.backspace = false;
            self.painted = true;
        }
        self.pointer.pressed = false;
        self.pointer.released = false;
        self.pointer.scroll = 0.0;
    }
}

struct Gpu {
    window: Arc<Window>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    start: Instant,
    quad: wgpu::Buffer,
    lamps_pipe: wgpu::RenderPipeline,
    lamps_bg: wgpu::BindGroup,
    lamps_u: wgpu::Buffer,
    blit_pipe: wgpu::RenderPipeline,
    blit_bgl: wgpu::BindGroupLayout,
    cube_pipe: wgpu::RenderPipeline,
    cube_bgl: wgpu::BindGroupLayout,
    cube_u: wgpu::Buffer,
    sampler: wgpu::Sampler,
    scene: wgpu::Texture,
    scene_view: wgpu::TextureView,
    blit_bg: wgpu::BindGroup,
    cube_bg: wgpu::BindGroup,
    font_system: FontSystem,
    swash: SwashCache,
    viewport: Viewport,
    atlas: TextAtlas,
    text: TextRenderer,
    letters: Vec<Buffer>,
    labels: Vec<Buffer>,
    ui_pipe: wgpu::RenderPipeline,
    _ui_bgl: wgpu::BindGroupLayout,
    ui_frame: wgpu::Buffer,
    ui_quads: wgpu::Buffer,
    ui_bg: wgpu::BindGroup,
    ui_corners: wgpu::Buffer,
    _photos: wgpu::Texture,
    seed: SeedState,
    catalog: bool,
    slug: Rc<RefCell<String>>,
    rail_scroll: f32,
    rail_query: String,
    rail_search_focus: bool,
    typed: String,
    backspace: bool,
    edit: EditKeys,
    clip_buf: String,
    rail_caret: usize,
    rail_sel: usize,
    wheel: f32,
    tab_dir: i8,
    motion: Motion,
    last_t: Instant,
    lens: Lens,
    lens_pipe: wgpu::RenderPipeline,
    lens_bgl: wgpu::BindGroupLayout,
    lens_u: wgpu::Buffer,
    composite: wgpu::Texture,
    composite_view: wgpu::TextureView,
    glass_pipe: wgpu::RenderPipeline,
    glass_bgl: wgpu::BindGroupLayout,
    glass_u: wgpu::Buffer,
    glass_panes: wgpu::Buffer,
    rain_pipe: wgpu::RenderPipeline,
    rain_bg: wgpu::BindGroup,
    rain_u: wgpu::Buffer,
    rain_atlas: rain_atlas::RainAtlas,
}

impl Gpu {
    async fn new(window: Arc<Window>, catalog: bool, slug: Rc<RefCell<String>>) -> Result<Self, String> {
        #[cfg_attr(not(target_arch = "wasm32"), allow(unused_mut))]
        let mut size = window.inner_size();
        #[cfg(target_arch = "wasm32")]
        {
            use winit::platform::web::WindowExtWebSys;
            if size.width <= 1 || size.height <= 1 {
                if let Some(c) = window.canvas() {
                    let dpr = web_sys::window()
                        .map(|w| w.device_pixel_ratio())
                        .unwrap_or(1.0);
                    let cw = (c.client_width() as f64 * dpr).max(1.0) as u32;
                    let ch = (c.client_height() as f64 * dpr).max(1.0) as u32;
                    size = winit::dpi::PhysicalSize::new(cw, ch);
                }
            }
        }
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            #[cfg(target_arch = "wasm32")]
            backends: wgpu::Backends::BROWSER_WEBGPU,
            #[cfg(not(target_arch = "wasm32"))]
            backends: wgpu::Backends::all(),
            ..Default::default()
        });
        let surface = instance
            .create_surface(window.clone())
            .map_err(|e| format!("surface: {e}"))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| "no GPU adapter (WebGPU required in the browser)".to_string())?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await
            .map_err(|e| format!("device: {e}"))?;

        let cap = surface.get_capabilities(&adapter);
        // Web canvas is unorm (hex colors displayed as authored). An sRGB
        // swapchain on native encodes those values again — washed / HDR-ish.
        let format = cap
            .formats
            .iter()
            .copied()
            .find(|f| {
                matches!(
                    f,
                    wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Rgba8Unorm
                )
            })
            .or_else(|| cap.formats.iter().copied().find(|f| !f.is_srgb()))
            .unwrap_or(cap.formats[0]);
        // Unorm swapchain + ColorMode::Web is glyphon's pairing for "looks
        // like a browser / UI toolkit". Accurate assumes an sRGB target and
        // thins light-on-dark glyphs (Welcome / 屈折 looking like another face).
        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!("kussetsu surface {format:?}").into());
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: size.width.max(1),
            height: size.height.max(1),
            present_mode: wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: 1,
            alpha_mode: cap.alpha_modes[0],
            view_formats: vec![],
        };
        surface.configure(&device, &config);

        let quad = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("quad"),
            contents: bytemuck::cast_slice(&QUAD),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let vlayout = wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<VsIn>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x2,
                },
                wgpu::VertexAttribute {
                    offset: 8,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x2,
                },
            ],
        };

        let lamps_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("lamps"),
            source: wgpu::ShaderSource::Wgsl(LAMPS_WGSL.into()),
        });
        let lamps_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("lamps-bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let lamps_u = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("lamps-u"),
            size: std::mem::size_of::<LampsU>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let lamps_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("lamps-bg"),
            layout: &lamps_bgl,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: lamps_u.as_entire_binding(),
            }],
        });
        let lamps_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("lamps-pl"),
            bind_group_layouts: &[&lamps_bgl],
            push_constant_ranges: &[],
        });
        let lamps_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("lamps"),
            layout: Some(&lamps_pl),
            vertex: wgpu::VertexState {
                module: &lamps_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[vlayout.clone()],
            },
            fragment: Some(wgpu::FragmentState {
                module: &lamps_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let tex_entry = |binding, vis| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: vis,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let samp_entry = |binding, vis| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: vis,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        };
        let ubo_entry = |binding, vis| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: vis,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        };

        let blit_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("blit"),
            source: wgpu::ShaderSource::Wgsl(BLIT_WGSL.into()),
        });
        let blit_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("blit-bgl"),
            entries: &[
                tex_entry(0, wgpu::ShaderStages::FRAGMENT),
                samp_entry(1, wgpu::ShaderStages::FRAGMENT),
            ],
        });
        let blit_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("blit-pl"),
            bind_group_layouts: &[&blit_bgl],
            push_constant_ranges: &[],
        });
        let lens_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("lens"),
            source: wgpu::ShaderSource::Wgsl(LENS_WGSL.into()),
        });
        let lens_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("lens-bgl"),
            entries: &[
                ubo_entry(0, wgpu::ShaderStages::FRAGMENT),
                tex_entry(1, wgpu::ShaderStages::FRAGMENT),
                samp_entry(2, wgpu::ShaderStages::FRAGMENT),
            ],
        });
        let lens_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("lens-pl"),
            bind_group_layouts: &[&lens_bgl],
            push_constant_ranges: &[],
        });
        let lens_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("lens"),
            layout: Some(&lens_pl),
            vertex: wgpu::VertexState {
                module: &lens_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &lens_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        let lens_u = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("lens-u"),
            size: std::mem::size_of::<LensU>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let glass_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("glass"),
            source: wgpu::ShaderSource::Wgsl(GLASS_WGSL.into()),
        });
        let sto_entry = |binding, vis| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: vis,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only: true },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        };
        let glass_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("glass-bgl"),
            entries: &[
                ubo_entry(0, wgpu::ShaderStages::FRAGMENT),
                sto_entry(1, wgpu::ShaderStages::FRAGMENT),
                tex_entry(2, wgpu::ShaderStages::FRAGMENT),
                samp_entry(3, wgpu::ShaderStages::FRAGMENT),
            ],
        });
        let glass_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("glass-pl"),
            bind_group_layouts: &[&glass_bgl],
            push_constant_ranges: &[],
        });
        let glass_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("glass"),
            layout: Some(&glass_pl),
            vertex: wgpu::VertexState {
                module: &glass_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &glass_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        let glass_u = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("glass-u"),
            size: std::mem::size_of::<GlassU>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let glass_panes = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("glass-panes"),
            size: (std::mem::size_of::<kussetsu::draw::GlassPane>() * kussetsu::glass::MAX_PANES)
                as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let rain_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("rain"),
            source: wgpu::ShaderSource::Wgsl(RAIN_WGSL.into()),
        });
        let rain_atlas = rain_atlas::RainAtlas::build(&device, &queue);
        let rain_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("rain-bgl"),
            entries: &[
                ubo_entry(0, wgpu::ShaderStages::FRAGMENT),
                tex_entry(1, wgpu::ShaderStages::FRAGMENT),
                samp_entry(2, wgpu::ShaderStages::FRAGMENT),
            ],
        });
        let rain_u = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("rain-u"),
            size: std::mem::size_of::<kussetsu::rain::RainU>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let rain_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("rain-bg"),
            layout: &rain_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: rain_u.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&rain_atlas.view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        let rain_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("rain-pl"),
            bind_group_layouts: &[&rain_bgl],
            push_constant_ranges: &[],
        });
        let rain_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("rain"),
            layout: Some(&rain_pl),
            vertex: wgpu::VertexState {
                module: &rain_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &rain_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        let (composite, composite_view) = make_scene(&device, format, size.width, size.height);

        let blit_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("blit"),
            layout: Some(&blit_pl),
            vertex: wgpu::VertexState {
                module: &blit_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[vlayout.clone()],
            },
            fragment: Some(wgpu::FragmentState {
                module: &blit_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let cube_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("cube"),
            source: wgpu::ShaderSource::Wgsl(CUBE_WGSL.into()),
        });
        let cube_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("cube-bgl"),
            entries: &[
                tex_entry(0, wgpu::ShaderStages::FRAGMENT),
                samp_entry(1, wgpu::ShaderStages::FRAGMENT),
                ubo_entry(2, wgpu::ShaderStages::VERTEX_FRAGMENT),
            ],
        });
        let cube_u = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("cube-u"),
            size: std::mem::size_of::<CubeU>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let cube_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("cube-pl"),
            bind_group_layouts: &[&cube_bgl],
            push_constant_ranges: &[],
        });
        let cube_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("cube"),
            layout: Some(&cube_pl),
            vertex: wgpu::VertexState {
                module: &cube_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[vlayout],
            },
            fragment: Some(wgpu::FragmentState {
                module: &cube_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let (scene, scene_view) = make_scene(&device, format, config.width, config.height);
        let blit_bg = make_blit_bg(&device, &blit_bgl, &scene_view, &sampler);
        let cube_bg = make_cube_bg(&device, &cube_bgl, &scene_view, &sampler, &cube_u);

        let mut db = fontdb::Database::new();
        db.load_font_source(Source::Binary(Arc::new(PLEX_MONO.to_vec())));
        db.load_font_source(Source::Binary(Arc::new(PLEX_MONO_MED.to_vec())));
        db.load_font_source(Source::Binary(Arc::new(INTER_BOLD.to_vec())));
        db.load_font_source(Source::Binary(Arc::new(SHIPPORI.to_vec())));
        db.set_monospace_family("IBM Plex Mono");
        db.set_sans_serif_family("IBM Plex Mono");
        db.set_serif_family("Shippori Mincho");
        let locale = "ja-JP".to_string();
        let mut font_system = FontSystem::new_with_locale_and_db(locale, db);
        let swash = SwashCache::new();
        let cache = Cache::new(&device);
        let viewport = Viewport::new(&device, &cache);
        let mut atlas =
            TextAtlas::with_color_mode(&device, &queue, &cache, format, ColorMode::Web);
        let text = TextRenderer::new(&mut atlas, &device, wgpu::MultisampleState::default(), None);
        let letters: Vec<Buffer> = (0..5)
            .map(|_| Buffer::new(&mut font_system, Metrics::new(180.0, 200.0)))
            .collect();
        let labels: Vec<Buffer> = (0..MAX_LABELS)
            .map(|_| Buffer::new(&mut font_system, Metrics::new(14.0, 18.0)))
            .collect();

        let ui_corners = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ui-corners"),
            contents: bytemuck::cast_slice(&UNIT_CORNERS),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let ui_frame = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ui-frame"),
            size: std::mem::size_of::<FrameU>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let ui_quads = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ui-quads"),
            size: (std::mem::size_of::<Quad>() * MAX_QUADS) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let (photos, photos_view) = make_photos(&device, &queue);
        let ui_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ui-bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                tex_entry(2, wgpu::ShaderStages::FRAGMENT),
                samp_entry(3, wgpu::ShaderStages::FRAGMENT),
            ],
        });
        let ui_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ui-bg"),
            layout: &ui_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: ui_frame.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: ui_quads.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&photos_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        let ui_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ui-quad"),
            source: wgpu::ShaderSource::Wgsl(QUAD_WGSL.into()),
        });
        let ui_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ui-pl"),
            bind_group_layouts: &[&ui_bgl],
            push_constant_ranges: &[],
        });
        let ui_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ui"),
            layout: Some(&ui_pl),
            vertex: wgpu::VertexState {
                module: &ui_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: 8,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x2,
                    }],
                }],
            },
            fragment: Some(wgpu::FragmentState {
                module: &ui_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Ok(Self {
            window,
            device,
            queue,
            surface,
            config,
            start: Instant::now(),
            quad,
            lamps_pipe,
            lamps_bg,
            lamps_u,
            blit_pipe,
            blit_bgl,
            cube_pipe,
            cube_bgl,
            cube_u,
            sampler,
            scene,
            scene_view,
            blit_bg,
            cube_bg,
            font_system,
            swash,
            viewport,
            atlas,
            text,
            letters,
            labels,
            ui_pipe,
            _ui_bgl: ui_bgl,
            ui_frame,
            ui_quads,
            ui_bg,
            ui_corners,
            _photos: photos,
            seed: SeedState::default(),
            catalog,
            slug,
            rail_scroll: 0.0,
            rail_query: String::new(),
            rail_search_focus: false,
            typed: String::new(),
            edit: EditKeys::default(),
            clip_buf: String::new(),
            rail_caret: 0,
            rail_sel: 0,
            backspace: false,
            wheel: 0.0,
            tab_dir: 0,
            motion: Motion::default(),
            last_t: Instant::now(),
            lens: Lens::default(),
            lens_pipe,
            lens_bgl,
            lens_u,
            composite,
            composite_view,
            glass_pipe,
            glass_bgl,
            glass_u,
            glass_panes,
            rain_pipe,
            rain_bg,
            rain_u,
            rain_atlas,
        })
    }

    fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        if self.config.width == width && self.config.height == height {
            return;
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
        let (scene, view) = make_scene(&self.device, self.config.format, width, height);
        self.scene = scene;
        self.scene_view = view;
        self.blit_bg = make_blit_bg(&self.device, &self.blit_bgl, &self.scene_view, &self.sampler);
        self.cube_bg = make_cube_bg(
            &self.device,
            &self.cube_bgl,
            &self.scene_view,
            &self.sampler,
            &self.cube_u,
        );
        let (composite, view) = make_scene(&self.device, self.config.format, width, height);
        self.composite = composite;
        self.composite_view = view;
    }

    fn frame(&mut self, ptr: Pointer) {
        let now = Instant::now();
        let dt = now.saturating_duration_since(self.last_t).as_secs_f32();
        self.lens.set_pointer(ptr.x, ptr.y);
        let _ = self.lens.tick(dt);
        if self.catalog {
            self.frame_catalog(ptr);
            return;
        }
        let w = self.config.width.max(1);
        let h = self.config.height.max(1);
        let scale = self.window.scale_factor() as f32;
        let css_w = w as f32 / scale;
        let css_h = h as f32 / scale;
        let time = self.start.elapsed().as_secs_f32();

        let glass_font = (css_w * 0.27).clamp(64.0, 240.0);
        let cube = (css_w * 0.62).clamp(200.0, 600.0);
        let cube_y = if css_w < 800.0 { 56.0 } else { 64.0 };
        let cube_x = (css_w - cube) * 0.5;
        let cube_mid = cube_y + cube * 0.5;

        let lamps = LampsU {
            res: [css_w, css_h, 0.0, 0.0],
            scroll: [0.0, 0.0, 0.0, 0.0],
        };
        self.queue
            .write_buffer(&self.lamps_u, 0, bytemuck::bytes_of(&lamps));
        let cube_u = CubeU::baked(css_w, css_h, time, [cube_x, cube_y, cube, cube]);
        self.queue
            .write_buffer(&self.cube_u, 0, bytemuck::bytes_of(&cube_u));

        self.viewport.update(
            &self.queue,
            Resolution {
                width: w,
                height: h,
            },
        );
        const GLYPHS: [&str; 5] = ["G", "L", "A", "S", "S"];
        let tracking = glass_font * 0.14 * scale;
        let metrics = Metrics::new(glass_font * scale, glass_font * scale * 1.1);
        let attrs = Attrs::new()
            .family(Family::Name("Inter"))
            .weight(Weight::BOLD);
        let mut widths = [0.0_f32; 5];
        for (i, ch) in GLYPHS.iter().enumerate() {
            let buf = &mut self.letters[i];
            buf.set_metrics(&mut self.font_system, metrics);
            buf.set_size(
                &mut self.font_system,
                Some(glass_font * scale * 2.5),
                Some(glass_font * scale * 1.4),
            );
            buf.set_text(&mut self.font_system, ch, attrs, Shaping::Advanced);
            buf.shape_until_scroll(&mut self.font_system, false);
            widths[i] = buf
                .layout_runs()
                .map(|run| run.line_w)
                .fold(0.0_f32, f32::max);
        }
        let total = widths.iter().sum::<f32>() + tracking * 4.0;
        let mut x = ((w as f32) - total) * 0.5;
        let text_top = (cube_mid - glass_font * 0.59) * scale;
        let areas: Vec<TextArea<'_>> = self
            .letters
            .iter()
            .zip(widths)
            .map(|(buffer, gw)| {
                let left = x;
                x += gw + tracking;
                TextArea {
                    buffer,
                    left,
                    top: text_top,
                    scale: 1.0,
                    bounds: TextBounds {
                        left: 0,
                        top: 0,
                        right: w as i32,
                        bottom: h as i32,
                    },
                    default_color: Color::rgb(250, 250, 255),
                    custom_glyphs: &[],
                }
            })
            .collect();
        let _ = self.text.prepare(
            &self.device,
            &self.queue,
            &mut self.font_system,
            &mut self.atlas,
            &self.viewport,
            areas,
            &mut self.swash,
        );

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("hero"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.scene_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.lamps_pipe);
            pass.set_bind_group(0, &self.lamps_bg, &[]);
            pass.set_vertex_buffer(0, self.quad.slice(..));
            pass.draw(0..6, 0..1);
            let _ = self.text.render(&self.atlas, &self.viewport, &mut pass);
        }

        let mut draw = DrawList::default();
        let y0 = (css_h - 250.0).max(36.0);
        let now = Instant::now();
        let dt = now.saturating_duration_since(self.last_t).as_secs_f32();
        self.last_t = now;
        ui::seed_at_motion(
            &mut draw,
            ptr,
            &mut self.motion,
            dt,
            css_w,
            36.0,
            y0,
            &mut self.seed,
        );
        if self.seed.dialog {
            let ev = ui::dialog(
                &mut draw,
                ptr,
                &mut self.motion,
                dt,
                css_w,
                css_h,
                "Settings",
                "Overlay. Escape, scrim, Cancel, or Done.",
                &mut self.seed.dialog_fresh,
                self.seed.dialog_leaving,
            );
            ui::apply_close(
                &mut self.seed.dialog,
                &mut self.seed.dialog_hold,
                &mut self.seed.dialog_leaving,
                ev,
                ptr,
            );
        }
        draw.sort_layers();
        let frame_u = FrameU {
            res: [css_w, css_h, 0.0, 0.0],
        };
        self.queue
            .write_buffer(&self.ui_frame, 0, bytemuck::bytes_of(&frame_u));
        let nquads = clip_quads(draw.quads.len());
        if nquads > 0 {
            self.queue
                .write_buffer(&self.ui_quads, 0, bytemuck::cast_slice(&draw.quads[..nquads]));
        }
        let nlab = clip_labels(draw.labels.len(), self.labels.len());
        for i in 0..nlab {
            let lab = &draw.labels[i];
            let buf = &mut self.labels[i];
            fill_label_buf(
                &mut self.font_system,
                buf,
                lab,
                scale,
                css_w,
            );
        }
        let Ok(frame) = self.surface.get_current_texture() else {
            return;
        };
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("present"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.composite_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.blit_pipe);
            pass.set_bind_group(0, &self.blit_bg, &[]);
            pass.set_vertex_buffer(0, self.quad.slice(..));
            pass.draw(0..6, 0..1);
            pass.set_pipeline(&self.cube_pipe);
            pass.set_bind_group(0, &self.cube_bg, &[]);
            pass.draw(0..6, 0..1);
        }
        self.paint_layered_ui(
            &mut encoder,
            &draw,
            nquads,
            nlab,
            scale,
            w,
            h,
            wgpu::LoadOp::Load,
        );
        self.lens_present(&mut encoder, &frame);
        self.queue.submit(Some(encoder.finish()));
        self.window.pre_present_notify();
        frame.present();
        self.atlas.trim();
    }

    fn lens_present(&mut self, encoder: &mut wgpu::CommandEncoder, frame: &wgpu::SurfaceTexture) {
        let w = self.config.width.max(1);
        let h = self.config.height.max(1);
        let scale = self.window.scale_factor() as f32;
        let css_w = w as f32 / scale;
        let css_h = h as f32 / scale;
        let view = self.lens.view();
        let u = self.lens.uniforms(view, css_w, css_h, w as f32, h as f32);
        self.queue.write_buffer(&self.lens_u, 0, bytemuck::bytes_of(&u));
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("lens-bg"),
            layout: &self.lens_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.lens_u.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&self.composite_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });
        let dest = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("lens"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &dest,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.lens_pipe);
            pass.set_bind_group(0, &bg, &[]);
            pass.draw(0..3, 0..1);
        }
    }

    fn paint_layered_ui(
        &mut self,
        encoder: &mut wgpu::CommandEncoder,
        draw: &DrawList,
        nquads: usize,
        nlab: usize,
        scale: f32,
        phys_w: u32,
        phys_h: u32,
        mut load: wgpu::LoadOp<wgpu::Color>,
    ) {
        let target = self.composite_view.clone();
        let runs = draw.layer_runs(nquads, nlab);
        if runs.is_empty() {
            let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ui-empty"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &target,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load,
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            return;
        }
        for &(_, q0, q1, l0, l1) in &runs {
            if l1 > l0 {
                let areas: Vec<TextArea<'_>> = (l0 as usize..l1 as usize)
                    .map(|i| label_area(&draw.labels[i], &self.labels[i], scale, phys_w, phys_h))
                    .collect();
                let _ = self.text.prepare(
                    &self.device,
                    &self.queue,
                    &mut self.font_system,
                    &mut self.atlas,
                    &self.viewport,
                    areas,
                    &mut self.swash,
                );
            }
            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("ui-layer"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &target,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load,
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });
                load = wgpu::LoadOp::Load;
                if q1 > q0 {
                    pass.set_pipeline(&self.ui_pipe);
                    pass.set_bind_group(0, &self.ui_bg, &[]);
                    pass.set_vertex_buffer(0, self.ui_corners.slice(..));
                    pass.draw(0..6, q0..q1);
                }
                if l1 > l0 {
                    let _ = self.text.render(&self.atlas, &self.viewport, &mut pass);
                }
            }
        }
    }

    fn goto_slug(&mut self, next: &str) {
        let current = self.slug.borrow().clone();
        if next == current {
            return;
        }
        self.seed = SeedState::default();
        self.motion = Motion::default();
        *self.slug.borrow_mut() = next.to_string();
        #[cfg(target_arch = "wasm32")]
        if let Some(hist) = web_sys::window().and_then(|w| w.history().ok()) {
            let _ = hist.push_state_with_url(
                &wasm_bindgen::JsValue::NULL,
                "",
                Some(&format!("?c={next}")),
            );
        }
    }

    fn frame_catalog(&mut self, ptr: Pointer) {
        let w = self.config.width.max(1);
        let h = self.config.height.max(1);
        let scale = self.window.scale_factor() as f32;
        let css_w = w as f32 / scale;
        let css_h = h as f32 / scale;
        let x0 = kussetsu::catalog::RAIL_W;
        let y0 = kussetsu::catalog::HEAD_H;
        let stage_w = css_w - x0;
        let stage_h = css_h - y0;

        let mut draw = DrawList::default();
        let now = Instant::now();
        let dt = now.saturating_duration_since(self.last_t).as_secs_f32();
        self.last_t = now;
        let current_slug = self.slug.borrow().clone();
        let nav = kussetsu::catalog::native_rail(
            &mut draw,
            ptr,
            &mut self.motion,
            dt,
            css_h,
            &current_slug,
            self.rail_scroll,
            &self.rail_query,
            self.rail_search_focus,
            self.seed.clock,
        );
        if let Some(focus) = nav.search_focus {
            self.rail_search_focus = focus;
        }
        if ptr.pressed && ptr.x >= x0 {
            self.rail_search_focus = false;
        }
        if let Some(next) = nav.slug {
            self.goto_slug(next);
        }
        kussetsu::catalog::native_header(&mut draw, x0, stage_w, &self.slug.borrow());
        let slug = self.slug.borrow().clone();
        kussetsu::catalog::paint(
            &mut draw,
            ptr,
            stage_w,
            stage_h,
            &slug,
            &mut self.seed,
            &mut self.motion,
            dt,
            x0,
            y0,
        );
        if draw.wheel_taken {
            self.seed.wheel_taken = true;
        }
        if let Some(s) = draw.copy_text.take() {
            write_clip(&s, &mut self.clip_buf);
        }
        if !self.seed.wheel_taken && ptr.scroll.abs() > 0.1 {
            let max = kussetsu::catalog::rail_max_scroll(css_h, &self.rail_query);
            self.rail_scroll = (self.rail_scroll - ptr.scroll).clamp(0.0, max);
        } else {
            let max = kussetsu::catalog::rail_max_scroll(css_h, &self.rail_query);
            self.rail_scroll = self.rail_scroll.clamp(0.0, max);
        }
        draw.sort_layers();

        self.viewport.update(&self.queue, Resolution { width: w, height: h });
        let frame_u = FrameU { res: [css_w, css_h, 0.0, 0.0] };
        self.queue.write_buffer(&self.ui_frame, 0, bytemuck::bytes_of(&frame_u));
        let nquads = clip_quads(draw.quads.len());
        if nquads > 0 {
            self.queue.write_buffer(&self.ui_quads, 0, bytemuck::cast_slice(&draw.quads[..nquads]));
        }
        let nlab = clip_labels(draw.labels.len(), self.labels.len());
        for i in 0..nlab {
            let lab = &draw.labels[i];
            let buf = &mut self.labels[i];
            fill_label_buf(
                &mut self.font_system,
                buf,
                lab,
                scale,
                css_w,
            );
        }
        let Ok(frame) = self.surface.get_current_texture() else { return };
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("catalog"),
        });
        let nglass = draw.glasses.len().min(kussetsu::glass::MAX_PANES);
        let want_rain = draw.rain || nglass > 0;
        if want_rain {
            let ru = kussetsu::rain::RainU::frame(
                w as f32,
                h as f32,
                self.start.elapsed().as_secs_f32(),
                self.rain_atlas.count,
                self.rain_atlas.grid,
                scale,
            );
            self.queue
                .write_buffer(&self.rain_u, 0, bytemuck::bytes_of(&ru));
            let dest = if nglass > 0 {
                &self.scene_view
            } else {
                &self.composite_view
            };
            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("rain"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: dest,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });
                pass.set_pipeline(&self.rain_pipe);
                pass.set_bind_group(0, &self.rain_bg, &[]);
                pass.draw(0..3, 0..1);
            }
        }
        if nglass > 0 {
            let gu = GlassU {
                size: [css_w, css_h, w as f32, h as f32],
                misc: [nglass as f32, 0.0, 0.0, 0.0],
            };
            self.queue
                .write_buffer(&self.glass_u, 0, bytemuck::bytes_of(&gu));
            self.queue.write_buffer(
                &self.glass_panes,
                0,
                bytemuck::cast_slice(&draw.glasses[..nglass]),
            );
            let gbg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("glass-bg"),
                layout: &self.glass_bgl,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.glass_u.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.glass_panes.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(&self.scene_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                ],
            });
            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("glass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &self.composite_view,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });
                pass.set_pipeline(&self.glass_pipe);
                pass.set_bind_group(0, &gbg, &[]);
                pass.draw(0..3, 0..1);
            }
        }
        let load = if want_rain || nglass > 0 {
            wgpu::LoadOp::Load
        } else {
            wgpu::LoadOp::Clear(wgpu::Color {
                r: 0.02,
                g: 0.031,
                b: 0.024,
                a: 1.0,
            })
        };
        self.paint_layered_ui(&mut encoder, &draw, nquads, nlab, scale, w, h, load);
        self.lens_present(&mut encoder, &frame);
        self.queue.submit(Some(encoder.finish()));
        self.window.pre_present_notify();
        frame.present();
        self.atlas.trim();
    }
}

fn make_photos(device: &wgpu::Device, queue: &wgpu::Queue) -> (wgpu::Texture, wgpu::TextureView) {
    let pixels = kussetsu::image::atlas_rgba();
    let (w, h) = kussetsu::image::atlas_size();
    let texture = device.create_texture_with_data(
        queue,
        &wgpu::TextureDescriptor {
            label: Some("photos"),
            size: wgpu::Extent3d {
                width: w.max(1),
                height: h.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        },
        wgpu::util::TextureDataOrder::LayerMajor,
        &pixels,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn make_scene(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("scene"),
        size: wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
    (tex, view)
}

fn make_blit_bg(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("blit-bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

fn make_cube_bg(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
    ubo: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("cube-bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: ubo.as_entire_binding(),
            },
        ],
    })
}
