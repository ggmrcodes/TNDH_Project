import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Platform, ToastAndroid, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING } from '../../config/theme';
import type { UpdateStatus } from '../../utils/updateCheck';

export interface UpdateBannerProps {
  status: UpdateStatus | null;
}

function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

/**
 * Renders nothing if status is null/unknown/current.
 * Renders an optional or required update banner otherwise.
 * "Required" banners are not dismissible; "optional" ones are.
 */
export default function UpdateBanner({ status }: UpdateBannerProps) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  if (!status) return null;
  if (status.state === 'current' || status.state === 'unknown') return null;
  if (status.state === 'optional_update' && dismissed) return null;
  // NOTE: required_update is intentionally never dismissed — the dismissed flag
  // only gates optional_update above, so isRequired banners always render.

  const isRequired = status.state === 'required_update';

  const handleDownload = async () => {
    if (!status.apkUrl) return;
    try {
      await Linking.openURL(status.apkUrl);
    } catch {
      showToast(t('update.errors.openFailed' as TranslationKey));
    }
  };

  const handleReleaseNotes = async () => {
    if (!status.releaseNotesUrl) return;
    try {
      await Linking.openURL(status.releaseNotesUrl);
    } catch {
      showToast(t('update.errors.openFailed' as TranslationKey));
    }
  };

  const titleKey = (isRequired ? 'update.banner.required.title' : 'update.banner.optional.title') as TranslationKey;
  const bodyKey = (isRequired ? 'update.banner.required.body' : 'update.banner.optional.body') as TranslationKey;
  const ctaKey = (isRequired ? 'update.banner.required.cta' : 'update.banner.optional.cta') as TranslationKey;

  return (
    <View style={[styles.banner, isRequired && styles.bannerRequired]} accessibilityRole="alert">
      <View style={[styles.iconWrap, isRequired && { backgroundColor: COLORS.statusUrgent ?? '#DC3B3B' }]}>
        <Feather name={isRequired ? 'alert-triangle' : 'download'} size={20} color={COLORS.white} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        <Text style={styles.body}>
          {t(bodyKey, { version: status.latestVersion ?? '' })}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.ctaBtn} onPress={handleDownload} activeOpacity={0.8}>
            <Text style={styles.ctaText}>{t(ctaKey)}</Text>
          </TouchableOpacity>
          {status.releaseNotesUrl && (
            <TouchableOpacity onPress={handleReleaseNotes} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t('update.releaseNotes.link' as TranslationKey)}</Text>
            </TouchableOpacity>
          )}
          {!isRequired && (
            <TouchableOpacity onPress={() => setDismissed(true)} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t('update.banner.optional.dismiss' as TranslationKey)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: COLORS.statusMonitorBg ?? '#FEF3E7',
    borderWidth: 1,
    borderColor: COLORS.statusMonitor ?? '#E8933A',
    marginBottom: SPACING.md,
  },
  bannerRequired: {
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.statusMonitor ?? '#E8933A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: { flex: 1, gap: SPACING.xs },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  body: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  ctaBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    backgroundColor: COLORS.statusMonitor ?? '#E8933A',
  },
  ctaText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  linkBtn: { paddingHorizontal: SPACING.xs, paddingVertical: SPACING.sm },
  linkText: { color: COLORS.textLight, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
