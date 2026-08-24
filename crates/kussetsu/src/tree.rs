//! Hierarchy rows with indent. Copy Switch: parent owns expanded bits.
//! `seed.on[slot]` is open. Click a branch to toggle. Motion springs the fold.

use crate::draw::{DrawList, Motion, Pointer};
use crate::tokens::{
    lerp, Size, BORDER, CLEAR, FG, HOVER_SCALE, INK, JADE, LG, MD, MONO_ADVANCE, MUTED,
    PRESS_SCALE, SCRIM, SM, WELL,
};

const MAX: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TreeKind {
    Well,
    Outline,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TreeSize {
    Sm,
    Md,
    Lg,
}

impl TreeSize {
    pub fn metrics(self) -> Size {
        match self {
            TreeSize::Sm => SM,
            TreeSize::Md => MD,
            TreeSize::Lg => LG,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct TreeNode<'a> {
    pub label: &'a str,
    pub depth: u8,
    /// Index into `expanded` / `seed.on`. `None` = leaf (no fold).
    pub slot: Option<u8>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TreeEvent {
    /// Branch slot to flip in the parent (`seed.on[slot]`).
    pub toggle: Option<u8>,
    /// 0-based index into `nodes` of the clicked row.
    pub select: Option<u32>,
    pub height: f32,
}

/// Indented rows. `expanded[slot]` is open. Click a branch to toggle; click a leaf to select.
pub fn tree(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    x: f32,
    y: f32,
    w: f32,
    nodes: &[TreeNode],
    expanded: &[bool],
    selected: u32,
    kind: TreeKind,
    size: TreeSize,
    disabled: bool,
) -> TreeEvent {
    let s = size.metrics();
    let n = nodes.len().min(MAX);
    let w = w.max(96.0);
    if n == 0 {
        return TreeEvent::default();
    }

    let gem = (s.font * 0.85).clamp(10.0, 16.0);
    let indent = s.pad_x;
    let inset = match kind {
        TreeKind::Ghost => 0.0,
        _ => s.pad_x,
    };

    let mut t = [1.0f32; MAX];
    let mut vis = [1.0f32; MAX];
    let mut hy = [0.0f32; MAX];
    let mut rh = [0.0f32; MAX];
    let mut scale = [1.0f32; MAX];
    let mut u = [0.0f32; MAX];
    let mut hot = [false; MAX];

    for i in 0..n {
        t[i] = match nodes[i].slot {
            Some(slot) => {
                let open = expanded.get(slot as usize).copied().unwrap_or(false);
                motion
                    .spring_slot(x, y, i as u32, if open { 1.0 } else { 0.0 }, dt)
                    .clamp(0.0, 1.0)
            }
            None => 1.0,
        };
    }

    let mut cy = y;
    let mut fold = 0.0f32;
    for i in 0..n {
        vis[i] = ancestor_open(nodes, &t, i);
        if nodes[i].depth > 0 {
            fold = fold.max(vis[i]);
        }
        hy[i] = cy;
        rh[i] = s.height * vis[i];
        cy += rh[i];
    }
    let height = (cy - y).max(s.height);

    for i in 0..n {
        if vis[i] < 0.08 {
            continue;
        }
        let live = vis[i] > 0.92;
        let mx = x + inset + nodes[i].depth as f32 * indent;
        let lw = nodes[i].label.chars().count() as f32 * s.font * MONO_ADVANCE;
        let text_w = (mx - x) + gem + s.gap + lw;
        let hit_w = match kind {
            TreeKind::Ghost => text_w.min(w).max(gem + 8.0),
            _ => w,
        };
        let row_hot = live && !disabled && ptr.hit(x, hy[i], hit_w, rh[i].max(1.0));
        hot[i] = row_hot;
        let active = row_hot && ptr.down;
            // Scale is paint-only on the mark + title, not the layout box.
        let (sc, uu) = if disabled {
            (1.0, 0.0)
        } else if active {
            motion.snap_slot(x, y, slot_hover(i), HOVER_SCALE);
            motion.snap_slot(x, y, slot_press(i), 1.0);
            (PRESS_SCALE, 2.0)
        } else {
            (
                motion.spring_slot(
                    x,
                    y,
                    slot_hover(i),
                    if row_hot { HOVER_SCALE } else { 1.0 },
                    dt,
                ),
                motion.spring_slot(x, y, slot_press(i), if row_hot { 1.0 } else { 0.0 }, dt),
            )
        };
        scale[i] = sc;
        u[i] = uu;
    }

    let (fill, border, bw) = if disabled {
        match kind {
            TreeKind::Ghost => (CLEAR, CLEAR, 0.0),
            _ => (WELL, BORDER, 1.0),
        }
    } else {
        match kind {
            TreeKind::Well => (WELL, BORDER, 1.0),
            TreeKind::Outline => (CLEAR, lerp(BORDER, JADE, fold), 1.0),
            TreeKind::Ghost => (CLEAR, CLEAR, 0.0),
        }
    };
    if fill[3] > 0.02 || bw > 0.0 {
        draw.outline(x, y, w, height, fill, border, s.radius, bw, 1.0);
    }

    for i in 0..n {
        if vis[i] < 0.08 || rh[i] < s.font * 0.7 {
            continue;
        }
        let on = selected == i as u32;
        let rest = if on {
            lerp(lerp(WELL, INK, 0.35), JADE, 0.16)
        } else {
            CLEAR
        };
        let mut head = if disabled {
            CLEAR
        } else {
            mix_phase(rest, lerp(WELL, JADE, 0.14), lerp(WELL, JADE, 0.22), u[i])
        };
        head[3] *= vis[i];
        if head[3] > 0.02 {
            draw.quad(
                x + 1.0,
                hy[i],
                (w - 2.0).max(1.0),
                rh[i].max(1.0),
                head,
                0.0,
                1.0,
            );
        }

        let mx = x + inset + nodes[i].depth as f32 * indent;
        let my = hy[i] + (rh[i] - gem).max(0.0) * 0.5;
        let hover = u[i].min(1.0);
        let mut mark_c = if disabled {
            MUTED
        } else if nodes[i].slot.is_some() {
            lerp(MUTED, JADE, t[i].max(hover))
        } else if on {
            JADE
        } else {
            MUTED
        };
        mark_c[3] *= vis[i];
        if nodes[i].slot.is_some() {
            paint_mark(draw, mx, my, gem, t[i], mark_c, scale[i]);
        } else {
            paint_leaf(draw, mx, my, gem, mark_c, scale[i]);
        }

        let mut title_c = if disabled {
            MUTED
        } else if on {
            JADE
        } else {
            lerp(FG, JADE, hover.max(t[i] * 0.25))
        };
        title_c[3] *= vis[i];
        let tx = mx + gem + s.gap;
        let ty = hy[i] + (rh[i] - s.font).max(0.0) * 0.5;
        let lw = nodes[i].label.chars().count() as f32 * s.font * MONO_ADVANCE;
        draw.label_swoop(
            nodes[i].label,
            tx,
            ty,
            s.font,
            title_c,
            scale[i],
            tx + lw * 0.5,
            hy[i] + rh[i] * 0.5,
            0.0,
            0.0,
        );
    }

    if disabled {
        let mut wash = SCRIM;
        wash[3] *= 0.25;
        draw.outline(x, y, w, height, wash, CLEAR, s.radius, 0.0, 1.0);
    }

    let mut ev = TreeEvent {
        toggle: None,
        select: None,
        height,
    };
    if disabled {
        return ev;
    }
    for i in 0..n {
        if hot[i] && ptr.pressed {
            ev.select = Some(i as u32);
            ev.toggle = nodes[i].slot;
            break;
        }
    }
    ev
}

fn slot_hover(i: usize) -> u32 {
    16 + i as u32
}

fn slot_press(i: usize) -> u32 {
    32 + i as u32
}

fn ancestor_open(nodes: &[TreeNode], t: &[f32], i: usize) -> f32 {
    let mut vis = 1.0;
    let mut depth = nodes[i].depth;
    if depth == 0 {
        return 1.0;
    }
    for j in (0..i).rev() {
        let d = nodes[j].depth;
        if d < depth {
            vis *= t[j].clamp(0.0, 1.0);
            depth = d;
            if depth == 0 {
                break;
            }
        }
    }
    vis.clamp(0.0, 1.0)
}

fn paint_mark(
    draw: &mut DrawList,
    gx: f32,
    gy: f32,
    gem: f32,
    t: f32,
    color: [f32; 4],
    scale: f32,
) {
    let bar = gem * 0.5;
    let th = 2.0;
    let cx = gx + gem * 0.5;
    let cy = gy + gem * 0.5;
    draw.quad(cx - bar * 0.5, cy - th * 0.5, bar, th, color, 1.0, scale);
    let vt = 1.0 - t;
    if vt > 0.02 {
        let mut v = color;
        v[3] *= vt;
        draw.quad(cx - th * 0.5, cy - bar * 0.5, th, bar, v, 1.0, scale);
    }
}

fn paint_leaf(draw: &mut DrawList, gx: f32, gy: f32, gem: f32, color: [f32; 4], scale: f32) {
    let d = (gem * 0.28).max(3.0);
    let cx = gx + (gem - d) * 0.5;
    let cy = gy + (gem - d) * 0.5;
    draw.quad(cx, cy, d, d, color, d * 0.5, scale);
}

fn mix_phase(rest: [f32; 4], hover: [f32; 4], press: [f32; 4], u: f32) -> [f32; 4] {
    if u <= 1.0 {
        lerp(rest, hover, u)
    } else {
        lerp(hover, press, u - 1.0)
    }
}

fn apply(ev: TreeEvent, seed: &mut crate::ui::SeedState) -> f32 {
    if ev.select.is_some() || ev.toggle.is_some() {
        seed.clicks += 1;
    }
    if let Some(i) = ev.select {
        seed.choice = i;
    }
    if let Some(slot) = ev.toggle {
        let i = slot as usize;
        if i < seed.on.len() {
            seed.on[i] = !seed.on[i];
        }
    }
    ev.height
}

fn on_bits(on: &[bool; 8]) -> String {
    let mut buf = String::from("on[");
    for (i, b) in on.iter().enumerate() {
        if i > 0 {
            buf.push(' ');
        }
        buf.push(if *b { '1' } else { '0' });
    }
    buf.push(']');
    buf
}

const NODES: &[TreeNode] = &[
    TreeNode {
        label: "crates",
        depth: 0,
        slot: Some(1),
    },
    TreeNode {
        label: "kussetsu",
        depth: 1,
        slot: Some(3),
    },
    TreeNode {
        label: "button.rs",
        depth: 2,
        slot: None,
    },
    TreeNode {
        label: "switch.rs",
        depth: 2,
        slot: None,
    },
    TreeNode {
        label: "dialog.rs",
        depth: 2,
        slot: None,
    },
    TreeNode {
        label: "site",
        depth: 1,
        slot: Some(0),
    },
    TreeNode {
        label: "main.rs",
        depth: 2,
        slot: None,
    },
    TreeNode {
        label: "docs",
        depth: 0,
        slot: Some(6),
    },
    TreeNode {
        label: "AGENTS.md",
        depth: 1,
        slot: None,
    },
];

const MINI: &[TreeNode] = &[
    TreeNode {
        label: "src",
        depth: 0,
        slot: Some(2),
    },
    TreeNode {
        label: "ui.rs",
        depth: 1,
        slot: None,
    },
    TreeNode {
        label: "draw.rs",
        depth: 1,
        slot: None,
    },
];

pub fn story(
    draw: &mut DrawList,
    ptr: Pointer,
    motion: &mut Motion,
    dt: f32,
    seed: &mut crate::ui::SeedState,
    x0: f32,
    y0: f32,
) {
    let name = NODES
        .get(seed.choice as usize)
        .map(|n| n.label)
        .unwrap_or("none");
    draw.label(
        format!(
            "Parent owns expanded. {} · {} · {} clicks",
            on_bits(&seed.on),
            name,
            seed.clicks
        ),
        36.0 + x0,
        36.0 + y0,
        14.0,
        MUTED,
    );

    let x = 36.0 + x0;
    let w = 400.0;
    let mut y = 72.0 + y0;
    y += apply(
        tree(
            draw,
            ptr,
            motion,
            dt,
            x,
            y,
            w,
            NODES,
            &seed.on,
            seed.choice,
            TreeKind::Well,
            TreeSize::Md,
            false,
        ),
        seed,
    ) + 18.0;

    draw.label("Sm Well · Md Outline · Lg Ghost", x, y, 12.0, MUTED);
    y += 18.0;
    let col = 176.0;
    let gap = 12.0;
    let sm = tree(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        col,
        MINI,
        &seed.on,
        seed.choice,
        TreeKind::Well,
        TreeSize::Sm,
        false,
    );
    let md = tree(
        draw,
        ptr,
        motion,
        dt,
        x + col + gap,
        y,
        col,
        MINI,
        &seed.on,
        seed.choice,
        TreeKind::Outline,
        TreeSize::Md,
        false,
    );
    let lg = tree(
        draw,
        ptr,
        motion,
        dt,
        x + (col + gap) * 2.0,
        y,
        col,
        MINI,
        &seed.on,
        seed.choice,
        TreeKind::Ghost,
        TreeSize::Lg,
        false,
    );
    let h = apply(sm, seed).max(apply(md, seed)).max(apply(lg, seed));
    y += h + 18.0;

    draw.label("Disabled", x, y, 12.0, MUTED);
    y += 18.0;
    let _ = tree(
        draw,
        ptr,
        motion,
        dt,
        x,
        y,
        w,
        MINI,
        &[true; 8],
        0,
        TreeKind::Well,
        TreeSize::Md,
        true,
    );
}
