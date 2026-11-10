
import { api } from './client';

// ============================================
// AUTHENTIFICATION
// ============================================

export const AuthApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  register: (data: object) =>
    api.post('/auth/register', data),

  verifyEmail: (email: string, code: string) =>
    api.post('/auth/verify-email', { email, code }),

  resendOtp: (email: string) =>
    api.post('/auth/resend-otp', { email }),
};

// ============================================
// MÃ‰DECINS
// ============================================

export const DoctorsApi = {
  list: (params?: object) =>
    api.get('/doctors', { params }),

  get: (id: number) =>
    api.get(`/doctors/${id}`),

  slots: (id: number, date: string, facilityId?: number) =>
    api.get(`/doctors/${id}/slots`, { params: { date, facilityId } }),

  dashboard: () =>
    api.get('/doctors/me/dashboard'),

  workingHours: () =>
    api.get('/doctors/me/working-hours'),

  updateWorkingHours: (data: object) =>
    api.put('/doctors/me/working-hours', data),

  leaves: () =>
    api.get('/doctors/me/leaves'),

  addLeave: (data: object) =>
    api.post('/doctors/me/leaves', data),

  deleteLeave: (id: number) =>
    api.delete(`/doctors/me/leaves/${id}`),

  blockedSlots: () =>
    api.get('/doctors/me/blocked-slots'),

  addBlockedSlot: (data: object) =>
    api.post('/doctors/me/blocked-slots', data),

  deleteBlockedSlot: (id: number) =>
    api.delete(`/doctors/me/blocked-slots/${id}`),
};

// ============================================
// TYPES DE LA FICHE DE CONSULTATION
// ============================================

export type ConsultationInput = {
  chiefComplaint?: string | null;
  bloodPressure?: string | null;
  heartRate?: number | null;
  temperature?: number | null;
  oxygenSaturation?: number | null;
  weight?: number | null;
  height?: number | null;
  medicalHistory?: string | null;
  currentTreatments?: string | null;
  clinicalExamination?: string | null;
  diagnosis?: string | null;
  notes?: string | null;
  prescription?: string | null;
};

export type ConsultationResponse = {
  appointment_id: number;
  starts_at: string;
  ends_at: string;
  appointment_status: AppointmentStatus;
  appointment_reason: string | null;

  patient_id: number;
  patient_profile_id?: number;
  patient_number?: string | null;
  patient_birth_date?: string | null;
  patient_first_name: string;
  patient_last_name: string;
  patient_email: string;
  patient_phone: string | null;

  doctor_id: number;

  consultation_id: number | null;
  chief_complaint: string | null;
  blood_pressure: string | null;
  heart_rate: number | null;
  temperature: number | null;
  oxygen_saturation: number | null;
  weight: number | null;
  height: number | null;
  medical_history: string | null;
  current_treatments: string | null;
  clinical_examination: string | null;
  diagnosis: string | null;
  notes: string | null;
  prescription: string | null;
  consultation_status: 'draft' | 'completed' | null;
  consultation_created_at: string | null;
  consultation_updated_at: string | null;
  completed_at: string | null;
};

// ============================================
// RENDEZ-VOUS
// ============================================

export const AppointmentsApi = {
  book: (
    doctorId: number,
    startsAt: string,
    reason?: string,
    patientProfileId?: number,
    facilityId?: number
  ) =>
    api.post('/appointments', { doctorId, startsAt, reason, patientProfileId, facilityId }),

  mine: (scope?: 'upcoming' | 'past') =>
    api.get('/appointments/mine', { params: { scope } }),

  cancel: (id: number) =>
    api.patch(`/appointments/${id}/cancel`),

  reschedule: (id: number, startsAt: string) =>
    api.patch(`/appointments/${id}/reschedule`, { startsAt }),

  // ============================================
  // FICHE DE CONSULTATION MÃ‰DICALE
  // ============================================

  // RÃ©cupÃ©rer la fiche de consultation
  consultation: (id: number) =>
    api.get<ConsultationResponse>(
      `/appointments/${id}/consultation`
    ),

  // Enregistrer un brouillon
  saveConsultation: (id: number, data: ConsultationInput) =>
    api.put(
      `/appointments/${id}/consultation`,
      data
    ),

  // Terminer la consultation
  completeConsultation: (id: number, data: ConsultationInput) =>
    api.patch(
      `/appointments/${id}/complete`,
      data
    ),
};

// ============================================
// NOTIFICATIONS
// ============================================

export type NotificationType =
  | 'general'
  | 'appointment_reminder'
  | 'waiting_list'
  | 'prescription'
  | 'appointment_confirmed'
  | 'appointment_cancelled';

