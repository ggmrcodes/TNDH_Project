import { Outcome, UrineColor } from '../types/database';

export interface SymptomDefinition {
  key: string;
  labelKey: string;
  icon: string; // Feather icon name
}

// `dark_urine` is intentionally NOT in the picker for new entries — it is
// replaced by the structured `urine_color` field below (see brief
// 2026-05-17-urine-color-logging-brief.md). Legacy logs that recorded
// `dark_urine` continue to evaluate via the deprecated rule in
// `evaluateSymptoms()` so historical outcomes remain stable.
export const SYMPTOM_CATALOG: SymptomDefinition[] = [
  { key: 'fever', labelKey: 'symptom.fever', icon: 'thermometer' },
  { key: 'chills', labelKey: 'symptom.chills', icon: 'wind' },
  { key: 'fatigue', labelKey: 'symptom.fatigue', icon: 'battery' },
  { key: 'jaundice', labelKey: 'symptom.jaundice', icon: 'eye' },
  { key: 'back_pain', labelKey: 'symptom.back_pain', icon: 'trending-up' },
  { key: 'shortness_of_breath', labelKey: 'symptom.shortness_of_breath', icon: 'wind' },
  { key: 'skin_rash', labelKey: 'symptom.skin_rash', icon: 'grid' },
];

export const SYMPTOM_ICON_MAP: Record<string, string> = Object.fromEntries(
  SYMPTOM_CATALOG.map(s => [s.key, s.icon])
);

// ── Urine color picker (hematuria red-flag scale) ──────────────────────
//
// 7-color custom scale (not the 8-step Armstrong hydration chart).
// The four "blood/myoglobin" colors (pink, red, brown_tea, cola) drive
// a red Outcome via `evaluateSymptoms()`.
//
// Swatch hex values:
//   - clear/yellow/dark_yellow are aligned to the well-known Armstrong
//     hydration chart (pale-amber range, widely reproduced in clinical
//     posters and ACSM training materials).
//   - pink/red/brown_tea/cola are clinically-plausible approximations
//     of hematuria/myoglobinuria descriptions in hematology references.
//
// TODO(color-validation): confirm hex values against a peer-reviewed
// medical urine color chart (e.g. CDC, ACSM, or a hospital lab atlas)
// before clinician sign-off. The picker shows the color name next to
// each swatch so the feature is usable with imperfect hex values.
export interface UrineColorOption {
  key: UrineColor;
  labelKey: string;
  /** CSS hex used for the picker swatch. */
  hex: string;
  /** True when this color is a hemophilia red flag → urgent outcome. */
  isRedFlag: boolean;
}

export const URINE_COLOR_OPTIONS: UrineColorOption[] = [
  { key: 'clear',       labelKey: 'symptom.urineColor.clear',       hex: '#F7F7F2', isRedFlag: false },
  { key: 'yellow',      labelKey: 'symptom.urineColor.yellow',      hex: '#F5E663', isRedFlag: false },
  { key: 'dark_yellow', labelKey: 'symptom.urineColor.dark_yellow', hex: '#D4A017', isRedFlag: false },
  { key: 'pink',        labelKey: 'symptom.urineColor.pink',        hex: '#E89AAE', isRedFlag: true  },
  { key: 'red',         labelKey: 'symptom.urineColor.red',         hex: '#B22222', isRedFlag: true  },
  { key: 'brown_tea',   labelKey: 'symptom.urineColor.brown_tea',   hex: '#6B3410', isRedFlag: true  },
  { key: 'cola',        labelKey: 'symptom.urineColor.cola',        hex: '#2A1505', isRedFlag: true  },
];

export const URINE_COLOR_HEX: Record<UrineColor, string> = Object.fromEntries(
  URINE_COLOR_OPTIONS.map(o => [o.key, o.hex])
) as Record<UrineColor, string>;

const HEMATURIA_COLORS: ReadonlySet<UrineColor> = new Set<UrineColor>([
  'pink',
  'red',
  'brown_tea',
  'cola',
]);

export function isHematuriaColor(color: UrineColor | null | undefined): boolean {
  return color != null && HEMATURIA_COLORS.has(color);
}

export const CUSTOM_SYMPTOM_PREFIX = 'custom:';

export function isCustomSymptom(key: string): boolean {
  return key.startsWith(CUSTOM_SYMPTOM_PREFIX);
}

