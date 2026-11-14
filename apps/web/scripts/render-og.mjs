/**
 * Generates public/og.svg (self-contained: the display face is embedded) and
 * renders public/og.png from it with Playwright. Run: node scripts/render-og.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const font = (f) => readFileSync(join(root, 'node_modules/@fontsource/instrument-serif/files', f)).toString('base64');
const regular = font('instrument-serif-latin-400-normal.woff2');
const italic = font('instrument-serif-latin-400-italic.woff2');

// Same drape construction as src/brand/drape-geometry.ts (simplified copy).
const r = (n) => Math.round(n * 10) / 10;
function drape({ pleats = 7, width = 200, height = 630, tieY = 400, tieWidth = 62, floorWidth = 118 }) {
  const edges = [];
  for (let j = 0; j <= pleats * 2; j++) {
    const t = j / (pleats * 2);
    const s = t * (0.85 + 0.15 * t);
    edges.push({ top: s * width, tie: t * tieWidth, bottom: s * floorWidth });
  }
  const fwd = (e) =>
    `C${r(e.top)} ${r(tieY * 0.42)} ${r(e.tie + (e.top - e.tie) * 0.3)} ${r(tieY * 0.82)} ${r(e.tie)} ${tieY}` +
    `C${r(e.tie)} ${r(tieY + (height - tieY) * 0.18)} ${r(e.bottom)} ${r(height - (height - tieY) * 0.45)} ${r(e.bottom)} ${height}`;
  const back = (e) =>
    `C${r(e.bottom)} ${r(height - (height - tieY) * 0.45)} ${r(e.tie)} ${r(tieY + (height - tieY) * 0.18)} ${r(e.tie)} ${tieY}` +
    `C${r(e.tie + (e.top - e.tie) * 0.3)} ${r(tieY * 0.82)} ${r(e.top)} ${r(tieY * 0.42)} ${r(e.top)} 0`;
  const facet = (a, b) => `M${r(a.top)} 0${fwd(a)}L${r(b.bottom)} ${height}${back(b)}Z`;
  const lit = [], shade = [];
  for (let i = 0; i < pleats; i++) {
    lit.push(facet(edges[2 * i], edges[2 * i + 1]));
    shade.push(facet(edges[2 * i + 1], edges[2 * i + 2]));
  }
  return { lit: lit.join(''), shade: shade.join(''), tieY, tieWidth };
}
const d = drape({});
const drapeGroup = `
  <path d="${d.shade}" fill="url(#shade)"/>
  <path d="${d.lit}" fill="url(#lit)"/>
  <path d="M-4 ${d.tieY - 14}C25 ${d.tieY + 16} 53 ${d.tieY + 14} ${d.tieWidth + 12} ${d.tieY - 8}" fill="none" stroke="#c4a46a" stroke-width="4" stroke-linecap="round"/>
  <circle cx="${d.tieWidth + 12}" cy="${d.tieY - 8}" r="6" fill="#c4a46a"/>`;

const mark = `
  <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
    <path d="M4 6.4H20C25.4 6.4 28.3 8.8 27.6 12C26.9 15.4 21.2 17.3 11.4 18.4H4ZM4 20.6H11C11.2 24 11.9 27 13.4 29.4H4Z" fill="#fff"/>
    <path d="M8.6 6.4C8.9 11 8.6 15 7.3 18.4M13.4 6.4C14 11 12.6 15.4 9.6 18.4M18.6 6.4C20.2 10.8 17.8 15.4 11.6 18.3M7.4 20.6C7.6 24 8 27 8.4 29.4M9.5 20.6C9.8 24 10.4 27 11.1 29.4" fill="none" stroke="#000" stroke-width="1.25" stroke-linecap="round"/>
  </mask>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <title>Perde — private payments on NEAR</title>
  <style>
    @font-face { font-family: 'IS'; src: url(data:font/woff2;base64,${regular}) format('woff2'); font-style: normal; }
    @font-face { font-family: 'IS'; src: url(data:font/woff2;base64,${italic}) format('woff2'); font-style: italic; }
    .serif { font-family: 'IS', Georgia, serif; }
    .sans { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  </style>
  <defs>
    <linearGradient id="lit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7a0b1d"/><stop offset=".35" stop-color="#ac142d"/><stop offset=".62" stop-color="#7a0b1d"/><stop offset=".8" stop-color="#ac142d"/><stop offset="1" stop-color="#43050f"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1f0207"/><stop offset=".4" stop-color="#43050f"/><stop offset=".62" stop-color="#1f0207"/><stop offset=".85" stop-color="#43050f"/><stop offset="1" stop-color="#1f0207"/>
    </linearGradient>
    ${mark}
  </defs>
  <rect width="1200" height="630" fill="#0e0b0a"/>
  <g transform="translate(0 0) scale(0.95 1)">${drapeGroup}</g>
  <g transform="translate(1200 0) scale(-0.95 1)">${drapeGroup}</g>
  <rect width="1200" height="10" fill="#7a0b1d"/>
  <rect y="12" width="1200" height="1.5" fill="#c4a46a" opacity=".8"/>
  <g transform="translate(262 136)">
    <g transform="scale(1.6)" fill="#ef5a6c"><path d="M3 2.5h26a1.1 1.1 0 0 1 0 2.2H3a1.1 1.1 0 0 1 0-2.2Z"/><rect width="32" height="32" mask="url(#m)"/></g>
    <text x="64" y="42" class="serif" font-size="50" fill="#f3ede2">perde</text>
  </g>
  <text x="262" y="330" class="serif" font-size="118" fill="#f3ede2" letter-spacing="-1.5">Pay anyone.</text>
  <text x="262" y="440" class="serif" font-size="118" font-style="italic" fill="#ef5a6c" letter-spacing="-1.5">Reveal no one.</text>
  <text x="264" y="512" class="sans" font-size="25" fill="#bdb2a3">Private payments on NEAR — every payment lands in a fresh account.</text>
  <text x="264" y="556" class="sans" font-size="17" fill="#c4a46a" letter-spacing="3">NO POOL · NO RELAYER · NO INDEXER · TESTNET</text>
</svg>
`;

writeFileSync(join(root, 'public/og.svg'), svg);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<body style="margin:0;background:#0e0b0a">${svg}</body>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: join(root, 'public/og.png') });
await browser.close();
console.log('wrote public/og.svg and public/og.png');
