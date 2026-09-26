// Generates public/icons/icon{16,48,128}.png with no dependencies:
// a rounded green square with a white check mark.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function icon(size) {
  const ss = 4; // supersampling
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = size * 0.22;
  const stroke = size * 0.1;
  const p1 = [0.27, 0.52], p2 = [0.43, 0.68], p3 = [0.74, 0.35];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
        const cx = Math.min(Math.max(px, r), size - r), cy = Math.min(Math.max(py, r), size - r);
        if (Math.hypot(px - cx, py - cy) <= r) {
          bg++;
          const d = Math.min(
            distToSegment(px, py, p1[0] * size, p1[1] * size, p2[0] * size, p2[1] * size),
            distToSegment(px, py, p2[0] * size, p2[1] * size, p3[0] * size, p3[1] * size),
          );
          if (d <= stroke / 2) fg++;
        }
      }
      const n = ss * ss, a = bg / n, f = bg ? fg / bg : 0;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(16 + (255 - 16) * f);
      raw[o + 1] = Math.round(163 + (255 - 163) * f);
      raw[o + 2] = Math.round(127 + (255 - 127) * f);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`public/icons/icon${s}.png`, icon(s));
console.log('icons written');
