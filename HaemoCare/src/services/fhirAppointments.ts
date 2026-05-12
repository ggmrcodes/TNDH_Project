// FHIR Appointment client — reads from any FHIR R4/R5 server that conforms to
// SIL-TH's TH Core Implementation Guide (fhir-ig.sil-th.org/build/core/).
// For local demo: run the TH Core HAPI FHIR sandbox from github.com/sil-th and
// seed with scripts/seed-fhir.sh. Set EXPO_PUBLIC_FHIR_BASE_URL in .env.
//
// This only reads; no writes back to FHIR. Bi-directional sync is a later pass.

import { AppointmentInput } from './appointmentService';

// Minimal subset of FHIR Appointment we consume. Full spec at
// https://www.hl7.org/fhir/appointment.html
export interface FhirAppointmentParticipant {
  actor?: { reference?: string; display?: string };
  status?: string;
}
export interface FhirAppointment {
  resourceType: 'Appointment';
  id: string;
  status?: string;
  description?: string;
  start?: string;          // ISO 8601
  end?: string;
  comment?: string;
  serviceType?: Array<{ text?: string }>;
  participant?: FhirAppointmentParticipant[];
  meta?: { profile?: string[] };
}

export interface FhirBundle<T> {
  resourceType: 'Bundle';
  entry?: Array<{ resource: T }>;
  total?: number;
}

export class FhirError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'FhirError';
  }
}

/**
 * Fetches upcoming appointments for a patient from a FHIR server.
 * Uses the standard `?patient=<ref>&date=ge<today>` search — works on HAPI and
 * conformant TH Core endpoints alike.
 */
export async function listAppointmentsForPatient(
  baseUrl: string,
  patientRef: string,
  opts: { includePast?: boolean } = {}
): Promise<FhirAppointment[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('patient', patientRef);
  if (!opts.includePast) {
    const today = new Date().toISOString().slice(0, 10);
    params.set('date', `ge${today}`);
  }
  params.set('_count', '50');

  const url = `${base}/Appointment?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
  } catch (e: any) {
    throw new FhirError(`Network error contacting FHIR server at ${base}. ${e?.message ?? ''}`);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    throw new FhirError(`FHIR server returned ${res.status}: ${detail}`, res.status);
  }

  const bundle: FhirBundle<FhirAppointment> = await res.json();
  if (bundle.resourceType !== 'Bundle') {
    throw new FhirError(`Expected Bundle, got ${bundle.resourceType ?? 'unknown'}`);
  }
  const resources = (bundle.entry ?? [])
    .map(e => e.resource)
    .filter((r): r is FhirAppointment => r?.resourceType === 'Appointment' && typeof r.start === 'string');
  return resources;
}

/**
 * Maps a single FHIR Appointment into the shape our createAppointment /
 * upsertAppointmentByExternalId functions expect.
 */
export function mapFhirAppointmentToHaemoCare(
  appt: FhirAppointment,
  sourceName = 'TH Core FHIR'
): AppointmentInput & { source: 'fhir_th_core'; external_id: string } {
  const hospital = pickHospitalLabel(appt);
  const notes = [
    appt.description,
    appt.comment,
    appt.serviceType?.map(s => s.text).filter(Boolean).join(', '),
  ]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .join('\n')
    .trim();
  return {
    scheduled_date: appt.start!,
    hospital,
    notes,
    source: 'fhir_th_core',
    external_id: appt.id,
    external_source_name: sourceName,
  };
}

function pickHospitalLabel(appt: FhirAppointment): string {
  // Prefer a participant whose reference looks like an organization/location.
  const locOrOrg = (appt.participant ?? []).find(p => {
    const ref = p.actor?.reference ?? '';
    return ref.startsWith('Organization/') || ref.startsWith('Location/');
  });
  if (locOrOrg?.actor?.display) return locOrOrg.actor.display;
  // Fallback: first display
  const first = (appt.participant ?? []).find(p => p.actor?.display);
  if (first?.actor?.display) return first.actor.display;
  return '';
}
