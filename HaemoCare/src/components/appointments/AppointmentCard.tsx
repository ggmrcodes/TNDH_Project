import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Appointment } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDate, daysUntil } from '../../utils/dateHelpers';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface AppointmentCardProps {
  appointment: Appointment;
  onPress?: () => void;
}

export default function AppointmentCard({ appointment, onPress }: AppointmentCardProps) {
  const { t, language } = useLanguage();
  const days = daysUntil(appointment.scheduled_date);
  const isPast = days < 0;

  let countdown = '';
  if (days === 0) countdown = t('appointments.today');
  else if (days === 1) countdown = t('appointments.tomorrow');
  else if (days > 1) countdown = `${days} ${t('appointments.daysUntil')}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Card style={[styles.card, isPast && styles.pastCard]}>
        <View style={styles.dateCol}>
          <Ionicons name="calendar" size={20} color={isPast ? COLORS.textLight : COLORS.primary} />
          <Text style={[styles.dateText, isPast && styles.pastText]}>
            {formatDate(appointment.scheduled_date, language)}
          </Text>
        </View>
        <Text style={[styles.hospital, isPast && styles.pastText]} numberOfLines={1}>
          {appointment.hospital}
        </Text>
        {appointment.notes ? (
          <Text style={styles.notes} numberOfLines={2}>{appointment.notes}</Text>
        ) : null}
        {!isPast && countdown ? (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        ) : null}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  pastCard: {
    borderLeftColor: COLORS.textLight,
    opacity: 0.7,
  },
  dateCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  dateText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  pastText: {
    color: COLORS.textSecondary,
  },
  hospital: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  notes: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  countdownBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  countdownText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
