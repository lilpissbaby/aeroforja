#!/usr/bin/env node
/**
 * Captures the screenshots and the animation of the README by driving the
 * real app in a headless Chromium.
 *
 *   pnpm build && pnpm preview          # in one terminal (http://localhost:4173)
 *   pnpm docs:capture                   # in another; writes docs/img/
 *
 * Needs Playwright with its Chromium (`npm i -g playwright` and
 * `npx playwright install chromium`) and, for the animated GIF only, ffmpeg.
 * The PNGs come out at 2× pixel density; scripts/optimize-docs-images.py
 * scales and compresses them for the repository.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Falta Playwright: npm i -g playwright && npx playwright install chromium (y NODE_PATH=$(npm root -g)).");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "img");
const BASE = process.argv[2] ?? "http://localhost:4173/";
const STORE_KEY = "aeroforja.workbench.v1";
const TOUR_KEY = "aeroforja.tour.v1";
const EXAMPLE_MODEL = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "mass-model.example.json"), "utf8"));
const PROJECT = "Quad de 5 pulgadas";
const VIEWPORT = { width: 1600, height: 1000 };

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aeroforja-docs-"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const done = [];

// ---------- helpers ----------

/**
 * A page of the app's origin that does not run the app. The app saves its
 * state when the page is left, so the seed is written only after leaving it,
 * from here, and then the app is opened again.
 */
let staticUrl = null;
async function leaveApp(page) {
  if (staticUrl === null) {
    const html = await (await page.request.get(BASE)).text();
    const href = /href="([^"]+\.css)"/.exec(html)?.[1];
    if (href === undefined) throw new Error("No encuentro un archivo estático de la app en " + BASE);
    staticUrl = new URL(href, BASE).href;
  }
  await page.goto(staticUrl);
}

async function fresh(page, { projectName = PROJECT, planform = null, theme = "light", tourSeen = true } = {}) {
  await leaveApp(page);
  await page.evaluate(
    ({ key, tourKey, data, tourSeen }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(data));
      if (tourSeen) localStorage.setItem(tourKey, "done");
    },
    { key: STORE_KEY, tourKey: TOUR_KEY, data: { projectName, model: EXAMPLE_MODEL, theme, planform }, tourSeen },
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".plan-canvas, .viewer canvas");
  await pause(1200);
}

/**
 * The project as the app saved it in the browser. The app writes it 300 ms
 * after a change; switching the theme and back forces a write.
 */
async function saved(page) {
  const theme = page.locator(".theme-select select");
  const current = await theme.inputValue();
  await theme.selectOption(current === "dark" ? "light" : "dark");
  await theme.selectOption(current);
  await pause(450);
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORE_KEY);
}

async function reloadWith(page, mutate) {
  const data = await saved(page);
  mutate(data);
  await leaveApp(page);
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORE_KEY, data });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".plan-canvas, .viewer canvas");
  await pause(1200);
}

async function shot(page, name, target, pad = 0) {
  const file = path.join(OUT, `${name}.png`);
  if (pad > 0 && typeof target === "string") {
    await page.locator(target).first().scrollIntoViewIfNeeded();
    const b = await page.locator(target).first().boundingBox();
    const vp = page.viewportSize();
    const x = Math.max(0, b.x - pad);
    const y = Math.max(0, b.y - pad);
    await page.screenshot({
      path: file,
      clip: { x, y, width: Math.min(vp.width - x, b.width + 2 * pad), height: Math.min(vp.height - y, b.height + 2 * pad) },
    });
  } else if (target === undefined) await page.screenshot({ path: file });
  else if (typeof target === "string") await page.locator(target).first().screenshot({ path: file });
  else if ("x" in target) await page.screenshot({ path: file, clip: target });
  else await target.screenshot({ path: file });
  done.push(name);
  console.log("  ✓", name);
}

