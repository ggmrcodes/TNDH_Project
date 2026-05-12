import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Transfusion } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDate } from '../../utils/dateHelpers';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface TransfusionCardProps {
  transfusion: Transfusion;
  onPress?: () => void;
}

export default function TransfusionCard({ transfusion, onPress }: TransfusionCardProps) {
  const { t, language } = useLanguage();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.dateRow}>
            <Ionicons name="water" size={20} color={COLORS.primary} />
            <Text style={styles.date}>{formatDate(transfusion.date, language)}</Text>
          </View>
          {transfusion.reaction_noted && (
            <View style={styles.reactionBadge}>
              <Ionicons name="alert-circle" size={14} color={COLORS.statusUrgent} />
              <Text style={styles.reactionText}>{t('history.reactionYes')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.hospital} numberOfLines={1}>{transfusion.hospital}</Text>
        <View style={styles.footer}>
          <Text style={styles.units}>
            {transfusion.units_received} {t('history.units')}
          </Text>
          {onPress && <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  date: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.statusUrgentBg,
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  reactionText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.statusUrgent,
    fontWeight: '600',
  },
  hospital: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  units: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
});
