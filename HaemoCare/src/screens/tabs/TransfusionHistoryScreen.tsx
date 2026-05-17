import React, { useState, useCallback } from 'react';
import { View, FlatList, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';
import { Transfusion } from '../../types/database';
import { formatDate } from '../../utils/dateHelpers';
import { isEmptyLabs } from '../../utils/preTransfusionLabs';
import { TranslationKey } from '../../i18n';
import LanguageToggle from '../../components/common/LanguageToggle';
import ResponsiveContainer from '../../components/common/ResponsiveContainer';
import EmptyState from '../../components/common/EmptyState';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

export default function TransfusionHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const { isDesktop } = useResponsive();
  const [transfusions, setTransfusions] = useState<Transfusion[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        const data = isMockMode
          ? await mockServices.getTransfusions()
          : await realTransfusionService.getTransfusions(user.id);
        if (!cancelled) { setTransfusions(data); setLoading(false); }
      })();
      return () => { cancelled = true; };
    }, [user, isMockMode])
  );

  const totalUnits = transfusions.reduce((sum, tx) => sum + tx.units_received, 0);
  const reactionCount = transfusions.filter(tx => tx.reaction_noted).length;

  const renderTxCard = ({ item }: { item: Transfusion }) => {
    const labs = item.pre_labs ?? null;
    const labsPresent = !isEmptyLabs(labs);
    const fmt = (n: number | null | undefined): string => {
      if (n == null) return '—';
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    };
    const labsLine = labsPresent
      ? t('preLabs.summary' as TranslationKey)
          .replace('{hb}', fmt(labs?.hb))
          .replace('{hct}', fmt(labs?.hct))
          .replace('{ferritin}', fmt(labs?.ferritin))
      : null;
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('TransfusionDetail', { transfusionId: item.id })}
        activeOpacity={0.7}
      >
        <View style={[styles.txCard, item.reaction_noted && styles.txCardReaction]}>
          <View style={styles.txDateRow}>
            <Feather name="droplet" size={16} color={COLORS.primary} />
            <Text style={styles.txDate}>{formatDate(item.date, language)}</Text>
            {item.reaction_noted && (
              <View style={styles.reactionBadge}>
                <Feather name="alert-triangle" size={11} color={COLORS.statusUrgent} />
                <Text style={styles.reactionText}>{t('history.reaction')}</Text>
              </View>
            )}
          </View>
          <View style={styles.txInfoRow}>
            <Feather name="map-pin" size={14} color={COLORS.textLight} />
            <Text style={styles.txHospital} numberOfLines={1}>{item.hospital}</Text>
          </View>
          {labsLine ? (
            <View style={styles.preLabsRow}>
              <Feather name="activity" size={12} color={COLORS.primary} />
              <Text style={styles.preLabsText} numberOfLines={1}>{labsLine}</Text>
            </View>
          ) : (
            <View style={styles.preLabsRow}>
              <Feather name="activity" size={12} color={COLORS.textLight} />
              <Text style={styles.preLabsCta}>{t('preLabs.addCta' as TranslationKey)}</Text>
            </View>
          )}
          <View style={styles.txFooter}>
            <View style={styles.unitPill}>
              <Feather name="droplet" size={12} color={COLORS.primary} />
              <Text style={styles.unitText}>{item.units_received} {t('history.summary.units')}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={COLORS.textLight} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ResponsiveContainer>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>{t('history.title')}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ScanTransfusion')}
              activeOpacity={0.7}
              style={styles.addBtn}
              accessibilityRole="button"
              accessibilityLabel={t('history.addFirst')}
            >
              <Feather name="plus" size={16} color={COLORS.white} />
              <Text style={styles.addBtnText}>{t('history.addCta')}</Text>
            </TouchableOpacity>
            <LanguageToggle />
          </View>
        </View>

        <FlatList
          data={transfusions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            transfusions.length > 0 ? (
              <View style={[styles.statsCard, isDesktop && styles.statsCardDesktop]}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <Defs>
                      <SvgLinearGradient id="statsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#074F4F" />
                        <Stop offset="50%" stopColor="#0B6E6E" />
                        <Stop offset="100%" stopColor="#14A39A" />
                      </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100" height="100" fill="url(#statsGrad)" />
                  </Svg>
                </View>
                {/* Decorative circle */}
                <View style={styles.statsDecoCircle} />
                <View style={styles.statItem}>
                  <Feather name="hash" size={18} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.statNumber}>{transfusions.length}</Text>
                  <Text style={styles.statLabel}>{t('history.summary.total')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Feather name="droplet" size={18} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.statNumber}>{totalUnits}</Text>
                  <Text style={styles.statLabel}>{t('history.summary.units')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Feather name="alert-triangle" size={18} color={reactionCount > 0 ? '#FCA5A5' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.statNumber, reactionCount > 0 && { color: '#FCA5A5' }]}>{reactionCount}</Text>
                  <Text style={styles.statLabel}>{t('history.summary.reaction')}</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={renderTxCard}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="water-outline"
                message={t('history.noRecords')}
                hint={t('history.noRecordsHint')}
                cta={{
                  label: t('history.addFirst'),
                  onPress: () => navigation.navigate('ScanTransfusion'),
                  icon: 'plus',
                }}
              />
            ) : null
          }
          ListFooterComponent={
            transfusions.length > 0 ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('ScanTransfusion')}
                style={styles.addAnotherBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('history.addAnother')}
              >
                <Feather name="plus-circle" size={18} color={COLORS.primary} />
                <Text style={styles.addAnotherText}>{t('history.addAnother')}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, flex: 1, fontSize: 22 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 8, paddingHorizontal: 14,
    ...SHADOWS.glow,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.white, letterSpacing: 0.3 },
  list: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  addAnotherBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    marginTop: SPACING.sm, marginHorizontal: SPACING.xs,
    ...SHADOWS.card,
  },
  addAnotherText: { fontSize: 14, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.3 },
  statsCard: {
    overflow: 'hidden', borderRadius: 22, padding: SPACING.lg,
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg,
    position: 'relative', ...SHADOWS.glow,
  },
  statsCardDesktop: {},
  statsDecoCircle: {
    position: 'absolute', top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4, zIndex: 1 },
  statNumber: { ...TYPOGRAPHY.heroNumber, fontSize: 32, color: COLORS.white },
  statLabel: { ...TYPOGRAPHY.caption, color: 'rgba(255,255,255,0.92)', fontWeight: '700' },
  statDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 1 },
  txCard: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.lg, padding: SPACING.md,
    marginBottom: SPACING.sm + 2, borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    gap: 8, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.card,
  },
  txCardReaction: { borderLeftColor: COLORS.statusUrgent },
  txDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txDate: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.primary, flex: 1 },
  reactionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.statusUrgentBg, paddingVertical: 3, paddingHorizontal: 10, borderRadius: RADIUS.full,
  },
  reactionText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.statusUrgent },
  txInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txHospital: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.text, flex: 1 },
  txFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primaryLight, paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.full,
  },
  unitText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.primary },
  preLabsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  preLabsText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600', flex: 1 },
  preLabsCta: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '700' },
});
