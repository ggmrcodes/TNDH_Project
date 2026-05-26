/**
 * Pure, dependency-free logic for notify-new-message, extracted so it can be
 * unit-tested without the Deno runtime / live Supabase. index.ts imports
 * these; the test imports them too. No Deno or network imports here.
 */

export interface LinkParties {
  clinician_id: string;
  patient_user_id: string;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: { type: 'chat'; linkId: string };
  sound: 'default';
}

/**
 * The recipient of a new message is the party that did NOT send it.
 * If the sender is the clinician, notify the patient; otherwise notify
 * the clinician. (A sender_id that matches neither party returns the
 * clinician by default, but that cannot happen for a valid link row.)
 */
export function resolveRecipientId(link: LinkParties, senderId: string): string {
  return senderId === link.clinician_id ? link.patient_user_id : link.clinician_id;
}

/**
 * Build the Expo push payloads for a message. Attachment-only messages
 * (null/empty body) show "📷 Photo". Title is intentionally generic to
 * avoid leaking PHI on a locked-device notification preview.
 */
export function buildExpoMessages(
  tokens: string[],
  body: string | null,
  linkId: string
): ExpoPushMessage[] {
  const text = body && body.trim().length > 0 ? body : '📷 Photo';
  return tokens.map((token) => ({
    to: token,
    title: 'HaemoCare',
    body: text,
    data: { type: 'chat', linkId },
    sound: 'default',
  }));
}
