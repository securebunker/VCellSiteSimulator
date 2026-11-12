# VCSS 4G — Full upgrade plan (functions · content · UI)

Consolidated plan covering **site functions**, **content**, and **UI/UX** for the v1.2.0 baseline and beyond. It merges the release-by-release history in [UPGRADE-PLAN.md](UPGRADE-PLAN.md) and the proposal review in [UX-ENHANCEMENTS.md](UX-ENHANCEMENTS.md) into one phased roadmap with acceptance criteria. Every phase keeps the product rules: eight-tab defensive demo, synthetic data only, local-only operation, no frameworks/CDN/build/runtime dependencies, and all documented performance, accessibility, target-size, security, and transfer gates.

---

## 1. Inputs — audit of the attached v1.2.0 build

The audit battery ran against the attached build before planning:

| Area | Finding |
| --- | --- |
| Budgets | `styles.css` raw 167,741 B **over** its own 165,000 B ceiling; gzip 106,948 B and brotli 95,150 B within their gates; total 485,108 B ≤ 493,000 B |
| Version hygiene | `index.html` meta said 1.1.3 while `app.js`/footer said 1.2.0; favicon cache-bust param `?v=1.1.3` vs others `?v=1.2.0` |
| Functional | Light suite 27/33 — six failures root-caused to a **real defect**: the fixed toast overlay intercepted clicks on the re-rendered Clear button at the viewport bottom. Dark 33/33, Guidance 29/29 |
| Palette | 33/34 — the only failure was test drift (audit pinned `v1.1.3`); 19 palette commands, 1,806 initial DOM nodes |
| Targets & overflow | 0 controls under 24 px at 320/390/768; no horizontal overflow at any tested width |
| Resilience | 60.2 fps 3D, forced-colors pass, 200% zoom pass |
| Performance | Lighthouse a11y 1.0 everywhere; TBT over gate on Overview (378 ms) and Guidance (237 ms), NOC passing; carried v1.1.1 exception |
| Typography | 205 of 238 `font-size` declarations sat at 6–9.5 px — a micro type scale that is hard to read on low-DPI displays |
| Viewport support | No `viewport-fit=cover`, no safe-area insets, no `dvh` usage, no ultrawide treatment, no short-landscape handling |

## 2. Design constraints (apply to every phase)

- **Scope:** the eight-tab defensive demo is the product; no live network, RF, or subscriber data.
- **Delivery:** static files, strict CSP, zero runtime dependencies; all assets local and versioned.
- **Gates that must keep passing:** gzip ≤ 130,000 B, brotli ≤ 102,400 B, raw ceilings per `budgets.json`, ≤ 2,000 initial DOM nodes, 0 targets < 24 px, no horizontal overflow at any audited width, Lighthouse accessibility 1.0, 3D ≥ 55 fps, zero console errors.
- **Exception policy:** any missed budget ships only with an explicit, documented exception in `budgets.json` and [PERFORMANCE.md](PERFORMANCE.md).

---

## 3. Phase 1 — Resolution readiness & UI polish (v1.3.0 — shipped 10 Nov 2026)

Goal: make the UI correct and readable at **any** resolution — from a 320 px phone to a 2560 px ultrawide, portrait or landscape, any theme — without regressing a single gate.

### Delivered

1. **Readable type scale** — one-pass remap of every sub-14 px size to an 8–13.5 px ladder (floor 6–7.5 px → 8–10 px; body copy stays 13–14 px). No CSS variables added, no byte-heavy refactors.
2. **Toast click-through fix** — `.toast-wrap { pointer-events: none }`; toasts are informational only and can never block controls beneath them. This was the root cause of the six light-suite failures.
3. **Theme-aware native controls** — `color-scheme: dark` on `:root` (light theme already declared `light`), so scrollbars, form fields, and date/number pickers match the active theme.
4. **Notched and short viewports** — `viewport-fit=cover` plus safe-area insets on the top bar, command bar, footer, shell, and toasts; `dvh` sizing with `vh` fallbacks for modals, palette, and the 3D stage; compact 56 px header and palette/modal fitting below 520 px landscape height.
5. **Ultrawide shell** — above 1,760 px viewports the content cap stretches 1,560 → 1,720 px (min-width 1600 px rule), keeping line lengths sane on 1920/2560 monitors.
6. **Typographic polish** — `text-wrap: balance` on h1–h3, `text-wrap: pretty` on paragraphs.
7. **Target-size hardening caught by the new audit** — `flex: none` on `.icon-btn` so modal close buttons can no longer flex-shrink below the 24 px gate (measured 18–20 px at 320 px before the fix).
8. **Audit matrix expansion** — browser audit now sweeps overflow at 320/390/480/768/820/1000/1024/1100/1200/1366/1440/1600/1920/2560, short-landscape viewports (740×420, 820×430, 960×500), palette fit at 320×640 / 820×430, and 24 px target sweeps inside the fake-BTS and evidence modals at 320/768. The palette-audit version check reads `budgets.json` so version drift fails the build.
9. **Version hygiene** — meta, footer, `APP_VERSION`, and all `?v=` cache-bust params unified at 1.3.0; `styles.css` ceiling 165,000 → 170,000 B and total 493,000 → 498,000 B with the raise documented in `budgets.json`.

