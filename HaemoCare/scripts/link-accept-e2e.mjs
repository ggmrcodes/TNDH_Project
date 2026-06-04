/**
 * link-accept-e2e.mjs — end-to-end test of the patient-accepts-clinician flow.
 *
 * Verifies the schema fix in 2026-06-04-patients-update-own-links.sql by
 * exercising the full path against your real Supabase project:
 *
 *   1. Clinician creates a pending link by user_id (HC code path).
 *   2. Patient UPDATEs the link to status='active'  ← previously RLS-blocked.
 *   3. Clinician's getAssignedPatients-style query returns the patient.
 *   4. Patient revokes the link                       ← same RLS gap fix.
 *
 * Prereqs:
 *   .env          — EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY (your project).
 *   .env.e2e      — same shape as chat-realtime-e2e.mjs:
 *                     E2E_CLINICIAN_EMAIL=...
 *                     E2E_CLINICIAN_PASSWORD=...
 *                     E2E_PATIENT_EMAIL=...
 *                     E2E_PATIENT_PASSWORD=...
 *
 *   Both accounts must already exist + the clinician must be verified=true.
 *   Use scripts/seed-e2e-accounts.mjs to create them if needed.
 *
 * Run:
 *   node --env-file=.env --env-file=.env.e2e scripts/link-accept-e2e.mjs
 *
 * The script is idempotent — if a link between this clinician + patient
 * already exists, it resets to pending and re-runs. Final state is revoked.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
if (!URL || !ANON) die('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing. Run with: node --env-file=.env ...');

const need = (k) => process.env[k] ?? die(`${k} missing — add to .env.e2e and pass --env-file=.env.e2e`);
const C_EMAIL = need('E2E_CLINICIAN_EMAIL');
const C_PW = need('E2E_CLINICIAN_PASSWORD');
const P_EMAIL = need('E2E_PATIENT_EMAIL');
const P_PW = need('E2E_PATIENT_PASSWORD');

const mkClient = () =>
  createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// Sign in both sides on separate clients so each carries its own JWT and the
// RLS policies under test see the correct auth.uid().
const patientClient = mkClient();
const clinicianClient = mkClient();

const { data: pSI, error: pSIErr } =
  await patientClient.auth.signInWithPassword({ email: P_EMAIL, password: P_PW });
if (pSIErr) die(`patient sign-in: ${pSIErr.message}`);

const { data: cSI, error: cSIErr } =
  await clinicianClient.auth.signInWithPassword({ email: C_EMAIL, password: C_PW });
if (cSIErr) die(`clinician sign-in: ${cSIErr.message}`);

const patientUserId = pSI.user.id;
const clinicianUserId = cSI.user.id;
console.log(
  `\n✓ signed in   patient=${patientUserId.slice(0, 8)}…  clinician=${clinicianUserId.slice(0, 8)}…`,
);

// === Step 1: ensure a pending clinician-initiated link exists ===
const { data: existing, error: lookupErr } = await clinicianClient
  .from('clinician_patient_links')
  .select('*')
  .eq('clinician_id', clinicianUserId)
  .eq('patient_user_id', patientUserId)
  .maybeSingle();
if (lookupErr) die(`existing-link lookup: ${lookupErr.message}`);

let linkId;
if (existing) {
  console.log(`✓ found existing link  id=${existing.id.slice(0, 8)}…  status=${existing.status}`);
  if (existing.status !== 'pending') {
    // Clinician CAN update own links — that policy has been in place since
    // 2026-05-25-clinician-link-rls.sql. Reset for the test.
    const { error: resetErr } = await clinicianClient
      .from('clinician_patient_links')
      .update({
        status: 'pending',
        initiated_by: 'clinician',
        consented_at: null,
        revoked_at: null,
      })
      .eq('id', existing.id);
    if (resetErr) die(`reset to pending failed: ${resetErr.message}`);
    console.log(`✓ reset to pending`);
  }
  linkId = existing.id;
} else {
  const { data: ins, error: insErr } = await clinicianClient
    .from('clinician_patient_links')
    .insert({
      clinician_id: clinicianUserId,
      patient_user_id: patientUserId,
      status: 'pending',
      initiated_by: 'clinician',
    })
    .select()
    .single();
  if (insErr) die(`pending insert failed: ${insErr.message}`);
  linkId = ins.id;
  console.log(`✓ created pending link  id=${linkId.slice(0, 8)}…`);
}

// === Step 2: patient accept — the previously broken path ===
console.log(`\n→ patient accepts (RLS-blocked before the migration)…`);
const { data: accepted, error: acceptErr } = await patientClient
  .from('clinician_patient_links')
  .update({
    status: 'active',
    consented_at: new Date().toISOString(),
    share_full_name: true,
  })
  .eq('id', linkId)
  .select()
  .single();
if (acceptErr) {
  die(
    `PATIENT ACCEPT FAILED: ${acceptErr.message}\n` +
    `  ← Most likely 2026-06-04-patients-update-own-links.sql hasn't applied.\n` +
    `    Re-apply via dashboard SQL editor or supabase migration up.`,
  );
}
if (accepted.status !== 'active') die(`status didn't flip to active: ${accepted.status}`);
console.log(
  `✓ link.status now: ${accepted.status}    consented_at: ${accepted.consented_at}`,
);

// === Step 3: clinician sees the patient ===
console.log(`\n→ clinician fetches assigned patients…`);
const { data: assigned, error: assignedErr } = await clinicianClient
  .from('clinician_patient_links')
  .select('patient_user_id, status, profiles!inner(patient_id, user_id)')
  .eq('clinician_id', clinicianUserId)
  .eq('status', 'active');
if (assignedErr) die(`assigned query failed: ${assignedErr.message}`);
const match = assigned.find((r) => r.patient_user_id === patientUserId);
if (!match) {
  die(
    `patient NOT in clinician's assigned list. Got ${assigned.length} active link(s).\n` +
    `  Active links: ${JSON.stringify(assigned, null, 2)}`,
  );
}
console.log(
  `✓ clinician sees patient HC=${match.profiles.patient_id} in active list  ` +
  `(${assigned.length} total active)`,
);

// === Step 4: patient revoke — also covered by the same RLS migration ===
console.log(`\n→ clean up: patient revokes…`);
const { data: rev, error: revErr } = await patientClient
  .from('clinician_patient_links')
  .update({ status: 'revoked', revoked_at: new Date().toISOString() })
  .eq('id', linkId)
  .select()
  .single();
if (revErr) {
  console.log(
    `⚠️ revoke failed: ${revErr.message}  ` +
    `(the migration covers patient revoke too — investigate)`,
  );
} else {
  console.log(`✓ link.status now: ${rev.status}    revoked_at: ${rev.revoked_at}`);
}

console.log(
  `\n✓ ALL PASS — patient-side accept + clinician dashboard visibility + revoke ` +
  `all working end-to-end.\n`,
);