export type PatientNotification = {
  id: number;
  user_id: number;
  title: string;
  body: string | null;
  type: NotificationType;
  appointment_id: number | null;
  read: boolean;
  read_at: string | null;
  send_at: string;
  created_at: string;
};

export type NotificationPreferences = {
  sms_enabled: boolean;
  email_enabled: boolean;
  updated_at?: string;
};

export type NotificationsResponse = {
  items: PatientNotification[];
  unreadCount: number;
};

export const NotificationsApi = {
  // RÃ©cupÃ©rer les notifications
  list: (type?: NotificationType | 'all') =>
    api.get<NotificationsResponse>('/notifications', {
      params: type ? { type } : {},
    }),

  // Marquer une notification comme lue
  markAsRead: (id: number) =>
    api.patch<PatientNotification>(`/notifications/${id}/read`),

  // Marquer toutes les notifications comme lues
  markAllAsRead: () =>
    api.patch<{ updatedCount: number }>('/notifications/read-all'),

  // RÃ©cupÃ©rer les prÃ©fÃ©rences SMS et e-mail
  getPreferences: () =>
    api.get<NotificationPreferences>('/notifications/preferences'),

  // Modifier les prÃ©fÃ©rences
  updatePreferences: (
    smsEnabled: boolean,
    emailEnabled: boolean
  ) =>
    api.put<NotificationPreferences>(
      '/notifications/preferences',
      { smsEnabled, emailEnabled }
    ),
};

// ============================================
// TYPES GÃ‰NÃ‰RAUX
// ============================================

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'done';

export type WorkingHour = {
  weekday: number;
  startTime: string;
  endTime: string;
};

export type StaffDoctor = {
  id: number;
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  specialty_id: number;
  specialty: string;
  bio: string | null;
  fee: string;
  consultation_minutes: number;
  languages: string;
  active: boolean;
};

export type StaffAppointment = {
  id: number;
  patient_id: number;
  doctor_id: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  reason: string | null;
  doctor_name: string;
  specialty: string;
  patient_name: string;
  patient_phone: string | null;
};

export type DoctorInput = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  specialtyId?: number;
  bio?: string | null;
  fee?: number;
  consultationMinutes?: number;
  languages?: string;
  active?: boolean;
};

// ============================================
// ADMINISTRATION / SECRÃ‰TARIAT
// ============================================

export type FacilityType = 'hospital' | 'clinic' | 'medical_center' | 'health_center';
export type FacilityTimeZone = 'Africa/Kinshasa' | 'Africa/Lubumbashi';

export type DoctorFacility = {
  id: number;
  name: string;
  city: string | null;
  timezone: FacilityTimeZone;
  fee: string | number;
};

export type FacilitySummary = {
  id: number;
  code: string;
  name: string;
  type: FacilityType;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  emergency_phone: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: FacilityTimeZone;
  distance_km: string | null;
  services: string[];
  specialties: string[];
  doctors_count: number;
};

export type FacilityDetail = Omit<FacilitySummary, 'services' | 'specialties' | 'doctors_count' | 'distance_km'> & {
  description: string | null;
  email: string | null;
  opening_hours: { weekday: number; opensAt: string; closesAt: string }[];
  services: { code: string; name: string; available_24h: boolean }[];
  specialties: { id: number; name: string }[];
  doctors: {
    id: number;
    first_name: string;
    last_name: string;
    specialty: string;
    fee: string | number;
    consultation_minutes: number;
  }[];
};

export type FacilitySearch = {
  q?: string;
  city?: string;
  specialtyId?: number;
  service?: string;
  lat?: number;
  lng?: number;
};

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  hospital: 'Hôpital',
  clinic: 'Clinique',
  medical_center: 'Centre médical',
  health_center: 'Centre de santé',
};

export const FacilitiesApi = {
  search: (params: FacilitySearch = {}) =>
    api.get<FacilitySummary[]>('/facilities', { params }),

  get: (id: number) =>
    api.get<FacilityDetail>(`/facilities/${id}`),

  meta: () =>
    api.get<{ services: { code: string; name: string }[]; cities: string[] }>('/facilities/meta'),
};

export type PatientRelationship = 'parent' | 'legal_guardian';
export type GuardianLinkStatus = 'pending' | 'verified' | 'rejected' | 'revoked';

export type PatientProfile = {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  sex: 'female' | 'male' | null;
  relationship: 'self' | PatientRelationship;
  link_status: 'self' | GuardianLinkStatus;
};

export type DependentInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  sex?: 'female' | 'male';
  relationship: PatientRelationship;
};

export type GuardianLink = {
  id: number;
  relationship: PatientRelationship;
  status: GuardianLinkStatus;
  status_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  guardian_user_id: number;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string | null;
  patient_id: number;
  patient_number: string;
  patient_first_name: string;
  patient_last_name: string;
  birth_date: string | null;
  possible_duplicates: number;
};