/** Screen position of a plan point (x forward, y right, in mm), read from the editor's own axes and rulers. */
async function planToClient(page, xMm, yMm) {
  const m = await page.evaluate(() => {
    const svg = document.querySelector("svg.plan-canvas");
    const box = svg.getBoundingClientRect();
    const axes = [...svg.querySelectorAll("line.axis")];
    const labels = [...svg.querySelectorAll("text.ruler")]
      .filter((t) => t.getAttribute("text-anchor") === "middle")
      .map((t) => ({ x: Number(t.getAttribute("x")), v: Number(t.textContent.replace(/\./g, "").replace(",", ".").replace("−", "-")) }));
    const a = labels[0];
    const b = labels[labels.length - 1];
    return {
      left: box.left,
      top: box.top,
      ox: Number(axes[0].getAttribute("x1")),
      oy: Number(axes[1].getAttribute("y1")),
      scale: (b.x - a.x) / (b.v - a.v),
    };
  });
  return { x: m.left + m.ox + yMm * m.scale, y: m.top + m.oy - xMm * m.scale };
}

async function clickPlan(page, xMm, yMm) {
  const p = await planToClient(page, xMm, yMm);
  await page.mouse.click(p.x, p.y);
}

async function dragPlan(page, from, to, steps = 8) {
  const a = await planToClient(page, ...from);
  const b = await planToClient(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  return b;
}

const tool = (page, name) => page.locator(".plan-toolbar").getByRole("button", { name, exact: true }).click();
const elementType = (page, value) => page.locator(".plan-toolbar select").first().selectOption(value);
const view = (page, name) => page.locator(".view-switch").getByRole("tab", { name, exact: true }).click();
const resultsTab = (page, name) => page.locator(".bottom .tabs").getByRole("tab", { name, exact: false }).first().click();
const workspace = ".workspace";

function rect(cx, cy, w, h) {
  return [
    { x: cx + h / 2, y: cy - w / 2 },
    { x: cx + h / 2, y: cy + w / 2 },
    { x: cx - h / 2, y: cy + w / 2 },
    { x: cx - h / 2, y: cy - w / 2 },
  ];
}

async function annotate(page, marks) {
  await page.evaluate((marks) => {
    const layer = document.createElement("div");
    layer.id = "doc-marks";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:200";
    for (const [n, sel, fx, fy] of marks) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dx = r.width * fx - 15;
      const dy = Math.min(r.height * fy, r.height - 34);
      const box = document.createElement("div");
      box.style.cssText = `position:absolute;left:${r.left + 2}px;top:${r.top + 2}px;width:${r.width - 4}px;height:${r.height - 4}px;border:2px dashed #c0392b;border-radius:4px`;
      const badge = document.createElement("div");
      badge.textContent = n;
      badge.style.cssText = `position:absolute;left:${r.left + dx}px;top:${r.top + dy}px;width:30px;height:30px;border-radius:50%;background:#c0392b;color:#fff;font:700 17px/30px Barlow,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.35)`;
      layer.append(box, badge);
    }
    document.body.append(layer);
  }, marks);
}

const unannotate = (page) => page.evaluate(() => document.getElementById("doc-marks")?.remove());

// ---------- scenes ----------

async function overview(page) {
  console.log("Vista general");
  await fresh(page);
  await shot(page, "01-vista-general");
  // [number, element, position of the badge as a fraction of the element's width and height]
  await annotate(page, [
    ["1", ".topbar", 0.47, 0.25],
    ["2", ".left", 0.85, 0.02],
    ["3", ".view-switch", 0.5, 0.1],
    ["4", ".plan-canvas-wrap", 0.9, 0.08],
    ["5", ".viewer", 0.9, 0.2],
    ["6", ".right", 0.85, 0.02],
    ["7", ".bottom", 0.6, 0.06],
  ]);
  await shot(page, "02-mapa-de-la-interfaz");
  await unannotate(page);
  await shot(page, "05-barra-superior", ".topbar");
  await shot(page, "06-panel-planta", ".left");
  await shot(page, "14-barra-de-herramientas", ".plan-toolbar");
  await shot(page, "13b-barra-de-estado", ".plan-status");
}

