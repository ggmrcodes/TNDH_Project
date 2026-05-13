# Doctor Dashboard — Wireframe Candidates

Three layouts for the primary doctor view (web, 1280–1440px). All three put the overdue list as the headline. They differ on what surrounds it.

Visual idiom: HaemoCare's clinical palette — teal primary (`#0B6E6E`), warm cream background (`#F8F6F2`), status colors `statusNormal` (green), `statusMonitor` (amber), `statusUrgent` (red). Cards with soft shadows, generous spacing, rounded corners. No dark mode. Headings work in TH and EN; row labels stay short so Thai wrapping doesn't break the grid.

---

## Candidate 1: Triage Queue (list-first, dense)

A workhorse. The whole screen is one prioritized roster, ranked by clinical urgency. The doctor scans top-to-bottom in 10 seconds and clicks into the one patient who needs them now. Secondary panels orbit around the list, not the other way around.

```
+--------------------------------------------------------------------------+
| HaemoCare Clinician   Dr. Ploy   Songklanagarind Hosp   TH/EN   [avatar] | 56px
+------+-------------------------------------------------------------------+
|      |  Today, Wed 13 May 2026                                            |
| [#]  |                                                                    |
| Home |  +---------------------------------------------------------+       |
| Pts  |  | OVERDUE 9 |  MONITOR 14 |  STABLE 88 |  NEW LOGS 4     |       | 72px
| Visits|  +---------------------------------------------------------+      |
| Labs |                                                                    |
| Msgs |  Patient queue  [Sort: most overdue v]  [Filter: all v]  [Search] |
| Sett |  +--------------------------------------------------+ +---------+ |
|      |  | ! 28d  Somchai P.  ID 1042  cadence  urgent log  | | UPCOMING| |
| 220px|  | ! 19d  Niran T.    ID 0884  missed appt          | | TODAY   | |
|      |  | ! 14d  Areeya K.   ID 0991  cadence              | |         | |
|      |  | ! 11d  Kraisorn V. ID 1117  cadence  monitor log | | 10:00   | |
|      |  | ! 09d  Pim J.      ID 0701  missed appt          | | Somchai | |
|      |  | . 08d  Tanawat R.  ID 1203  cadence              | | (walk-in| |
|      |  |--------------------------------------------------| |  flag)  | |
|      |  | ~ Monitor (rising symptoms, not overdue)         | |         | |
|      |  | ~ 5d   Phichit S.  ID 1058  urgent log today     | | 11:30   | |
|      |  | ~ 4d   Sirin N.    ID 0992  2 monitor logs       | | Niran   | |
|      |  | ~ 2d   Boon S.     ID 1144  Hb trend ↓           | |         | |
|      |  |--------------------------------------------------| | 14:00   | |
|      |  | (collapse Stable — 88 patients)              [>] | | Areeya  | |
|      |  +--------------------------------------------------+ +---------+ |
|      |                       ~880px wide                       ~280px    |
|      |                                                                    |
|      |  Recent symptom logs (last 24h)        [view all]                 |
|      |  +--------------------------------------------------+              |
|      |  | 13:02  Pim J.       headache, fatigue   URGENT*  |              | *bumped
|      |  | 11:40  Sirin N.     dizziness           MONITOR  |              |
|      |  | 09:15  Boon S.      chest tight         MONITOR  |              |
|      |  +--------------------------------------------------+              |
+------+-------------------------------------------------------------------+
                                  ~1340px
```

**Region data**

- Top stat strip: count of overdue (`days_overdue >= 8`), monitor (recent monitor/urgent logs, not overdue), stable, and new logs in last 24h. Driven by `useOverdueState` rolled up across the doctor's patient list.
- Patient queue: each row pulls `profiles.name`, `profiles.id_short`, `daysOverdue`, `sourcePath` (cadence/appointment) from the overdue computation, plus `latest_symptom_log.outcome` if within 7 days. Sorted by `daysOverdue` desc.
- Upcoming today: `appointments.scheduled_date = today`, marked with a `(walk-in flag)` if patient is also in the overdue list.
- Recent logs: `symptom_logs` ordered by `logged_at` desc, last 24h. `*` indicates `applyBump` raised the outcome.

**Why this works**

- The headline is literally a list of names ranked by urgency. Zero hunting.
- Density: 30–150 patients fit on one screen with collapsing. Doctors are used to roster views (EMR worklists, OR boards).
- Reuses HaemoCare's existing status-color vocabulary 1:1.

