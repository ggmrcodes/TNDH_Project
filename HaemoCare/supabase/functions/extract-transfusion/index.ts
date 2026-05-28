/**
 * extract-transfusion — Supabase Edge Function (Deno)
 *
 * Proxies a Gemini 2.0 Flash vision call so the API key stays
 * server-side and never ships in the client bundle. Called from
 * src/services/aiExtraction.ts via:
 *
 *   supabase.functions.invoke('extract-transfusion', {
 *     body: { base64, mimeType },
 *   })
 *
 * Returns: { extracted: ExtractedTransfusion }
 *
 * ─── Deploy ──────────────────────────────────────────────────────────────
 *   supabase functions deploy extract-transfusion
 *
 * ─── Secret ──────────────────────────────────────────────────────────────
 *   supabase secrets set GEMINI_API_KEY=AIza...
 *   (Set in the Supabase dashboard → Project Settings → Edge Functions
 *    → Secrets, or via CLI as above. Anyone with the dashboard can rotate.)
 *
 * ─── Auth ────────────────────────────────────────────────────────────────
 *   verify_jwt: true (default). Callers send their Supabase session JWT;
 *   the standard JS client adds it automatically via .functions.invoke().
 */

// gemini-2.0-flash is no longer available to new users (API returns 404
// NOT_FOUND with "Please update your code to use a newer model"). Bumped
// to 2.5-flash — same Flash tier, identical request/response shape, and
// the responseSchema / systemInstruction features we rely on are
// supported the same way.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = [
  'You are a medical record extraction assistant for HaemoCare, an app for transfusion-dependent patients.',
  'You extract transfusion details from photos of hospital discharge slips, transfusion labels, lab reports, or handwritten clinical notes.',
  'Before extracting, decide whether the image is actually a transfusion-related medical document and set is_transfusion_document accordingly.',
  'Set is_transfusion_document to false for anything unrelated: selfies, photos of people, food, scenery, screenshots of other apps, blank/black images, random objects, generic test cards.',
  'When is_transfusion_document is false, also set confidence to "low" and leave date_iso, hospital, units_received, pre_hb_g_dl, post_hb_g_dl, and reaction_noted as null; put a short reason in unreadable_reason (e.g. "not a medical document — appears to be a selfie").',
  'The source document may be in Thai or English. Extract values verbatim without translating.',
  'Prefer null over guessing. If a value is missing, unclear, or ambiguous, return null for that field.',
  'Respond strictly with JSON matching the requested schema. No prose.',
].join(' ');

// Gemini uses an OpenAPI-3 subset for responseSchema: `nullable: true`
// instead of `type: [..., 'null']`, and a flat `enum` for string unions.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_transfusion_document: {
      type: 'boolean',
      description: 'True only if the image is a transfusion-related medical document (discharge slip, transfusion label, lab report, clinical note). False for selfies, food, scenery, blank images, random objects, screenshots of other apps, or anything not medical.',
    },
    date_iso: {
      type: 'string',
      nullable: true,
      description: 'Transfusion date in ISO 8601 (YYYY-MM-DD or full timestamp). Null if illegible / not present.',
    },
    hospital: {
      type: 'string',
      nullable: true,
      description: 'Hospital or clinic name exactly as written (Thai or English). Null if not shown.',
    },
    units_received: {
      type: 'number',
      nullable: true,
      description: 'Number of red blood cell units transfused. Null if not shown.',
    },
    pre_hb_g_dl: {
      type: 'number',
      nullable: true,
      description: 'Pre-transfusion hemoglobin in g/dL. Null if not shown.',
    },
    post_hb_g_dl: {
      type: 'number',
      nullable: true,
      description: 'Post-transfusion hemoglobin in g/dL. Null if not shown.',
    },
    reaction_noted: {
      type: 'boolean',
      nullable: true,
      description: 'True if any transfusion reaction is documented; false if the document explicitly states no reaction; null if not addressed.',
    },
    reaction_detail: {
      type: 'string',
      description: 'Free-text description of any noted reaction. Empty string if none.',
    },
    notes: {
      type: 'string',
      description: 'Any other clinically relevant notes (e.g. rate, premedication, follow-up). Empty string if none.',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'Overall extraction confidence. Use low if legibility is poor or critical fields are missing.',
    },
    unreadable_reason: {
      type: 'string',
      description: 'If confidence is low, one short sentence explaining what could not be read. Empty if confidence is medium or high.',
    },
  },
  required: ['is_transfusion_document', 'confidence', 'reaction_detail', 'notes', 'unreadable_reason'],
} as const;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = typeof ALLOWED_MIME[number];