async function tour(page) {
  console.log("Tour guiado");
  await fresh(page, { tourSeen: false });
  await pause(500);
  await shot(page, "03-tour-bienvenida");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("ArrowRight");
    await pause(250);
  }
  await pause(400);
  await shot(page, "04-tour-herramientas");
  await page.keyboard.press("Escape");
  await pause(300);
}

async function templates(page) {
  console.log("Plantillas");
  await fresh(page);
  const frame = page.locator("details.template", { hasText: "Frame de multirrotor" });
  await frame.locator("#frame-arms").selectOption("6");
  await shot(page, "07-plantilla-frame", 'details.template[open]', 12);
  const field = (label) => frame.getByLabel(label, { exact: true });
  await field("Entre motores").fill("450");
  await field("Entre motores").press("Enter");
  await field("Ø hélice").fill("8");
  await field("Ø hélice").press("Enter");
  await frame.getByRole("button", { name: "Sustituir planta" }).click();
  await pause(1500);
  await shot(page, "08-hexa", workspace);

  const wing = page.locator("details.template", { hasText: "Ala por parámetros" });
  await wing.locator("summary").click();
  await pause(200);
  await frame.locator("summary").click();
  await pause(200);
  await shot(page, "09-plantilla-ala", 'details.template[open]', 12);
  await wing.getByRole("button", { name: "Sustituir planta" }).click();
  await pause(1500);
  await shot(page, "10-ala-volante", workspace);

  await wing.locator("#wing-preset").selectOption("delta-800");
  await wing.getByRole("button", { name: "Sustituir planta" }).click();
  await pause(1500);
  await shot(page, "11-delta", workspace);

  await view(page, "Planta");
  await pause(600);
  await shot(page, "12-vista-planta", workspace);
  await view(page, "3D");
  await pause(1500);
  await shot(page, "13-vista-3d", workspace);
  await view(page, "Planta + 3D");
}

async function drawing(page) {
  console.log("Dibujo");
  await fresh(page, { planform: { elements: [] } });
  await page.locator(".plan-toolbar").getByRole("button", { name: "Encuadrar" }).click();
  await tool(page, "Contorno");
  await elementType(page, "wing");
  // Right half of a small flying wing; symmetry draws the left half.
  const pts = [
    [60, 0],
    [-40, 180],
    [-110, 180],
    [-70, 0],
  ];
  for (const [x, y] of pts.slice(0, 3)) {
    await clickPlan(page, x, y);
    await pause(120);
  }
  const p = await planToClient(page, -70, 30);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await pause(300);
  await shot(page, "15-contorno-dibujando", ".plan-editor");
  const first = await planToClient(page, 60, 0);
  await clickPlan(page, -70, 0);
  await page.mouse.move(first.x + 2, first.y + 2, { steps: 4 });
  await pause(300);
  await shot(page, "16-contorno-cerrar", ".plan-editor");
  await page.mouse.click(first.x, first.y);
  await pause(1200);
  await shot(page, "16b-contorno-en-3d", workspace);

  await tool(page, "Rectángulo");
  await elementType(page, "plate");
  // From the axis outwards: symmetry adds the other half.
  await dragPlan(page, [90, 0], [-60, 25]);
  await pause(300);
  await shot(page, "17-rectangulo", ".plan-editor");
  await page.mouse.up();

  await tool(page, "Círculo");
  await elementType(page, "hole");
  await dragPlan(page, [-40, 110], [-40, 125]);
  await pause(300);
  await shot(page, "18-circulo", ".plan-editor");
  await page.mouse.up();
  await pause(1200);
  await shot(page, "18b-vaciado-en-3d", workspace);
}