**Tradeoffs**

- Loses context per patient — to see Hb trend or symptom timeline, you click through.
- Lots of text close together; Thai diacritics make the row height slightly variable. Need fixed row height + truncation.
- Doesn't celebrate "stable" patients, which can feel pessimistic. (Counterargument: that's the point of triage.)

---

## Candidate 2: Split View (master-detail, two-pane)

A queue on the left, a live patient deep-dive on the right. Click a name, the right pane fills with that patient's last 90 days of Hb, symptoms, and appointments. Optimised for the "10 minutes to actually read one chart before the next consult" use case.

```
+--------------------------------------------------------------------------+
| HaemoCare Clinician   Dr. Ploy   Songklanagarind   TH/EN   [avatar]      | 56px
+------------------+-------------------------------------------------------+
|                  |                                                        |
| Today  13 May    |  Somchai Panyawong   ID 1042   M, 24   β-thal major   | 80px hero
|                  |  28 days overdue · cadence path · last tx 12 Apr      |
| +--------------+ |  [book visit]  [call]  [open passport]                |
| | OVERDUE   9  | +-------------------------------------------------------+
| | MONITOR  14  |                                                          |
| | STABLE   88  |  +-------------------------+  +------------------------+ |
| +--------------+ |  | Hb trend (last 90 d)  |  | Symptom log (recent)  | |
|                  |  |  g/dL                 |  |                       | |
| [search...]      |  |  10 +                 |  | 13 May  headache      | |
|                  |  |   9 |  *      *       |  |         fatigue       | |
| ! 28d  Somchai  >|  |   8 |     *       *   |  |         URGENT*       | |
| ! 19d  Niran    |  |   7 +-----+----+----+- |  |                       | |
| ! 14d  Areeya   |  |       Mar  Apr  May    |  | 02 May  dizziness     | |
| ! 11d  Kraisorn |  |  pre  o post *         |  |         MONITOR       | |
| ! 09d  Pim      |  +-------------------------+  | 24 Apr  fatigue       | |
| . 08d  Tanawat  |                                |         NORMAL        | |
| ~ 5d  Phichit   |  +-------------------------+  |                       | |
| ~ 4d  Sirin     |  | Transfusions (last 6)   |  +-----------------------+ |
| ~ 2d  Boon      |  | 12 Apr  pre 6.8 post 9.4|                            |
| · stable 88 >   |  | 15 Mar  pre 7.1 post 9.6|  +-----------------------+ |
|                  |  | 18 Feb  pre 6.9 post 9.5|  | Appointments          | |
|  ~320px          |  | ...                     |  | (none scheduled)      | |
|                  |  +-------------------------+  | [book a visit]        | |
|                  |                                +-----------------------+|
|                  |                  right pane ~960px                      |
+------------------+-------------------------------------------------------+
                                 ~1340px
```

**Region data**

- Left rail: same overdue/monitor/stable list as Candidate 1, compressed. Selecting a row drives the right pane.
- Patient hero: `profiles` (name, sex, age, diagnosis), `overdueState`, last transfusion date.
- Hb chart: `transfusions.pre_hb_g_dl` (`o`) and `post_hb_g_dl` (`*`), x-axis last 90 days. Drawn from existing transfusion data — no new schema.
- Symptom log: `symptom_logs` last 5 entries, with `*` denoting bumped outcomes (reconstructible from `logged_at` + overdue state at that date).
- Transfusions table: last 6 rows from `transfusions`.
- Appointments: `appointments` upcoming + last past.

**Why this works**

- Single pane of glass for the "read one patient" task. No tab switching.
- The queue is still visible at all times, so the doctor can jump without losing context.
- Maps cleanly to the existing patient-side passport — same data, same colors.

**Tradeoffs**

- Wastes pixels on first load (right pane empty until selection). Need a sensible default (top overdue patient pre-selected).
- 320px left rail is tight for Thai names + ID — may need a hover tooltip for long names.
- The right pane has 4 sub-cards, which is more design work than Candidate 1.

---

## Candidate 3: Calendar Spine (time-first, week view)

The week is the spine. A Mon–Sun strip shows appointments and overdue-by-day; overdue patients drop into columns based on when they *should* have come in. Cards float against the calendar. Optimised for doctors who plan their week and want to see "who fell off this week" geographically rather than as a flat list.

