/**
 * A small raster canvas and PNG encoder, so the server can show Claude the
 * drawing without a browser: filled polygons (even-odd), lines, dashes and
 * a 5×7 bitmap font. PNG per ISO/IEC 15948 (RGB, filter 0, zlib).
 */
import { deflateSync } from "node:zlib";

export type Rgb = readonly [number, number, number];

export class Canvas {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number, background: Rgb = [255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) this.data.set(background, i * 3);
  }

  pixel(x: number, y: number, c: Rgb, alpha = 1): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const o = (yi * this.width + xi) * 3;
    for (let k = 0; k < 3; k++) this.data[o + k] = Math.round(this.data[o + k]! * (1 - alpha) + c[k]! * alpha);
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb, alpha = 1): void {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.height, Math.ceil(y + h)); j++)
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.width, Math.ceil(x + w)); i++) this.pixel(i, j, c, alpha);
  }

  /** Even-odd scanline fill of one or more rings (holes cut by the even-odd rule). */
  fill(rings: readonly (readonly (readonly [number, number])[])[], c: Rgb, alpha = 1): void {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const r of rings) for (const p of r) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.height - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (const r of rings) {
        for (let i = 0; i < r.length; i++) {
          const a = r[i]!;
          const b = r[(i + 1) % r.length]!;
          if ((a[1] <= yc && yc < b[1]) || (b[1] <= yc && yc < a[1])) xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k]! - 0.5)); x <= Math.min(this.width - 1, Math.floor(xs[k + 1]! - 0.5)); x++) this.pixel(x, y, c, alpha);
      }
    }
  }

  /** Line of a given width; `dash` = [on, off] in px. */
  line(x0: number, y0: number, x1: number, y1: number, c: Rgb, width = 1, dash: readonly [number, number] | null = null, alpha = 1): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len * 2));
    const r = width / 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const d = t * len;
      if (dash !== null && d % (dash[0] + dash[1]) > dash[0]) continue;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (r <= 0.6) this.pixel(x, y, c, alpha);
      else for (let j = -r; j <= r; j += 0.5) for (let i = -r; i <= r; i += 0.5) if (i * i + j * j <= r * r) this.pixel(x + i, y + j, c, alpha);
    }
  }

  polyline(points: readonly (readonly [number, number])[], c: Rgb, width = 1, closed = true, dash: readonly [number, number] | null = null): void {
    const n = points.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      this.line(a[0], a[1], b[0], b[1], c, width, dash);
    }
  }

  /** Text in the 5×7 font, uppercase, `scale` px per font pixel. Returns the width drawn. */
  text(x: number, y: number, s: string, c: Rgb, scale = 2): number {
    const clean = s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
    let cx = x;
    for (const ch of clean) {
      const glyph = FONT[ch] ?? FONT["?"]!;
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row]!;
        for (let col = 0; col < 5; col++) if (bits[col] === "1") this.rect(cx + col * scale, y + row * scale, scale, scale, c);
      }
      cx += 6 * scale;
    }
    return cx - x;
  }

  toPng(): Buffer {
    const raw = Buffer.alloc((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (this.width * 3 + 1)] = 0;
      raw.set(this.data.subarray(y * this.width * 3, (y + 1) * this.width * 3), y * (this.width * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/** 5×7 glyphs, rows top to bottom. */
const FONT: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  Ñ: ["01110", "00000", "10001", "11001", "10101", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "²": ["01100", "10010", "00100", "01000", "11110", "00000", "00000"],
  "°": ["01100", "10010", "10010", "01100", "00000", "00000", "00000"],
};
