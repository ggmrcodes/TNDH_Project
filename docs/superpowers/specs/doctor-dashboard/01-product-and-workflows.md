# Doctor Dashboard — Product & UX Strand

**Strand:** Product & workflows. **Date:** 2026-05-13.
**Scope:** v1 doctor-facing surface that reads HaemoCare's existing patient data. No FHIR / hospital integrations, no writes back to patient records.

---

## 1. Who is the doctor?

Two personas cover ~95% of realistic users. Both are time-poor and chart-fatigued.

**P1 — Clinic-day hematologist (PRIMARY).** Thai government or large private hospital, runs a half-day thalassemia clinic 1–2× per week, 20–40 transfusion-dependent patients per block. **3–7 minutes per patient, mid-consult.** Has HOSxP / hospital EMR open in another window — HaemoCare is the *patient-reported* layer, not chart of record. Mental model: "anything I'd miss by looking only at the EMR?" Reads Thai natively, comfortable with English clinical terms. `profiles.full_name` may be Thai script — UI must not mangle it.

**P2 — Pediatric thalassemia nurse / case manager (SECONDARY).** Runs the pre-clinic morning huddle. Owns the "who do we call today" list. **Scans the whole panel in 5–10 min once a day**, then LINE/calls 3–5 patients. Heaviest user of the overdue list.

**Not a target (yet):** ER / general doctors encountering a HaemoCare patient ad-hoc — already served by the `PreVisitSummaryScreen` QR passport. The dashboard is for doctors with a **known panel** of regular patients.

---

## 2. Questions the doctor walks in needing to answer

Prioritised. Top three drive the MVP panel design.

1. **Who on my panel needs attention *right now*?** — overdue, recent urgent symptom, or both.
2. **What's happened to this patient since their last transfusion?** — symptom logs, severity, outcomes, reactions.
3. **Is their cadence holding?** — interval drift vs `profiles.recommended_visit_interval_days`.
4. Any **reactions** on file? (`transfusions.reaction_noted` / `reaction_detail`)
5. **Passport details** — blood type, antibodies, known reactions (mirrors the QR passport).
6. **Upcoming appointments** lined up, or gaps?
7. *(Phase-2)* What fraction of my panel is overdue, trending where?

Questions 4–5 are context on the detail view, not triggers on the panel list.

---

## 3. Top 3 workflows (priority order)

1. **Morning triage (P2, daily, 5–10 min).** Open dashboard → see panel sorted by triage signal → identify the 3–10 patients to call. *Success: zero scrolling needed to find urgent patients; overdue + recent-urgent surface above the fold.*
2. **Clinic-day deep-dive (P1, per patient, 2–3 min).** Tap a patient → see one screen with passport + last transfusion + symptom history since last visit + overdue state + adherence. *Success: no further taps required to brief the consult.* This is essentially `PreVisitSummaryScreen` repurposed for the doctor.
3. **Panel-level cadence check (P1/P2, weekly).** Filter to "overdue >21 days" or "urgent symptom in last 14 days" → export or copy a list. *Success: a single filtered view + a copy-to-clipboard / CSV export, nothing fancier.*

Anything that doesn't serve one of these three workflows is out of MVP.

---

## 4. Prioritised panel list

Each panel cites the schema fields it reads.

### MVP

- **P1. Panel list with triage sort.** One row per patient. Columns: name (`profiles.full_name`, Thai-safe), `patient_id`, days overdue (reuse `useOverdueState` logic), worst symptom outcome in last 14d (`symptom_logs.outcome`), days since last transfusion (`max(transfusions.date)`). Composite sort: urgent symptom > overdue tier-2 > overdue tier-1 > monitor symptom > rest. *Drives morning triage.*
- **P2. Per-patient detail view.** Reuses the structure of `PreVisitSummaryScreen`: 30-day snapshot, Hb decay (`analytics/hbDecay.ts`), symptom patterns (`analytics/symptomTemporal.ts`), upcoming `appointments`. Add a **passport header** (`profiles.{blood_type, rh_factor, antibodies, known_reactions, medications}`) and an **overdue badge** when applicable. *Drives clinic-day deep-dive.*
- **P3. Filter chips on the panel list.** "Overdue", "Urgent in last 14d", "Has reactions on file" (`profiles.antibodies` non-empty OR any `transfusions.reaction_noted = true`). Tap to filter, tap to clear. No multi-select dropdowns.
- **P4. Last-transfusion-reaction flag.** Icon on the panel row when the patient's most recent transfusion has `reaction_noted = true`; full `reaction_detail` shown in P2. Cheap, high-signal, must-know before re-transfusing.

### Phase 2

- **P5. Population overdue rate over time.** Line showing "% of panel overdue" by week — from `transfusions` + `appointments` + `profiles.recommended_visit_interval_days`.
- **P6. Symptom-pattern heatmap across the panel.** Top symptoms across patients in last 30 days — fed by `symptom_logs.symptoms` JSONB.
- **P7. Adherence column on panel list.** Blocked on real medication-reminder service (currently mock — see `PreVisitSummaryScreen.tsx` line 74).

### Nice-to-have (defer)

- **P8. Clinician notes / annotations.** Needs new `clinician_notes` table and clinician-role RLS. Don't build until the dashboard sees real use.
- **P9. Multi-clinician panels with assignment.** Needs team/role schema.
- **P10. CSV / PDF export.** Copy-to-clipboard from P3 covers the weekly cadence-check for v1.

---

## 5. Explicitly out of scope for v1

- **FHIR / HL7 / HOSxP / hospital-API integration.** Tracked separately. Dashboard reads only HaemoCare's own Supabase tables.
- **Wearable / passive-vitals data.** Tracked separately.
- **Any writes from the dashboard back to patient records.** Read-only. No editing profiles, no booking appointments, no acknowledging symptoms. Collapses RLS surface and trust-boundary risk to near-zero for v1.
- **In-app doctor↔patient messaging.** Doctors already use LINE/phone. Don't rebuild a worse version.
- **Push notifications to the doctor.** Behavioural data first, alerting second — same call we made on the patient-side overdue feature.
- **Multi-tenant clinic management / org RLS.** v1 assumes "doctor account sees a defined panel"; mechanism is the engineering strand's call.
- **Editing `recommended_visit_interval_days` from the dashboard.** Patient-owned field; doctor adjusts via the patient or the patient app.
- **Notes, structured assessments, ICD codes.** EMR's job, not ours.
- **LLM summarisation of the patient view.** Existing `analytics/` (Hb decay, symptom patterns, triage) is already the summary. Don't layer AI on top until we know what the doctor actually reads.

---

**Cited fields:** `profiles.{full_name, patient_id, blood_type, rh_factor, antibodies, known_reactions, medications, recommended_visit_interval_days}`, `transfusions.{date, reaction_noted, reaction_detail}`, `symptom_logs.{outcome, symptoms, logged_at}`, `appointments.{scheduled_date}`.
**Cited code:** `src/screens/detail/PreVisitSummaryScreen.tsx`, `src/hooks/useOverdueState.ts`, `src/analytics/{hbDecay,symptomTemporal,triage}.ts`.
