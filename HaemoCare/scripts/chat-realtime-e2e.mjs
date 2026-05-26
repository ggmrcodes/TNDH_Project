/**
 * chat-realtime-e2e.mjs — REAL end-to-end test for the in-app chat (Phases 2 & 3).
 *
 * Exercises the LIVE Supabase project the way two browser sessions would:
 *   1. Realtime broadcast  — clinician inserts a message; patient's private
 *      `thread:<linkId>` channel must receive the INSERT broadcast live.
 *   2. RLS read-back       — patient can SELECT the just-sent message.
 *   3. Attachment round-trip — patient uploads to `<linkId>/...`; clinician
 *      resolves a signed URL and fetches the bytes; cleanup.
 *   4. RLS deny (optional)  — a stranger (non-party) is denied both the
 *      message SELECT and the thread broadcast. Runs only if stranger creds given.
 *
 * Mirrors the production client code exactly:
 *   - realtime: supabase.realtime.setAuth() + .channel('thread:'+id,{config:{private:true}})
 *               .on('broadcast',{event:'INSERT'},cb).subscribe()   (src/hooks/useThread.ts)
 *   - send:     supabase.from('messages').insert({link_id,sender_id,body})  (chatService.sendMessage)
 *   - upload:   storage.from('chat-attachments').upload(`${linkId}/${stamp}.jpg`, ...) (chatService)
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   The Supabase URL + anon key are PUBLIC (shipped in the web bundle / APK).
 *   They are read from the project's .env via node's --env-file; the service_role
 *   key is never read or needed.
 *
 *     node --env-file=.env \
 *       --env-file=.env.e2e \      # holds the E2E_* test inputs below
 *       scripts/chat-realtime-e2e.mjs
 *
 *   Required env (test inputs — two real accounts with an ACTIVE link between them):
 *     E2E_PATIENT_EMAIL     E2E_PATIENT_PASSWORD
 *     E2E_CLINICIAN_EMAIL   E2E_CLINICIAN_PASSWORD
 *   Optional:
 *     E2E_LINK_ID           (the clinician_patient_links.id, status='active').
 *                           If omitted, the active link between the two accounts
 *                           is auto-discovered after sign-in.
 *   Optional (enables the RLS-deny test):
 *     E2E_STRANGER_EMAIL    E2E_STRANGER_PASSWORD   (any other authed user)
 *
 *   Exit code 0 = all run tests passed; 1 = a failure or misconfiguration.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// ── env / config ──────────────────────────────────────────────────────────────
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const {
  E2E_PATIENT_EMAIL, E2E_PATIENT_PASSWORD,
  E2E_CLINICIAN_EMAIL, E2E_CLINICIAN_PASSWORD,
  E2E_STRANGER_EMAIL, E2E_STRANGER_PASSWORD,
} = process.env;
let E2E_LINK_ID = process.env.E2E_LINK_ID; // optional — auto-discovered if absent

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

if (!URL || !ANON) die('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing. Run with: node --env-file=.env ...');
for (const [k, v] of Object.entries({
  E2E_PATIENT_EMAIL, E2E_PATIENT_PASSWORD,
  E2E_CLINICIAN_EMAIL, E2E_CLINICIAN_PASSWORD,
})) if (!v) die(`Missing test input ${k}. See the header of this file for the required E2E_* vars.`);

const RUN_DENY = !!(E2E_STRANGER_EMAIL && E2E_STRANGER_PASSWORD);

// Each "session" is its own client with its own auth + realtime socket, so they
// don't clobber each other (persistSession:false → no shared storage).
function makeClient() {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.user) die(`Sign-in failed for ${label} (${email}): ${error?.message ?? 'no user'}`);
  return data.user.id;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\nChat realtime/attachment E2E → ${URL}\n`);

  const patient = makeClient();
  const clinician = makeClient();
  const patientId = await signIn(patient, E2E_PATIENT_EMAIL, E2E_PATIENT_PASSWORD, 'patient');
  const clinicianId = await signIn(clinician, E2E_CLINICIAN_EMAIL, E2E_CLINICIAN_PASSWORD, 'clinician');
  console.log(`  signed in: patient=${patientId.slice(0, 8)}… clinician=${clinicianId.slice(0, 8)}…`);

  // Auto-discover the active link between these two accounts if not pinned.
  if (!E2E_LINK_ID) {
    const { data: found, error: findErr } = await patient
      .from('clinician_patient_links')
      .select('id')
      .eq('patient_user_id', patientId)
      .eq('clinician_id', clinicianId)
      .eq('status', 'active');
    if (findErr) die(`Could not auto-discover link: ${findErr.message}`);
    if (!found || found.length === 0)
      die(`No active link between these two accounts. Set E2E_LINK_ID, or create/approve the link first.`);
    if (found.length > 1) die(`Multiple active links found (${found.length}); set E2E_LINK_ID explicitly.`);
    E2E_LINK_ID = found[0].id;
    console.log(`  auto-discovered active link: ${E2E_LINK_ID.slice(0, 8)}…`);
  }

  // Sanity: the link exists, is active, and both are parties (patient can read it).
  const { data: link, error: linkErr } = await patient
    .from('clinician_patient_links')
    .select('id, clinician_id, patient_user_id, status')
    .eq('id', E2E_LINK_ID).single();
  if (linkErr || !link) die(`Patient cannot read link ${E2E_LINK_ID}: ${linkErr?.message ?? 'not found'}`);
  if (link.status !== 'active') die(`Link ${E2E_LINK_ID} status is '${link.status}', expected 'active'.`);
  if (link.patient_user_id !== patientId || link.clinician_id !== clinicianId)
    die(`Link parties don't match the signed-in accounts (link patient=${link.patient_user_id}, clinician=${link.clinician_id}).`);
  console.log(`  link ${E2E_LINK_ID.slice(0, 8)}… is active and well-formed\n`);

  const marker = `e2e-${Date.now()}`;

  // ── TEST 1 — realtime broadcast (the crown jewel) ────────────────────────────
  // Patient subscribes to the private thread channel; clinician inserts; patient
  // must receive the INSERT broadcast live (no manual refetch).
  await patient.realtime.setAuth();
  let received = null;
  const sentAtRef = {};
  const gotBroadcast = new Promise((resolve) => {
    const ch = patient
      .channel('thread:' + E2E_LINK_ID, { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, (payload) => {
        received = payload;
        resolve(true);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(false);
      });
    // expose for cleanup
    sentAtRef.channel = ch;
  });

  // Wait for the channel to actually be SUBSCRIBED before inserting, else the
  // broadcast can fire before the listener is attached.
  await sleep(2500);

  const t0 = Date.now();
  const { error: insErr } = await clinician
    .from('messages')
    .insert({ link_id: E2E_LINK_ID, sender_id: clinicianId, body: marker })
    .select().single();
  if (insErr) die(`Clinician message insert failed: ${insErr.message}`);

  const delivered = await Promise.race([gotBroadcast, sleep(8000).then(() => false)]);
  const latency = Date.now() - t0;
  record(
    'Realtime: patient receives clinician INSERT live',
    delivered === true && received !== null,
    delivered === true ? `~${latency}ms` : 'no broadcast within 8s (check migration 2: trigger + realtime.messages RLS)'
  );

  // ── TEST 2 — RLS read-back ───────────────────────────────────────────────────
  const { data: msgs, error: readErr } = await patient
    .from('messages').select('body, sender_id').eq('link_id', E2E_LINK_ID)
    .order('created_at', { ascending: true });
  record(
    'RLS: patient can read the message back',
    !readErr && Array.isArray(msgs) && msgs.some((m) => m.body === marker),
    readErr ? readErr.message : `${msgs?.length ?? 0} msgs in thread`
  );

  // ── TEST 3 — attachment round-trip ───────────────────────────────────────────
  const BUCKET = 'chat-attachments';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${E2E_LINK_ID}/${stamp}.jpg`;
  // Minimal JPEG header + filler; storage doesn't validate image content.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, ...new Array(64).fill(0x20)]);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const { error: upErr } = await patient.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    record('Attachment: patient upload', false, upErr.message);
  } else {
    record('Attachment: patient upload', true, path.split('/')[1]);
    const { data: signed } = await clinician.storage.from(BUCKET).createSignedUrl(path, 60);
    let fetched = false, len = 0;
    if (signed?.signedUrl) {
      const resp = await fetch(signed.signedUrl);
      fetched = resp.ok;
      len = (await resp.arrayBuffer()).byteLength;
    }
    record('Attachment: clinician resolves signed URL + fetches bytes', fetched && len === bytes.length, fetched ? `${len} bytes` : 'fetch failed');
    // cleanup
    await patient.storage.from(BUCKET).remove([path]);
  }

  // ── TEST 4 — RLS deny (optional) ─────────────────────────────────────────────
  if (RUN_DENY) {
    const stranger = makeClient();
    await signIn(stranger, E2E_STRANGER_EMAIL, E2E_STRANGER_PASSWORD, 'stranger');
    const { data: sneak } = await stranger
      .from('messages').select('body').eq('link_id', E2E_LINK_ID);
    record('RLS deny: stranger cannot read the thread', !sneak || sneak.length === 0, `saw ${sneak?.length ?? 0} rows (want 0)`);

    await stranger.realtime.setAuth();
    let leaked = false;
    const ch = stranger
      .channel('thread:' + E2E_LINK_ID, { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, () => { leaked = true; })
      .subscribe();
    await sleep(2500);
    await clinician.from('messages').insert({ link_id: E2E_LINK_ID, sender_id: clinicianId, body: `${marker}-deny` }).select().single();
    await sleep(3000);
    record('RLS deny: stranger receives no broadcast', !leaked, leaked ? 'LEAK — stranger got a broadcast' : 'denied');
    await stranger.removeChannel(ch);
  }

  // ── teardown ─────────────────────────────────────────────────────────────────
  if (sentAtRef.channel) await patient.removeChannel(sentAtRef.channel);
  patient.realtime.disconnect();
  clinician.realtime.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? '✓ ALL PASSED' : `✗ ${failed.length} FAILED`} (${results.length} tests${RUN_DENY ? '' : ', RLS-deny skipped — set E2E_STRANGER_* to enable'})\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => die(`Unhandled: ${e?.message ?? e}`));
