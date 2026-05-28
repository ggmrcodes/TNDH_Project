import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { RiskResult } from '../../utils/riskScore';
import { riskColors } from '../../utils/statusColors';

export interface RiskBadgeProps {
  risk: RiskResult;
}

export default function RiskBadge({ risk }: RiskBadgeProps) {
  const { t } = useLanguage();
  const { bg, fg } = riskColors(risk.level);
  const labelKey = (`clinician.detail.risk.${risk.level}` as unknown) as TranslationKey;
  const label = t(labelKey, { score: risk.score });
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
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
