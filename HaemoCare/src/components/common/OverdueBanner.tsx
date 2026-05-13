import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING, SHADOWS } from '../../config/theme';

export interface OverdueBannerProps {
  daysOverdue: number;
  variant: 'monitor' | 'appointments';
  onPressCta: () => void;
  onPressNotify?: () => void;
}

export default function OverdueBanner({ daysOverdue, variant, onPressCta, onPressNotify }: OverdueBannerProps) {
  const { t } = useLanguage();

  const messageKey =
    variant === 'monitor'
      ? ('overdue.banner.monitor' as TranslationKey)
      : ('overdue.banner.appointments' as TranslationKey);
  const ctaKey =
    variant === 'monitor'
      ? ('overdue.banner.monitor.cta' as TranslationKey)
      : ('overdue.banner.appointments.cta' as TranslationKey);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Feather name="alert-triangle" size={20} color={COLORS.white} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.message}>{t(messageKey, { days: daysOverdue })}</Text>
        <TouchableOpacity onPress={onPressCta} style={styles.ctaBtn} activeOpacity={0.8}>
          <Text style={styles.ctaText}>{t(ctaKey)}</Text>
        </TouchableOpacity>
        {onPressNotify && (
          <TouchableOpacity onPress={onPressNotify} style={styles.notifyBtn} activeOpacity={0.8}>
            <Text style={styles.notifyText}>{t('emergency.overdueNotify')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    borderWidth: 1,
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: { flex: 1, gap: SPACING.sm },
  message: { fontSize: 13, fontWeight: '600', color: COLORS.text, lineHeight: 18 },
  ctaBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
  },
  ctaText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  notifyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    marginTop: SPACING.sm,
  },
  notifyText: { color: COLORS.statusUrgent ?? '#DC3B3B', fontSize: 13, fontWeight: '700' },
});
