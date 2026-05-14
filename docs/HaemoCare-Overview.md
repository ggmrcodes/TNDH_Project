# HaemoCare

*Your Transfusion Companion*

A mobile companion for patients who depend on regular blood transfusions, and for the clinicians who care for them. HaemoCare keeps a patient's medical identity, symptoms, appointments, transfusion history, and medication reminders in one place, and gives clinicians a triage view of their cohort.

Built for Thailand. Bilingual English / ไทย. PDPA-aligned by design.

---

## Who it is for

**Patients living with chronic transfusion needs.** Thalassemia, sickle cell, aplastic anemia, and any condition that puts someone on a recurring transfusion schedule. The app is the patient's portable medical identity and their early-warning system after each transfusion.

**Clinicians and care coordinators.** A separate clinician role unlocks a cohort dashboard for the patients they look after.

---

## What patients get

### A medical identity they actually carry

Every patient has a Transfusion Passport: blood type and Rh factor, antibody profile, known transfusion reactions, current medications, and an anonymized Patient ID for shared documents.

- **QR Code.** A tap shows medical staff a scannable summary of the patient's blood type and antibody info, useful in any setting where speed matters.
- **PDF export.** The same profile, exportable to PDF for printed records or to email to a hospital.
- **Privacy switch.** By default, shared documents and QR codes use the Patient ID only. The patient can opt in to including their full name.

### Symptom monitoring after every transfusion

A 72-hour active monitoring window opens after each transfusion. The patient logs symptoms (fever, chills, fatigue, dark urine, jaundice, back pain, shortness of breath, skin rash) with a severity slider. The app evaluates the entry against clinical thresholds and returns one of three outcomes:

- **Normal** — within expected range. Keep resting and monitoring.
- **Monitor Closely** — some symptoms need attention. Contact the care team if they worsen.
- **Seek Medical Attention** — ALERT: contact the healthcare provider immediately or go to the emergency department.

The outcome is shown in plain language and the log is saved with a timestamp for the patient and their clinician to review later.

### Overdue-visit awareness

If a patient passes their planned transfusion interval (default 28 days, configurable), HaemoCare bumps the severity tiers of logged symptoms upward and shows a banner with a one-tap CTA to book an appointment. The patient is told plainly that the assessment was raised because of the overdue interval, and they can override it if they have already coordinated with their hospital.

### Appointments, three ways in

1. **Add manually.** Date, hospital, notes.
2. **Import .ics.** Paste an .ics file from any hospital or calendar app, pick which events to keep, save the selected ones.
3. **Import from FHIR (TH Core).** Connect a hospital's TH Core / Health Link endpoint, fetch upcoming appointments, import what's relevant. Endpoint URL and patient reference are entered by the patient; nothing is shared back to the hospital from HaemoCare.

Imported appointments live only on the patient's device and account.

### Pre-Appointment Brief

Before a visit, the patient opens "Prepare for Visit" and gets a one-page snapshot to discuss with their clinician:

- Hemoglobin trend across recent transfusions
- Recurring symptom patterns over the last 30 days
- Medication adherence percentage
- Counts: total symptom logs, flagged symptoms

The brief can be copied, exported as PDF, or shared.

### Transfusion history

Every transfusion is recorded with date, hospital, units received, reaction notes, and any related symptom logs. Two ways to add a record:

- **Manual entry** with full control over every field.
- **Scan a transfusion slip.** Take a photo or pick one from the library; the app extracts the fields with an AI assist and asks the patient to verify before saving. Each AI-extracted field shows a confidence label and a "please double-check" hint so the patient stays in the loop.

### Medication reminders

Add prescribed medications with dosage, frequency (daily, twice/thrice daily, weekly, as-needed), reminder time, and special instructions. The app sends local notifications, tracks taken/skipped, computes an adherence score, and keeps a daily streak.

### Bilingual EN / ไทย

Every screen, button, status message, banner, and outcome text is translated. The toggle is one tap from the auth screens and from inside the app.

---

## What clinicians get

A clinician account unlocks the Clinician Dashboard, with a cohort overview of assigned patients and a triage-ordered queue.

- **Cohort badges:** Overdue, Monitor, Stable.
- **Filters:** overdue, urgent in the last 14 days, has reactions on file.
- **Detail pane** for the selected patient, including reaction-on-file flags.
- **Triage scoring** prioritizes patients whose most recent outcome is urgent, who are most overdue, and who have reactions on file.

Clinicians sign in with the same account flow as patients; the role determines what they see.

---

## Privacy and data handling

HaemoCare is designed around Thailand's Personal Data Protection Act.

- **Consent first.** Patients see a clear PDPA consent screen before any health data is captured. What is collected, why it is collected, who can access it, the patient's rights, and the retention policy are all stated up front in plain language.
- **Data minimization in sharing.** QR codes and exported PDFs default to using the Patient ID instead of the full name. The patient flips a switch to include their name.
- **Subject rights, one tap each.**
    - View what's stored.
    - Export all data as a PDF.
    - Delete the account and every associated record. This is irreversible and is gated behind a confirmation dialog.

---

## How it stays current

The app ships with Expo's over-the-air update mechanism. When a new version is published, patients see a banner:

- *Optional update:* "Version X.X is ready. Tap to download."
- *Required update:* "This version is no longer supported. Please update."

Patients can also check for updates manually from settings and read release notes inline.

---

## Platform and distribution

- **Android** — primary target. Distributed as an APK from Expo's EAS internal channel during preview.
- **iOS** — the codebase supports iOS; distribution decision pending.
- **Web** — a web build exists for staff who prefer a desktop view. The clinician dashboard adapts to a desktop sidebar layout automatically.

Built on Expo SDK 54, React Native 0.81, and Supabase. Android package id: `app.haemocare`. Version 1.0.0.

---

## What is wired today

Patient app:

- Account signup, PDPA consent, profile completion
- Transfusion Passport with QR + PDF export
- Symptom Monitor with 72-hour window and overdue bump logic
- Appointments tab with manual add, .ics import, FHIR (TH Core) import
- Pre-Appointment Brief with Hb trend, symptom patterns, adherence
- Transfusion History with manual entry and photo-scan extraction
- Medication Reminders with local notifications, adherence, streaks
- Privacy Settings with export and delete
- Bilingual EN / ไทย throughout
- Optional / required update banners

Clinician app:

- Cohort dashboard with badges, filters, search
- Triage-sorted queue
- Patient detail pane with reaction-on-file flags

---

## What is on the roadmap

Two integrations are planned but not yet wired into production flows:

- **Hospital appointment sync.** Two-way exchange with Thai public and private hospital systems via HL7 FHIR, Health Link, and HOSxP-adjacent rails. Today HaemoCare can read appointments from any conformant TH Core FHIR endpoint; writing back requires hospital partnership access.
- **Wearable + passive health data.** Ingestion of vitals from Apple Health, Fitbit, Garmin, and Google Fit, so objective signals can sit alongside subjective symptom logs in the Pre-Appointment Brief and the clinician dashboard.

---

## A note on the AI assists

Two places in the app use machine learning to save patients time:

1. **Transfusion slip scanning** — extracts fields from a photo of a transfusion slip.
2. **Triage outcome on symptom logs** — pattern-based classification against published clinical thresholds.

Both surface their reasoning to the patient. The slip scan flags every extracted field as "please verify" and shows a confidence label. The triage outcome explains why it raised severity when the patient is overdue. Nothing is auto-saved without the patient's confirmation, and no outcome replaces clinical judgment.
