import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';

interface Props {
  tone?: 'info' | 'warn';
  message?: string;
}

const DEFAULT_MESSAGE =
  'These are observations derived from your logs — not medical advice. ' +
  'Always discuss decisions with your clinician. For emergencies, call your local emergency number.';

export default function Disclaimer({ tone = 'info', message }: Props) {
  const bg = tone === 'warn' ? COLORS.statusMonitorBg : COLORS.primaryLight;
  const iconColor = tone === 'warn' ? COLORS.statusMonitor : COLORS.primary;
  const textColor = tone === 'warn' ? COLORS.statusMonitorText : COLORS.primaryDark;
  return (
    <View style={[styles.box, { backgroundColor: bg }]}>
      <Feather name="info" size={14} color={iconColor} style={styles.icon} />
      <Text style={[styles.text, { color: textColor }]}>{message ?? DEFAULT_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    gap: 8,
  },
  icon: { marginTop: 2 },
  text: { ...TYPOGRAPHY.bodySmall, flex: 1 },
});
