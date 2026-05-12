import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Profile } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface ProfileCardProps {
  profile: Profile;
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const { t } = useLanguage();

  return (
    <Card style={styles.card}>
      <Text style={styles.name}>{profile.full_name}</Text>

      <View style={styles.bloodRow}>
        <View style={styles.bloodBadge}>
          <Text style={styles.bloodType}>{profile.blood_type}</Text>
        </View>
        <Text style={styles.rhText}>Rh{profile.rh_factor}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('passport.antibodies')}</Text>
        {profile.antibodies.length > 0 ? (
          <View style={styles.chipRow}>
            {profile.antibodies.map((ab, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{ab}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t('passport.noAntibodies')}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('passport.reactions')}</Text>
        <Text style={styles.value}>
          {profile.known_reactions || t('passport.noReactions')}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('passport.medications')}</Text>
        <Text style={styles.value}>
          {profile.medications || t('passport.noMedications')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.md,
  },
  name: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  bloodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  bloodBadge: {
    backgroundColor: COLORS.primary,
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  bloodType: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: '700',
  },
  rhText: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
  },
  section: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  sectionLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  value: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chip: {
    backgroundColor: COLORS.primaryLight,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
  },
  chipText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
});