async function editing(page) {
  console.log("Edición");
  await fresh(page);
  await page.locator(".left .component-list button", { hasText: "Placa central" }).click();
  await pause(300);
  // Zoom in on the centre plate so the handles and edge lengths are readable.
  const c = await planToClient(page, 0, 0);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -240);
    await pause(80);
  }
  await pause(400);
  await shot(page, "20-seleccion", ".plan-editor");
  // Drag the nose vertex forward: the plate becomes a pointed nose.
  const handles = page.locator('svg.plan-canvas [data-handle="mid"]');
  const mid = await handles.first().boundingBox();
  await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2);
  await page.mouse.down();
  await page.mouse.move(mid.x + mid.width / 2, mid.y - 70, { steps: 8 });
  await page.mouse.up();
  await pause(1200);
  await shot(page, "21-nuevo-vertice", workspace);
  await shot(page, "22-propiedades", ".right");
  await page.locator(".right").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await pause(200);
  await shot(page, "23-geometria", '[data-tour="geometry"]');

  await page.locator(".left .component-list button", { hasText: "Hélice 1" }).click();
  await page.locator(".right").evaluate((el) => (el.scrollTop = 0));
  await pause(400);
  await shot(page, "24-propiedades-helice", ".right");
}

async function layersAndHoles(page) {
  console.log("Capas y vaciados");
  await fresh(page);
  await reloadWith(page, (data) => {
    const t = 0.003;
    const base = { mirror: false, thickness: t, z: 0 };
    data.planform.elements.push(
      { id: "aligerado-1", name: "Aligerado central", role: "hole", shape: "circle", ...base, center: { x: 0, y: 0 }, radius: 0.007 },
      { id: "aligerado-2", name: "Aligerado lateral", role: "hole", shape: "circle", ...base, mirror: true, center: { x: 0, y: 0.016 }, radius: 0.004 },
      {
        id: "placa-sup",
        name: "Placa superior",
        role: "plate",
        shape: "polygon",
        mirror: false,
        thickness: 0.002,
        z: -0.012,
        points: rect(0, 0, 0.042, 0.075),
      },
      {
        id: "ranura",
        name: "Ranura de cinta",
        role: "hole",
        shape: "polygon",
        mirror: true,
        thickness: 0.002,
        z: -0.012,
        points: rect(0, 0.014, 0.004, 0.022),
      },
    );
  });
  await page.locator(".left .component-list button", { hasText: "Placa superior" }).click();
  await pause(1200);
  await shot(page, "25-capas-y-vaciados", workspace);
  await resultsTab(page, "Dibujo");
  await page.locator(".bottom details.method summary").click();
  // A taller results panel for this one capture, so the method and its references fit.
  await page.addStyleTag({ content: ".app{grid-template-rows:auto minmax(0,1fr) 560px !important}" });
  await pause(500);
  await shot(page, "30-resultados-planta", ".bottom");
  await page.locator(".bottom details.method summary").click();
  await page.evaluate(() => document.querySelectorAll("style").forEach((s) => s.textContent.includes("560px") && s.remove()));
  await pause(500);

  await page.locator(".viewer-tools").getByLabel("Piezas de masa y CG").check();
  await view(page, "3D");
  await pause(1500);
  const canvas = page.locator(".viewer canvas");
  const b = await canvas.boundingBox();
  // Orbit a little towards a top view.
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.52, { steps: 10 });
  await page.mouse.up();
  await pause(800);
  await shot(page, "28-visor-3d-con-masas", workspace);
  await page.locator(".viewer-tools").getByLabel("Piezas de masa y CG").uncheck();
  await pause(600);
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await pause(800);
  await shot(page, "29-seleccion-en-3d", ".app");
  await view(page, "Planta + 3D");
}

