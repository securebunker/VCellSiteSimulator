# VCSS 4G — Virtual Cell Site Simulator

A browser-based, synthetic 4G/LTE demo for **defensive** rogue-cell and fake-BTS validation. It combines a virtual RAN/EPC control panel, a NOC/SOC operations console, a fleet of simulated UEs, step-through LTE signaling traces, a deployable fake BTS scenario, a live 3D RAN emulation, an MNO business-impact model, and an in-app quick-start guide.

> **Simulation only.** VCSS 4G does not transmit RF, connect to a live EPC/HSS, or use real subscriber data. All PLMNs, IMSIs, phone numbers, radio values, and incidents are fictional and generated locally.

**Current release:** v1.5.0 (11 November 2026). The content-depth release: every alarm now carries a 3–5 step runbook with an expected outcome per step (rendered in the NOC detail panel, searchable from the command palette, and one click away from the 3D rogue inspector), the SOC signal basis explains why each observed signal matters for detection, Guidance gains three learning tracks (executive demo ≈6 min, operator drill ≈12 min, accessibility walkthrough ≈9 min), the glossary grows to 22 LTE terms used in the UI, seven virtual UEs gain synthetic personas in the subscriber drawer, and the business case opens with a "how to read this" note plus a hint under each assumption slider. No new routes, no new palette commands — content-only growth inside documented ceiling raises.

## Run it

No build step or dependencies are required.

1. Open a terminal in this folder.
2. Start the recommended zero-dependency server:

   ```powershell
   node serve.js
   ```

   `serve.js` serves the folder on `127.0.0.1:8765` by default, negotiates Brotli/gzip, returns ETag/304, marks versioned assets immutable, and sends the CSP and security headers used by the v1.1 baseline. To use another folder or port:

   ```powershell
   node serve.js . 9000
   ```

   A generic static server also works:

   ```powershell
   python -m http.server 8765
   ```

3. Open `http://localhost:8765/` in a current Chromium, Firefox, or Safari browser.

Opening `index.html` directly also works in most browsers, but a local server is recommended. The CSP is delivered by `serve.js` and is also present as a meta tag, so the app keeps its security baseline under a plain static server.

## Delivery and security

- `serve.js` is a zero-dependency local static server: Brotli/gzip negotiation, ETag/304 revalidation, immutable caching for versioned assets, path-traversal protection, and security headers.
- The app runs under a strict CSP (`default-src 'none'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`). There is no inline script; the pre-paint theme bootstrap is the external `theme-init.js`.
- `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Resource-Policy` are set by the server and covered by the static audit.
- CSV exports neutralise spreadsheet formula prefixes (`=`, `+`, `-`, `@`, tab, carriage return) before quoting, and include the app version in the exported metadata.
- All assets are local. There are no frameworks, CDN assets, build steps, or runtime dependencies.

## Upgrade roadmap

v1.1.0 shipped the delivery, render-invalidation, WCAG 2.2 target/focus, theme-resilience, security, and budget work. v1.1.1 added the command palette and shortcut sheet. v1.1.2 fixed the local server route, measured containment drill duration, and exposed expected incident frequency in annual ROI. v1.1.3 added cardinal 3D viewpoints, a local camera bookmark, fullscreen, and PNG snapshots. v1.2.0 upgrades NOC/SOC with incident response tracking, event context, signal explanation, and JSON evidence export. v1.3.0 delivers the resolution-readiness and UI-polish pass: readable type scale, toast click-through fix, `color-scheme` hints, safe-area and `dvh` viewport support, ultrawide shell, short-landscape rules, and a wider audit matrix. v1.4.0 delivers the operator-workflow phase: response-step completion states, alarm occurrence dedup, shift-log export, a local scenario library, shareable scenario state with validated import, and operator evidence notes; the temporary audit suites are folded into `tests/`. v1.5.0 delivers the content-depth phase: per-alarm runbooks with expected outcomes, per-signal why-lines, three guidance learning tracks, a 22-term glossary, UE personas, and the business-case reading guide with assumption hints. URL-encoded session sharing and role presets remain planned work. The optional 5G extension remains v2.0, and the offline field kit remains v2.1.

