import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import PDPAConsentScreen from '../screens/auth/PDPAConsentScreen';
import ProfileCompletionScreen from '../screens/auth/ProfileCompletionScreen';
import EditProfileScreen from '../screens/detail/EditProfileScreen';
import NewSymptomLogScreen from '../screens/detail/NewSymptomLogScreen';
import SymptomLogDetailScreen from '../screens/detail/SymptomLogDetailScreen';
import TransfusionDetailScreen from '../screens/detail/TransfusionDetailScreen';
import AppointmentDetailScreen from '../screens/detail/AppointmentDetailScreen';
import AddAppointmentScreen from '../screens/detail/AddAppointmentScreen';
import PrivacySettingsScreen from '../screens/settings/PrivacySettingsScreen';
import MedicationRemindersScreen from '../screens/detail/MedicationRemindersScreen';
import PreVisitSummaryScreen from '../screens/detail/PreVisitSummaryScreen';
import ScanTransfusionScreen from '../screens/detail/ScanTransfusionScreen';
import ImportAppointmentsScreen from '../screens/detail/ImportAppointmentsScreen';
import IcsImportScreen from '../screens/detail/IcsImportScreen';
import FhirImportScreen from '../screens/detail/FhirImportScreen';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { COLORS } from '../config/theme';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, isLoading, isProfileComplete, isPdpaConsented } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <AuthNavigator />;
  }

  // Show PDPA consent screen before profile completion
  if (!isProfileComplete) {
    // If profile doesn't exist yet, they need to create one first (with consent)
    // The ProfileCompletionScreen handles initial profile creation
    return <ProfileCompletionScreen />;
  }

  // If profile exists but PDPA not consented, show consent screen
  if (!isPdpaConsented) {
    return <PDPAConsentScreen />;
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerTintColor: COLORS.primary,
        headerStyle: { backgroundColor: COLORS.white },
        headerBackTitle: t('common.back'),
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <RootStack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: t('passport.editProfile') }}
      />
      <RootStack.Screen
        name="NewSymptomLog"
        component={NewSymptomLogScreen}
        options={{ title: t('symptoms.logNew') }}
      />
      <RootStack.Screen
        name="SymptomLogDetail"
        component={SymptomLogDetailScreen}
        options={{ title: t('history.details') }}
      />
      <RootStack.Screen
        name="TransfusionDetail"
        component={TransfusionDetailScreen}
        options={{ title: t('history.details') }}
      />
      <RootStack.Screen
        name="AppointmentDetail"
        component={AppointmentDetailScreen}
        options={{ title: t('appointments.brief') }}
      />
      <RootStack.Screen
        name="AddAppointment"
        component={AddAppointmentScreen}
        options={{ title: t('appointments.addNew') }}
      />
      <RootStack.Screen
        name="PrivacySettings"
        component={PrivacySettingsScreen}
        options={{ title: t('privacy.title') }}
      />
      <RootStack.Screen
        name="MedicationReminders"
        component={MedicationRemindersScreen}
        options={{ title: t('medications.title') }}
      />
      <RootStack.Screen
        name="PreVisitSummary"
        component={PreVisitSummaryScreen}
        options={{ title: t('preVisit.title') }}
      />
      <RootStack.Screen
        name="ScanTransfusion"
        component={ScanTransfusionScreen}
        options={{ title: t('scan.title') }}
      />
      <RootStack.Screen
        name="ImportAppointments"
        component={ImportAppointmentsScreen}
        options={{ title: t('importAppt.title') }}
      />
      <RootStack.Screen
        name="IcsImport"
        component={IcsImportScreen}
        options={{ title: t('importAppt.ics.title') }}
      />
      <RootStack.Screen
        name="FhirImport"
        component={FhirImportScreen}
        options={{ title: t('importAppt.fhir.title') }}
      />
    </RootStack.Navigator>
  );
}
