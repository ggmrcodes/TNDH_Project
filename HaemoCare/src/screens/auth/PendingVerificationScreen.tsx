import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import LanguageToggle from '../../components/common/LanguageToggle';
import Button from '../../components/common/Button';
import { supabase } from '../../config/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

export default function PendingVerificationScreen() {
  const { clinicianProfile, user, signOut, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();

  const initialLicense = clinicianProfile?.license_number ?? '';
  const initialHospital = clinicianProfile?.hospital_affiliation ?? '';
  const hasMissing = !initialLicense.trim() || !initialHospital.trim();

  const [isEditing, setIsEditing] = useState(false);
  const [license, setLicense] = useState(initialLicense);
  const [hospital, setHospital] = useState(initialHospital);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('clinician_profiles')
      .update({
        license_number: license.trim(),
        hospital_affiliation: hospital.trim(),
      })
      .eq('user_id', user.id);
    setIsSaving(false);
    if (error) {
      Alert.alert('', t('auth.pendingVerification.saveFailed'));
      return;
    }
    await refreshProfile();
    setIsEditing(false);
    Alert.alert('', t('auth.pendingVerification.saved'));
  };

  const handleSignOut = () => {
    Alert.alert(
      t('privacy.signOutConfirmTitle'),
      t('privacy.signOutConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.logout'), style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  return (
    <View style={styles.container}>
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
        <View style={styles.heroWrap}>
          <View style={styles.hero}>
            <Feather name="clock" size={36} color={COLORS.white} />
          </View>
        </View>

        <Text style={styles.title}>{t('auth.pendingVerification.title')}</Text>
        <Text style={styles.body}>{t('auth.pendingVerification.body')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>{t('auth.pendingVerification.submissionHeader')}</Text>
          <Text style={styles.cardName}>{clinicianProfile?.full_name?.trim() || '—'}</Text>
          <Text style={styles.cardRow}>
            <Text style={styles.cardRowLabel}>{t('auth.pendingVerification.licenseLabel')}: </Text>
            <Text style={initialLicense.trim() ? styles.cardRowValue : styles.cardRowMissing}>
              {initialLicense.trim() || t('auth.pendingVerification.notProvided')}
            </Text>
          </Text>
          <Text style={styles.cardRow}>
            <Text style={styles.cardRowLabel}>{t('auth.pendingVerification.hospitalLabel')}: </Text>
            <Text style={initialHospital.trim() ? styles.cardRowValue : styles.cardRowMissing}>
              {initialHospital.trim() || t('auth.pendingVerification.notProvided')}
            </Text>
          </Text>
        </View>

        {isEditing ? (
          <View style={styles.editCard}>
            <Text style={styles.label}>{t('auth.clinicianSignup.licenseNumber')}</Text>
            <TextInput
              style={styles.input}
              value={license}
              onChangeText={setLicense}
              placeholderTextColor={COLORS.textLight}
            />
            <Text style={styles.label}>{t('auth.clinicianSignup.hospital')}</Text>
            <TextInput
              style={styles.input}
              value={hospital}
              onChangeText={setHospital}
              placeholderTextColor={COLORS.textLight}
            />
            <View style={styles.editButtonRow}>
              <Button
                label={t('auth.pendingVerification.cancelAdd')}
                variant="outline"
                onPress={() => {
                  setLicense(initialLicense);
                  setHospital(initialHospital);
                  setIsEditing(false);
                }}
                style={styles.editButton}
              />
              <Button
                label={t('auth.pendingVerification.saveDetails')}
                onPress={handleSave}
                isLoading={isSaving}
                style={styles.editButton}
              />
            </View>
          </View>
        ) : hasMissing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.addCta} activeOpacity={0.85}>
            <Text style={styles.addCtaText}>{t('auth.pendingVerification.addDetails')}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={handleSignOut} style={styles.signOutRow}>
          <Feather name="log-out" size={16} color={COLORS.textSecondary} />
          <Text style={styles.signOutText}>{t('auth.pendingVerification.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    alignItems: 'stretch',
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  hero: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.statusMonitor,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  body: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  cardName: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs + 2,
  },
  cardRow: {
    ...TYPOGRAPHY.bodySmall,
    marginBottom: 2,
  },
  cardRowLabel: {
    color: COLORS.textSecondary,
  },
  cardRowValue: {
    color: COLORS.text,
  },
  cardRowMissing: {
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  addCta: {
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  addCtaText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
    color: COLORS.accent,
  },
  editCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  editButton: {
    flex: 1,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs + 2,
    marginTop: SPACING.lg,
    padding: SPACING.sm,
  },
  signOutText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
