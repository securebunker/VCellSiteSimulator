# VCSS 4G verification scripts

These scripts are development-only. The application still ships with **no runtime dependencies, no build step and no CDN assets**.

## Static budget and security gate

```powershell
cd vcss-4g
node tests/budget-audit.js
```

Checks raw/compressed size budgets, version consistency, CSP/meta and external theme bootstrap, table semantics, forced-colors/contrast/reduced-transparency CSS, `serve.js` security headers, Brotli/gzip and ETag/304 support, and CSV formula neutralisation. Exits non-zero when a gate fails. v1.4.0 raises the `styles.css` raw ceiling to 172,000 B, the `app.js` ceiling to 270,000 B and the total to 510,000 B for the operator-workflow release; compressed-transfer ceilings remain 130,000 B gzip and 102,400 B Brotli.

## Functional audit (light + dark)

Start the recommended server first (`node serve.js`), then, with `puppeteer-core` installed outside the app:

```powershell
$env:PUPPETEER_CORE = "C:\path\to\puppeteer-core"
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tests/functional-audit.js              # light pass (33 checks)
$env:THEME = "dark"; node tests/functional-audit.js   # dark pass (33 checks)
```

Runs the scripted workflow pass: baseline NOC queue, acknowledge/clear focus flow, CSV export bytes, shift handoff, fake-BTS deploy (4 scenario alarms), escalation, containment auto-clear, filter evidence retention, reset, horizontal overflow at 1440/1000/768/390/320 px on all eight tabs, mobile table/detail behaviour, hash routing with back/forward, duplicate-ID sweep and console-error gate. All suites in this folder accept `BASE` (default `http://127.0.0.1:8765`) and `OUT` (artifacts directory) env overrides.

## Phase 2 acceptance audit (v1.4.0 operator-workflow functions)

```powershell
node tests/phase2-audit.js   # 27 checks
```

Verifies the v1.4.0 acceptance gates end to end: scenario presets (aftermath fast-replay reaches Contained and is labeled in the ops log), cockpit response-progress percent plus containment window/MTTR, per-step response records in the evidence JSON, operator note saved into the SHA-256 evidence payload and persisting across re-renders, shift-log CSV export (versioned filename, response-step + ops-log rows, synthetic markers, under 5 KB), recurring-alarm occurrence dedup (×N badges, exactly 4 distinct scenario alarms after a repeat deploy, Occurrences/Merged incidents CSV columns), baseline preset restore, share-state clipboard JSON, malformed import rejection with toast, and valid import applying the recorded stage.

## Guidance audit

```powershell
node tests/guidance-audit.js   # 29 checks
```

Guidance-tab dedicated pass: route render, semantics, cross-tab map links, fake-BTS dialog open/Escape with focus restore, theme actions, hash history, End/Home/ArrowLeft tab-loop keys, overflow at the five core widths, mobile path stacking, tab-strip scrolling and console-error gate.

## Target audit

```powershell
node tests/target-audit.js   # 0 under-24px gates at 320/390/768 px
```

Measures every hit target on all eight tabs at 320, 390 and 768 px and fails on anything under the 24 CSS px gate.

## Browser audit

Start the recommended server first:

```powershell
node serve.js
```

Then, with `puppeteer-core` installed outside the app:

```powershell
$env:PUPPETEER_CORE = "C:\path\to\puppeteer-core"
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tests/browser-audit.js
```

Checks the initial DOM budget, first-activation rendering, 24 px target sizes, 44 px primary mobile actions, horizontal overflow across the release width matrix (320–2560 px plus short landscape viewports at 420–500 px height), command-palette fit at 320×640 and 820×430, 24 px target sweeps inside the fake-BTS and evidence modals at 320 and 768 px, CSP/security headers, System/Light/Dark theme behaviour, no external requests, no console errors, tablist arrows, skip link, the 3D keyboard description, and the command-palette plus shortcut-sheet smoke path.

## Command palette audit

Start the recommended server, then, with `puppeteer-core` installed outside the app:

```powershell
$env:PUPPETEER_CORE = "C:\path\to\puppeteer-core"
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tests/palette-audit.js
```

Runs the **34-check** palette suite: open via the trigger and Ctrl+K, grouped results, fuzzy search for NOC, UE, alarm and procedure records, arrow/Enter navigation, focus return, theme action, shortcut sheet, no-results state, and overflow/target sizes at 320, 390 and 768 px. Exits non-zero on failure or any console/page error.

## Resilience audit

Start the recommended server, then, with `puppeteer-core` installed outside the app:

```powershell
$env:PUPPETEER_CORE = "C:\path\to\puppeteer-core"
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tests/resilience-audit.js
```

Checks a 3-second 3D frame sample at 1440 × 900, forced-colors emulation, and horizontal overflow at a 200% zoom approximation (720 × 450 CSS viewport) across all eight tabs. Set `HEADED=1` for a visible browser when validating FPS.

