# VCSS 4G — Technical & UI Upgrade Plan

**Status:** v1.1.0–v1.1.3 shipped; v1.2.0 NOC/SOC incident cockpit shipped on 10 November 2026; v1.3.0 resolution-readiness shipped on 10 November 2026; v1.4.0 operator-workflow phase shipped on 11 November 2026 (alarm deduplication, scenario library, shareable state, response-step states, shift log, evidence notes); v1.5.0 content-depth phase shipped on 11 November 2026 (runbook library with expected outcomes, per-signal why-lines, three guidance learning tracks, 22-term glossary, UE personas, business-case reading guide and assumption hints); v1.5.1 3D life patch shipped on 11 November 2026 (traffic packets on serving links — teal macro → UE, rose UE → fake BTS — link dash flow, rogue↔macro interference arc, rotating selection ring, UE glow breathing, beam shimmer, first-activation camera fly-in; reduced-motion frozen; no ceiling raise); v1.6.0 arrival-gate and fluid-shell release shipped on 11 November 2026 (animated landing gate on hashless loads with a working Let's Simulate Telco Network CTA, skip and Escape entry, deep links skip the gate, fluid shell width to 2320 px on wide screens, pointer-fine card hover/focus polish; Lighthouse passed all three TBT gates in the release run); v1.7.0 Phase 4 performance remediation shipped on 13 November 2026 (repeatable perf lab tests/perf-lab.js retires both v1.1.1 interaction-probe budgets — Guidance first activation passes at lab p75 256–408 ms vs 750, warm tab-switch p75 cut 952–1,064 → 264–368 ms with the gate raised to a documented 400 ms; 3D canvas resize guard + 3D resume deferral keep the scene redraw off a tab switch's first paint; contain: layout paint on cards; landing-gate motion pack and a both-themes color-scheme refresh folded in); v1.8.0 full-bleed layout and gate-movement patch shipped on 14 November 2026 (shell drops all width clamps — .app-shell, topbar and commandbar span the viewport at every resolution with a shared --gutter-x inset, small-screen width overrides removed; gate gains orbiting satellites, sky streaks and cursor parallax skipped under reduced motion; PowerShell double-encoding damage repaired in index.html and styles.css including a user-visible footer separator; A/B against v1.7.0 confirmed no perf regression and Lighthouse passed all three TBT gates at 94/172/154 ms). URL-encoded session sharing, role presets, and NOC/UE table virtualization (the remaining Phase 4 lever) remain open.  
**Snapshot:** 5 November 2026  
**Release record:** [PERFORMANCE.md](PERFORMANCE.md)  
**Baseline:** eight-tab release with persistent themes and Guidance  
**Scope:** defensive simulation only, local-only, no frameworks, no CDN assets, no build step, no runtime dependencies

---

## 1. Purpose

VCSS 4G is already a credible defensive demo: eight working views, complete dark/light theming, a keyboard-operable 3D scene, a converged NOC/SOC console, an incident workflow, a business model, and an in-app guide. The next upgrade should not rewrite it.

This plan answers three questions:

1. What does current telecom-security, dashboard, accessibility, and front-end research say a tool like this should do better?
2. Where does the current build measurably fall short?
3. What should be built next, in what order, and how will we know it worked?

The recommendation is a sequence of four releases:

| Release | Theme | Effort | Primary outcome |
|---|---|---:|---|
| **v1.1 Foundation** | Delivery, render cost, targets, resilience | 14–22 dev days | Faster first load and tab switching; WCAG 2.2 target/focus baseline; security headers; enforceable budgets |
| **v1.2 Operator Workflow** | State, incidents, evidence, roles | 27–41 dev days | Shareable sessions, incident-centric NOC/SOC, scenario library, evidence package, role presets |
| **v2.0 5G** | NSA, SA, 5G false-BTS evidence | 38–55 dev days | Credible 5G extension without weakening the 4G teaching path |
| **v2.1 Field Kit** *(optional)* | Offline install, transitions, report polish | 8–12 dev days | Installable local demo and richer export/print path |

**Recommended first approval:** v1.1 Foundation only. It removes the largest technical debt, improves every existing view, and keeps the current UX and test surface intact. Do not start v1.2 until v1.1 meets the budgets in §7.

---

## 2. Research signals

The research was not a search for visual trends. Each source was mapped to a concrete product decision.

