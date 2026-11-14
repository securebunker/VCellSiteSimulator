# VCSS 4G — UI/UX enhancement research (post-v1.1)

Status: post-v1.1 proposal and release notes. v1.1.0 shipped on 6 November 2026 with a documented performance exception ([PERFORMANCE.md](PERFORMANCE.md)); Package A (command palette and shortcut sheet) shipped in v1.1.1; cardinal 3D headings, local camera save/restore, fullscreen, and PNG snapshot export shipped in v1.1.3. Package B was partially delivered in v1.2.0 with incident response steps, a recent event timeline, explained synthetic SOC signals, and JSON evidence preview/copy/download. v1.3.0 shipped the resolution-readiness pass from the full-upgrade plan: readable type scale, toast click-through fix, `color-scheme`, safe-area/dvh viewport support, ultrawide shell, short-landscape rules, and a wider audit matrix ([FULL-UPGRADE-PLAN.md](FULL-UPGRADE-PLAN.md)). v1.4.0 shipped the operator-workflow phase: response-step completion states with timestamps, alarm occurrence dedup (×N), shift-log CSV export, a local scenario library (baseline / incident / contained aftermath with fast replay), validated scenario-state share/import, and operator evidence notes inside the SHA-256 evidence payload. v1.5.0 shipped the content-depth phase: per-alarm runbooks with expected outcomes (3–5 steps, cross-linked from the NOC detail, palette search and the 3D rogue inspector), per-signal why-lines in the SOC signal basis, three guidance learning tracks with estimated times, a 22-term LTE glossary, synthetic UE personas in the subscriber drawer, and a business-case reading guide with per-assumption hints. v1.5.1 shipped a 3D life pack: teal traffic packets flow macro → UE on connected serving links, rose packets flow UE → the fake BTS on camped links (the synthetic identity-exposure read), connected links gain dash flow, a dashed rose interference arc pulses between the fake BTS and the macro while broadcasting, the selected tower's ground ring rotates, idle/detached UE glows breathe, sector beams shimmer, and the first 3D activation runs a one-time arrival tween into the Iso view (~2.5 KB, no ceiling raise; every animation keys off the shared clock so reduced motion freezes the scene exactly as before, and 3D FPS measured unchanged at 60.3). v1.6.0 shipped the arrival-gate and fluid-shell pass: an animated full-screen landing gate on hashless loads (drifting aurora, radar pings, floating telemetry chips, glowing "Let's Simulate Telco Network" CTA with sheen, burst-and-settle entry; skip and Escape do the same), an accessible dialog pattern (focus on the CTA, Tab trapped, app behind set inert, deep links skip entirely, reduced motion fully static), a shell width that stretches to 2320 px on wide screens instead of clamping at 1720 px, and pointer-fine card hover lift with focus-within glow. v1.7.0 shipped the entry-gate motion pack (drifting particles, a rotating radar scan wedge behind the tower mark, a breathing stage, an animated title gradient pan, and a soft teal entry flash — all frozen under reduced motion) plus a both-themes color-scheme refresh (deeper blue-black surfaces, cooler hairlines, brighter muted text, indigo-tinged aurora washes; semantic accent hues and text roles unchanged so contrast holds). v1.8.0 made the layout full-bleed at every resolution (no shell width clamps; bars edge-to-edge with a slim shared gutter) and added gate movement: orbiting satellites, occasional sky streaks, and cursor parallax on the headline/stage with counter-shifting aurora — all frozen under reduced motion. Remaining ideas below are proposals. No runtime dependency, framework, CDN asset, or network call is introduced by anything in this document. The eight-tab defensive demo remains the product.

## Reference review

