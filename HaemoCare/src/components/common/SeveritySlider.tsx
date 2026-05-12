import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { COLORS, TYPOGRAPHY, SPACING } from '../../config/theme';

interface SeveritySliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function severityColor(value: number): string {
  if (value <= 3) return COLORS.statusNormal;
  if (value <= 6) return COLORS.statusMonitor;
  return COLORS.statusUrgent;
}

export default function SeveritySlider({ label, value, onChange }: SeveritySliderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: severityColor(value) }]}>{value}/10</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={1}
        maximumValue={10}
        step={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={severityColor(value)}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={severityColor(value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  label: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
  },
  value: {
    ...TYPOGRAPHY.h3,
    fontWeight: '700',
    minWidth: 48,
    textAlign: 'right',
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
