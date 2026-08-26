/**
 * Renders the PWA icons a browser needs before it will offer to install the app.
 *
 * The logo is a wide 300x100 lockup; an installable icon has to be square, so
 * the mark is centred on the brand navy. Two sets are produced:
 *   icon-192 / icon-512          the standard icons
 *   icon-maskable-512            extra padding, so Android can crop it to any
 *                                shape without clipping the mark
 *
 *   node scripts/build-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '..', 'public');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const logo = readFileSync(resolve(PUBLIC, 'logo.svg'), 'utf8');

/** `inset` is the share of the tile left empty around the mark. */
const page = (size, inset) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .tile{width:${size}px;height:${size}px;background:#0B4394;display:flex;align-items:center;justify-content:center}
  .inner{width:${Math.round(size * (1 - inset * 2))}px;background:#fff;border-radius:${Math.round(size * 0.10)}px;
         padding:${Math.round(size * 0.05)}px;display:flex;align-items:center;justify-content:center}
  .inner svg{width:100%;height:auto;display:block}
</style></head><body><div class="tile"><div class="inner">${logo}</div></div></body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

const render = async (file, size, inset) => {
  const tab = await browser.newPage();
  await tab.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await tab.setContent(page(size, inset), { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 300));
  const buf = await tab.screenshot({ omitBackground: false, type: 'png' });
  writeFileSync(resolve(PUBLIC, file), buf);
  await tab.close();
  console.log(`  ${file}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
};

await render('icon-192.png', 192, 0.08);
await render('icon-512.png', 512, 0.08);
// Android may crop up to 20% from each edge of a maskable icon.
await render('icon-maskable-512.png', 512, 0.20);
await render('apple-touch-icon.png', 180, 0.08);

await browser.close();
console.log('\nIcons written to public/.');