See [UPGRADE-PLAN.md](UPGRADE-PLAN.md) for the measured audit, research references, priorities, effort ranges, acceptance criteria, and explicit non-goals. See [FULL-UPGRADE-PLAN.md](FULL-UPGRADE-PLAN.md) for the consolidated site-functions/content/UI upgrade plan that drove v1.3.0 and maps the next phases. See [PERFORMANCE.md](PERFORMANCE.md) for the release measurements and the documented TBT exception, and [UX-ENHANCEMENTS.md](UX-ENHANCEMENTS.md) for the post-v1.1 UI/UX and 3D enhancement package review.

## What to explore

### Overview
- Synthetic `VCSS-ENB-0417` macro cell on PLMN `001-01`.
- Live KPIs for attached UEs, RRC connections, throughput, attach success, availability, and rogue UEs.
- Editable PCI, TAC, bandwidth, duplex, Tx power, and traffic load with apply, SIB broadcast, and cell restart actions.
- RF coverage/reselection topology, NOC event stream, virtual UE fleet, and downlink throughput chart. On desktop, hover the chart for a crosshair sample and throughput/time tooltip.

### NOC / SOC operations
- One operating picture for service alarms, security correlation, and subscriber impact. All alarms, owners, and response actions are synthetic.
- Six KPI tiles: active alarms, P1/P2 majors, subscribers impacted, revenue at risk, SLA credit exposure, and SOC posture.
- Alarm queue with severity, domain/source, impact, affected UEs, age, and status. Filters cover active, acknowledged, P1, P2, minor, and all alarms.
- Select any alarm to open its runbook — 3–5 numbered steps, each with an expected outcome — plus the evidence line, affected service, and response actions. **Acknowledge** before **Clear**; **Escalate** raises severity by one level and assigns the incident commander. Cleared alarms remain available under **All** and in the CSV export. The SOC signal basis adds a "why this matters" line under each observed detection signal.
- Baseline queue: P3 S1-MME jitter, P4 ANR audit incomplete, and P4 PRB utilization drift — housekeeping and transport noise with no subscriber impact.
- Deploying a fake BTS adds four scenario alarms tied to the incident: P1 unmanaged PCI, P1 pre-auth identity requests, P2 rejected S1 Setup, and P2 attach/throughput degradation. The queue, service impact, domain health, SOC correlation, operations log, and tab badge update together.
- Service impact and domain health roll up the active scenario and baseline state. SOC correlation tracks IMSI exposure, S1 source validation, RF/NMS confidence, EPS-AKA integrity, and the evidence package.
- Copy a shift handoff summary or export the full alarm queue to CSV (including cleared alarms, runbooks, and evidence fields). Alarms auto-clear when the rogue scenario is contained, while the evidence remains attached to the incident.
- NOC actions only change local demo state. No ticket, pager, EPC, HSS, or SOC system is contacted.

### Virtual UEs
- 24 deterministic synthetic subscribers with IMSIs, `+1 555` MSISDNs, device types, radio conditions, bearers, and security state.
- Seven UEs (UE-001/003/007/012/015/019/024) carry synthetic training personas in the drawer, each labeled "not a real subscriber."
- Search by IMSI, MSISDN, or device; filter by state and device type.
- Generate additional UEs, refresh the fleet, inspect a UE drawer, release a UE, or run a trace for a specific subscriber.
- Export the current fleet to CSV.
- Fleet composition and EPS-AKA identity-protection summaries.

### Signaling flow
- Five step-through procedures:
  - Initial EPS attach
  - Service request
  - Tracking area update
  - UE detach
  - Rogue attach / IMSI exposure
- Play, pause, next, reset, speed control, and subject UE selection.
- Animated message ladder, protocol badges, information-element inspector, protocol stack reference, and trace log.
- The rogue trace uses the deployed fake BTS name, PCI, and TAC.

### Fake BTS
- Configure a simulated rogue cell: name, band, PCI, TAC, Tx power, and number of virtual UEs to reselect.
- Watch selected UEs reselect, lose their bearers, and expose synthetic IMSIs before EPS-AKA.
- Review detection evidence: unplanned PCI, TAC mismatch, unmanaged S1 source, premature IMSI request, and reselection clustering.
- Run a five-step containment drill. Recovered UEs return to the macro layer with EPS-AKA security restored, and the affected-UE table preserves the incident record.
- Only one fake BTS scenario can broadcast at a time. Once it is contained, the **New fake BTS** button lets you configure a replacement scenario; deploying it clears the previous incident evidence snapshot.

