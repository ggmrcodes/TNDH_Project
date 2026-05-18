import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';

interface DesktopSidebarProps {
  activeTab: string;
  onTabPress: (name: string) => void;
  tabLabels: Record<string, string>;
}

const NAV_ITEMS = [
  { name: 'Passport', icon: 'credit-card' },
  { name: 'SymptomMonitor', icon: 'heart' },
  { name: 'Appointments', icon: 'calendar' },
  { name: 'TransfusionHistory', icon: 'droplet' },
];

export default function DesktopSidebar({ activeTab, onTabPress, tabLabels }: DesktopSidebarProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.sidebar}>
      {/* App branding */}
      <View style={styles.brand}>
        <View style={styles.brandIcon}>
          <Text style={styles.brandLetter}>H</Text>
        </View>
        <View>
          <Text style={styles.brandName}>HaemoCare</Text>
          <Text style={styles.brandTag}>{t('app.tagline')}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Nav items */}
      <View style={styles.navList}>
        {NAV_ITEMS.map(({ name, icon }) => {
          const isFocused = activeTab === name;
          const label = tabLabels[name] || name;

          return (
            <TouchableOpacity
              key={name}
              onPress={() => onTabPress(name)}
              style={[styles.navItem, isFocused && styles.navItemActive]}
              activeOpacity={0.7}
            >
              <View style={[styles.navIconBg, isFocused && styles.navIconBgActive]}>
                <Feather
                  name={icon as any}
                  size={16}
                  color={isFocused ? COLORS.primary : COLORS.textLight}
                />
              </View>
              <Text
                style={[
                  styles.navLabel,
                  isFocused && styles.navLabelActive,
                ]}
              >
                {label}
              </Text>
              {isFocused && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.sidebarFooter}>
        <View style={styles.pdpaBadge}>
          <View style={styles.pdpaIcon}>
            <Feather name="shield" size={10} color={COLORS.statusNormal} />
          </View>
          <Text style={styles.pdpaText}>PDPA Compliant</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 250,
    backgroundColor: COLORS.surfaceElevated,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderLight,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.glow,
  },
  brandLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  brandTag: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textLight,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  navList: {
    flex: 1,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  navIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navIconBgActive: {
    backgroundColor: COLORS.white,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    flex: 1,
  },
  navLabelActive: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  sidebarFooter: {
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  pdpaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
  },
  pdpaIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: COLORS.statusNormalBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdpaText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textLight,
  },
});
