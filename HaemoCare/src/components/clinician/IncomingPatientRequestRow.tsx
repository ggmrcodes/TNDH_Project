import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
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
  patientFullName: string | null;
  onResolved: () => void;
}

export default function IncomingPatientRequestRow({ linkId, patientDisplayId, patientFullName, onResolved }: Props) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();
  const [pending, setPending] = useState<'approve' | 'decline' | null>(null);

  const handle = useCallback(async (kind: 'approve' | 'decline') => {
    if (pending) return;
    setPending(kind);
    try {
      const svc = isMockMode ? mockService : realService;
      const result = kind === 'approve'
        ? await svc.approveIncomingRequest(linkId)
        : await svc.declineIncomingRequest(linkId);
      if (!result.ok && result.reason === 'STATE_CHANGED') {
        Alert.alert(
          t('clinician.incomingRequests.alreadyHandled' as TranslationKey),
        );
        onResolved();
        return;
      }
      onResolved();
    } catch {
      Alert.alert(
        t('clinician.incomingRequests.errorTitle' as TranslationKey),
        t('clinician.incomingRequests.errorBody' as TranslationKey),
      );
    } finally {
      setPending(null);
    }
  }, [pending, isMockMode, linkId, onResolved, t]);

  const label = patientFullName ?? patientDisplayId ?? '—';

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Feather name="user-plus" size={14} color={COLORS.primary} />
      </View>
      <View style={styles.col}>
        <Text style={styles.name} numberOfLines={1}>{label}</Text>
        {patientFullName && patientDisplayId && (
          <Text style={styles.subtitle}>{patientDisplayId}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => handle('decline')}
        disabled={!!pending}
        style={[styles.declineBtn, !!pending && styles.btnDisabled]}
        accessibilityLabel={t('clinician.incomingRequests.decline' as TranslationKey)}
      >
        {pending === 'decline' ? (
          <ActivityIndicator size="small" color={COLORS.statusUrgent} />
        ) : (
          <Text style={styles.declineText}>
            {t('clinician.incomingRequests.decline' as TranslationKey)}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handle('approve')}
        disabled={!!pending}
        style={[styles.approveBtn, !!pending && styles.btnDisabled]}
        accessibilityLabel={t('clinician.incomingRequests.approve' as TranslationKey)}
      >
        {pending === 'approve' ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.approveText}>
            {t('clinician.incomingRequests.approve' as TranslationKey)}
          </Text>
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
    backgroundColor: COLORS.primaryLight,
    marginBottom: SPACING.xs,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  col: { flex: 1, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 11, color: COLORS.textSecondary },
  declineBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.statusUrgent,
    minWidth: 64,
    alignItems: 'center',
  },
  declineText: { fontSize: 12, fontWeight: '700', color: COLORS.statusUrgent },
  approveBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 1,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    minWidth: 64,
    alignItems: 'center',
  },
  approveText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.5 },
});