### 3D emulation
- A dependency-free canvas 3D view of the synthetic test range: macro cell, three neighbor cells, sector beams, coverage rings, virtual UEs, and serving links.
- Drag to orbit, scroll or pinch to zoom, and use **Iso**, **Top**, and **Ground** camera presets. Auto-orbit is optional and respects reduced-motion preferences.
- Select any tower or virtual UE to inspect its live state, radio values, role, coverage, and serving relationship. When a rogue tower is broadcasting, its inspector carries **Open incident** and **Open runbook** buttons that route into the NOC.
- Inspector actions can open the full UE record, focus the camera on a node, or jump to the fake BTS incident.
- Layer toggles isolate coverage rings, sector beams, UEs, serving links, the ground grid, and labels.
- The scene reads directly from the simulation state. Deploying a fake BTS adds a red rogue tower, affected UEs, dashed rogue links, and pulsing coverage rings; containment turns the tower into preserved grey evidence, and **Reset** returns the scene to nominal.
- Keyboard controls on the canvas: left/right arrows orbit, up/down arrows change elevation, `+`/`-` zoom, and `Home` restores the Iso view. Camera presets and layer controls follow in the tab order.
- North, East, South, and West buttons set cardinal camera headings. Save/Restore stores one camera view under `vcss-3d-camera` on this device; the viewport can enter browser full screen and export a PNG with version, simulation mode, and UTC timestamp metadata.

### Business case
- A "how to read this" note above the model walks a first-time reader from the hero exposure number through the cost anatomy, the assumption sliders, and the year-one return card.
- Board-ready cost model covering revenue leakage, service credits, customer care, churn/lifetime value, and regulatory/brand impact.
- Adjustable assumptions for zone subscribers, exposure rate, ARPU, incident duration, expected incidents per year, churn uplift, detection effectiveness, response cost, and annual VCSS program cost — each slider annotated with a plain-language hint.
- Year-one value view with loss avoided, program cost, net benefit, ROI, payback, and residual risk.
- Before/after comparison, board callout, copy-summary, CSV export, and print layout.

Default assumptions: 180,000 zone subscribers, 6.8% exposure, $14.20 ARPU, 6-hour incident, 1.0 expected incident per year, 72% detection effectiveness, and a $185,000 annual program. The default per-incident exposure is approximately **$434K**; annual ROI scales this amount by expected incidents per year.

### Guidance
- A five-minute path that frames the whole exercise: baseline, fake-BTS incident, NOC/SOC response, then business impact.
- Three **learning tracks** with estimated times — executive demo (≈6 min), operator drill (≈12 min), and accessibility walkthrough (≈9 min) — each routing into the workspace through the existing hash links.
- A workspace map with a one-line summary of every tab. The seven working views have a direct **Open** link, and Guidance marks itself with a **Here** tag.
- A recommended six-step demo flow, from checking the baseline queue to quantifying and exporting the result.
- A keyboard and accessibility reference covering the tab strip, 3D camera, dialogs, and the UE drawer.
- A theme and motion card with **System**, **Light**, and **Dark** choices, a live current-theme tag, and a summary of reduced-motion behavior. **System** follows the operating-system preference and updates when it changes.
- A defensive-scope card and a 22-term LTE glossary covering every term used in the UI: PCI, TAC, RRC, NAS, S1-MME, IMSI, EPS-AKA, RSRP/SINR, eNB, EPC, MME, HSS, X2, ANR, PRB, QCI, TAU, paging, PLMN, RSRQ, CQI, and IMSI catcher.
- Every Guidance link uses the same hash routing as the tab strip, so browser back and forward work normally. The page adds no network requests; theme choices are stored locally under `vcss-theme`.

## Command palette and shortcuts

Press **Ctrl K** (**⌘K** on macOS) or use the **Commands** button in the top bar to open a keyboard-first palette. It is created lazily in the existing dialog root, so it adds nothing to the initial render and makes no network request.

- **Go to** lists all eight workspaces; **Actions** covers deploy fake BTS, contain, reset, export NOC alarms, export virtual UEs, copy shift handoff, switch theme, open the shortcut sheet, and the three 3D camera presets.
- **Subscribers**, **Alarms**, and **Procedures** appear as searchable groups. Search matches UE ID, IMSI, MSISDN, IMEI and device; alarm ID, title, source, detail and runbook; and all five signaling procedures.
- The fuzzy matcher ranks direct and keyword matches, and groups reorder by their best result. Arrow keys move the active option, **Enter** runs it, and **Esc** closes. The input exposes `aria-activedescendant`, and focus returns to the opener or moves to the destination tab, record, or play control.
- Press **?** when focus is not in a text field to open the shortcut sheet. It lists global, navigation, and 3D keys. Both surfaces reuse the existing focus trap, Escape handling, and body-scroll lock.
- The top-bar trigger keeps a visible `Ctrl K` hint, switching to `⌘K` on Apple platforms. The hint is hidden at tablet widths, and the button stays a 44 × 44 target on phones.

