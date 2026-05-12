import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { parseIcs, ParsedIcsEvent } from '../../utils/icsParser';
import * as mockServices from '../../mock/services';
import * as realApptService from '../../services/appointmentService';
import Button from '../../components/common/Button';
import Disclaimer from '../../components/common/Disclaimer';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

export default function IcsImportScreen() {
  const navigation = useNavigation<any>();
  const { user, isMockMode } = useAuth();
  const { t, language } = useLanguage();

  const [text, setText] = useState('');
  const [events, setEvents] = useState<ParsedIcsEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleParse = () => {
    setError('');
    if (!text.trim()) {
      setError(t('importAppt.ics.empty'));
      return;
    }
    try {
      const parsed = parseIcs(text);
      if (parsed.length === 0) {
        setError(t('importAppt.ics.noEvents'));
        setEvents([]);
        return;
      }
      setEvents(parsed);
      // Pre-select only upcoming events by default
      const now = Date.now();
      const pre = new Set(parsed.filter(e => new Date(e.dtstartIso).getTime() >= now).map(e => e.uid));
      setSelected(pre);
    } catch (e: any) {
      setError(e?.message ?? t('importAppt.ics.parseError'));
    }
  };

  const toggle = (uid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSave = async () => {
    if (!user || selected.size === 0) return;
    setSaving(true);
    try {
      const picks = events.filter(e => selected.has(e.uid));
      for (const ev of picks) {
        const payload = {
          scheduled_date: ev.dtstartIso,
          hospital: ev.location || ev.summary,
          notes: [ev.summary && ev.location ? ev.summary : '', ev.description]
            .filter(Boolean)
            .join('\n')
            .trim(),
          source: 'ics_import' as const,
          external_id: ev.uid,
          external_source_name: t('importAppt.ics.sourceName'),
        };
        if (isMockMode) {
          await mockServices.upsertAppointmentByExternalId(user.id, payload);
        } else {
          await realApptService.upsertAppointmentByExternalId(user.id, payload);
        }
      }
      navigation.goBack();
    } catch (e: any) {
      console.error('ics save error', e);
      setError(e?.message ?? t('importAppt.ics.saveError'));
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('importAppt.ics.title')}</Text>
        <Text style={styles.subtitle}>{t('importAppt.ics.howto')}</Text>

        <Disclaimer message={t('importAppt.ics.disclaimer')} />

        <TextInput
          style={styles.textarea}
          value={text}
          onChangeText={setText}
          placeholder={'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n…'}
          placeholderTextColor={COLORS.textLight}
          multiline
          numberOfLines={8}
        />

        <Button label={t('importAppt.ics.parse')} onPress={handleParse} variant="outline" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {events.length > 0 && (
          <View style={{ gap: SPACING.sm }}>
            <Text style={styles.sectionLabel}>
              {events.length} {events.length === 1 ? t('importAppt.ics.eventFound') : t('importAppt.ics.eventsFound')}
            </Text>
            {events.map(ev => {
              const isSelected = selected.has(ev.uid);
              const when = formatWhen(ev.dtstartIso, language);
              return (
                <TouchableOpacity
                  key={ev.uid}
                  onPress={() => toggle(ev.uid)}
                  activeOpacity={0.7}
                  style={[styles.eventCard, isSelected && styles.eventCardSelected]}
                >
                  <View style={[styles.check, isSelected && styles.checkOn]}>
                    {isSelected && <Feather name="check" size={14} color={COLORS.white} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventWhen}>{when}</Text>
                    <Text style={styles.eventSummary}>{ev.summary || '(no title)'}</Text>
                    {!!ev.location && <Text style={styles.eventLocation}>{ev.location}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Button
              label={`${t('importAppt.ics.saveSelected')} (${selected.size})`}
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
  textarea: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md - 2,
    minHeight: 140, textAlignVertical: 'top',
    fontFamily: 'monospace',
    fontSize: 12, color: COLORS.text, backgroundColor: COLORS.white,
  },
  error: { ...TYPOGRAPHY.bodySmall, color: COLORS.statusUrgent },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight, marginTop: SPACING.sm },
  eventCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  eventCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  check: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  eventWhen: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.primary },
  eventSummary: { ...TYPOGRAPHY.body, color: COLORS.text, marginTop: 2 },
  eventLocation: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
});
