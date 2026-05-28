import type {
  ClinicianProfile,
  Profile,
  Transfusion,
  SymptomLog,
  Appointment,
  EmergencyContact,
  PrimaryDiagnosis,
  ThalassemiaSubtype,
} from '../types/database';

export const MOCK_CLINICIAN_USER_ID = 'mock-clinician-001';

export const MOCK_CLINICIAN_PROFILE: ClinicianProfile = {
  id: 'mock-clinician-profile-001',
  user_id: MOCK_CLINICIAN_USER_ID,
  full_name: 'Dr. Ploy Wattanaporn',
  license_number: '12345-Demo',
  hospital_affiliation: 'Songklanagarind Hospital',
  hospital_id: 'mock-hospital-songkla',
  verified: true,
  verified_at: '2026-01-15T09:00:00+07:00',
  created_at: '2026-01-15T09:00:00+07:00',
};

// Each linked patient has profile + transfusions + symptom_logs + appointments.
// Five patients with varied risk profiles.
export interface MockLinkedPatient {
  profile: Profile;
  transfusions: Transfusion[];
  symptomLogs: SymptomLog[];
  appointments: Appointment[];
  emergencyContacts: EmergencyContact[];
}

const today = new Date('2026-05-13T08:00:00+07:00');
const daysAgo = (n: number) =>
  new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const baseProfile = (
  id: string,
  name: string,
  patientId: string,
  intervalDays = 28,
  primaryDiagnosis: PrimaryDiagnosis | null = 'thalassemia',
  thalassemiaSubtype: ThalassemiaSubtype | null = 'beta_intermedia',
): Profile => ({
  id: `p-${id}`,
  user_id: id,
  patient_id: patientId,
  full_name: name,
  blood_type: 'B',
  rh_factor: '+',
  antibodies: [],
  known_reactions: '',
  medications: 'Deferasirox 500mg daily',
  language_preference: 'th',
  pdpa_consented: true,
  pdpa_consented_at: '2026-01-15T09:00:00+07:00',
  share_full_name: true,
  recommended_visit_interval_days: intervalDays,
  primary_diagnosis: primaryDiagnosis,
  thalassemia_subtype: thalassemiaSubtype,
  hospital_id: null,
  created_at: '2026-01-15T09:00:00+07:00',
  updated_at: '2026-01-15T09:00:00+07:00',
});

export const MOCK_LINKED_PATIENTS: MockLinkedPatient[] = [
  // Patient 1: tier-2 overdue (28+ days), recent monitor log
  {
    profile: baseProfile('mock-pt-001', 'Somchai Panyawong', 'HC-100001', 28, 'thalassemia', 'beta_major_cooleys'),
    transfusions: [
      { id: 't1a', user_id: 'mock-pt-001', date: daysAgo(56), hospital: 'Songklanagarind', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 6.8, post_hb_g_dl: 9.4, created_at: daysAgo(56) },
      { id: 't1b', user_id: 'mock-pt-001', date: daysAgo(84), hospital: 'Songklanagarind', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 7.1, post_hb_g_dl: 9.6, created_at: daysAgo(84) },
    ],
    symptomLogs: [
      { id: 's1a', user_id: 'mock-pt-001', transfusion_id: 't1a', logged_at: daysAgo(3), symptoms: ['fatigue', 'headache'], severity_scores: { fatigue: 5, headache: 4 }, outcome: 'monitor', notes: '', created_at: daysAgo(3) },
    ],
    appointments: [],
    emergencyContacts: [
      { id: 'ec1a', user_id: 'mock-pt-001', name: 'Wanida Panyawong', phone: '0812345678', role_label: 'Spouse', priority: 1, created_at: daysAgo(180) },
      { id: 'ec1b', user_id: 'mock-pt-001', name: 'Dr. Suwan', phone: '0898765432', role_label: 'Hematologist', priority: 2, created_at: daysAgo(180) },
    ],
  },
  // Patient 2: tier-1 overdue (14 days), urgent log in last 7d
  {
    profile: baseProfile('mock-pt-002', 'Niran Tonsuk', 'HC-100002', 28, 'thalassemia', 'hb_e_beta_thal'),
    transfusions: [
      { id: 't2a', user_id: 'mock-pt-002', date: daysAgo(42), hospital: 'Siriraj', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 6.5, post_hb_g_dl: 9.1, created_at: daysAgo(42) },
    ],
    symptomLogs: [
      { id: 's2a', user_id: 'mock-pt-002', transfusion_id: 't2a', logged_at: daysAgo(2), symptoms: ['fever', 'chills', 'back_pain'], severity_scores: { fever: 8, chills: 6, back_pain: 5 }, outcome: 'urgent', notes: '', created_at: daysAgo(2) },
    ],
    appointments: [],
    emergencyContacts: [
      { id: 'ec2a', user_id: 'mock-pt-002', name: 'Pranee Tonsuk', phone: '0823456789', role_label: 'Mother', priority: 1, created_at: daysAgo(200) },
    ],
  },
  // Patient 3: stable, recent appointment scheduled
  {
    profile: baseProfile('mock-pt-003', 'Areeya Kraisri', 'HC-100003', 28, 'thalassemia', 'beta_intermedia'),
    transfusions: [
      { id: 't3a', user_id: 'mock-pt-003', date: daysAgo(10), hospital: 'Songklanagarind', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 7.0, post_hb_g_dl: 9.5, created_at: daysAgo(10) },
    ],
    symptomLogs: [],
    appointments: [
      { id: 'a3a', user_id: 'mock-pt-003', scheduled_date: daysAgo(-7), hospital: 'Songklanagarind', notes: '', linked_transfusion_id: null, source: 'manual', external_id: null, external_source_name: null, created_at: daysAgo(15) },
    ],
    emergencyContacts: [],
  },
  // Patient 4: had a recent transfusion reaction
  {
    profile: baseProfile('mock-pt-004', 'Kraisorn Vichaikun', 'HC-100004', 28, 'hemophilia', null),
    transfusions: [
      { id: 't4a', user_id: 'mock-pt-004', date: daysAgo(20), hospital: 'Songklanagarind', units_received: 2, reaction_noted: true, reaction_detail: 'Mild febrile reaction during infusion. Premedicated with acetaminophen on next visit.', notes: '', pre_hb_g_dl: 6.7, post_hb_g_dl: 9.3, created_at: daysAgo(20) },
    ],
    symptomLogs: [],
    appointments: [],
    emergencyContacts: [],
  },
  // Patient 5: stable, fully on cadence
  {
    profile: baseProfile('mock-pt-005', 'Pim Jaroon', 'HC-100005', 28, 'thalassemia', 'hb_h_disease'),
    transfusions: [
      { id: 't5a', user_id: 'mock-pt-005', date: daysAgo(7), hospital: 'Siriraj', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 7.2, post_hb_g_dl: 9.7, created_at: daysAgo(7) },
    ],
    symptomLogs: [
      { id: 's5a', user_id: 'mock-pt-005', transfusion_id: 't5a', logged_at: daysAgo(5), symptoms: ['fatigue'], severity_scores: { fatigue: 2 }, outcome: 'normal', notes: '', created_at: daysAgo(5) },
    ],
    appointments: [
      { id: 'a5a', user_id: 'mock-pt-005', scheduled_date: daysAgo(-14), hospital: 'Siriraj', notes: '', linked_transfusion_id: null, source: 'manual', external_id: null, external_source_name: null, created_at: daysAgo(20) },
    ],
    emergencyContacts: [],
  },
];