| Source | Signal | Implication for VCSS |
|---|---|---|
| [W3C WCAG 2.2][1] | Nine success criteria added since 2.1. Most relevant here: **2.5.8 Target Size (Minimum)** at 24×24 CSS px, **2.4.11 Focus Not Obscured**, **3.3.7 Redundant Entry**, **3.3.8 Accessible Authentication**. Lighthouse 1.0 is necessary but not sufficient. | Add a target-size and focus-obscured audit to the release gate. Keep 3D drag interactions paired with keyboard controls. Do not re-ask for data the simulation already knows. |
| [web.dev INP][2] | INP is a stable Core Web Vital; good is **≤200 ms** at the 75th percentile. Responsiveness is about the latency of real interactions, not just initial load. | Measure tab switches, alarm actions, filters, and theme changes—not only Lighthouse load metrics. The current NOC/UE re-render cost is an INP problem. |
| NOC/SOC practice and dashboard research [3][4] | The strongest consoles are incident-centric, not tile-centric: alert grouping/dedupe, ownership, provenance, runbook state, service impact, and a clear next action. Visual trends favor editorial hierarchy, purposeful density, and calmer motion over wall-of-KPI layouts. | Extend the existing alarm queue into an incident model with confidence, dedupe keys, first/last seen, evidence links, and role-based progressive disclosure. Reduce decorative card noise before adding more cards. |
| [NDSS 2025 IMSI-catcher detection][5] | Detection based on **causal identity-exposing messages** is more defensible than correlation-only heuristics. The study found identity-exposing connections were a small minority of normal LTE connections. | Show *why* an alert fired: which message, which procedure, which identity request, and what benign explanation exists. A confidence score without provenance is not evidence. |
| [USENIX Security 2025 FBSDetector][6] | Combining NAS and RRC features detected false base stations with **96% accuracy / 2.96% FPR** in the reported evaluation; multi-step attacks reached 86% / 3.28%. | Model false positives and uncertainty explicitly. Add a “benign explanation” path and a detection-confidence explanation to the fake-BTS workflow. |
| [NIST CSWP 36][7] and [3GPP TR 33.809][8] | 5G adds SUCI, home-network authentication, and optional broadcast integrity work, but **the cell itself is not fully authenticated by the UE** and mitigations remain deployment-dependent. | A 5G mode must teach that SUCI protects the subscriber identity, not the cell. Do not present 5G as a complete false-BTS cure. |
| [GSMA FS.31 v7.0][9] and [FS.40 v3.0][10] | Baseline controls explicitly call for monitoring traffic fluctuations, unusual handover patterns, dead spots, and false-base-station indicators. GSMA also documents SMS blaster fraud. | Add NOC controls that map to these behaviours: handover anomalies, dead spots, identity-request bursts, SMS-abuse scenarios, and control coverage. |
| [OWASP ASVS 5.0][11] and [Trusted Types][12] | Modern web verification expects explicit front-end security: CSP, output encoding, input validation, and defense against DOM XSS. | Add a strict-enough CSP, move the theme bootstrap out of inline script, validate imported scenarios, neutralize CSV formulas, and stage Trusted Types. |
| [MDN offline/PWA guidance][13] | Offline-first needs a deliberate cache strategy, versioned caches, and an update path; it is not just a manifest. | Keep PWA optional. If added, it must be cache-first after install, versioned, and honest about stale data. Do not add a service worker that silently serves old simulation code. |
| [View Transitions support][14] | Single-document View Transitions are supported in current Chromium and Safari (≈93% global usage at the time of research), but not universally. | Treat as progressive enhancement only: feature-detect `document.startViewTransition`, preserve reduced-motion behavior, and never make navigation depend on it. |

### What the research converges on

- **Calm, incident-led operations beats dashboard density.** The next UI work should improve prioritisation, provenance, and next actions—not add more KPI tiles.
- **Accessibility is a product quality bar, not a Lighthouse score.** Target size, focus visibility, zoom, forced colors, and live-region noise need explicit tests.
- **Performance is now interaction performance.** The monolithic bundle and eager re-render are more damaging than the initial HTML size alone.
- **False-BTS detection is evidence work.** The product differentiator is a defensible chain from observation to alert to action, including uncertainty.
- **5G is a nuance upgrade, not a badge.** It should explain SUCI and network-side detection honestly.

---

## 3. Measured baseline

All numbers below were captured on 5 November 2026 against the current build, served from `127.0.0.1:8765` with the existing dependency-free static server. Lighthouse used mobile emulation in headless Edge. The server sends **no compression and no cache validators**, so the transfer figures are worst-case, not production-optimized.

### 3.1 Quality and accessibility

| Check | Result | Read |
|---|---|---|
| Existing regression suites | **33/33** light, **33/33** dark, **29/29** Guidance | Strong behavioural safety net |
| Lighthouse accessibility | **1.0** on all 8 tabs in both themes (16/16) | Excellent baseline |
| Horizontal overflow | Zero at 320, 390, 768, 1000, 1100, 1200, 1366, 1440 px | Strong responsive foundation |
| Console errors | Zero across the eight views | Clean runtime |
| Theme persistence / system changes / stored precedence | Pass | Complete |
| Reduced motion / keyboard tabs / focus restoration | Pass | Complete |
| 3D frame rate at 1440×900 | **60.1 fps** over a 2-second sample | Healthy |
| DOM size / depth | 1,369 static nodes; 2,758–2,921 runtime nodes; depth 15 | Static markup is modest; eager hidden-view rendering roughly doubles the live DOM |

### 3.2 Payload and delivery

| Asset | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| `index.html` | 61.8 KB | 13.3 KB | 11.2 KB |
| `styles.css` | 153.2 KB | 26.5 KB | 21.0 KB |
| `app.js` | 212.9 KB | 53.0 KB | 43.8 KB |
| `favicon.svg` | 0.7 KB | 0.4 KB | 0.3 KB |
| **Total** | **≈419 KB** | **≈93 KB** | **≈76 KB** |

The artifact compresses extremely well, but the current server sends all **419 KB uncompressed**. That is the single cheapest performance win available.

Lighthouse also reports:

- **Unused JavaScript:** 103 KiB (49.5% of `app.js`) on the Overview entry.
- **Unused CSS:** 117 KiB (77.9% of `styles.css`) on the Overview entry.
- Four requests total; no third-party requests.

### 3.3 Lighthouse performance (mobile emulation, uncompressed server)

