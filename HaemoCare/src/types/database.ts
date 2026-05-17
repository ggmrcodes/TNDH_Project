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
  created_at: string;
  updated_at: string;
}

export interface Transfusion {
  id: string;
  user_id: string;
  date: string;
  hospital: string;
  units_received: number;
  reaction_noted: boolean;
  reaction_detail: string;
  notes: string;
  pre_hb_g_dl?: number;
  post_hb_g_dl?: number;
  // === pre-tx labs (mirrored from brief #3 for graph dependency) ===
  // See docs/superpowers/specs/2026-05-17-pre-transfusion-labs-brief.md
  // and the PreTransfusionLabs interface near the bottom of this file.
  // Mirrored verbatim so this worktree compiles before #3's commits land;
  // git's 3-way merge will dedupe identical definitions cleanly.
  pre_labs?: PreTransfusionLabs | null;
  created_at: string;
}

export interface SymptomLog {
  id: string;
  user_id: string;
  transfusion_id: string | null;
  logged_at: string;
  symptoms: string[];
  severity_scores: Record<string, number>;
  outcome: 'normal' | 'monitor' | 'urgent';
  notes: string;
  created_at: string;
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

export interface MedicationReminder {
  id: string;
  user_id: string;
  medication_name: string;
  dosage: string;
  frequency: 'daily' | 'twice_daily' | 'three_times' | 'weekly' | 'as_needed';
  reminder_times: string[]; // ["08:00", "20:00"]
  instructions: string; // "Take on empty stomach", "Take with food"
  is_active: boolean;
  taken_today: string[]; // timestamps of when taken today
  streak_days: number;
  created_at: string;
  updated_at: string;
}

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

export interface ClinicianProfile {
  id: string;
  user_id: string;
  full_name: string;
  license_number: string;
  hospital_affiliation: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

export interface ClinicianPatientLink {
  id: string;
  clinician_id: string;
  patient_user_id: string;
  status: LinkStatus;
  requested_at: string;
  consented_at: string | null;
  revoked_at: string | null;
  share_full_name: boolean;
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
