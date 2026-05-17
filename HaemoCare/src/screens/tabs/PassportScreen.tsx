import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import { generatePassportPdf } from '../../utils/pdfGenerator';
import { daysSince, daysUntil } from '../../utils/dateHelpers';
import * as mockServices from '../../mock/services';
import * as realTransfusionService from '../../services/transfusionService';
import * as realApptService from '../../services/appointmentService';
import * as realSymptomService from '../../services/symptomService';
import { Transfusion, SymptomLog } from '../../types/database';
import QRCodeView from '../../components/passport/QRCodeView';
import UpdateBanner from '../../components/common/UpdateBanner';
import LanguageToggle from '../../components/common/LanguageToggle';
import EmergencySosButton from '../../components/emergency/EmergencySosButton';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
import ResponsiveContainer from '../../components/common/ResponsiveContainer';
import TodayMedicationWidget from '../../components/medications/TodayMedicationWidget';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useUpdateContext } from '../../contexts/UpdateContext';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

function GradientBackground({ borderRadius }: { borderRadius?: number }) {
  return (
    <Svg
      style={[StyleSheet.absoluteFill, borderRadius ? { borderRadius } : undefined]}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <SvgLinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#074F4F" />
          <Stop offset="45%" stopColor="#0B6E6E" />
          <Stop offset="100%" stopColor="#14A39A" />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill="url(#heroGrad)" />
    </Svg>
  );
}

