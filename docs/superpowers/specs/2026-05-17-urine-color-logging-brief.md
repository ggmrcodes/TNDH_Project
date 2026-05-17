# Urine Color Logging (Hematuria Tracking) — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"urine color option"*
- **Type:** Feature (replaces existing field)
- **Owner:** @ggmrcodes
- **Status:** Ready to dispatch

## Problem

The current symptom catalog has `dark_urine` as a binary symptom with a 1-10 severity slider. Transfusion-safety clinical relevance demands more nuance: pink/red/brown urine signals hematuria or post-transfusion hemolysis (acute red-flag), while yellow/dark-yellow is just hydration. A binary "dark or not" loses this entire dimension. Replace with a color picker that drives clinically meaningful escalation.

## Decisions already made (do not re-ask)

- **Replace `dark_urine` with a new `urine_color` field.** Retire `dark_urine` from `SYMPTOM_CATALOG` for *new* entries. Historical logs with `dark_urine` stay untouched — display them as "dark urine (legacy)" in history views.
- **Custom clinically-relevant scale** (not the 8-step hydration chart):
  - `clear` — no color
  - `yellow` — pale to normal
  - `dark_yellow` — concentrated (dehydration hint)
  - `pink` — early hematuria
  - `red` — overt hematuria
  - `brown_tea` — old blood
  - `cola` — myoglobinuria-like / severe
- **Severity flagging:** `pink | red | brown_tea | cola` → red `Outcome`. Extend `evaluateSymptoms()` in `src/utils/clinicalThresholds.ts` to read the new field; surface in clinician dashboard like other red outcomes.
- **No photo upload in v1.** Color picker only. Photo + AI extraction is v2.

## Files to touch

- `src/utils/clinicalThresholds.ts`:
  - Remove `dark_urine` from `SYMPTOM_CATALOG` (or mark deprecated — see migration note below).
  - Define a new `URINE_COLOR_OPTIONS` constant with the 7-color scale + i18n labelKey + display swatch hex (not arbitrary CSS — research real urine colors).
  - Extend `evaluateSymptoms()` signature to accept `urineColor: UrineColor | null` and flag the four hematuria colors as red Outcome.
- `src/types/database.ts` — add `urine_color: 'clear' | 'yellow' | 'dark_yellow' | 'pink' | 'red' | 'brown_tea' | 'cola' | null` to the symptom log type.
- `src/screens/tabs/SymptomMonitorScreen.tsx` — add the color picker UI (horizontal row of swatches with selected state). Wire to log payload.
- `src/i18n/` — add `symptom.urineColor.*` keys (EN + TH) for each color name + label "Urine color".
- `supabase/migrations/` — add `urine_color text` column to the relevant symptom log table.
- All call sites of `evaluateSymptoms` — update to pass `urineColor`.

## Acceptance criteria

- [ ] New symptom log entries surface a urine-color picker; selecting `pink | red | brown_tea | cola` produces a red Outcome chip and an "urgent" message.
- [ ] Clinician dashboard surfaces patients with recent hematuria colors at the top, same prominence as existing red-outcome patients.
- [ ] Color swatches use clinically-accurate hex values (research, don't guess — real medical urine color charts exist).
- [ ] Picker is accessible: color name shown next to swatch (color-blind safe); swatches have an `accessibilityLabel`.
- [ ] TH labels reviewed for each color name.
- [ ] Historical symptom logs that recorded `dark_urine` still display correctly in history views (don't 404).
- [ ] `evaluateSymptoms` unit tests cover each urine color → expected outcome mapping.

## Open questions / blocked on

- **Hex values for swatches:** suggest the implementer source from a public medical urine color chart (e.g., the CDC or a peer-reviewed clinical reference); do not invent.
- **Should `urine_color` be required on every symptom log, or optional?** Recommend optional — patients won't always have urinated recently when logging other symptoms.
- **Migration:** confirm with @ggmrcodes whether to wipe `dark_urine` from the live SYMPTOM_CATALOG immediately or keep displaying it for in-flight pilot data. Pilot has limited data → safer to retire now and accept the legacy label in history.

## Out of scope

- Photo upload + AI extraction (defer to v2).
- Linking urine color to specific bleeding-event records.
- Urine volume / frequency tracking.
- Notifying the clinician via push when a red urine color is logged — that's a separate "real-time clinical alerts" feature.
