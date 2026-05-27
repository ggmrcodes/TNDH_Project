/**
 * seed-clinician.mjs — create one throwaway clinician account for testing.
 *
 *   node --env-file=.env scripts/seed-clinician.mjs
 *
 * Optional env (so you can log in with memorable creds instead of generated ones):
 *   SEED_CLIN_EMAIL     SEED_CLIN_PASSWORD     SEED_CLIN_NAME     SEED_CLIN_HOSPITAL
 *
 *   e.g.  SEED_CLIN_EMAIL=doc@test.com SEED_CLIN_PASSWORD=Test1234! \
 *         node --env-file=.env scripts/seed-clinician.mjs
 *
 * Signs up the auth user + inserts the clinician_profiles row (verified=false).
 * Prints the login creds + the ONE admin SQL line to verify it (verification is
 * admin-gated, so that step is yours). Uses the public anon key only — the
 * created auth user can't be deleted from here (remove it in the dashboard).
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
if (!URL || !ANON) die('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing. Run with: node --env-file=.env ...');

const ts = Date.now();
const email = process.env.SEED_CLIN_EMAIL ?? `test-clinician-${ts}@example.com`;
const password = process.env.SEED_CLIN_PASSWORD ?? `Aa1!${randomBytes(9).toString('base64url')}`;
const fullName = process.env.SEED_CLIN_NAME ?? 'Dr. Test Clinician';
const hospital = process.env.SEED_CLIN_HOSPITAL ?? 'Test Hospital';

const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await sb.auth.signUp({ email, password });
if (error) die(`signUp failed (${email}): ${error.message}`);

let userId = data.user?.id;
if (!data.session) {
  // autoconfirm off → try sign-in; if that fails, email confirmation is required.
  const { data: si, error: siErr } = await sb.auth.signInWithPassword({ email, password });
  if (siErr || !si?.user) {
    die(`Created the user but no session — the project requires email confirmation. `
      + `Confirm ${email} (or disable "Confirm email"), then this clinician_profiles insert can run.`);
  }
  userId = si.user.id;
}

const { error: cpErr } = await sb.from('clinician_profiles').insert({
  user_id: userId,
  full_name: fullName,
  license_number: `TEST-${ts}`,
  hospital_affiliation: hospital,
  verified: false,
});
if (cpErr) die(`clinician_profiles insert failed: ${cpErr.message}`);

console.log(`\n✓ Clinician account created\n`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log(`  user_id:  ${userId}`);
console.log(`  name:     ${fullName}   hospital: ${hospital}   [verified=false]\n`);
console.log(`NEXT — verify it (admin-gated) by running this ONE line in the SQL editor:\n`);
console.log(`  update public.clinician_profiles set verified = true, verified_at = now()`);
console.log(`    where user_id = '${userId}';\n`);
console.log(`(To make it discoverable in patients' "Find my doctor", also set hospital_id to a row from public.hospitals.)\n`);