## Themes

VCSS 4G ships with matched dark and light palettes and no external theme assets.

- On first visit, the app follows the operating system's `prefers-color-scheme` setting. The choice is stored under the localStorage key `vcss-theme` as `light`, `dark`, or `system`.
- The **Light** / **Dark** button in the top bar remains a two-state control. It switches to an explicit theme, exposes the next action through its accessible label, and announces the change through a polite live region.
- The **Theme & motion** card in **Guidance** offers **System**, **Light**, and **Dark**. **System** follows the current OS preference and updates live when that preference changes; **Light** and **Dark** are explicit overrides.
- A small external `theme-init.js` bootstrap runs before the stylesheet loads, so the wrong palette does not flash on startup. Keeping it external lets the app run under a strict `script-src 'self'` CSP without an inline-script exception.
- Both themes cover the full app: navigation, cards, tables, forms, charts, topology, NOC/SOC states, fake-BTS evidence, business case, dialogs, drawer, toasts, scrollbars, and focus rings.
- The SVG topology and the canvas 3D scene read a shared set of CSS scene tokens, so coverage rings, labels, grid lines, sky, ground, beams, towers, and UEs recolor with the theme. Switching themes redraws a paused scene immediately.
- Theme color changes use a short transition that is suppressed under `prefers-reduced-motion: reduce`. The `theme-color` meta tag follows the active theme.

## Interface and motion

The interface uses a small CSS-only motion system, with no animation libraries or external assets.

- A sticky header gains a shadow after scrolling, and a thin gradient bar under it tracks reading progress. The ambient background drifts slowly behind the content.
- The eight-tab strip wraps on wide screens and becomes a horizontally scrollable strip on tablets and phones. Tabs keep their full labels and icons instead of shrinking, and activating a tab scrolls it into view.
- Data views render on first activation and stay cached until their data, filters, or incident state change. Startup no longer builds the hidden NOC, UE, signaling, 3D, or business panels.
- Text follows an 8–13.5 px minimum ladder: no label, chip, or metadata line renders below 8 px, and headings wrap with `text-wrap: balance` so titles break evenly across lines.
- The shell adapts from 320 px phones to ultrawide monitors. Content stretches to 1,720 px above 1,760 px viewports; modals and the command palette size with `dvh` (with `vh` fallbacks); landscape phones with short viewports get a compact 56 px header; and notched devices get safe-area padding on the header, footer, and toasts. Native form controls follow the active theme through `color-scheme`. Toasts are click-transparent, so a notification can never block a button beneath it.
- Views, page headings, KPI tiles, and dashboard cards enter with a short stagger. KPI values flash once when they change, and buttons, cards, and navigation tabs have clear hover and focus responses.
- The downlink throughput chart draws its line and area on refresh. On devices with a fine pointer, hovering the plot shows a crosshair, a highlighted sample dot, and a tooltip with the sampled throughput and relative time.
- Topology coverage rings rotate slowly, UE halos twinkle, the eNB pulses, and fake-BTS links dash toward the rogue cell. During a trace, the active signaling row gets an edge marker and a traveling packet.
- The 3D stage has a slow scan line. NOC/SOC P1 rows gain a red edge and a pulsing severity badge, alarm details and runbooks reveal in sequence, and new operations-log entries briefly highlight. Toasts show a thin lifetime bar.
- All decorative motion is suppressed under `prefers-reduced-motion: reduce`. Entrances render immediately, the chart is fully drawn, and the ambient drift, scan line, radar, pings, and toast timer are hidden. Dialogs, focus handling, and the alarm queue remain fully usable. Print styles remove decorative layers and the scroll-progress bar.

## Performance

The figures below combine the v1.1.1 baseline with fresh v1.2.0, v1.3.0, v1.4.0 and v1.5.0 re-measurements; see [PERFORMANCE.md](PERFORMANCE.md) for the full record. v1.5.0 raises raw ceilings to **280,000 B** (`app.js`), **175,000 B** (`styles.css`), **75,000 B** (`index.html`), and **530,000 B** total runtime for the content-depth release, plus the first compressed-transfer raise: **Brotli 102,400 → 106,000 B** (prose content compresses well but pushed the measured total past the old ceiling; gzip stays 130,000 B). All raises are documented in `budgets.json`.

