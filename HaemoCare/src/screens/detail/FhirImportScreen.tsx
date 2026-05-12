import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  listAppointmentsForPatient,
  mapFhirAppointmentToHaemoCare,
  FhirAppointment,
  FhirError,
} from '../../services/fhirAppointments';
import * as mockServices from '../../mock/services';
import * as realApptService from '../../services/appointmentService';
import Button from '../../components/common/Button';
import Disclaimer from '../../components/common/Disclaimer';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

const DEFAULT_BASE = process.env.EXPO_PUBLIC_FHIR_BASE_URL || 'http://localhost:8090/fhir';
const DEFAULT_PATIENT = process.env.EXPO_PUBLIC_FHIR_TEST_PATIENT_ID || 'Patient/haemocare-mock-patient';

export default function FhirImportScreen() {
  const navigation = useNavigation<any>();
  const { user, isMockMode } = useAuth();
  const { t, language } = useLanguage();

  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [patientRef, setPatientRef] = useState(DEFAULT_PATIENT);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState<FhirAppointment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFetch = async () => {
    setError('');
    setFetched([]);
    setSelected(new Set());
    setLoading(true);
    try {
      const list = await listAppointmentsForPatient(baseUrl.trim(), patientRef.trim());
      if (list.length === 0) {
        setError(t('importAppt.fhir.noResults'));
      } else {
        setFetched(list);
        setSelected(new Set(list.map(a => a.id))); // default: select all
      }
    } catch (e: any) {
      if (e instanceof FhirError) {
        setError(e.message);
      } else {
        setError(e?.message ?? t('importAppt.fhir.fetchError'));
      }
    }
    setLoading(false);
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!user || selected.size === 0) return;
    setSaving(true);
    try {
      const picks = fetched.filter(a => selected.has(a.id));
      for (const appt of picks) {
        const payload = mapFhirAppointmentToHaemoCare(appt);
        if (isMockMode) {
          await mockServices.upsertAppointmentByExternalId(user.id, payload);
        } else {
          await realApptService.upsertAppointmentByExternalId(user.id, payload);
        }
      }
      navigation.goBack();
    } catch (e: any) {
      console.error('fhir save error', e);
      setError(e?.message ?? t('importAppt.fhir.saveError'));
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('importAppt.fhir.title')}</Text>
        <Text style={styles.subtitle}>{t('importAppt.fhir.subtitle')}</Text>

        <Disclaimer message={t('importAppt.fhir.disclaimer')} />

        <View style={styles.field}>
          <Text style={styles.label}>{t('importAppt.fhir.baseUrl')}</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="http://localhost:8090/fhir"
            placeholderTextColor={COLORS.textLight}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('importAppt.fhir.patientRef')}</Text>
          <TextInput
            style={styles.input}
            value={patientRef}
            onChangeText={setPatientRef}
            placeholder="Patient/haemocare-mock-patient"
            placeholderTextColor={COLORS.textLight}
            autoCapitalize="none"
          />
        </View>

        <Button
          label={loading ? t('importAppt.fhir.loading') : t('importAppt.fhir.fetch')}
          onPress={handleFetch}
          isLoading={loading}
          variant="outline"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {fetched.length > 0 && (
          <View style={{ gap: SPACING.sm }}>
            <Text style={styles.sectionLabel}>
              {fetched.length} {fetched.length === 1 ? t('importAppt.fhir.resultFound') : t('importAppt.fhir.resultsFound')}
            </Text>
            {fetched.map(appt => {
              const isSelected = selected.has(appt.id);
              const mapped = mapFhirAppointmentToHaemoCare(appt);
              const when = formatWhen(mapped.scheduled_date, language);
              return (
                <TouchableOpacity
                  key={appt.id}
                  onPress={() => toggle(appt.id)}
                  activeOpacity={0.7}
                  style={[styles.resultCard, isSelected && styles.resultCardSelected]}
                >
                  <View style={[styles.check, isSelected && styles.checkOn]}>
                    {isSelected && <Feather name="check" size={14} color={COLORS.white} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultWhen}>{when}</Text>
                    <Text style={styles.resultHospital}>{mapped.hospital || '(no location)'}</Text>
                    {!!mapped.notes && <Text style={styles.resultNotes}>{mapped.notes}</Text>}
                    <Text style={styles.resultMeta}>{t('importAppt.fhir.resourceId')}: {appt.id}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Button
              label={`${t('importAppt.fhir.saveSelected')} (${selected.size})`}
              onPress={handleSave}
              isLoading={saving}
              disabled={selected.size === 0}
              style={{ marginTop: SPACING.sm }}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatWhen(iso: string, lang: 'en' | 'th'): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.md },
  title: { ...TYPOGRAPHY.h2, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  field: { gap: 4 },
  label: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.textSecondary },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md - 2,
    ...TYPOGRAPHY.bodySmall, color: COLORS.text, backgroundColor: COLORS.white,
    fontFamily: 'monospace',
  },
  error: { ...TYPOGRAPHY.bodySmall, color: COLORS.statusUrgent },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight, marginTop: SPACING.sm },
  resultCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  resultCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  check: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  resultWhen: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.primary },
  resultHospital: { ...TYPOGRAPHY.body, color: COLORS.text, marginTop: 2 },
  resultNotes: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
  resultMeta: { ...TYPOGRAPHY.caption, color: COLORS.textLight, marginTop: 2, fontFamily: 'monospace' },
});
