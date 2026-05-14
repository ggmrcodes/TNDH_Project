import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { RiskResult } from '../../utils/riskScore';

export interface RiskBadgeProps {
  risk: RiskResult;
}

export default function RiskBadge({ risk }: RiskBadgeProps) {
  const { t } = useLanguage();
  const { bg, fg } = pickColors(risk.level);
  const labelKey = (`clinician.detail.risk.${risk.level}` as unknown) as TranslationKey;
  const label = t(labelKey, { score: risk.score });
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

function pickColors(level: RiskResult['level']): { bg: string; fg: string } {
  switch (level) {
    case 'high':
      return {
        bg: COLORS.statusUrgentBg ?? '#FEF0F0',
        fg: COLORS.statusUrgent ?? '#DC3B3B',
      };
    case 'med':
      return {
        bg: COLORS.statusMonitorBg ?? '#FFF7ED',
        fg: COLORS.statusMonitor ?? '#E8933A',
      };
    case 'low':
    default:
      return {
        bg: COLORS.statusNormalBg ?? '#E9FBF3',
        fg: COLORS.statusNormal ?? '#0EA572',
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700' },
});