### Acceptance criteria — all met

- Budget audit passes (`styles.css` 168,878 ≤ 170,000; total 486,265 ≤ 498,000; gzip 107,278; brotli 95,348).
- Suites: light 33/33, dark 33/33, Guidance 29/29, palette 34/34; browser audit clean on the full matrix; 0 under-24 px targets; resilience 60.2 fps.
- Lighthouse: a11y 1.0, CLS 0.000 everywhere, and **TBT passing on all three audited tabs (113/200/151 ms)** — first passing release run since the gate was introduced.

---

## 4. Phase 2 — Operator-workflow functions (shipped as v1.4.0, 11 November 2026)

Goal: deepen the NOC/SOC and scenario workflow that v1.2.0 introduced, without new surfaces for their own sake.

| # | Function | Detail | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| 2.1 | Response checklist completion states | Per-step completion timestamps and operator on the Detect/Verify/Contain/Recover/Report steps; progress % in the cockpit header | Every step records state + time; keyboard operable; palette actions still 19+ | ✅ v1.4.0 — `incident.steps` records (`{key, label, status, at, by}`), `detectedAt`/`containedAt` window line with MTTR, progress % tag + meter; phase2-audit 27/27 |
| 2.2 | Alarm deduplication | Correlated events collapse into one alarm with an occurrence counter and "merged from" list | Deploy produces 4 distinct alarms; repeated triggers increment counts; CSV shows counts | ✅ v1.4.0 — stable `dedupKey` (rogue-rf/imsi/s1/kpi), `occurrences`, `mergedFrom`, ×N badge, detail merge rows, CSV Occurrences/Merged incidents columns; exactly 4 distinct alarms after repeat deploy (phase2-audit) |
| 2.3 | Shift log export | Operations log + incident timeline export as CSV/JSON with synthetic-only markers | Export under 5 KB; no external calls; versioned filename | ✅ v1.4.0 — `exportShiftLog()` CSV (`vcss-4g-shift-log-YYYYMMDD-HHMMZ.csv`), ops log + response-step rows, `Synthetic` scope marker on every row, measured < 5 KB; button in the shift card + palette action |
| 2.4 | Scenario library (local presets) | 2–3 built-in scenario presets (baseline, full incident, contained-aftermath) selectable from Fake BTS or palette | Switching presets resets state atomically; localStorage-only; reset restores baseline | ✅ v1.4.0 — Baseline/Incident/Aftermath buttons in the Fake BTS page actions + 3 palette commands; atomic `resetSimulation({silent})` → optional fast-replay containment (compressed synthetic timing, labeled) |
| 2.5 | Shareable state export | Copy/import a compact scenario-state JSON (no auto-load from URL hash) | Import validates schema + version; rejects malformed input with a toast | ✅ v1.4.0 — `vcss-scenario-state/1.0` payload via clipboard/modal; schema+version+synthetic-marker validation; malformed input rejected with toast and modal retained |
| 2.6 | Evidence notes | Operator free-text note field on the incident, included in the evidence JSON | Note persists across re-renders; sanitized; included in SHA-256 payload | ✅ v1.4.0 — note editor in the evidence modal (esc()-rendered, 400-char cap), rendered on the cockpit note line, `operatorNote` joins the SHA-256-covered payload |

Budgets: raw `app.js` ceiling raised 260,000 → 270,000 B, `styles.css` 170,000 → 172,000 B, total 498,000 → 510,000 B (documented in `budgets.json`); compressed gates unchanged and passing (brotli 100,182 B, gzip 112,814 B, measured).

## 5. Phase 3 — Content depth (shipped as v1.5.0, 11 November 2026)

