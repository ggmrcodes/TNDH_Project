// Read-only display for pre-transfusion labs (Hb / Hct / Ferritin) plus
// optional "verified by clinician" badge and optional lab-slip photo.
//
// Designed to be embedded in both the patient transfusion detail view
// and the clinician dashboard's patient detail pane.

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { relativeTime } from '../../utils/dateHelpers';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import type { PreTransfusionLabs } from '../../types/database';
import { isEmptyLabs } from '../../utils/preTransfusionLabs';

export interface PreTransfusionLabsDisplayProps {
  labs: PreTransfusionLabs | null | undefined;
  /** Optional clinician display name shown in the verified-by badge. */
  verifiedByName?: string;
  /** When provided, the lab-slip photo is rendered (signed URL or local URI). */
  photoDisplayUri?: string | null;
}

function formatValue(n: number | null): string {
  if (n == null) return '—';
  // Hb / Hct typically reported to one decimal; ferritin to whole number.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function PreTransfusionLabsDisplay({
  labs,
  verifiedByName,
  photoDisplayUri,
}: PreTransfusionLabsDisplayProps) {
  const { t, language } = useLanguage();

  if (isEmptyLabs(labs)) {
    return (
      <View style={styles.emptyWrap}>
        <Feather name="droplet" size={14} color={COLORS.textLight} />
        <Text style={styles.empty}>{t('preLabs.noneRecorded' as TranslationKey)}</Text>
      </View>
    );
  }

  // After isEmptyLabs check, labs is guaranteed non-null.
  const safe = labs as PreTransfusionLabs;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ValueCell
          label={t('preLabs.hbShort' as TranslationKey)}
          unit="g/dL"
          value={formatValue(safe.hb)}
        />
        <ValueCell
          label={t('preLabs.hctShort' as TranslationKey)}
          unit="%"
          value={formatValue(safe.hct)}
        />
        <ValueCell
          label={t('preLabs.ferritinShort' as TranslationKey)}
          unit="ng/mL"
          value={formatValue(safe.ferritin)}
        />
      </View>

      <View style={styles.metaRow}>
        {safe.verified_by_clinician_id && (
          <View style={styles.verifiedBadge}>
            <Feather name="check-circle" size={12} color={COLORS.statusNormal} />
            <Text style={styles.verifiedText}>
              {verifiedByName
                ? t('preLabs.verifiedBy' as TranslationKey).replace('{name}', verifiedByName)
                : t('preLabs.verifiedByClinician' as TranslationKey)}
            </Text>
          </View>
        )}
        {safe.recorded_at && (
          <Text style={styles.metaTime}>
            {t('preLabs.recordedAt' as TranslationKey).replace(
              '{when}',
              relativeTime(safe.recorded_at, language)
            )}
          </Text>
        )}
      </View>

      {photoDisplayUri && (
        <Image source={{ uri: photoDisplayUri }} style={styles.photo} resizeMode="cover" />
      )}
    </View>
  );
}

function ValueCell({ label, unit, value }: { label: string; unit: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={styles.cellValueRow}>
        <Text style={styles.cellValue}>{value}</Text>
        <Text style={styles.cellUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cell: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 2,
  },
  cellLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  cellValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  cellValue: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  cellUnit: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.statusNormalBg,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  verifiedText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.statusNormalText },
  metaTime: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
  emptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, fontStyle: 'italic' },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.borderLight,
  },
});
