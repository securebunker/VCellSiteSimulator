/* Dev-only command-palette and shortcut-sheet audit. Requires puppeteer-core
   (not a runtime dependency). Usage:
     PUPPETEER_CORE=<path> node tests/palette-audit.js
     CHROME_PATH=<path> BASE=http://127.0.0.1:8765/ node tests/palette-audit.js
*/
'use strict';

let puppeteer;
try {
  puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
} catch (error) {
  console.error('puppeteer-core is not installed. This is a dev-only audit; the app itself has no dependencies.');
  console.error('Set PUPPETEER_CORE to an installed puppeteer-core module path, then rerun.');
  process.exit(2);
}

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const BUDGETS = JSON.parse(require('fs').readFileSync(require('path').resolve(__dirname, '..', 'budgets.json'), 'utf8'));
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => require('fs').existsSync(candidate));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
function check(name, ok, info = '') {
  checks.push({ name, ok: !!ok, info: String(info).slice(0, 300) });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) errors.push(message.type() + ': ' + message.text());
  });
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));

  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + '?palette=' + Date.now() + '#overview', { waitUntil: 'networkidle0' });
  await sleep(350);

  const initial = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    version: document.querySelector('#appVersionTag')?.textContent,
    kbd: document.querySelector('#paletteKbd')?.textContent,
    trigger: !!document.querySelector('#paletteBtn'),
  }));
  check('initial DOM below budget', initial.nodes <= 2000, initial.nodes);
  check('version tag', initial.version === 'v' + BUDGETS.appVersion, initial.version);
  check('top-bar palette hint', initial.trigger && /K|⌘/.test(initial.kbd), JSON.stringify(initial));

  await page.click('#paletteBtn');
  await sleep(150);
  const open = await page.evaluate(() => ({
    modal: !!document.querySelector('.palette-modal'),
    focus: document.activeElement?.id,
    results: document.querySelectorAll('.palette-item').length,
    groups: [...document.querySelectorAll('.palette-group-title')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
    count: document.querySelector('#paletteCount')?.textContent,
    overflow: document.body.style.overflow,
    expanded: document.querySelector('#paletteInput')?.getAttribute('aria-expanded'),
  }));
  check('palette opens on trigger', open.modal && open.focus === 'paletteInput' && open.overflow === 'hidden', JSON.stringify(open));
  check('palette groups on open', open.groups.length === 2 && open.groups[0].includes('Go to') && open.groups[1].includes('Actions'), JSON.stringify(open.groups));
  check('palette result count', open.results >= 18 && /result/.test(open.count), open.results + ' / ' + open.count);
  check('combobox expanded', open.expanded === 'true', open.expanded);

  await page.type('#paletteInput', 'noc');
  await sleep(120);
  const search = await page.evaluate(() => ({
    items: [...document.querySelectorAll('.palette-item')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
    active: document.querySelector('.palette-item[aria-selected="true"]')?.textContent.replace(/\s+/g, ' ').trim(),
    activeDesc: document.querySelector('#paletteInput')?.getAttribute('aria-activedescendant'),
    count: document.querySelector('#paletteCount')?.textContent,
  }));
  check('fuzzy search finds NOC', search.items.some((text) => /NOC \/ SOC/.test(text)), JSON.stringify(search.items.slice(0, 4)));
  check('active descendant set', !!search.activeDesc && search.activeDesc === 'palette-opt-0', JSON.stringify(search));
  check('result count updates', /result/.test(search.count), search.count);

  await page.keyboard.press('ArrowDown');
  await sleep(60);
  const moved = await page.evaluate(() => ({
    active: document.querySelector('.palette-item[aria-selected="true"]')?.id,
    desc: document.querySelector('#paletteInput')?.getAttribute('aria-activedescendant'),
  }));
  check('arrow key moves selection', moved.active === moved.desc && moved.active === 'palette-opt-1', JSON.stringify(moved));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await sleep(300);
  const afterNoc = await page.evaluate(() => ({
    view: document.querySelector('.view.active')?.id,
    tab: document.querySelector('#tab-noc')?.getAttribute('aria-selected'),
    modal: !!document.querySelector('.palette-modal'),
    focus: document.activeElement?.id,
  }));
  check('enter navigates to NOC', afterNoc.view === 'view-noc' && afterNoc.tab === 'true' && !afterNoc.modal, JSON.stringify(afterNoc));
  check('focus lands on NOC tab', afterNoc.focus === 'tab-noc', afterNoc.focus);

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(150);
  const reopened = await page.evaluate(() => ({
    open: !!document.querySelector('.palette-modal'),
    focus: document.activeElement?.id,
  }));
  check('Ctrl+K opens palette globally', reopened.open && reopened.focus === 'paletteInput', JSON.stringify(reopened));

  await page.type('#paletteInput', 'UE-001');
  await sleep(150);
  const ueSearch = await page.evaluate(() => ({
    items: [...document.querySelectorAll('.palette-item')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
    groups: [...document.querySelectorAll('.palette-group-title')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
  }));
  check('UE search finds subscriber', ueSearch.items.some((text) => /UE-001/.test(text)) && ueSearch.groups.some((text) => /Subscribers/.test(text)), JSON.stringify(ueSearch));
  await page.keyboard.press('Enter');
  await sleep(300);
  const drawer = await page.evaluate(() => ({
    open: !!document.querySelector('.drawer'),
    title: document.querySelector('#drawerTitle')?.textContent,
    palette: !!document.querySelector('.palette-modal'),
  }));
  check('UE result opens subscriber drawer', drawer.open && drawer.title === 'UE-001' && !drawer.palette, JSON.stringify(drawer));
  await page.keyboard.press('Escape');
  await sleep(120);

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(120);
  await page.type('#paletteInput', 'ALM-4102');
  await sleep(150);
  const alarmSearch = await page.evaluate(() => ({
    items: [...document.querySelectorAll('.palette-item')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
    groups: [...document.querySelectorAll('.palette-group-title')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
  }));
  check('alarm search finds alarm', alarmSearch.items.some((text) => /ALM-4102-JITTER/.test(text)) && alarmSearch.groups.some((text) => /Alarms/.test(text)), JSON.stringify(alarmSearch));
  await page.keyboard.press('Enter');
  await sleep(300);
  const alarm = await page.evaluate(() => ({
    view: document.querySelector('.view.active')?.id,
    selected: document.querySelector('#nocAlarmTable tr.is-selected')?.dataset.alarmId,
    detail: document.querySelector('#nocDetailTitle')?.textContent,
  }));
  check('alarm result opens NOC detail', alarm.view === 'view-noc' && alarm.selected === 'ALM-4102-JITTER' && /S1-MME path jitter/.test(alarm.detail), JSON.stringify(alarm));

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(120);
  await page.type('#paletteInput', 'Initial EPS attach');
  await sleep(150);
  const procedureMatch = await page.evaluate(() => ({
    active: document.querySelector('.palette-item[aria-selected="true"]')?.dataset.paletteCommand,
    activeText: document.querySelector('.palette-item[aria-selected="true"]')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  check('procedure query ranks procedure first', procedureMatch.active === 'procedure-attach', JSON.stringify(procedureMatch));
  await page.keyboard.press('Enter');
  await sleep(300);
  const procedure = await page.evaluate(() => ({
    view: document.querySelector('.view.active')?.id,
    title: document.querySelector('#traceTitle')?.textContent,
    focus: document.activeElement?.id,
  }));
  check('procedure search selects trace', procedure.view === 'view-signaling' && procedure.title === 'Initial EPS attach', JSON.stringify(procedure));
  check('procedure focus lands on play control', procedure.focus === 'tracePlay', procedure.focus);

  await page.focus('#paletteBtn');
  await page.keyboard.type('?');
  await sleep(200);
  const shortcuts = await page.evaluate(() => ({
    open: !!document.querySelector('.shortcuts-modal'),
    title: document.querySelector('#shortcutsTitle')?.textContent,
    rows: document.querySelectorAll('.shortcut-row').length,
    focus: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent.trim(),
  }));
  check('? opens shortcut sheet', shortcuts.open && shortcuts.title === 'Keyboard shortcuts' && shortcuts.rows >= 8, JSON.stringify(shortcuts));
  await page.keyboard.press('Escape');
  await sleep(150);
  const sheetClosed = await page.evaluate(() => ({
    open: !!document.querySelector('.shortcuts-modal'),
    focus: document.activeElement?.id,
    overflow: document.body.style.overflow,
  }));
  check('shortcut sheet closes with Escape', !sheetClosed.open && sheetClosed.focus === 'paletteBtn' && sheetClosed.overflow !== 'hidden', JSON.stringify(sheetClosed));

  await page.click('#paletteBtn');
  await sleep(120);
  await page.keyboard.press('Escape');
  await sleep(150);
  const focusReturn = await page.evaluate(() => ({
    open: !!document.querySelector('.palette-modal'),
    focus: document.activeElement?.id,
    overflow: document.body.style.overflow,
  }));
  check('palette Escape restores trigger focus', !focusReturn.open && focusReturn.focus === 'paletteBtn' && focusReturn.overflow !== 'hidden', JSON.stringify(focusReturn));

  await page.click('#paletteBtn');
  await sleep(120);
  await page.type('#paletteInput', 'switch to dark theme');
  await sleep(150);
  const themeSearch = await page.evaluate(() => [...document.querySelectorAll('.palette-item')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
  check('theme action searchable', themeSearch.some((text) => /Switch to dark theme/.test(text)), JSON.stringify(themeSearch.slice(0, 3)));
  await page.keyboard.press('Enter');
  await sleep(350);
  const theme = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('vcss-theme'),
    modal: !!document.querySelector('.palette-modal'),
  }));
  check('theme action switches theme', theme.theme === 'dark' && theme.stored === 'dark' && !theme.modal, JSON.stringify(theme));

  await page.click('#paletteBtn');
  await sleep(100);
  await page.type('#paletteInput', 'no-such-command-xyz');
  await sleep(120);
  const empty = await page.evaluate(() => ({
    empty: document.querySelector('.palette-empty')?.textContent.replace(/\s+/g, ' ').trim(),
    active: document.querySelector('#paletteInput')?.getAttribute('aria-activedescendant'),
    count: document.querySelector('#paletteCount')?.textContent,
  }));
  check('no-results state', !!empty.empty && empty.active === null && empty.count === '0 results', JSON.stringify(empty));
  await page.keyboard.press('Escape');
  await sleep(100);

  const widths = [320, 390, 768];
  for (const width of widths) {
    await page.setViewport({ width, height: 900 });
    await page.goto(BASE + '?overflow=' + width + '-' + Date.now() + '#overview', { waitUntil: 'networkidle0' });
    await sleep(300);
    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      trigger: (() => {
        const element = document.querySelector('#paletteBtn');
        const rect = element.getBoundingClientRect();
        return { w: +rect.width.toFixed(1), h: +rect.height.toFixed(1), kbd: getComputedStyle(document.querySelector('#paletteKbd')).display };
      })(),
    }));
    check('no topbar overflow @' + width, box.scrollWidth <= box.clientWidth, JSON.stringify(box));
    check('palette trigger target @' + width, box.trigger.w >= 24 && box.trigger.h >= 24, JSON.stringify(box.trigger));
  }

  check('zero console errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = checks.filter((item) => !item.ok);
  console.log(JSON.stringify({ total: checks.length, failed: failed.length, checks, errors }, null, 2));
  if (failed.length) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
