import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../config/theme';

export interface ClinicianIdentityChipProps {
  name: string;
  hospital: string | null;
}

export default function ClinicianIdentityChip({ name, hospital }: ClinicianIdentityChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      {hospital != null && (
        <Text style={styles.hospital} numberOfLines={1}>{hospital}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: COLORS.surfaceElevated ?? '#FEFDFB',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight ?? '#EEEAE5',
    alignItems: 'flex-end',
    gap: 1,
  },
  name: { fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
  hospital: { fontSize: 11, color: COLORS.textLight, textAlign: 'right' },
});
