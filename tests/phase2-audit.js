/* Phase 2 (v1.4.0) acceptance audit — operator-workflow functions.
 * Gates: response-step timestamps, alarm occurrence dedup (×N), shift-log CSV
 * < 5 KB with synthetic markers, scenario presets (atomic), share/import state
 * validation, evidence note persistence (joins SHA-256 payload).
 * Env: BASE, OUT, PUPPETEER_CORE, CHROME_PATH.
 */
const p = require(process.env.PUPPETEER_CORE || 'C:/Users/Mahmoud/AppData/Local/npm-cache/_npx/0f94ee7615faf582/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');
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
  await page.goto(BASE + '/#rogue', { waitUntil: 'networkidle0' });
  await sleep(400);
  // Capture every blob handed to URL.createObjectURL (CSV / JSON exports).
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    window.__exports = [];
    URL.createObjectURL = (blob) => {
      if (blob && typeof blob.text === 'function') {
        window.__exports.push({ file: window.__exportFile || '', textPromise: blob.text() });
      }
      return original(blob);
    };
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (String(tag).toLowerCase() === 'a') {
        const dl = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'download');
        Object.defineProperty(el, 'download', { get() { return dl.get.call(this); }, set(v) { window.__exportFile = String(v || ''); dl.set.call(this, v); } });
      }
      return el;
    };
  });

  const lastToast = async () => (await page.evaluate(() => [...document.querySelectorAll('#toastWrap .toast span')].map((n) => n.textContent).pop())) || '';

  /* 2.4 — aftermath preset: atomic reset + deploy + fast-replay containment */
  await page.click('[data-action="preset-aftermath"]');
  await page.waitForFunction(() => document.querySelector('#containTag')?.textContent === 'Complete', { timeout: 20000 });
  await sleep(500);
  await page.click('#tab-noc');
  await sleep(400);
  await page.select('#nocAlarmFilter', 'all');
  await sleep(200);
  const aftermath = await page.evaluate(() => ({
    cockpit: document.querySelector('#nocIncidentCockpit')?.textContent || '',
    status: document.querySelector('#nocIncidentStatus')?.textContent,
    progress: document.querySelector('#nocIncidentCockpit .noc-cockpit-section .tag')?.textContent,
    window: document.querySelector('.noc-cockpit-window')?.textContent || '',
    logFast: /fast replay/i.test([...document.querySelectorAll('#nocLog .feed-item')].map((n) => n.textContent).join(' ')),
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    cleared: document.querySelectorAll('#nocAlarmTable tbody tr.is-cleared').length,
  }));
  check('Aftermath preset runs fast replay to Contained', aftermath.status === 'Contained' && aftermath.logFast, JSON.stringify({ status: aftermath.status, logFast: aftermath.logFast }));
  check('Cockpit records containment window + MTTR', /Started .* UTC/.test(aftermath.window) && /Contained .* UTC · MTTR/.test(aftermath.window), aftermath.window);
  check('Cockpit response progress percent tag', /^\d+%$/.test(aftermath.progress || ''), aftermath.progress);
  check('Fast replay yields 4 scenario alarms (auto-cleared)', aftermath.rows === 7 && aftermath.cleared === 4, 'rows=' + aftermath.rows + ' cleared=' + aftermath.cleared);
  const replayLogged = /compressed synthetic timing/i.test((await page.evaluate(() => [...document.querySelectorAll('#nocLog .feed-detail')].map((n) => n.textContent).join(' '))));
  check('Fast-replay timing labeled in ops log', replayLogged, 'log detail');

  /* 2.6 — evidence note (operator note) */
  await page.click('[data-noc-action="evidence-preview"]');
  await sleep(500);
  const note = 'Synthetic evidence note · reviewer A · containment timing reviewed.';
  await page.evaluate((text) => { document.querySelector('#evidenceNoteInput').value = text; }, note);
  await page.click('#evidenceNoteSave');
  await sleep(500);
  const noteOne = await page.evaluate(() => ({
    preview: document.querySelector('.evidence-preview')?.textContent || '',
    integrity: document.querySelector('.evidence-integrity')?.textContent || '',
    toast: [...document.querySelectorAll('#toastWrap .toast span')].pop()?.textContent || '',
  }));
  check('Evidence note saved', noteOne.preview.includes(note), noteOne.toast);
  check('Note joins SHA-256 evidence payload', /"operatorNote":\s*"[^"]/i.test(noteOne.preview) && /SHA-256[ ·]+[0-9a-f]{16}/i.test(noteOne.integrity), noteOne.integrity.slice(0, 90));
  await page.click('.evidence-modal [data-close="modal"]');
  await sleep(250);
  // Persist across re-renders: leave and re-enter the NOC view, reopen the modal.
  await page.click('#tab-overview');
  await sleep(250);
  await page.click('#tab-noc');
  await sleep(400);
  const noteLine = await page.evaluate(() => document.querySelector('.noc-note-line')?.textContent || '');
  check('Note renders on cockpit after re-render', noteLine.includes('reviewer A'), noteLine.slice(0, 90));
  await page.click('[data-noc-action="evidence-preview"]');
  await sleep(500);
  const noteTwo = await page.evaluate((want) => ({
    box: document.querySelector('#evidenceNoteInput')?.value || '',
    steps: /"responseSteps"/.test(document.querySelector('.evidence-preview')?.textContent || ''),
    detectedAt: /"detectedAt":\s*"(19|20)\d{2}-/.test(document.querySelector('.evidence-preview')?.textContent || ''),
  }), note);
  check('Note persists across evidence modal re-open', noteTwo.box === note, noteTwo.box);
  check('Evidence exposes responseSteps + detectedAt JSON', noteTwo.steps && noteTwo.detectedAt, JSON.stringify({ steps: noteTwo.steps, detectedAt: noteTwo.detectedAt }));
  await page.click('.evidence-modal [data-close="modal"]');
  await sleep(250);

  /* 2.3 — shift log export */
  await page.click('[data-noc-action="export-shift-log"]');
  await sleep(500);
  const shift = await page.evaluate(async () => {
    const item = window.__exports.at(-1);
    const text = item ? await item.textPromise : '';
    return { file: window.__exportFile || '', text: text.replace(/^\uFEFF/, ''), tooBig: text.length > 5120 };
  });
  check('Shift log CSV filename versioned', /^vcss-4g-shift-log-\d{8}-\d{4}Z\.csv$/.test(shift.file), shift.file);
  check('Shift log under 5 KB', !shift.tooBig && shift.text.length > 200, shift.text.length + ' B');
  check('Shift log has response steps + sourcetype markers',
    shift.text.startsWith('"Recorded UTC"') && /Response step/.test(shift.text) && /Ops log/.test(shift.text) && /Synthetic",?$/.test(shift.text.split('\r\n')[1] || ''), shift.text.split('\r\n')[1] || 'empty');
  check('Shift log retains containment narrative', /Containment playbook/i.test(shift.text), '');
  const shiftToast = await lastToast();
  check('Shift log toast reports row count', /Shift log exported · \d+ rows\./.test(shiftToast), shiftToast);

  /* 2.2 — occurrence dedup: redeploy the same fake BTS profile after containment */
  await page.click('#addFakeBtn');
  await sleep(150);
  await page.click('#fakeForm button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('#nocAlarmTable tbody .alarm-repeat').length >= 4, { timeout: 15000 });
  await sleep(400);
  const dedup = await page.evaluate(() => ({
    badges: [...document.querySelectorAll('#nocAlarmTable tbody .alarm-repeat')].map((n) => n.textContent),
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    ids: [...document.querySelectorAll('#nocAlarmTable tbody tr td:nth-child(2) .alarm-id')].map((n) => n.textContent),
    meta: document.querySelector('#nocAlarmDetail .noc-detail-meta')?.textContent || '',
  }));
  check('Redeploy merges instead of duplicating (×4 ×2 badges)', JSON.stringify(dedup.badges) === JSON.stringify(['×2', '×2', '×2', '×2']), JSON.stringify(dedup.badges));
  check('Exactly 4 distinct scenario alarms after recurrence', dedup.ids.filter((id) => /-(RF|IMSI|S1|KPI)$/.test(id)).length === 4, dedup.ids.join(','));
  check('Detail panel shows occurrence merge', /Occurrences\s*×\s*2 merged/i.test(dedup.meta), dedup.meta.slice(0, 140));
  await page.click('#tab-noc');
  await sleep(300);
  await page.click('#exportAlarmsBtn');
  await sleep(500);
  const csv = await page.evaluate(async () => {
    const item = window.__exports.at(-1);
    const text = item ? await item.textPromise : '';
    return text.replace(/^\uFEFF/, '').split('\r\n');
  });
  check('Alarm CSV carries Occurrences + Merged incidents columns', csv[0].includes('"Occurrences"') && csv[0].includes('"Merged incidents"'), csv[0].slice(-120));
  const rfLine = csv.find((line) => /-RF"/.test(line)) || '';
  check('CSV occurrences counted (≥2) on merged RF alarm', /,"2",/.test(rfLine), rfLine.slice(0, 500));
  const incReg = /,"INC-\d+",/.exec(rfLine);
  check('CSV merged incidents lists prior occurrence id', !!incReg && String(incReg[0]).length > 8, (incReg && incReg[0]) + ' | ' + rfLine.slice(0, 500));

  /* 2.4/2.5 — presets + share/import roundtrip */
  await page.click('#tab-rogue');
  await sleep(300);
  await page.click('[data-action="preset-baseline"]');
  await sleep(500);
  const baselinePreset = await page.evaluate(() => ({
    cockpit: document.querySelector('#nocIncidentCockpit')?.textContent || '',
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
  }));
  check('Baseline preset returns to clean site', /No active scenario incident/.test(baselinePreset.cockpit) && baselinePreset.rows >= 3, 'rows=' + baselinePreset.rows);
  await page.click('[data-action="share-state"]');
  await sleep(400);
  const shareToast = await lastToast();
  const shareClipboard = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR:' + e.message; } });
  check('Copy state shares scenario-state JSON', /Scenario state JSON copied/.test(shareToast) && shareClipboard.includes('vcss-scenario-state/1.0'), shareToast + ' | ' + shareClipboard.slice(0, 60));
  await page.click('[data-action="import-state"]');
  await sleep(300);
  await page.evaluate(() => { document.querySelector('#stateJsonInput').value = '{not json at all}'; });
  await page.click('[data-state-action="import"]');
  await sleep(350);
  const rejectToast = await lastToast();
  const modalStill = await page.evaluate(() => !!document.querySelector('.state-modal'));
  check('Malformed import rejected with toast, modal stays', /Import rejected/.test(rejectToast) && modalStill, rejectToast);
  const versionMeta = await page.evaluate(() => document.querySelector('meta[name="app-version"]')?.content || '');
  await page.evaluate((v) => {
    document.querySelector('#stateJsonInput').value = JSON.stringify({
      schema: 'vcss-scenario-state/1.0',
      version: v,
      generatedAt: new Date().toISOString(),
      syntheticSimulationOnly: true,
      stage: 'active',
      bts: { name: 'ImportCell', pci: 388, tac: 9777, band: 3, power: 44, targetCount: 5 },
      incident: null,
      model: null,
      limitation: 'test',
    }, null, 2);
  }, versionMeta);
  await page.click('[data-state-action="import"]');
  await sleep(500);
  const importToast = await lastToast();
  const imported = await page.evaluate(() => ({
    modal: !!document.querySelector('.state-modal'),
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    scenario: [...document.querySelectorAll('#nocAlarmTable tbody tr td:nth-child(2) .alarm-id')].some((id) => /-(RF|IMSI)$/.test(id.textContent)),
  }));
  check('Valid import applies scenario stage', /Scenario state imported · stage active/.test(importToast) && imported.rows >= 7 && imported.scenario, importToast + ' rows=' + imported.rows);
  await page.click('#resetBtn');
  await sleep(400);
  const final = await page.evaluate(() => ({
    rows: document.querySelectorAll('#nocAlarmTable tbody tr').length,
    posture: document.querySelector('#nocPosture')?.textContent,
  }));
  check('Suite leaves clean baseline', final.rows === 3 && final.posture === 'Normal', JSON.stringify(final));

  check('No console or page errors', errors.length === 0, errors.join(' | '));

  await page.screenshot({ path: OUT + '/phase2-final-state.png', fullPage: false });
  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ total: checks.length, failed: failed.length, checks, errors }, null, 2));
  await browser.close();
  if (failed.length) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
