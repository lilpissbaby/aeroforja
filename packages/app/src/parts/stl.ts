/**
 * STL reader (binary and ASCII), mini-design 005.
 *
 * Output: a Float32Array of 9 numbers per triangle (three vertices, x y z),
 * in the units of the file. Normals stored in the file are ignored: the
 * vertex order is what defines the orientation.
 *
 * Format: 3D Systems, «StereoLithography Interface Specification» (1988).
 * Binary: 80-byte header, uint32 triangle count, then 50 bytes per triangle
 * (normal, three vertices as float32 little-endian, uint16 attribute).
 */

export type StlParse =
  | { readonly ok: true; readonly triangles: Float32Array; readonly format: "binary" | "ascii" }
  | { readonly ok: false; readonly message: string };

/** Largest mesh accepted, so a browser tab does not run out of memory. */
export const MAX_TRIANGLES = 2_000_000;

function parseBinary(view: DataView, count: number): StlParse {
  const out = new Float32Array(count * 9);
  let o = 84;
  for (let t = 0; t < count; t++) {
    o += 12; // normal
    for (let k = 0; k < 9; k++) {
      const v = view.getFloat32(o, true);
      if (!Number.isFinite(v)) return { ok: false, message: `El triángulo ${t + 1} tiene coordenadas no numéricas.` };
      out[t * 9 + k] = v;
      o += 4;
    }
    o += 2; // attribute byte count
  }
  return { ok: true, triangles: out, format: "binary" };
}

function parseAscii(text: string): StlParse {
  const numbers: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    for (let k = 1; k <= 3; k++) {
      const v = Number(match[k]);
      if (!Number.isFinite(v)) return { ok: false, message: `Vértice no numérico: «${match[0]}».` };
      numbers.push(v);
    }
  }
  if (numbers.length === 0 || numbers.length % 9 !== 0) {
    return { ok: false, message: "El STL de texto no tiene triángulos completos (tres vértices por cara)." };
  }
  if (numbers.length / 9 > MAX_TRIANGLES) return { ok: false, message: `La malla tiene más de ${MAX_TRIANGLES} triángulos.` };
  return { ok: true, triangles: Float32Array.from(numbers), format: "ascii" };
}

export function parseStl(buffer: ArrayBuffer): StlParse {
  if (buffer.byteLength < 15) return { ok: false, message: "El archivo es demasiado pequeño para ser un STL." };
  const view = new DataView(buffer);
  if (buffer.byteLength >= 84) {
    const count = view.getUint32(80, true);
    // A binary STL is exactly 84 + 50·n bytes; some ASCII files start with "solid" too.
    if (84 + 50 * count === buffer.byteLength) {
      if (count === 0) return { ok: false, message: "El STL no tiene triángulos." };
      if (count > MAX_TRIANGLES) return { ok: false, message: `La malla tiene más de ${MAX_TRIANGLES} triángulos.` };
      return parseBinary(view, count);
    }
  }
  const head = new TextDecoder("ascii").decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512)));
  if (/^\s*solid/i.test(head)) return parseAscii(new TextDecoder("utf-8").decode(buffer));
  return { ok: false, message: "No es un STL válido: ni el tamaño cuadra con un STL binario ni empieza por «solid»." };
}

/** Content hash of the triangles (FNV-1a, 32 bits, plus the length), used as the mesh store key. */
export function meshKey(triangles: Float32Array): string {
  const bytes = new Uint8Array(triangles.buffer, triangles.byteOffset, triangles.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `m${(h >>> 0).toString(16).padStart(8, "0")}-${triangles.length / 9}`;
}

/** Writes triangles as a binary STL, for exporting placed parts. */
export function writeBinaryStl(triangles: ArrayLike<number>, header = "AeroForja"): ArrayBuffer {
  const count = triangles.length / 9;
  const buffer = new ArrayBuffer(84 + 50 * count);
  const view = new DataView(buffer);
  const text = new TextEncoder().encode(header.slice(0, 80));
  new Uint8Array(buffer, 0, text.length).set(text);
  view.setUint32(80, count, true);
  let o = 84;
  for (let t = 0; t < count; t++) {
    const p = (k: number) => triangles[t * 9 + k]!;
    const ux = p(3) - p(0), uy = p(4) - p(1), uz = p(5) - p(2);
    const vx = p(6) - p(0), vy = p(7) - p(1), vz = p(8) - p(2);
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const n = Math.hypot(nx, ny, nz) || 1;
    nx /= n;
    ny /= n;
    nz /= n;
    for (const v of [nx, ny, nz]) {
      view.setFloat32(o, v, true);
      o += 4;
    }
    for (let k = 0; k < 9; k++) {
      view.setFloat32(o, p(k), true);
      o += 4;
    }
    o += 2;
  }
  return buffer;
}