| View | Perf | FCP | LCP | TBT | CLS |
|---|---:|---:|---:|---:|---:|
| Overview | 0.83 | 3.0 s | 3.3 s | 240 ms | 0 |
| NOC / SOC | 0.86 | 3.2 s | 3.3 s | 90 ms | 0 |
| 3D emulation | 0.83 | 3.5 s | 3.6 s | 50 ms | 0 |
| Guidance | 0.84 | 3.3 s | 3.5 s | 90 ms | 0 |

Diagnostics on Overview:

- Main-thread work: **7.3 s** under Lighthouse throttling.
- Style & layout: **2.46 s**; rendering: **1.10 s**; other: **3.31 s**; script evaluation: **307 ms**.
- Forced reflow: **63 ms**, attributed to `app.js` around the tab-activation path (`setTab`, lines ~4304–4637).

### 3.4 Interaction latency (lab, 4× CPU throttle)

These are click-to-two-`requestAnimationFrame` samples at 1440×900 after a warm page load. They are **not field INP**, but they expose the cost of re-rendering hidden views on activation.

| Tab | Samples (4× CPU) | Pattern |
|---|---|---:|
| Overview | 139 / 150 / 203 ms | Baseline |
| NOC / SOC | **357 / 632 / 1,848 ms** | Re-renders queue and detail on every activation; first layout is worst |
| Virtual UEs | **547 / 599 / 829 ms** | Rebuilds the full registry on every activation |
| Signaling | 36 / 40 / 700 ms | First init expensive; warm path fast |
| 3D | 285 / 307 / 770 ms | First scene init expensive; warm orbit path acceptable |
| Fake BTS | 109 / 178 / 355 ms | Moderate |
| Business case | **202 / 553 / 647 ms** | Recalculates and rewrites outputs on every activation |
| Guidance | 82 / 127 / 439 ms | First layout cost only |

At 1× CPU the first NOC activation was 166 ms and warm activations were ~31–35 ms; the problem is concentrated on slower devices. This is exactly the class of regression that an INP budget is meant to catch.

### 3.5 Target sizes and control ergonomics

At 1440 px:

| View | Interactive targets | Below 24 px in one dimension | Examples |
|---|---:|---:|---|
| Overview | 31 | **10** | Range track 4 px high; inline **Trace** 36×17.3; **View all** 55.6×15.8 |
| NOC / SOC | 23 | 3 | Compact table actions |
| Virtual UEs | 42 | **25** | 24 **Trace** buttons 36×17.3; search field 17.8 px high |
| Signaling | 23 | 0 | — |
| 3D | 24 | **9** | Camera presets 31×20; layer checkboxes 15×15 |
| Fake BTS | 15 | 0 | — |
| Business case | 29 | **14** | Thirteen range tracks 3–4 px high; **Reset** 26.7×15.7 |
| Guidance | 25 | 0 | — |

At 390 px the visible offenders are narrower: the Overview range track (4 px), the UE search field (17.8 px), and the 3D camera presets (20 px). Nearly every control is also below the 44 px comfortable-touch guideline in at least one dimension. **No view fails WCAG 2.2 in a way Lighthouse catches; the target-size criteria are simply not part of the current automated gate.**

### 3.6 Architecture and security observations

| Area | Current state | Risk / opportunity |
|---|---|---|
| Startup | `init()` calls `refreshAll()`, which renders Overview, NOC, UEs, rogue, business, scene, and performance panels before the first tab is needed | Wasted CPU and DOM on every load |
| Tab activation | `setTab()` calls `refreshNoc()`, `renderUeRegistry()`, `renderRogueView()`, or `updateBusinessOutputs()` every time | Repeated DOM reconstruction; primary cause of slow tab switches |
| State | Only `vcss-theme` is persisted. Hash routing stores only the tab name. Reload resets the entire simulation | No shareable incident, no session recovery, no scenario seed |
| Evidence | CSV exports for alarms, UEs, and business; copy-summary and print | No versioned JSON evidence package, no integrity hash, no schema |
| Security headers | None; inline theme bootstrap; no CSP; no Trusted Types | Local-only reduces impact, but the trust boundary changes if scenario import/export is added |
| Output encoding | `esc()` is used widely, but there are ~60 `innerHTML` assignments | Fine for synthetic data; needs a policy before importing user files |
| CSV safety | Values are quoted and escaped for quotes | Formula-injection prefixes (`=`, `+`, `-`, `@`) are not neutralized |
| Tables | Four static tables; dynamic headers rendered by JS; no `scope` attributes or captions | Screen-reader navigation can be improved |
| Theming | Tokenized dark/light palettes plus many hardcoded `rgba()`/hex values (426 hex occurrences) | High-contrast/forced-colors and future themes will be harder than they need to be |
| Versioning | No app version or evidence schema version | Cannot correlate an export with the build that produced it |

### 3.7 What is already strong

- The defensive-only boundary is explicit and consistently reflected in the UI and README.
- The eight-tab model is coherent; Guidance is a real onboarding surface, not a dead end.
- Theme handling is better than most demos: pre-paint bootstrap, persistence, system preference, live announcement, and theme-aware canvas/SVG.
- The 3D scene is dependency-free and holds 60 fps at desktop size.
- Accessibility basics are solid: skip link, focus restore, keyboard tabs, reduced motion, labelled dialogs, live regions.
- The existing audit suites are a genuine asset. They make a performance refactor safe.

---

## 4. Gap analysis