## Interaction-probe lab (v1.7.0)

```powershell
$env:PUPPETEER_CORE = "C:\path\to\puppeteer-core"
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tests/perf-lab.js            # exits 1 when a gate fails
node tests/perf-lab.js            # LAB_REPORT_ONLY=1 measures without gating
```

The repeatable interaction-probe harness the two v1.1.1 budgets waited on: it measures **Event Timing click durations** (input delay + processing + paint) on headless new Edge at 1440 × 1000 with a **4× CPU throttle** applied via CDP `Emulation.setCPUThrottlingRate` — 24 warm tab-switch samples (every view warmed once, then real clicks rotate through all eight tabs) and 5 Guidance first-activation samples (fresh `#overview` load, then the first click into Guidance). Gates are **read from `budgets.json`** (`performance.warmTabSwitchP75Ms`, `performance.firstActivationMs`), so documented raises update the lab automatically. Results land in `tests/reports/perf-lab.json` with per-tab medians and p50/p75/p95. Run it on a quiet machine — background browser load moves the floor (344 → 264 ms p75 was measured between runs on the same build).

## Lighthouse gate

Install Lighthouse outside the app, then point `LIGHTHOUSE_BIN` at the CLI script rather than a Windows `.cmd` shim:

```powershell
$env:LIGHTHOUSE_BIN = "C:\path\to\node_modules\lighthouse\cli\index.js"
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tests/lighthouse-audit.js
```

The default run covers Overview, NOC and Guidance and enforces the budgets in `budgets.json`. Reports are written to `tests/reports/`.

**Exception status (v1.8.0):** the Lighthouse TBT gate exceeded 200 ms through v1.2.0 (overview 378 ms, guidance 237 ms), **passed on all three audited tabs in the v1.3.0 release run** (overview 113 ms, NOC 200 ms, guidance 151 ms), passed on Overview (104–177 ms) and Guidance (132–137 ms) in v1.4.0, on Overview (**99 ms**) and Guidance (**170 ms**) in v1.5.0, and on Overview (**142 ms**) and Guidance (**140 ms**) in v1.5.1 while NOC read 219–350 ms (v1.4.0), **250 ms (v1.5.0)** and **249 ms (v1.5.1)** inside the documented range, **passed on all three tabs in the v1.6.0 release run** (overview **122 ms**, NOC **161 ms**, guidance **180 ms**), **in the v1.7.0 release run** (overview **154 ms**, NOC **157 ms**, guidance **160 ms**) and **in the v1.8.0 release run** (overview **94 ms**, NOC **172 ms**, guidance **154 ms**). The NOC exception's documented variance range (171–492 ms across runs) stays on the books as the machine-state envelope — same-day untouched v1.3.0 control builds measured NOC TBT **384 ms** (11 Nov, v1.4.0 run) and **229 ms** (11 Nov, v1.5.0 run) with less NOC content, and a v1.7.0 run read NOC **285 ms** while two leftover background headless Edge processes from earlier probe runs were still alive (see [PERFORMANCE.md](../PERFORMANCE.md)). Accessibility 1.0, FCP, LCP and CLS pass everywhere. **The two v1.1.1 interaction-probe budgets are resolved since v1.7.0**: `tests/perf-lab.js` is the repeatable lab (Event Timing click durations, 4× CPU throttle via CDP, headless new Edge 1440×1000, 24 warm-switch + 5 guidance-activation samples; gates read from `budgets.json`) — Guidance first activation **passes** (lab p75 256–408 ms vs ≤750 ms) and the warm tab-switch gate was **raised 200 → 400 ms p75 with user approval on 2026-11-13**. v1.8.0's full-bleed shell was A/B'd against the v1.7.0 zip build with interleaved runs: no regression (v1.8.0 240–360 ms p75 including a best-ever 240; v1.7.0 312–368 on the same windows). The lab's day-to-day spread is wider than its ±10% repeatability when the machine is busy — observed warm p75 range is now **240–408 ms**, so run the battery on a quiet machine and take release verdicts from those runs (background browser load also burns NOC traces with `NO_NAVSTART` retries). When Lighthouse reports the transient `NO_NAVSTART` trace-start failure, the audit retries up to four times; standalone `LH_TABS=<tab>` runs confirm affected tabs, and the first invocation after a cold browser start may burn all retries — re-run the matrix.

## Manual checks still required

- Screen-reader smoke test for the NOC queue/detail, UE drawer, 3D summary, command palette and shortcut sheet.
- A real OS high-contrast pass; the audit uses CDP forced-colors emulation.
- Text-spacing override review beyond the 200% zoom approximation.
- The interaction-probe budgets are enforced by `tests/perf-lab.js` since v1.7.0 (see the lab section above); keep running it with the rest of the battery on a quiet machine.
