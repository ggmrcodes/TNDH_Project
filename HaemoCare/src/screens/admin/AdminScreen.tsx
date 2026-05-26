import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { useHospitals } from '../../hooks/useHospitals';
import { usePendingClinicians } from '../../hooks/usePendingClinicians';
import LanguageToggle from '../../components/common/LanguageToggle';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/clinicianService';
import * as mockService from '../../mock/services';
import type { PendingClinician } from '../../types/database';

function PendingRow({ clinician, hospitalLabel, onApprove }: {
  clinician: PendingClinician;
  hospitalLabel: string;
  onApprove: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const date = (() => {
    try {
      return new Date(clinician.created_at).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return clinician.created_at; }
  })();
  return (
    <View style={styles.card}>
      <View style={styles.cardCol}>
        <Text style={styles.name}>{clinician.full_name?.trim() || '—'}</Text>
        <Text style={styles.meta}>
          {t('admin.approvals.licenseLabel' as TranslationKey)}: {clinician.license_number || '—'}
        </Text>
        <Text style={styles.meta}>{hospitalLabel}</Text>
        <Text style={styles.metaLight}>
          {t('admin.approvals.signedUpAt' as TranslationKey, { date })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={async () => { setBusy(true); try { await onApprove(); } finally { setBusy(false); } }}
        disabled={busy}
        style={[styles.approveBtn, busy && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t('admin.approvals.approve' as TranslationKey)}
      >
        {busy
          ? <ActivityIndicator size="small" color={COLORS.white} />
          : <Text style={styles.approveText}>{t('admin.approvals.approve' as TranslationKey)}</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function AdminScreen() {
  const { t } = useLanguage();
  const { signOut, isMockMode } = useAuth();
  const { isMobile } = useResponsive();
  const { hospitals } = useHospitals();
  const { pending, count, loading, refresh } = usePendingClinicians();

  const hospitalLabelFor = useCallback((c: PendingClinician): string => {
    if (c.hospital_id) {
      const h = hospitals.find(x => x.id === c.hospital_id);
      if (h) return h.name_th;
    }
    return c.hospital_affiliation?.trim() || '—';
  }, [hospitals]);

  const handleApprove = useCallback(async (userId: string) => {
    const svc = isMockMode ? mockService : realService;
    await svc.approveClinician(userId);
    refresh();
  }, [isMockMode, refresh]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>HaemoCare</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity onPress={signOut} style={styles.signOutBtn} accessibilityLabel={t('auth.logout')}>
            <Feather name="log-out" size={18} color={COLORS.statusUrgent} />
          </TouchableOpacity>
          <LanguageToggle />
        </View>
      </View>

      <View style={[styles.header, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('admin.title' as TranslationKey)}</Text>
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>{t('admin.subtitle' as TranslationKey)}</Text>
      </View>

      {loading && pending.length === 0 ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(c) => c.user_id}
          renderItem={({ item }) => (
            <PendingRow
              clinician={item}
              hospitalLabel={hospitalLabelFor(item)}
              onApprove={() => handleApprove(item.user_id)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' },
          ]}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('admin.approvals.empty' as TranslationKey)}</Text>
          }
          refreshControl={<RefreshControl refreshing={loading && pending.length > 0} onRefresh={refresh} tintColor={COLORS.primary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 56, paddingBottom: SPACING.sm,
  },
  brand: { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  signOutBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.statusUrgentBg,
    borderWidth: 1, borderColor: COLORS.statusUrgent,
    justifyContent: 'center', alignItems: 'center',
  },
  header: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text },
  badge: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.xs },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: SPACING.md, ...SHADOWS.card,
  },
  cardCol: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  metaLight: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  approveBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, minWidth: 96, minHeight: 40, alignItems: 'center', justifyContent: 'center',
  },
  approveText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.xl },
});
