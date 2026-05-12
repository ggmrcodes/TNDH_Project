import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import * as realApptService from '../../services/appointmentService';
import * as mockServices from '../../mock/services';
import Button from '../../components/common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

export default function AddAppointmentScreen() {
  const navigation = useNavigation();
  const { user, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [dateStr, setDateStr] = useState('');
  const [hospital, setHospital] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!user) return;
    setError('');

    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      setError('Please enter a valid date (YYYY-MM-DD)');
      return;
    }

    setSaving(true);
    try {
      const data = {
        scheduled_date: parsed.toISOString(),
        hospital: hospital.trim(),
        notes: notes.trim(),
      };
      if (isMockMode) {
        await mockServices.createAppointment(user.id, data);
      } else {
        await realApptService.createAppointment(user.id, data);
      }
      navigation.goBack();
    } catch (err) {
      setError('Failed to create appointment');
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        <Text style={styles.title}>{t('appointments.addNew')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>{t('appointments.date')} *</Text>
        <TextInput
          style={styles.input}
          value={dateStr}
          onChangeText={setDateStr}
          placeholder="2026-05-15"
          placeholderTextColor={COLORS.textLight}
        />

        <Text style={styles.label}>{t('appointments.hospital')} *</Text>
        <TextInput
          style={styles.input}
          value={hospital}
          onChangeText={setHospital}
          placeholderTextColor={COLORS.textLight}
        />

        <Text style={styles.label}>{t('appointments.notes')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholderTextColor={COLORS.textLight}
        />

        <Button
          label={t('common.save')}
          onPress={handleSave}
          isLoading={saving}
          disabled={!dateStr || !hospital.trim()}
          style={{ marginTop: SPACING.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md - 2,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.error,
    backgroundColor: COLORS.statusUrgentBg,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
});
