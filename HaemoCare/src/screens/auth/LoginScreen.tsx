import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { AuthStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import LanguageToggle from '../../components/common/LanguageToggle';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setIsLoading(true);
    const result = await signIn(email.trim(), password);
    setIsLoading(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Status bar area with language toggle */}
      <View style={styles.topBar}>
        <View />
        <LanguageToggle />
      </View>

      <View style={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        {/* Logo */}
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

        {/* Form */}
        <Text style={styles.title}>{t('auth.login')}</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={16} color={COLORS.statusUrgent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
          <View style={styles.inputRow}>
            <Feather name="mail" size={18} color={COLORS.textLight} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="demo@haemocare.app"
              placeholderTextColor={COLORS.textLight}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
          <View style={styles.inputRow}>
            <Feather name="lock" size={18} color={COLORS.textLight} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="••••••••••"
              placeholderTextColor={COLORS.textLight}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Feather name={showPassword ? 'eye' : 'eye-off'} size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoading || !email || !password}
          activeOpacity={0.8}
          style={[styles.signInBtn, (isLoading || !email || !password) && styles.btnDisabled]}
        >
          <Feather name="log-in" size={20} color={COLORS.white} />
          <Text style={styles.signInBtnText}>{t('auth.login')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Signup')}
          style={styles.signupRow}
        >
          <Text style={styles.signupText}>{t('auth.noAccount')} </Text>
          <Text style={styles.signupAction}>{t('auth.signup')}</Text>
        </TouchableOpacity>

        {/* PDPA badge */}
        <View style={styles.hipaaRow}>
          <Feather name="shield" size={14} color={COLORS.textLight} />
          <Text style={styles.hipaaText}>{t('pdpa.compliant')}</Text>
        </View>
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
    marginBottom: SPACING.xl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: SPACING.lg,
  },
  logoBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
  },
  logoTextCol: {
    gap: 2,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tagline: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.text,
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
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.statusUrgent,
    flex: 1,
  },
  fieldGroup: {
    marginBottom: SPACING.md,
  },
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
  inputIcon: {
    marginRight: SPACING.sm + 2,
  },
  input: {
    flex: 1,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  eyeBtn: {
    padding: SPACING.xs,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  signInBtnText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  signupText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  signupAction: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  hipaaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.xl,
  },
  hipaaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
  },
});
