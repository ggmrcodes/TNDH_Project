import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ClinicianStackParamList } from '../types/navigation';
import ClinicianDashboardScreen from '../screens/clinician/ClinicianDashboardScreen';

const Stack = createNativeStackNavigator<ClinicianStackParamList>();

export default function ClinicianStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClinicianDashboard" component={ClinicianDashboardScreen} />
    </Stack.Navigator>
  );
}
