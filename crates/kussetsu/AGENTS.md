# kussetsu — agent contract (Rust)

Read this before adding a component. Copy **Button**, **Switch**, or **Dialog**. Do not invent a second kit. Do not edit the React/TS tree (`src/ui/*.tsx`).

## Files

One component = one crate file. One story = one function, or a new `src/stories/<slug>.rs` if the story is large.

```
crates/kussetsu/src/button.rs     # exemplar: stateless click
crates/kussetsu/src/switch.rs     # exemplar: controlled bool + Motion
crates/kussetsu/src/dialog.rs     # exemplar: overlay
crates/kussetsu/src/lens.rs       # cursor magnifier (host composites the shader)
crates/kussetsu/src/glass.rs      # IOR pane (host composites over the scene RT)
crates/kussetsu/src/rain.rs       # glyph rain backdrop (Suzuri compositor)
crates/kussetsu/src/tokens.rs     # colors / sizes — import, never invent hex
crates/kussetsu/src/catalog.rs    # CATALOG[] + paint() match — integrator merges one line
```

Do not edit another agent’s `.rs`. If two agents need `catalog.rs`, they only add **one match arm** and **one `Entry`**.

## API

| Kind | Copy | Pattern |
|---|---|---|
| Stateless + click | `button.rs` | `kind`, `size`, `disabled` + `Motion` → `bool` clicked |
| Controlled value | `switch.rs` | parent owns `checked`; use `Motion::spring` |
| Overlay | `dialog.rs` | parent owns open; `apply_close` (opening mouse-up is ignored; exit swoop before unmount) |
| Magnifier | `lens.rs` | parent owns `Lens`; pinch / ⌃⌘-scroll; host samples the scene RT |
| Glass | `glass.rs` | `pane(draw, rect, Glass::vanilla())`; host IOR pass over rain/scene |
| Rain | `rain.rs` | `enable(draw)`; host fills the scene RT (Suzuri GlyphRain) |

- Parent owns state. Never store `checked` / `open` only inside the widget.
- `disabled` swallows clicks.
- Sizes: `ButtonSize::{Sm,Md,Lg}` from `tokens`.
- Variants: enums, not bool piles.
- Paint-only hover scale via `outline(..., scale)`. Do not change layout boxes on hover.

## Look

Inkstone + jade. `tokens::JADE` for primary. No new greens.

Do not add rain/IOR/cube shaders to a widget. Do not add HTML/CSS/DOM.

## Done

1. `cargo build -p kussetsu-site` succeeds.
2. `CATALOG` has `status: Done` and `paint()` has a live arm (not the pending text).
3. Story is clickable on **both** `cargo run -p kussetsu-site -- --catalog` and `http://localhost:8765/ui.html?c=<slug>`.

## Do not

- Editor / Chart / Native Menu / Data Table. Table and Date Picker are in the kit.
- Restyle the rail, header, or hero.
- Change `draw.rs` pipelines or `site` wgpu code unless the task is the host.
- Touch `kussetsu-react` / `src/ui/*.tsx`.

## What stays with the human

Chrome bugs (native vs web rail, fonts, scroll, canvas focus, swapchain). Report those; do not “fix” the host to ship a Badge.
