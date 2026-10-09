// Renders the pixel art from media/pixels.js into PNGs for the README and the extension icon.
// Run with: node scripts/make-readme-art.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'images');
fs.mkdirSync(outDir, { recursive: true });

// Load Ritesh's sprites without a browser: pixels.js only needs `window` to attach itself to.
const sandbox = { window: {}, document: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'media', 'pixels.js'), 'utf8'), sandbox);
const { mascots, icons } = sandbox.window.ErrorBuddyPixels.sprites;

const PALETTE = {
  k: '#1b1b2f', g: '#58c777', d: '#3f9f5c', w: '#ffffff', t: '#c9ccd6', h: '#5b6170', r: '#e5484d',
  o: '#f2762e', y: '#f0b429', b: '#3b6fd9', m: '#8b5cf6', n: '#7a4a21', s: '#c8a96a',
  c: '#8b8f9a', // "currentColor" in the panel; a grey that reads on light and dark GitHub themes
};
const CARD = '#eef3ff';

const rgba = (hex, a = 255) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];

function canvas(width, height, background) {
  const px = new Uint8Array(width * height * 4);
  if (background) {
    const [r, g, b, a] = rgba(background);
    for (let i = 0; i < px.length; i += 4) px.set([r, g, b, a], i);
  }
  return { width, height, px };
}

function draw(img, rows, left, top, scale) {
  rows.forEach((row, y) => {
    [...row].forEach((key, x) => {
      if (!PALETTE[key]) return;
      const color = rgba(PALETTE[key]);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          img.px.set(color, ((top + y * scale + dy) * img.width + left + x * scale + dx) * 4);
        }
      }
    });
  });
}

/** Rounds the corners of a filled canvas by making them transparent. */
function roundCorners(img, radius) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const cx = x < radius ? radius : x >= img.width - radius ? img.width - radius - 1 : x;
      const cy = y < radius ? radius : y >= img.height - radius ? img.height - radius - 1 : y;
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) img.px[(y * img.width + x) * 4 + 3] = 0;
    }
  }
}

function writePng(img, file) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    Buffer.from(img.px.buffer, y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1);
  }
  fs.writeFileSync(
    path.join(outDir, file),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
  console.log(`wrote docs/images/${file} (${img.width}x${img.height})`);
}

// Logo: Buddy on a rounded card. 128x128 doubles as the Marketplace icon.
for (const size of [128, 256]) {
  const scale = size / 16 - 2;
  const logo = canvas(size, size, CARD);
  draw(logo, mascots.idle, (size - 16 * scale) / 2, (size - 16 * scale) / 2, scale);
  roundCorners(logo, size / 8);
  writePng(logo, `logo-${size}.png`);
}

// Banner: every costume in a row.
const names = ['idle', 'pirate', 'sportscaster', 'parent', 'shakespeare', 'narrator'];
const scale = 8;
const gap = 40;
const pad = 32;
const banner = canvas(pad * 2 + names.length * 16 * scale + (names.length - 1) * gap, pad * 2 + 16 * scale, CARD);
names.forEach((name, i) => draw(banner, mascots[name], pad + i * (16 * scale + gap), pad, scale));
roundCorners(banner, 24);
writePng(banner, 'banner.png');

// Small icons for the feature list.
for (const name of Object.keys(icons)) {
  const icon = canvas(32, 32);
  draw(icon, icons[name], 0, 0, 4);
  writePng(icon, `icon-${name}.png`);
}
