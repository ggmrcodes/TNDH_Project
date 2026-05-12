import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Feather } from '@expo/vector-icons';
import { Profile } from '../../types/database';
import { encodeProfileForQR } from '../../utils/qrCodeData';
import { useLanguage } from '../../contexts/LanguageContext';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface QRCodeViewProps {
  profile: Profile;
}

export default function QRCodeView({ profile }: QRCodeViewProps) {
  const { t } = useLanguage();
  const data = encodeProfileForQR(profile);

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{t('passport.qrTitle')}</Text>
      <View style={styles.qrContainer}>
        <QRCode
          value={data}
          size={180}
          color={COLORS.primary}
          backgroundColor={COLORS.white}
        />
      </View>

      {/* Patient ID badge */}
      <View style={styles.idBadge}>
        <Feather name="user" size={12} color={COLORS.primary} />
        <Text style={styles.idBadgeText}>{profile.patient_id}</Text>
      </View>

      <Text style={styles.subtitle}>{t('passport.qrSubtitle')}</Text>

      {/* Privacy notice */}
      <View style={styles.privacyNotice}>
        <Feather name="shield" size={12} color={COLORS.statusNormal} />
        <Text style={styles.privacyText}>
          {profile.share_full_name
            ? 'QR includes your name and medical data'
            : 'QR uses Patient ID only — name is hidden'
          }
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  qrContainer: {
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.sm,
  },
  idBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.statusNormalBg,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
  },
  privacyText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.statusNormalText,
  },
});