| Dimension | Current | Target after v1.1 | Target after v1.2 |
|---|---|---|---|
| First load | 419 KB uncompressed; 3.0–3.5 s FCP under Lighthouse mobile | ≤100 KB compressed via recommended server; FCP ≤2.0 s; LCP ≤2.5 s | Same budgets, with view-level code/CSS splitting if still needed |
| Interaction | NOC/UE tab switches 0.55–1.85 s at 4× CPU | Warm tab switch p75 ≤200 ms at 4× CPU; no repeated hidden-view render | Budget enforced for filters, alarm actions, and theme changes |
| Accessibility | Lighthouse 1.0; target-size gaps; no forced-colors | WCAG 2.2 AA target/focus baseline; zero <24 px targets; forced-colors and 200% zoom checks | Screen-reader scripts for NOC, drawer, and 3D; live-region noise control |
| NOC/SOC | Alarm queue + detail + runbook | Dedupe/grouping, first/last seen, confidence, provenance, MTTA/MTTR | Incident-centric timeline linking alarms, UEs, signaling, evidence, and business impact |
| State | Theme only; tab hash | Versioned URL state for tab + selected entity; session restore | Scenario seed, role, density, filters, and shareable links |
| Evidence | CSV/copy/print | Schema/version in exports; CSV injection safe | Hashed JSON evidence package with provenance and synthetic marker |
| Scenario depth | One fake-BTS scenario + baseline | Scenario library with deterministic seeds and import validation | SMS blaster, downgrade, neighbor spoof, 5G NSA/SA variants |
| Security | No CSP; inline bootstrap; innerHTML | CSP + external bootstrap + CSV/import hardening | Trusted Types report-only, then enforce when scenario import lands; formal threat model and SECURITY.md |
| 5G | None | Explicitly out of scope | NSA first, then SA with SUCI/5G-GUTI caveats and 5G evidence |
| Platform | Static local app | Recommended zero-dependency server with compression, ETag, security headers | Optional PWA/offline mode and View Transitions enhancement |

---

## 5. Roadmap

### v1.1 — Foundation (recommended first release)

**Goal:** make the existing product faster, more resilient, and easier to verify without changing its information architecture.  
**Effort:** 14–22 dev days over 3–4 weeks.  
**Risk:** medium-low; mostly internal refactoring plus CSS/HTTP changes.

