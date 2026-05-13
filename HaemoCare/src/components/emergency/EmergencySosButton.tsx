import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING } from '../../config/theme';
import EmergencyContactSheet from './EmergencyContactSheet';
import type { EmergencyContact } from '../../types/database';

export interface EmergencySosButtonProps {
  contacts: EmergencyContact[];
  patientName: string;
}

export default function EmergencySosButton({ contacts, patientName }: EmergencySosButtonProps) {
  const { t } = useLanguage();
  const navigation = useNavigation();
  const [sheetVisible, setSheetVisible] = useState(false);
  const hasContacts = contacts.length > 0;

  if (!hasContacts) {
    return (
      <TouchableOpacity
        style={styles.buttonEmpty}
        onPress={() => navigation.navigate('EmergencyContacts' as never)}
        activeOpacity={0.8}
      >
        <Feather name="plus-circle" size={18} color={COLORS.statusUrgent ?? '#DC3B3B'} />
        <Text style={styles.textEmpty}>{t('emergency.sosAddFirst' as TranslationKey)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.buttonFull}
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('emergency.sos' as TranslationKey)}
      >
        <Feather name="phone-call" size={20} color={COLORS.white} />
        <Text style={styles.textFull}>{t('emergency.sos' as TranslationKey)}</Text>
      </TouchableOpacity>
      <EmergencyContactSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        contacts={contacts}
        context="sos"
        patientName={patientName}
      />
    </>
  );
}

const styles = StyleSheet.create({
  buttonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
    marginVertical: SPACING.md,
  },
  textFull: { color: COLORS.white, fontSize: 17, fontWeight: '800', letterSpacing: 1 },
  buttonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    marginVertical: SPACING.md,
  },
  textEmpty: { color: COLORS.statusUrgent ?? '#DC3B3B', fontSize: 13, fontWeight: '700' },
});
