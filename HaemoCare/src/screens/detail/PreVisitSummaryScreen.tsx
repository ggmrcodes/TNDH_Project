import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import PatientDetailPane from '../../components/clinician/PatientDetailPane';
import { COLORS } from '../../config/theme';

export default function PreVisitSummaryScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <SafeAreaView style={styles.safe}>
      <PatientDetailPane userId={user.id} isClinicianView={false} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
});
