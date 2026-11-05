
import { api } from './client';

export const AuthApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: object) => api.post('/auth/register', data),
};

export const DoctorsApi = {
  list: (params?: object) => api.get('/doctors', { params }),
  get: (id: number) => api.get(`/doctors/${id}`),
  slots: (id: number, date: string) => api.get(`/doctors/${id}/slots`, { params: { date } }),
  dashboard: () => api.get('/doctors/me/dashboard'),

  workingHours: () => api.get('/doctors/me/working-hours'),
  updateWorkingHours: (data: object) =>
    api.put('/doctors/me/working-hours', data),

  leaves: () => api.get('/doctors/me/leaves'),
  addLeave: (data: object) => api.post('/doctors/me/leaves', data),
  deleteLeave: (id: number) =>
    api.delete(`/doctors/me/leaves/${id}`),

  blockedSlots: () => api.get('/doctors/me/blocked-slots'),
  addBlockedSlot: (data: object) =>
    api.post('/doctors/me/blocked-slots', data),
  deleteBlockedSlot: (id: number) =>
    api.delete(`/doctors/me/blocked-slots/${id}`),
};

export const MedicalRecordApi = {
  mine: () => api.get('/medical-record/me'),
};

export const AppointmentsApi = {
  book: (doctorId: number, startsAt: string, reason?: string) =>
    api.post('/appointments', { doctorId, startsAt, reason }),
  mine: (scope?: 'upcoming' | 'past') => api.get('/appointments/mine', { params: { scope } }),
  cancel: (id: number) => api.patch(`/appointments/${id}/cancel`),
  reschedule: (id: number, startsAt: string) => api.patch(`/appointments/${id}/reschedule`, { startsAt }),
};

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'done';

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

export const StaffApi = {
  dashboard: () => api.get('/admin/dashboard'),
  stats: (params?: { from?: string; to?: string }) => api.get('/admin/stats', { params }),
  patients: (q?: string) => api.get('/admin/patients', { params: { q: q || undefined } }),
  specialties: () => api.get('/admin/specialties'),

  doctors: () => api.get<StaffDoctor[]>('/admin/doctors'),
  doctor: (id: number) => api.get<StaffDoctor>(`/admin/doctors/${id}`),
  createDoctor: (data: DoctorInput) => api.post<StaffDoctor>('/admin/doctors', data),
  updateDoctor: (id: number, data: DoctorInput) => api.patch<StaffDoctor>(`/admin/doctors/${id}`, data),

  workingHours: (id: number) => api.get(`/admin/doctors/${id}/working-hours`),
  setWorkingHours: (id: number, hours: WorkingHour[], consultationMinutes: number) =>
    api.put(`/admin/doctors/${id}/working-hours`, { hours, consultationMinutes }),
  leaves: (id: number) => api.get(`/admin/doctors/${id}/leaves`),
  addLeave: (id: number, startDate: string, endDate: string, reason?: string) =>
    api.post(`/admin/doctors/${id}/leaves`, { startDate, endDate, reason: reason || undefined }),
  deleteLeave: (id: number, leaveId: number) => api.delete(`/admin/doctors/${id}/leaves/${leaveId}`),

  appointments: (params?: { date?: string; doctorId?: number; status?: AppointmentStatus }) =>
    api.get<StaffAppointment[]>('/admin/appointments', { params }),
  book: (patientId: number, doctorId: number, startsAt: string, reason?: string) =>
    api.post('/admin/appointments', { patientId, doctorId, startsAt, reason: reason || undefined }),
  cancel: (id: number) => api.patch(`/admin/appointments/${id}/cancel`),
  reschedule: (id: number, startsAt: string) => api.patch(`/admin/appointments/${id}/reschedule`, { startsAt }),
};

export const UsersApi = {
  getMe: () => api.get('/users/me'),
  updateMe: (data: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
  }) => api.patch('/users/me', data),
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
