
import { api } from './client';

// ============================================
// AUTHENTIFICATION
// ============================================

export const AuthApi = {
  login: (identifier: string, password: string) =>
    api.post('/auth/login', { identifier, password }),

  verifyPhone: (phone: string, code: string) =>
    api.post('/auth/verify-phone', { phone, code }),

  resendPhoneOtp: (phone: string) =>
    api.post<{ expiresIn: number }>('/auth/resend-phone-otp', { phone }),

  forgotPassword: (identifier: string) =>
    api.post<{ message: string; expiresIn: number }>('/auth/forgot-password', { identifier }),

  resetPassword: (identifier: string, code: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/reset-password', { identifier, code, newPassword }),

  register: (data: object) =>
    api.post('/auth/register', data),

  verifyEmail: (email: string, code: string) =>
    api.post('/auth/verify-email', { email, code }),

  resendOtp: (email: string) =>
    api.post('/auth/resend-otp', { email }),

  sessions: () =>
    api.get<DeviceSession[]>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    api.delete(`/auth/sessions/${sessionId}`),

  logoutAll: () =>
    api.post<{ revoked: number }>('/auth/logout-all'),
};

export type DeviceSession = {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
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

  conflicts: () =>
    api.get<UnavailabilityConflict[]>('/doctors/me/conflicts'),

  cancelConflicts: (appointmentIds: number[], note?: string) =>
    api.post<{ cancelled: number; skipped: number }>('/doctors/me/conflicts/cancel', { appointmentIds, note }),

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
  addenda?: { id: number; content: string; created_at: string; author: string | null }[];
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

  cancel: (id: number, data?: { reason?: StaffCancelReason; note?: string }) =>
    api.patch(`/appointments/${id}/cancel`, data ?? {}),

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
  | 'appointment_cancelled'
  | 'record_emergency_access';

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

export type StaffCancelReason = 'doctor_unavailable' | 'service_unavailable' | 'facility_closed' | 'other';

export type CancelReason = StaffCancelReason | 'patient_request' | 'redirected';

export type CancelledByRole = 'patient' | 'doctor' | 'facility' | 'system';

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  patient_request: 'Annulé à votre demande',
  doctor_unavailable: 'Le médecin est indisponible',
  service_unavailable: 'Le service est momentanément indisponible',
  facility_closed: 'L’établissement est fermé',
  redirected: 'Remplacé par un autre rendez-vous',
  other: 'Annulé par l’établissement',
};

export type UnavailabilityConflict = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  facility_id: number;
  facility_name: string;
  timezone: string;
  patient_name: string;
  patient_number: string | null;
  cause: 'leave' | 'block';
  cause_reason: string | null;
};

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
  professional_phone?: string | null;
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
  professionalPhone?: string | null;
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
  services: { code: string; name: string; available_24h: boolean; unavailable_until?: string | null; unavailable_reason?: string | null }[];
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
  limit?: number;
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

export type FacilityStatus = 'pending' | 'active' | 'suspended';

export type StaffScope = {
  platformAdmin: boolean;
  facilities: { id: number; name: string; city: string | null; status: FacilityStatus; role: 'facility_admin' | 'secretary' }[] | null;
};

export type ManagedFacilitySummary = {
  id: number;
  code: string;
  name: string;
  type: FacilityType;
  city: string | null;
  status: FacilityStatus;
  is_default: boolean;
  timezone: FacilityTimeZone;
  doctors_count: number;
  members_count: number;
  can_manage: boolean;
};

