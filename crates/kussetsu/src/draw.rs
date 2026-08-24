//! Draw list + pointer. Widgets append; the site crate paints.

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct FrameU {
    pub res: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Quad {
    pub rect: [f32; 4],
    pub color: [f32; 4],
    pub border: [f32; 4],
    pub params: [f32; 4], // radius, border_w, scale, opacity
    pub fx: [f32; 4],     // taper, blur, skew, unused
}

#[derive(Clone, Debug)]
pub struct Label {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub color: [f32; 4],
    pub serif: bool,
    /// When > 0, the host centers the shaped run inside `[x, x+box_w]` × `[y, y+box_h]`.
    pub box_w: f32,
    pub box_h: f32,
    pub scale: f32,
    /// Scale origin in CSS px. Ignored when scale is 1. If both 0 and boxed, box center is used.
    pub ox: f32,
    pub oy: f32,
    /// When > 0, the host wraps the run to this CSS width (and `wrap_h` tall).
    pub wrap_w: f32,
    pub wrap_h: f32,
    /// CSS clip rect `[x, y, w, h]`. `w <= 0` means no extra clip (full surface).
    pub clip: [f32; 4],
}

#[derive(Clone, Copy, Debug)]
pub struct Pointer {
    pub x: f32,
    pub y: f32,
    pub down: bool,
    pub pressed: bool,
    pub released: bool,
    /// Wheel this frame, CSS px. Positive = scroll down. Widgets set `SeedState.wheel_taken`.
    pub scroll: f32,
}

impl Pointer {
    pub fn hit(self, x: f32, y: f32, w: f32, h: f32) -> bool {
        self.x >= x && self.x <= x + w && self.y >= y && self.y <= y + h
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct GlassPane {
    pub rect: [f32; 4],
    pub radius: f32,
    pub darken: f32,
    pub _pad: [f32; 2],
    pub glass: [f32; 4],
    pub glass2: [f32; 4],
}

pub struct DrawList {
    pub quads: Vec<Quad>,
    pub labels: Vec<Label>,
    pub glasses: Vec<GlassPane>,
    pub rain: bool,
    /// Multiplies every subsequent quad/label alpha (dialog children inherit fade).
    pub opacity: f32,
    /// Higher draws later (popover/hover-card sit above the stage).
    pub layer: u8,
    /// Widget consumed this frame's wheel (input overflow, lists).
    pub wheel_taken: bool,
    /// Host writes this string to the OS clipboard after the frame.
    pub copy_text: Option<String>,
    quad_layer: Vec<u8>,
    label_layer: Vec<u8>,
}

impl Default for DrawList {
    fn default() -> Self {
        Self {
            quads: Vec::new(),
            labels: Vec::new(),
            glasses: Vec::new(),
            rain: false,
            opacity: 1.0,
            layer: 0,
            wheel_taken: false,
            copy_text: None,
            quad_layer: Vec::new(),
            label_layer: Vec::new(),
        }
    }
}

impl DrawList {
    fn tint(&self, mut c: [f32; 4]) -> [f32; 4] {
        c[3] *= self.opacity;
        c
    }

    /// Scrim + modal chrome. Host paints this after the stage so labels cannot punch through.
    pub const OVERLAY: u8 = 12;

    /// After `sort_layers`, runs of `(layer, quad0..quad1, label0..label1)`.
    pub fn layer_runs(&self, nquads: usize, nlab: usize) -> Vec<(u8, u32, u32, u32, u32)> {
        let nquads = nquads.min(self.quads.len()).min(self.quad_layer.len());
        let nlab = nlab.min(self.labels.len()).min(self.label_layer.len());
        let mut out = Vec::new();
        let mut qi = 0;
        let mut li = 0;
        while qi < nquads || li < nlab {
            let qlayer = if qi < nquads {
                Some(self.quad_layer[qi])
            } else {
                None
            };
            let llayer = if li < nlab {
                Some(self.label_layer[li])
            } else {
                None
            };
            let layer = match (qlayer, llayer) {
                (Some(a), Some(b)) => a.min(b),
                (Some(a), None) => a,
                (None, Some(b)) => b,
                (None, None) => break,
            };
            let q0 = qi;
            while qi < nquads && self.quad_layer[qi] == layer {
                qi += 1;
            }
            let l0 = li;
            while li < nlab && self.label_layer[li] == layer {
                li += 1;
            }
            out.push((layer, q0 as u32, qi as u32, l0 as u32, li as u32));
        }
        out
    }

    pub fn sort_layers(&mut self) {
        let mut qord: Vec<usize> = (0..self.quads.len()).collect();
        qord.sort_by_key(|&i| self.quad_layer.get(i).copied().unwrap_or(0));
        self.quads = qord.iter().map(|&i| self.quads[i]).collect();
        self.quad_layer = qord
            .iter()
            .map(|&i| self.quad_layer.get(i).copied().unwrap_or(0))
            .collect();
        let mut lord: Vec<usize> = (0..self.labels.len()).collect();
        lord.sort_by_key(|&i| self.label_layer.get(i).copied().unwrap_or(0));
        self.labels = lord.iter().map(|&i| self.labels[i].clone()).collect();
        self.label_layer = lord
            .iter()
            .map(|&i| self.label_layer.get(i).copied().unwrap_or(0))
            .collect();
    }

    pub fn quad(&mut self, x: f32, y: f32, w: f32, h: f32, color: [f32; 4], radius: f32, scale: f32) {
        let color = self.tint(color);
        self.quads.push(Quad {
            rect: [x, y, w, h],
            color,
            border: [0.0; 4],
            params: [radius, 0.0, scale, color[3]],
            fx: [0.0; 4],
        });
        self.quad_layer.push(self.layer);
    }

    /// Sample the host photo atlas (`fx.w` = tile 1..=3). Rounded clip via `radius`.
    pub fn photo(
        &mut self,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        tile: u32,
        tint: [f32; 4],
        radius: f32,
        scale: f32,
    ) {
        let tint = self.tint(tint);
        self.quads.push(Quad {
            rect: [x, y, w, h],
            color: tint,
            border: [0.0; 4],
            params: [radius, 0.0, scale, tint[3]],
            fx: [0.0, 0.0, 0.0, (tile % 3) as f32 + 1.0],
        });
        self.quad_layer.push(self.layer);
    }

    pub fn outline(
        &mut self,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        fill: [f32; 4],
        border: [f32; 4],
        radius: f32,
        bw: f32,
        scale: f32,
    ) {
        let fill = self.tint(fill);
        let border = self.tint(border);
        self.quads.push(Quad {
            rect: [x, y, w, h],
            color: fill,
            border,
            params: [radius, bw, scale, fill[3].max(border[3])],
            fx: [0.0; 4],
        });
        self.quad_layer.push(self.layer);
    }

    pub fn card(
        &mut self,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        fill: [f32; 4],
        border: [f32; 4],
        radius: f32,
        bw: f32,
        scale: f32,
        opacity: f32,
        taper: f32,
        blur: f32,
        skew: f32,
    ) {
        let mut fill = self.tint(fill);
        let mut border = self.tint(border);
        fill[3] *= opacity;
        border[3] *= opacity;
        self.quads.push(Quad {
            rect: [x, y, w, h],
            color: fill,
            border,
            params: [radius, bw, scale, fill[3].max(border[3])],
            fx: [taper, blur, skew, 0.0],
        });
        self.quad_layer.push(self.layer);
    }

    pub fn label(&mut self, text: impl Into<String>, x: f32, y: f32, size: f32, color: [f32; 4]) {
        self.labels.push(Label {
            text: text.into(),
            x,
            y,
            size,
            color: self.tint(color),
            serif: false,
            box_w: 0.0,
            box_h: 0.0,
            scale: 1.0,
            ox: 0.0,
            oy: 0.0,
            wrap_w: 0.0,
            wrap_h: 0.0,
            clip: [0.0; 4],
        });
        self.label_layer.push(self.layer);
    }

    pub fn label_serif(&mut self, text: impl Into<String>, x: f32, y: f32, size: f32, color: [f32; 4]) {
        self.labels.push(Label {
            text: text.into(),
            x,
            y,
            size,
            color: self.tint(color),
            serif: true,
            box_w: 0.0,
            box_h: 0.0,
            scale: 1.0,
            ox: 0.0,
            oy: 0.0,
            wrap_w: 0.0,
            wrap_h: 0.0,
            clip: [0.0; 4],
        });
        self.label_layer.push(self.layer);
    }

    /// Shaped run is centered in `x,y,w,h` by the host (see `Label::box_w`).
    pub fn label_in(
        &mut self,
        text: impl Into<String>,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        size: f32,
        color: [f32; 4],
        scale: f32,
    ) {
        self.labels.push(Label {
            text: text.into(),
            x,
            y,
            size,
            color: self.tint(color),
            serif: false,
            box_w: w,
            box_h: h,
            scale,
            ox: x + w * 0.5,
            oy: y + h * 0.5,
            wrap_w: 0.0,
            wrap_h: 0.0,
            clip: [0.0; 4],
        });
        self.label_layer.push(self.layer);
    }

    pub fn label_swoop(
        &mut self,
        text: impl Into<String>,
        x: f32,
        y: f32,
        size: f32,
        color: [f32; 4],
        scale: f32,
        ox: f32,
        oy: f32,
        wrap_w: f32,
        wrap_h: f32,
    ) {
        self.labels.push(Label {
            text: text.into(),
            x,
            y,
            size,
            color: self.tint(color),
            serif: false,
            box_w: 0.0,
            box_h: 0.0,
            scale,
            ox,
            oy,
            wrap_w,
            wrap_h,
            clip: [0.0; 4],
        });
        self.label_layer.push(self.layer);
    }

    /// Same as `label_swoop`, clipped to a CSS rect (input overflow).
    pub fn label_clip(
        &mut self,
        text: impl Into<String>,
        x: f32,
        y: f32,
        size: f32,
        color: [f32; 4],
        scale: f32,
        ox: f32,
        oy: f32,
        clip: [f32; 4],
    ) {
        self.labels.push(Label {
            text: text.into(),
            x,
            y,
            size,
            color: self.tint(color),
            serif: false,
            box_w: 0.0,
            box_h: 0.0,
            scale,
            ox,
            oy,
            wrap_w: 0.0,
            wrap_h: 0.0,
            clip,
        });
        self.label_layer.push(self.layer);
    }
}

/// Per-widget springs. Key by (x, y[, slot]) of the control.
#[derive(Default)]
pub struct Motion {
    cells: Vec<(u64, f32, f32, f32)>,
}

impl Motion {
    pub fn spring(&mut self, x: f32, y: f32, target: f32, dt: f32) -> f32 {
        self.spring_slot(x, y, 0, target, dt)
    }

    pub fn spring_slot(&mut self, x: f32, y: f32, slot: u32, target: f32, dt: f32) -> f32 {
        // ~100ms settle — typical hover / color (Material 100, Apple ~150, Fluent 83–167).
        self.spring_kd(x, y, slot, target, dt, 1600.0, 80.0)
    }

    /// Switch thumb / track. ~150ms settle.
    pub fn spring_toggle(&mut self, x: f32, y: f32, target: f32, dt: f32) -> f32 {
        self.spring_kd(x, y, 0, target, dt, 720.0, 54.0)
    }

    /// Overlay enter ~200ms (dialogs, sheets).
    pub fn spring_enter(&mut self, x: f32, y: f32, target: f32, dt: f32) -> f32 {
        self.spring_kd(x, y, 7, target, dt, 400.0, 40.0)
    }

    fn spring_kd(
        &mut self,
        x: f32,
        y: f32,
        slot: u32,
        target: f32,
        dt: f32,
        k: f32,
        d: f32,
    ) -> f32 {
        let id = pack(x, y, slot);
        let dt = if dt > 0.08 { 1.0 / 60.0 } else { dt.clamp(0.0, 1.0 / 30.0) };
        if let Some((_, v, vel, tgt)) = self.cells.iter_mut().find(|(key, _, _, _)| *key == id) {
            *tgt = target;
            let acc = (target - *v) * k - *vel * d;
            *vel += acc * dt;
            *v += *vel * dt;
            return *v;
        }
        self.cells.push((id, target, 0.0, target));
        target
    }

    pub fn snap_slot(&mut self, x: f32, y: f32, slot: u32, value: f32) {
        let id = pack(x, y, slot);
        if let Some((_, v, vel, tgt)) = self.cells.iter_mut().find(|(key, _, _, _)| *key == id) {
            *v = value;
            *vel = 0.0;
            *tgt = value;
            return;
        }
        self.cells.push((id, value, 0.0, value));
    }

    pub fn get_slot(&self, x: f32, y: f32, slot: u32) -> f32 {
        let id = pack(x, y, slot);
        self.cells
            .iter()
            .find(|(key, _, _, _)| *key == id)
            .map(|(_, v, _, _)| *v)
            .unwrap_or(0.0)
    }

    /// Latch a drag that started on `hot` so fast moves that leave the hit box still track.
    pub fn drag_latch(
        &mut self,
        x: f32,
        y: f32,
        slot: u32,
        down: bool,
        pressed: bool,
        hot: bool,
    ) -> bool {
        if !down {
            self.snap_slot(x, y, slot, 0.0);
            false
        } else if pressed {
            self.snap_slot(x, y, slot, if hot { 1.0 } else { 0.0 });
            hot
        } else {
            self.get_slot(x, y, slot) > 0.5
        }
    }

    pub fn busy(&self) -> bool {
        self.cells.iter().any(|(_, v, vel, tgt)| vel.abs() > 0.004 || (v - tgt).abs() > 0.002)
    }
}

fn pack(x: f32, y: f32, slot: u32) -> u64 {
    let xy = ((x.round() as i32 as u32 as u64) << 32) | (y.round() as i32 as u32 as u64);
    xy ^ (u64::from(slot).wrapping_mul(0x9E37_79B9_7F4A_7C15))
}

pub const UNIT_CORNERS: [[f32; 2]; 6] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [0.5, 0.5],
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_runs_after_stage() {
        let mut d = DrawList::default();
        d.quad(0.0, 0.0, 10.0, 10.0, [1.0; 4], 0.0, 1.0);
        d.label("a", 0.0, 0.0, 12.0, [1.0; 4]);
        d.layer = DrawList::OVERLAY;
        d.quad(1.0, 1.0, 10.0, 10.0, [1.0; 4], 0.0, 1.0);
        d.label("b", 0.0, 0.0, 12.0, [1.0; 4]);
        d.sort_layers();
        let runs = d.layer_runs(2, 2);
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0], (0, 0, 1, 0, 1));
        assert_eq!(runs[1], (DrawList::OVERLAY, 1, 2, 1, 2));
    }
}
