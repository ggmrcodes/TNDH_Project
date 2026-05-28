export type PrimaryDiagnosis = 'thalassemia' | 'hemophilia' | 'other';

export type ThalassemiaSubtype =
  | 'alpha_silent_carrier'
  | 'alpha_trait'
  | 'hb_h_disease'
  | 'alpha_major_hb_barts'
  | 'beta_minor'
  | 'beta_intermedia'
  | 'beta_major_cooleys'
  | 'hb_e_beta_thal'
  | 'delta_beta_thal'
  | 'hb_lepore_syndrome';

export interface Profile {
  id: string;
  user_id: string;
  patient_id: string;
  full_name: string;
  blood_type: 'A' | 'B' | 'AB' | 'O' | '';
  rh_factor: '+' | '-' | '';
  antibodies: string[];
  known_reactions: string;
  medications: string;
  language_preference: 'th' | 'en';
  pdpa_consented: boolean;
  pdpa_consented_at: string | null;
  share_full_name: boolean;
  recommended_visit_interval_days: number;
  primary_diagnosis: PrimaryDiagnosis | null;
  thalassemia_subtype: ThalassemiaSubtype | null;
  // ── Patient's primary hospital. Nullable; references public.hospitals(id).
  // Added 2026-06-10. Drives transfusion-record prefill and surfaces in
  // Edit Profile / signup. Independent of clinician-linking (that's the
  // clinician_patient_links table).
  hospital_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transfusion {
  id: string;
  user_id: string;
  date: string;
  hospital: string;
  units_received: number | null; // null = not recorded / unknown
  reaction_noted: boolean;
  reaction_detail: string;
  notes: string;
  pre_hb_g_dl?: number;
  post_hb_g_dl?: number;
  // ── Pre-transfusion lab values (Hb / Hct / Ferritin). Added 2026-05-17.
  // See docs/superpowers/specs/2026-05-17-pre-transfusion-labs-brief.md and
  // the PreTransfusionLabs section near the bottom of this file.
  pre_labs?: PreTransfusionLabs | null;
  // ── Scanned-document photo (the source image from ScanTransfusionScreen).
  // For real-mode this stores a storage path inside the private
  // 'transfusion-documents' bucket ('{user_id}/{transfusion_id}.jpg').
  // For mock-mode this is a data: URI. NULL for legacy rows and for
  // manual-entry records with no attached photo. Added 2026-06-09.
  document_photo_url?: string | null;
  created_at: string;
}

// ── Urine color logging (hematuria tracking) ───────────────────────────
// Added 2026-05-17. Replaces the binary `dark_urine` symptom with a
// 7-color clinically-meaningful picker. See URINE_COLOR_OPTIONS in
// src/utils/clinicalThresholds.ts for the source-of-truth swatch list
// and `evaluateSymptoms()` for the outcome mapping.
// Historical logs use `dark_urine` inside `severity_scores`; new logs
// populate `urine_color` and leave `dark_urine` out of `severity_scores`.
// Picker now shows only the four clinically-abnormal categories
// (`red_pink`, `cola_dark`, `cloudy_white`, `green_blue`). The legacy
// seven-color values are kept in the union for backward compatibility
// with logs written before the picker was pruned — they still display
// correctly via URINE_COLOR_HEX and isHematuriaColor.
export type UrineColor =
  // New picker values — clinically abnormal only
  | 'red_pink'
  | 'cola_dark'
  | 'cloudy_white'
  | 'green_blue'
  // Legacy values (kept for historical-log compatibility, not pickable)
  | 'clear'
  | 'yellow'
  | 'dark_yellow'
  | 'pink'
  | 'red'
  | 'brown_tea'
  | 'cola';

export interface SymptomLog {
  id: string;
  user_id: string;
  transfusion_id: string | null;
  logged_at: string;
  symptoms: string[];
  severity_scores: Record<string, number>;
  outcome: 'normal' | 'monitor' | 'urgent';
  notes: string;
  /**
   * Clinical red-flag urine color (see URINE_COLOR_OPTIONS) — pink/red/brown/
   * cola hues can indicate hematuria or post-transfusion hemolysis. Null or
   * absent on legacy logs that predate the urine-color field; those logs may
   * instead carry `dark_urine` inside `severity_scores`.
   */
  urine_color?: UrineColor | null;
  created_at: string;
  /** Set to the edit timestamp whenever the patient modifies an existing
   * log; null/absent means the log has never been edited. Surfaced to the
   * linked clinician so edits are transparent. */
  edited_at?: string | null;
}

export type AppointmentSource =
  | 'manual'
  | 'ics_import'
  | 'fhir_th_core'
  | 'mor_prom'
  | 'hospital_api';

export interface Appointment {
  id: string;
  user_id: string;
  scheduled_date: string;
  hospital: string;
  notes: string;
  linked_transfusion_id: string | null;
  source: AppointmentSource;
  external_id: string | null;
  external_source_name: string | null;
  created_at: string;
}

// ISO weekday codes used by `MedicationReminder.days_of_week`.
export type WeekdayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const ALL_WEEKDAYS: WeekdayCode[] = ['mon','tue','wed','thu','fri','sat','sun'];

export interface MedicationReminder {
  id: string;
  user_id: string;
  medication_name: string;
  dosage: string;
  frequency: 'daily' | 'twice_daily' | 'three_times' | 'weekly' | 'as_needed';
  reminder_times: string[]; // ["08:00", "20:00"]
  /** Days the medication is taken. `null` or empty = every day (legacy default). */
  days_of_week: WeekdayCode[] | null;
  instructions: string; // "Take on empty stomach", "Take with food"
  is_active: boolean;
  taken_today: string[]; // timestamps of when taken today
  streak_days: number;
  created_at: string;
  updated_at: string;
}

// === medication adherence (brief #1) ===
export type AdherenceEventSource = 'tap' | 'notification' | 'manual';

export interface MedicationAdherenceEvent {
  id: string;
  user_id: string;
  reminder_id: string;
  scheduled_at: string; // ISO timestamp of the planned dose
  taken_at: string | null;
  skipped_at: string | null;
  source: AdherenceEventSource;
  created_at: string;
}
// === end medication adherence ===

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  role_label: string;
  priority: 1 | 2 | 3;
  created_at: string;
}