export type FacilityInput = {
  name: string;
  type: FacilityType;
  timezone: FacilityTimeZone;
  status?: FacilityStatus;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  emergencyPhone?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type FacilityMemberInput = {
  email: string;
  role: 'facility_admin' | 'secretary';
  firstName?: string;
  lastName?: string;
  password?: string;
};

export type ManagedFacility = {
  id: number;
  code: string;
  name: string;
  type: FacilityType;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  emergency_phone: string | null;
  email: string | null;
  timezone: FacilityTimeZone;
  status: FacilityStatus;
  is_default: boolean;
  can_manage: boolean;
  services: { code: string; available24h: boolean; unavailableUntil?: string | null; unavailableReason?: string | null }[];
  members: { id: number; role: 'facility_admin' | 'secretary'; status: 'active' | 'revoked'; user_id: number; email: string; first_name: string; last_name: string }[];
  doctors: { doctor_id: number; status: 'active' | 'inactive'; fee: string | null; first_name: string; last_name: string; specialty: string }[];
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

  conflicts: (id: number) =>
    api.get<UnavailabilityConflict[]>(`/admin/doctors/${id}/conflicts`),

  cancelConflicts: (id: number, appointmentIds: number[], note?: string) =>
    api.post<{ cancelled: number; skipped: number }>(`/admin/doctors/${id}/conflicts/cancel`, { appointmentIds, note }),

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
    reason?: string,
    facilityId?: number
  ) =>
    api.post('/admin/appointments', {
      patientId,
      doctorId,
      startsAt,
      reason: reason || undefined,
      facilityId,
    }),

  scope: () =>
    api.get<StaffScope>('/admin/me/scope'),

  facilities: () =>
    api.get<ManagedFacilitySummary[]>('/admin/facilities'),

  facility: (id: number) =>
    api.get<ManagedFacility>(`/admin/facilities/${id}`),

  createFacility: (data: FacilityInput) =>
    api.post<ManagedFacility>('/admin/facilities', data),

  updateFacility: (id: number, data: Partial<FacilityInput>) =>
    api.patch<ManagedFacility>(`/admin/facilities/${id}`, data),

  setFacilityServices: (id: number, services: { code: string; available24h?: boolean; unavailableUntil?: string | null }[]) =>
    api.put<ManagedFacility>(`/admin/facilities/${id}/services`, { services }),

  addFacilityMember: (id: number, data: FacilityMemberInput) =>
    api.post<ManagedFacility>(`/admin/facilities/${id}/members`, data),

  revokeFacilityMember: (id: number, memberId: number) =>
    api.delete<ManagedFacility>(`/admin/facilities/${id}/members/${memberId}`),

  updateAffiliation: (id: number, doctorId: number, data: { status?: 'active' | 'inactive'; fee?: number | null }) =>
    api.patch<ManagedFacility & { upcoming_appointments: number }>(`/admin/facilities/${id}/doctors/${doctorId}`, data),

  cancel: (id: number, data?: { reason?: StaffCancelReason; note?: string }) =>
    api.patch(`/admin/appointments/${id}/cancel`, data ?? {}),

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

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/users/me/password', { currentPassword, newPassword }),

  requestPhoneChange: (phone: string, password: string) =>
    api.post<{ message: string; phone: string; expiresIn: number }>('/users/me/phone', { phone, password }),

  resendPhoneChange: () =>
    api.post<{ message: string; phone: string; expiresIn: number }>('/users/me/phone/resend', {}),

  confirmPhoneChange: (code: string) =>
    api.post<{ message: string; phone: string }>('/users/me/phone/confirm', { code }),

  requestEmailChange: (email: string, password: string) =>
    api.post<{ message: string; email: string; expiresIn: number }>('/users/me/email', { email, password }),

  resendEmailChange: () =>
    api.post<{ message: string; email: string; expiresIn: number }>('/users/me/email/resend', {}),

  confirmEmailChange: (code: string) =>
    api.post<{ message: string; email: string }>('/users/me/email/confirm', { code }),
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

export type RecordKind = 'allergies' | 'conditions' | 'medications' | 'immunizations';

type RecordEntryBase = {
  id: number;
  patient_id: number;
  facility_id: number | null;
  facility_name: string | null;
  source: 'clinician' | 'patient';
  confidential: boolean;
  recorded_by_name: string | null;
  recorded_by_role: string | null;
  recorded_at: string;
  updated_at: string;
  notes: string | null;
  entered_in_error: boolean;
  error_reason: string | null;
};

export type AllergyEntry = RecordEntryBase & {
  substance: string;
  reaction: string | null;
  severity: 'mild' | 'moderate' | 'severe' | 'unknown';
  status: 'active' | 'resolved';
  noted_on: string | null;
};

export type ConditionEntry = RecordEntryBase & {
  label: string;
  icd10_code: string | null;
  onset_date: string | null;
  status: 'active' | 'resolved';
};

export type MedicationEntry = RecordEntryBase & {
  name: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'active' | 'stopped';
};

export type ImmunizationEntry = RecordEntryBase & {
  vaccine: string;
  dose_label: string | null;
  administered_on: string;
  lot_number: string | null;
};

export type PatientRecord = {
  patient: {
    id: number;
    patient_number: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    sex: 'female' | 'male' | null;
  };
  allergies: AllergyEntry[];
  conditions: ConditionEntry[];
  medications: MedicationEntry[];
  immunizations: ImmunizationEntry[];
  access: {
    basis: 'self' | 'guardian_verified' | 'treating_doctor' | 'emergency_access';
    canWriteClinical: boolean;
    canDeclare: boolean;
    facilities: { id: number; name: string }[];
    sharing: { summaryAll: boolean; fullAll: boolean; consent: boolean; emergency: boolean } | null;
  };
};

export const RecordApi = {
  get: (patientId: number, includeErrors = false) =>
    api.get<PatientRecord>(`/patients/${patientId}/record`, {
      params: includeErrors ? { includeErrors: 'true' } : undefined,
    }),

  add: (patientId: number, kind: RecordKind, data: Record<string, unknown>) =>
    api.post(`/patients/${patientId}/record/${kind}`, data),

  update: (patientId: number, kind: RecordKind, entryId: number, data: Record<string, unknown>) =>
    api.patch(`/patients/${patientId}/record/${kind}/${entryId}`, data),

  markEnteredInError: (patientId: number, kind: RecordKind, entryId: number, reason: string) =>
    api.post(`/patients/${patientId}/record/${kind}/${entryId}/entered-in-error`, { reason }),
};

export type PrescriptionItem = {
  id?: number;
  position?: number;
  medicationName: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: string | null;
  instructions?: string | null;
};

export type Prescription = {
  id: number;
  patient_id: number;
  appointment_id: number;
  facility_id: number;
  facility_name: string;
  status: 'draft' | 'issued' | 'cancelled';
  notes: string | null;
  confidential: boolean;
  issued_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  prescriber_user_id: number | null;
  prescriber_name: string | null;
  items: PrescriptionItem[];
};

export type Addendum = { id: number; content: string; createdAt?: string; created_at?: string; author?: string | null };

export type ConsultationHistoryEntry = {
  appointment_id: number;
  starts_at: string;
  reason: string | null;
  facility_name: string;
  facility_timezone: string;
  doctor_name: string;
  specialty: string;
  chief_complaint: string | null;
  blood_pressure: string | null;
  heart_rate: string | null;
  temperature: string | null;
  oxygen_saturation: string | null;
  weight: string | null;
  height: string | null;
  medical_history: string | null;
  current_treatments: string | null;
  clinical_examination: string | null;
  diagnosis: string | null;
  notes: string | null;
  prescription: string | null;
  completed_at: string | null;
  addenda: Addendum[];
};

export const PrescriptionsApi = {
  forAppointment: (appointmentId: number) =>
    api.get<Prescription[]>(`/appointments/${appointmentId}/prescriptions`),

  create: (appointmentId: number, data: { items: PrescriptionItem[]; notes?: string | null; confidential?: boolean }) =>
    api.post<Prescription>(`/appointments/${appointmentId}/prescriptions`, data),

  update: (id: number, data: { items?: PrescriptionItem[]; notes?: string | null; confidential?: boolean }) =>
    api.put<Prescription>(`/prescriptions/${id}`, data),

  issue: (id: number, addToMedications = true) =>
    api.post<Prescription>(`/prescriptions/${id}/issue`, { addToMedications }),

  cancel: (id: number, reason: string) =>
    api.post<Prescription>(`/prescriptions/${id}/cancel`, { reason }),

  forPatient: (patientId: number) =>
    api.get<Prescription[]>(`/patients/${patientId}/prescriptions`),
};

export const ConsultationsApi = {
  history: (patientId: number) =>
    api.get<ConsultationHistoryEntry[]>(`/patients/${patientId}/consultations`),

  addAddendum: (appointmentId: number, content: string) =>
    api.post<Addendum[]>(`/appointments/${appointmentId}/consultation/addenda`, { content }),
};

export type DocumentCategory =
  | 'prescription'
  | 'lab_result'
  | 'imaging_report'
  | 'medical_report'
  | 'certificate'
  | 'vaccination_card'
  | 'other';

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  lab_result: 'Résultat d’analyse',
  imaging_report: 'Imagerie',
  medical_report: 'Compte rendu',
  prescription: 'Ordonnance',
  certificate: 'Certificat',
  vaccination_card: 'Carnet de vaccination',
  other: 'Autre',
};

