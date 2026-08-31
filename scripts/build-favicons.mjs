#!/usr/bin/env node
/**
 * Generate the full favicon / app-icon set from `public/favicon.svg`.
 *
 * Output (all under `public/`):
 *   favicon-16x16.png
 *   favicon-32x32.png
 *   favicon.ico               (multi-size: 16, 32, 48)
 *   apple-touch-icon.png      (180×180)
 *   android-chrome-192x192.png
 *   android-chrome-512x512.png
 *   og/news-publisher-1000.png (1000×1000 — Google News Publisher Center upload)
 *
 * Run: `node scripts/build-favicons.mjs` from the repo root.
 *
 * The .ico writer is hand-rolled (a tiny ICONDIR + N×ICONDIRENTRY + N PNG
 * payloads). We embed PNG-encoded entries — supported by every browser
 * shipped after 2008. No `to-ico` dependency needed.
 */
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');
const SVG = path.join(PUBLIC, 'favicon.svg');

const PNG_TARGETS = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

const NEWS_LOGO = { dir: 'og', name: 'news-publisher-1000.png', size: 1000 };
const ICO_SIZES = [16, 32, 48];

async function renderPng(size) {
  return sharp(SVG, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Build a multi-size ICO with PNG-encoded entries.
 * Reference: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function buildIco(entries) {
  const headerSize = 6; // ICONDIR
  const entryHeaderSize = 16; // ICONDIRENTRY
  const total = headerSize + entryHeaderSize * entries.length +
    entries.reduce((acc, e) => acc + e.png.length, 0);
  const buf = Buffer.alloc(total);

  // ICONDIR
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type=1 (icon)
  buf.writeUInt16LE(entries.length, 4);

  let dataOffset = headerSize + entryHeaderSize * entries.length;
  let cursor = headerSize;
  for (const e of entries) {
    // ICONDIRENTRY (16 bytes)
    buf.writeUInt8(e.size === 256 ? 0 : e.size, cursor + 0); // width  (0 = 256)
    buf.writeUInt8(e.size === 256 ? 0 : e.size, cursor + 1); // height
    buf.writeUInt8(0, cursor + 2); // palette
    buf.writeUInt8(0, cursor + 3); // reserved
    buf.writeUInt16LE(1, cursor + 4); // colour planes
    buf.writeUInt16LE(32, cursor + 6); // bits per pixel
    buf.writeUInt32LE(e.png.length, cursor + 8); // size of image data
    buf.writeUInt32LE(dataOffset, cursor + 12); // offset
    cursor += entryHeaderSize;

    e.png.copy(buf, dataOffset);
    dataOffset += e.png.length;
  }
  return buf;
}

async function main() {
  await fs.access(SVG); // crash early if source missing
  await fs.mkdir(path.join(PUBLIC, NEWS_LOGO.dir), { recursive: true });

  for (const { name, size } of PNG_TARGETS) {
    const out = path.join(PUBLIC, name);
    const buf = await renderPng(size);
    await fs.writeFile(out, buf);
    console.log(`  wrote ${name} (${buf.length} B)`);
  }

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    icoEntries.push({ size, png: await renderPng(size) });
  }
  const ico = buildIco(icoEntries);
  await fs.writeFile(path.join(PUBLIC, 'favicon.ico'), ico);
  console.log(`  wrote favicon.ico (${ico.length} B, sizes ${ICO_SIZES.join(',')})`);

  const news = await renderPng(NEWS_LOGO.size);
  await fs.writeFile(path.join(PUBLIC, NEWS_LOGO.dir, NEWS_LOGO.name), news);
  console.log(`  wrote ${NEWS_LOGO.dir}/${NEWS_LOGO.name} (${news.length} B)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
