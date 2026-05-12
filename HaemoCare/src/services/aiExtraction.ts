// AI extraction service — Claude Sonnet 4.6 Vision
// --------------------------------------------------------------------------
// Production note: this currently calls the Anthropic API directly from the
// client with EXPO_PUBLIC_ANTHROPIC_API_KEY, which bundles the key into the
// app. That is acceptable for a hackathon demo only. For production, move
// this fetch call into a Supabase Edge Function and call THAT function
// from the client — keep this file's external shape (extractTransfusionFromImage)
// unchanged so the swap is a single line.
// --------------------------------------------------------------------------

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractedTransfusion {
  date_iso: string | null;
  hospital: string | null;
  units_received: number | null;
  pre_hb_g_dl: number | null;
  post_hb_g_dl: number | null;
  reaction_noted: boolean | null;
  reaction_detail: string;
  notes: string;
  confidence: ExtractionConfidence;
  unreadable_reason: string;
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const TOOL = {
  name: 'record_transfusion',
  description: 'Record extracted transfusion details from a medical document photo.',
  input_schema: {
    type: 'object',
    properties: {
      date_iso: {
        type: ['string', 'null'],
        description:
          'Date of the transfusion in ISO 8601 format (YYYY-MM-DD or full timestamp). Null if illegible or not present.',
      },
      hospital: {
        type: ['string', 'null'],
        description: 'Hospital or clinic name exactly as written (Thai or English). Null if not shown.',
      },
      units_received: {
        type: ['number', 'null'],
        description: 'Number of red blood cell units transfused. Null if not shown.',
      },
      pre_hb_g_dl: {
        type: ['number', 'null'],
        description:
          'Pre-transfusion hemoglobin in grams per deciliter (g/dL). Null if not shown.',
      },
      post_hb_g_dl: {
        type: ['number', 'null'],
        description: 'Post-transfusion hemoglobin in g/dL. Null if not shown.',
      },
      reaction_noted: {
        type: ['boolean', 'null'],
        description:
          'True if any transfusion reaction is documented; false if the document explicitly states no reaction; null if not addressed.',
      },
      reaction_detail: {
        type: 'string',
        description: 'Free-text description of any noted reaction. Empty string if none.',
      },
      notes: {
        type: 'string',
        description:
          'Any other clinically relevant notes from the document (e.g. rate, premedication, follow-up). Empty string if none.',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description:
          'Overall extraction confidence. Use low if legibility is poor or critical fields are missing.',
      },
      unreadable_reason: {
        type: 'string',
        description:
          'If confidence is low, one short sentence explaining what could not be read (e.g. "Hb values blurry", "date cropped"). Empty if confidence is medium or high.',
      },
    },
    required: ['confidence', 'reaction_detail', 'notes', 'unreadable_reason'],
  },
} as const;

const SYSTEM_PROMPT = [
  'You are a medical record extraction assistant for HaemoCare, an app for transfusion-dependent patients.',
  'You extract transfusion details from photos of hospital discharge slips, transfusion labels, lab reports, or handwritten clinical notes.',
  'The source document may be in Thai or English. Extract values verbatim without translating.',
  'Prefer null over guessing. If a value is missing, unclear, or ambiguous, return null for that field.',
  'Only call the record_transfusion tool. Do not reply with prose.',
].join(' ');

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'Set EXPO_PUBLIC_ANTHROPIC_API_KEY in .env (see .env.example) and restart the dev server.'
    );
    this.name = 'MissingApiKeyError';
  }
}

export class ExtractionError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export async function extractTransfusionFromImage(
  base64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
): Promise<ExtractedTransfusion> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_transfusion' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: 'Extract the transfusion details from this document.',
          },
        ],
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ExtractionError('Network error contacting extraction service.');
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    throw new ExtractionError(`Extraction service returned ${res.status}: ${detail}`, res.status);
  }

  const json = await res.json();
  const toolUse = Array.isArray(json.content)
    ? json.content.find((b: any) => b.type === 'tool_use' && b.name === TOOL.name)
    : null;
  if (!toolUse || !toolUse.input) {
    throw new ExtractionError('Model did not call record_transfusion tool.');
  }

  return normalize(toolUse.input);
}

function normalize(raw: any): ExtractedTransfusion {
  const clean: ExtractedTransfusion = {
    date_iso: typeof raw.date_iso === 'string' ? raw.date_iso : null,
    hospital: typeof raw.hospital === 'string' ? raw.hospital : null,
    units_received: typeof raw.units_received === 'number' ? raw.units_received : null,
    pre_hb_g_dl: typeof raw.pre_hb_g_dl === 'number' ? raw.pre_hb_g_dl : null,
    post_hb_g_dl: typeof raw.post_hb_g_dl === 'number' ? raw.post_hb_g_dl : null,
    reaction_noted: typeof raw.reaction_noted === 'boolean' ? raw.reaction_noted : null,
    reaction_detail: typeof raw.reaction_detail === 'string' ? raw.reaction_detail : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    confidence: (['high', 'medium', 'low'] as const).includes(raw.confidence)
      ? raw.confidence
      : 'low',
    unreadable_reason: typeof raw.unreadable_reason === 'string' ? raw.unreadable_reason : '',
  };
  return clean;
}
