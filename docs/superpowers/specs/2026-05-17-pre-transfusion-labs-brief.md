# Pre-Transfusion Blood + Iron Labs — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"ค่าเลือด ค่าเหล็ก before blood transfusion"*
- **Type:** Feature (new data model)
- **Owner:** @ggmrcodes
- **Status:** Ready to dispatch — **prerequisite for lab-trends graph brief**

## Problem

The app records transfusions but captures no lab values. Clinicians (and the patient's own clinical narrative) need pre-transfusion Hb, Hct, and ferritin attached to each transfusion event to explain *why* a transfusion was needed and to track recovery over time. Right now there's no field anywhere in the schema for any numeric lab value.

## Decisions already made (do not re-ask)

- **v1 fields:** Hemoglobin (Hb), Hematocrit (Hct), Ferritin. No other iron panel members in v1.
- **Default units:** Hb `g/dL`, Hct `%`, Ferritin `ng/mL` (Thai lab convention). Store with units fixed; do not let the user pick.
- **Data shape:** labs are a sub-object of a transfusion record (`transfusion.pre_labs`), not a standalone entity. New transfusions get an optional `pre_labs` JSON column or a 1:1 child table — implementer's call based on existing transfusion table shape.
- **Optional but encouraged.** User can save a transfusion without labs. Show a non-blocking "add pre-transfusion labs" nudge on the transfusion detail screen if missing.
- **Both roles enter; clinician verifies.** Patient can self-report; clinician can edit. When clinician edits a patient-entered value, the previous value is preserved in an audit log; the displayed value is the latest with a "verified by Dr. X" badge.
- **No threshold flagging in v1.** Display raw numbers only. (Decision parallels the "who set the threshold" liability concern — defer flags to a future spec.)
- **Manual numeric input + optional photo of lab slip.** No AI/OCR extraction in v1 — the existing AI-extraction feature flag stays off for this surface.

## Files to touch

### New files
- `supabase/migrations/2026-05-17-pre-transfusion-labs.sql`:
  - Add `pre_labs jsonb` column to the existing transfusion table (or a new `transfusion_lab_results` 1:1 table — pick based on existing schema patterns in `supabase/schema.sql`).
  - Schema for `pre_labs`: `{ hb: number | null, hct: number | null, ferritin: number | null, recorded_at: timestamptz, recorded_by_user_id: uuid, verified_by_clinician_id: uuid | null, lab_slip_photo_url: string | null }`.
  - New `transfusion_lab_audit_log` table: `id`, `transfusion_id`, `previous_value (jsonb)`, `new_value (jsonb)`, `changed_by_user_id`, `changed_at`.
  - Supabase Storage bucket `transfusion-lab-slips/` (private; RLS so only patient + their clinicians can read).
- `src/components/transfusion/PreTransfusionLabsForm.tsx` — three numeric inputs with unit suffix and validation (Hb 0.1–25, Hct 1–75, Ferritin 0–10000), optional photo attach button using `expo-image-picker`.
- `src/components/transfusion/PreTransfusionLabsDisplay.tsx` — read-only view with values + "verified" badge if applicable.

### Modified files
- `src/types/database.ts` — add `PreTransfusionLabs` interface; extend `Transfusion` type with `pre_labs: PreTransfusionLabs | null`.
- `src/screens/tabs/TransfusionHistoryScreen.tsx` — show "Pre-labs: Hb X / Hct Y / Ferritin Z" line per row when present; "Add pre-labs" CTA when absent.
- `src/screens/detail/TransfusionDetailScreen.tsx` (or wherever a transfusion is opened/edited) — embed `PreTransfusionLabsForm` in edit mode, `PreTransfusionLabsDisplay` in view mode.
- `src/screens/clinician/ClinicianDashboardScreen.tsx` — patient detail drill-down shows pre-labs; clinician can tap a value to edit (overwrite + verify).
- `src/mock/services.ts` — add mock CRUD for `pre_labs` so demo flow has realistic data.
- `src/i18n/` — labels: "Pre-transfusion labs", "Hemoglobin (g/dL)", "Hematocrit (%)", "Ferritin (ng/mL)", "Verified by", "Add labs" (EN + TH).

## Acceptance criteria

- [ ] Patient can open a transfusion and add Hb / Hct / Ferritin numbers; values persist to Supabase.
- [ ] Patient can attach a photo of the lab slip; photo uploads to private Storage and renders in the lab display.
- [ ] Clinician can edit any patient-entered value from the dashboard; UI shows "verified by Dr. X" badge after edit.
- [ ] When a clinician edits, the previous value writes to `transfusion_lab_audit_log`.
- [ ] Out-of-range numbers (Hb > 25, Hct > 75, Ferritin < 0) reject with a clear validation message before save.
- [ ] Transfusion can still be created and saved with no pre-labs (optional).
- [ ] RLS: a patient sees only their own pre-labs and audit log; a clinician sees pre-labs and audit log for patients assigned to them; nothing leaks across patients.
- [ ] Mock mode demo flow shows realistic pre-labs data.
- [ ] TH translations reviewed.

## Open questions / blocked on

- **Audit log retention:** keep forever or trim after N years? Recommend forever for v1 (medical records).
- **Photo size/quality:** suggest compressing to ≤1200px wide, ≤80% quality before upload via `expo-image-manipulator` (already installed). Confirm acceptable.
- **Future integration hook:** project memory notes future Health Link / HOSxP / FHIR integration. Design the `pre_labs` shape so it can accept an upstream-populated payload later (`source: 'manual' | 'health_link' | 'hosxp'` field is cheap to add now).

## Out of scope

- Full iron panel (serum iron, TIBC, transferrin saturation).
- Threshold flagging / "low Hb" alerts (separate spec).
- AI/OCR extraction from the lab slip photo (existing feature flag stays off here).
- Health Link / HOSxP / FHIR integration (a stub `source` field is OK; actual integration is a separate project).
- Editing the photo after upload (re-upload only).