export const PatientsApi = {
  mine: () =>
    api.get<PatientProfile[]>('/patients/mine'),

  addDependent: (data: DependentInput) =>
    api.post<PatientProfile>('/patients/dependents', data),
};

export const StaffApi = {
  guardianLinks: (status: GuardianLinkStatus = 'pending') =>
    api.get<GuardianLink[]>('/admin/guardian-links', { params: { status } }),

  reviewGuardianLink: (id: number, status: Exclude<GuardianLinkStatus, 'pending'>, reason?: string) =>
    api.patch(`/admin/guardian-links/${id}`, { status, reason: reason || undefined }),

  dashboard: () =>
    api.get('/admin/dashboard'),

  stats: (params?: { from?: string; to?: string }) =>
    api.get('/admin/stats', { params }),

  patients: (q?: string) =>
    api.get('/admin/patients', {
      params: { q: q || undefined },
    }),

  specialties: () =>
    api.get('/admin/specialties'),

  doctors: () =>
    api.get<StaffDoctor[]>('/admin/doctors'),

  doctor: (id: number) =>
    api.get<StaffDoctor>(`/admin/doctors/${id}`),

  createDoctor: (data: DoctorInput) =>
    api.post<StaffDoctor>('/admin/doctors', data),

  updateDoctor: (id: number, data: DoctorInput) =>
    api.patch<StaffDoctor>(`/admin/doctors/${id}`, data),

  workingHours: (id: number) =>
    api.get(`/admin/doctors/${id}/working-hours`),

  setWorkingHours: (
    id: number,
    hours: WorkingHour[],
    consultationMinutes: number
  ) =>
    api.put(`/admin/doctors/${id}/working-hours`, {
      hours,
      consultationMinutes,
    }),

  leaves: (id: number) =>
    api.get(`/admin/doctors/${id}/leaves`),

  addLeave: (
    id: number,
    startDate: string,
    endDate: string,
    reason?: string
  ) =>
    api.post(`/admin/doctors/${id}/leaves`, {
      startDate,
      endDate,
      reason: reason || undefined,
    }),

  deleteLeave: (id: number, leaveId: number) =>
    api.delete(`/admin/doctors/${id}/leaves/${leaveId}`),

  appointments: (params?: {
    date?: string;
    doctorId?: number;
    status?: AppointmentStatus;
  }) =>
    api.get<StaffAppointment[]>('/admin/appointments', { params }),

  book: (
    patientId: number,
    doctorId: number,
    startsAt: string,
    reason?: string
  ) =>
    api.post('/admin/appointments', {
      patientId,
      doctorId,
      startsAt,
      reason: reason || undefined,
    }),

  cancel: (id: number) =>
    api.patch(`/admin/appointments/${id}/cancel`),

  reschedule: (id: number, startsAt: string) =>
    api.patch(`/admin/appointments/${id}/reschedule`, { startsAt }),
};

// ============================================
// UTILISATEURS
// ============================================

export const UsersApi = {
  getMe: () =>
    api.get('/users/me'),

  updateMe: (data: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
  }) =>
    api.patch('/users/me', data),
};

export type WaitingTimeSlot = 'all_day' | 'morning' | 'afternoon' | 'evening';
export type WaitingMinNotice = '2h' | '24h' | 'any';
export type WaitingPreferences = {
  timeSlots: WaitingTimeSlot[];
  weekdays: number[];
  minNotice: WaitingMinNotice;
  notifyPush: boolean;
  notifySms: boolean;
};
export type WaitingAlert = WaitingPreferences & {
  id: number;
  doctorId: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type WaitingQueue = { position: number; total: number };
export type WaitingDoctorState = WaitingQueue & {
  alert: WaitingAlert | null;
  preferences?: WaitingAlert | null;
};
export type WaitingAlertSummary = WaitingAlert & WaitingQueue & { doctorName: string; specialty: string };

export const WaitingListApi = {
  mine: () => api.get<WaitingAlertSummary[]>('/waiting-list/mine'),
  forDoctor: (doctorId: number) => api.get<WaitingDoctorState>(`/waiting-list/doctors/${doctorId}`),
  save: (doctorId: number, prefs: WaitingPreferences) =>
    api.put<WaitingDoctorState>(`/waiting-list/doctors/${doctorId}`, prefs),
  remove: (doctorId: number) => api.delete(`/waiting-list/doctors/${doctorId}`),
};

export const MedicalRecordApi = {
  mine: () => api.get('/medical-record/me'),

  forPatient: (patientId: number) =>
    api.get(`/medical-record/patients/${patientId}`),
};
