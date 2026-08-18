/**
 * png.ts — a minimal PNG decoder, so the suite can make pixel assertions.
 *
 * Playwright returns screenshots as encoded PNG buffers and the project has no
 * image dependency. Comparing the encoded bytes is meaningless — the encoder is
 * free to emit different bytes for identical pixels — so the F8 containment test
 * needs the actual raster.
 *
 * Only what Playwright emits is supported: 8-bit RGB / RGBA, non-interlaced.
 * Anything else throws rather than silently returning wrong pixels.
 */

import { inflateSync } from 'node:zlib';

export interface Raster {
  width: number;
  height: number;
  /** 4 bytes per pixel, RGBA, row-major. */
  data: Uint8Array;
}

export function decodePng(buffer: Buffer): Raster {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body.readUInt8(8);
      colorType = body.readUInt8(9);
      const interlace = body.readUInt8(12);
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported colour type ${colorType}`);
      if (interlace !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);

  let previous = new Uint8Array(stride);
  let read = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[read++];
    const line = new Uint8Array(raw.subarray(read, read + stride));
    read += stride;

    // Undo the per-scanline filter (PNG spec §9.2).
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[x] = (line[x] + a) & 0xff; break;
        case 2: line[x] = (line[x] + b) & 0xff; break;
        case 3: line[x] = (line[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
    }

    for (let x = 0; x < width; x++) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = line[from];
      out[to + 1] = line[from + 1];
      out[to + 2] = line[from + 2];
      out[to + 3] = channels === 4 ? line[from + 3] : 255;
    }
    previous = line;
  }

  return { width, height, data: out };
}

export interface PixelDiff {
  /** Pixels whose channels differ by more than `tolerance`. */
  changed: number;
  /** Largest per-channel difference seen. */
  maxDelta: number;
  /** Up to 12 changed pixels, for a diagnosable failure message. */
  samples: { x: number; y: number; a: [number, number, number]; b: [number, number, number] }[];
}

/**
 * Compares two rasters of identical dimensions.
 *
 * `tolerance` absorbs the encoder's own rounding; it is a per-channel absolute
 * difference, so a genuine coloured sliver (tens of units away from the card
 * surface) is never masked by it.
 */
export function diffRasters(a: Raster, b: Raster, tolerance = 2): PixelDiff {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`raster size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const samples: PixelDiff['samples'] = [];
  let changed = 0;
  let maxDelta = 0;

  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const delta = Math.max(dr, dg, db);
    if (delta > maxDelta) maxDelta = delta;
    if (delta > tolerance) {
      changed++;
      if (samples.length < 12) {
        const p = i / 4;
        samples.push({
          x: p % a.width,
          y: Math.floor(p / a.width),
          a: [a.data[i], a.data[i + 1], a.data[i + 2]],
          b: [b.data[i], b.data[i + 1], b.data[i + 2]],
        });
      }
    }
  }
  return { changed, maxDelta, samples };
}
