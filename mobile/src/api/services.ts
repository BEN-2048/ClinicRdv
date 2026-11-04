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
};
export const AppointmentsApi = {
  book: (doctorId: number, startsAt: string, reason?: string) =>
    api.post('/appointments', { doctorId, startsAt, reason }),
  mine: (scope?: 'upcoming' | 'past') => api.get('/appointments/mine', { params: { scope } }),
  cancel: (id: number) => api.patch(`/appointments/${id}/cancel`),
  reschedule: (id: number, startsAt: string) => api.patch(`/appointments/${id}/reschedule`, { startsAt }),
};
