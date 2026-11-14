/* Folded v1.4.0 audit suite.
 * Hit-target size audit across mobile widths (>= 24 CSS px gates).
 * Env: BASE (default http://127.0.0.1:8765), OUT (artifacts dir), PUPPETEER_CORE, CHROME_PATH.
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const p = require(process.env.PUPPETEER_CORE || 'C:/Users/Mahmoud/AppData/Local/npm-cache/_npx/0f94ee7615faf582/node_modules/puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business', 'guidance'];
(async () => {
  const browser = await p.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const out = {};
  for (const width of [320, 390, 768]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1 });
    out[width] = {};
    for (const tab of tabs) {
      await page.goto(BASE + '#' + tab, { waitUntil: 'networkidle0' });
      await sleep(300);
      out[width][tab] = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const sels = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[role="button"],[role="tab"]';
        const items = [...document.querySelectorAll(sels)].filter((el) => {
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' &&
            r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
        }).map((el) => {
          const r = el.getBoundingClientRect();
          const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          const lr = label ? label.getBoundingClientRect() : null;
          return {
            tag: el.tagName, id: el.id, cls: (el.className || '').toString().slice(0, 40),
            w: +r.width.toFixed(1), h: +r.height.toFixed(1),
            hitW: +Math.max(r.width, lr ? lr.width : 0).toFixed(1), hitH: +Math.max(r.height, lr ? lr.height : 0).toFixed(1),
            text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30),
          };
        });
        return {
          pageScrollW: document.documentElement.scrollWidth,
          targets: items.length,
          under24: items.filter(t => t.hitW < 24 || t.hitH < 24),
          under44: items.filter(t => t.hitW < 44 || t.hitH < 44),
        };
      });
      const r = out[width][tab];
      console.log(`${width} ${tab}: targets=${r.targets} under24=${r.under24.length} under44=${r.under44.length} scrollW=${r.pageScrollW}`);
    }
  }
  // v1.6.0 landing gate targets (worst case: 320px viewport)
  await page.setViewport({ width: 320, height: 844, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(400);
  out.gate = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#landingGate button, #landingGate a')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, cls: (el.className || '').toString().slice(0, 30), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    return {
      open: !document.querySelector('#landingGate')?.hidden,
      under24: items.filter((t) => t.w < 24 || t.h < 24),
      items,
    };
  });
  console.log(`gate: open=${out.gate.open} under24=${out.gate.under24.length}`);
  fs.writeFileSync('C:/Users/Mahmoud/AppData/Local/Temp/opencode/vcss-target-audit.json', JSON.stringify(out, null, 2));
  // print distinct patterns under24 at 390
  const seen = new Set();
  for (const tab of tabs) for (const t of out[390][tab].under24) {
    const key = t.tag + '|' + t.cls + '|' + t.text;
    if (!seen.has(key)) { seen.add(key); console.log(`  ${tab}: ${t.tag} ${t.cls} ${t.w}x${t.h} -> ${t.hitW}x${t.hitH} "${t.text}"`); }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
