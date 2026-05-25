export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Signup: undefined;
  RoleSelect: undefined;
  ClinicianSignup: undefined;
  ForgotPassword: undefined;
  ProfileCompletion: undefined;
};

export type MainTabParamList = {
  Passport: undefined;
  SymptomMonitor: undefined;
  Appointments: undefined;
  TransfusionHistory: undefined;
};

export type ClinicianStackParamList = {
  ClinicianDashboard: undefined;
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
  EmergencyContacts: undefined;
};
