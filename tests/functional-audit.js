/* Folded v1.4.0 audit suite.
 * Running with THEME=light|dark selects the theme pass (light default).
 * Env: BASE (default http://127.0.0.1:8765), OUT (artifacts dir), PUPPETEER_CORE, CHROME_PATH.
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const p = require(process.env.PUPPETEER_CORE || 'C:/Users/Mahmoud/AppData/Local/npm-cache/_npx/0f94ee7615faf582/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT || 'C:/Users/Mahmoud/AppData/Local/Temp/opencode';
const checks = [];
const check = (name, ok, info = '') => checks.push({ name, ok: !!ok, info: ok ? '' : String(info).slice(0, 240) });

(async () => {
  const browser = await p.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(BASE + '/#noc', { waitUntil: 'networkidle0' });
  if (THEME === 'dark') {
    await page.evaluate(() => localStorage.setItem('vcss-theme', 'dark'));
    await page.reload({ waitUntil: 'networkidle0' });
  }
  await sleep(400);
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob && blob.text) {
        blob.text().then((t) => { window.__csv = t; });
        blob.arrayBuffer().then((b) => { window.__csvBytes = [...new Uint8Array(b).slice(0, 3)]; });
      }
      return original(blob);
    };
  });

  const baseline = await page.evaluate(() => ({
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    active: document.querySelector('#nocActive')?.textContent,
    count: document.querySelector('#nocTabCount')?.textContent,
    posture: document.querySelector('#nocPosture')?.textContent,
    selected: document.querySelector('#nocAlarmTable tbody tr.is-selected')?.dataset.alarmId,
    detail: document.querySelector('#nocDetailTitle')?.textContent,
  }));
  check('NOC baseline 3 alarms', baseline.rows === 3 && baseline.active === '3' && baseline.count === '3', JSON.stringify(baseline));
  check('NOC baseline posture Normal', baseline.posture === 'Normal', baseline.posture);
  check('NOC baseline auto-selects first alarm', baseline.selected === 'ALM-4102-JITTER', baseline.selected);
  await page.screenshot({ path: OUT + '/noc-final-baseline-1440.png', fullPage: true });

  await page.click('#nocAlarmTable tbody tr[data-alarm-id="ALM-2088-ANR"]');
  await page.click('#nocAlarmDetail [data-noc-action="ack"]');
  await sleep(120);
  await page.click('#nocAlarmDetail [data-noc-action="clear"]');
  await sleep(200);
  const afterClear = await page.evaluate(() => ({
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    selected: document.querySelector('#nocAlarmTable tbody tr.is-selected')?.dataset.alarmId,
    detail: document.querySelector('#nocDetailTitle')?.textContent,
    focus: document.activeElement?.dataset?.alarmId,
    count: document.querySelector('#nocTabCount')?.textContent,
  }));
  check('Clear removes alarm from active queue', afterClear.rows === 2 && afterClear.count === '2', JSON.stringify(afterClear));
  check('Clear advances detail + focus to next alarm', afterClear.selected === 'ALM-4102-JITTER' && afterClear.focus === 'ALM-4102-JITTER', JSON.stringify(afterClear));

  await page.click('#exportAlarmsBtn');
  await sleep(500);
  const csv = await page.evaluate(() => ({ text: window.__csv || '', bytes: window.__csvBytes, log: document.querySelector('#nocLog .feed-title')?.textContent }));
  const csvLines = csv.text.replace(/^\uFEFF/, '').split('\r\n');
  check('CSV export captured with UTF-8 BOM bytes', JSON.stringify(csv.bytes) === JSON.stringify([239, 187, 191]), JSON.stringify(csv.bytes) + ' ' + csv.text.slice(0, 8));
  check('CSV includes header + all 3 alarms', csvLines.length === 4 && csvLines[0].startsWith('"Alarm ID"'), csvLines.length);

  await page.click('#handoffBtn');
  await sleep(400);
  const handoff = await page.evaluate(async () => {
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch (e) { t = 'ERR ' + e.message; }
    return { text: t, last: [...document.querySelectorAll('#nocShift .shift-row')].find((r) => r.textContent.includes('Last handoff'))?.textContent };
  });
  check('Shift handoff copies synthetic summary', handoff.text.includes('synthetic operations') && handoff.text.includes('Synthetic data only'), handoff.text.slice(0, 80));
  check('Handoff timestamp updates', /Last\s*handoff\s*\d{2}:\d{2}/.test(handoff.last), handoff.last);

  await page.click('#addFakeBtn');
  await sleep(150);
  await page.click('#fakeForm button[type="submit"]');
  await sleep(500);
  await page.click('#tab-noc');
  await sleep(2400);
  const rogue = await page.evaluate(() => ({
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    p1p2: document.querySelector('#nocP1P2')?.textContent,
    posture: document.querySelector('#nocPosture')?.textContent,
    soc: document.querySelector('#nocSocTag')?.textContent,
    health: document.querySelector('#nocHealthTag')?.textContent,
    impact: document.querySelector('#nocImpactTag')?.textContent,
    detail: document.querySelector('#nocDetailTitle')?.textContent,
    sev: document.querySelector('#nocDetailSev')?.textContent,
    count: document.querySelector('#nocTabCount')?.textContent,
    cls: document.querySelector('#nocTabCount')?.className,
  }));
  check('Deploy adds 4 scenario alarms', rogue.rows === 6 && rogue.p1p2 === '2 / 2', JSON.stringify(rogue));
  check('Rogue posture/impact/SOC/health active', rogue.posture === 'Critical' && rogue.impact === 'Active' && rogue.soc === 'Critical' && rogue.health === 'DEGRADED', JSON.stringify(rogue));
  check('RF alarm selected on deploy', rogue.detail === 'Unmanaged PCI 412 broadcasting' && rogue.sev === 'P1', rogue.detail);
  check('NOC tab badge major', rogue.count === '6' && rogue.cls === 'tab-alert', rogue.count + ' / ' + rogue.cls);
  await page.screenshot({ path: OUT + '/noc-final-rogue-1440.png', fullPage: true });

  await page.click('#nocAlarmTable tbody tr[data-alarm-id$="-S1"]');
  await page.click('#nocAlarmDetail [data-noc-action="escalate"]');
  await sleep(200);
  const escalated = await page.evaluate(() => ({
    sev: document.querySelector('#nocDetailSev')?.textContent,
    log: document.querySelector('#nocLog .feed-title')?.textContent,
    owner: document.querySelector('#nocAlarmDetail .noc-detail-meta')?.textContent.includes('Dana Whitfield'),
    focus: document.activeElement?.dataset?.alarmId,
  }));
  check('Escalation raises severity and assigns IC', escalated.sev === 'P1' && escalated.owner, JSON.stringify(escalated));
  check('Escalation logged', /escalated/i.test(escalated.log || ''), escalated.log);

  await page.click('#tab-rogue');
  await sleep(250);
  await page.click('[data-action="contain"]');
  await page.waitForFunction(() => document.querySelector('#containTag')?.textContent === 'Complete', { timeout: 20000 });
  await sleep(300);
  await page.click('#tab-noc');
  await sleep(300);
  const contained = await page.evaluate(() => ({
    active: document.querySelector('#nocActive')?.textContent,
    count: document.querySelector('#nocTabCount')?.textContent,
    selected: document.querySelector('#nocAlarmTable tbody tr.is-selected')?.dataset.alarmId,
    detail: document.querySelector('#nocDetailTitle')?.textContent,
    health: document.querySelector('#nocHealthTag')?.textContent,
    soc: document.querySelector('#nocSocTag')?.textContent,
    impact: document.querySelector('#nocImpactTag')?.textContent,
    posture: document.querySelector('#nocPosture')?.textContent,
    log: document.querySelector('#nocLog .feed-title')?.textContent,
  }));
  check('Containment auto-clears scenario alarms', contained.active === '2' && contained.count === '2' && contained.selected === 'ALM-4102-JITTER', JSON.stringify(contained));
  check('Contained detail falls back to active queue', contained.detail === 'S1-MME path jitter above threshold', contained.detail);
  check('Contained labels', contained.impact === 'Contained' && contained.soc === 'Contained' && contained.health === 'STABLE' && contained.posture === 'Monitoring', JSON.stringify(contained));
  check('Containment logged', /auto-cleared/i.test(contained.log || ''), contained.log);
  await page.select('#nocAlarmFilter', 'all');
  await sleep(150);
  const all = await page.evaluate(() => ({ rows: document.querySelectorAll('#nocAlarmTable tbody tr').length, cleared: document.querySelectorAll('#nocAlarmTable tbody tr.is-cleared').length }));
  check('All filter retains cleared evidence', all.rows === 7 && all.cleared === 5, JSON.stringify(all));

  await page.click('#resetBtn');
  await sleep(500);
  const reset = await page.evaluate(() => ({
    active: document.querySelector('.view.active')?.id,
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    count: document.querySelector('#nocTabCount')?.textContent,
    filter: document.querySelector('#nocAlarmFilter')?.value,
    posture: document.querySelector('#nocPosture')?.textContent,
  }));
  check('Reset restores NOC baseline', reset.active === 'view-overview' && reset.rows === 3 && reset.count === '3' && reset.filter === 'active' && reset.posture === 'Normal', JSON.stringify(reset));

  // All tabs responsive at key widths
  const overflows = {};
  for (const [w, h] of [[1440, 1000], [1000, 800], [768, 900], [390, 844], [320, 568]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const row = {};
    for (const v of ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business', 'guidance']) {
      await page.click('#tab-' + v);
      await sleep(v === '3d' ? 250 : 120);
      row[v] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    }
    overflows[w] = row;
    check('No horizontal overflow @' + w, Object.values(row).every((n) => n === 0), JSON.stringify(row));
  }

  // Mobile detail + table scroll
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.click('#tab-noc');
  await sleep(400);
  const mobile = await page.evaluate(() => {
    const wrap = document.querySelector('.noc-alarm-wrap');
    const h = document.querySelector('.noc-detail-card .card-head h2');
    return {
      tableScrollable: wrap.scrollWidth > wrap.clientWidth && getComputedStyle(wrap).overflowX === 'auto',
      titleOverflow: h.scrollWidth - h.clientWidth,
      title: h.textContent,
      kpiCols: getComputedStyle(document.querySelector('.noc-kpis')).gridTemplateColumns.split(' ').length,
    };
  });
  check('Mobile NOC table scrolls internally', mobile.tableScrollable, JSON.stringify(mobile));
  check('Mobile detail title not truncated', mobile.titleOverflow === 0 && mobile.title === 'S1-MME path jitter above threshold', JSON.stringify(mobile));
  check('Mobile NOC KPI grid 2 columns', mobile.kpiCols === 2, mobile.kpiCols);

  // Routing
  await page.click('#tab-business');
  await page.evaluate(() => { location.hash = '#noc'; });
  await sleep(250);
  const manual = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
  await page.goBack();
  await sleep(250);
  const back = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
  await page.goForward();
  await sleep(250);
  const forward = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
  check('Manual hash routing', manual.active === 'view-noc' && manual.hash === '#noc', JSON.stringify(manual));
  check('Browser back/forward routing', back.active === 'view-business' && forward.active === 'view-noc', JSON.stringify({ back, forward }));

  // Duplicate IDs
  const dupes = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]; });
  check('No duplicate DOM IDs', dupes.length === 0, dupes.join(','));

  check('No console or page errors', errors.length === 0, errors.join(' | '));

  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ theme: THEME, total: checks.length, failed: failed.length, checks, errors }, null, 2));
  await browser.close();
  if (failed.length) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
