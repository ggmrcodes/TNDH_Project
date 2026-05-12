import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import LanguageToggle from '../../components/common/LanguageToggle';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

interface InfoSectionProps {
  icon: string;
  title: string;
  body: string;
}

function InfoSection({ icon, title, body }: InfoSectionProps) {
  return (
    <View style={styles.infoSection}>
      <View style={styles.infoHeader}>
        <View style={styles.infoIcon}>
          <Feather name={icon as any} size={16} color={COLORS.primary} />
        </View>
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      <Text style={styles.infoBody}>{body}</Text>
    </View>
  );
}

export default function PDPAConsentScreen() {
  const { setPdpaConsent } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showError, setShowError] = useState(false);

  const handleConsent = async () => {
    if (!agreed) {
      setShowError(true);
      return;
    }
    setIsLoading(true);
    try {
      await setPdpaConsent();
    } catch (err) {
      console.error('Consent error:', err);
    }
    setIsLoading(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Feather name="shield" size={20} color={COLORS.primary} />
          <Text style={styles.topBarTitle}>PDPA</Text>
        </View>
        <LanguageToggle />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.shieldBadge}>
            <Feather name="shield" size={32} color={COLORS.white} />
          </View>
          <Text style={styles.title}>{t('pdpa.title')}</Text>
          <Text style={styles.subtitle}>{t('pdpa.subtitle')}</Text>
        </View>

        {/* Info sections */}
        <View style={styles.card}>
          <InfoSection
            icon="database"
            title={t('pdpa.whatWeCollect')}
            body={t('pdpa.whatWeCollectBody')}
          />
          <View style={styles.divider} />
          <InfoSection
            icon="heart"
            title={t('pdpa.whyWeCollect')}
            body={t('pdpa.whyWeCollectBody')}
          />
          <View style={styles.divider} />
          <InfoSection
            icon="lock"
            title={t('pdpa.whoCanAccess')}
            body={t('pdpa.whoCanAccessBody')}
          />
          <View style={styles.divider} />
          <InfoSection
            icon="check-circle"
            title={t('pdpa.yourRights')}
            body={t('pdpa.yourRightsBody')}
          />
          <View style={styles.divider} />
          <InfoSection
            icon="clock"
            title={t('pdpa.dataRetention')}
            body={t('pdpa.dataRetentionBody')}
          />
        </View>

        {/* Consent checkbox */}
        <TouchableOpacity
          style={[styles.checkboxRow, agreed && styles.checkboxRowActive]}
          onPress={() => { setAgreed(!agreed); setShowError(false); }}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Feather name="check" size={14} color={COLORS.white} />}
          </View>
          <Text style={[styles.checkboxLabel, agreed && styles.checkboxLabelActive]}>
            {t('pdpa.consent')}
          </Text>
        </TouchableOpacity>

        {showError && (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={14} color={COLORS.statusUrgent} />
            <Text style={styles.errorText}>{t('pdpa.consentRequired')}</Text>
          </View>
        )}

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, !agreed && styles.submitBtnDisabled]}
          onPress={handleConsent}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Feather name="check-circle" size={18} color={COLORS.white} />
          <Text style={styles.submitBtnText}>{t('pdpa.agree')}</Text>
        </TouchableOpacity>

        {/* PDPA badge */}
        <View style={styles.pdpaBadge}>
          <Feather name="shield" size={14} color={COLORS.textLight} />
          <Text style={styles.pdpaBadgeText}>
            Thailand Personal Data Protection Act (PDPA) B.E. 2562
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  shieldBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  infoSection: {
    gap: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  infoBody: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
    paddingLeft: 42,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  checkboxRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  checkboxLabelActive: {
    color: COLORS.text,
    fontWeight: '500',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.statusUrgent,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
  pdpaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pdpaBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});
