// AI extraction service — Gemini 2.0 Flash (via Supabase Edge Function)
// --------------------------------------------------------------------------
// The actual model call happens server-side in the `extract-transfusion`
// Edge Function (supabase/functions/extract-transfusion/), which holds the
// GEMINI_API_KEY in Supabase Secrets. This file is a thin client that
// forwards the photo + mime type and returns the typed result, so callers
// (ScanTransfusionScreen) don't change when we swap providers or models.
//
// Deploy: supabase functions deploy extract-transfusion
// Secret: supabase secrets set GEMINI_API_KEY=AIza...
// --------------------------------------------------------------------------

import { supabase } from '../config/supabase';

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

export class FeatureDisabledError extends Error {
  constructor() {
    super('Photo extraction is disabled in this build.');
    this.name = 'FeatureDisabledError';
  }
}

export class ExtractionError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// Kill-switch for local dev — defaults to enabled now that the API key
// is server-side. Set EXPO_PUBLIC_AI_EXTRACTION_ENABLED=false in .env to
// disable client calls (e.g. to avoid burning Gemini quota during demos).
const AI_EXTRACTION_ENABLED =
  process.env.EXPO_PUBLIC_AI_EXTRACTION_ENABLED !== 'false';

export function isAiExtractionEnabled(): boolean {
  return AI_EXTRACTION_ENABLED;
}

export async function extractTransfusionFromImage(
  base64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
): Promise<ExtractedTransfusion> {
  if (!AI_EXTRACTION_ENABLED) throw new FeatureDisabledError();

  const { data, error } = await supabase.functions.invoke<{ extracted: ExtractedTransfusion }>(
    'extract-transfusion',
    { body: { base64, mimeType } },
  );

  if (error) {
    // FunctionsHttpError carries .context.status on supabase-js v2; fall
    // back to plain message otherwise so the caller's UI shows something.
    const status = (error as any)?.context?.status;
    throw new ExtractionError(error.message || 'Extraction service error', status);
  }
  if (!data?.extracted) {
    throw new ExtractionError('Extraction service returned no data.');
  }
  return data.extracted;
}
