import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export default function Button({
  label, onPress, variant = 'primary', isLoading, disabled, style, fullWidth = true, accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const bg = {
    primary: COLORS.primary,
    secondary: COLORS.primaryLight,
    danger: COLORS.statusUrgent,
    outline: 'transparent',
  }[variant];

  const textColor = {
    primary: COLORS.white,
    secondary: COLORS.primary,
    danger: COLORS.white,
    outline: COLORS.primary,
  }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      style={[
        styles.base,
        { backgroundColor: bg },
        variant === 'outline' && styles.outline,
        isDisabled && styles.disabled,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: SPACING.md - 2,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    ...TYPOGRAPHY.button,
  },
});