export type MedicalDocument = {
  id: number;
  patient_id: number;
  facility_id: number | null;
  facility_name: string | null;
  appointment_id: number | null;
  category: DocumentCategory;
  title: string;
  description: string | null;
  document_date: string | null;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  size_bytes: number;
  source: 'clinician' | 'patient';
  confidential: boolean;
  released_at: string | null;
  uploaded_at: string;
  uploaded_by_name: string | null;
  entered_in_error: boolean;
  error_reason: string | null;
};

export type DocumentUploadInput = {
  file: { uri: string; name: string; mimeType: string };
  category: DocumentCategory;
  title: string;
  description?: string;
  documentDate?: string;
  facilityId?: number;
  confidential?: boolean;
  releaseNow?: boolean;
};

const absoluteFileUrl = (url: string) => {
  if (/^https?:\/\//.test(url)) return url;
  const origin = (api.defaults.baseURL ?? '').replace(/\/api\/?$/, '');
  return `${origin}${url}`;
};

export const DocumentsApi = {
  list: (patientId: number) =>
    api.get<MedicalDocument[]>(`/patients/${patientId}/documents`),

  upload: (patientId: number, input: DocumentUploadInput) => {
    const form = new FormData();
    form.append('file', { uri: input.file.uri, name: input.file.name, type: input.file.mimeType } as any);
    form.append('category', input.category);
    form.append('title', input.title);
    if (input.description) form.append('description', input.description);
    if (input.documentDate) form.append('documentDate', input.documentDate);
    if (input.facilityId) form.append('facilityId', String(input.facilityId));
    if (input.confidential !== undefined) form.append('confidential', String(input.confidential));
    if (input.releaseNow !== undefined) form.append('releaseNow', String(input.releaseNow));
    return api.post<MedicalDocument>(`/patients/${patientId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },

  downloadUrl: async (id: number) => {
    const { data } = await api.post<{ url: string; expiresAt: string }>(`/documents/${id}/download-link`);
    return absoluteFileUrl(data.url);
  },

  release: (id: number) =>
    api.post<MedicalDocument>(`/documents/${id}/release`),

  markEnteredInError: (id: number, reason: string) =>
    api.post<MedicalDocument>(`/documents/${id}/entered-in-error`, { reason }),
};

export type RecordConsent = {
  id: number;
  patient_id: number;
  facility_id: number;
  facility_name: string;
  facility_city: string | null;
  scope: 'summary' | 'full';
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  granted_by_name: string | null;
  active: boolean;
};

export type AccessHistoryEntry = {
  id: number;
  created_at: string;
  action: string;
  granted: boolean;
  basis: string | null;
  resource: string | null;
  user_role: string;
  actor: string | null;
  is_me: boolean;
};

export const SharingApi = {
  consents: (patientId: number) =>
    api.get<RecordConsent[]>(`/patients/${patientId}/consents`),

  grant: (patientId: number, data: { facilityId: number; scope: 'summary' | 'full'; durationDays: 30 | 90 | 180 | 365 | null }) =>
    api.post<RecordConsent>(`/patients/${patientId}/consents`, data),

  revoke: (consentId: number) =>
    api.post<RecordConsent>(`/consents/${consentId}/revoke`),

  accessHistory: (patientId: number) =>
    api.get<AccessHistoryEntry[]>(`/patients/${patientId}/access-history`),
};

export type EmergencyLookup = {
  patient: { id: number; patient_number: string; first_name: string; last_name: string; birth_date: string | null; sex: string | null };
  facilities: { id: number; name: string }[];
};

export const EmergencyApi = {
  lookup: (patientNumber: string) =>
    api.get<EmergencyLookup>('/emergency/patient-lookup', { params: { number: patientNumber } }),

  start: (patientId: number, reason: string, facilityId?: number) =>
    api.post(`/patients/${patientId}/emergency-access`, { reason, facilityId }),
};