| # | Content | Detail | Status |
| --- | --- | --- | --- |
| 3.1 | Guidance curriculum | Expand the five-minute path into three tracks (executive demo, operator drill, accessibility walkthrough) with estimated times | Shipped — Learning-tracks card (≈6 / 12 / 9 min) routes through existing `data-guidance-tab` links |
| 3.2 | Runbook library | Give every alarm a 3–5 step runbook with expected outcomes; cross-link from palette and 3D inspector | Shipped — all 7 alarms carry `{step, outcome}` runbooks (3–5 steps), rendered in NOC detail, indexed in palette search, and reachable from a new 3D rogue-inspector "Open runbook" button |
| 3.3 | Signal explanations | Add per-signal "why this matters" copy in the SOC panel, keeping the synthetic-basis labeling | Shipped — 4 why-lines under observed signals, synthetic labeling unchanged |
| 3.4 | Glossary growth | Extend the glossary toward full 4G/LTE terms used in the UI (S1-MME, EPS-AKA, ANR, PCI, TAC…) | Shipped — 22 terms, every one used somewhere in the UI |
| 3.5 | UE narratives | Give a handful of virtual UEs short synthetic backstories that show up in the drawer | Shipped — 7 personas (UE-001/003/007/012/015/019/024) with a "not a real subscriber" note |
| 3.6 | Business-case narrative | One-paragraph "how to read this" above the model; assumptions annotated inline | Shipped — reading-guide note plus a hint under each of the 14 assumption sliders |

Acceptance: no new routes; content-only byte growth within ceilings; Guidance/README stay consistent; all text passes the type-scale floor. — **Met:** no new routes; raw growth 521,273 B ≤ 530,000 B with documented ceiling raises (index.html 70,000→75,000, styles.css 172,000→175,000, app.js 270,000→280,000, total 510,000→530,000, brotli 102,400→106,000 — first compressed raise, recorded in `budgets.json`); Guidance suite updated to the new reality (11 map rows, 22 glossary terms) and passes 29/29; palette command count unchanged at 25.

## 6. Phase 4 — Performance remediation (v1.6.0 candidate)

Carried items from v1.1.1, now with TBT passing in the v1.3.0 release run:

1. **Repeatable lab harness first** — a `tests/perf-audit.js` that measures warm tab-switch p75 and first activation at 4× CPU deterministically, so the exception can be retired on evidence, not hope.
2. **Virtualize the NOC queue and UE table** (windowed rows, stable height, keyboard selection preserved).
3. **Split the NOC first render** — queue + detail paint before SOC correlation panels.
4. **Split Guidance first render** — quick path first, lower sections deferred.
5. **Re-run the full Lighthouse matrix** across all eight tabs and both themes before retiring the exception.
6. Only after 1–5: re-evaluate the CSS/JS split (80 KB / 120 KB targets) with measured before/after.

Acceptance: warm p75 ≤ 200 ms and Guidance first activation ≤ 750 ms at 4× CPU, TBT ≤ 200 ms on all eight tabs, 3D ≥ 55 fps — then delete the exception from `budgets.json`.

## 7. Later phases (unchanged direction)

- **v2.0 (optional):** 5G extension — new tab, NSA/SA call flows, shared with the 4G state machine; own budgets and audit pass.
- **v2.1 (optional):** offline field kit — single-file bundle, PWA-safe caching only if it keeps the CSP story intact.
- Session sharing via URL encoding, role presets, and alarm escalation SLAs remain backlog items; each ships with its own audit additions.

## 8. Non-goals (standing)

- No frameworks, CDNs, build steps, or runtime dependencies.
- No real telecom integration, RF transmission, or subscriber data — synthetic only.
- No dark patterns, no telemetry, no external fonts.
- No gate relaxation without a documented exception in `budgets.json` + [PERFORMANCE.md](PERFORMANCE.md).

## 9. Verification matrix (per release)

| Suite | Command | Gate |
| --- | --- | --- |
| Static budget + security | `node tests/budget-audit.js` | all gates green |
| Browser audit (extended matrix) | `node tests/browser-audit.js` | 0 failures |
| Palette | `node tests/palette-audit.js` | 34/34 |
| Functional (light/dark) | `node tests/functional-audit.js` (`THEME=dark` for the dark pass) | 33/33 each |
| Phase 2 acceptance | `node tests/phase2-audit.js` | 27/27 |
| Guidance | `node tests/guidance-audit.js` | 29/29 |
| Targets | `node tests/target-audit.js` | 0 under 24 px |
| Resilience | `node tests/resilience-audit.js` | ≥ 55 fps, pass |
| Lighthouse | `node tests/lighthouse-audit.js` | budgets in `budgets.json` |

All suites accept `BASE` (default `http://127.0.0.1:8765`), `OUT`, `PUPPETEER_CORE` and `CHROME_PATH` env overrides. The three temporary suites are folded into `tests/` as of v1.4.0 (functional/guidance/target audits), and `tests/phase2-audit.js` covers the operator-workflow acceptance gates.
