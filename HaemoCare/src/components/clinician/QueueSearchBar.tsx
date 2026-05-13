import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

export interface QueueSearchBarProps {
  value: string;
  onChange: (next: string) => void;
}

export default function QueueSearchBar({ value, onChange }: QueueSearchBarProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.wrap}>
      <Feather name="search" size={14} color={COLORS.textLight} style={styles.iconLeft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('clinician.search.placeholder' as TranslationKey)}
        placeholderTextColor={COLORS.textLight}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChange('')}
          accessibilityLabel={t('clinician.search.clear' as TranslationKey)}
          style={styles.clearBtn}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Feather name="x" size={14} color={COLORS.textLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface ?? '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderLight ?? '#EEEAE5',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  iconLeft: {},
  input: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    paddingVertical: 0,
  },
  clearBtn: { padding: 2 },
});
