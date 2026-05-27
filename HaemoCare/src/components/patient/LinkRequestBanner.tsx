import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { PendingLinkRequest } from '../../services/patientService';

interface Props {
  pending: PendingLinkRequest[];
  onPress: () => void;
}

export default function LinkRequestBanner({ pending, onPress }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  if (pending.length === 0) return null;

  const single = pending.length === 1;
  const headline = single
    ? t('patient.linkRequest.bannerOne' as TranslationKey, { name: pending[0].clinicianFullName })
    : t('patient.linkRequest.bannerMany' as TranslationKey, { count: pending.length });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      // Banner is the topmost element in MainTabNavigator's root (no SafeAreaView
      // above it), so it must clear the status bar / notch itself. On web/desktop
      // insets.top is 0, leaving the original SPACING.sm gap.
      style={[styles.banner, { marginTop: insets.top + SPACING.sm }]}
      accessibilityRole="button"
      accessibilityLabel={t('patient.linkRequest.bannerView' as TranslationKey)}
    >
      <View style={styles.iconWrap}>
        <Feather name="user-plus" size={16} color={COLORS.gold} />
      </View>
      <Text style={styles.text} numberOfLines={2}>{headline}</Text>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>
          {t('patient.linkRequest.bannerView' as TranslationKey)}
        </Text>
        <Feather name="chevron-right" size={14} color={COLORS.text} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.md,
    // marginTop applied inline (insets.top + SPACING.sm) to clear the status bar.
    backgroundColor: COLORS.goldLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(212, 168, 83, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 17,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.1,
  },
});
