import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/clinicianService';
import * as mockService from '../../mock/services';

interface Props {
  linkId: string;
  patientDisplayId: string | null;
  onCancelled: () => void;
}

export default function PendingPatientRow({ linkId, patientDisplayId, onCancelled }: Props) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const svc = isMockMode ? mockService : realService;
      await svc.cancelLinkRequest(linkId);
      onCancelled();
    } catch {
      setCancelling(false);
    }
  }, [linkId, cancelling, isMockMode, onCancelled]);

  return (
    <View style={styles.row}>
      <View style={styles.pendingDot} />
      <View style={styles.col}>
        <Text style={styles.name} numberOfLines={1}>
          {patientDisplayId ?? '—'}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {t('clinician.linkPatient.pendingRowSubtitle' as TranslationKey)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={handleCancel}
        disabled={cancelling}
        hitSlop={8}
        style={styles.cancelBtn}
        accessibilityLabel={t('clinician.linkPatient.cancelRequest' as TranslationKey)}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        ) : (
          <Feather name="x" size={16} color={COLORS.textSecondary} />
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
    backgroundColor: 'transparent',
    opacity: 0.65,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.textSecondary,
    backgroundColor: 'transparent',
  },
  col: { flex: 1, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  subtitle: { fontSize: 11, color: COLORS.textLight, fontStyle: 'italic' },
  cancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
