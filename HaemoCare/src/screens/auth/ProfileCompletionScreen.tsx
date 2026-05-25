import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { createProfile } from '../../services/profileService';
import ProfileEditForm from '../../components/passport/ProfileEditForm';
import LanguageToggle from '../../components/common/LanguageToggle';
import { Profile } from '../../types/database';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import * as realPatientService from '../../services/patientService';
import * as mockServices from '../../mock/services';

export default function ProfileCompletionScreen() {
  const { user, refreshProfile, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (data: Partial<Profile>) => {
    if (!user) {
      setError('No authenticated user — please sign out and back in.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await createProfile(user.id, data);
      await refreshProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Profile creation error:', err);
      setError(message);
    }
    setIsLoading(false);
  };

  const handleDoctorSelection = async (info: { hospitalId: string; clinicianUserId: string } | null) => {
    if (!info || !user) return;
    try {
      const svc = isMockMode ? mockServices : realPatientService;
      await svc.requestClinicianLink(info.clinicianUserId, user.id, true);
    } catch (err) {
      // Non-blocking — patient can connect later via PassportScreen tile.
      console.error('Could not create clinician link at signup:', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        <View>
          <Text style={styles.title}>{t('profileSetup.title')}</Text>
          <Text style={styles.subtitle}>{t('profileSetup.subtitle')}</Text>
        </View>
        <LanguageToggle />
      </View>
      <View style={styles.form}>
        {error ? (
          <View
            style={[
              styles.errorBox,
              !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any },
            ]}
          >
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <ProfileEditForm
          onSubmit={handleSubmit}
          onDoctorSelection={handleDoctorSelection}
          isLoading={isLoading}
          submitLabel={t('profileSetup.complete')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: SPACING.lg,
    paddingBottom: 0,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    maxWidth: 260,
  },
  form: {
    flex: 1,
  },
  errorBox: {
    backgroundColor: COLORS.statusUrgentBg,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.statusUrgent,
  },
});
