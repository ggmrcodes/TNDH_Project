import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import { useConnectedClinicians } from '../../hooks/useConnectedClinicians';
import * as realService from '../../services/patientService';
import * as mockService from '../../mock/services';

export default function ConnectedCliniciansSection() {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();
  const { connected, refresh } = useConnectedClinicians();

  const handleRevoke = useCallback(
    (linkId: string, clinicianName: string) => {
      const title = t('privacy.connectedClinicians.revokeConfirmTitle' as TranslationKey);
      const body = t('privacy.connectedClinicians.revokeConfirmBody' as TranslationKey, { name: clinicianName });
      const doRevoke = async () => {
        try {
          const svc = isMockMode ? mockService : realService;
          await svc.revokeClinicianLink(linkId);
          refresh();
        } catch {
          // Swallow; revoke is non-critical and the list will refresh on next mount.
        }
      };

      // react-native-web's Alert.alert is a no-op (see src/exports/Alert/index.js
      // in the react-native-web package). Fall back to window.confirm so the
      // web build can still gate the destructive action.
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${body}`)) {
          void doRevoke();
        }
        return;
      }

      Alert.alert(title, body, [
        { text: t('privacy.connectedClinicians.revokeConfirmNo' as TranslationKey), style: 'cancel' },
        {
          text: t('privacy.connectedClinicians.revokeConfirmYes' as TranslationKey),
          style: 'destructive',
          onPress: doRevoke,
        },
      ]);
    },
    [t, isMockMode, refresh]
  );

  return (
    <>
      <Text style={styles.sectionLabel}>
        {t('privacy.connectedClinicians.title' as TranslationKey)}
      </Text>
      {connected.length === 0 ? (
        <View style={styles.emptyCard}>
          <Feather name="users" size={16} color={COLORS.textLight} />
          <Text style={styles.emptyText}>
            {t('privacy.connectedClinicians.empty' as TranslationKey)}
          </Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {connected.map((c, i) => (
            <View
              key={c.linkId}
              style={[styles.row, i > 0 && styles.rowDivider]}
            >
              <View style={styles.avatar}>
                <Feather name="user" size={16} color={COLORS.primary} />
              </View>
              <View style={styles.col}>
                <Text style={styles.name} numberOfLines={1}>{c.clinicianFullName}</Text>
                {c.clinicianHospital && (
                  <Text style={styles.hospital} numberOfLines={1}>{c.clinicianHospital}</Text>
                )}
                {c.shareFullName && (
                  <View style={styles.badge}>
                    <Feather name="user-check" size={10} color={COLORS.primary} />
                    <Text style={styles.badgeText}>
                      {t('privacy.connectedClinicians.sharingFullName' as TranslationKey)}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleRevoke(c.linkId, c.clinicianFullName)}
                style={styles.revokeBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('privacy.connectedClinicians.revoke' as TranslationKey)}
              >
                <Text style={styles.revokeText}>
                  {t('privacy.connectedClinicians.revoke' as TranslationKey)}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  listCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  col: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  hospital: { fontSize: 12, color: COLORS.textSecondary },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  revokeBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.statusUrgent,
  },
  revokeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.statusUrgent,
  },
});
