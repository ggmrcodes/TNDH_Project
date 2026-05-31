import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, Linking, ToastAndroid, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING } from '../../config/theme';
import { buildSmsBody, digitsOnly } from '../../utils/emergencySms';
import type { EmergencyContact, EmergencyContext } from '../../types/database';

export interface EmergencyContactSheetProps {
  visible: boolean;
  onClose: () => void;
  contacts: EmergencyContact[];
  context: EmergencyContext;
  patientName: string;
  daysOverdue?: number;
}

const SUBTITLE_KEY: Record<EmergencyContext, TranslationKey> = {
  sos: 'emergency.sheet.subtitle.sos' as TranslationKey,
  urgent_symptom: 'emergency.sheet.subtitle.urgent' as TranslationKey,
  overdue: 'emergency.sheet.subtitle.overdue' as TranslationKey,
};

function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

function maskPhone(phone: string): string {
  const digits = digitsOnly(phone);
  if (digits.length <= 4) return phone;
  return phone.slice(0, 3) + '•••' + phone.slice(-3);
}

export default function EmergencyContactSheet(props: EmergencyContactSheetProps) {
  const { visible, onClose, contacts, context, patientName, daysOverdue } = props;
  const { t } = useLanguage();
  const navigation = useNavigation();

  const handleCall = async (phone: string) => {
    const url = `tel:${digitsOnly(phone)}`;
    try {
      await Linking.openURL(url);
    } catch {
      showToast(t('emergency.errors.noSms' as TranslationKey));
    }
    onClose();
  };

  const handleSms = async (phone: string) => {
    const body = buildSmsBody({ context, patientName, daysOverdue, t });
    const url = `sms:${digitsOnly(phone)}?body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      showToast(t('emergency.errors.noSms' as TranslationKey));
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
          <Text style={styles.title}>{t('emergency.sheet.title' as TranslationKey)}</Text>
          <Text style={styles.subtitle}>{t(SUBTITLE_KEY[context])}</Text>
          {contacts.map(c => (
            <View key={c.id} style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {c.role_label ? `${c.role_label} · ` : ''}{maskPhone(c.phone)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.callBtn]}
                onPress={() => handleCall(c.phone)}
                accessibilityLabel={t('emergency.action.call' as TranslationKey)}
              >
                <Feather name="phone" size={18} color={COLORS.white} />
                <Text style={styles.actionText}>{t('emergency.action.call' as TranslationKey)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.smsBtn]}
                onPress={() => handleSms(c.phone)}
                accessibilityLabel={t('emergency.action.sms' as TranslationKey)}
              >
                <Feather name="message-square" size={18} color={COLORS.white} />
                <Text style={styles.actionText}>{t('emergency.action.sms' as TranslationKey)}</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.manage}
            onPress={() => { onClose(); navigation.navigate('EmergencyContacts' as never); }}
            accessibilityRole="button"
            accessibilityLabel={t('emergency.sheet.manage' as TranslationKey)}
          >
            <Feather name="edit-2" size={14} color={COLORS.primary} />
            <Text style={styles.manageText}>{t('emergency.sheet.manage' as TranslationKey)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('emergency.sheet.cancel' as TranslationKey)}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight ?? '#E4E4E4' },
  col: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textLight },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: 10,
    minHeight: 44,
  },
  callBtn: { backgroundColor: COLORS.statusNormal ?? '#0EA572' },
  smsBtn: { backgroundColor: COLORS.primary ?? '#0B6E6E' },
  actionText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  // Subtle edit link below the call/SMS rows. Discoverability fix —
  // patient can jump straight to manage-contacts from the SOS sheet
  // instead of backing out to Settings.
  manage: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm, minHeight: 44,
  },
  manageText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  cancel: { alignSelf: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
  cancelText: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
});
