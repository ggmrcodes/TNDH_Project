import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabParamList } from '../types/navigation';
import { useLanguage } from '../contexts/LanguageContext';
import { useResponsive } from '../utils/responsive';
import { usePatientLinkRequests } from '../hooks/usePatientLinkRequests';
import PassportScreen from '../screens/tabs/PassportScreen';
import SymptomMonitorScreen from '../screens/tabs/SymptomMonitorScreen';
import AppointmentsScreen from '../screens/tabs/AppointmentsScreen';
import TransfusionHistoryScreen from '../screens/tabs/TransfusionHistoryScreen';
import DesktopSidebar from '../components/common/DesktopSidebar';
import LinkRequestBanner from '../components/patient/LinkRequestBanner';
import LinkRequestModal from '../components/patient/LinkRequestModal';
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
  const insets = useSafeAreaInsets();
  const { pending, refresh: refreshPending } = usePatientLinkRequests();
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  const tabLabels: Record<string, string> = {
    Passport: t('tab.passport'),
    SymptomMonitor: t('tab.log'),
    Appointments: t('tab.appointments'),
    TransfusionHistory: t('tab.history'),
  };

  // Banner sits above whichever layout we render. Putting it inside the
  // navigator keeps it visible across every tab without re-mounting.
  const bannerOverlay = (
    <>
      <LinkRequestBanner pending={pending} onPress={() => setIsLinkModalOpen(true)} />
      <LinkRequestModal
        visible={isLinkModalOpen}
        pending={pending}
        onClose={() => setIsLinkModalOpen(false)}
        onAnyResponse={refreshPending}
      />
    </>
  );

  // Desktop: custom sidebar layout
  if (!isMobile) {
    return (
      <View style={wrapperStyles.root}>
        {bannerOverlay}
        <DesktopTabLayout tabLabels={tabLabels} />
      </View>
    );
  }

  // Honour the system gesture/home-indicator inset so taps in the bottom
  // row of each tab don't fall inside the OS swipe-home zone (Android 10+
  // gesture nav) or under the iOS home indicator. Floor of 6 keeps the
  // bar from hugging the screen edge on devices without an inset (older
  // Android 3-button nav, older iPhones).
  const bottomInset = Math.max(6, insets.bottom);
  // 56dp is the Material bottom-nav body height; adding the inset gives an
  // overall hit-target column ≥48dp for each tab button while leaving the
  // bottom safe zone untouched.
  const tabBarHeight = 56 + bottomInset;

  // Mobile: standard bottom tabs
  return (
    <View style={wrapperStyles.root}>
      {bannerOverlay}
      <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          const iconName = TAB_ICONS[route.name] as keyof typeof Feather.glyphMap;
          return (
            <View style={tabStyles.iconWrapper}>
              <Feather name={iconName} size={24} color={color} />
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
          paddingBottom: bottomInset,
          height: tabBarHeight,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
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
    </View>
  );
}

const wrapperStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
});

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
