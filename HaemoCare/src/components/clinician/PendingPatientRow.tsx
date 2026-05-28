import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import { relativeTime } from '../../utils/dateHelpers';
import * as realService from '../../services/clinicianService';
import * as mockService from '../../mock/services';

interface Props {
  linkId: string;
  patientDisplayId: string | null;
  requestedAt: string;
  onCancelled: () => void;
}

export default function PendingPatientRow({ linkId, patientDisplayId, requestedAt, onCancelled }: Props) {
  const { t, language } = useLanguage();
  const { isMockMode } = useAuth();
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const svc = isMockMode ? mockService : realService;
      const result = await svc.cancelLinkRequest(linkId);
      // STATE_CHANGED means the patient just accepted (or it was cancelled
      // elsewhere) — refresh to let the parent reflect the new state.
      if (!result.ok && result.reason === 'STATE_CHANGED') {
        onCancelled();
        return;
      }
      onCancelled();
    } catch {
      setCancelling(false);
    }
  }, [linkId, cancelling, isMockMode, onCancelled]);

  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {t('clinician.pendingSection.pendingPill' as TranslationKey)}
        </Text>
      </View>
      <View style={styles.col}>
        <Text style={styles.id} numberOfLines={1}>
          {patientDisplayId ?? '—'}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {t('clinician.pendingSection.sentRelative' as TranslationKey, {
            ago: relativeTime(requestedAt, language),
          })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={handleCancel}
        disabled={cancelling}
        hitSlop={8}
        style={styles.cancelBtn}
        accessibilityRole="button"
        accessibilityLabel={t('clinician.linkPatient.cancelRequest' as TranslationKey)}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        ) : (
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.goldLight,
    marginBottom: SPACING.xs,
  },
  pill: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.8,
  },
  col: { flex: 1, gap: 2 },
  id: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
