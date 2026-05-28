/**
 * Canonical color pairs for clinical status discriminators.
 *
 * All colors are sourced exclusively from the theme's COLORS tokens — no
 * ad-hoc hex literals.  Import this helper instead of reimplementing the
 * mapping in individual components.
 */

import { COLORS } from '../config/theme';
import type { Outcome } from '../types/database';

export interface StatusColorPair {
  /** Foreground (text / icon) color. */
  fg: string;
  /** Background (fill / badge tint) color. */
  bg: string;
}

/**
 * Return the canonical fg/bg pair for a given symptom-log outcome.
 * Mirrors the statusNormal / statusMonitor / statusUrgent token families.
 */
export function outcomeColors(outcome: Outcome): StatusColorPair {
  switch (outcome) {
    case 'urgent':
      return { fg: COLORS.statusUrgent, bg: COLORS.statusUrgentBg };
    case 'monitor':
      return { fg: COLORS.statusMonitor, bg: COLORS.statusMonitorBg };
    case 'normal':
    default:
      return { fg: COLORS.statusNormal, bg: COLORS.statusNormalBg };
  }
}

/**
 * Return the canonical fg/bg pair for a computed risk level.
 * 'high' → urgent tokens; 'med' → monitor tokens; 'low' → normal tokens.
 */
export function riskColors(level: 'low' | 'med' | 'high'): StatusColorPair {
  switch (level) {
    case 'high':
      return { fg: COLORS.statusUrgent, bg: COLORS.statusUrgentBg };
    case 'med':
      return { fg: COLORS.statusMonitor, bg: COLORS.statusMonitorBg };
    case 'low':
    default:
      return { fg: COLORS.statusNormal, bg: COLORS.statusNormalBg };
  }
}
