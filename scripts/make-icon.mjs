/**
 * Turns `assets/icon.svg` into the shapes Windows and the browser want.
 *
 *   node scripts/make-icon.mjs
 *
 * Writes `build/icon.ico` for electron-builder and `build/icon.png` at 256 for
 * anything that would rather have one, including the window in a dev run.
 *
 * Rasterised with the Chromium that Playwright already installs for the browser
 * tests, rather than an image library. Nothing here is worth a dependency: the
 * whole job is "draw this SVG at seven sizes", and the machine already has
 * something that draws SVGs exactly the way the app will.
 *
 * The ICO is assembled by hand, which sounds worse than it is. The format is a
 * twelve-byte header, sixteen bytes per size, and then the PNGs themselves —
 * Windows has taken PNG-compressed entries since Vista.
 *
 * One thing to know before regenerating on another machine: the B is a `text`
 * element in Georgia, so the glyph comes from whatever font is installed. The
 * generated files are committed for that reason — packaging must not depend on
 * a browser, a font, or this script.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

/**
 * What Windows asks for.
 *
 * 16 is the taskbar and the title bar, which is the size that decides whether
 * he can find the app at all; 256 is the installer and the large-icon view.
 * The ones between are what Explorer picks at its various zooms — left out,
 * they get scaled from a neighbour and go soft.
 */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const SOURCE = 'assets/icon.svg';
const OUT = 'build';

/** One PNG per size, drawn by the browser at that size rather than scaled. */
async function drawEach(svg) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const drawn = new Map();
    for (const size of SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<body style="margin:0">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body>`,
      );
      drawn.set(size, await page.locator('svg').screenshot({ omitBackground: true }));
    }
    return drawn;
  } finally {
    await browser.close();
  }
}

/**
 * Packs the PNGs into one `.ico`.
 *
 * A size of 256 is written as 0 in the directory, which is the format's way of
 * saying "the byte is too small for this" and not a mistake.
 */
function packIco(drawn) {
  const entries = [...drawn.entries()];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let at = header.length + directory.length;

  entries.forEach(([size, png], index) => {
    const row = index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, row);
    directory.writeUInt8(size === 256 ? 0 : size, row + 1);
    directory.writeUInt8(0, row + 2);
    directory.writeUInt8(0, row + 3);
    directory.writeUInt16LE(1, row + 4);
    directory.writeUInt16LE(32, row + 6);
    directory.writeUInt32LE(png.length, row + 8);
    directory.writeUInt32LE(at, row + 12);
    at += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map(([, png]) => png)]);
}

const svg = await readFile(SOURCE, 'utf8');
const drawn = await drawEach(svg);

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'icon.ico'), packIco(drawn));
const largest = drawn.get(256);
if (largest === undefined) throw new Error('no 256px rendering to write');
await writeFile(path.join(OUT, 'icon.png'), largest);

console.log(`wrote ${OUT}/icon.ico (${SIZES.join(', ')}) and ${OUT}/icon.png`);
