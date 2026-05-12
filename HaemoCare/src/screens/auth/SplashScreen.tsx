import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS, TYPOGRAPHY, SPACING } from '../../config/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>;
};

export default function SplashScreen({ navigation }: Props) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        if (user) {
          // Auth flow handled by AppNavigator
        } else {
          navigation.replace('Login');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, user, navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>H</Text>
      </View>
      <Text style={styles.appName}>HaemoCare</Text>
      <Text style={styles.tagline}>Your Transfusion Companion</Text>
      <Text style={styles.taglineTh}>ผู้ช่วยการรับเลือดของคุณ</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.primary,
  },
  appName: {
    ...TYPOGRAPHY.h1,
    color: COLORS.white,
    fontSize: 36,
    marginBottom: SPACING.sm,
  },
  tagline: {
    ...TYPOGRAPHY.body,
    color: 'rgba(255,255,255,0.9)',
  },
  taglineTh: {
    ...TYPOGRAPHY.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: SPACING.xs,
  },
});
