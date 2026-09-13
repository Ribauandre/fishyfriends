// Minimal PNG reader/writer (8-bit RGBA/RGB, non-interlaced) in pure node.
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

export function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8; const idat = []; let w = 0, h = 0, depth = 0, ct = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`unsupported png depth=${depth} ct=${ct}`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x += 1) {
      out[(y * w + x) * 4] = line[x * bpp];
      out[(y * w + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * w + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}

export function writePng(file, { width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type, body) => {
    const b = Buffer.alloc(8 + body.length + 4);
    b.writeUInt32BE(body.length, 0); b.write(type, 4, 'ascii'); body.copy(b, 8);
    b.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), body])), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  writeFileSync(file, Buffer.concat(chunks));
}

let TAB = null;
function crc(buf) {
  if (!TAB) { TAB = new Int32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TAB[n] = c; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = TAB[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
