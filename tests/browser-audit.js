/* Dev-only browser audit: lazy render, target sizes, overflow, themes, CSP and
   keyboard smoke checks. Requires puppeteer-core (not a runtime dependency).
   Usage:
     PUPPETEER_CORE=<path> node tests/browser-audit.js
     CHROME_PATH=<path> BASE=http://127.0.0.1:8765/ node tests/browser-audit.js
*/
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
const failures = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  failures.push(message);
}

async function measureTargets(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const selector = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[role="button"],[role="tab"]';
    const items = [...document.querySelectorAll(selector)].filter((el) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
        && rect.right > 0 && rect.left < vw && rect.bottom > 0 && rect.top < vh;
    }).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        id: el.id,
        cls: String(el.className || '').slice(0, 34),
        w: +rect.width.toFixed(1),
        h: +rect.height.toFixed(1),
        text: String(el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 28),
      };
    });
    const primary = items.filter((item) => /btn-primary|btn-rogue/.test(item.cls));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      under24: items.filter((item) => item.w < 24 || item.h < 24),
      primaryUnder44: primary.filter((item) => item.w < 44 || item.h < 44),
    };
  });
}

(async () => {
  if (!CHROME) {
    console.error('No Chrome/Edge executable found. Set CHROME_PATH and rerun.');
    process.exit(2);
  }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  const externalRequests = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleErrors.push(message.type() + ': ' + message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== new URL(BASE).origin) externalRequests.push(url);
  });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const response = await page.goto(BASE + '?audit=' + Date.now() + '#overview', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(500);

  const initial = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    version: document.querySelector('#appVersionTag')?.textContent,
    theme: document.documentElement.getAttribute('data-theme'),
    tocRows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    ueRows: document.querySelectorAll('#ueTable tbody tr').length,
  }));
  if (initial.nodes > 2000) fail('initial DOM ' + initial.nodes + ' > 2000 nodes');
  if (initial.version !== 'v' + BUDGETS.appVersion) fail('version tag ' + initial.version + ' != v' + BUDGETS.appVersion);
  if (initial.tocRows !== 0 || initial.ueRows !== 0) fail('hidden views were rendered at startup (NOC rows ' + initial.tocRows + ', UE rows ' + initial.ueRows + ')');
  await page.click('#tab-noc');
  await sleep(250);
  const firstActivation = await page.evaluate(() => ({
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    count: document.querySelector('#nocTabCount')?.textContent,
  }));
  if (firstActivation.rows !== 3 || firstActivation.count !== '3') fail('NOC first activation did not render baseline: ' + JSON.stringify(firstActivation));

  const headers = response.headers();
  if (!headers['content-security-policy'] || !headers['content-security-policy'].includes("default-src 'none'")) fail('CSP response header missing');
  for (const header of ['referrer-policy', 'permissions-policy', 'x-content-type-options', 'x-frame-options']) {
    if (!headers[header]) fail('response header missing: ' + header);
  }

  // Target sizes and overflow at all release widths.
  const targetWidths = [320, 390, 768, 1440, 1600, 1920, 2560];
  const overflowWidths = [320, 390, 480, 768, 820, 1000, 1024, 1100, 1200, 1366, 1440, 1600, 1920, 2560];
  for (const width of overflowWidths) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    for (const tab of TABS) {
      await page.goto(BASE + '#audit-' + width + '-' + tab, { waitUntil: 'domcontentloaded' });
      await page.evaluate((name) => {
        const hash = '#audit-' + name;
        if (location.hash !== hash) location.hash = hash;
      }, width + '-' + tab);
      await page.click('#tab-' + tab);
      await sleep(tab === '3d' ? 220 : 90);
      const metrics = await measureTargets(page);
      if (metrics.scrollWidth > metrics.clientWidth) {
        fail('overflow @' + width + ' ' + tab + ': ' + (metrics.scrollWidth - metrics.clientWidth) + 'px');
      }
      if (targetWidths.includes(width)) {
        for (const item of metrics.under24) {
          fail('target <24 @' + width + ' ' + tab + ': ' + item.tag + ' ' + item.cls + ' ' + item.w + 'x' + item.h + ' "' + item.text + '"');
        }
        if (width <= 390) {
          for (const item of metrics.primaryUnder44) {
            fail('primary target <44 @' + width + ' ' + tab + ': ' + item.tag + ' ' + item.cls + ' ' + item.w + 'x' + item.h);
          }
        }
      }
    }
  }

  // Short viewports (landscape phones / short windows): shell, palette and modals must fit.
  for (const [shortW, shortH] of [[740, 420], [820, 430], [960, 500]]) {
    await page.setViewport({ width: shortW, height: shortH, deviceScaleFactor: 1 });
    await page.goto(BASE + '#audit-short-' + shortW, { waitUntil: 'domcontentloaded' });
    await page.click('#tab-3d');
    await sleep(220);
    let shortMetrics = await measureTargets(page);
    if (shortMetrics.scrollWidth > shortMetrics.clientWidth) fail('overflow @' + shortW + 'x' + shortH + ' 3d: ' + (shortMetrics.scrollWidth - shortMetrics.clientWidth) + 'px');
    await page.click('#tab-noc');
    await sleep(90);
    shortMetrics = await measureTargets(page);
    if (shortMetrics.scrollWidth > shortMetrics.clientWidth) fail('overflow @' + shortW + 'x' + shortH + ' noc: ' + (shortMetrics.scrollWidth - shortMetrics.clientWidth) + 'px');
  }

  // Command palette must fit inside the viewport at small and short sizes.
  for (const [palW, palH] of [[320, 640], [820, 430]]) {
    await page.setViewport({ width: palW, height: palH, deviceScaleFactor: 1 });
    await page.goto(BASE + '#audit-palette-' + palW + 'x' + palH, { waitUntil: 'domcontentloaded' });
    await page.click('#paletteBtn');
    await sleep(180);
    const pal = await page.evaluate(() => {
      const rect = document.querySelector('.palette-modal')?.getBoundingClientRect();
      return {
        fit: !!rect && rect.top >= 0 && rect.bottom <= innerHeight + 1 && rect.left >= 0 && rect.right <= innerWidth + 1,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    if (!pal.fit) fail('palette does not fit @' + palW + 'x' + palH + ': ' + JSON.stringify(pal));
    if (pal.overflow) fail('palette causes page overflow @' + palW + 'x' + palH);
    await page.keyboard.press('Escape');
    await sleep(150);
    const closed = await page.evaluate(() => !document.querySelector('.palette-backdrop'));
    if (!closed) fail('palette did not close @' + palW + 'x' + palH);
  }

  // Modal target sweep at phone/tablet widths: fake-BTS deploy modal + NOC evidence modal.
  for (const modalWidth of [320, 768]) {
    await page.setViewport({ width: modalWidth, height: 900, deviceScaleFactor: 1 });
    await page.goto(BASE + '#audit-modal-' + modalWidth, { waitUntil: 'domcontentloaded' });
    // Hash-only navigation can skip the reload; force-close any overlay left by earlier steps.
    await page.evaluate(() => {
      document.querySelectorAll('.palette-backdrop, .modal-backdrop, .drawer-backdrop').forEach((node) => node.remove());
      const roots = [document.querySelector('#modalRoot'), document.querySelector('#paletteRoot')];
      roots.forEach((root) => { if (root) root.innerHTML = ''; });
      document.body.style.overflow = '';
    });
    await sleep(250);
    await page.click('#tab-guidance');
    await page.waitForFunction(() => document.querySelector('#view-guidance')?.classList.contains('active'), { timeout: 10000 });
    await sleep(150);
    await page.click('#view-guidance [data-action="deploy"]');
    await page.waitForSelector('.modal', { timeout: 10000 });
    await sleep(160);
    let modalMetrics = await measureTargets(page);
    if (modalMetrics.scrollWidth > modalMetrics.clientWidth) fail('fake-BTS modal overflow @' + modalWidth);
    for (const item of modalMetrics.under24) fail('fake-BTS modal target <24 @' + modalWidth + ': ' + item.cls + ' ' + item.w + 'x' + item.h + ' "' + item.text + '"');
    await page.click('.modal [data-close="modal"]');
    await sleep(120);
    await page.click('#tab-noc');
    await page.waitForFunction(() => document.querySelector('#view-noc')?.classList.contains('active'), { timeout: 10000 });
    await sleep(120);
    await page.click('[data-noc-action="evidence-preview"]');
    await page.waitForSelector('.evidence-modal', { timeout: 10000 });
    await sleep(160);
    modalMetrics = await measureTargets(page);
    if (modalMetrics.scrollWidth > modalMetrics.clientWidth) fail('evidence modal overflow @' + modalWidth);
    for (const item of modalMetrics.under24) fail('evidence modal target <24 @' + modalWidth + ': ' + item.cls + ' ' + item.w + 'x' + item.h + ' "' + item.text + '"');
    await page.click('.evidence-modal [data-close="modal"]');
    await sleep(100);
  }

  // System theme, explicit choice and the existing two-state top-bar toggle.
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(BASE + '#guidance', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('vcss-theme', 'system'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const system = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    system: matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    stored: localStorage.getItem('vcss-theme'),
    pressed: document.querySelector('[data-theme-choice="system"]')?.getAttribute('aria-pressed'),
  }));
  if (system.theme !== system.system || system.stored !== 'system' || system.pressed !== 'true') fail('System theme did not follow OS preference: ' + JSON.stringify(system));
  await page.click('[data-theme-choice="light"]');
  await sleep(300);
  const explicit = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('vcss-theme'),
    pressed: document.querySelector('[data-theme-choice="light"]')?.getAttribute('aria-pressed'),
    tag: document.querySelector('#guideThemeTag')?.textContent,
  }));
  if (explicit.theme !== 'light' || explicit.stored !== 'light' || explicit.pressed !== 'true' || explicit.tag !== 'Light') fail('Light choice failed: ' + JSON.stringify(explicit));
  await page.click('#themeToggle');
  await sleep(300);
  const toggled = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('vcss-theme'),
  }));
  if (toggled.theme !== 'dark' || toggled.stored !== 'dark') fail('Top-bar two-state toggle failed after explicit choice: ' + JSON.stringify(toggled));

  // Keyboard smoke: tablist arrows, skip link and 3D canvas focus.
  await page.goto(BASE + '?keyboard=' + Date.now() + '#overview', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement?.className);
  if (!String(firstFocus).includes('skip-link')) fail('first Tab stop is not the skip link: ' + firstFocus);
  await page.focus('#tab-overview');
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  const arrow = await page.evaluate(() => ({ tab: document.activeElement?.id, view: document.querySelector('.view.active')?.id }));
  if (arrow.tab !== 'tab-noc' || arrow.view !== 'view-noc') fail('tablist arrow navigation failed: ' + JSON.stringify(arrow));
  await page.goto(BASE + '#3d', { waitUntil: 'networkidle0' });
  await sleep(500);
  const scene = await page.evaluate(() => ({
    focusable: document.querySelector('#scene3d')?.tabIndex,
    help: document.querySelector('#scene3dHelp')?.textContent.trim(),
  }));
  if (scene.focusable !== 0 || !/arrow keys/i.test(scene.help)) fail('3D keyboard description missing: ' + JSON.stringify(scene));

  // Command palette and shortcut sheet smoke checks.
  await page.goto(BASE + '?palette=' + Date.now() + '#overview', { waitUntil: 'networkidle0' });
  await sleep(300);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(180);
  const paletteOpen = await page.evaluate(() => ({
    open: !!document.querySelector('.palette-modal'),
    focus: document.activeElement?.id,
    groups: [...document.querySelectorAll('.palette-group-title')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
    hint: document.querySelector('#paletteKbd')?.textContent,
  }));
  if (!paletteOpen.open || paletteOpen.focus !== 'paletteInput') fail('Ctrl+K did not open the command palette: ' + JSON.stringify(paletteOpen));
  if (!paletteOpen.groups.some((group) => /Go to/.test(group)) || !paletteOpen.groups.some((group) => /Actions/.test(group))) {
    fail('command palette groups missing: ' + JSON.stringify(paletteOpen.groups));
  }
  if (!/K|⌘/.test(paletteOpen.hint || '')) fail('top-bar palette hint missing: ' + paletteOpen.hint);

  await page.type('#paletteInput', 'guidance');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(250);
  const paletteNav = await page.evaluate(() => ({
    view: document.querySelector('.view.active')?.id,
    focus: document.activeElement?.id,
    palette: !!document.querySelector('.palette-modal'),
  }));
  if (paletteNav.view !== 'view-guidance' || paletteNav.focus !== 'tab-guidance' || paletteNav.palette) {
    fail('palette navigation failed: ' + JSON.stringify(paletteNav));
  }

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(150);
  await page.type('#paletteInput', 'ALM-4102');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(250);
  const paletteAlarm = await page.evaluate(() => ({
    view: document.querySelector('.view.active')?.id,
    selected: document.querySelector('#nocAlarmTable tr.is-selected')?.dataset.alarmId,
    detail: document.querySelector('#nocDetailTitle')?.textContent,
  }));
  if (paletteAlarm.view !== 'view-noc' || paletteAlarm.selected !== 'ALM-4102-JITTER' || !/jitter/i.test(paletteAlarm.detail || '')) {
    fail('palette alarm search failed: ' + JSON.stringify(paletteAlarm));
  }

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(150);
  await page.type('#paletteInput', 'UE-001');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(250);
  const paletteUe = await page.evaluate(() => ({
    drawer: !!document.querySelector('.drawer'),
    title: document.querySelector('#drawerTitle')?.textContent,
    palette: !!document.querySelector('.palette-modal'),
  }));
  if (!paletteUe.drawer || paletteUe.title !== 'UE-001' || paletteUe.palette) fail('palette UE search failed: ' + JSON.stringify(paletteUe));
  await page.keyboard.press('Escape');
  await sleep(120);

  await page.focus('#paletteBtn');
  await page.keyboard.type('?');
  await sleep(180);
  const sheet = await page.evaluate(() => ({
    open: !!document.querySelector('.shortcuts-modal'),
    rows: document.querySelectorAll('.shortcut-row').length,
  }));
  if (!sheet.open || sheet.rows < 8) fail('? did not open the shortcut sheet: ' + JSON.stringify(sheet));
  await page.keyboard.press('Escape');
  await sleep(150);
  const sheetClosed = await page.evaluate(() => ({
    open: !!document.querySelector('.shortcuts-modal'),
    focus: document.activeElement?.id,
  }));
  if (sheetClosed.open || sheetClosed.focus !== 'paletteBtn') fail('shortcut sheet did not restore focus: ' + JSON.stringify(sheetClosed));

  await page.click('#paletteBtn');
  await sleep(120);
  await page.keyboard.press('Escape');
  await sleep(150);
  const paletteClosed = await page.evaluate(() => ({
    open: !!document.querySelector('.palette-modal'),
    focus: document.activeElement?.id,
  }));
  if (paletteClosed.open || paletteClosed.focus !== 'paletteBtn') fail('palette did not restore trigger focus: ' + JSON.stringify(paletteClosed));

  if (consoleErrors.length) fail('console/page errors: ' + consoleErrors.join(' | '));
  if (externalRequests.length) fail('external requests: ' + externalRequests.join(' | '));

  await browser.close();
  const result = {
    version: BUDGETS.appVersion,
    initial,
    firstActivation,
    consoleErrors,
    externalRequests,
    failures,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
