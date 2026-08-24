//! Glyph atlas for kussetsu rain — same charset/layout as Suzuri `rain_atlas.rs`.
//!
//! Native rasterizes at runtime from the system CJK face (Hiragino on macOS).
//! Wasm uploads a dump of that atlas (`rain_atlas.bin`) so the catalog is not
//! stuck with IBM Plex cells and empty halfwidth katakana.

use wgpu::util::DeviceExt;

#[cfg(not(target_arch = "wasm32"))]
const CELL_PX: u32 = 64;

pub struct RainAtlas {
    pub view: wgpu::TextureView,
    pub count: f32,
    pub grid: f32,
}

struct AtlasCpu {
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    count: f32,
    grid: f32,
}

impl RainAtlas {
    pub fn build(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let cpu = raster_cpu();
        let texture = device.create_texture_with_data(
            queue,
            &wgpu::TextureDescriptor {
                label: Some("rain-atlas"),
                size: wgpu::Extent3d {
                    width: cpu.width,
                    height: cpu.height,
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
            &cpu.pixels,
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self {
            view,
            count: cpu.count,
            grid: cpu.grid,
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn rain_glyphs() -> Vec<char> {
    let mut v = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for ch in kussetsu::rain::CHARSET.chars() {
        if ch.is_whitespace() {
            continue;
        }
        if seen.insert(ch) {
            v.push(ch);
        }
    }
    if v.is_empty() {
        v.extend(['0', '1']);
    }
    v
}

#[cfg(not(target_arch = "wasm32"))]
fn raster_cpu() -> AtlasCpu {
    use glyphon::{Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, SwashCache};

    let glyphs = rain_glyphs();
    let count = glyphs.len() as u32;
    let grid = ((count as f32).sqrt().ceil() as u32).max(1);
    let width = grid * CELL_PX;
    let height = grid * CELL_PX;
    let mut pixels = vec![0u8; (width * height * 4) as usize];

    let mut font_system = FontSystem::new();
    let mut swash = SwashCache::new();
    let font_px = (CELL_PX as f32 * 0.72).round();
    let metrics = Metrics::new(font_px, CELL_PX as f32);
    let family = rain_family_name(&font_system);
    let attrs = Attrs::new().family(Family::Name(family.as_str()));

    for (i, ch) in glyphs.iter().enumerate() {
        let gx = (i as u32) % grid;
        let gy = (i as u32) / grid;
        let origin_x = (gx * CELL_PX) as i32;
        let origin_y = (gy * CELL_PX) as i32;
        let mut buffer = Buffer::new(&mut font_system, metrics);
        buffer.set_size(
            &mut font_system,
            Some(CELL_PX as f32),
            Some(CELL_PX as f32),
        );
        buffer.set_text(
            &mut font_system,
            &ch.to_string(),
            attrs,
            Shaping::Advanced,
        );
        buffer.shape_until_scroll(&mut font_system, false);
        let cx = CELL_PX as f32 * 0.5;
        let cy = CELL_PX as f32 * 0.5;
        let mut draw_dx = 0i32;
        let mut draw_dy = 0i32;
        if let Some(run) = buffer.layout_runs().next() {
            if let Some(g) = run.glyphs.first() {
                draw_dx = (cx - g.x - g.w * 0.5) as i32;
                draw_dy = (cy - run.line_y) as i32;
            }
        }
        buffer.draw(
            &mut font_system,
            &mut swash,
            Color::rgb(255, 255, 255),
            |x, y, w, h, color| {
                let a = color.a();
                if a == 0 {
                    return;
                }
                for oy in 0..h as i32 {
                    for ox in 0..w as i32 {
                        let px = origin_x + x + ox + draw_dx;
                        let py = origin_y + y + oy + draw_dy;
                        if px < 0 || py < 0 {
                            continue;
                        }
                        let px = px as u32;
                        let py = py as u32;
                        if px >= width || py >= height {
                            continue;
                        }
                        let idx = ((py * width + px) * 4) as usize;
                        if a > pixels[idx + 3] {
                            pixels[idx] = 255;
                            pixels[idx + 1] = 255;
                            pixels[idx + 2] = 255;
                            pixels[idx + 3] = a;
                        }
                    }
                }
            },
        );
    }

    AtlasCpu {
        pixels,
        width,
        height,
        count: count as f32,
        grid: grid as f32,
    }
}

#[cfg(target_arch = "wasm32")]
fn raster_cpu() -> AtlasCpu {
    load_bin(include_bytes!("rain_atlas.bin"))
}

#[cfg(target_arch = "wasm32")]
fn load_bin(bytes: &[u8]) -> AtlasCpu {
    assert!(
        bytes.len() >= 16,
        "rain_atlas.bin is truncated ({} bytes)",
        bytes.len()
    );
    let width = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    let height = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    let count = f32::from_le_bytes(bytes[8..12].try_into().unwrap());
    let grid = f32::from_le_bytes(bytes[12..16].try_into().unwrap());
    let pixels = bytes[16..].to_vec();
    let expect = (width as usize)
        .saturating_mul(height as usize)
        .saturating_mul(4);
    assert_eq!(
        pixels.len(),
        expect,
        "rain_atlas.bin pixel size mismatch"
    );
    AtlasCpu {
        pixels,
        width,
        height,
        count,
        grid,
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn dump_bin(path: &std::path::Path) {
    let cpu = raster_cpu();
    let mut buf = Vec::with_capacity(16 + cpu.pixels.len());
    buf.extend_from_slice(&cpu.width.to_le_bytes());
    buf.extend_from_slice(&cpu.height.to_le_bytes());
    buf.extend_from_slice(&cpu.count.to_le_bytes());
    buf.extend_from_slice(&cpu.grid.to_le_bytes());
    buf.extend_from_slice(&cpu.pixels);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(path, &buf).expect("write rain_atlas.bin");
    let ink = cpu
        .pixels
        .chunks(4)
        .filter(|p| p[3] > 8)
        .count();
    eprintln!(
        "rain atlas {}×{} count={} grid={} ink={} → {}",
        cpu.width,
        cpu.height,
        cpu.count,
        cpu.grid,
        ink,
        path.display()
    );
}

#[cfg(not(target_arch = "wasm32"))]
fn rain_family_name(font_system: &glyphon::FontSystem) -> String {
    let preferred: &[&str] = if cfg!(target_os = "macos") {
        &[
            "Hiragino Sans",
            "Hiragino Kaku Gothic ProN",
            "Hiragino Maru Gothic Pro",
        ]
    } else if cfg!(target_os = "windows") {
        &["Yu Gothic", "Yu Gothic UI", "Meiryo", "Segoe UI"]
    } else {
        &["Noto Sans CJK JP", "Noto Sans CJK", "IBM Plex Mono"]
    };
    let faces: Vec<String> = font_system
        .db()
        .faces()
        .flat_map(|f| f.families.iter().map(|(n, _)| n.clone()))
        .collect();
    for want in preferred {
        for name in &faces {
            if name.eq_ignore_ascii_case(want) {
                return name.clone();
            }
        }
    }
    faces
        .first()
        .cloned()
        .unwrap_or_else(|| "IBM Plex Mono".into())
}