interface ExtractedTransfusion {
  // True if the image is a transfusion-related medical document; false
  // for selfies, food, scenery, blank images, etc. Defaults to true on
  // older responses missing this field, so any non-explicit false from
  // Gemini still routes to the review screen unchanged.
  is_transfusion_document: boolean;
  date_iso: string | null;
  hospital: string | null;
  units_received: number | null;
  pre_hb_g_dl: number | null;
  post_hb_g_dl: number | null;
  reaction_noted: boolean | null;
  reaction_detail: string;
  notes: string;
  confidence: 'high' | 'medium' | 'low';
  unreadable_reason: string;
}

function normalize(raw: any): ExtractedTransfusion {
  return {
    is_transfusion_document:
      typeof raw?.is_transfusion_document === 'boolean' ? raw.is_transfusion_document : true,
    date_iso: typeof raw?.date_iso === 'string' ? raw.date_iso : null,
    hospital: typeof raw?.hospital === 'string' ? raw.hospital : null,
    units_received: typeof raw?.units_received === 'number' ? raw.units_received : null,
    pre_hb_g_dl: typeof raw?.pre_hb_g_dl === 'number' ? raw.pre_hb_g_dl : null,
    post_hb_g_dl: typeof raw?.post_hb_g_dl === 'number' ? raw.post_hb_g_dl : null,
    reaction_noted: typeof raw?.reaction_noted === 'boolean' ? raw.reaction_noted : null,
    reaction_detail: typeof raw?.reaction_detail === 'string' ? raw.reaction_detail : '',
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    confidence: (['high', 'medium', 'low'] as const).includes(raw?.confidence)
      ? raw.confidence
      : 'low',
    unreadable_reason: typeof raw?.unreadable_reason === 'string' ? raw.unreadable_reason : '',
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log('extract-transfusion: invoked', req.method);

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('extract-transfusion: GEMINI_API_KEY not set');
    return jsonResponse(
      { error: 'GEMINI_API_KEY not set on the Edge Function. Run: supabase secrets set GEMINI_API_KEY=...' },
      500,
    );
  }

  let payload: { base64?: unknown; mimeType?: unknown };
  try {
    payload = await req.json();
  } catch (e) {
    console.error('extract-transfusion: invalid JSON body', (e as Error).message);
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const base64 = typeof payload?.base64 === 'string' ? payload.base64 : '';
  if (!base64) {
    console.error('extract-transfusion: missing base64 field, payload keys:', Object.keys(payload ?? {}));
    return jsonResponse({ error: 'Missing or empty "base64" field' }, 400);
  }
  const mimeRaw = typeof payload?.mimeType === 'string' ? payload.mimeType : 'image/jpeg';
  const mime: AllowedMime = (ALLOWED_MIME as readonly string[]).includes(mimeRaw)
    ? (mimeRaw as AllowedMime)
    : 'image/jpeg';
  console.log('extract-transfusion: payload ok', { base64Length: base64.length, mime });

  const geminiBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: 'Extract the transfusion details from this document.' },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
      maxOutputTokens: 1024,
    },
  };

  console.log('extract-transfusion: calling Gemini');
  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (e) {
    console.error('extract-transfusion: fetch to Gemini threw', (e as Error).message);
    return jsonResponse({ error: `Network error contacting Gemini: ${(e as Error).message}` }, 502);
  }
  console.log('extract-transfusion: Gemini responded', res.status);

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 500); } catch { /* ignore */ }
    console.error('extract-transfusion: Gemini error', res.status, detail);
    return jsonResponse(
      { error: `Gemini API returned ${res.status}`, detail },
      res.status >= 500 ? 502 : res.status,
    );
  }

  const json = await res.json().catch(() => null) as any;
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text) {
    console.error('extract-transfusion: Gemini returned no text content', JSON.stringify(json).slice(0, 300));
    return jsonResponse({ error: 'Gemini returned no text content', raw: json }, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('extract-transfusion: Gemini returned non-JSON', text.slice(0, 300));
    return jsonResponse({ error: 'Gemini returned non-JSON content', text: text.slice(0, 300) }, 502);
  }

  const extracted = normalize(parsed);
  console.log('extract-transfusion: returning extracted, confidence=', extracted.confidence);
  return jsonResponse({ extracted }, 200);
});
