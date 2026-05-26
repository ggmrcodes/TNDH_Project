/**
 * notify-new-message — Supabase Edge Function (Deno)
 *
 * Triggered by a Database Webhook on `messages` INSERT.
 * Resolves the recipient from clinician_patient_links, loads their
 * push_tokens, and delivers via the Expo Push API.
 *
 * ─── Deploy ────────────────────────────────────────────────────────────────
 *   supabase functions deploy notify-new-message
 *
 * ─── Database Webhook ───────────────────────────────────────────────────────
 *   In the Supabase dashboard → Database → Webhooks → Create a new webhook:
 *     Table:  public.messages
 *     Events: INSERT
 *     Type:   Supabase Edge Function
 *     Target: notify-new-message
 *
 * ─── Env vars ────────────────────────────────────────────────────────────────
 *   SUPABASE_URL             — auto-injected by the Edge runtime
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by the Edge runtime
 *   (No Expo Push secret needed; the Expo Push API is open for Expo-managed
 *   projects using the standard endpoint.)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface MessageRecord {
  id: string;
  link_id: string;
  sender_id: string;
  body: string | null;
  attachment_type: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: MessageRecord;
}

interface PushToken {
  token: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    // Only accept POST from the Supabase webhook dispatcher.
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const payload: WebhookPayload = await req.json();

    // Safeguard: only handle INSERT on messages.
    if (payload.type !== 'INSERT' || payload.table !== 'messages') {
      return new Response('ignored', { status: 200 });
    }

    const record = payload.record;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use service-role client so we can read across RLS boundaries.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Load the link to determine both parties.
    const { data: link, error: linkErr } = await adminClient
      .from('clinician_patient_links')
      .select('clinician_id, patient_user_id')
      .eq('id', record.link_id)
      .single();

    if (linkErr || !link) {
      console.error('notify-new-message: link lookup failed', linkErr);
      return new Response('link not found', { status: 200 }); // 200 so webhook doesn't retry forever
    }

    // 2. Recipient = the party that is NOT the sender.
    const { clinician_id, patient_user_id } = link as {
      clinician_id: string;
      patient_user_id: string;
    };
    const recipientId =
      record.sender_id === clinician_id ? patient_user_id : clinician_id;

    // 3. Load recipient's push tokens.
    const { data: tokens, error: tokensErr } = await adminClient
      .from('push_tokens')
      .select('token')
      .eq('user_id', recipientId);

    if (tokensErr || !tokens || tokens.length === 0) {
      // No tokens registered — in-app realtime will deliver when they open.
      return new Response('no tokens', { status: 200 });
    }

    // 4. Build the notification body.
    const messageBody: string = record.body ?? '📷 Photo';
    // Title is intentionally generic (no patient/clinician name here to avoid
    // leaking PHI in the notification center on a shared/unlocked device).
    const title = 'HaemoCare';

    // 5. POST to the Expo Push API.
    const expoPushMessages = (tokens as PushToken[]).map(({ token }) => ({
      to: token,
      title,
      body: messageBody,
      data: { type: 'chat', linkId: record.link_id },
      sound: 'default',
    }));

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPushMessages),
    });

    if (!expoResponse.ok) {
      const errText = await expoResponse.text();
      console.error('notify-new-message: Expo Push API error', expoResponse.status, errText);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('notify-new-message: unhandled error', err);
    // Return 200 to prevent the Supabase webhook from retrying on a bug.
    return new Response('error', { status: 200 });
  }
});
