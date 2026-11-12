/* Dev-only resilience audit: 3D frame rate, forced-colors and 200% zoom.
   Requires puppeteer-core (not a runtime dependency).
   Usage:
     PUPPETEER_CORE=<path> node tests/resilience-audit.js
     CHROME_PATH=<path> BASE=http://127.0.0.1:8765/ node tests/resilience-audit.js
   Set HEADED=1 for a visible browser (recommended for FPS). */
'use strict';

const fs = require('fs');
const path = require('path');

let puppeteer;
try {
  puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
} catch (error) {
  console.error('puppeteer-core is not installed. This is a dev-only audit; the app itself has no dependencies.');
  console.error('Set PUPPETEER_CORE to an installed puppeteer-core module path, then rerun.');
  process.exit(2);
}

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const BUDGETS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'budgets.json'), 'utf8'));
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((candidate) => fs.existsSync(candidate));
const TABS = ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business', 'guidance'];
const HEADLESS = process.env.HEADED === '1' ? false : 'new';
const failures = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  failures.push(message);
}

async function measureOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    view: document.querySelector('.view.active')?.id,
  }));
}

(async () => {
  if (!CHROME) {
    console.error('No Chrome/Edge executable found. Set CHROME_PATH and rerun.');
    process.exit(2);
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: HEADLESS,
    args: ['--no-sandbox', '--window-size=1460,980'],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));

  // 3D frame rate at the release viewport. The scene renders continuously while
  // the 3D tab is active; count real animation frames rather than trusting the
  // app's own rolling meter.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE + '?resilience=' + Date.now() + '#3d', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1200);
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    function tick(now) {
      frames += 1;
      if (now - start >= 3000) {
        resolve(+(frames * 1000 / (now - start)).toFixed(1));
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  const sceneFps = await page.$eval('#sceneFps', (el) => el.textContent.trim()).catch(() => '');
  if (!(fps >= BUDGETS.performance.fps3d)) fail('3D FPS ' + fps + ' < ' + BUDGETS.performance.fps3d);

  // Forced-colors emulation. Verify the media query is active, the app remains
  // laid out, and the key controls/panels are still rendered and focusable.
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value: 'active' }],
  });
  await page.goto(BASE + '?forced=' + Date.now() + '#noc', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(400);
  const forced = await page.evaluate(() => {
    const visible = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    return {
      matches: matchMedia('(forced-colors: active)').matches,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      tab: visible('#tab-noc'),
      queue: visible('#nocAlarmTable'),
      runbook: visible('#nocAlarmDetail .noc-runbook'),
      detail: visible('#nocAlarmDetail'),
      theme: document.documentElement.getAttribute('data-theme'),
    };
  });
  if (!forced.matches) fail('forced-colors media query did not activate');
  if (forced.scrollWidth > forced.clientWidth) fail('overflow under forced-colors: ' + (forced.scrollWidth - forced.clientWidth) + 'px');
  for (const key of ['tab', 'queue', 'runbook', 'detail']) {
    if (!forced[key]) fail('forced-colors: ' + key + ' is not visible');
  }

  // 200% zoom approximation: 1440x900 at 200% is a 720x450 CSS viewport.
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await page.setViewport({ width: 720, height: 450, deviceScaleFactor: 1 });
  const zoom = {};
  for (const tab of TABS) {
    await page.goto(BASE + '#zoom-' + tab, { waitUntil: 'domcontentloaded' });
    await page.click('#tab-' + tab);
    await sleep(tab === '3d' ? 250 : 100);
    zoom[tab] = await measureOverflow(page);
    if (zoom[tab].scrollWidth > zoom[tab].clientWidth) {
      fail('200% zoom overflow @' + tab + ': ' + (zoom[tab].scrollWidth - zoom[tab].clientWidth) + 'px');
    }
    if (zoom[tab].view !== 'view-' + tab) fail('200% zoom did not activate ' + tab + ': ' + zoom[tab].view);
  }

  // Restore the media emulation before closing.
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await browser.close();

  if (consoleErrors.length) fail('console/page errors: ' + consoleErrors.join(' | '));
  const result = {
    version: BUDGETS.appVersion,
    headless: HEADLESS,
    fps3d: fps,
    sceneFps,
    forced,
    zoom,
    consoleErrors,
    failures,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
