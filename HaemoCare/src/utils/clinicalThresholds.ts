import { Outcome } from '../types/database';

export interface SymptomDefinition {
  key: string;
  labelKey: string;
  icon: string; // Feather icon name
}

export const SYMPTOM_CATALOG: SymptomDefinition[] = [
  { key: 'fever', labelKey: 'symptom.fever', icon: 'thermometer' },
  { key: 'chills', labelKey: 'symptom.chills', icon: 'wind' },
  { key: 'fatigue', labelKey: 'symptom.fatigue', icon: 'battery' },
  { key: 'dark_urine', labelKey: 'symptom.dark_urine', icon: 'droplet' },
  { key: 'jaundice', labelKey: 'symptom.jaundice', icon: 'eye' },
  { key: 'back_pain', labelKey: 'symptom.back_pain', icon: 'trending-up' },
  { key: 'shortness_of_breath', labelKey: 'symptom.shortness_of_breath', icon: 'wind' },
  { key: 'skin_rash', labelKey: 'symptom.skin_rash', icon: 'grid' },
];

export const SYMPTOM_ICON_MAP: Record<string, string> = Object.fromEntries(
  SYMPTOM_CATALOG.map(s => [s.key, s.icon])
);

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
 * - RED/urgent: jaundice or dark_urine at any severity above 3
 * - GREEN/normal: only fatigue or skin_rash present, all below severity 5, no other flags
 * - YELLOW/monitor: anything else
 */
export function evaluateSymptoms(
  severityScores: Record<string, number>
): ThresholdResult {
  const activeSymptoms = Object.entries(severityScores).filter(([, v]) => v > 0);
  const triggers: string[] = [];

  if (activeSymptoms.length === 0) {
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

  // Rule 2: Jaundice or dark_urine severity > 3 -> URGENT
  if (get('jaundice') > 3) {
    outcome = 'urgent';
    if (!triggers.includes('jaundice')) triggers.push('jaundice');
  }
  if (get('dark_urine') > 3) {
    outcome = 'urgent';
    if (!triggers.includes('dark_urine')) triggers.push('dark_urine');
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
