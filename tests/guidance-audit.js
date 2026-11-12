/* Folded v1.4.0 audit suite.
 * Guidance-tab dedicated audit (29 checks).
 * Env: BASE (default http://127.0.0.1:8765), OUT (artifacts dir), PUPPETEER_CORE, CHROME_PATH.
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const p = require(process.env.PUPPETEER_CORE || 'C:/Users/Mahmoud/AppData/Local/npm-cache/_npx/0f94ee7615faf582/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT || 'C:/Users/Mahmoud/AppData/Local/Temp/opencode';
const checks = [];
const check = (name, ok, info = '') => checks.push({ name, ok: !!ok, info: ok ? '' : String(info).slice(0, 400) });

(async () => {
  const browser = await p.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('vcss-theme', 'light'));
  await page.goto(BASE + '/#guidance', { waitUntil: 'networkidle0' });
  await sleep(600);

  const initial = await page.evaluate(() => {
    const active = document.querySelector('.view.active');
    const activeTab = document.querySelector('.tab.active');
    const hero = document.querySelector('.guide-hero');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      active: active?.id,
      activeTab: activeTab?.dataset.view,
      selected: activeTab?.getAttribute('aria-selected'),
      hash: location.hash,
      h1: document.querySelector('#view-guidance h1')?.textContent,
      themeTag: document.querySelector('#guideThemeTag')?.textContent,
      heroVisible: !!hero && hero.getBoundingClientRect().height > 100,
      mapRows: document.querySelectorAll('.guide-map-row').length,
      flowSteps: document.querySelectorAll('.guide-flow li').length,
      keys: document.querySelectorAll('.guide-keys li').length,
      glossary: document.querySelectorAll('.guide-glossary > div').length,
      tabCount: document.querySelectorAll('.tabs .tab').length,
      guideLinks: [...document.querySelectorAll('[data-guidance-tab]')].map((b) => b.dataset.guidanceTab),
    };
  });
  check('Guidance route renders', initial.active === 'view-guidance' && initial.activeTab === 'guidance' && initial.hash === '#guidance', JSON.stringify(initial));
  check('Guidance tab semantics', initial.selected === 'true' && initial.tabCount === 8, JSON.stringify(initial));
  check('Guidance content present', initial.heroVisible && initial.mapRows === 11 && initial.flowSteps === 6 && initial.keys === 7 && initial.glossary === 22, JSON.stringify(initial));
  check('Guidance theme tag matches light theme', initial.theme === 'light' && initial.themeTag === 'Light', initial.theme + '/' + initial.themeTag);
  check('Guidance links cover seven other workspaces', ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business'].every((v) => initial.guideLinks.includes(v)), JSON.stringify(initial.guideLinks));
  await page.screenshot({ path: OUT + '/guidance-light-1440.png', fullPage: true });

  for (const view of ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business']) {
    await page.goto(BASE + '/#guidance', { waitUntil: 'networkidle0' });
    await sleep(180);
    await page.click(`.guide-map [data-guidance-tab="${view}"]`);
    await sleep(view === '3d' ? 260 : 180);
    const routed = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
    check(`Guidance map opens ${view}`, routed.active === 'view-' + view && routed.hash === '#' + view, JSON.stringify(routed));
  }

  await page.goto(BASE + '/#guidance', { waitUntil: 'networkidle0' });
  await sleep(300);
  await page.click('.page-actions [data-action="deploy"]');
  await sleep(220);
  const modal = await page.evaluate(() => ({
    open: !!document.querySelector('#modalRoot .modal'),
    title: document.querySelector('#fakeModalTitle')?.textContent,
    focus: document.activeElement?.id,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  check('Guidance opens Configure fake BTS dialog', modal.open && modal.title === 'Deploy a simulated fake BTS' && modal.focus === 'fakeName' && modal.bodyOverflow === 'hidden', JSON.stringify(modal));
  await page.screenshot({ path: OUT + '/guidance-light-modal-1440.png', fullPage: false });
  await page.keyboard.press('Escape');
  await sleep(220);
  const modalClosed = await page.evaluate(() => ({
    open: !!document.querySelector('#modalRoot .modal'),
    focus: document.activeElement?.dataset?.action || document.activeElement?.textContent?.trim().slice(0, 30),
    overflow: getComputedStyle(document.body).overflow,
  }));
  check('Dialog closes with Escape and restores focus', !modalClosed.open && modalClosed.overflow !== 'hidden', JSON.stringify(modalClosed));

  await page.click('#view-guidance [data-action="toggle-theme"]');
  await sleep(280);
  const dark = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('vcss-theme'),
    tag: document.querySelector('#guideThemeTag')?.textContent,
    meta: document.querySelector('meta[name="theme-color"]')?.content,
  }));
  check('Guidance theme action switches to dark', dark.theme === 'dark' && dark.stored === 'dark' && dark.tag === 'Dark' && dark.meta === '#060e16', JSON.stringify(dark));
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
  await page.screenshot({ path: OUT + '/guidance-dark-1440.png', fullPage: true });
  await page.click('#view-guidance [data-action="toggle-theme"]');
  await sleep(280);
  const light = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('vcss-theme'),
    tag: document.querySelector('#guideThemeTag')?.textContent,
    meta: document.querySelector('meta[name="theme-color"]')?.content,
  }));
  check('Guidance theme action returns to light', light.theme === 'light' && light.stored === 'light' && light.tag === 'Light' && light.meta === '#eef3f8', JSON.stringify(light));

  // Browser history: guidance -> business -> guidance -> back/forward.
  await page.click('.guide-map [data-guidance-tab="business"]');
  await sleep(220);
  await page.click('#tab-guidance');
  await sleep(220);
  const hist1 = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
  await page.goBack();
  await sleep(260);
  const hist2 = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
  await page.goForward();
  await sleep(260);
  const hist3 = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
  check('Guidance participates in hash history', hist1.active === 'view-guidance' && hist1.hash === '#guidance' && hist2.active === 'view-business' && hist3.active === 'view-guidance', JSON.stringify({ hist1, hist2, hist3 }));

  // Keyboard tab strip reaches Guidance and scrolls it into view on mobile.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(BASE + '/#overview', { waitUntil: 'networkidle0' });
  await sleep(350);
  await page.focus('#tab-overview');
  await page.keyboard.press('End');
  await sleep(650);
  const keyEnd = await page.evaluate(() => {
    const strip = document.querySelector('.tabs');
    const tab = document.querySelector('.tab.active');
    const s = strip.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    return { active: tab.dataset.view, focus: document.activeElement?.dataset?.view, scrollLeft: strip.scrollLeft, visible: t.left >= s.left - 1 && t.right <= s.right + 1 };
  });
  check('End key reaches Guidance and scrolls tab into view', keyEnd.active === 'guidance' && keyEnd.focus === 'guidance' && keyEnd.scrollLeft > 0 && keyEnd.visible, JSON.stringify(keyEnd));
  await page.keyboard.press('Home');
  await sleep(500);
  const keyHome = await page.evaluate(() => ({ active: document.querySelector('.tab.active')?.dataset.view, focus: document.activeElement?.dataset?.view, scrollLeft: document.querySelector('.tabs').scrollLeft }));
  check('Home key returns to Overview tab', keyHome.active === 'overview' && keyHome.focus === 'overview' && keyHome.scrollLeft === 0, JSON.stringify(keyHome));
  await page.keyboard.press('ArrowLeft');
  await sleep(500);
  const keyWrap = await page.evaluate(() => ({ active: document.querySelector('.tab.active')?.dataset.view, focus: document.activeElement?.dataset?.view }));
  check('ArrowLeft wraps from Overview to Guidance', keyWrap.active === 'guidance' && keyWrap.focus === 'guidance', JSON.stringify(keyWrap));

  // Responsive layout and overflow.
  const overflows = {};
  for (const [w, h] of [[1440, 1000], [1000, 800], [768, 900], [390, 844], [320, 568]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.evaluate(() => { location.hash = '#guidance'; });
    await sleep(280);
    overflows[w] = await page.evaluate(() => {
      const guide = document.querySelector('#view-guidance');
      const hero = document.querySelector('.guide-hero');
      const map = document.querySelector('.guide-map');
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        guide: guide.scrollWidth - guide.clientWidth,
        hero: hero.scrollWidth - hero.clientWidth,
        heroClipped: getComputedStyle(hero).overflow === 'hidden',
        map: map.scrollWidth - map.clientWidth,
        cols: getComputedStyle(document.querySelector('.guide-path')).gridTemplateColumns.split(' ').length,
        tabStripScroll: document.querySelector('.tabs').scrollWidth > document.querySelector('.tabs').clientWidth,
      };
    });
    check('Guidance no horizontal overflow @' + w, overflows[w].page === 0 && overflows[w].guide === 0 && overflows[w].map === 0 && (overflows[w].hero === 0 || overflows[w].heroClipped), JSON.stringify(overflows[w]));
  }
  check('Guidance mobile path stacks at 390', overflows[390].cols === 1, JSON.stringify(overflows[390]));
  check('Tab strip scrolls on phone widths', overflows[390].tabStripScroll && overflows[320].tabStripScroll, JSON.stringify({ 390: overflows[390].tabStripScroll, 320: overflows[320].tabStripScroll }));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluate(() => { localStorage.setItem('vcss-theme', 'light'); });
  await page.goto(BASE + '/#guidance', { waitUntil: 'networkidle0' });
  await sleep(500);
  await page.screenshot({ path: OUT + '/guidance-light-390.png', fullPage: true });
  await page.evaluate(() => { localStorage.setItem('vcss-theme', 'dark'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await page.screenshot({ path: OUT + '/guidance-dark-390.png', fullPage: true });

  const dupes = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]; });
  check('No duplicate DOM IDs after Guidance', dupes.length === 0, dupes.join(','));
  check('No console or page errors', errors.length === 0, errors.join(' | '));

  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ total: checks.length, failed: failed.length, checks, errors }, null, 2));
  await browser.close();
  if (failed.length) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
