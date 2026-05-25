import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/patientService';
import * as mockService from '../../mock/services';
import type { PendingLinkRequest } from '../../services/patientService';

interface Props {
  visible: boolean;
  pending: PendingLinkRequest[];
  onClose: () => void;
  onAnyResponse: () => void;
}

function formatRequestedAt(iso: string, language: 'en' | 'th'): string {
  try {
    const d = new Date(iso);
    const locale = language === 'th' ? 'th-TH' : 'en-US';
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function LinkRequestModal({ visible, pending, onClose, onAnyResponse }: Props) {
  const { t, language } = useLanguage();
  const { isMockMode } = useAuth();
  const [index, setIndex] = useState(0);
  const [shareFullName, setShareFullName] = useState(true);
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | null>(null);

  // Reset internal pointer + toggle whenever the modal is re-opened or the
  // list changes (response from one request shrinks the list).
  useEffect(() => {
    setIndex(0);
    setShareFullName(true);
    setPendingAction(null);
  }, [visible, pending.length]);

  const current = pending[index];

  const handleResponse = useCallback(
    async (kind: 'accept' | 'decline') => {
      if (!current || pendingAction) return;
      setPendingAction(kind);
      try {
        const svc = isMockMode ? mockService : realService;
        if (kind === 'accept') {
          await svc.acceptLinkRequest(current.linkId, shareFullName);
        } else {
          await svc.declineLinkRequest(current.linkId);
        }
        onAnyResponse();
        // List will shrink on the next refresh; the useEffect above resets index.
      } finally {
        setPendingAction(null);
      }
    },
    [current, pendingAction, isMockMode, shareFullName, onAnyResponse]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => { /* swallow */ }}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('patient.linkRequest.modalTitle' as TranslationKey)}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {!current ? (
            <View style={styles.allDoneWrap}>
              <View style={styles.successIcon}>
                <Feather name="check" size={22} color={COLORS.statusNormal} />
              </View>
              <Text style={styles.allDoneText}>
                {t('patient.linkRequest.allDone' as TranslationKey)}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>
                  {t('clinician.linkPatient.close' as TranslationKey)}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {pending.length > 1 && (
                <Text style={styles.progress}>
                  {`${index + 1} / ${pending.length}`}
                </Text>
              )}

              <View style={styles.requestCard}>
                <View style={styles.avatarBadge}>
                  <Feather name="user" size={20} color={COLORS.white} />
                </View>
                <Text style={styles.clinicianName} numberOfLines={2}>
                  {current.clinicianFullName}
                </Text>
                {current.clinicianHospital && (
                  <Text style={styles.hospital} numberOfLines={2}>
                    {current.clinicianHospital}
                  </Text>
                )}
                <Text style={styles.requestedAt}>
                  {t('patient.linkRequest.modalRequestedAt' as TranslationKey, {
                    date: formatRequestedAt(current.requestedAt, language),
                  })}
                </Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelCol}>
                  <Text style={styles.toggleLabel}>
                    {t('patient.linkRequest.shareFullNameLabel' as TranslationKey)}
                  </Text>
                  <Text style={styles.toggleHelp}>
                    {t('patient.linkRequest.shareFullNameHelp' as TranslationKey)}
                  </Text>
                </View>
                <Switch
                  value={shareFullName}
                  onValueChange={setShareFullName}
                  trackColor={{ false: COLORS.borderLight, true: COLORS.primaryMuted }}
                  thumbColor={shareFullName ? COLORS.primary : COLORS.surface}
                  ios_backgroundColor={COLORS.borderLight}
                />
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => handleResponse('decline')}
                  disabled={pendingAction !== null}
                  style={[styles.declineBtn, pendingAction !== null && styles.btnDisabled]}
                >
                  {pendingAction === 'decline' ? (
                    <ActivityIndicator size="small" color={COLORS.statusUrgent} />
                  ) : (
                    <Text style={styles.declineText}>
                      {t('patient.linkRequest.decline' as TranslationKey)}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleResponse('accept')}
                  disabled={pendingAction !== null}
                  style={[styles.primaryBtn, pendingAction !== null && styles.btnDisabled]}
                >
                  {pendingAction === 'accept' ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.primaryText}>
                      {t('patient.linkRequest.approve' as TranslationKey)}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
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
  progress: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 1,
    marginTop: -SPACING.sm,
  },
  requestCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 4,
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  clinicianName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  hospital: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  requestedAt: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: SPACING.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  toggleLabelCol: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  toggleHelp: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.statusUrgent,
    backgroundColor: 'transparent',
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  declineText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.statusUrgent,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  btnDisabled: { opacity: 0.5 },
  allDoneWrap: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.statusNormalBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allDoneText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
});
