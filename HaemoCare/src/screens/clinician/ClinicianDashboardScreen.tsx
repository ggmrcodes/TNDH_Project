import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import { useAssignedPatients } from '../../hooks/useAssignedPatients';
import { computeOverdueState, OverdueState } from '../../utils/overdueVisit';
import { sortTriageDescending, type TriageInput } from '../../utils/triageQueue';
import * as mockServices from '../../mock/services';
import * as realClinicianService from '../../services/clinicianService';
import AlertsStrip from '../../components/clinician/AlertsStrip';
import ClinicianIdentityChip from '../../components/clinician/ClinicianIdentityChip';
import CohortOverviewCard from '../../components/clinician/CohortOverviewCard';
import FilterChips, { FilterId } from '../../components/clinician/FilterChips';
import PatientQueueRow from '../../components/clinician/PatientQueueRow';
import PatientDetailPane from '../../components/clinician/PatientDetailPane';
import QueueSearchBar from '../../components/clinician/QueueSearchBar';
import QueueSortSelector, { type SortKey } from '../../components/clinician/QueueSortSelector';
import { computeCohortAlerts, type AlertSlice } from '../../utils/cohortAlerts';
import { computeOverdueHistory14d, type OverdueHistorySlice } from '../../utils/cohortHistory';
import { COLORS, SPACING } from '../../config/theme';
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
  const { patients, loading } = useAssignedPatients();
  const [slices, setSlices] = useState<PatientSlice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('triage');
  const [clinicianProfile, setClinicianProfile] = useState<ClinicianProfile | null>(null);

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
        onPress={() => setSelectedId(item.profile.user_id)}
      />
    );
  }, [selectedId]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('clinician.dashboard.title' as TranslationKey)}</Text>
        <View style={styles.headerRight}>
          <ClinicianIdentityChip
            name={clinicianProfile?.full_name ?? 'Clinician'}
            hospital={clinicianProfile?.hospital_affiliation ?? null}
          />
          <TouchableOpacity onPress={signOut} accessibilityRole="button">
            <Text style={styles.signOut}>{t('clinician.signOut' as TranslationKey)}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        <View
          style={[
            styles.leftRail,
            isDesktop && styles.leftRailDesktop,
            isWide && styles.leftRailWide,
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.leftRailScroll}
            stickyHeaderIndices={[]}
          >
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
                onSelectPatient={setSelectedId}
                language={language}
              />
            </View>
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
              contentContainerStyle={{ paddingBottom: SPACING.xl }}
              scrollEnabled={false}
            />
          </ScrollView>
        </View>
        <View style={[styles.rightPane, isDesktop && styles.rightPaneDesktop]}>
          {selectedId ? (
            <PatientDetailPane userId={selectedId} isClinicianView />
          ) : (
            <ScrollView contentContainerStyle={styles.emptyDetail}>
              <Text style={styles.empty}>{t('clinician.detail.empty' as TranslationKey)}</Text>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight ?? '#E4E4E4',
    gap: SPACING.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  signOut: { fontSize: 13, color: COLORS.primary ?? '#0B6E6E', fontWeight: '600' },
  body: { flex: 1 },
  bodyDesktop: { flexDirection: 'row' },
  leftRail: { flex: 1 },
  leftRailDesktop: { width: 360, flex: 0, borderRightWidth: 1, borderRightColor: COLORS.borderLight ?? '#E4E4E4' },
  leftRailWide: { width: 400 },
  leftRailScroll: { gap: SPACING.sm, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  alertsWrap: { paddingHorizontal: SPACING.md },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  searchInputWrap: { flex: 1 },
  rightPane: { flex: 1 },
  rightPaneDesktop: { flex: 1 },
  emptyDetail: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  empty: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', padding: SPACING.lg },
  noMatchWrap: { alignItems: 'center', padding: SPACING.lg, gap: SPACING.sm },
  clearLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
});
