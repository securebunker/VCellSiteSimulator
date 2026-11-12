/* Dev-only Lighthouse gate. Install Lighthouse outside the app, then run:
     LIGHTHOUSE_BIN=lighthouse CHROME_PATH=<chrome> node tests/lighthouse-audit.js
   The app itself has no Lighthouse dependency. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const BUDGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'budgets.json'), 'utf8'));
const OUT = path.join(ROOT, 'tests', 'reports');
const tabs = (process.env.LH_TABS || 'overview,noc,guidance').split(',').map((tab) => tab.trim()).filter(Boolean);
const bin = process.env.LIGHTHOUSE_BIN || 'lighthouse';
const chrome = process.env.CHROME_PATH || '';
const isJsCli = /\.(?:c?js|mjs)$/i.test(bin);
const command = isJsCli ? process.execPath : bin;
const prefix = isJsCli ? [bin] : [];
const env = { ...process.env };
if (chrome) env.CHROME_PATH = chrome;

fs.mkdirSync(OUT, { recursive: true });

const failures = [];
for (const tab of tabs) {
  const reportPath = path.join(OUT, 'lighthouse-' + tab + '.json');
  const target = new URL(BASE);
  target.hash = tab;
  const args = [
    ...prefix,
    target.toString(),
    '--quiet',
    '--output=json',
    '--output-path=' + reportPath,
    '--only-categories=performance,accessibility',
    '--chrome-flags=--headless=new --no-sandbox',
  ];
  let run;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    target.searchParams.set('lh', Date.now() + '-' + attempt);
    args[prefix.length] = target.toString();
    run = spawnSync(command, args, { encoding: 'utf8', env });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (!run.error && run.status === 0) break;
    const output = String(run.stdout || '') + String(run.stderr || '');
    if (attempt < 4 && /NO_NAVSTART|recording the trace|interstitial/i.test(output)) {
      console.log('Lighthouse trace failed for ' + tab + '; retrying (attempt ' + attempt + ' of 4).');
      continue;
    }
    break;
  }
  if (run.error || run.status !== 0) {
    console.error('Unable to run Lighthouse for ' + tab + '. Set LIGHTHOUSE_BIN to the lighthouse CLI script or install Lighthouse.');
    process.exit(2);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const a11y = report.categories.accessibility.score;
  const perf = report.categories.performance.score;
  const audits = report.audits;
  const metrics = {
    fcp: audits['first-contentful-paint']?.numericValue,
    lcp: audits['largest-contentful-paint']?.numericValue,
    tbt: audits['total-blocking-time']?.numericValue,
    cls: audits['cumulative-layout-shift']?.numericValue,
  };
  const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
  console.log(tab + ': perf ' + perf + ' · a11y ' + a11y + ' · FCP ' + fmt(metrics.fcp) + 'ms · LCP ' + fmt(metrics.lcp) + 'ms · TBT ' + fmt(metrics.tbt) + 'ms · CLS ' + fmt(metrics.cls, 3));
  if (!Number.isFinite(a11y) || a11y < BUDGETS.performance.lighthouseAccessibility) failures.push(tab + ' accessibility ' + a11y + ' < 1.0');
  if (!Number.isFinite(metrics.fcp) || metrics.fcp > BUDGETS.performance.fcpMs) failures.push(tab + ' FCP ' + fmt(metrics.fcp) + 'ms > ' + BUDGETS.performance.fcpMs);
  if (!Number.isFinite(metrics.lcp) || metrics.lcp > BUDGETS.performance.lcpMs) failures.push(tab + ' LCP ' + fmt(metrics.lcp) + 'ms > ' + BUDGETS.performance.lcpMs);
  if (!Number.isFinite(metrics.tbt) || metrics.tbt > BUDGETS.performance.tbtMs) failures.push(tab + ' TBT ' + fmt(metrics.tbt) + 'ms > ' + BUDGETS.performance.tbtMs);
  if (!Number.isFinite(metrics.cls) || metrics.cls > BUDGETS.performance.cls) failures.push(tab + ' CLS ' + fmt(metrics.cls, 3) + ' > ' + BUDGETS.performance.cls);
}

if (failures.length) {
  console.error('\nFAILED LIGHTHOUSE GATES');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log('\nLighthouse gates passed. Reports: ' + OUT);
