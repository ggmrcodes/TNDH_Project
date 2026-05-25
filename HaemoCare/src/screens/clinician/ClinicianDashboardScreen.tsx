import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import { useAssignedPatients } from '../../hooks/useAssignedPatients';
import { computeOverdueState, OverdueState } from '../../utils/overdueVisit';
import { sortTriageDescending, type TriageInput } from '../../utils/triageQueue';
import * as mockServices from '../../mock/services';
import * as realClinicianService from '../../services/clinicianService';
import AlertsStrip from '../../components/clinician/AlertsStrip';
import CohortOverviewCard from '../../components/clinician/CohortOverviewCard';
import FilterChips, { FilterId } from '../../components/clinician/FilterChips';
import PatientQueueRow from '../../components/clinician/PatientQueueRow';
import PendingPatientRow from '../../components/clinician/PendingPatientRow';
import AddPatientButton from '../../components/clinician/AddPatientButton';
import AddPatientModal from '../../components/clinician/AddPatientModal';
import PatientDetailPane from '../../components/clinician/PatientDetailPane';
// Wave-1 brief slots (2026-05-17). See specs in docs/superpowers/specs/.
import PreTransfusionLabsPanel from '../../components/clinician/PreTransfusionLabsPanel';
import MedicationAdherenceCard from '../../components/clinician/MedicationAdherenceCard';
import QueueSearchBar from '../../components/clinician/QueueSearchBar';
import QueueSortSelector, { type SortKey } from '../../components/clinician/QueueSortSelector';
import LanguageToggle from '../../components/common/LanguageToggle';
import HeroGradient from '../../components/common/HeroGradient';
import { computeCohortAlerts, type AlertSlice } from '../../utils/cohortAlerts';
import { computeOverdueHistory14d, type OverdueHistorySlice } from '../../utils/cohortHistory';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { confirm } from '../../utils/confirm';
import { TranslationKey } from '../../i18n';
import type { Profile, Outcome, Transfusion, SymptomLog, Appointment, ClinicianProfile } from '../../types/database';

interface PatientSlice {
  profile: Profile;
  latestTx: Transfusion | null;
  pastAppt: Appointment | null;
  recentLogs: SymptomLog[];
  overdueState: OverdueState;
  worstRecentOutcome: Outcome;
  hasReactionOnFile: boolean;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export default function ClinicianDashboardScreen() {
  const { user, signOut, isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const { isDesktop, isWide } = useResponsive();
  const { patients, pendingLinks, loading, refresh: refreshAssigned } = useAssignedPatients();
  const [slices, setSlices] = useState<PatientSlice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('triage');
  const [clinicianProfile, setClinicianProfile] = useState<ClinicianProfile | null>(null);
  // Mobile-only: the patient queue is hidden behind a hamburger and slides
  // in as an overlay. On desktop the leftRail is always inline, so this
  // state is unused there.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);

  const handleSelectPatient = useCallback((id: string) => {
    setSelectedId(id);
    if (!isDesktop) setIsDrawerOpen(false);
  }, [isDesktop]);

  // Fetch the signed-in clinician's profile once for the header identity chip.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = isMockMode
          ? await mockServices.getClinicianProfile()
          : user?.id
            ? await realClinicianService.getClinicianProfile(user.id)
            : null;
        if (!cancelled) setClinicianProfile(profile);
      } catch {
        if (!cancelled) setClinicianProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isMockMode, user?.id]);

