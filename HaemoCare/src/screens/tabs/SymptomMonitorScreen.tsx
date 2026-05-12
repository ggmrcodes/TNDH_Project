import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import * as realSymptomService from '../../services/symptomService';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';
import { hoursRemaining72, isWithin72Hours, daysSince, formatDate } from '../../utils/dateHelpers';
import { SYMPTOM_ICON_MAP } from '../../utils/clinicalThresholds';
import { SymptomLog, Transfusion, Outcome } from '../../types/database';
import LanguageToggle from '../../components/common/LanguageToggle';
import ResponsiveContainer from '../../components/common/ResponsiveContainer';
import EmptyState from '../../components/common/EmptyState';
import { TranslationKey } from '../../i18n';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

const OUTCOME_COLORS: Record<Outcome, { bg: string; color: string; icon: string; gradient: [string, string] }> = {
  normal: { bg: COLORS.statusNormalBg, color: COLORS.statusNormal, icon: 'check-circle', gradient: ['#0EA572', '#34D399'] },
  monitor: { bg: COLORS.statusMonitorBg, color: COLORS.statusMonitor, icon: 'eye', gradient: ['#E8933A', '#FBB040'] },
  urgent: { bg: COLORS.statusUrgentBg, color: COLORS.statusUrgent, icon: 'alert-triangle', gradient: ['#DC3B3B', '#F87171'] },
};

function HealthRing({ percentage, color, gradientColors }: { percentage: number; color: string; gradientColors: [string, string] }) {
  const size = 88;
  const strokeWidth = 7;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - percentage / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <SvgLinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradientColors[0]} />
            <Stop offset="100%" stopColor={gradientColors[1]} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.borderLight} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringGrad)" strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference}`} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" rotation="-90" origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Feather name="heart" size={26} color={color} />
    </View>
  );
}

