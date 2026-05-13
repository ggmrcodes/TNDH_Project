import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import OverdueBadge from './OverdueBadge';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import type { Outcome } from '../../types/database';

export interface PatientQueueRowProps {
  patientId: string;
  displayName: string;
  isSelected: boolean;
  isOverdue: boolean;
  daysOverdue: number;
  bumpTiers: 0 | 1 | 2;
  worstRecentOutcome: Outcome;
  hasReactionOnFile: boolean;
  onPress: () => void;
}

const OUTCOME_DOT: Record<Outcome, string> = {
  normal: COLORS.statusNormal ?? '#0EA572',
  monitor: COLORS.statusMonitor ?? '#E8933A',
  urgent: COLORS.statusUrgent ?? '#DC3B3B',
};

export default function PatientQueueRow(props: PatientQueueRowProps) {
  const {
    patientId, displayName, isSelected,
    isOverdue, daysOverdue, bumpTiers,
    worstRecentOutcome, hasReactionOnFile, onPress,
  } = props;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      <View style={[styles.dot, { backgroundColor: OUTCOME_DOT[worstRecentOutcome] }]} />
      <View style={styles.col}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {hasReactionOnFile && (
            <Feather name="alert-circle" size={12} color={COLORS.statusUrgent ?? '#DC3B3B'} />
          )}
        </View>
        <View style={styles.bottomLine}>
          <Text style={styles.id}>{patientId}</Text>
          {isOverdue && bumpTiers > 0 && (
            <OverdueBadge daysOverdue={daysOverdue} tier={bumpTiers as 1 | 2} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'transparent',
  },
  rowSelected: { backgroundColor: COLORS.primaryLight ?? '#E7F4F2' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  col: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  id: { fontSize: 11, color: COLORS.textLight },
});
