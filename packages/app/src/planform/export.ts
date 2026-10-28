/**
 * Files for the workshop, at 1:1 in millimetres.
 *
 * - STL (binary) of every piece for printing. Slicers expect Z up, so body
 *   FRD (x forward, y right, z down) is rotated 180° about x into
 *   (x forward, y left, z up). Holes and rotor discs are not printed.
 * - SVG of every sheet seen from above for cutting or as a paper template,
 *   with a 50 mm control bar to check the print scale. No kerf compensation
 *   yet: that needs the kerf measured on your machine (fabrication module).
 */
import type { PolygonWithHoles, Ring, SolidLayer } from "./geometry.ts";
import { ringsBounds } from "./geometry.ts";
import { layerGeometries, triangles } from "./mesh.ts";

const MM = 1000;

/** FRD metres → STL millimetres, Z up. */
const toStl = (x: number, y: number, z: number): [number, number, number] => [x * MM, -y * MM, -z * MM];

export function stlTriangles(layers: readonly SolidLayer[]): Float32Array {
  const parts: Float64Array[] = layers.flatMap((layer) =>
    layerGeometries(layer).map((g) => {
      const t = triangles(g);
      g.dispose();
      return t;
    }),
  );
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 3) {
      const [x, y, z] = toStl(part[i]!, part[i + 1]!, part[i + 2]!);
      out[offset + i] = x;
      out[offset + i + 1] = y;
      out[offset + i + 2] = z;
    }
    offset += part.length;
  }
  return out;
}

/** Binary STL: 80-byte header, triangle count, then normal + 3 vertices + attribute per triangle. */
export function binaryStl(tris: Float32Array, header: string): ArrayBuffer {
  const count = tris.length / 9;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  // ASCII only, and never starting with "solid" (that would look like a text STL).
  const ascii = header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/^solid/i, "_solid");
  const text = ascii.slice(0, 80);
  for (let i = 0; i < 80; i++) view.setUint8(i, i < text.length ? text.charCodeAt(i) : 0x20);
  view.setUint32(80, count, true);
  let o = 84;
  for (let t = 0; t < count; t++) {
    const i = t * 9;
    const ux = tris[i + 3]! - tris[i]!;
    const uy = tris[i + 4]! - tris[i + 1]!;
    const uz = tris[i + 5]! - tris[i + 2]!;
    const vx = tris[i + 6]! - tris[i]!;
    const vy = tris[i + 7]! - tris[i + 1]!;
    const vz = tris[i + 8]! - tris[i + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const n of [nx, ny, nz]) {
      view.setFloat32(o, n, true);
      o += 4;
    }
    for (let k = 0; k < 9; k++) {
      view.setFloat32(o, tris[i + k]!, true);
      o += 4;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buffer;
}

const fmt = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** Plan point (FRD m) → SVG mm: nose up, right wing to the right. */
const svgPoint = (x: number, y: number): [number, number] => [y * MM, -x * MM];

function ringPath(ring: Ring, dx: number, dy: number): string {
  return (
    ring
      .map(([x, y], i) => {
        const [sx, sy] = svgPoint(x, y);
        return `${i === 0 ? "M" : "L"}${fmt(sx + dx)} ${fmt(sy + dy)}`;
      })
      .join(" ") + " Z"
  );
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const mmText = (m: number): string => (m * MM).toFixed(1).replace(".", ",");

/** All sheets side by side, each with its label, at 1:1 in millimetres. */
export function planformSvg(layers: readonly SolidLayer[], title: string): string {
  const margin = 10;
  const gap = 15;
  const labelHeight = 8;
  const groups: string[] = [];
  let cursorX = margin;
  let height = 0;

  layers.forEach((layer, index) => {
    const outers = layer.bodies.map((p: PolygonWithHoles) => p[0]!);
    const b = ringsBounds(outers);
    if (b === null) return;
    // In SVG mm the sheet spans y·1000 horizontally and −x·1000 vertically.
    const left = b.minY * MM;
    const top = -b.maxX * MM;
    const width = (b.maxY - b.minY) * MM;
    const h = (b.maxX - b.minX) * MM;
    const dx = cursorX - left;
    const dy = margin - top;
    const d = layer.bodies.map((p) => p.map((ring) => ringPath(ring, dx, dy)).join(" ")).join(" ");
    const label = `Capa ${index + 1} · espesor ${mmText(layer.thickness)} mm · z ${mmText(layer.z)} mm`;
    groups.push(
      `  <g id="capa-${index + 1}">\n` +
        `    <path d="${d}" fill="none" stroke="#000000" stroke-width="0.1" fill-rule="evenodd"/>\n` +
        `    <text x="${fmt(cursorX)}" y="${fmt(margin + h + 6)}" font-family="sans-serif" font-size="4" fill="#0000ff">${escapeXml(label)}</text>\n` +
        `  </g>`,
    );
    cursorX += width + gap;
    height = Math.max(height, h);
  });

  const barY = margin + height + labelHeight + 6;
  const totalWidth = Math.max(cursorX - gap + margin, 50 + 2 * margin);
  const totalHeight = barY + 12;
  const bar =
    `  <g id="regla-de-control">\n` +
    `    <rect x="${margin}" y="${fmt(barY)}" width="50" height="3" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n` +
    `    <text x="${margin}" y="${fmt(barY + 8)}" font-family="sans-serif" font-size="4" fill="#ff0000">Regla de control: 50 mm exactos</text>\n` +
    `  </g>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(totalWidth)}mm" height="${fmt(totalHeight)}mm" viewBox="0 0 ${fmt(totalWidth)} ${fmt(totalHeight)}">\n` +
    `  <title>${escapeXml(title)} · planta a escala 1:1 (mm), morro hacia arriba</title>\n` +
    `${groups.join("\n")}\n${bar}\n</svg>\n`
  );
}
