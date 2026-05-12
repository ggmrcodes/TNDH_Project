import React from 'react';
import { ScrollView, View, Text, SafeAreaView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import Disclaimer from '../../components/common/Disclaimer';

export default function ImportAppointmentsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLanguage();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('importAppt.title')}</Text>
          <Text style={styles.subtitle}>{t('importAppt.subtitle')}</Text>
        </View>

        <Disclaimer message={t('importAppt.privacy')} />

        <OptionCard
          icon="activity"
          iconColor={COLORS.primary}
          iconBg={COLORS.primaryLight}
          title={t('importAppt.fhir.title')}
          subtitle={t('importAppt.fhir.subtitle')}
          badge="TH CORE FHIR"
          onPress={() => navigation.navigate('FhirImport')}
        />

        <OptionCard
          icon="calendar"
          iconColor={COLORS.accent}
          iconBg={COLORS.accentLight}
          title={t('importAppt.ics.title')}
          subtitle={t('importAppt.ics.subtitle')}
          badge=".ICS"
          onPress={() => navigation.navigate('IcsImport')}
        />

        <Text style={styles.footnote}>{t('importAppt.footnote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionCard({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  badge: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.iconBg, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={COLORS.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.md },
  header: { gap: 4, marginBottom: SPACING.xs },
  title: { ...TYPOGRAPHY.h2, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  iconBg: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  cardSubtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  badge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.5 },
  footnote: { ...TYPOGRAPHY.caption, color: COLORS.textLight, textAlign: 'center', marginTop: SPACING.md },
});