v1.5.0 passed every enforced gate:

- **521,273 B** raw runtime assets, **116,197 B** gzip, **103,199 B** Brotli (budgets: 530,000 / 130,000 / 106,000).
- **1,924** initial DOM nodes; hidden data views are not rendered at startup, and the command palette is created only when opened.
- **33/33** light and dark functional suites, **27/27** Phase 2 acceptance suite, **29/29** Guidance suite (updated to the new content reality: 11 map rows, 22 glossary terms), **34/34** palette suite, clean browser audit across the 320–2560 px width matrix, **0** controls under 24 px; zero console errors and zero external requests.
- **60.3 fps** in the 3D view (≥ 55 gate; identical to the v1.4.0 release run — the content-depth phase adds no renderer work).
- Lighthouse accessibility **1.0** and CLS **0.000** on Overview, NOC, and Guidance; FCP and LCP pass; TBT passes on Overview (**99 ms**) and Guidance (**170 ms**), while NOC (**250 ms**) remains inside the documented v1.2 TBT exception — a same-day v1.3.0 control build measured NOC TBT **229 ms** with less NOC content, confirming the overage predates v1.5.0 and the spread is machine-state.

Still open from v1.1.1 (documented exception, deferred to the runtime-split work): warm tab-switch p75 **408 ms** headed (395–568 ms headless) vs ≤200 ms at 4× CPU and Guidance first activation **1,096.9 ms** vs ≤750 ms — both await a repeatable lab script. TBT passed on Overview and Guidance in the v1.5.0 release run; NOC TBT stays inside the documented exception until the runtime-split work lands (Phase 4 in [FULL-UPGRADE-PLAN.md](FULL-UPGRADE-PLAN.md)). The full measurements are in [PERFORMANCE.md](PERFORMANCE.md).

## Suggested demo flow

1. Open **Guidance** for the five-minute path, workspace map, and demo checklist. Every **Open** link jumps straight to that view.
2. Open **Overview** and confirm the nominal cell and virtual fleet.
3. Open **NOC / SOC** and review the baseline queue. Open a runbook, try acknowledge/escalate/clear, and export the alarm CSV. **Reset** restores the clean baseline.
4. Visit **Virtual UEs** and filter or search the synthetic records.
5. Open **Signaling flow** and play the initial attach trace.
6. Go to **Fake BTS**, choose **Configure fake BTS**, and deploy the scenario.
7. Return to **NOC / SOC**: the queue now includes the four scenario alarms — P1 RF and identity exposure, P2 core and KPI — alongside any baseline alarms, with active service impact, degraded health, and a critical SOC posture. Escalate an alarm and review the operations log.
8. Inspect the affected UEs, evidence, and modeled exposure on **Fake BTS**.
9. Open **3D emulation**, orbit the range, and select the rogue tower or an affected UE. Use the inspector actions to jump back to the incident.
10. Run **Contain rogue cell**.
11. Return to **NOC / SOC** and confirm scenario alarms auto-clear, the active queue returns to the baseline, **All** retains the cleared evidence, and the shift handoff summary copies.
12. Revisit **3D emulation** to see the rogue tower become preserved grey evidence, then switch to the rogue signaling procedure to compare the identity-exposure flow.
13. Open **Business case**, adjust the assumptions, and export or print the summary.
14. Use **Reset** in the top bar to return to the clean baseline.

**Tip:** press **Ctrl K** at any point to jump to a workspace, run an action, or search a UE, alarm, or procedure. Press **?** for the shortcut sheet.

## Project structure

```text
vcss-4g/
├── index.html          # App shell, views, controls, icons
├── styles.css          # Themes, responsive layout, motion, modal/drawer, print styles
├── app.js              # State, UE generation, NOC alarms, signaling, incident, 3D scene, model, chart hover, command palette
├── theme-init.js       # Pre-paint external theme bootstrap (CSP-safe)
├── serve.js            # Zero-dependency compressed/security-header static server
├── favicon.svg         # Tower mark used by the browser tab
├── budgets.json        # Release size, performance and target-size gates
├── README.md           # Feature guide and demo walkthrough
├── PERFORMANCE.md      # Performance record (v1.1.1 → v1.5.0) and release exception
├── UX-ENHANCEMENTS.md  # Post-v1.1 UI/UX and 3D enhancement research
├── FULL-UPGRADE-PLAN.md # Consolidated functions/content/UI upgrade plan
├── tests/              # Dev-only budget, browser, resilience and Lighthouse audits
└── UPGRADE-PLAN.md     # Measured audit, research and release roadmap
```

