import React, { useState } from 'react';
import { StyleSheet, SafeAreaView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import * as realProfileService from '../../services/profileService';
import * as mockServices from '../../mock/services';
import ProfileEditForm from '../../components/passport/ProfileEditForm';
import ConnectedCliniciansSection from '../../components/patient/ConnectedCliniciansSection';
import { Profile } from '../../types/database';
import { COLORS, SPACING } from '../../config/theme';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, profile, refreshProfile, isMockMode, role } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: Partial<Profile>) => {
    if (!user) return;
    setIsLoading(true);
    try {
      if (isMockMode) {
        await mockServices.updateProfile(user.id, data);
      } else {
        await realProfileService.updateProfile(user.id, data);
      }
      await refreshProfile();
      navigation.goBack();
    } catch (err) {
      console.error('Profile update error:', err);
    }
    setIsLoading(false);
  };

  // Patients see their connected clinicians inline (manage / + Find).
  // Clinicians don't have this concept — they manage patients elsewhere.
  const cliniciansSlot =
    role === 'patient' ? (
      <View style={styles.cliniciansSlot}>
        <ConnectedCliniciansSection />
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.container}>
      <ProfileEditForm
        profile={profile}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        afterForm={cliniciansSlot}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  cliniciansSlot: {
    marginTop: SPACING.lg,
  },
});
