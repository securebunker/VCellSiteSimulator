/* Dev-only release budget audit. No runtime dependency.
   Usage: node tests/budget-audit.js
   Exit code 0 = all gates pass, 1 = a gate failed. */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, 'budgets.json'), 'utf8'));
const failures = [];
const rows = [];

function fail(name, detail) {
  failures.push(name + ': ' + detail);
}

function sizeOf(file) {
  return fs.statSync(path.join(ROOT, file)).size;
}

const assets = ['index.html', 'styles.css', 'app.js', 'theme-init.js', 'favicon.svg'];
let rawTotal = 0;
let gzipTotal = 0;
let brotliTotal = 0;
for (const file of assets) {
  const raw = fs.readFileSync(path.join(ROOT, file));
  const gzip = zlib.gzipSync(raw, { level: 9 }).length;
  const brotli = zlib.brotliCompressSync(raw, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 },
  }).length;
  rawTotal += raw.length;
  gzipTotal += gzip;
  brotliTotal += brotli;
  rows.push({ file, raw: raw.length, gzip, brotli });
}

for (const [file, max] of Object.entries(budgets.rawBytes)) {
  if (file === 'totalRuntime') continue;
  const actual = sizeOf(file);
  if (actual > max) fail('raw ' + file, actual + ' > ' + max + ' bytes');
}
if (rawTotal > budgets.rawBytes.totalRuntime) fail('raw total', rawTotal + ' > ' + budgets.rawBytes.totalRuntime);
if (brotliTotal > budgets.compressedBytes.brotliTotal) fail('brotli total', brotliTotal + ' > ' + budgets.compressedBytes.brotliTotal);
if (gzipTotal > budgets.compressedBytes.gzipTotal) fail('gzip total', gzipTotal + ' > ' + budgets.compressedBytes.gzipTotal);

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const serve = fs.readFileSync(path.join(ROOT, 'serve.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

if (!index.includes('Content-Security-Policy')) fail('CSP meta', 'index.html has no CSP meta tag');
if (!index.includes('script src="theme-init.js')) fail('external theme bootstrap', 'theme-init.js is not referenced');
if (/<script(?![^>]*\bsrc=)/i.test(index)) fail('inline script', 'index.html still contains an inline script');
if (!index.includes('name="app-version"')) fail('version meta', 'index.html has no app-version meta');
if (!app.includes("const APP_VERSION = '" + budgets.appVersion + "'")) fail('app version', 'APP_VERSION does not match budgets.json');
if (!app.includes('Neutralise spreadsheet formula prefixes')) fail('CSV hardening', 'csvCell formula neutralisation marker missing');
if (!/\/\^\[\=\+\\-@\\t\\r\]\//.test(app)) fail('CSV hardening regex', 'formula-prefix regex missing');
if (!index.includes('scope="col"')) fail('table scope', 'no scope="col" in index.html');
if (!styles.includes('@media (forced-colors: active)')) fail('forced colors', 'forced-colors block missing');
if (!styles.includes('@media (prefers-contrast: more)')) fail('contrast', 'prefers-contrast block missing');
if (!styles.includes('@media (prefers-reduced-transparency: reduce)')) fail('reduced transparency', 'reduced-transparency block missing');
for (const header of ['Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Cross-Origin-Opener-Policy']) {
  if (!serve.includes(header)) fail('security header', header + ' missing from serve.js');
}
if (!serve.includes("brotliCompressSync") || !serve.includes("gzipSync")) fail('compression', 'serve.js does not implement brotli + gzip');
if (!serve.includes("if-none-match") || !serve.includes('304')) fail('ETag/304', 'serve.js does not implement conditional requests');

console.log('VCSS 4G v' + budgets.appVersion + ' budget audit');
console.log('asset'.padEnd(18) + 'raw'.padStart(9) + 'gzip'.padStart(9) + 'brotli'.padStart(9));
for (const row of rows) {
  console.log(row.file.padEnd(18) + String(row.raw).padStart(9) + String(row.gzip).padStart(9) + String(row.brotli).padStart(9));
}
console.log('total'.padEnd(18) + String(rawTotal).padStart(9) + String(gzipTotal).padStart(9) + String(brotliTotal).padStart(9));
console.log('budgets: brotli <= ' + budgets.compressedBytes.brotliTotal + ', gzip <= ' + budgets.compressedBytes.gzipTotal + ', raw total <= ' + budgets.rawBytes.totalRuntime);

if (failures.length) {
  console.error('\nFAILED GATES');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log('\nAll v' + budgets.appVersion + ' budget and static security gates passed.');
