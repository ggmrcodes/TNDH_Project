/**
 * seed-admin.mjs — create one dedicated admin account for testing.
 *
 *   node --env-file=.env scripts/seed-admin.mjs
 *
 * Optional env (so you can log in with memorable creds instead of generated ones):
 *   SEED_ADMIN_EMAIL     SEED_ADMIN_PASSWORD
 *
 *   e.g.  SEED_ADMIN_EMAIL=admin@test.com SEED_ADMIN_PASSWORD=Admin1234! \
 *         node --env-file=.env scripts/seed-admin.mjs
 *
 * Signs up the auth user. The public.admins table has no INSERT policy by
 * design (no client-side admin self-promotion — bootstrap admin must come
 * from out-of-band SQL, otherwise any signed-in user could escalate). So
 * after the auth user is created the script prints the ONE SQL line you
 * paste into the Supabase dashboard → SQL editor to grant admin status.
 *
 * Uses the public anon key only — no service-role key ever leaves the
 * dashboard. The created auth user can't be deleted from here (remove it
 * via dashboard → Authentication → Users if you want to clean up).
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
if (!URL || !ANON) die('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing. Run with: node --env-file=.env ...');

const ts = Date.now();
const email = process.env.SEED_ADMIN_EMAIL ?? `test-admin-${ts}@example.com`;
const password = process.env.SEED_ADMIN_PASSWORD ?? `Aa1!${randomBytes(9).toString('base64url')}`;

const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await sb.auth.signUp({ email, password });
if (error) die(`signUp failed (${email}): ${error.message}`);

let userId = data.user?.id;
if (!data.session) {
  // autoconfirm off → try sign-in; if that fails, email confirmation is required.
  const { data: si, error: siErr } = await sb.auth.signInWithPassword({ email, password });
  if (siErr || !si?.user) {
    die(`Created the user but no session — the project requires email confirmation. `
      + `Confirm ${email} (or disable "Confirm email"), then paste the admin-grant SQL below.`);
  }
  userId = si.user.id;
}

console.log(`\n✓ Admin auth user created\n`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log(`  user_id:  ${userId}\n`);
console.log(`NEXT — grant admin (out-of-band, by design) by running this ONE line in the SQL editor:\n`);
console.log(`  insert into public.admins (user_id) values ('${userId}')`);
console.log(`    on conflict (user_id) do nothing returning *;\n`);
console.log(`Then sign in to the app with the creds above; AuthContext's is_admin RPC will pick it up`);
console.log(`on next session and route you into AdminScreen automatically.\n`);
