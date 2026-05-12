import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { MainTabParamList } from '../types/navigation';
import { useLanguage } from '../contexts/LanguageContext';
import { useResponsive } from '../utils/responsive';
import PassportScreen from '../screens/tabs/PassportScreen';
import SymptomMonitorScreen from '../screens/tabs/SymptomMonitorScreen';
import AppointmentsScreen from '../screens/tabs/AppointmentsScreen';
import TransfusionHistoryScreen from '../screens/tabs/TransfusionHistoryScreen';
import DesktopSidebar from '../components/common/DesktopSidebar';
import { COLORS } from '../config/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, string> = {
  Passport: 'credit-card',
  SymptomMonitor: 'heart',
  Appointments: 'calendar',
  TransfusionHistory: 'droplet',
};

const SCREENS: Record<string, React.ComponentType<any>> = {
  Passport: PassportScreen,
  SymptomMonitor: SymptomMonitorScreen,
  Appointments: AppointmentsScreen,
  TransfusionHistory: TransfusionHistoryScreen,
};

/**
 * On mobile: standard bottom tab navigator.
 * On desktop/tablet: custom sidebar + manual screen rendering (avoids bottom-tabs column layout).
 */
export default function MainTabNavigator() {
  const { t } = useLanguage();
  const { isMobile } = useResponsive();

  const tabLabels: Record<string, string> = {
    Passport: t('tab.passport'),
    SymptomMonitor: t('tab.log'),
    Appointments: t('tab.appointments'),
    TransfusionHistory: t('tab.history'),
  };

  // Desktop: custom sidebar layout
  if (!isMobile) {
    return <DesktopTabLayout tabLabels={tabLabels} />;
  }

  // Mobile: standard bottom tabs
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          const iconName = TAB_ICONS[route.name] as keyof typeof Feather.glyphMap;
          return (
            <View style={tabStyles.iconWrapper}>
              <Feather name={iconName} size={22} color={color} />
              {focused && <View style={tabStyles.activeDot} />}
            </View>
          );
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surfaceElevated,
          borderTopColor: COLORS.borderLight,
          borderTopWidth: 1,
          paddingBottom: 6,
          height: 68,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: -2,
          letterSpacing: 0.2,
        },
      })}
    >
      <Tab.Screen name="Passport" component={PassportScreen} options={{ tabBarLabel: tabLabels.Passport }} />
      <Tab.Screen name="SymptomMonitor" component={SymptomMonitorScreen} options={{ tabBarLabel: tabLabels.SymptomMonitor }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} options={{ tabBarLabel: tabLabels.Appointments }} />
      <Tab.Screen name="TransfusionHistory" component={TransfusionHistoryScreen} options={{ tabBarLabel: tabLabels.TransfusionHistory }} />
    </Tab.Navigator>
  );
}

/** Desktop layout: sidebar on the left, active screen on the right */
function DesktopTabLayout({ tabLabels }: { tabLabels: Record<string, string> }) {
  const [activeTab, setActiveTab] = useState('Passport');
  const ActiveScreen = SCREENS[activeTab] || PassportScreen;

  return (
    <View style={desktopStyles.container}>
      <DesktopSidebar
        activeTab={activeTab}
        onTabPress={setActiveTab}
        tabLabels={tabLabels}
      />
      <View style={desktopStyles.content}>
        <ActiveScreen />
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconWrapper: { alignItems: 'center', gap: 3 },
  activeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.primary },
});

const desktopStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
