/* Phase 4 lab harness (v1.7.0) — the repeatable interaction-probe budgets from v1.1.1.
 *
 * Metrics (both measured with the Event Timing API: input delay + processing + paint):
 *   A. Warm tab-switch p75 <= 200 ms at 4x CPU  — every view rendered once first, then
 *      real clicks rotate through the other tabs; p75 over all samples.
 *   B. Guidance first activation <= 750 ms at 4x CPU — fresh load of #overview, then the
 *      first click into #tab-guidance (lazy render + paint).
 *
 * Env: BASE, PUPPETEER_CORE, CHROME_PATH, RUNS_A (default 24), RUNS_B (default 5),
 *      THROTTLE (default 4), LAB_REPORT_ONLY=1 to skip the gating exit code.
 * Gates are read from budgets.json (performance.warmTabSwitchP75Ms / .firstActivationMs).
 * Output: console JSON + tests/reports/perf-lab.json. Exit 1 when a gate fails.
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const p = require(process.env.PUPPETEER_CORE || 'C:/Users/Mahmoud/AppData/Local/npm-cache/_npx/0f94ee7615faf582/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
/* Gates come from budgets.json (single source of truth, documented raises). */
const BUDGETS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'budgets.json'), 'utf8'));
const GATE_WARM = BUDGETS.performance.warmTabSwitchP75Ms;
const GATE_GUIDANCE = BUDGETS.performance.firstActivationMs;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const THROTTLE = Number(process.env.THROTTLE || 4);
const RUNS_A = Number(process.env.RUNS_A || 24);
const RUNS_B = Number(process.env.RUNS_B || 5);
const TABS = ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business', 'guidance'];

const armObserver = () => {
  window.__evts = [];
  window.__obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__evts.push({ name: e.name, duration: e.duration, start: e.startTime, id: e.interactionId });
  });
  window.__obs.observe({ type: 'event', durationThreshold: 16 });
};
const lastClickDuration = () => {
  const clicks = (window.__evts || []).filter((e) => e.name === 'click' && e.id);
  if (!clicks.length) return null;
  const latestId = clicks[clicks.length - 1].id;
  return Math.max(...clicks.filter((e) => e.id === latestId).map((e) => e.duration));
};
const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : null;
};

(async () => {
  const browser = await p.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const session = await page.createCDPSession();
  await session.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // ---- Scenario A: warm tab-switch p75 ----
  await page.goto(BASE + '/?lab=' + Date.now() + '#overview', { waitUntil: 'networkidle0' });
  await sleep(1200);
  await page.evaluate(armObserver);
  for (const t of TABS) { // warm every view once (lazy renders)
    await page.click('#tab-' + t);
    await sleep(340);
  }
  const samplesA = [];
  const perTab = {};
  let current = 'guidance';
  for (let i = 0; i < RUNS_A; i++) {
    const target = TABS[(TABS.indexOf(current) + 1) % TABS.length];
    await page.evaluate(() => { window.__evts = []; });
    const t0 = Date.now();
    await page.click('#tab-' + target);
    await sleep(700);
    const d = await page.evaluate(lastClickDuration);
    if (d != null) {
      samplesA.push(d);
      (perTab[target] = perTab[target] || []).push(d);
    }
    current = target;
  }
  const p50A = pct(samplesA, 0.5);
  const p75A = pct(samplesA, 0.75);
  const p95A = pct(samplesA, 0.95);
  const medians = {};
  for (const [t, arr] of Object.entries(perTab)) medians[t] = Math.round(pct(arr, 0.5));

  // ---- Scenario B: Guidance first activation ----
  const samplesB = [];
  for (let i = 0; i < RUNS_B; i++) {
    await page.goto(BASE + '/?labB=' + Date.now() + '-' + i + '#overview', { waitUntil: 'networkidle0' });
    await sleep(1000);
    await page.evaluate(armObserver);
    await page.evaluate(() => { window.__evts = []; });
    await page.click('#tab-guidance');
    await sleep(900);
    const d = await page.evaluate(lastClickDuration);
    if (d != null) samplesB.push(d);
  }
  const p50B = pct(samplesB, 0.5);
  const p75B = pct(samplesB, 0.75);
  const maxB = samplesB.length ? Math.max(...samplesB) : null;

  const result = {
    version: await page.evaluate(() => document.querySelector('#appVersionTag')?.textContent || ''),
    config: { throttle: 'x' + THROTTLE, viewport: '1440x1000', headless: 'edge-new', samplesA: samplesA.length, samplesB: samplesB.length },
    warmTabSwitch: { samples: samplesA.map((d) => Math.round(d)), p50: Math.round(p50A), p75: Math.round(p75A), p95: Math.round(p95A), gate: GATE_WARM, perTabMedian: medians },
    guidanceFirstActivation: { samples: samplesB.map((d) => Math.round(d)), p50: Math.round(p50B), p75: Math.round(p75B), max: Math.round(maxB), gate: GATE_GUIDANCE },
    errors,
  };
  const failures = [];
  if (p75A > GATE_WARM) failures.push('warmTabSwitch p75 ' + Math.round(p75A) + 'ms > ' + GATE_WARM);
  if (p75B > GATE_GUIDANCE) failures.push('guidanceFirstActivation p75 ' + Math.round(p75B) + 'ms > ' + GATE_GUIDANCE);
  result.failures = failures;
  fs.mkdirSync('tests/reports', { recursive: true });
  fs.writeFileSync('tests/reports/perf-lab.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (failures.length && process.env.LAB_REPORT_ONLY !== '1') process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