async function problems(page) {
  console.log("Errores y avisos");
  await fresh(page);
  const frame = page.locator("details.template", { hasText: "Frame de multirrotor" });
  await frame.getByLabel("Ø hélice", { exact: true }).fill("9");
  await frame.getByLabel("Ø hélice", { exact: true }).press("Enter");
  await frame.getByRole("button", { name: "Sustituir planta" }).click();
  await pause(800);
  await reloadWith(page, (data) => {
    data.planform.elements.push({
      id: "lazo",
      name: "Contorno cruzado",
      role: "plate",
      shape: "polygon",
      mirror: false,
      thickness: 0.003,
      z: 0,
      points: [
        { x: -0.06, y: -0.03 },
        { x: -0.1, y: 0.03 },
        { x: -0.1, y: -0.03 },
        { x: -0.06, y: 0.03 },
      ],
    });
  });
  await resultsTab(page, "Avisos");
  await pause(500);
  await shot(page, "27-errores");
  await shot(page, "34-avisos", ".bottom");
}

async function massAndResults(page) {
  console.log("Masas y resultados");
  await fresh(page);
  await page.locator(".topbar").getByLabel("Humedad").fill("60");
  await page.locator(".topbar").getByLabel("Humedad").press("Enter");
  await page.locator(".topbar").getByLabel("Altitud").fill("650");
  await page.locator(".topbar").getByLabel("Altitud").press("Enter");
  await page.locator(".left .tabs").getByRole("tab", { name: "Masas" }).click();
  await page.locator(".left .component-list button", { hasText: "Batería" }).click();
  await page.locator(".viewer-tools").getByLabel("Piezas de masa y CG").check();
  await pause(1500);
  await shot(page, "35-modelo-de-masas");
  await shot(page, "36-propiedades-masa", ".right");
  for (const [tab, name] of [
    ["Masa y CG", "31-resultados-masa"],
    ["Inercia", "32-resultados-inercia"],
    ["Aire", "33-resultados-aire"],
  ]) {
    await resultsTab(page, tab);
    await pause(300);
    await shot(page, name, ".bottom");
  }
  await shot(page, "37-proyecto-json", '[data-tour="project-files"]');
}

async function exports(page) {
  console.log("Exportar");
  await fresh(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(".bottom").getByRole("button", { name: "Descargar SVG 1:1" }).click(),
  ]);
  const svgPath = path.join(tmp, "plan.svg");
  await download.saveAs(svgPath);
  const svg = fs.readFileSync(svgPath, "utf8").replace(/^<\?xml[^>]*>\s*/, "");
  const doc = await page.context().newPage();
  await doc.setViewportSize({ width: 900, height: 700 });
  await doc.setContent(
    `<html><body style="margin:0;background:#fff"><div style="padding:16px;width:860px;box-sizing:border-box">${svg}</div>` +
      `<style>svg{width:100%;height:auto;display:block}</style></body></html>`,
  );
  await shot(doc, "38-svg-1a1", "div");
  await doc.close();
}

async function themes(browser) {
  console.log("Tema oscuro y móvil");
  const dark = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await dark.newPage();
  await fresh(page, { theme: "dark" });
  await page.locator(".left .component-list button", { hasText: "Brazo 1" }).click();
  await pause(800);
  await shot(page, "40-tema-oscuro");
  await dark.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const m = await phone.newPage();
  await fresh(m);
  await shot(m, "41-movil-planta");
  await m.locator(".viewer").scrollIntoViewIfNeeded();
  await pause(800);
  await shot(m, "42-movil-3d");
  await phone.close();
}