export type EmergencyContext = 'sos' | 'urgent_symptom' | 'overdue';

export type Outcome = 'normal' | 'monitor' | 'urgent';

export type LinkStatus = 'pending' | 'active' | 'declined' | 'revoked' | 'expired';

export interface Hospital {
  id: string;
  name_th: string;
  name_en: string;
  code: string | null;
  region: 'north' | 'northeast' | 'central' | 'south' | 'east' | 'west' | null;
  is_active: boolean;
  created_at: string;
}

export interface ClinicianProfile {
  id: string;
  user_id: string;
  full_name: string;
  license_number: string;
  hospital_affiliation: string;
  hospital_id: string | null;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

export interface PendingClinician {
  user_id: string;
  full_name: string;
  license_number: string;
  hospital_affiliation: string;
  hospital_id: string | null;
  created_at: string;
}

export interface ClinicianPatientLink {
  id: string;
  clinician_id: string;
  patient_user_id: string;
  status: LinkStatus;
  initiated_by: 'clinician' | 'patient';
  requested_at: string;
  consented_at: string | null;
  revoked_at: string | null;
  share_full_name: boolean;
}

export interface Message {
  id: string;
  link_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_type: 'image' | null;
  created_at: string;
}

export interface Conversation {
  linkId: string;
  otherPartyUserId: string;
  otherPartyName: string;
  otherPartySubtitle: string | null;
  status: LinkStatus;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

// ============================================================================
// PRE-TRANSFUSION LABS (added 2026-05-17)
// ----------------------------------------------------------------------------
// New section: keep self-contained so concurrent wave-1 briefs that also
// touch this file (e.g. agent #4's `urine_color` enum on SymptomLog) can
// be merged mechanically. Do not interleave with existing exports.
// See docs/superpowers/specs/2026-05-17-pre-transfusion-labs-brief.md.
// ============================================================================

/** Where the lab values came from. Future hospital integrations will
 * populate `health_link` / `hosxp`; v1 is always `manual`. */
export type PreTransfusionLabsSource = 'manual' | 'health_link' | 'hosxp';

/** Pre-transfusion blood + iron labs attached to a transfusion record.
 *
 * Units are fixed by Thai lab convention and not user-pickable:
 *   - hb       — Hemoglobin in g/dL  (valid range 0.1–25)
 *   - hct      — Hematocrit in %     (valid range 1–75)
 *   - ferritin — Ferritin in ng/mL   (valid range 0–10000)
 *
 * Any of `hb` / `hct` / `ferritin` may be null — the patient might only
 * have one or two values to enter at a time.
 */
export interface PreTransfusionLabs {
  hb: number | null;
  hct: number | null;
  ferritin: number | null;
  recorded_at: string;            // ISO timestamp
  recorded_by_user_id: string;    // patient or clinician user_id
  verified_by_clinician_id: string | null;
  lab_slip_photo_url: string | null;
  source?: PreTransfusionLabsSource;
}

/** Append-only audit row written every time `Transfusion.pre_labs` changes.
 * Persisted in the `transfusion_lab_audit_log` table. */
export interface TransfusionLabAuditEntry {
  id: string;
  transfusion_id: string;
  previous_value: PreTransfusionLabs | null;
  new_value: PreTransfusionLabs | null;
  changed_by_user_id: string;
  changed_at: string;
}
