import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { COLORS, TYPOGRAPHY, RADIUS, SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setLanguage('th')}
        style={[styles.segment, language === 'th' && styles.active]}
      >
        <Text style={[styles.text, language === 'th' && styles.activeText]}>TH</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setLanguage('en')}
        style={[styles.segment, language === 'en' && styles.active]}
      >
        <Text style={[styles.text, language === 'en' && styles.activeText]}>EN</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.sm,
    padding: 2,
  },
  segment: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.sm - 2,
  },
  active: {
    backgroundColor: COLORS.primary,
  },
  text: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeText: {
    color: COLORS.white,
  },
});
