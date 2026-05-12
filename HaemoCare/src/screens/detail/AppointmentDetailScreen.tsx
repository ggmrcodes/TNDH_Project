import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import * as realApptService from '../../services/appointmentService';
import * as realSymptomService from '../../services/symptomService';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';
import { generateAppointmentBriefPdf } from '../../utils/pdfGenerator';
import { formatDateTime } from '../../utils/dateHelpers';
import { Appointment, SymptomLog, Transfusion } from '../../types/database';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SymptomSummary from '../../components/appointments/SymptomSummary';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING } from '../../config/theme';

type RouteProps = RouteProp<RootStackParamList, 'AppointmentDetail'>;

export default function AppointmentDetailScreen() {
  const route = useRoute<RouteProps>();
  const { user, profile, isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const { isMobile } = useResponsive();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [transfusions, setTransfusions] = useState<Transfusion[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const id = route.params.appointmentId;

    if (isMockMode) {
      mockServices.getAppointmentById(id).then(setAppointment);
      mockServices.getTransfusions().then((data) => {
        setTransfusions(data);
        if (data.length > 0) {
          mockServices.getSymptomLogsSinceDate(user.id, data[0].date).then(setLogs);
        }
      });
    } else {
      realApptService.getAppointmentById(id).then(setAppointment);
      realTransfusionService.getTransfusions(user.id).then((data) => {
        setTransfusions(data);
        if (data.length > 0) {
          realSymptomService.getSymptomLogsSinceDate(user.id, data[0].date).then(setLogs);
        }
      });
    }
  }, [route.params.appointmentId, user, isMockMode]);

  if (!appointment || !profile) return <LoadingSpinner />;

  const handleExport = async () => {
    setExporting(true);
    try {
      await generateAppointmentBriefPdf(profile, appointment, logs, transfusions, language);
    } catch (err) {
      console.error('PDF export error:', err);
    }
    setExporting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        <Card style={styles.card}>
          <Text style={styles.briefTitle}>{t('appointments.brief')}</Text>
          <Text style={styles.briefSubtitle}>{t('appointments.briefSubtitle')}</Text>

          <View style={styles.row}>
            <Ionicons name="calendar" size={20} color={COLORS.primary} />
            <Text style={styles.value}>{formatDateTime(appointment.scheduled_date, language)}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="business" size={20} color={COLORS.primary} />
            <Text style={styles.value}>{appointment.hospital}</Text>
          </View>
          {appointment.notes ? (
            <View style={styles.row}>
              <Ionicons name="document-text" size={20} color={COLORS.primary} />
              <Text style={styles.value}>{appointment.notes}</Text>
            </View>
          ) : null}
        </Card>

        <SymptomSummary logs={logs} />

        <Button
          label={t('appointments.exportBrief')}
          onPress={handleExport}
          isLoading={exporting}
          style={{ marginTop: SPACING.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  card: {
    marginBottom: SPACING.md,
  },
  briefTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  briefSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  value: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
  },
});
