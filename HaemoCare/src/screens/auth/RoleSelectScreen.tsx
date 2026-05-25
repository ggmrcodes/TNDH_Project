import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { AuthStackParamList } from '../../types/navigation';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import LanguageToggle from '../../components/common/LanguageToggle';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'RoleSelect'>;
};

export default function RoleSelectScreen({ navigation }: Props) {
  const { t } = useLanguage();
  const { isMobile } = useResponsive();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <View />
        <LanguageToggle />
      </View>

      <View
        style={[
          styles.content,
          !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any },
        ]}
      >
        <View style={styles.logoSection}>
          <View style={styles.logoBg}>
            <Text style={styles.logoText}>H</Text>
          </View>
          <Text style={styles.title}>{t('auth.roleSelect.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.roleSelect.subtitle')}</Text>
        </View>

        <TouchableOpacity
          onPress={() => navigation.replace('Signup')}
          activeOpacity={0.85}
          style={styles.card}
        >
          <View style={[styles.iconTile, { backgroundColor: COLORS.primaryLight }]}>
            <Feather name="user" size={22} color={COLORS.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{t('auth.roleSelect.patient.title')}</Text>
            <Text style={styles.cardDesc}>{t('auth.roleSelect.patient.desc')}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={COLORS.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.replace('ClinicianSignup')}
          activeOpacity={0.85}
          style={styles.card}
        >
          <View style={[styles.iconTile, { backgroundColor: COLORS.accentLight }]}>
            <Feather name="activity" size={22} color={COLORS.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{t('auth.roleSelect.clinician.title')}</Text>
            <Text style={styles.cardDesc}>{t('auth.roleSelect.clinician.desc')}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={COLORS.textLight} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.replace('Login')} style={styles.backRow}>
          <Text style={styles.backText}>{t('auth.roleSelect.backToLogin')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    marginTop: -40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoBg: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  logoText: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.white,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm + 4,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  backRow: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    padding: SPACING.sm,
  },
  backText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
