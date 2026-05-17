# Lab Trends Graph (Hb / Hct / Ferritin) — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"graph"* (interpreted as lab values trend)
- **Type:** Feature (visualization layer)
- **Owner:** @ggmrcodes
- **Status:** **BLOCKED on `2026-05-17-pre-transfusion-labs-brief.md`** — no lab data exists until that ships

## Problem

A pilot tester asked for "a graph." Q+A confirmed: lab values trends (Hb, Hct, Ferritin), audience is both patient and clinician (different views), with transfusions marked on the same timeline so dips and recoveries make narrative sense.

Nothing to plot exists today — the pre-transfusion-labs spec is a hard prerequisite. Once that ships, this brief picks up.

## Decisions already made (do not re-ask)

- **Data source:** `transfusion.pre_labs` (Hb / Hct / Ferritin) introduced by the pre-transfusion-labs brief. Don't invent additional fields.
- **Two views:**
  - **Patient (simple):** one compact sparkline per lab value (Hb, Hct, Ferritin) inside the existing patient passport / history surface. Last value labeled. Tap-to-expand.
  - **Clinician (full):** interactive chart with toggleable lab series + transfusion-event overlays. Lives in the clinician dashboard patient drill-down.
- **Default time window:** last 6 months. Toggle: 1mo / 3mo / 6mo / 1y / all. Persist last-used window per user.
- **Event overlays:** transfusion dates as vertical-line markers (or dot on the x-axis). Bleeding-event / red-symptom overlays = v2.
- **Interactive:** tap a point to see exact value + timestamp; pinch to zoom NOT required in v1 (window toggles cover that).

## Files to touch

### New files
- `src/components/charts/LabSparkline.tsx` — small inline sparkline component (one series, no axes, last-value label). Used in patient view.
- `src/components/charts/LabTrendsChart.tsx` — full chart component for clinician view: multi-series toggle, axes, event markers, tap-for-value tooltip, time-window selector.
- `src/utils/labTrendsData.ts` — pure function `buildLabTrendsSeries(transfusions, window)` → `{ hb: Point[], hct: Point[], ferritin: Point[], transfusionMarkers: Date[] }`. Unit-testable. No React.

### Modified files
- `src/screens/tabs/PassportScreen.tsx` (or wherever the patient history surface lives) — slot in three `LabSparkline`s.
- `src/screens/clinician/ClinicianDashboardScreen.tsx` (patient drill-down) — slot in `LabTrendsChart`.
- `package.json` — add a charting library (see "Open questions" below for recommendations).
- `src/i18n/` — labels for chart axes, time-window toggle, empty state ("No lab data yet — add pre-transfusion labs to start tracking").

## Acceptance criteria

- [ ] Patient passport shows three sparklines (Hb, Hct, Ferritin) with last value labeled.
- [ ] Sparklines have an empty state when fewer than 2 data points exist ("Add 2+ lab entries to see the trend").
- [ ] Clinician chart shows all three series toggleable, with transfusion-date vertical markers on the x-axis.
- [ ] Default window is 6 months; toggle switches to 1mo / 3mo / 1y / all and persists.
- [ ] Tapping a point shows the exact value + ISO date in a tooltip.
- [ ] Chart updates reactively if the underlying transfusion data changes (e.g., clinician verifies a value).
- [ ] No data → no broken chart. Empty state in both views.
- [ ] Reference-range bands NOT shown in v1 (keep simple; tied to the deferred threshold-flagging decision in the labs brief).
- [ ] Unit tests for `buildLabTrendsSeries`: window filtering, missing values, ordering, transfusion-marker extraction.
- [ ] TH translations reviewed.

## Open questions / blocked on

- **Charting library choice** — implementer should evaluate `victory-native` (v6+ uses Skia, good performance), `react-native-chart-kit` (simpler, less interactive), or rolling a custom SVG chart (smallest bundle but most code). Recommend `victory-native` for the clinician chart, custom SVG for the sparklines (tiny, no dep needed).
- **Performance:** if a patient has 500+ transfusions, naive rendering will lag. Implementer should down-sample to ~200 points max for the chart view.
- **Mixed-unit edge case:** can a patient have lab values logged with different units historically? Per the labs brief — no, units are fixed. If this assumption changes, this brief needs revisiting.

## Out of scope

- Bleeding event / symptom overlays (v2).
- Reference range shaded bands.
- Export chart as image / PDF.
- Annotations (clinician notes attached to a point).
- Comparison view across patients (clinician-side).
- Predictions / forecasting.
