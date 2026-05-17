import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/contexts/AuthContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { UpdateProvider } from './src/contexts/UpdateContext';
import AppNavigator from './src/navigation/AppNavigator';
import NotificationGate from './src/components/NotificationGate';
import { useAppFonts } from './src/hooks/useAppFonts';

export default function App() {
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) return null;
  return (
    <AuthProvider>
      <LanguageProvider>
        <UpdateProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            {/* Runs notification permission/channel init and tap-handler
                wiring for medication reminders. See brief 2026-05-17. */}
            <NotificationGate />
            <AppNavigator />
          </NavigationContainer>
        </UpdateProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