Everything is client-side. Simulation state is held in memory and resets when the page reloads; only the theme preference (`vcss-theme`, one of `light`, `dark`, or `system`) is stored in `localStorage`.

## Accessibility and responsiveness

- All eight tabs support arrow keys, Home, and End, and the URL hash follows the active tab (browser back/forward works, including links from Guidance).
- A skip link is the first focusable element; activating it moves focus to the main content.
- On narrow screens, the tab strip scrolls horizontally rather than clipping labels, and the newly active tab is scrolled into view.
- Controls have accessible names, pressed states, and visible focus styles that adapt to both themes. Interactive targets are at least 24 × 24 CSS px; primary mobile actions are at least 44 × 44 px.
- The theme toggle is keyboard-operable, keeps its accessible label in sync with the next action, and announces changes through a polite live region.
- Tables include captions and `scope="col"` headers, including dynamically rendered NOC, UE, and incident tables.
- The interface supports `forced-colors`, `prefers-contrast`, and `prefers-reduced-transparency`, and has been checked at 200% zoom.
- NOC and simulation events are announced through a throttled polite live region, so screen-reader users hear state changes without a queue of duplicate messages.
- The NOC alarm queue is keyboard operable. Focus moves to the next selected alarm after clear or escalation, and filters can be driven from the keyboard.
- The throughput chart remains readable without hover; the pointer tooltip is an enhancement, and the chart keeps its accessible label and visible summary values.
- The command palette is a combobox/listbox with `aria-activedescendant`, a trapped focus cycle, and focus return to the opener or the chosen destination. The `?` shortcut sheet reuses the same dialog behaviour.
- The 3D canvas has an accessible description, keyboard camera controls, and a live scene summary. Camera presets and layer toggles are ordinary focusable controls.
- Layout adapts from wide desktop dashboards to a single-column mobile view. NOC alarms and detail stack full-width on tablets so the queue stays readable. The 3D viewport reflows from a side-by-side stage to stacked telemetry, layers, and inspector panels.
- The motion layer respects reduced-motion preferences: decorative animation stops, content appears in its final state, theme-change transitions are disabled, and scroll progress remains a simple, unobtrusive indicator.

## Verification

The v1.1.0 and v1.1.1 releases passed the existing **33-check light**, **33-check dark**, and **29-check Guidance** suites with zero console errors. v1.1.1 adds a **34-check** palette suite covering open/search/navigation/alarm/UE/procedure/theme/shortcut-sheet/focus/no-results/overflow behaviour at 320, 390, and 768 px, also with zero console errors. The browser audit covers lazy first activation, target sizes, horizontal overflow at eight release widths (320–1440), System/Light/Dark theme behaviour, CSP/security response headers, keyboard navigation, 3D keyboard help, and the palette plus shortcut-sheet smoke path. The resilience audit passes 3D FPS, forced-colors, and 200% zoom. The static budget audit passes all size, version, CSP, table-semantics, compression, ETag/304, security-header, and CSV-hardening gates.

The dev-only scripts are documented in [tests/README.md](tests/README.md). The three performance budget categories covered by the release exception are recorded in [PERFORMANCE.md](PERFORMANCE.md) and `budgets.json`.

## Data and safety notes

- PLMN `001-01`, IMSIs beginning `00101`, and `+1 555` numbers are synthetic.
- The app makes no network requests beyond loading its own local HTML, CSS, JavaScript, and SVG assets. There is no telemetry, CDN, third-party script, or remote font call.
- NOC/SOC alarms, owners, runbooks, shift rosters, and response actions are synthetic. No ticket, pager, SIEM, SOC, EPC, or HSS integration is performed.
- The 3D scene is synthetic geometry only. It does not model live RF propagation, transmit energy, or a real network topology.
- No RF hardware, SDR, live EPC, HSS, or real subscriber systems are used.
- The business model is illustrative. Replace its assumptions with MNO finance and incident data before any commercial use.
- The scenario is intended for defensive training, detection validation, and executive communication.