async function animation(browser) {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
    console.log("Sin ffmpeg: no se genera el GIF.");
    return;
  }
  console.log("Animación");
  const ctx = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: tmp, size: VIEWPORT } });
  const videoStart = Date.now();
  const page = await ctx.newPage();
  await fresh(page, { planform: { elements: [] } });
  await page.locator(".plan-toolbar").getByRole("button", { name: "Encuadrar" }).click();
  await tool(page, "Contorno");
  await elementType(page, "wing");
  await pause(600);
  const start = Date.now();
  for (const [x, y] of [
    [60, 0],
    [-40, 180],
    [-110, 180],
    [-70, 0],
  ]) {
    const p = await planToClient(page, x, y);
    await page.mouse.move(p.x, p.y, { steps: 18 });
    await pause(250);
    await page.mouse.click(p.x, p.y);
    await pause(350);
  }
  const first = await planToClient(page, 60, 0);
  await page.mouse.move(first.x, first.y, { steps: 18 });
  await pause(300);
  await page.mouse.click(first.x, first.y);
  await pause(1400);
  await tool(page, "Seleccionar");
  const tip = await planToClient(page, -40, 180);
  await page.mouse.move(tip.x, tip.y, { steps: 10 });
  await page.mouse.down();
  const to = await planToClient(page, -80, 220);
  await page.mouse.move(to.x, to.y, { steps: 30 });
  await page.mouse.up();
  await pause(1200);
  const box = await page.locator(workspace).boundingBox();
  const skip = Math.max(0, (start - videoStart) / 1000 - 0.3);
  const video = page.video();
  await ctx.close();
  const webm = await video.path();
  const gif = path.join(OUT, "dibujar-y-ver-en-3d.gif");
  const crop = `crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)}`;
  const filter = `${crop},fps=10,scale=820:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
  const r = spawnSync("ffmpeg", ["-y", "-ss", skip.toFixed(2), "-i", webm, "-vf", filter, gif], { stdio: "ignore" });
  if (r.status === 0) {
    done.push("dibujar-y-ver-en-3d.gif");
    console.log("  ✓ dibujar-y-ver-en-3d.gif");
  }
}

// ---------- three views, tunnel, STL parts, Claude Desktop ----------

const WING_TEMPLATE = async (page) => {
  await page.locator(".left .tabs").getByRole("tab", { name: "Dibujo" }).click();
  const wing = page.locator("details.template", { hasText: "Ala por parámetros" });
  if (!(await wing.evaluate((d) => d.open))) await wing.locator("summary").click();
  await wing.getByRole("button", { name: "Sustituir planta" }).click();
  await pause(1200);
};

async function threeViews(page) {
  console.log("Tres vistas");
  await fresh(page);
  await WING_TEMPLATE(page);
  await view(page, "Tres vistas + 3D");
  await pause(1500);
  await shot(page, "50-tres-vistas");
  await view(page, "Perfil");
  await pause(900);
  await page.locator(".left .component-list button", { hasText: "Deriva" }).click();
  await pause(600);
  await shot(page, "51-perfil-deriva");
  await view(page, "Alzado");
  await tool(page, "Círculo");
  await elementType(page, "rotor");
  const svg = page.locator("svg.plan-canvas");
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 34, b.y + b.height / 2 - 10, { steps: 8 });
  await page.mouse.up();
  await pause(600);
  await tool(page, "Seleccionar");
  // A pusher behind the trailing edge: its disc must not cross the wing.
  await page.getByLabel("x del disco (+ adelante)").fill("-240");
  await page.getByLabel("x del disco (+ adelante)").press("Enter");
  await pause(800);
  await shot(page, "52-alzado-helice");
}

async function tunnelScene(page) {
  console.log("Túnel");
  await fresh(page);
  await WING_TEMPLATE(page);
  await view(page, "Túnel de viento");
  await page.waitForSelector(".chart-grid", { timeout: 30000 });
  await pause(1200);
  await shot(page, "53-tunel");
  await page.locator(".tunnel-main").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await pause(500);
  await shot(page, "54-tunel-balanza", ".tunnel-main");
  await shot(page, "55-tunel-resultado", ".tunnel-side");
}

function boxStl(a, b, c) {
  const v = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
  const tris = faces.flatMap(([p, q, r, s]) => [[v[p], v[q], v[r]], [v[p], v[r], v[s]]]);
  const buf = Buffer.alloc(84 + 50 * tris.length);
  buf.write("AeroForja docs: camera mount block", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.forEach((p, k) => p.forEach((x, j) => buf.writeFloatLE(x, 84 + i * 50 + 12 + k * 12 + j * 4))));
  return buf;
}

async function partsScene(page) {
  console.log("Piezas STL");
  await fresh(page);
  const file = path.join(tmp, "montura-camara.stl");
  fs.writeFileSync(file, boxStl(28, 32, 24));
  await page.locator(".left .tabs").getByRole("tab", { name: "Piezas" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Importar STL" }).click()]);
  await chooser.setFiles(file);
  await pause(800);
  await page.getByLabel("x (adelante)").fill("70");
  await page.getByLabel("x (adelante)").press("Enter");
  await page.getByLabel("z (abajo)").fill("12");
  await page.getByLabel("z (abajo)").press("Enter");
  await page.locator("#part-mass-kind").selectOption("weighed");
  await page.getByLabel("Masa", { exact: true }).fill("14.2");
  await page.getByLabel("Masa", { exact: true }).press("Enter");
  await page.getByLabel("Cuenta en el modelo de masas (masa, CG e inercia)").check();
  await view(page, "Tres vistas + 3D");
  await pause(1500);
  await shot(page, "56-pieza-stl");
  await shot(page, "57-pieza-propiedades", ".right");
}

async function claudeScene(page) {
  console.log("Claude Desktop");
  const server = require("node:child_process").spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(ROOT, "packages/mcp/src/server.ts")], {
    env: { ...process.env, AEROFORJA_PROJECT: path.join(tmp, "claude.json") },
    stdio: ["pipe", "pipe", "ignore"],
  });
  let id = 0;
  const pending = new Map();
  require("node:readline").createInterface({ input: server.stdout }).on("line", (l) => {
    const m = JSON.parse(l);
    pending.get(m.id)?.(m);
  });
  const rpc = (method, params) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const tool = (name, args) => rpc("tools/call", { name, arguments: args });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "docs", version: "1" } });
  await fresh(page);
  await page.waitForSelector(".claude-chip", { timeout: 15000 });
  await page.getByRole("button", { name: "Abrir el de Claude" }).click();
  await view(page, "Tres vistas + 3D");
  await tool("set_design_name", { name: "Ala volante con propulsora (Claude)" });
  await tool("apply_template", { template: "wing", replace: true, params: { span_mm: 1000, root_chord_mm: 280, tip_chord_mm: 130, sweep_deg: 30, fin_height_mm: 100 } });
  await tool("add_elements", {
    elements: [
      { name: "Fuselaje", role: "plate", plane: "side", shape: "polygon", points_mm: [[190, 0], [140, -34], [-90, -34], [-150, 0]] },
      { name: "Hélice propulsora", role: "rotor", plane: "front", shape: "circle", center_mm: [0, -17], diameter_in: 8, offset_mm: -240 },
    ],
  });
  await pause(2500);
  await shot(page, "58-claude-en-vivo");
  const render = await tool("render_views", { width_px: 1280 });
  fs.writeFileSync(path.join(OUT, "59-claude-render.png"), Buffer.from(render.result.content[0].data, "base64"));
  done.push("59-claude-render");
  console.log("  ✓ 59-claude-render");
  server.stdin.end();
  server.kill();
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: "light", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  const only = process.env.SCENES?.split(",");
  const scenes = { overview, tour, templates, drawing, editing, layersAndHoles, problems, massAndResults, exports, threeViews, tunnelScene, partsScene, claudeScene };
  for (const [name, scene] of Object.entries(scenes)) {
    if (only === undefined || only.includes(name)) await scene(page);
  }
  await ctx.close();
  if (only === undefined || only.includes("themes")) await themes(browser);
  if (only === undefined || only.includes("animation")) await animation(browser);
  await browser.close();
  console.log(`${done.length} imágenes en ${path.relative(ROOT, OUT)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