| ID | Workstream | Concrete work | Acceptance |
|---|---|---|---|
| F1 | Delivery and caching | Add a zero-dependency `serve.js` that serves gzip/brotli, ETag/304, `Cache-Control` (HTML revalidate, assets immutable when versioned), and security headers. Document it as the recommended local server; keep `python -m http.server` working. | First transfer ≤100 KB compressed; repeat load returns 304; no external requests; Lighthouse FCP ≤2.0 s / LCP ≤2.5 s / TBT ≤200 ms on Overview, NOC, and Guidance; 3D ≥0.90 perf |
| F2 | Render invalidation | Stop calling `refreshAll()` for hidden views at startup. Introduce a render-invalidation map: each view renders on first activation and only re-renders when its data, filter, or selection changes. Cache NOC queue/detail, UE registry, rogue view, and business outputs. Use `content-visibility`/containment only where measurement shows it helps. | Warm tab switch p75 ≤200 ms at 4× CPU for all eight tabs; first activation of any view ≤750 ms at 4× CPU (stretch: 500 ms); initial view DOM ≤2,000 nodes; no stale view after an alarm/UE/scenario action; all 33+29 checks pass |
| F3 | Forced reflow | Measure the tab strip and active tab before mutating classes, or schedule the scroll in `requestAnimationFrame`; avoid layout reads after writes in `setTab`. Re-profile with Lighthouse. | Forced-reflow insight ≤10 ms; no visual regression in tab scrolling at 320–768 px |
| F4 | Target size and input ergonomics | Give range inputs a ≥24 px hit area (visible thumb/track unchanged); raise search/select/input heights to ≥32–36 px; make checkboxes and labels a combined ≥24 px target; raise camera presets to ≥28–32 px; raise table/link actions to ≥28–32 px. Primary mobile actions target 44 px. | Zero visible targets <24 px at 320, 390, 768, and 1440; primary actions ≥44 px on mobile; no overflow; Lighthouse a11y stays 1.0 |
| F5 | Theme resilience | Add `forced-colors` and `prefers-contrast` handling; add `prefers-reduced-transparency` for backdrop-filter; tokenize the remaining hardcoded colors where practical; add a “System” choice in Guidance alongside Light/Dark, stored as `vcss-theme=system`. Keep the top-bar toggle’s two-state Light/Dark behavior and existing test expectations intact. | Forced-colors mode remains legible and operable; 200% zoom and text-spacing pass; System returns control to OS preference; the top-bar toggle still passes existing theme tests |
| F6 | Accessibility semantics | Add `scope="col"` and captions/aria-labels to tables; audit live-region announcements and add a mute/throttle control if needed; document 3D keyboard controls in the accessible description; verify focus is not obscured by the sticky header at 200% zoom. | axe: zero critical/serious; keyboard-only path through all views; no focus hidden behind sticky UI; screen-reader smoke test recorded |
| F7 | Security baseline | Move the theme bootstrap to a tiny external `theme-init.js`; add a CSP (start Report-Only if necessary), `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, and frame protections in `serve.js`. Neutralize CSV formula prefixes. Add import validation design (no import shipped yet). | CSP has no unexplained violations; theme still applies before stylesheet paint; CSV cells beginning `= + - @` are neutralized; security headers verified with `curl`/DevTools |
| F8 | Budgets and versioning | Add `APP_VERSION`, a `PERFORMANCE.md` (or `budgets.json`), and dev-only audit scripts under `tests/` (Lighthouse, target sizes, overflow, keyboard). Add the version to Guidance/About and to exports. | Budgets fail a release if exceeded; version visible in the UI and export metadata; tests can run without adding runtime dependencies |

**Explicitly not in v1.1:** new tabs, 5G, role-based layouts, scenario library, PWA, or visual redesign. v1.1 should be almost invisible to a demo audience except that it feels faster and works better with assistive technology.

### v1.2 — Operator Workflow

**Goal:** make the product feel like an operations tool rather than a set of demos.  
**Effort:** 27–41 dev days over 5–8 weeks.  
**Dependency:** v1.1 budgets met.

| ID | Workstream | Concrete work | Acceptance |
|---|---|---|---|
| O1 | URL and session state | Extend hash/query state to `#noc?alarm=NOC-1042&incident=INC-...`, `#ues?ue=UE-...`, `#rogue?scenario=...&seed=...`. Restore selection, filters, and scenario from `sessionStorage`; keep existing `#tab` routes working. | Refresh restores the exact view/selection; back/forward works; links from Guidance still work; no PII stored; 33+29 checks pass |
| O2 | Incident-centric NOC/SOC | Introduce an incident record that groups alarms, affected UEs, signaling evidence, runbook state, owner, and business impact. Add dedupe keys, first/last seen, count, confidence, benign explanation, and evidence references. Add MTTA/MTTR and alarm-fatigue indicators. | Repeating alarms group instead of duplicating; incident timeline links to the relevant UE/trace/evidence; clear/escalate update the incident consistently; exports include the incident ID |
| O3 | Scenario library | Add deterministic scenarios: baseline, IMSI catcher, SMS blaster/phishing, downgrade/bidding-down, neighbor spoof, and a false-positive/benign-coverage case. Each has a seed, expected observations, and a debrief. | Same seed reproduces the same UEs/events; scenario card explains what to watch; reset returns to baseline; no live RF |
| O4 | Evidence package | Export `vcss.evidence.v1` JSON with app version, timestamp, synthetic marker, scenario seed, alarm/incident snapshot, UE snapshot, signaling trace, business assumptions, and a SHA-256 integrity hash via WebCrypto. Keep CSV and print. | JSON validates against a documented schema; hash verifies after re-import; CSV remains formula-safe; export contains no real data |
| O5 | Role workspaces | Add non-authenticated presets: Demo, RF, NOC, SOC, Executive. Reorder or collapse cards per role; persist under `vcss-role`; every view remains reachable. Add a Ctrl/Cmd+K command palette for tabs and actions. | Each role surfaces a coherent first screen; no content is permanently hidden; palette is keyboard operable, labelled, and does not trap focus |
| O6 | Guidance and charts | Turn Guidance into a progress-aware checklist that reflects the current scenario state. Add chart data-table toggle, keyboard sampling, baseline/incident comparison, and CSV export. Add “why this alert fired” and “what would clear it” cards. | Guidance marks completed steps correctly; chart is fully readable without hover; alert explanation cites provenance; no new network requests |
| O7 | Visual polish | Add a comfortable/compact density toggle; reduce decorative card noise; improve type hierarchy and table scanability; add sticky table headers where useful; audit empty/error states. | No overflow at the eight widths; density persists; Lighthouse a11y 1.0 remains; visual review sign-off |

### v2.0 — 5G Extension

**Goal:** extend the defensive story to 5G without pretending 5G eliminates false base stations.  
**Effort:** 38–55 dev days over 8–11 weeks.  
**Dependency:** v1.2 incident/evidence model.

| ID | Workstream | Concrete work | Acceptance |
|---|---|---|---|
| G1 | 5G NSA | LTE anchor + NR secondary node: gNB, SgNB addition, RRC reconfiguration, dual-connectivity KPIs, and a fake-gNB scenario. Reuse the existing signaling ladder and incident model. | Procedure is technically coherent and labelled synthetic; existing 4G flows unchanged; a reviewer with RAN knowledge signs off |
| G2 | 5G SA | gNB, AMF/SMF/UPF, SUCI/SUPI, 5G-GUTI, AKA, N2/N3, and registration/service flows. Show where SUCI protects the subscription identifier and where the cell is still not authenticated. | The UI explicitly states SUCI is not cell authentication; trace fields are consistent; no real key material or subscriber data |
| G3 | 5G FBS evidence | Add measurement-report/timing-advance correlation, cell-configuration consistency, identity-request anomalies, and optional signed-SIB context. Include a benign-explanation path. | Evidence cites the observations and uncertainty; detection confidence is explainable; scenario debrief covers limitations |
| G4 | Scenario expansion | SMS blaster/phishing, downgrade/bidding-down, roaming/interconnect anomalies, and a 5G identity-exposure comparison. Map each to GSMA/NIST control language. | Each scenario has a clear defensive objective, evidence, and debrief; no offensive instructions or live-RF content |

### v2.1 — Optional Field Kit

Only if the demo needs to run without a local server or be shared as a self-contained package.

| ID | Workstream | Concrete work | Acceptance |
|---|---|---|---|
| P1 | PWA/offline | Versioned service worker, cache-first app shell, offline indicator, update prompt, manifest/icons. | App works offline after first load; update path is explicit; no stale-cache trap; can be disabled |
| P2 | View Transitions | Progressive tab transitions behind `document.startViewTransition`; reduced-motion fallback. | No navigation depends on the API; reduced-motion users see no transition; older browsers unchanged |
| P3 | Report polish | Print/PDF evidence pack, executive one-pager, scenario comparison. | Print layout is legible in both themes; no interactive controls in print; export remains local |