| Reference | Useful pattern | What VCSS 4G should borrow | What not to copy |
| --- | --- | --- | --- |
| [AI Elements](https://elements.ai-sdk.dev/) | Task lists, tool-use rows, artifacts, canvases, viewport controls/toolbars | Response checklist with pending/running/done states; artifact-style handoff preview; viewport toolbar and orientation controls | React/shadcn dependency, streaming chat surface, model pickers |
| [assistant-ui](https://www.assistant-ui.com/) | Suggestions, slash commands, tool UI, checkpoints, human approval | Command palette, guided “starter” actions, containment approval card, scenario checkpoints | Chat-first layout, thread history, cloud persistence |
| [AI UX Playground](https://aiuxplayground.com/patterns) | Command bar, progressive disclosure, tool use, human-in-the-loop, checkpoints, running meters, skeleton screens | Ctrl/⌘+K palette, advanced controls behind disclosure, evidence trail, restore points, live scenario meters | Hiding safety-critical facts, fake AI/“searching” states |
| [UX Pilot](https://uxpilot.ai/) | Variation grids, design-system consistency, flow generation | Side-by-side business “what-if” comparison; keep tokens/components consistent across tabs | AI-generated UI, Figma/code export workflows |
| [Modly3D](https://modly3d.app/) | Local-first 3D workspace, model picker, orbit viewport, collections, export formats | Local-only privacy language; viewport presets and export (PNG snapshot); quality selector; scene workspace feel | AI mesh generation, GPU inference, file uploads |

## Additional patterns worth adding

These are standard in 3D editors (Blender, Unity, Fortnite viewport toolbar, Three.js helpers, Spline) and pair well with the Modly-style viewport:

- Orientation gizmo with a camera-relative heading indicator.
- “Frame selected” and “focus selection” actions.
- Performance/quality switch (render scale, scanline/vignette/grid off).
- Touch gestures: one-finger orbit, pinch zoom, two-finger pan.
- Multiple named camera bookmarks (the current build stores one view locally).
- Deep links from scene selection to the UE record or NOC alarm.
- Shortcut overlay (`?`) and on-canvas hints that can be dismissed.

## Current-state audit

Already strong:

- Eight workspaces, hash routing, commandbar-style tab strip, skip link.
- 3D: orbit/zoom, cardinal headings, camera presets, reset, auto-orbit, local view save/restore, fullscreen, metadata PNG snapshots, layer toggles, inspector, telemetry, FPS, keyboard help, live summary.
- NOC: alarm queue/detail, runbook, evidence, SOC correlation, shift handoff, CSV.
- Guidance: quick path, workspace map, recommended flow, theme/motion, scope, glossary.
- Theme System choice, forced-colors/contrast/reduced-transparency CSS, table semantics, live announcements.

Gaps that matter most:

1. **Typography is extremely small.** CSS font sizes have a median of 8.5 px; 106 declarations are below 9 px (minimum 6 px). This is the largest readability and accessibility gap, especially in tables, NOC runbooks, and the 3D inspector.
2. **No global command surface.** Users must hunt through tabs and page actions. Ctrl/⌘+K with grouped Search / Go to / Actions is the highest-leverage navigation improvement.
3. **Response work is prose, not a trackable task list.** NOC runbooks are static steps; there is no visible progress model for Detect → Verify → Contain → Recover → Report.
4. **Exports are fire-and-forget.** “Shift handoff” and CSV actions produce no preview or artifact history. An artifact drawer with copy/download/print and a timestamp would be more trustworthy.
5. **No scenario checkpoints.** Reset restarts everything; there is no “Baseline / Post-deploy / Contained” restore point for training.
6. **3D still lacks a dedicated quality switch and complete touch navigation.** Fullscreen, snapshots, cardinal headings, and one saved camera view are now available; two-finger pan and multiple named bookmarks remain open.
7. **Density is fixed.** There is no Compact/Comfortable reading mode, despite the tiny type and long operator sessions.
8. **Cross-view context is weak.** Selecting a UE in 3D or an alarm in NOC does not offer “open related record” actions.

## Recommended packages

### Package A — Operator navigation (highest value, low risk) — **Implemented**

- **Command palette** (Ctrl/⌘+K) with grouped results:
  - Go to: all eight tabs.
  - Actions: deploy fake BTS, contain, reset, export alarms, export UEs, shift handoff, switch theme, camera presets.
  - Search: UE ID/IMSI/MSISDN/IMEI/device, alarm ID/title/source/detail/runbook, procedure name.
- Visible `⌘K` hint in the top bar; `?` opens a shortcut sheet.
- Fuzzy matching, arrow/Enter/Esc, focus return, `aria-activedescendant`.
- No AI claims; deterministic local actions only.
- Implemented lazily in the existing dialog root, reusing the focus trap, Escape handling, theme actions and hash routing. The dedicated palette audit passes **34/34** checks; the permanent browser audit includes palette and shortcut-sheet smoke checks.
- Raw size ceilings were raised modestly for the new code (`app.js` 225,000 → 234,000 B; total 460,000 → 465,000 B). Compressed-transfer, DOM, target-size, accessibility, security and 3D FPS gates are unchanged.

### Package B — Response cockpit (NOC)

- **Response checklist** (v1.2.0 delivers state labels for all five steps; progress count remains open), driven by existing scenario state:
  - Detect, Verify evidence, Contain, Recover, Report.
- The NOC view shows a bounded incident timeline and synthetic signal basis; step-linked trace/UE evidence is still open.
- **Containment approval card** before containment remains open: exact scope, affected UEs, what changes, what is reversible.
- **JSON evidence preview/export** (v1.2.0) includes app/schema versions, alarm state/ownership, incident signals, event history, and an optional SHA-256 digest. A common artifact drawer for handoff and CSV plus print remains open.
- **Live meters** during containment: elapsed time is recorded as MTTR; alarm/UE recovery and modeled loss-avoided meters remain open.

### Package C — Scenario checkpoints

- Named snapshots: Baseline, After deploy, After containment.
- “Restore to this checkpoint” with a confirmation that later simulation state will be replaced.
- Timeline strip showing the current checkpoint and elapsed scenario time.
- Reset remains the hard “start over” action.

### Package D — 3D viewport upgrade

- **Orientation compass** in a corner; click N/E/S/W/Top to move the camera.
- **Frame selected** in the inspector and double-click on a node.
- **Quality selector**: High / Balanced / Performance. Performance caps DPR, disables scanlines/vignette/soft shadows, reduces grid density.
- **Theater mode**: expands the canvas and collapses the side rail; Esc exits.
- **Snapshot PNG** with a small metadata footer (synthetic scene, timestamp, mode, app version).
- **Touch gestures** and visible gesture hints.
- **Saved views** (localStorage) and “copy scene link” using the existing hash route.
- **Related record actions**: “Open UE record”, “Open alarm”, “Trace UE” from the inspector.

### Package E — Typography and density

- Add a **Comfortable / Compact** reading preference in Guidance, persisted as `vcss-density`.
- Comfortable mode raises the smallest text to a 11–12 px floor, increases table row height, and loosens line height; Compact keeps the current instrument-panel density.
- Establish a type scale (11, 12, 13, 14, 16, 20, 24, 28) and stop using 6–8 px for body text. Keep 9–10 px only for decorative uppercase micro-labels.
- Use `font-variant-numeric: tabular-nums` for all KPI/table numerics (partially present).
- Increase muted-text contrast and test at 200% zoom.
- No external font: keep the Segoe UI Variable / system stack; this preserves zero-dependency delivery.

### Package F — Progressive disclosure and guidance

- Collapse advanced RF/business assumptions behind “Advanced assumptions” with a summary line.
- Add **starter cards** in Guidance for the three demo paths: Baseline review, Rogue-cell response, Business impact.
- Add a first-run three-step tour (dismissible, stored locally).
- Add no-results states with suggested filters for UE search and alarm filters.

## Suggested sequence

1. Package A (command palette) — **implemented**; biggest navigation win, isolated change.
2. Package E (typography/density) — highest accessibility win, needs a visual QA pass.
3. Package D (3D viewport) — highest perceived-quality win; keep performance mode first.
4. Package B (response cockpit) — deeper change, strong story value.
5. Package C (checkpoints) — requires state snapshot/restore design.
6. Package F (disclosure/guidance) — polish after the core flows settle.

## Guardrails

- No frameworks, CDN assets, build step, or runtime dependencies.
- No network calls; all preferences stay in localStorage.
- Keep all eight tabs, IDs, `data-*` hooks, hash routes, and existing test expectations.
- Run the 33+33+29 suites, the 34-check palette suite, budget audit, target-size audit, overflow matrix, keyboard path, forced-colors, 200% zoom, and 3D FPS after each package.
- Do not hide irreversible/defensive actions behind disclosure; approval cards must show scope and impact.
- Treat 3D as synthetic geometry only; no RF propagation or live-network implications.
