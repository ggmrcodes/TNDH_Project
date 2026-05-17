import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { URINE_COLOR_OPTIONS } from '../../utils/clinicalThresholds';
import { UrineColor } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface UrineColorPickerProps {
  value: UrineColor | null;
  onChange: (color: UrineColor | null) => void;
}

/**
 * Horizontal swatch picker for urine color (hematuria red-flag tracking).
 *
 * Accessibility notes:
 *   - Each swatch has an accessibilityLabel with the localized color name.
 *   - The color name is shown below the swatch (color-blind safe — never
 *     rely on the swatch alone).
 *   - A "Not logged" pill allows clearing the selection because the
 *     field is optional.
 */
export default function UrineColorPicker({ value, onChange }: UrineColorPickerProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('symptom.urineColor.label')}</Text>
      <Text style={styles.help}>{t('symptom.urineColor.help')}</Text>
      <Text style={styles.optional}>{t('symptom.urineColor.optional')}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* "Not logged" / clear option */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
          accessibilityLabel={t('symptom.urineColor.notLogged')}
          onPress={() => onChange(null)}
          activeOpacity={0.75}
          style={[styles.swatchCell, value === null && styles.swatchCellSelected]}
        >
          <View style={[styles.swatch, styles.swatchNone]}>
            <Feather name="x" size={18} color={COLORS.textLight} />
          </View>
          <Text
            style={[
              styles.swatchLabel,
              value === null && styles.swatchLabelSelected,
            ]}
            numberOfLines={2}
          >
            {t('symptom.urineColor.notLogged')}
          </Text>
        </TouchableOpacity>

        {URINE_COLOR_OPTIONS.map(option => {
          const isSelected = value === option.key;
          const labelText = t(option.labelKey as TranslationKey);
          return (
            <TouchableOpacity
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={labelText}
              accessibilityHint={
                option.isRedFlag ? t('symptom.urineColor.help') : undefined
              }
              onPress={() => onChange(option.key)}
              activeOpacity={0.75}
              style={[
                styles.swatchCell,
                isSelected && styles.swatchCellSelected,
                isSelected && option.isRedFlag && styles.swatchCellSelectedDanger,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: option.hex },
                  isSelected && styles.swatchSelected,
                ]}
              >
                {isSelected && (
                  <Feather
                    name="check"
                    size={18}
                    color={isLightHex(option.hex) ? COLORS.text : COLORS.white}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.swatchLabel,
                  isSelected && styles.swatchLabelSelected,
                  option.isRedFlag && styles.swatchLabelDanger,
                ]}
                numberOfLines={2}
              >
                {labelText}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Rough perceptual-lightness check so the check-mark stays visible on
// pale swatches (clear, yellow). Not WCAG-perfect; good enough for an
// emoji-sized check on a known palette.
function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // sRGB luminance approximation
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  help: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  optional: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.md,
  },
  swatchCell: {
    width: 76,
    alignItems: 'center',
    padding: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  swatchCellSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  swatchCellSelectedDanger: {
    borderColor: COLORS.statusUrgent,
    backgroundColor: COLORS.statusUrgentBg,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  swatchNone: {
    backgroundColor: COLORS.white,
    borderStyle: 'dashed',
  },
  swatchLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  swatchLabelSelected: {
    color: COLORS.text,
    fontWeight: '700',
  },
  swatchLabelDanger: {
    color: COLORS.statusUrgentText,
  },
});
