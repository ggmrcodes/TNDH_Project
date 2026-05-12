export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Signup: undefined;
  ProfileCompletion: undefined;
};

export type MainTabParamList = {
  Passport: undefined;
  SymptomMonitor: undefined;
  Appointments: undefined;
  TransfusionHistory: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  TransfusionDetail: { transfusionId: string };
  SymptomLogDetail: { logId: string };
  NewSymptomLog: { transfusionId?: string };
  EditProfile: undefined;
  AppointmentDetail: { appointmentId: string };
  AddAppointment: undefined;
  PrivacySettings: undefined;
  MedicationReminders: undefined;
  PreVisitSummary: undefined;
  ScanTransfusion: undefined;
  ImportAppointments: undefined;
  IcsImport: undefined;
  FhirImport: undefined;
};
