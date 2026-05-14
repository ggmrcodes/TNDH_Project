# HaemoCare v0.1.0 — First Public Pilot

**Released:** 2026-05-14 (Thailand)
**Platform:** Android only (iOS coming soon)

## What's new in v0.1.0

This is the first public-pilot release. Core features for thalassemia transfusion patients:

- **Transfusion passport** — blood type, antibodies, known reactions, QR for clinical staff
- **Transfusion log** — record date, hospital, pre/post Hb, reactions, notes
- **Symptom monitor** — log symptoms with severity scores; AI-assisted triage produces a normal / monitor / urgent outcome
- **Overdue-visit warning** — when you're past your planned transfusion date, the app raises the suggested severity of new symptom logs and shows a warning banner. Configurable interval per patient (default 28 days).
- **Appointments** — book, import (ICS or FHIR), see upcoming and past visits
- **Medication reminders** — daily reminders for chelation + folic acid
- **Pre-visit summary** — generate a printable summary before your hospital visit
- **Clinician dashboard** — if you have a clinician account, sign in to see your assigned patients triaged by urgency. (Clinician access is admin-provisioned for v0.1.0.)
- **Thai + English** — full localisation; toggle in any screen

## Known limitations

- iOS build not yet available
- Photo-based transfusion bag scanning is disabled in this build (feature returning in v0.2)
- Real clinician sign-up requires admin provisioning; contact your-email@example.com to be added
- Push notifications for overdue thresholds are not in this release

## Install

See [INSTALL.md](INSTALL.md) (also attached to the release).

## Feedback

Report bugs or feature requests at https://github.com/ggmrcodes/TNDH_Project/issues