---

## 6. Prioritized backlog

Scoring: **Impact** = demo credibility, operator learning, or risk reduction. **Effort** = dev days, including tests. **Risk** = chance of regression or scope creep.

| Priority | Item | Impact | Effort | Risk | Release |
|---|---|---:|---:|---:|---|
| P0 | Brotli/gzip + ETag/security-header server | High | 1–2 | Low | v1.1 |
| P0 | Render invalidation; stop eager hidden-view render | High | 3–5 | Medium | v1.1 |
| P0 | Fix forced reflow in tab activation | Medium | 0.5–1 | Low | v1.1 |
| P0 | Target-size and input ergonomics | High | 2–3 | Low | v1.1 |
| P0 | CSP, external theme bootstrap, CSV/import hardening | High | 2–3 | Medium | v1.1 |
| P0 | Budgets, versioning, repeatable audit scripts | High | 2–3 | Low | v1.1 |
| P1 | Forced-colors / contrast / system theme | Medium | 2–3 | Low | v1.1 |
| P1 | Table semantics + live-region audit | Medium | 1–2 | Low | v1.1 |
| P1 | URL/session state and deep links | High | 4–6 | Medium | v1.2 |
| P1 | Incident model with dedupe/provenance | High | 5–8 | Medium | v1.2 |
| P1 | Scenario library + deterministic seeds | High | 5–8 | Medium | v1.2 |
| P1 | Hashed JSON evidence package | High | 3–4 | Medium | v1.2 |
| P1 | Role presets + command palette | Medium | 4–6 | Medium | v1.2 |
| P1 | Chart data table/keyboard + alert explanations | Medium | 3–4 | Low | v1.2 |
| P2 | Density toggle + visual hierarchy pass | Medium | 3–5 | Medium | v1.2 |
| P2 | 5G NSA | High | 10–15 | High | v2.0 |
| P2 | 5G SA + SUCI caveats | High | 15–20 | High | v2.0 |
| P2 | 5G false-BTS evidence + reviewer sign-off | High | 8–12 | High | v2.0 |
| P2 | SMS blaster/downgrade scenarios | Medium | 5–8 | Medium | v2.0 |
| P3 | PWA/offline | Low–Medium | 5–8 | Medium | v2.1 |
| P3 | View Transitions | Low | 1–2 | Low | v2.1 |

---

## 7. Release gates and budgets

### Performance budgets (v1.1)

Measured on the recommended compressed server, Lighthouse mobile emulation, p75 where applicable:

| Metric | Budget | Current |
|---|---:|---:|
| Initial transfer, compressed | **≤100 KB** | 419 KB uncompressed; 76 KB brotli if served correctly |
| HTML | ≤65 KB raw | 61.8 KB |
| CSS on first view | ≤80 KB raw | 153 KB |
| JS on first view | ≤120 KB raw | 213 KB |
| FCP | ≤2.0 s | 3.0–3.5 s |
| LCP | ≤2.5 s | 3.3–3.6 s |
| TBT | ≤200 ms | 50–240 ms |
| CLS | ≤0.05 | 0 |
| Warm tab switch, click→two rAF, 4× CPU | ≤200 ms p75 | up to 1.85 s (NOC) |
| First activation of a view, 4× CPU | ≤750 ms (stretch: 500 ms) | up to 1.85 s (NOC) |
| 3D frame rate at 1440×900 | ≥55 fps | 60.1 fps |
| Long tasks during a warm tab switch | 0 over 50 ms | To be measured per view |

These are release gates for v1.1. If CSS/JS splitting is still needed after compression and render invalidation, do it in v1.2 with a measured before/after; do not split pre-emptively and introduce a flash of unstyled content.

**v1.1.0 release record:** shipped 6 November 2026. All functional, accessibility, target-size, security, compressed-transfer, and 3D FPS gates passed. The warm tab-switch p75, Guidance first activation, and Lighthouse TBT gates are an explicit exception assigned to v1.2; measurements are in [PERFORMANCE.md](PERFORMANCE.md).

**v1.1.1 release record:** shipped 10 November 2026. Adds the command palette and shortcut sheet (UX Package A) with unchanged functional, accessibility, target-size, security, compressed-transfer, and 3D FPS gates. The v1.1.0 performance exception is carried forward unchanged; the palette adds a 34-check browser audit.

**v1.1.2 release record:** fixes directory requests in the local server, reports measured containment drill duration, and makes expected annual incident frequency explicit in business-case ROI. Performance figures were not re-measured.

**v1.1.3 release record:** adds cardinal camera headings, one local camera bookmark, fullscreen viewport mode, and PNG snapshots with scene metadata. The performance figures remain the v1.1.1 measurements and have not been re-measured for these patches.

**v1.2.0 NOC/SOC release record:** adds an incident cockpit with Detect / Verify / Contain / Recover / Report progress, a bounded event timeline, signal-by-signal SOC context, and local preview/copy/download of a versioned synthetic JSON evidence package. The export labels the rule score as synthetic rather than a probability, records alarm ownership and state transitions, and includes a SHA-256 digest when browser Web Crypto is available. No external network or operational integration is added. Shareable state, scenario library, roles, alarm deduplication, and performance remediation remain unimplemented; performance was not re-measured for this patch.