export default function PassportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, user, isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const { isMobile, isDesktop } = useResponsive();
  const { contacts } = useEmergencyContacts();
  const { status: updateStatus } = useUpdateContext();
  const [showQR, setShowQR] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [txCount, setTxCount] = useState(0);
  const [daysSinceLastTx, setDaysSinceLastTx] = useState<number | null>(null);
  const [daysToNextAppt, setDaysToNextAppt] = useState<number | null>(null);
  const [allTransfusions, setAllTransfusions] = useState<Transfusion[]>([]);
  const [allSymptomLogs, setAllSymptomLogs] = useState<SymptomLog[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        if (isMockMode) {
          const txs = await mockServices.getTransfusions();
          const appts = await mockServices.getUpcomingAppointments();
          const logs = await mockServices.getSymptomLogs(user.id);
          setTxCount(txs.length);
          setAllTransfusions(txs);
          setAllSymptomLogs(logs);
          setDaysSinceLastTx(txs.length > 0 ? daysSince(txs[0].date) : null);
          setDaysToNextAppt(appts.length > 0 ? daysUntil(appts[0].scheduled_date) : null);
        } else {
          const txs = await realTransfusionService.getTransfusions(user.id);
          const appts = await realApptService.getUpcomingAppointments(user.id);
          const logs = await realSymptomService.getSymptomLogs(user.id);
          setTxCount(txs.length);
          setAllTransfusions(txs);
          setAllSymptomLogs(logs);
          setDaysSinceLastTx(txs.length > 0 ? daysSince(txs[0].date) : null);
          setDaysToNextAppt(appts.length > 0 ? daysUntil(appts[0].scheduled_date) : null);
        }
      })();
    }, [user, isMockMode])
  );

  if (!profile) return <LoadingSpinner />;

  const handleExportPdf = async () => {
    setExporting(true);
    try { await generatePassportPdf(profile, language, allSymptomLogs, allTransfusions); } catch (err) { console.error(err); }
    setExporting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ResponsiveContainer>
        <View style={styles.topBar}>
          <Text style={styles.brand}>HaemoCare</Text>
          <LanguageToggle />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <UpdateBanner status={updateStatus} />
          {/* Hero Card with SVG gradient */}
          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <GradientBackground borderRadius={isDesktop ? 24 : 0} />

            {/* Decorative circles */}
            <View style={styles.decoCircle1} />
            <View style={styles.decoCircle2} />

            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>TRANSFUSION PASSPORT</Text>
              <Feather name="shield" size={18} color="rgba(255,255,255,0.35)" />
            </View>
            <View style={styles.heroMain}>
              <View style={styles.bloodBadge}>
                <Text style={styles.bloodText}>{profile.blood_type}{profile.rh_factor}</Text>
              </View>
              <View style={styles.nameCol}>
                <Text style={styles.patientName} numberOfLines={2}>{profile.full_name}</Text>
                <Text style={styles.bloodLabel} numberOfLines={1}>Blood Type {profile.blood_type}  ·  Rh{profile.rh_factor === '+' ? ' Positive' : ' Negative'}</Text>
              </View>
            </View>

            {/* Patient ID Row */}
            <View style={styles.patientIdRow}>
              <View style={styles.patientIdChip}>
                <Feather name="user" size={12} color={COLORS.white} />
                <Text style={styles.patientIdText} numberOfLines={1}>{profile.patient_id}</Text>
              </View>
              <TouchableOpacity
                style={styles.privacyBtn}
                onPress={() => navigation.navigate('PrivacySettings')}
                activeOpacity={0.7}
              >
                <Feather name="lock" size={12} color="rgba(255,255,255,0.8)" />
                <Text style={styles.privacyBtnText} numberOfLines={1}>{t('privacy.title')}</Text>
              </TouchableOpacity>
            </View>

            {profile.antibodies.length > 0 && (
              <View style={styles.abRow}>
                {profile.antibodies.map((ab, i) => (
                  <View key={i} style={styles.abChip}>
                    <Text style={styles.abChipText}>{ab}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <EmergencySosButton
            contacts={contacts}
            patientName={profile.full_name?.trim() || profile.patient_id || ''}
          />

          {/* Health Stats — overlapping the hero slightly */}
          <View style={[styles.statsRow, isDesktop && styles.statsRowDesktop]}>
            <View style={[styles.statCard, styles.statCardFirst]}>
              <Feather name="droplet" size={20} color={COLORS.primary} />
              <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit>{txCount}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{t('passport.stats.transfusions')}</Text>
            </View>
            <View style={styles.statCard}>
              <Feather name="calendar" size={20} color={COLORS.accent} />
              <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit>{daysSinceLastTx !== null ? `${daysSinceLastTx}d` : '—'}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{t('passport.stats.sinceLast')}</Text>
            </View>
            <View style={[styles.statCard, styles.statCardLast]}>
              <Feather name="clock" size={20} color={COLORS.statusNormal} />
              <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit>{daysToNextAppt !== null ? `${daysToNextAppt}d` : '—'}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{t('passport.stats.nextAppt')}</Text>
            </View>
          </View>

          {/* Info cards */}
          <View style={isDesktop ? styles.infoRow : undefined}>
            {/* Reactions Card */}
            <View style={[styles.infoCard, isDesktop && styles.infoCardDesktop]}>
              <View style={styles.infoHeader}>
                <View style={styles.infoIconBg}>
                  <Feather name="alert-circle" size={14} color={COLORS.statusMonitor} />
                </View>
                <Text style={styles.infoLabel}>{t('passport.reactions').toUpperCase()}</Text>
              </View>
              <Text style={styles.infoText}>{profile.known_reactions || t('passport.noReactions')}</Text>
            </View>

            {/* Medications Card */}
            <View style={[styles.infoCard, isDesktop && styles.infoCardDesktop]}>
              <View style={styles.infoHeader}>
                <View style={[styles.infoIconBg, { backgroundColor: COLORS.primaryLight }]}>
                  <Feather name="heart" size={14} color={COLORS.primary} />
                </View>
                <Text style={styles.infoLabel}>{t('passport.medications').toUpperCase()}</Text>
              </View>
              <Text style={styles.infoText}>{profile.medications || t('passport.noMedications')}</Text>
            </View>
          </View>

          {/* Today's Medication Widget */}
          <TodayMedicationWidget onPress={() => navigation.navigate('MedicationReminders')} />

          {showQR && <QRCodeView profile={profile} />}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleExportPdf} activeOpacity={0.8}>
              <Feather name="share" size={16} color={COLORS.white} />
              <Text style={styles.primaryBtnText} numberOfLines={1}>{t('common.share')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowQR(!showQR)} activeOpacity={0.7}>
              <Feather name="grid" size={16} color={COLORS.primary} />
              <Text style={styles.outlineBtnText} numberOfLines={1}>{t('common.qrCode')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.7}>
              <Feather name="edit-2" size={16} color={COLORS.textSecondary} />
              <Text style={styles.ghostBtnText} numberOfLines={1}>{t('common.edit')}</Text>
            </TouchableOpacity>
          </View>

          {/* PDPA badge */}
          <View style={styles.pdpaBadge}>
            <Feather name="shield" size={12} color={COLORS.textLight} />
            <Text style={styles.pdpaBadgeText}>{t('pdpa.compliant')}</Text>
          </View>
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, zIndex: 10,
  },
  brand: { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xxl },
  // Hero — rich gradient with decorative elements
  hero: {
    overflow: 'hidden',
    paddingTop: SPACING.lg, paddingBottom: SPACING.lg, paddingHorizontal: SPACING.lg, gap: 16,
    position: 'relative',
  },
  heroDesktop: {
    borderRadius: 24, marginHorizontal: SPACING.md, marginTop: SPACING.sm,
  },
  decoCircle1: {
    position: 'absolute', top: -30, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decoCircle2: {
    position: 'absolute', bottom: -20, left: 40,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5 },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 16, zIndex: 1 },
  bloodBadge: {
    width: 78, height: 78, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  bloodText: { fontSize: 32, fontWeight: '800', color: COLORS.white, letterSpacing: -1 },
  nameCol: { flex: 1, gap: 4, zIndex: 1 },
  patientName: { fontSize: 22, fontWeight: '800', color: COLORS.white, letterSpacing: -0.3 },
  bloodLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  patientIdRow: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1 },
  patientIdChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 14,
  },
  patientIdText: { fontSize: 14, fontWeight: '700', color: COLORS.white, letterSpacing: 0.5 },
  privacyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: RADIUS.full,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  privacyBtnText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  abRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, zIndex: 1 },
  abChip: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 14,
  },
  abChipText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  statsRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  statsRowDesktop: { paddingHorizontal: SPACING.md },
  statCard: {
    flex: 1, backgroundColor: COLORS.surfaceElevated, borderRadius: 18, padding: 16, alignItems: 'center', gap: 6,
    ...SHADOWS.elevated,
  },
  statCardFirst: {},
  statCardLast: {},
  statNum: { ...TYPOGRAPHY.statNumber, color: COLORS.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textLight, letterSpacing: 0.3 },
  // Info cards
  infoRow: { flexDirection: 'row', gap: 10, marginHorizontal: SPACING.md, marginTop: SPACING.md },
  infoCard: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: 18, padding: SPACING.md, gap: 10,
    marginHorizontal: SPACING.md, marginTop: SPACING.md, ...SHADOWS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  infoCardDesktop: { flex: 1, marginHorizontal: 0, marginTop: 0 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoIconBg: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.statusMonitorBg,
    justifyContent: 'center', alignItems: 'center',
  },
  infoLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  infoText: { ...TYPOGRAPHY.body, color: COLORS.text, lineHeight: 22 },
  // Actions
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: SPACING.md, marginTop: SPACING.lg },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 14, backgroundColor: COLORS.primary,
    ...SHADOWS.glow,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 14, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.white,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  ghostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white,
  },
  ghostBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
  pdpaBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: SPACING.lg, marginBottom: SPACING.md },
  pdpaBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
});