export default function SymptomMonitorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const { isMobile, isDesktop } = useResponsive();
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [latestTx, setLatestTx] = useState<Transfusion | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        const [logsData, tx] = isMockMode
          ? await Promise.all([mockServices.getSymptomLogs(user.id, 20), mockServices.getLatestTransfusion()])
          : await Promise.all([realSymptomService.getSymptomLogs(user.id, 20), realTransfusionService.getLatestTransfusion(user.id)]);
        if (!cancelled) { setLogs(logsData); setLatestTx(tx); setLoading(false); }
      })();
      return () => { cancelled = true; };
    }, [user, isMockMode])
  );

  const overallStatus = useMemo((): Outcome => {
    if (logs.length === 0) return 'normal';
    const recent = logs.slice(0, 5);
    if (recent.some(l => l.outcome === 'urgent')) return 'urgent';
    if (recent.some(l => l.outcome === 'monitor')) return 'monitor';
    return 'normal';
  }, [logs]);

  const cfg = OUTCOME_COLORS[overallStatus];
  const statusLabel = overallStatus === 'urgent' ? 'Needs Attention' : overallStatus === 'monitor' ? 'Monitor Closely' : 'Overall: Normal';
  const ringPct = overallStatus === 'urgent' ? 40 : overallStatus === 'monitor' ? 65 : 85;
  const activeMonitoring = latestTx && isWithin72Hours(latestTx.date);
  const remaining = latestTx ? hoursRemaining72(latestTx.date) : 0;

  const renderLogItem = ({ item }: { item: SymptomLog }) => {
    const itemCfg = OUTCOME_COLORS[item.outcome];
    const symptoms = item.symptoms as string[];
    const sympSummary = symptoms.map(s => `${t(`symptom.${s}` as TranslationKey).split(' ')[0]} ${item.severity_scores[s] || 0}`).join(', ');

    return (
      <View style={styles.logItem}>
        <View style={[styles.logDotLine]}>
          <View style={[styles.logDot, { backgroundColor: itemCfg.color }]} />
          <View style={styles.logLine} />
        </View>
        <View style={styles.logCard}>
          <Text style={styles.logTitle} numberOfLines={1}>
            {formatDate(item.logged_at, language)} · {sympSummary}
          </Text>
          <Text style={styles.logSub}>
            Post-transfusion — {t(`status.${item.outcome}` as TranslationKey)}
          </Text>
        </View>
        <View style={[styles.logBadge, { backgroundColor: itemCfg.bg }]}>
          <Feather name={itemCfg.icon as any} size={14} color={itemCfg.color} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ResponsiveContainer>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('symptoms.title')}</Text>
          <LanguageToggle />
        </View>

        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={isDesktop ? styles.topRowDesktop : undefined}>
                {/* Health Status Card */}
                <View style={[styles.statusCard, isDesktop && styles.statusCardDesktop]}>
                  <HealthRing percentage={ringPct} color={cfg.color} gradientColors={cfg.gradient} />
                  <View style={styles.statusCol}>
                    <Text style={[styles.statusTitle, { color: cfg.color }]}>{statusLabel}</Text>
                    <Text style={styles.statusSub}>
                      Last log {logs.length > 0 ? `${daysSince(logs[0].logged_at)}d ago` : 'never'} · {logs.length} total logs
                    </Text>
                    <Text style={styles.statusDetail}>
                      {overallStatus === 'normal' ? 'No urgent symptoms flagged' :
                       overallStatus === 'monitor' ? 'Some symptoms need monitoring' :
                       'Contact your care team'}
                    </Text>
                  </View>
                </View>

                {/* Active Monitoring */}
                {activeMonitoring && (
                  <View style={[styles.monitorBanner, isDesktop && styles.monitorBannerDesktop]}>
                    <View style={styles.monitorIcon}>
                      <Feather name="activity" size={18} color={COLORS.white} />
                    </View>
                    <View style={styles.monitorText}>
                      <Text style={styles.monitorTitle}>72hr Monitoring Active</Text>
                      <Text style={styles.monitorSub}>{Math.round(remaining)}h remaining · Last transfusion {latestTx ? formatDate(latestTx.date, language) : ''}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Log Button */}
              <TouchableOpacity
                style={styles.logBtn}
                onPress={() => navigation.navigate('NewSymptomLog', { transfusionId: latestTx?.id })}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={18} color={COLORS.white} />
                <Text style={styles.logBtnText}>{t('symptoms.logNew')}</Text>
              </TouchableOpacity>

              {logs.length > 0 && (
                <View style={styles.sectionRow}>
                  <Feather name="list" size={14} color={COLORS.textLight} />
                  <Text style={styles.sectionLabel}>RECENT TIMELINE</Text>
                </View>
              )}
            </>
          }
          renderItem={renderLogItem}
          ListEmptyComponent={!loading ? <EmptyState icon="heart-outline" message={t('symptoms.noLogs')} /> : null}
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
  list: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  // Desktop top row
  topRowDesktop: { flexDirection: 'row', gap: 12, marginBottom: SPACING.md },
  // Health status
  statusCard: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: 22,
    padding: 22, flexDirection: 'row', alignItems: 'center', gap: 20,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.elevated,
  },
  statusCardDesktop: { flex: 1, marginBottom: 0 },
  statusCol: { flex: 1, gap: 5 },
  statusTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  statusSub: { fontSize: 12, color: COLORS.textSecondary },
  statusDetail: { fontSize: 12, color: COLORS.textLight },
  // Monitor banner
  monitorBanner: {
    backgroundColor: COLORS.primaryLight, borderRadius: 16,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.primaryMuted, marginBottom: SPACING.md,
  },
  monitorBannerDesktop: { flex: 1, marginBottom: 0, alignSelf: 'stretch' },
  monitorIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.glow,
  },
  monitorText: { flex: 1, gap: 2 },
  monitorTitle: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  monitorSub: { fontSize: 12, color: COLORS.primaryDark },
  // Log button
  logBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, height: 52, borderRadius: 16,
    backgroundColor: COLORS.primary, marginBottom: SPACING.lg,
    ...SHADOWS.glow,
  },
  logBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  // Section
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  // Timeline log items — now with a vertical timeline line
  logItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginBottom: 2,
  },
  logDotLine: { alignItems: 'center', width: 20, paddingTop: 16 },
  logDot: { width: 10, height: 10, borderRadius: 5, zIndex: 1 },
  logLine: { width: 2, flex: 1, backgroundColor: COLORS.borderLight, marginTop: 4 },
  logCard: {
    flex: 1, backgroundColor: COLORS.surfaceElevated, borderRadius: 14,
    padding: 14, gap: 4, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.card,
  },
  logTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  logSub: { fontSize: 12, color: COLORS.textSecondary },
  logBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
});
