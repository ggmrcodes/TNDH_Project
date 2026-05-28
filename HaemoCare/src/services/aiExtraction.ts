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
    // supabase-js v2 FunctionsHttpError exposes the raw Response on
    // `.context`. Read its body so the on-device error message shows the
    // real server-side cause (e.g. "GEMINI_API_KEY not set", or a Gemini
    // 4xx body) instead of the generic "non-2xx status code".
    const ctx = (error as any)?.context;
    const status: number | undefined = ctx?.status;
    let detail = '';
    if (ctx && typeof ctx.text === 'function') {
      try { detail = (await ctx.text()).slice(0, 300); } catch { /* body already consumed */ }
    }
    const base = error.message || 'Extraction service error';
    const message = detail
      ? `${base}${status ? ` (HTTP ${status})` : ''}: ${detail}`
      : `${base}${status ? ` (HTTP ${status})` : ''}`;
    throw new ExtractionError(message, status);
  }
  if (!data?.extracted) {
    throw new ExtractionError('Extraction service returned no data.');
  }
  return data.extracted;
}
