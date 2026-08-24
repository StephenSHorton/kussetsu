//! Cursor magnifying-glass. Parent owns `Lens`; host composites after the scene RT.
//! Pinch or ⌃/⌘+scroll grows the bubble and the zoom together.

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct LensU {
    pub size: [f32; 4],
    pub lens: [f32; 4],
    pub glass: [f32; 4],
    pub glass2: [f32; 4],
}

/// Radius at level 1 (logical px). Higher levels add more.
pub const MAG_RADIUS_BASE: f32 = 130.0;
/// Suzuri caps around 2.8; we let the bubble fill the stage.
pub const MAG_LEVEL_MAX: f32 = 12.0;

#[derive(Clone, Copy, Debug)]
pub struct LensView {
    pub pos: [f32; 2],
    pub radius: f32,
    pub presence: f32,
    pub magnify: f32,
}

#[derive(Clone, Debug)]
pub struct Lens {
    pos: [f32; 2],
    target: [f32; 2],
    level: f32,
    smooth: f32,
}

impl Default for Lens {
    fn default() -> Self {
        Self {
            pos: [0.0, 0.0],
            target: [0.0, 0.0],
            level: 0.0,
            smooth: 0.0,
        }
    }
}

impl Lens {
    pub fn set_pointer(&mut self, x: f32, y: f32) {
        if x.is_finite() && y.is_finite() && x > -100.0 {
            self.target = [x, y];
            if self.smooth < 0.05 {
                self.pos = [x, y];
            }
        }
    }

    /// Positive grows / zooms in. Pinch deltas are small; scroll should be pre-scaled.
    pub fn magnify_delta(&mut self, delta: f32) {
        if !delta.is_finite() || delta.abs() < 1e-6 {
            return;
        }
        self.level = (self.level + delta).clamp(0.0, MAG_LEVEL_MAX);
        if self.level > 0.02 && self.smooth < 0.02 {
            self.pos = self.target;
        }
    }

    pub fn collapse(&mut self) {
        self.level = 0.0;
    }

    pub fn live(&self) -> bool {
        self.level > 0.02 || self.smooth > 0.02
    }

    pub fn tick(&mut self, dt: f32) -> LensView {
        let dt = dt.clamp(0.0, 1.0 / 30.0);
        let k_mag = 1.0 - (-dt * 14.0).exp();
        self.smooth += (self.level - self.smooth) * k_mag;
        if self.smooth < 0.001 && self.level < 0.001 {
            self.smooth = 0.0;
        }
        let presence = self.view().presence;
        if presence > 0.01 {
            let k_pos = 1.0 - (-dt * 9.2).exp();
            self.pos[0] += (self.target[0] - self.pos[0]) * k_pos;
            self.pos[1] += (self.target[1] - self.pos[1]) * k_pos;
        } else {
            self.pos = self.target;
        }
        self.view()
    }

    pub fn view(&self) -> LensView {
        let lv = self.smooth;
        let t_r = (lv / 1.15).clamp(0.0, 1.0);
        let ease = 1.0 - (1.0 - t_r).powi(3);
        let extra = (lv - 1.15).max(0.0) * 72.0;
        LensView {
            pos: self.pos,
            radius: ease * MAG_RADIUS_BASE + extra,
            presence: ((lv - 0.02) / 0.14).clamp(0.0, 1.0),
            magnify: 1.0 + lv * 1.35,
        }
    }

    pub fn uniforms(&self, view: LensView, css_w: f32, css_h: f32, fb_w: f32, fb_h: f32) -> LensU {
        LensU {
            size: [css_w, css_h, fb_w, fb_h],
            lens: [view.pos[0], view.pos[1], view.radius, view.presence],
            glass: [1.52, 0.82, 1.6, 250.0],
            glass2: [1.0, view.magnify, 1.0, 0.08],
        }
    }
}
