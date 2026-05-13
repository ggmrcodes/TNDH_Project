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
import CohortStats from '../../components/clinician/CohortStats';
import FilterChips, { FilterId } from '../../components/clinician/FilterChips';
import PatientQueueRow from '../../components/clinician/PatientQueueRow';
import PatientDetailPane from '../../components/clinician/PatientDetailPane';
import { COLORS, SPACING } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import type { Profile, Outcome, Transfusion, SymptomLog, Appointment } from '../../types/database';

interface PatientSlice {
  profile: Profile;
  latestTx: Transfusion | null;
  pastAppt: Appointment | null;
  recentLogs: SymptomLog[];
  overdueState: OverdueState;
  worstRecentOutcome: Outcome;
  hasReactionOnFile: boolean;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export default function ClinicianDashboardScreen() {
  const { signOut, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { isDesktop } = useResponsive();
  const { patients, loading } = useAssignedPatients();
  const [slices, setSlices] = useState<PatientSlice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>(null);

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

  // Apply triage sort + filter.
  const visibleSlices = useMemo(() => {
    const filtered = slices.filter(s => {
      if (filter === 'overdue') return s.overdueState.isOverdue;
      if (filter === 'recentUrgent') return s.worstRecentOutcome === 'urgent';
      if (filter === 'hasReactions') return s.hasReactionOnFile;
      return true;
    });
    return sortTriageDescending<PatientSlice>(filtered, (s) => ({
      isOverdue: s.overdueState.isOverdue,
      daysOverdue: s.overdueState.isOverdue ? s.overdueState.daysOverdue : 0,
      bumpTiers: s.overdueState.isOverdue ? s.overdueState.bumpTiers : 0,
      worstRecentOutcome: s.worstRecentOutcome,
      daysSinceLastTransfusion: 0,
      hasReactionOnFile: s.hasReactionOnFile,
    } satisfies TriageInput));
  }, [slices, filter]);

  // Default to top-overdue on load; also re-select top when current selection
  // drops out of the visible set (e.g. after a refresh or filter change).
  useEffect(() => {
    if (visibleSlices.length === 0) return;
    const stillVisible = selectedId != null
      && visibleSlices.some(s => s.profile.user_id === selectedId);
    if (!stillVisible) {
      setSelectedId(visibleSlices[0].profile.user_id);
    }
  }, [visibleSlices, selectedId]);

  const cohortStats = useMemo(() => ({
    overdueCount: slices.filter(s => s.overdueState.isOverdue).length,
    monitorCount: slices.filter(s => s.worstRecentOutcome === 'monitor').length,
    stableCount: slices.filter(s => !s.overdueState.isOverdue && s.worstRecentOutcome === 'normal').length,
  }), [slices]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('clinician.dashboard.title' as TranslationKey)}</Text>
        <TouchableOpacity onPress={signOut}><Text style={styles.signOut}>{t('clinician.signOut' as TranslationKey)}</Text></TouchableOpacity>
      </View>
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        <View style={[styles.leftRail, isDesktop && styles.leftRailDesktop]}>
          <CohortStats {...cohortStats} />
          <FilterChips active={filter} onChange={setFilter} />
          <FlatList
            data={visibleSlices}
            keyExtractor={(item) => item.profile.user_id}
            renderItem={renderRow}
            ListEmptyComponent={loading ? null : (
              <Text style={styles.empty}>{t('clinician.queue.empty' as TranslationKey)}</Text>
            )}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
          />
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
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  signOut: { fontSize: 13, color: COLORS.primary ?? '#0B6E6E', fontWeight: '600' },
  body: { flex: 1 },
  bodyDesktop: { flexDirection: 'row' },
  leftRail: { flex: 1 },
  leftRailDesktop: { width: 360, flex: 0, borderRightWidth: 1, borderRightColor: COLORS.borderLight ?? '#E4E4E4' },
  rightPane: { flex: 1 },
  rightPaneDesktop: { flex: 1 },
  emptyDetail: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  empty: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', padding: SPACING.lg },
});
