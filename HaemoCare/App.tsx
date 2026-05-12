import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/contexts/AuthContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppFonts } from './src/hooks/useAppFonts';

export default function App() {
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) return null;
  return (
    <AuthProvider>
      <LanguageProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <AppNavigator />
        </NavigationContainer>
      </LanguageProvider>
    </AuthProvider>
  );
}
