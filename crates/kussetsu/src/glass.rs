//! Optical glass pane. Parent records a rect; the host composites IOR over the scene RT.
//! Same model as Suzuri `composite.wgsl` / Canvas UI GlassVanilla.

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct GlassU {
    pub size: [f32; 4],
    pub misc: [f32; 4],
}

pub const MAX_PANES: usize = 16;

use crate::button::{button, ButtonKind, ButtonSize};
use crate::draw::{DrawList, GlassPane, Motion, Pointer};
use crate::tokens::{FG, JADE, MUTED};

/// Canvas UI `GlassVanilla` defaults (Suzuri chrome).
pub const IOR: f32 = 1.5;
pub const EDGE: f32 = 0.7;
pub const BEVEL: f32 = 4.0;
pub const DEPTH: f32 = 250.0;
pub const ABERRATION: f32 = 1.0;
pub const BLUR: f32 = 0.0;
pub const REFLECTION: f32 = 1.0;
pub const SHINE: f32 = 0.01;
pub const DARKEN: f32 = 0.22;

#[derive(Clone, Copy, Debug)]
pub struct Glass {
    pub ior: f32,
    pub edge: f32,
    pub bevel: f32,
    pub depth: f32,
    pub aberration: f32,
    pub blur: f32,
    pub reflection: f32,
    pub shine: f32,
    pub darken: f32,
    pub radius: f32,
}

impl Glass {
    pub fn vanilla() -> Self {
        Self {
            ior: IOR,
            edge: EDGE,
            bevel: BEVEL,
            depth: DEPTH,
            aberration: ABERRATION,
            blur: BLUR,
            reflection: REFLECTION,
            shine: SHINE,
            darken: DARKEN,
            radius: 18.0,
        }
    }

    pub fn dense() -> Self {
        let mut g = Self::vanilla();
        g.ior = 1.82;
        g.depth = 340.0;
        g.edge = 0.62;
        g
    }

    pub fn prism() -> Self {
        let mut g = Self::vanilla();
        g.aberration = 2.2;
        g.ior = 1.62;
        g
    }

    pub fn frost() -> Self {
        let mut g = Self::vanilla();
        g.blur = 2.4;
        g.darken = 0.38;
        g.aberration = 0.0;
        g
    }
}

/// Queue a refractive pane. Labels go on the draw list as usual (drawn after the pass).
pub fn pane(draw: &mut DrawList, x: f32, y: f32, w: f32, h: f32, g: Glass) {
    if w < 2.0 || h < 2.0 {
        return;
    }
    draw.glasses.push(GlassPane {
        rect: [x, y, w, h],
        radius: g.radius,
        darken: g.darken,
        _pad: [0.0; 2],
        glass: [g.ior, g.edge, g.bevel, g.depth],
        glass2: [g.aberration, g.blur, g.reflection, g.shine],
    });
}

/// Suzuri chrome: a Vanilla slab. No WELL fill — rain shows through the IOR.
pub fn chrome(draw: &mut DrawList, x: f32, y: f32, w: f32, h: f32, radius: f32) {
    let mut g = Glass::vanilla();
    g.radius = radius.max(0.5);
    pane(draw, x, y, w, h, g);
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
    crate::rain::enable(draw);
    draw.label("Optical glass", 36.0 + x0, 36.0 + y0, 22.0, FG);
    draw.label(
        "Suzuri compositor. Glyph rain behind; IOR / CA / frost on the pane.",
        36.0 + x0,
        64.0 + y0,
        14.0,
        MUTED,
    );

    let presets = [
        ("Vanilla", Glass::vanilla(), "ior 1.5 · Canvas UI"),
        ("Dense", Glass::dense(), "ior 1.82 · thicker"),
        ("Prism", Glass::prism(), "chromatic aberration"),
        ("Frost", Glass::frost(), "scatter + darken"),
    ];
    let mut x = 36.0 + x0;
    let y = 96.0 + y0;
    for (i, (name, _, _)) in presets.iter().enumerate() {
        let kind = if seed.choice % 4 == i as u32 {
            ButtonKind::Primary
        } else {
            ButtonKind::Ghost
        };
        if button(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            name,
            kind,
            ButtonSize::Sm,
            false,
        ) {
            seed.choice = i as u32;
        }
        x += 88.0;
    }

    let which = (seed.choice as usize) % 4;
    let (_, g, blurb) = presets[which];
    draw.label(blurb, 36.0 + x0, y + 36.0, 13.0, MUTED);

    let card_w = 280.0;
    let card_h = 168.0;
    let cx = 36.0 + x0;
    let cy = y + 64.0;
    pane(draw, cx, cy, card_w, card_h, g);
    draw.label("屈折", cx + 22.0, cy + 28.0, 28.0, FG);
    draw.label("Glass is the backdrop, bent.", cx + 22.0, cy + 72.0, 14.0, MUTED);
    draw.label(
        format!("ior {:.2}  edge {:.2}  depth {:.0}", g.ior, g.edge, g.depth),
        cx + 22.0,
        cy + 120.0,
        13.0,
        JADE,
    );

    let side = cx + card_w + 24.0;
    pane(draw, side, cy, 160.0, 76.0, Glass::vanilla());
    draw.label("chip", side + 16.0, cy + 28.0, 14.0, MUTED);
    pane(draw, side, cy + 92.0, 160.0, 76.0, Glass::prism());
    draw.label("prism", side + 16.0, cy + 120.0, 14.0, MUTED);

}