**v1.3.0 resolution-readiness release record:** shipped 10 November 2026. The first full re-measurement since v1.1.1 ([PERFORMANCE.md](PERFORMANCE.md)). UI work: micro type scale lifted to an 8–13.5 px ladder, `pointer-events: none` on the toast layer (fixes toasts intercepting clicks on bottom-right controls, root cause of the six light-suite failures), `color-scheme` hints, safe-area insets, `dvh` sizing with `vh` fallbacks, a 1,720 px ultrawide shell cap, short-landscape viewport rules, balanced headings, and `flex: none` on icon buttons so modal close controls keep their 24 px+ target. Audit work: palette-audit version check now reads `budgets.json`; browser-audit matrix extended to 320–2560 px plus short-landscape viewports, palette fit at 320×640 / 820×430, and modal target sweeps at 320/768; `styles.css` ceiling raised 165,000 → 170,000 B and total 493,000 → 498,000 B. Verification: 33/33 + 33/33 + 29/29 + 34/34 suites, clean extended browser audit, 0 under-24 px targets, 60.2 fps 3D, and Lighthouse gates passing on all three audited tabs for the first time (TBT 113/200/151 ms). Warm tab-switch and Guidance first-activation interaction-probe budgets remain open from v1.1.1.

**v1.4.0 operator-workflow release record:** shipped 11 November 2026 (Phase 2 of [FULL-UPGRADE-PLAN.md](FULL-UPGRADE-PLAN.md)). Incident cockpit records per-step completion (`incident.steps` with key/label/status/timestamp/operator), detection and containment timestamps with an MTTR window line, and a response-progress percent tag with a meter. Rogue scenario alarms carry a stable `dedupKey` with `occurrences` and `mergedFrom`, so a repeat deploy after containment reopens the same four alarms with ×N counters instead of duplicating rows; the detail panel, alarm table, evidence JSON and alarm CSV all surface occurrence counts. The shift card gains a versioned shift-log CSV export (`vcss-4g-shift-log-YYYYMMDD-HHMMZ.csv`, ops log + response-step rows, `Synthetic` marker on every row, measured under 5 KB). The Fake BTS page gains a scenario library (baseline / incident in progress / contained aftermath) with atomic reset + labeled fast-replay containment, mirrored by three palette commands; scenario state exports and imports as `vcss-scenario-state/1.0` JSON with schema+version validation and malformed-input rejection; the evidence package gains a persistent operator note joined into the SHA-256 payload. Audit hygiene: the three temporary suites folded into `tests/` (functional light/dark via `THEME` env, guidance, target) and a new `tests/phase2-audit.js` (27 checks) gates the operator-workflow acceptance criteria. Ceilings: `app.js` 260,000 → 270,000 B, `styles.css` 170,000 → 172,000 B, total 498,000 → 510,000 B; compressed gates unchanged. Verification: 33/33 light + 33/33 dark functional, 27/27 Phase 2, 29/29 guidance, 34/34 palette, clean browser audit, 0 under-24 px targets, budget gates green, **60.3 fps 3D** release run, Lighthouse a11y 1.0 / CLS 0.000 everywhere with TBT passing on Overview (104–177 ms) and Guidance (132–137 ms) while NOC (219–350 ms) stays inside the documented v1.2 TBT exception — a same-day untouched v1.3.0 control build measured NOC TBT 384 ms and 33.9 fps under the same machine load, ruling out a Phase 2 regression. Release-infra hardening: `serve.js` no longer crashes when audit clients abort page loads mid-response, and the Lighthouse audit retries the transient `NO_NAVSTART` flake up to four times. Warm tab-switch and Guidance first-activation interaction-probe budgets remain open from v1.1.1.

### Accessibility gates

- Lighthouse accessibility **1.0** on all eight tabs in both themes.
- axe: **zero critical or serious** issues.
- **Zero visible targets below 24×24 CSS px**; primary mobile actions ≥44×44.
- Keyboard-only traversal of all tabs, dialogs, drawer, NOC actions, filters, 3D camera/layers, and Guidance links.
- Focus is never obscured by the sticky header at 200% zoom; check `scroll-padding-top` and focus order.
- Forced-colors mode: no invisible focus, no information conveyed only by color.
- Text spacing and 200% zoom: no clipping or horizontal overflow.
- Reduced motion: no decorative animation; state changes still legible.
- Screen-reader smoke test for NOC queue/detail, UE drawer, and 3D summary.

### Functional gates

- Existing 33-check light suite, 33-check dark suite, and 29-check Guidance suite pass.
- Zero console errors across all eight views.
- Zero horizontal overflow at 320, 390, 768, 1000, 1100, 1200, 1366, 1440 px.
- No network requests after the initial document/assets; no third-party origins.
- Theme persistence, system preference, stored precedence, and theme-aware canvas repaint still pass.
- All existing IDs, `data-*` actions, hash routes, and defensive-only copy remain intact unless a change is explicitly approved.

---

