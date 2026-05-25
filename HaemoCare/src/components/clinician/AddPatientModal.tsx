import React, { useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/clinicianService';
import * as mockService from '../../mock/services';
import type { RequestLinkError } from '../../services/clinicianService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Phase =
  | { kind: 'input' }
  | { kind: 'submitting' }
  | { kind: 'error'; error: RequestLinkError }
  | { kind: 'success' };

function errorKey(error: RequestLinkError): TranslationKey {
  switch (error.kind) {
    case 'NOT_FOUND': return 'clinician.linkPatient.error.notFound' as TranslationKey;
    case 'ALREADY_ACTIVE': return 'clinician.linkPatient.error.alreadyActive' as TranslationKey;
    case 'ALREADY_PENDING': return 'clinician.linkPatient.error.alreadyPending' as TranslationKey;
    case 'UNKNOWN': return 'clinician.linkPatient.error.unknown' as TranslationKey;
  }
}

export default function AddPatientModal({ visible, onClose, onSuccess }: Props) {
  const { t } = useLanguage();
  const { user, isMockMode } = useAuth();
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });

  const reset = useCallback(() => {
    setInput('');
    setPhase({ kind: 'input' });
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    setPhase({ kind: 'submitting' });
    const svc = isMockMode ? mockService : realService;
    const result = await svc.requestPatientLink(user.id, trimmed);
    if (result.ok) {
      setPhase({ kind: 'success' });
      onSuccess();
    } else {
      setPhase({ kind: 'error', error: result.error });
    }
  }, [input, user?.id, isMockMode, onSuccess]);

  const submitting = phase.kind === 'submitting';
  const canSubmit = input.trim().length > 0 && !submitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.card} onPress={() => { /* swallow */ }}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('clinician.linkPatient.modalTitle' as TranslationKey)}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8} style={styles.closeBtn}>
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {t('clinician.linkPatient.modalSubtitle' as TranslationKey)}
          </Text>

          {phase.kind !== 'success' && (
            <>
              <Text style={styles.inputLabel}>
                {t('clinician.linkPatient.inputLabel' as TranslationKey)}
              </Text>
              <TextInput
                value={input}
                onChangeText={(v) => {
                  setInput(v);
                  if (phase.kind === 'error') setPhase({ kind: 'input' });
                }}
                placeholder={t('clinician.linkPatient.inputPlaceholder' as TranslationKey)}
                placeholderTextColor={COLORS.textLight}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                style={styles.input}
                onSubmitEditing={canSubmit ? handleSubmit : undefined}
                returnKeyType="send"
              />
              {phase.kind === 'error' && (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color={COLORS.statusUrgent} />
                  <Text style={styles.errorText}>{t(errorKey(phase.error))}</Text>
                </View>
              )}
              <View style={styles.actions}>
                <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>
                    {t('clinician.linkPatient.cancel' as TranslationKey)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.submitText}>
                      {t('clinician.linkPatient.submit' as TranslationKey)}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {phase.kind === 'success' && (
            <View style={styles.successWrap}>
              <View style={styles.successIcon}>
                <Feather name="check" size={22} color={COLORS.statusNormal} />
              </View>
              <Text style={styles.successText}>
                {t('clinician.linkPatient.success' as TranslationKey)}
              </Text>
              <TouchableOpacity onPress={handleClose} style={styles.submitBtn}>
                <Text style={styles.submitText}>
                  {t('clinician.linkPatient.close' as TranslationKey)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 420,
    gap: SPACING.md,
    ...(SHADOWS.elevated as object),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: -SPACING.xs,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: -SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    backgroundColor: COLORS.white,
    letterSpacing: 0.5,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.statusUrgentBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.statusUrgentText,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  submitBtnDisabled: {
    backgroundColor: COLORS.textLight,
    opacity: 0.5,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  successWrap: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.statusNormalBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 20,
  },
});
