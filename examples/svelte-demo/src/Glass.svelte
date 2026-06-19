<script lang="ts">
  import { GlassScene, GlassPanel } from "@glaze/svelte";

  // Base-aware asset URL so the grass loads under GitHub Pages' /glaze/ subpath.
  const assetBase = import.meta.env.BASE_URL;

  let temp = $state(64);
  const hours = [
    ["Now", "64°"],
    ["2 PM", "66°"],
    ["3 PM", "65°"],
    ["4 PM", "63°"],
    ["5 PM", "61°"],
  ];

  // Live glass parameters — these are the GlassPanel defaults.
  const DEFAULTS = { radius: 30, blur: 0, refraction: 0.05, dispersion: 0.006, rim: 0.05, tint: 0.04, specular: 1 };
  const DEFAULT_COLOR = "#e6ebf2"; // the default glass color (cool off-white)
  let p = $state({ ...DEFAULTS });
  let color = $state(DEFAULT_COLOR);

  type Key = keyof typeof DEFAULTS;
  const controls: { key: Key; label: string; min: number; max: number; step: number }[] = [
    { key: "radius", label: "Radius", min: 0, max: 60, step: 1 },
    { key: "blur", label: "Frost", min: 0, max: 20, step: 0.5 },
    { key: "refraction", label: "Refraction", min: 0, max: 0.15, step: 0.005 },
    { key: "dispersion", label: "Dispersion", min: 0, max: 0.03, step: 0.001 },
    { key: "rim", label: "Rim width", min: 0.01, max: 0.2, step: 0.005 },
    { key: "tint", label: "Tint", min: 0, max: 0.4, step: 0.01 },
    { key: "specular", label: "Specular", min: 0, max: 2, step: 0.05 },
  ];

  function reset() {
    p = { ...DEFAULTS };
    color = DEFAULT_COLOR;
  }
</script>

<GlassScene class="stage">
  <div class="bg" style="background-image: url('{assetBase}grass.jpg');"></div>
  <h1 class="headline">read me through the glass</h1>
  <p class="hint">
    Everything here is normal DOM. Drag the card over the headline — and tune the
    glass live with the panel on the right.
  </p>

  <div class="dock">
    <GlassPanel
      class="card"
      radius={p.radius}
      blur={p.blur}
      refraction={p.refraction}
      dispersion={p.dispersion}
      rim={p.rim}
      color={color}
      tint={p.tint}
      specular={p.specular}
      drag={true}
    >
      <header>
        <div>
          <p class="place">San Francisco</p>
          <p class="cond">Partly Cloudy</p>
        </div>
        <p class="temp">{temp}°</p>
      </header>
      <input type="range" min="40" max="100" bind:value={temp} aria-label="temperature" />
      <ul>
        {#each hours as [t, v]}
          <li><span>{t}</span><b>{v}</b></li>
        {/each}
      </ul>
      <a href="#forecast">7-day forecast →</a>
    </GlassPanel>
  </div>
</GlassScene>

<aside class="controls">
  <div class="controls-head">
    <strong>Glass</strong>
    <button onclick={reset}>Reset</button>
  </div>
  <label class="color-row">
    <span>Color<b>{color}</b></span>
    <input type="color" bind:value={color} />
  </label>
  {#each controls as c}
    <label>
      <span>{c.label}<b>{p[c.key]}</b></span>
      <input type="range" min={c.min} max={c.max} step={c.step} bind:value={p[c.key]} />
    </label>
  {/each}
</aside>

<style>
  :global(.stage) {
    max-width: 1100px;
    margin: 1rem auto 4rem;
    min-height: 84vh;
    border-radius: 26px;
    overflow: hidden;
    color: #fff;
  }

  .bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .headline {
    position: absolute;
    top: 52%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    width: 90%;
    text-align: center;
    font-size: 44px;
    font-weight: 700;
    text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  .hint {
    position: absolute;
    top: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    width: min(46ch, 80%);
    text-align: center;
    font-size: 0.95rem;
    line-height: 1.5;
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.6);
  }

  .dock {
    position: relative;
    z-index: 1;
    min-height: 84vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Glass card. border-radius is driven by the GlassPanel (inline) from the
     slider; overflow:hidden clips the canvas to that radius. */
  :global(.card) {
    width: 340px;
    padding: 1.4rem 1.5rem 1.2rem;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow:
      0 18px 50px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.55);
  }
  :global(.card header) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  :global(.card .place) {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  :global(.card .cond) {
    margin: 0.15rem 0 0;
    opacity: 0.95;
    font-size: 0.9rem;
  }
  :global(.card .temp) {
    margin: 0;
    font-size: 2.6rem;
    font-weight: 300;
    line-height: 1;
  }
  :global(.card input[type="range"]) {
    width: 100%;
    margin: 1rem 0 0;
  }
  :global(.card ul) {
    list-style: none;
    display: flex;
    justify-content: space-between;
    gap: 0.25rem;
    margin: 1rem 0 0;
    padding: 0.9rem 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.25);
  }
  :global(.card li) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }
  :global(.card a) {
    display: inline-block;
    margin-top: 1rem;
    color: #fff;
    font-size: 0.9rem;
  }

  /* Live controls — normal DOM, outside the scene (not captured). */
  .controls {
    position: fixed;
    top: 64px;
    right: 16px;
    width: 220px;
    padding: 0.9rem 1rem 1.1rem;
    background: rgba(10, 13, 24, 0.92);
    border: 1px solid #1d2236;
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
    z-index: 10;
    font-size: 0.82rem;
  }
  .controls-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }
  .controls-head button {
    background: #161b2e;
    color: #c9cde0;
    border: 1px solid #2a3050;
    border-radius: 8px;
    padding: 0.2rem 0.6rem;
    font: inherit;
    cursor: pointer;
  }
  .controls label {
    display: block;
    margin-top: 0.7rem;
  }
  .controls label span {
    display: flex;
    justify-content: space-between;
    color: #c9cde0;
    margin-bottom: 0.2rem;
  }
  .controls label b {
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .controls input[type="range"] {
    width: 100%;
  }
  .color-row input[type="color"] {
    width: 100%;
    height: 28px;
    padding: 0;
    border: 1px solid #2a3050;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }
</style>
