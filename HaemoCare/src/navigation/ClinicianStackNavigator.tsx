import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ClinicianStackParamList } from '../types/navigation';
import ClinicianDashboardScreen from '../screens/clinician/ClinicianDashboardScreen';

const Stack = createNativeStackNavigator<ClinicianStackParamList>();

export default function ClinicianStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Web fix: native-stack on react-native-web wraps each screen in
        // a container that doesn't propagate flex:1 height by default,
        // collapsing the dashboard's two-pane layout. Forcing contentStyle
        // to flex:1 restores the height chain. No-op on native.
        contentStyle: { flex: 1 },
      }}
    >
      <Stack.Screen name="ClinicianDashboard" component={ClinicianDashboardScreen} />
    </Stack.Navigator>
  );
}
