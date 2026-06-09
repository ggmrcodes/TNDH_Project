// Clinician-side pre-transfusion labs panel — full-history list.
//
// Shown above PatientDetailPane in the clinician dashboard's right pane
// (see ClinicianDashboardScreen). Renders ONE collapsible row per
// transfusion (newest first), each showing date + hospital + the lab
// summary (or "not recorded") and an optional reaction indicator. Tap
// any row to expand the PreTransfusionLabsForm against THAT transfusion's
// pre_labs — including older ones (PR #38's column-locked UPDATE policy
// allows clinician edits on any verified-linked patient transfusion).
//
// The latest transfusion's row auto-expands on initial load + on patient
// switch, preserving the muscle-memory of the v1 "Edit & verify" flow.
// User collapse/expand choices stick after that.
//
// Refresh: bumping `refreshSignal` re-fetches the transfusion list.
// Wired by ClinicianDashboardScreen's right-pane RefreshControl.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { formatDate } from '../../utils/dateHelpers';
import * as mockServices from '../../mock/services';
import * as realPreLabsService from '../../services/preTransfusionLabsService';
import * as realClinicianService from '../../services/clinicianService';
import PreTransfusionLabsForm from '../transfusions/PreTransfusionLabsForm';
import { isEmptyLabs } from '../../utils/preTransfusionLabs';
import type { PreTransfusionLabs, Transfusion } from '../../types/database';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

export interface PreTransfusionLabsPanelProps {
  patientUserId: string;
  /** Clinician display name for the "Verified by Dr. X" badge inside
   * the form's clinician-edit notice. */
  clinicianDisplayName?: string;
  /** External refresh tick — bump from a parent to re-fetch (used by
   * the dashboard's right-pane pull-to-refresh). */
  refreshSignal?: number;
}

