import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { AuthStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import LanguageToggle from '../../components/common/LanguageToggle';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { TranslationKey } from '../../i18n';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { sendPasswordResetEmail } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);
    // On web, route the reset email back to this origin so the recovery
    // token fragment lands on a page running our app. On native we let
    // Supabase use its configured Site URL (typically the web build) —
    // the user resets via browser and returns to the app.
    const redirectTo =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : undefined;
    const result = await sendPasswordResetEmail(email.trim(), redirectTo);
    setIsLoading(false);
    if (result.error) {
      setError(t('auth.forgotPassword.error' as TranslationKey));
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <View />
        <LanguageToggle />
      </View>

      <View style={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        <View style={styles.logoSection}>
          <View style={styles.logoRow}>
            <View style={styles.logoBg}>
              <Text style={styles.logoText}>H</Text>
            </View>
            <View style={styles.logoTextCol}>
              <Text style={styles.appName}>HaemoCare</Text>
              <Text style={styles.tagline}>{t('app.tagline')}</Text>
            </View>
          </View>
          <View style={styles.divider} />
        </View>

        <Text style={styles.title}>{t('auth.forgotPassword.title' as TranslationKey)}</Text>
        <Text style={styles.subtitle}>{t('auth.forgotPassword.subtitle' as TranslationKey)}</Text>

        {sent ? (
          <View style={styles.successBox}>
            <Feather name="mail" size={18} color={COLORS.statusNormal} />
            <Text style={styles.successText}>{t('auth.forgotPassword.sent' as TranslationKey)}</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={COLORS.statusUrgent} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('auth.forgotPassword.emailLabel' as TranslationKey)}</Text>
              <View style={styles.inputRow}>
                <Feather name="mail" size={18} color={COLORS.textLight} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="demo@haemocare.app"
                  placeholderTextColor={COLORS.textLight}
                  editable={!isLoading}
                  onSubmitEditing={email ? handleSubmit : undefined}
                  returnKeyType="send"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading || !email}
              activeOpacity={0.8}
              style={[styles.submitBtn, (isLoading || !email) && styles.btnDisabled]}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Feather name="send" size={18} color={COLORS.white} />
                  <Text style={styles.submitBtnText}>{t('auth.forgotPassword.submit' as TranslationKey)}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.backRow}>
          <Text style={styles.backText}>{t('auth.forgotPassword.backToLogin' as TranslationKey)}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
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
  logoSection: { marginBottom: SPACING.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  logoBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: { fontSize: 28, fontWeight: '800', color: COLORS.white },
  logoTextCol: { gap: 2 },
  appName: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  tagline: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  divider: { height: 1, backgroundColor: COLORS.borderLight },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.statusUrgentBg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.statusUrgent, flex: 1 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.statusNormalBg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.statusNormal,
  },
  successText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.statusNormalText,
    flex: 1,
    lineHeight: 18,
  },
  fieldGroup: { marginBottom: SPACING.md },
  fieldLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    height: 50,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: { marginRight: SPACING.sm + 2 },
  input: { flex: 1, ...TYPOGRAPHY.body, color: COLORS.text },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: { ...TYPOGRAPHY.button, color: COLORS.white },
  backRow: {
    alignSelf: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  backText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