```
+--------------------------------------------------------------------------+
| HaemoCare Clinician  Dr. Ploy  Songklanagarind  TH/EN  [avatar]          | 56px
+--------------------------------------------------------------------------+
| < Week 19  ·  11–17 May 2026  >        [day][week][month]  +new visit    | 56px
+--------------------------------------------------------------------------+
|   Mon 11   |   Tue 12   |  Wed 13 ⬤ |   Thu 14   |   Fri 15   |  S/S   |
| (past)     | (past)     |  TODAY     |            |            |        |
|            |            |            |            |            |        |
|  10:00     | 09:30      | 10:00      | 09:00      | 10:30      |        |
|  Apinya    | Decha      | Somchai !  | Phichit ~  | Niran  !   |   —    | 320px
|  done      | done       |  (overdue) | (monitor)  |  (overdue) |        |
|            |            |            |            |            |        |
|            | 14:00      | 11:30      | 13:00      |            |        |
|            | Patcharee  | (open)     | Sirin  ~   |            |        |
|            | no-show !  |            |            |            |        |
|            |            | 14:00      |            |            |        |
|            |            | Areeya     |            |            |        |
|            |            |            |            |            |        |
+--------------------------------------------------------------------------+
|                                                                          |
|  OVERDUE PATIENTS — not on the calendar (need to be booked)              |
|  +---------------------------------------------+ +---------------------+ |
|  | ! 28d  Somchai P.   on today already        | | THIS WEEK SUMMARY   | |
|  | ! 19d  Niran T.     on Fri already          | | Visits booked:  12  | |
|  | ! 14d  Areeya K.    on today already        | | Done so far:     5  | |
|  | ! 11d  Kraisorn V.  NOT BOOKED  [book...]   | | No-shows:        1  | |
|  | ! 09d  Pim J.       NOT BOOKED  [book...]   | | Walk-ins needed: 2  | |
|  | . 08d  Tanawat R.   NOT BOOKED  [book...]   | | New urgent logs: 3  | |
|  +---------------------------------------------+ +---------------------+ |
|                          ~900px                          ~340px           |
+--------------------------------------------------------------------------+
                                ~1340px
```

**Region data**

- Calendar grid: `appointments` for the week, grouped by `scheduled_date`. `!` = overdue patient; `~` = recent monitor log; "done" = transfusion logged on/after that date; "no-show" = past appointment with no matching transfusion.
- Overdue-but-not-booked table: patients with `isOverdue: true` whose patient ID does NOT appear in this week's appointments. Each row has a `[book...]` CTA.
- Week summary: counts derived from the same data, plus `symptom_logs` flagged urgent in the last 7 days.

**Why this works**

- Doctors already plan in weeks. Aligning the dashboard to that mental model means less translation.
- Makes "who fell off and isn't even on the calendar" the single most visible problem (the bottom-left table).
- Surfaces no-shows visually — the calendar shows the slot was used and then wasn't.

**Tradeoffs**

- Lower information density per pixel than Candidate 1 or 2. With 9 overdue patients, only 6 fit in the bottom table without scroll.
- Doesn't help the "I have one patient in front of me right now" use case — that's a click away to a detail view.
- Week navigation adds a state variable; today-view vs week-view becomes a fork in design.

---

## My recommendation and why

**Candidate 2 (Split View).**

Three reasons:

1. **The job is "read a patient."** The doctor has 5–15 minutes between consults. The single highest-leverage action is loading one patient's recent transfusions, symptoms, and overdue context into their head before the patient walks in. Candidate 2 makes that one click; Candidates 1 and 3 make it two (click name → new page).
2. **The overdue list is still the headline.** Pre-selecting the top overdue patient on load means the doctor sees the most urgent patient's full chart the moment the page renders — Candidate 1's "list" is still the first thing in their eye on the left rail, but with the bonus of a populated detail pane.
3. **It reuses the patient-side passport idiom directly.** Hb chart, transfusion table, symptom log, appointments — those four cards already exist in `PassportScreen.tsx` / `TransfusionHistoryScreen.tsx` / `SymptomMonitorScreen.tsx`. We're rebuilding for desktop layout but not reinventing components or visual language.

Candidate 1 is the right fallback if user research says "I just want a worklist, stop showing me detail I didn't ask for." Candidate 3 is the right pivot if the dashboard becomes the *scheduling* tool more than the *clinical-read* tool — likely once FHIR/Health Link sync lands (the hospital-integration future work). For phase 1, Split View is the strongest starting point.