// Accepts any translate function (e.g. the strictly-typed `t` from useLanguage)
// without creating a hard import dependency on i18n keys from a pure utility.
export function getSymptomLabel(
  key: string,
  translate: (k: any) => string,
): string {
  if (isCustomSymptom(key)) return key.slice(CUSTOM_SYMPTOM_PREFIX.length);
  return translate(`symptom.${key}`);
}

export interface ThresholdResult {
  outcome: Outcome;
  triggeringSymptoms: string[];
  messageKey: string;
}

/**
 * Evaluates symptom severity scores against clinical thresholds.
 *
 * Rules (per user spec):
 * - RED/urgent: fever above severity 7 combined with chills or back_pain
 * - RED/urgent: jaundice at any severity above 3
 * - RED/urgent: urine color is one of `pink | red | brown_tea | cola`
 *   (the four hematuria colors — see URINE_COLOR_OPTIONS). Surfaces as
 *   the synthetic trigger key `urine_color:<color>` so dashboards can
 *   distinguish urine-driven escalation from generic symptoms.
 * - RED/urgent (legacy): `dark_urine` severity > 3 — retained so
 *   historical symptom logs continue to evaluate to the same outcome
 *   as when they were written.
 * - GREEN/normal: only fatigue or skin_rash present, all below severity 5, no other flags
 * - YELLOW/monitor: anything else
 *
 * The second argument is optional so existing call sites that have not
 * been updated to pass a urine color continue to compile and behave
 * identically.
 */
export function evaluateSymptoms(
  severityScores: Record<string, number>,
  urineColor: UrineColor | null = null,
): ThresholdResult {
  const activeSymptoms = Object.entries(severityScores).filter(([, v]) => v > 0);
  const triggers: string[] = [];

  const hematuria = isHematuriaColor(urineColor);

  if (activeSymptoms.length === 0 && !hematuria) {
    return {
      outcome: 'normal',
      triggeringSymptoms: [],
      messageKey: 'status.normal.message',
    };
  }

  const get = (key: string) => severityScores[key] ?? 0;
  let outcome: Outcome = 'normal';

  // Rule 1: Fever above 7 combined with chills or back_pain -> URGENT
  if (get('fever') >= 7 && (get('chills') > 0 || get('back_pain') > 0)) {
    outcome = 'urgent';
    triggers.push('fever');
    if (get('chills') > 0) triggers.push('chills');
    if (get('back_pain') > 0) triggers.push('back_pain');
  }

  // Rule 2: Jaundice severity > 3 -> URGENT
  if (get('jaundice') > 3) {
    outcome = 'urgent';
    if (!triggers.includes('jaundice')) triggers.push('jaundice');
  }

  // Rule 2b (legacy): historical dark_urine severity > 3 -> URGENT.
  // New logs never set this key — they use `urineColor` below instead.
  if (get('dark_urine') > 3) {
    outcome = 'urgent';
    if (!triggers.includes('dark_urine')) triggers.push('dark_urine');
  }

  // Rule 2c (new): hematuria colors -> URGENT
  if (hematuria && urineColor) {
    outcome = 'urgent';
    const key = `urine_color:${urineColor}`;
    if (!triggers.includes(key)) triggers.push(key);
  }

  // If already urgent, return
  if (outcome === 'urgent') {
    return {
      outcome: 'urgent',
      triggeringSymptoms: triggers,
      messageKey: 'status.urgent.message',
    };
  }

  // Rule 3: Only fatigue or skin_rash present, all below 5 -> NORMAL
  const activeKeys = activeSymptoms.map(([k]) => k);
  const onlyMild = activeKeys.every(k => k === 'fatigue' || k === 'skin_rash');
  const allBelowFive = activeSymptoms.every(([, v]) => v < 5);

  if (onlyMild && allBelowFive) {
    return {
      outcome: 'normal',
      triggeringSymptoms: [],
      messageKey: 'status.normal.message',
    };
  }

  // Rule 4: Everything else -> MONITOR
  const monitorTriggers = activeSymptoms
    .filter(([k]) => k !== 'fatigue' && k !== 'skin_rash')
    .map(([k]) => k);

  return {
    outcome: 'monitor',
    triggeringSymptoms: monitorTriggers.length > 0 ? monitorTriggers : activeKeys,
    messageKey: 'status.monitor.message',
  };
}
