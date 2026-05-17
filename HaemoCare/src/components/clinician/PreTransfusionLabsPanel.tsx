// Clinician-side pre-transfusion labs panel.
//
// Shown above the standard PatientDetailPane in the clinician dashboard's
// right-hand pane (see ClinicianDashboardScreen). For the patient's most
// recent transfusion, displays the pre-labs and gives the clinician an
// "Edit & verify" action. Saving stamps `verified_by_clinician_id` with
// the current clinician's user_id and appends an audit-log row.
//
// Isolated in its own component so the medication-reminders brief (#1)
// can add its own panel slot to ClinicianDashboardScreen without
// touching this code.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import * as mockServices from '../../mock/services';
import * as realPreLabsService from '../../services/preTransfusionLabsService';
import * as realClinicianService from '../../services/clinicianService';
import * as realTransfusionService from '../../services/transfusionService';
import PreTransfusionLabsForm from '../transfusions/PreTransfusionLabsForm';
import PreTransfusionLabsDisplay from '../transfusions/PreTransfusionLabsDisplay';
import { isEmptyLabs } from '../../utils/preTransfusionLabs';
import type { PreTransfusionLabs, Transfusion } from '../../types/database';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

export interface PreTransfusionLabsPanelProps {
  patientUserId: string;
  /** Clinician display name for the "Verified by Dr. X" badge. */
  clinicianDisplayName?: string;
}

export default function PreTransfusionLabsPanel({
  patientUserId,
  clinicianDisplayName,
}: PreTransfusionLabsPanelProps) {
  const { isMockMode, user } = useAuth();
  const { t } = useLanguage();
  const [latestTx, setLatestTx] = useState<Transfusion | null>(null);
  const [editing, setEditing] = useState(false);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isMockMode) {
      const tx = await mockServices.getLatestTransfusionForPatient(patientUserId);
      setLatestTx(tx);
      return;
    }
    const tx = await realClinicianService.getLatestTransfusionForPatient(patientUserId);
    setLatestTx(tx);
  }, [isMockMode, patientUserId]);

  useEffect(() => {
    setEditing(false);
    setSignedPhotoUrl(null);
    refresh();
  }, [patientUserId, refresh]);

  // Resolve a signed URL for the lab-slip photo if one exists (real mode).
  useEffect(() => {
    const raw = latestTx?.pre_labs?.lab_slip_photo_url ?? null;
    if (!raw) {
      setSignedPhotoUrl(null);
      return;
    }
    if (
      raw.startsWith('http') ||
      raw.startsWith('file:') ||
      raw.startsWith('data:')
    ) {
      setSignedPhotoUrl(raw);
      return;
    }
    if (isMockMode) {
      // Mock mode stores local URIs; if we end up here it's an unexpected
      // string — show nothing rather than crash.
      setSignedPhotoUrl(null);
      return;
    }
    let cancelled = false;
    realPreLabsService
      .getLabSlipSignedUrl(raw)
      .then((url) => {
        if (!cancelled) setSignedPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSignedPhotoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestTx?.pre_labs?.lab_slip_photo_url, isMockMode]);

  if (!latestTx) {
    return null;
  }

  const handleSubmit = async (values: {
    hb: number | null;
    hct: number | null;
    ferritin: number | null;
    lab_slip_photo_url: string | null;
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
    if (isMockMode) {
      const updated = await mockServices.savePreLabsForTransfusion(
        latestTx.id,
        actorId,
        payload
      );
      setLatestTx(updated);
    } else {
      const updated = await realPreLabsService.savePreLabs(
        latestTx.id,
        latestTx.user_id,
        actorId,
        payload
      );
      setLatestTx(updated);
    }
    setEditing(false);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="activity" size={16} color={COLORS.primary} />
          <Text style={styles.headerTitle}>{t('preLabs.title' as TranslationKey)}</Text>
        </View>
        {!editing && (
          <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}>
            <Text style={styles.headerCta}>
              {isEmptyLabs(latestTx.pre_labs)
                ? t('preLabs.addCta' as TranslationKey)
                : t('preLabs.editCta' as TranslationKey)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {editing ? (
        <PreTransfusionLabsForm
          initial={latestTx.pre_labs ?? null}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(false)}
          showClinicianEditNotice={!isEmptyLabs(latestTx.pre_labs)}
        />
      ) : (
        <PreTransfusionLabsDisplay
          labs={latestTx.pre_labs ?? null}
          verifiedByName={clinicianDisplayName}
          photoDisplayUri={signedPhotoUrl}
        />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.h3, color: COLORS.text },
  headerCta: { ...TYPOGRAPHY.bodySmall, color: COLORS.primary, fontWeight: '700' },
});
