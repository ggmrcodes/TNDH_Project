import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import * as realProfileService from '../../services/profileService';
import * as mockServices from '../../mock/services';
import { generatePassportPdf } from '../../utils/pdfGenerator';
import { formatDate, formatDateTime } from '../../utils/dateHelpers';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useUpdateContext } from '../../contexts/UpdateContext';

export default function PrivacySettingsScreen() {
  const navigation = useNavigation();
  const { profile, user, isMockMode, signOut, refreshProfile } = useAuth();
  const { t, language } = useLanguage();
  const { isMobile } = useResponsive();
  const [shareFullName, setShareFullName] = useState(profile?.share_full_name ?? false);
  const [isExporting, setIsExporting] = useState(false);
  const { status, loading, lastCheckedAt, check } = useUpdateContext();
  const installedVersion = Application.nativeApplicationVersion ?? 'dev';

  if (!profile || !user) return null;

  const handleToggleShareName = async (value: boolean) => {
    setShareFullName(value);
    try {
      if (isMockMode) {
        await mockServices.updateProfile(user.id, { share_full_name: value });
      } else {
        await realProfileService.updateProfile(user.id, { share_full_name: value });
      }
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update share preference:', err);
      setShareFullName(!value);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await generatePassportPdf(profile, language);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setIsExporting(false);
  };

  const handleSignOut = () => {
    Alert.alert(
      t('privacy.signOutConfirmTitle'),
      t('privacy.signOutConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (err) {
              console.error('Sign out failed:', err);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('privacy.deleteConfirmTitle'),
      t('privacy.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('privacy.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!isMockMode) {
                await realProfileService.deleteAccount(user.id);
              }
              await signOut();
            } catch (err) {
              console.error('Delete account failed:', err);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Patient ID Card */}
        <View style={styles.patientIdCard}>
          <View style={styles.patientIdIcon}>
            <Feather name="user" size={20} color={COLORS.white} />
          </View>
          <View style={styles.patientIdInfo}>
            <Text style={styles.patientIdLabel}>{t('privacy.patientId')}</Text>
            <Text style={styles.patientIdValue}>{profile.patient_id}</Text>
            <Text style={styles.patientIdDesc}>{t('privacy.patientIdDesc')}</Text>
          </View>
        </View>

        {/* PDPA Consent Status */}
        <View style={styles.consentCard}>
          <View style={styles.consentRow}>
            <View style={styles.consentIconBg}>
              <Feather name="shield" size={16} color={COLORS.statusNormal} />
            </View>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>{t('privacy.consentStatus')}</Text>
              <Text style={styles.consentDate}>
                {t('privacy.consentedOn')} {profile.pdpa_consented_at ? formatDate(profile.pdpa_consented_at, language) : '—'}
              </Text>
            </View>
            <View style={styles.consentBadge}>
              <Feather name="check" size={12} color={COLORS.statusNormal} />
            </View>
          </View>
        </View>

        {/* Anonymization Section */}
        <Text style={styles.sectionLabel}>{t('privacy.sectionAnonymization')}</Text>
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('privacy.shareFullName')}</Text>
              <Text style={styles.settingDesc}>{t('privacy.shareFullNameDesc')}</Text>
            </View>
            <Switch
              value={shareFullName}
              onValueChange={handleToggleShareName}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        {/* Data Section */}
        <Text style={styles.sectionLabel}>{t('privacy.sectionData')}</Text>
        <View style={styles.settingCard}>
          <View style={styles.infoRow}>
            <Feather name="database" size={16} color={COLORS.primary} />
            <View style={styles.infoCol}>
              <Text style={styles.settingTitle}>{t('privacy.dataStored')}</Text>
              <Text style={styles.settingDesc}>{t('privacy.dataStoredBody')}</Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleExportData}
            disabled={isExporting}
            activeOpacity={0.7}
          >
            <View style={styles.actionIcon}>
              <Feather name="download" size={16} color={COLORS.primary} />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>{t('privacy.exportData')}</Text>
              <Text style={styles.settingDesc}>{t('privacy.exportDataDesc')}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <Text style={styles.sectionLabel}>{t('privacy.sectionAccount')}</Text>
        <TouchableOpacity
          style={styles.signOutCard}
          onPress={handleSignOut}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('auth.logout')}
        >
          <View style={styles.signOutIcon}>
            <Feather name="log-out" size={20} color={COLORS.primary} />
          </View>
          <View style={styles.signOutInfo}>
            <Text style={styles.signOutTitle}>{t('auth.logout')}</Text>
            <Text style={styles.signOutDesc}>{t('privacy.signOutDesc')}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={COLORS.primary} />
        </TouchableOpacity>

        {/* Danger Zone */}
        <Text style={[styles.sectionLabel, { color: COLORS.statusUrgent }]}>
          {t('privacy.sectionDanger')}
        </Text>
        <TouchableOpacity
          style={styles.deleteCard}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
        >
          <View style={styles.deleteIcon}>
            <Feather name="trash-2" size={18} color={COLORS.statusUrgent} />
          </View>
          <View style={styles.deleteInfo}>
            <Text style={styles.deleteTitle}>{t('privacy.deleteAccount')}</Text>
            <Text style={styles.deleteDesc}>{t('privacy.deleteAccountDesc')}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={COLORS.statusUrgent} />
        </TouchableOpacity>

        {/* App updates */}
        <Text style={styles.sectionLabel}>{t('update.settings.title')}</Text>
        <View style={styles.settingCard}>
          <View style={styles.infoRow}>
            <Feather name="refresh-cw" size={16} color={COLORS.primary} />
            <View style={styles.infoCol}>
              <Text style={styles.settingTitle}>
                {t('update.settings.currentVersion', { version: installedVersion })}
              </Text>

              {status?.state === 'current' && (
                <Text style={styles.settingDesc}>{t('update.settings.upToDate')}</Text>
              )}
              {status?.state === 'optional_update' && (
                <Text style={styles.settingDesc}>
                  {t('update.settings.optionalAvailable', { version: status.latestVersion ?? '' })}
                </Text>
              )}
              {status?.state === 'required_update' && (
                <Text style={styles.settingDesc}>
                  {t('update.settings.requiredAvailable', { version: status.latestVersion ?? '' })}
                </Text>
              )}

              {lastCheckedAt && (
                <Text style={styles.updateCaption}>
                  {t('update.settings.lastCheckedAt', { time: formatDateTime(lastCheckedAt, language) })}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.updateButtonsRow}>
            <TouchableOpacity
              onPress={check}
              disabled={loading}
              style={styles.updatePrimaryBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.updatePrimaryBtnText}>
                {loading ? t('update.settings.checking') : t('update.settings.checkAction')}
              </Text>
            </TouchableOpacity>

            {(status?.state === 'optional_update' || status?.state === 'required_update') && status.apkUrl && (
              <TouchableOpacity
                onPress={() => Linking.openURL(status.apkUrl!).catch(() => {})}
                style={styles.updatePrimaryBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.updatePrimaryBtnText}>
                  {t('update.settings.downloadAction', { version: status.latestVersion ?? '' })}
                </Text>
              </TouchableOpacity>
            )}

            {status?.releaseNotesUrl && (
              <TouchableOpacity
                onPress={() => Linking.openURL(status.releaseNotesUrl!).catch(() => {})}
                style={styles.updateSecondaryBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.updateSecondaryBtnText}>
                  {t('update.settings.releaseNotesAction')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Feather name="shield" size={14} color={COLORS.textLight} />
          <Text style={styles.footerText}>
            Thailand Personal Data Protection Act (PDPA) B.E. 2562
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  // Patient ID card
  patientIdCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: SPACING.md,
  },
  patientIdIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  patientIdInfo: { flex: 1, gap: 2 },
  patientIdLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  patientIdValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 1,
  },
  patientIdDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  // Consent card
  consentCard: {
    backgroundColor: COLORS.statusNormalBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.statusNormal,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  consentIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consentInfo: { flex: 1, gap: 2 },
  consentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.statusNormalText,
  },
  consentDate: {
    fontSize: 12,
    color: COLORS.statusNormal,
  },
  consentBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Section label
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  // Setting card
  settingCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingInfo: { flex: 1, gap: 4 },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  infoCol: { flex: 1, gap: 4 },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionInfo: { flex: 1, gap: 4 },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Sign Out card
  signOutCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    ...SHADOWS.card,
  },
  signOutIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutInfo: { flex: 1, gap: 2 },
  signOutTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  signOutDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  // Delete card
  deleteCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.statusUrgentBg,
    ...SHADOWS.card,
  },
  deleteIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.statusUrgentBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteInfo: { flex: 1, gap: 4 },
  deleteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.statusUrgent,
  },
  deleteDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  // App updates
  updateCaption: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    marginTop: 4,
    lineHeight: 16,
  },
  updateButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  updatePrimaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  updatePrimaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  updateSecondaryBtn: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  updateSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.md,
  },
  footerText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});
