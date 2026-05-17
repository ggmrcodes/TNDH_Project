import React, { useState } from 'react';
import { StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import * as realProfileService from '../../services/profileService';
import * as mockServices from '../../mock/services';
import ProfileEditForm from '../../components/passport/ProfileEditForm';
import { Profile } from '../../types/database';
import { COLORS } from '../../config/theme';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, profile, refreshProfile, isMockMode } = useAuth();
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

  return (
    <SafeAreaView style={styles.container}>
      <ProfileEditForm
        profile={profile}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
});
