import { Profile } from '../types/database';

interface QRPayload {
  app: 'HaemoCare';
  v: 2;
  pid: string;      // Patient ID (anonymized)
  n?: string;        // Full name (only if share_full_name is true)
  bt: string;
  rh: string;
  ab: string[];
  rx: string;
  med: string;
}

export function encodeProfileForQR(profile: Profile): string {
  const payload: QRPayload = {
    app: 'HaemoCare',
    v: 2,
    pid: profile.patient_id,
    bt: profile.blood_type,
    rh: profile.rh_factor,
    ab: profile.antibodies,
    rx: profile.known_reactions.substring(0, 200),
    med: profile.medications.substring(0, 200),
  };

  // Only include full name if the user has opted in
  if (profile.share_full_name) {
    payload.n = profile.full_name;
  }

  return JSON.stringify(payload);
}

export function decodeProfileFromQR(data: string): Partial<Profile> | null {
  try {
    const payload = JSON.parse(data);
    if (payload.app !== 'HaemoCare') return null;

    const result: Partial<Profile> = {
      blood_type: payload.bt as Profile['blood_type'],
      rh_factor: payload.rh as Profile['rh_factor'],
      antibodies: payload.ab,
      known_reactions: payload.rx,
      medications: payload.med,
    };

    // v2 payloads use patient_id
    if (payload.v === 2) {
      result.patient_id = payload.pid;
      if (payload.n) {
        result.full_name = payload.n;
      }
    }

    // v1 backwards compatibility
    if (payload.v === 1 && payload.n) {
      result.full_name = payload.n;
    }

    return result;
  } catch {
    return null;
  }
}