  // Hydrate per-patient slices for queue triage scoring.
  useEffect(() => {
    if (patients.length === 0) {
      setSlices([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const today = new Date();
      const fourteenDaysAgo = new Date(today.getTime() - FOURTEEN_DAYS_MS);
      const svc = isMockMode ? mockServices : realClinicianService;
      const built = await Promise.all(patients.map(async (profile) => {
        const [latestTx, pastAppt, allLogs] = await Promise.all([
          svc.getLatestTransfusionForPatient(profile.user_id),
          svc.getMostRecentPastAppointmentForPatient(profile.user_id),
          svc.getSymptomLogsForPatient(profile.user_id),
        ]);
        const recentLogs = allLogs.filter(l => new Date(l.logged_at) >= fourteenDaysAgo);
        const overdueState = computeOverdueState({
          profile,
          mostRecentTransfusion: latestTx,
          mostRecentPastAppointment: pastAppt,
          today,
        });
        const outcomes = recentLogs.map(l => l.outcome);
        const worstRecentOutcome: Outcome = outcomes.includes('urgent')
          ? 'urgent' : outcomes.includes('monitor') ? 'monitor' : 'normal';
        return {
          profile, latestTx, pastAppt, recentLogs, overdueState,
          worstRecentOutcome,
          hasReactionOnFile: latestTx?.reaction_noted ?? false,
        } satisfies PatientSlice;
      }));
      if (!cancelled) setSlices(built);
    })();
    return () => { cancelled = true; };
  }, [patients, isMockMode]);

  // Search → filter chip → sort.
  const visibleSlices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const afterSearch = q === '' ? slices : slices.filter(s => {
      const idMatch = s.profile.patient_id.toLowerCase().includes(q);
      const nameMatch = s.profile.share_full_name
        ? s.profile.full_name.toLowerCase().includes(q)
        : false;
      return idMatch || nameMatch;
    });

    const afterFilter = afterSearch.filter(s => {
      if (filter === 'overdue') return s.overdueState.isOverdue;
      if (filter === 'recentUrgent') return s.worstRecentOutcome === 'urgent';
      if (filter === 'hasReactions') return s.hasReactionOnFile;
      return true;
    });

    const displayName = (s: PatientSlice) =>
      s.profile.share_full_name ? s.profile.full_name : s.profile.patient_id;

    if (sortKey === 'name') {
      return [...afterFilter].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    }
    if (sortKey === 'recentActivity') {
      const activityTs = (s: PatientSlice) => Math.max(
        s.latestTx ? new Date(s.latestTx.date).getTime() : 0,
        s.pastAppt ? new Date(s.pastAppt.scheduled_date).getTime() : 0,
        ...s.recentLogs.map(l => new Date(l.logged_at).getTime()),
      );
      return [...afterFilter].sort((a, b) => activityTs(b) - activityTs(a));
    }
    if (sortKey === 'daysOverdue') {
      return [...afterFilter].sort((a, b) => {
        const aOver = a.overdueState.isOverdue;
        const bOver = b.overdueState.isOverdue;
        if (aOver && !bOver) return -1;
        if (!aOver && bOver) return 1;
        if (aOver && bOver) {
          const diff = b.overdueState.daysOverdue - a.overdueState.daysOverdue;
          if (diff !== 0) return diff;
        }
        return displayName(a).localeCompare(displayName(b));
      });
    }
    return sortTriageDescending<PatientSlice>(afterFilter, (s) => ({
      isOverdue: s.overdueState.isOverdue,
      daysOverdue: s.overdueState.isOverdue ? s.overdueState.daysOverdue : 0,
      bumpTiers: s.overdueState.isOverdue ? s.overdueState.bumpTiers : 0,
      worstRecentOutcome: s.worstRecentOutcome,
      daysSinceLastTransfusion: 0,
      hasReactionOnFile: s.hasReactionOnFile,
    } satisfies TriageInput));
  }, [slices, filter, searchQuery, sortKey]);

  // Default to top of visible list; also re-select top when current selection
  // drops out of the visible set (e.g. after a refresh, filter, or search change).
  useEffect(() => {
    if (visibleSlices.length === 0) return;
    const stillVisible = selectedId != null
      && visibleSlices.some(s => s.profile.user_id === selectedId);
    if (!stillVisible) {
      setSelectedId(visibleSlices[0].profile.user_id);
    }
  }, [visibleSlices, selectedId]);

  const cohortSummary = useMemo(() => {
    const today = Date.now();
    const sevenDaysAgo = today - SEVEN_DAYS_MS;
    return {
      overdueCount: slices.filter(s => s.overdueState.isOverdue).length,
      monitorCount: slices.filter(s => s.worstRecentOutcome === 'monitor').length,
      stableCount: slices.filter(s => !s.overdueState.isOverdue && s.worstRecentOutcome === 'normal').length,
      cohortSize: slices.length,
      urgentLogs7d: slices.filter(s =>
        s.recentLogs.some(l => l.outcome === 'urgent' && new Date(l.logged_at).getTime() >= sevenDaysAgo)
      ).length,
      transfusions7d: slices.filter(s =>
        s.latestTx != null && new Date(s.latestTx.date).getTime() >= sevenDaysAgo
      ).length,
    };
  }, [slices]);

  const cohortAlerts = useMemo(() => {
    const alertSlices: AlertSlice[] = slices.map(s => {
      const urgentLogs = s.recentLogs
        .filter(l => l.outcome === 'urgent')
        .sort((a, b) => b.logged_at.localeCompare(a.logged_at));
      return {
        patientId: s.profile.user_id,
        patientDisplayName: s.profile.share_full_name ? s.profile.full_name : s.profile.patient_id,
        bumpTiers: s.overdueState.isOverdue ? s.overdueState.bumpTiers : 0,
        daysOverdue: s.overdueState.isOverdue ? s.overdueState.daysOverdue : 0,
        isOverdue: s.overdueState.isOverdue,
        hasReactionOnFile: s.hasReactionOnFile,
        latestTxDate: s.latestTx?.date ?? null,
        mostRecentUrgentLogAt: urgentLogs[0]?.logged_at ?? null,
      };
    });
    return computeCohortAlerts(alertSlices, new Date());
  }, [slices]);

  const overdueHistory14d = useMemo(() => {
    const historySlices: OverdueHistorySlice[] = slices.map(s => ({
      recommendedIntervalDays: s.profile.recommended_visit_interval_days,
      latestTxDate: s.latestTx?.date ?? null,
      pastApptDate: s.pastAppt?.scheduled_date ?? null,
    }));
    return computeOverdueHistory14d(historySlices, new Date());
  }, [slices]);

  const renderRow = useCallback(({ item }: { item: PatientSlice }) => {
    const isOverdue = item.overdueState.isOverdue;
    const daysOverdue = isOverdue ? item.overdueState.daysOverdue : 0;
    const bumpTiers = isOverdue ? item.overdueState.bumpTiers : 0;
    return (
      <PatientQueueRow
        patientId={item.profile.patient_id}
        displayName={item.profile.share_full_name ? item.profile.full_name : item.profile.patient_id}
        isSelected={selectedId === item.profile.user_id}
        isOverdue={isOverdue}
        daysOverdue={daysOverdue}
        bumpTiers={bumpTiers as 0 | 1 | 2}
        worstRecentOutcome={item.worstRecentOutcome}
        hasReactionOnFile={item.hasReactionOnFile}
        onPress={() => handleSelectPatient(item.profile.user_id)}
      />
    );
  }, [selectedId, handleSelectPatient]);

  const handleSignOut = async () => {
    const ok = await confirm({
      title: t('privacy.signOutConfirmTitle' as TranslationKey),
      body: t('privacy.signOutConfirmBody' as TranslationKey),
      confirmLabel: t('auth.logout' as TranslationKey),
      cancelLabel: t('common.cancel' as TranslationKey),
      destructive: true,
    });
    if (!ok) return;
    try { await signOut(); } catch (err) { console.error('Sign out failed:', err); }
  };

  const hasActiveQuery = searchQuery.trim() !== '' || filter !== null;
  let queueEmpty: React.ReactElement | null = null;
  if (!loading) {
    queueEmpty = slices.length > 0 && visibleSlices.length === 0
      ? (
        <View style={styles.noMatchWrap}>
          <Text style={styles.empty}>{t('clinician.queue.noMatch' as TranslationKey)}</Text>
          {hasActiveQuery && (
            <TouchableOpacity
              onPress={() => { setSearchQuery(''); setFilter(null); }}
              accessibilityRole="button"
            >
              <Text style={styles.clearLink}>{t('clinician.queue.clearFilters' as TranslationKey)}</Text>
            </TouchableOpacity>
          )}
        </View>
      )
      : <Text style={styles.empty}>{t('clinician.queue.empty' as TranslationKey)}</Text>;
  }

  const clinicianName = clinicianProfile?.full_name?.trim() || (t('clinician.signOut' as TranslationKey) && 'Clinician');
  const hospitalLabel = clinicianProfile?.hospital_affiliation?.trim() || '—';

  // Same queue content is rendered inline on desktop and inside the mobile
  // drawer overlay — pulled into a helper to avoid duplicating the tree.
  const renderQueueContent = () => (
    <>
      <CohortOverviewCard
        overdueCount={cohortSummary.overdueCount}
        monitorCount={cohortSummary.monitorCount}
        stableCount={cohortSummary.stableCount}
        cohortSize={cohortSummary.cohortSize}
        urgentLogs7d={cohortSummary.urgentLogs7d}
        transfusions7d={cohortSummary.transfusions7d}
        overdueHistory={overdueHistory14d}
        isWide={isWide}
      />
      <View style={styles.alertsWrap}>
        <AlertsStrip
          alerts={cohortAlerts.alerts}
          totalAlerts={cohortAlerts.total}
          selectedPatientId={selectedId}
          onSelectPatient={handleSelectPatient}
          language={language}
        />
      </View>
      {isDesktop && (
        <View style={styles.addPatientRow}>
          <AddPatientButton onPress={() => setIsAddPatientOpen(true)} />
        </View>
      )}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <QueueSearchBar value={searchQuery} onChange={setSearchQuery} />
        </View>
        <QueueSortSelector value={sortKey} onChange={setSortKey} />
      </View>
      <FilterChips active={filter} onChange={setFilter} />
      <FlatList
        data={visibleSlices}
        keyExtractor={(item) => item.profile.user_id}
        renderItem={renderRow}
        ListEmptyComponent={queueEmpty}
        contentContainerStyle={{ paddingBottom: SPACING.xs }}
        scrollEnabled={false}
      />
      {pendingLinks.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.pendingSectionLabel}>
            {t('clinician.linkPatient.pendingRowSubtitle' as TranslationKey).toUpperCase()}
          </Text>
          {pendingLinks.map(({ link, patientDisplayId }) => (
            <PendingPatientRow
              key={link.id}
              linkId={link.id}
              patientDisplayId={patientDisplayId}
              onCancelled={refreshAssigned}
            />
          ))}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>HaemoCare</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('auth.logout' as TranslationKey)}
          >
            <Feather name="log-out" size={18} color={COLORS.statusUrgent} />
          </TouchableOpacity>
          <LanguageToggle />
        </View>
      </View>

      <View style={[styles.hero, isDesktop ? styles.heroDesktop : styles.heroMobile]}>
        <HeroGradient borderRadius={isDesktop ? 24 : 0} gradientId="clinicianHeroGrad" />
        <View style={styles.heroDecoCircle1} />
        <View style={styles.heroDecoCircle2} />

        {isDesktop ? (
          <>
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>{t('clinician.dashboard.title' as TranslationKey).toUpperCase()}</Text>
              <Feather name="activity" size={18} color="rgba(255,255,255,0.45)" />
            </View>
            <View style={styles.heroMain}>
              <View style={styles.avatarBadge}>
                <Feather name="user" size={32} color="rgba(255,255,255,0.92)" />
              </View>
              <View style={styles.heroNameCol}>
                <Text style={styles.heroName} numberOfLines={1}>{clinicianName}</Text>
                <Text style={styles.heroHospital} numberOfLines={1}>{hospitalLabel}</Text>
              </View>
            </View>
            <View style={styles.heroChipRow}>
              <View style={styles.heroChip}>
                <Feather name="users" size={12} color={COLORS.white} />
                <Text style={styles.heroChipText}>
                  {cohortSummary.cohortSize} {t('clinician.dashboard.assignedPatients' as TranslationKey)}
                </Text>
              </View>
            </View>
          </>
        ) : (
          // Slim mobile hero: single row, no chip (cohort size lives in the FAB),
          // no "DASHBOARD" label. Cuts vertical real estate from ~220px → ~70px.
          <View style={styles.heroMobileRow}>
            <View style={styles.avatarBadgeSmall}>
              <Feather name="user" size={18} color="rgba(255,255,255,0.92)" />
            </View>
            <View style={styles.heroNameCol}>
              <Text style={styles.heroNameMobile} numberOfLines={1}>{clinicianName}</Text>
              <Text style={styles.heroHospitalMobile} numberOfLines={1}>{hospitalLabel}</Text>
            </View>
          </View>
        )}
      </View>
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        {isDesktop && (
          <View
            style={[
              styles.leftRail,
              styles.leftRailDesktop,
              isWide && styles.leftRailWide,
            ]}
          >
            <ScrollView contentContainerStyle={styles.leftRailScroll}>
              {renderQueueContent()}
            </ScrollView>
          </View>
        )}

        <View style={[styles.rightPane, isDesktop && styles.rightPaneDesktop]}>
          {selectedId ? (
            <ScrollView
              contentContainerStyle={styles.rightPaneScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* === medication adherence widget (brief #1) === */}
              <View style={styles.adherenceWrap}>
                <MedicationAdherenceCard patientUserId={selectedId} />
              </View>
              {/* === pre-transfusion labs panel (brief #3) === */}
              <PreTransfusionLabsPanel
                patientUserId={selectedId}
                clinicianDisplayName={clinicianProfile?.full_name ?? undefined}
              />
              <PatientDetailPane userId={selectedId} isClinicianView />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.emptyDetail}>
              <Text style={styles.empty}>{t('clinician.detail.empty' as TranslationKey)}</Text>
            </ScrollView>
          )}
        </View>

        {!isDesktop && !isDrawerOpen && (
          <TouchableOpacity
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.85}
            style={styles.queueFab}
            accessibilityRole="button"
            accessibilityLabel={t('clinician.dashboard.openQueue' as TranslationKey)}
          >
            <Feather name="menu" size={18} color={COLORS.white} />
            <Text style={styles.queueFabText} numberOfLines={1}>
              {t('clinician.dashboard.openQueue' as TranslationKey)}
              {cohortSummary.cohortSize > 0 ? `  ·  ${cohortSummary.cohortSize}` : ''}
            </Text>
          </TouchableOpacity>
        )}

        {!isDesktop && isDrawerOpen && (
          <>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setIsDrawerOpen(false)}
              style={styles.drawerBackdrop}
              accessibilityLabel={t('common.close' as TranslationKey)}
            />
            <View style={styles.drawerPanel}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle} numberOfLines={1}>
                  {t('clinician.dashboard.queueTitle' as TranslationKey)}
                </Text>
                <AddPatientButton
                  compact
                  onPress={() => {
                    setIsDrawerOpen(false);
                    setIsAddPatientOpen(true);
                  }}
                />
                <TouchableOpacity
                  onPress={() => setIsDrawerOpen(false)}
                  style={styles.drawerCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close' as TranslationKey)}
                >
                  <Feather name="x" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.leftRailScroll}>
                {renderQueueContent()}
              </ScrollView>
            </View>
          </>
        )}
      </View>

      <AddPatientModal
        visible={isAddPatientOpen}
        onClose={() => setIsAddPatientOpen(false)}
        onSuccess={refreshAssigned}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },

  // Brand top bar — mirrors PassportScreen
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, zIndex: 10,
  },
  brand: { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  signOutBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.statusUrgentBg,
    borderWidth: 1, borderColor: COLORS.statusUrgent,
    justifyContent: 'center', alignItems: 'center',
  },

  // Teal-gradient hero — parallel to patient PassportScreen hero
  hero: {
    overflow: 'hidden',
    paddingTop: SPACING.lg, paddingBottom: SPACING.lg, paddingHorizontal: SPACING.lg, gap: 14,
    position: 'relative',
    marginBottom: SPACING.sm,
  },
  heroDesktop: {
    borderRadius: 24, marginHorizontal: SPACING.md, marginTop: SPACING.sm,
  },
  heroMobile: {
    // Slim variant: less vertical padding, no gap between rows since there's
    // only one row of content.
    paddingTop: SPACING.md, paddingBottom: SPACING.md, gap: 0,
  },
  heroMobileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 1,
  },
  avatarBadgeSmall: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroNameMobile: {
    fontSize: 16, fontWeight: '800', color: COLORS.white, letterSpacing: -0.2,
  },
  heroHospitalMobile: {
    fontSize: 12, color: 'rgba(255,255,255,0.78)',
  },
  heroDecoCircle1: {
    position: 'absolute', top: -30, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecoCircle2: {
    position: 'absolute', bottom: -20, left: 40,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5 },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 1 },
  avatarBadge: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroNameCol: { flex: 1, gap: 4, zIndex: 1 },
  heroName: { fontSize: 20, fontWeight: '800', color: COLORS.white, letterSpacing: -0.3 },
  heroHospital: { fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  heroChipRow: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 12,
  },
  heroChipText: { fontSize: 12, fontWeight: '700', color: COLORS.white, letterSpacing: 0.3 },

  // Web-only: minHeight:0 lets the row layout's flex children shrink
  // properly so each side gets its own scroll context. Without it, the
  // ScrollViews inside both panes can collectively expand the body
  // vertically, leaving zero usable space for the row layout to render.
  body: { flex: 1, ...(Platform.OS === 'web' ? { minHeight: 0 } : null) },
  bodyDesktop: { flexDirection: 'row' },
  leftRail: { flex: 1, ...(Platform.OS === 'web' ? { minHeight: 0 } : null) },
  leftRailDesktop: {
    // RN's `flex: 0` translates to CSS `flex: 0 1 0%` on web, which sets
    // flex-basis to 0 and OVERRIDES `width: 360` → the rail collapses to
    // width 0 and disappears. Spell out the individual longhand props
    // (flexBasis is what actually sizes a flex item along the main axis)
    // so the 360px sticks across both platforms.
    flexBasis: 360,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderLight ?? '#E4E4E4',
    // Stack-navigator wrapper on web doesn't reliably propagate flex
    // height; pin the rail to fill the body container so it actually shows.
    ...(Platform.OS === 'web' ? { height: '100%' as unknown as number } : null),
  },
  leftRailWide: { flexBasis: 400 },
  leftRailScroll: { gap: SPACING.sm, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  alertsWrap: { paddingHorizontal: SPACING.md },
  addPatientRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },
  pendingSection: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.sm, gap: SPACING.xs },
  pendingSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 1.2,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  searchInputWrap: { flex: 1 },
  rightPane: { flex: 1, ...(Platform.OS === 'web' ? { minWidth: 0, minHeight: 0 } : null) },
  rightPaneDesktop: { flex: 1 },
  rightPaneScroll: { paddingBottom: SPACING.xl },
  adherenceWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  emptyDetail: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  empty: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', padding: SPACING.lg },
  noMatchWrap: { alignItems: 'center', padding: SPACING.lg, gap: SPACING.sm },
  clearLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },

  // Mobile-only drawer: hamburger pill floats above the body, panel slides
  // in as an absolute overlay with a dimmed backdrop. Sized to ~85% of
  // screen width with a hard cap so it stays readable on tablets-in-portrait.
  queueFab: {
    position: 'absolute',
    // Negative top pulls the FAB up over the hero's lower edge so it
    // doesn't eat a row of body content. Hero has marginBottom: SPACING.sm,
    // so -20 lands roughly half-on the gradient, half-on the body.
    top: -20,
    left: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
      default: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
    }),
    zIndex: 5,
  },
  queueFabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.2,
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    zIndex: 10,
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '78%',
    maxWidth: 320,
    backgroundColor: COLORS.background,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderLight,
    zIndex: 11,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
    }),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  drawerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
