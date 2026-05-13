import React, { useState, useCallback } from 'react';
import { View, FlatList, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import * as realApptService from '../../services/appointmentService';
import * as mockServices from '../../mock/services';
import { Appointment } from '../../types/database';
import { formatDate, formatDateTime, daysUntil } from '../../utils/dateHelpers';
import LanguageToggle from '../../components/common/LanguageToggle';
import OverdueBanner from '../../components/common/OverdueBanner';
import { useOverdueState } from '../../hooks/useOverdueState';
import EmergencyContactSheet from '../../components/emergency/EmergencyContactSheet';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
import ResponsiveContainer from '../../components/common/ResponsiveContainer';
import EmptyState from '../../components/common/EmptyState';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

export default function AppointmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, isMockMode, profile } = useAuth();
  const { t, language } = useLanguage();
  const { isDesktop } = useResponsive();
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);

  const { overdueState, refresh: refreshOverdue } = useOverdueState();
  const { contacts } = useEmergencyContacts();
  const [notifySheetVisible, setNotifySheetVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshOverdue();
      if (!user) return;
      let cancelled = false;
      (async () => {
        const [u, p] = isMockMode
          ? await Promise.all([mockServices.getUpcomingAppointments(), mockServices.getPastAppointments()])
          : await Promise.all([realApptService.getUpcomingAppointments(user.id), realApptService.getPastAppointments(user.id)]);
        if (!cancelled) { setUpcoming(u); setPast(p); }
      })();
      return () => { cancelled = true; };
    }, [user, isMockMode, refreshOverdue])
  );

  const nextAppt = upcoming[0];
  const nextDays = nextAppt ? daysUntil(nextAppt.scheduled_date) : 0;

  const renderApptCard = ({ item }: { item: Appointment }) => {
    const days = daysUntil(item.scheduled_date);
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.apptCard}>
          <View style={styles.apptDateRow}>
            <View style={styles.apptIconBg}>
              <Feather name="calendar" size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.apptDate}>{formatDateTime(item.scheduled_date, language)}</Text>
          </View>
          <View style={styles.apptInfoRow}>
            <Feather name="map-pin" size={14} color={COLORS.textLight} />
            <Text style={styles.apptHospital} numberOfLines={1}>{item.hospital}</Text>
          </View>
          {item.notes ? (
            <View style={styles.apptInfoRow}>
              <Feather name="file-text" size={14} color={COLORS.textLight} />
              <Text style={styles.apptNotes} numberOfLines={2}>{item.notes}</Text>
            </View>
          ) : null}
          {days >= 0 && (
            <View style={styles.countdownPill}>
              <Feather name="clock" size={12} color={COLORS.primary} />
              <Text style={styles.countdownText}>
                {days === 0 ? t('appointments.today') : days === 1 ? t('appointments.tomorrow') : `${days} ${t('appointments.daysUntil')}`}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ResponsiveContainer>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('appointments.title')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ImportAppointments')}
              activeOpacity={0.7}
              style={styles.importBtn}
            >
              <Feather name="download" size={14} color={COLORS.primary} />
              <Text style={styles.importBtnText}>{t('importAppt.cta')}</Text>
            </TouchableOpacity>
            <LanguageToggle />
          </View>
        </View>

        <FlatList
          data={[...upcoming, ...past]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {overdueState?.isOverdue && (
                <OverdueBanner
                  daysOverdue={overdueState.daysOverdue}
                  variant="appointments"
                  onPressCta={() => navigation.navigate('AddAppointment')}
                  onPressNotify={
                    overdueState.bumpTiers === 2 && contacts.length > 0
                      ? () => setNotifySheetVisible(true)
                      : undefined
                  }
                />
              )}
              <EmergencyContactSheet
                visible={notifySheetVisible}
                onClose={() => setNotifySheetVisible(false)}
                contacts={contacts}
                context="overdue"
                patientName={profile?.full_name?.trim() || profile?.patient_id || ''}
                daysOverdue={overdueState?.isOverdue ? overdueState.daysOverdue : undefined}
              />
              {nextAppt && (
                <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
                  <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                    <Defs>
                      <SvgLinearGradient id="apptGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#074F4F" />
                        <Stop offset="50%" stopColor="#0B6E6E" />
                        <Stop offset="100%" stopColor="#14A39A" />
                      </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#apptGrad)" rx={22} />
                  </Svg>
                  <View style={styles.heroDecoCircle} />
                  <View style={styles.heroIconBg}>
                    <Feather name="calendar" size={24} color={COLORS.white} />
                  </View>
                  <View style={styles.heroTextCol}>
                    <Text style={styles.heroTitle}>Next: {formatDate(nextAppt.scheduled_date, language)}</Text>
                    <Text style={styles.heroSub}>
                      Monthly transfusion · {nextDays} days away
                    </Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={styles.preVisitBtn}
                onPress={() => navigation.navigate('PreVisitSummary')}
                activeOpacity={0.7}
              >
                <View style={styles.preVisitIconBg}>
                  <Feather name="clipboard" size={14} color={COLORS.primary} />
                </View>
                <View style={styles.preVisitTextCol}>
                  <Text style={styles.preVisitTitle}>{t('preVisit.open')}</Text>
                  <Text style={styles.preVisitSub}>{t('preVisit.subtitle')}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={COLORS.textLight} />
              </TouchableOpacity>

              {upcoming.length > 0 && (
                <View style={styles.sectionRow}>
                  <Feather name="clock" size={14} color={COLORS.textLight} />
                  <Text style={styles.sectionLabel}>{t('appointments.upcoming').toUpperCase()}</Text>
                </View>
              )}
            </>
          }
          renderItem={renderApptCard}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.scheduleBtn}
              onPress={() => navigation.navigate('AddAppointment')}
              activeOpacity={0.7}
            >
              <Feather name="calendar" size={18} color={COLORS.primary} />
              <Text style={styles.scheduleBtnText}>Schedule New Appointment</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={<EmptyState icon="calendar-outline" message={t('appointments.noUpcoming')} />}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  importBtnText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.primary },
  list: { padding: SPACING.md, paddingBottom: 100 },
  heroCard: {
    overflow: 'hidden', borderRadius: 22, padding: SPACING.lg,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg,
    position: 'relative', ...SHADOWS.glow,
  },
  heroCardDesktop: {},
  heroDecoCircle: {
    position: 'absolute', bottom: -30, right: -10,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroIconBg: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
  },
  heroTextCol: { flex: 1, zIndex: 1 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white, letterSpacing: -0.3 },
  heroSub: { ...TYPOGRAPHY.bodySmall, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  apptCard: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.lg, padding: SPACING.md,
    marginBottom: SPACING.sm + 2, borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    gap: 8, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.card,
  },
  apptDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apptIconBg: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  apptDate: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.primary },
  apptInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 2 },
  apptHospital: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.text, flex: 1 },
  apptNotes: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primaryLight, paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: RADIUS.full, alignSelf: 'flex-start',
  },
  countdownText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.primary },
  scheduleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, borderRadius: 16, borderWidth: 2, borderColor: COLORS.primary,
    backgroundColor: COLORS.white, marginTop: SPACING.md,
  },
  scheduleBtnText: { ...TYPOGRAPHY.button, color: COLORS.primary },
  preVisitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm + 2,
    backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  preVisitIconBg: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  preVisitTextCol: { flex: 1 },
  preVisitTitle: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.text },
  preVisitSub: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
});
