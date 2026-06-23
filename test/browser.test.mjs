// Headless-WebGPU smoke test — the one check the rest of the suite can't do.
//
// The Node tests (compat/reconciler/pure-layer) and `vite build` never touch a GPU, so a WGSL
// compile/validation error is invisible to them: it only surfaces when the GPU CREATES or USES a
// pipeline in a browser (e.g. the box-shadow `fwidth`-in-non-uniform-control-flow bug, which
// blanked every shadowed frame while every headless check stayed green). This mounts the BUILT
// demo in real (headless, software) WebGPU and asserts the renderer comes up clean: a WebGPU
// adapter is present, a <canvas> mounts, the WebGPU-unsupported fallback is NOT shown
// (createGpuRoot succeeded), and NO GPU/shader/renderer error reaches the console (the Painter
// logs `uncapturederror` + device-loss, so a bad pipeline shows up here).
//
// Run: npm run build && node test/browser.test.mjs   (needs `npx playwright install chromium`)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist-site/", import.meta.url));
const BASE_PREFIX = "/kussetsu"; // vite build base (GitHub Pages: /<repo>/)
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".ico": "image/x-icon",
};

// Minimal static server for dist-site, under the build's /kussetsu/ base.
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.startsWith(BASE_PREFIX)) p = p.slice(BASE_PREFIX.length) || "/";
    if (p === "/" || p.endsWith("/")) p += "index.html";
    const file = normalize(join(DIST, p));
    if (!file.startsWith(DIST)) return void res.writeHead(403).end();
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}${BASE_PREFIX}`;

let pass = 0,
  fail = 0;
const ok = (name, cond, detail) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
};

// `channel: "chromium"` = the full Chromium (new headless) — the headless-shell has NO WebGPU.
// --enable-unsafe-swiftshader gives software WebGPU so GPU-less CI runners get an adapter.
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-swiftshader", "--no-sandbox"] });
const GPU_ERR = /uncaptured|wgsl|createRenderPipeline|createShaderModule|gpu-renderer (caught|uncaught)|is not a function|device lost/i;

// Smoke the marketing front door + the kitchen sink (exercises rects/text/glass/material/shadow/opacity/scroll).
for (const route of ["/", "/?kitchen"]) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(base + route, { waitUntil: "load" });

  const hasGPU = await page.evaluate(async () => !!navigator.gpu && !!(await navigator.gpu.requestAdapter()));
  ok(`${route} — WebGPU adapter available`, hasGPU); // else the rest is meaningless (would pass on the fallback)

  await page.waitForSelector("canvas", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500); // let the first GPU frames run (createGpuRoot is async)

  ok(`${route} — a <canvas> is mounted`, await page.evaluate(() => !!document.querySelector("canvas")));
  ok(`${route} — did not fall back (createGpuRoot succeeded)`, !(await page.evaluate(() => document.body.innerText.includes("WebGPU-capable browser"))));

  const gpuErr = errors.find((e) => GPU_ERR.test(e));
  ok(`${route} — no GPU/shader errors on the console`, !gpuErr, gpuErr);

  await page.close();
}

await browser.close();
server.close();
console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
