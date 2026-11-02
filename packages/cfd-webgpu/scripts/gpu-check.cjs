#!/usr/bin/env node
/**
 * Mini-design 006, case 4: the WGSL kernels must reproduce the TypeScript
 * reference solver (max |Δu| < 1e-5, max |Δρ| < 1e-6, lattice units).
 *
 *   pnpm test:gpu
 *
 * Starts Vite on the harness page, opens it in a headless Chromium with
 * WebGPU (SwiftShader, the software adapter, when there is no GPU) and reads
 * the report. Needs Playwright with its Chromium, as scripts/capture-docs.cjs.
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Falta Playwright: npm i -g playwright && npx playwright install chromium (y NODE_PATH=$(npm root -g)).");
  process.exit(1);
}

const PORT = 5199;
// node gpu-check.cjs [--case sphere-re100 --d 10 --passes 4]
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const CASE = arg("case", null);
const ROOT = path.resolve(__dirname, "gpu-harness");
const TOL_U = 1e-5;
const TOL_RHO = 1e-6;
const TOL_FORCE = 1e-4;

(async () => {
  const viteBin = path.join(path.dirname(require.resolve("vite/package.json", { paths: [path.resolve(__dirname, "../../app")] })), "bin", "vite.js");
  const vite = spawn(process.execPath, [viteBin, "serve", ROOT, "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => vite.stdout.on("data", (d) => String(d).includes("Local") && resolve()));
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-webgpu-adapter=swiftshader"] });
  let ok = false;
  try {
    const page = await browser.newPage();
    page.on("console", (m) => m.type() === "error" && console.error(m.text()));
    const query = CASE === null ? "" : `?case=${CASE}&d=${arg("d", "10")}&passes=${arg("passes", "4")}`;
    await page.goto(`http://localhost:${PORT}/${query}`);
    await page.waitForFunction(() => window.__result !== undefined, null, { timeout: 600000 });
    const result = await page.evaluate(() => window.__result);
    if (result.error) throw new Error(result.error);
    console.log(`Adaptador: ${result.adapter}`);
    if (result.outcome) {
      const o = result.outcome;
      ok = o.pass;
      console.log(`${o.pass ? "✓" : "✗"} ${result.case.name}: CD ${o.cd.toFixed(4)} frente a ${result.case.cd.min}–${result.case.cd.max} (error ${(100 * o.error).toFixed(2)} %, tolerancia ±${100 * result.case.tolerance} %), ${o.cells} celdas, ${o.steps} pasos, ${o.seconds.toFixed(0)} s`);
      return;
    }
    ok = true;
    for (const r of result.reports) {
      const pass = r.maxDu < TOL_U && r.maxDrho < TOL_RHO && r.maxDforceRel < TOL_FORCE;
      ok &&= pass;
      console.log(`${pass ? "✓" : "✗"} ${r.name}, ${r.steps} pasos: |Δu| ${r.maxDu.toExponential(2)} (< ${TOL_U}), |Δρ| ${r.maxDrho.toExponential(2)} (< ${TOL_RHO}), fuerza ${r.maxDforceRel.toExponential(2)} relativa`);
      console.log(`   F cpu ${r.forceCpu.map((v) => v.toExponential(4)).join(" ")} · gpu ${r.forceGpu.map((v) => v.toExponential(4)).join(" ")}`);
    }
  } catch (e) {
    console.error(String(e));
  } finally {
    await browser.close();
    vite.kill();
  }
  process.exit(ok ? 0 : 1);
})();
