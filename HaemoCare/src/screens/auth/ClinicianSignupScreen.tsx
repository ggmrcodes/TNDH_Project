import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import Button from '../../components/common/Button';
import LanguageToggle from '../../components/common/LanguageToggle';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ClinicianSignup'>;
};

export default function ClinicianSignupScreen({ navigation }: Props) {
  const { signUpClinician } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [hospital, setHospital] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = email.trim() !== '' && password !== '' && fullName.trim() !== '';

  const handleSubmit = async () => {
    setError('');
    if (!canSubmit) return;
    setIsLoading(true);
    const result = await signUpClinician({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      licenseNumber: licenseNumber.trim(),
      hospitalAffiliation: hospital.trim(),
    });
    setIsLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    Alert.alert('', t('auth.clinicianSignup.success'));
    navigation.replace('Login');
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

      <ScrollView
        contentContainerStyle={[
          styles.content,
          !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('auth.clinicianSignup.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.clinicianSignup.subtitle')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionLabel}>{t('auth.clinicianSignup.requiredHeader')}</Text>

        <Text style={styles.label}>{t('auth.email')}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholderTextColor={COLORS.textLight}
        />

        <Text style={styles.label}>{t('auth.password')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          secureTextEntry
          placeholderTextColor={COLORS.textLight}
        />

        <Text style={styles.label}>{t('auth.clinicianSignup.fullName')}</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          placeholderTextColor={COLORS.textLight}
        />

        <Text style={[styles.sectionLabel, styles.sectionLabelOptional]}>
          {t('auth.clinicianSignup.optionalHeader')}
        </Text>
        <Text style={styles.optionalHint}>{t('auth.clinicianSignup.optionalHint')}</Text>

        <Text style={styles.label}>{t('auth.clinicianSignup.licenseNumber')}</Text>
        <TextInput
          style={styles.input}
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholderTextColor={COLORS.textLight}
        />

        <Text style={styles.label}>{t('auth.clinicianSignup.hospital')}</Text>
        <TextInput
          style={styles.input}
          value={hospital}
          onChangeText={setHospital}
          placeholderTextColor={COLORS.textLight}
        />

        <Button
          label={t('auth.clinicianSignup.submit')}
          onPress={handleSubmit}
          isLoading={isLoading}
          disabled={!canSubmit}
          style={{ marginTop: SPACING.lg }}
        />

        <TouchableOpacity onPress={() => navigation.replace('RoleSelect')} style={styles.backRow}>
          <Text style={styles.backText}>{t('auth.roleSelect.backToLogin')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  error: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.error,
    backgroundColor: COLORS.statusUrgentBg,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sectionLabelOptional: {
    marginTop: SPACING.lg,
  },
  optionalHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm + 2,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
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
