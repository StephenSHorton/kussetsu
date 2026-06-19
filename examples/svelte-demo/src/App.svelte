<script lang="ts">
  import { hasWebGPU } from "@glaze/core";
  import Glass from "./Glass.svelte";

  let showBanner = $state(!hasWebGPU());
</script>

<header class="topnav">
  <span class="brand">Glaze</span>
  <a class="gh" href="https://github.com/StephenSHorton/glaze" target="_blank" rel="noopener noreferrer">
    GitHub ↗
  </a>
</header>

{#if showBanner}
  <div class="banner" role="status">
    <span>
      This demo renders with <strong>WebGPU</strong> — best in Chrome/Edge or Safari 26+.
      Your browser is showing the CSS-glass fallback.
    </span>
    <button class="dismiss" onclick={() => (showBanner = false)} aria-label="Dismiss">✕</button>
  </div>
{/if}

<Glass />

<style>
  :global(body) {
    margin: 0;
    background: #05060c;
    color: #e7e9f3;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55;
  }

  .topnav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem 1.25rem 0.25rem;
  }
  .brand {
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .gh {
    color: #c9cde0;
    text-decoration: none;
    font-size: 0.9rem;
    border: 1px solid #1d2236;
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
  }
  .gh:hover {
    color: #fff;
    border-color: #2a3050;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    max-width: 1072px;
    margin: 0.75rem auto 0;
    padding: 0.6rem 1rem;
    background: #161106;
    border: 1px solid #4a3a12;
    color: #f5d58a;
    border-radius: 10px;
    font-size: 0.9rem;
  }
  .banner span {
    flex: 1;
  }
  .dismiss {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0.2rem;
  }
</style>