## 8. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Render caching shows stale NOC/UE/business data | Medium | Central invalidation map; mark dirty on every mutation; tests for deploy/contain/ack/clear/reset; add a debug “render version” badge in development |
| CSS/JS splitting causes a flash or breaks deep links | Medium | Compress and cache first; split only with measured need; load the target view’s CSS before first paint; visual snapshots at eight widths |
| CSP breaks inline SVG styles or the theme bootstrap | Medium | Move bootstrap to `theme-init.js`; start with Report-Only; generate hashes/nonces if inline styles remain; test both themes and 3D |
| Security headers only work in `serve.js`, not `python -m http.server` | High | Document the difference; put what can work in meta tags; keep `serve.js` zero-dependency and recommended; never claim headers exist when they don’t |
| 5G scope grows into a protocol simulator | High | Separate v2.0; define “teaching fidelity, not conformance” in the acceptance criteria; require domain review; ship NSA before SA |
| New UI regresses accessibility | Medium | Treat Lighthouse/axe/target/keyboard as release gates; add visual and screen-reader checks to the test script |
| Evidence export creates a privacy or trust issue | Low | Synthetic-only marker, schema version, no real identifiers, local-only; hash for integrity, not authenticity; document the difference |
| `localStorage`/`sessionStorage` quota or privacy concerns | Low | Store only preferences, scenario seed, and view state; cap size; never store subscriber data; provide “clear local state” |
| 3D performance on low-end devices | Medium | Cap devicePixelRatio at 2; pause when hidden; add a quality setting (DPR, effects); keep reduced-motion static fallback |
| Test suite drift after refactor | Medium | Keep IDs/actions/hash routes; add contract tests for the public selectors; run both themes and all widths |

---

## 9. Non-goals

- No live RF, SDR, EPC, HSS, AMF/SMF/UPF, or real subscriber data.
- No IMSI-catching, interception, jamming, SMS-blaster operation, or other offensive capability.
- No attempt to make the simulator a validated 3GPP conformance tool or a production NOC.
- No cloud backend, accounts, authentication, multi-user sync, or telemetry.
- No runtime framework, CDN asset, build step, or external dependency.
- No redesign that discards the eight-tab model or the existing demo flow.
- No PWA/service worker unless the offline requirement is explicitly approved.
- No “5G badge” that hides the limitations of SUCI and cell authentication.

---

## 10. Measurement plan and governance

1. **Freeze the baseline.** Keep the current Lighthouse JSON, target audit, and 33+29 results as the before/after reference.
2. **Add budgets to the repo.** `PERFORMANCE.md` or `budgets.json` records transfer, FCP/LCP/TBT/CLS, DOM, tab-switch latency, and target-size limits.
3. **Use dev-only verification.** Lighthouse, Puppeteer/Edge, axe, and the overflow/keyboard scripts are development tools, not shipped dependencies. The app itself remains dependency-free.
4. **Run the full gate for every release.** Lighthouse 8 tabs × 2 themes; target-size audit at 320/390/768/1440; keyboard path; forced-colors; 200% zoom; reduced motion; no-network check.
5. **Record deltas.** Every release note includes before/after numbers for the top five metrics. If a budget regresses, the release does not ship without an explicit exception.
6. **Review the content with a telecom-security reviewer.** Especially the 5G evidence, SUCI explanation, and any new scenario claims.

---

## 11. Decisions requested

1. **Approve v1.1 Foundation** (14–22 dev days) as the next release, with the budgets in §7 as the definition of done.
2. **Confirm the 5G path:** NSA first, SA second, or defer 5G entirely until v1.2 is complete.
3. **Confirm PWA is optional** and not part of the default upgrade.
4. **Confirm role workspaces are demo presets**, not authentication or access control.
5. **Confirm the evidence export format:** versioned JSON + SHA-256 integrity hash, alongside the existing CSV/print paths.
6. **Choose the next visual priority:** incident-centric NOC/SOC depth, or a broader visual hierarchy/density pass. The plan recommends incident depth first because it improves the demo story more than cosmetic polish.

---

## 12. References

[1]: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ "What’s New in WCAG 2.2 — W3C WAI"
[2]: https://web.dev/articles/inp "What is INP? — web.dev"
[3]: https://alertops.com/noc-dashboard-examples "NOC dashboard examples — AlertOps"
[4]: https://designsignal.ai/articles/data-visualization-dashboard "Data visualization dashboard design 2026 — Design Signal"
[5]: https://www.ndss-symposium.org/ndss-paper/detecting-imsi-catchers-by-characterizing-identity-exposing-messages-in-cellular-traffic/ "Detecting IMSI-Catchers by Characterizing Identity Exposing Messages in Cellular Traffic — NDSS 2025"
[6]: https://www.usenix.org/conference/usenixsecurity25/presentation/mubasshir "Gotta Detect ’Em All: Fake Base Station and Multi-Step Attack Detection in Cellular Networks — USENIX Security 2025"
[7]: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.36G.ipd.pdf "False Base Station: Applying 5G Cybersecurity and Privacy Capabilities — NIST CSWP 36"
[8]: https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3539 "3GPP TR 33.809: Study on 5G security enhancements against False Base Stations"
[9]: https://www.gsma.com/security/resources/fs-31-gsma-baseline-security-controls "GSMA FS.31 Baseline Security Controls v7.0"
[10]: https://www.gsma.com/solutions-and-impact/technologies/security/gsma_resources/5g-security-guide-version-3-0 "GSMA FS.40 5G Security Guide v3.0"
[11]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard 5.0"
[12]: https://www.w3.org/TR/trusted-types/ "Trusted Types — W3C"
[13]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation "Offline and background operation — MDN"
[14]: https://caniuse.com/view-transitions "View Transitions API (single-document) — Can I use"
[15]: https://www.gsma.com/solutions-and-impact/technologies/security/cybersecurity-knowledge-base/cybersecurity-document-library "GSMA cybersecurity document library (including FS.67 SMS Blasters briefing)"
