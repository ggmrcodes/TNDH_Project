import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  /** Optional helper line shown below the message, smaller + muted. */
  hint?: string;
  /** Optional call-to-action button below the message. */
  cta?: {
    label: string;
    onPress: () => void;
    /** Feather icon name shown to the left of the label. Defaults to 'plus'. */
    icon?: keyof typeof Feather.glyphMap;
  };
}

export default function EmptyState({ icon = 'document-text-outline', message, hint, cta }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={COLORS.textLight} />
      <Text style={styles.text}>{message}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {cta ? (
        <TouchableOpacity
          onPress={cta.onPress}
          style={styles.cta}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={cta.label}
        >
          <Feather name={cta.icon ?? 'plus'} size={18} color={COLORS.white} />
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
    gap: SPACING.xs,
  },
  text: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  hint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    marginTop: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
    ...SHADOWS.glow,
  },
  ctaLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.2,
  },
});