export default function PreTransfusionLabsPanel({
  patientUserId,
  clinicianDisplayName,
  refreshSignal,
}: PreTransfusionLabsPanelProps) {
  const { isMockMode, user } = useAuth();
  const { t, language } = useLanguage();
  const [transfusions, setTransfusions] = useState<Transfusion[]>([]);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);

  const refresh = useCallback(async () => {
    const txs = isMockMode
      ? await mockServices.getTransfusionsForPatient(patientUserId)
      : await realClinicianService.getTransfusionsForPatient(patientUserId);
    setTransfusions(txs);
  }, [isMockMode, patientUserId]);

  // Reset auto-expand + selection on patient switch, then refresh.
  useEffect(() => {
    setHasAutoExpanded(false);
    setExpandedTxId(null);
    refresh();
  }, [patientUserId, refresh]);

  // External refresh (pull-to-refresh) — refetches without disturbing
  // the user's expanded-row selection.
  useEffect(() => {
    if (refreshSignal === undefined) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Auto-expand the latest tx's row the first time transfusions hydrate
  // for this patient. After that, respect whatever the user has chosen.
  useEffect(() => {
    if (!hasAutoExpanded && transfusions.length > 0) {
      setExpandedTxId(transfusions[0].id);
      setHasAutoExpanded(true);
    }
  }, [transfusions, hasAutoExpanded]);

  if (transfusions.length === 0) return null;

  const handleSave = (tx: Transfusion) => async (values: {
    hb: number | null;
    hct: number | null;
    ferritin: number | null;
    lab_slip_photo_url: string | null;
    reactions?: { noted: boolean; detail: string };
  }) => {
    const actorId = user?.id ?? 'mock-clinician-001';
    const payload: PreTransfusionLabs = {
      hb: values.hb,
      hct: values.hct,
      ferritin: values.ferritin,
      recorded_at: new Date().toISOString(),
      recorded_by_user_id: actorId,
      // Clinician save flips verification to this clinician.
      verified_by_clinician_id: actorId,
      lab_slip_photo_url: values.lab_slip_photo_url,
      source: 'manual',
    };
    const updated = isMockMode
      ? await mockServices.savePreLabsForTransfusion(tx.id, actorId, payload, values.reactions)
      : await realPreLabsService.savePreLabs(tx.id, tx.user_id, actorId, payload, values.reactions);
    setTransfusions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setExpandedTxId(null);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Feather name="activity" size={16} color={COLORS.primary} />
        <Text style={styles.headerTitle}>{t('preLabs.title' as TranslationKey)}</Text>
        <Text style={styles.headerCount}>
          {t('preLabs.history.count' as TranslationKey, { count: transfusions.length })}
        </Text>
      </View>
      <View style={styles.list}>
        {transfusions.map((tx) => {
          const expanded = expandedTxId === tx.id;
          return (
            <TransfusionLabsRow
              key={tx.id}
              tx={tx}
              expanded={expanded}
              language={language}
              t={t}
              clinicianDisplayName={clinicianDisplayName}
              onToggle={() => setExpandedTxId(expanded ? null : tx.id)}
              onSave={handleSave(tx)}
              onCancel={() => setExpandedTxId(null)}
            />
          );
        })}
      </View>
    </View>
  );
}

interface RowProps {
  tx: Transfusion;
  expanded: boolean;
  language: 'th' | 'en';
  t: ReturnType<typeof useLanguage>['t'];
  clinicianDisplayName?: string;
  onToggle: () => void;
  onSave: (values: {
    hb: number | null;
    hct: number | null;
    ferritin: number | null;
    lab_slip_photo_url: string | null;
    reactions?: { noted: boolean; detail: string };
  }) => Promise<void>;
  onCancel: () => void;
}

function TransfusionLabsRow({
  tx,
  expanded,
  language,
  t,
  clinicianDisplayName,
  onToggle,
  onSave,
  onCancel,
}: RowProps) {
  const empty = isEmptyLabs(tx.pre_labs);
  const labs = tx.pre_labs;
  const dash = t('preLabs.notEntered' as TranslationKey);
  const summary = empty
    ? t('preLabs.noneRecorded' as TranslationKey)
    : `${t('preLabs.hbShort' as TranslationKey)} ${labs?.hb ?? dash}` +
      ` · ${t('preLabs.hctShort' as TranslationKey)} ${labs?.hct ?? dash}` +
      ` · ${t('preLabs.ferritinShort' as TranslationKey)} ${labs?.ferritin ?? dash}`;

  return (
    <View style={[styles.row, expanded && styles.rowExpanded]}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={styles.rowHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Feather
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={COLORS.textSecondary}
        />
        <View style={styles.rowHeaderText}>
          <View style={styles.rowMetaRow}>
            <Text style={styles.rowDate}>{formatDate(tx.date, language)}</Text>
            <Text style={styles.rowMetaSep}>·</Text>
            <Text style={styles.rowHospital} numberOfLines={1}>{tx.hospital || '—'}</Text>
            {tx.units_received != null && (
              <>
                <Text style={styles.rowMetaSep}>·</Text>
                <Text style={styles.rowUnits}>
                  {tx.units_received} {t('history.units' as TranslationKey)}
                </Text>
              </>
            )}
          </View>
          <Text
            style={[styles.rowSummary, empty && styles.rowSummaryEmpty]}
            numberOfLines={1}
          >
            {summary}
          </Text>
        </View>
        {tx.reaction_noted && (
          <View style={styles.reactionBadge}>
            <Feather name="alert-triangle" size={11} color={COLORS.statusUrgentText} />
          </View>
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.rowBody}>
          <PreTransfusionLabsForm
            initial={tx.pre_labs ?? null}
            onSubmit={onSave}
            onCancel={onCancel}
            showClinicianEditNotice={!empty}
            includeReactions
            initialReaction={{
              noted: tx.reaction_noted ?? false,
              detail: tx.reaction_detail ?? '',
            }}
            hideHeader
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    ...SHADOWS.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.h3, color: COLORS.text, flex: 1 },
  headerCount: { ...TYPOGRAPHY.caption, color: COLORS.textLight },

  list: { gap: SPACING.xs },

  row: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  rowExpanded: {
    backgroundColor: COLORS.surfaceElevated,
    borderColor: COLORS.primaryMuted,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  rowHeaderText: { flex: 1, gap: 2 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  rowDate: { ...TYPOGRAPHY.bodySmall, color: COLORS.text, fontWeight: '700' },
  rowMetaSep: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
  rowHospital: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, flexShrink: 1 },
  rowUnits: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  rowSummary: { ...TYPOGRAPHY.caption, color: COLORS.text },
  rowSummaryEmpty: { color: COLORS.textLight, fontStyle: 'italic' },
  reactionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.statusUrgentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowBody: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
});
