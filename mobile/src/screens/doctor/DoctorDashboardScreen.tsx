
import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { DoctorsApi } from '../../api/services';

type Appointment = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
  reason: string | null;
  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
};

type Doctor = {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  specialty: string;
  fee: number | string;
  active: boolean;
};

type DashboardData = {
  doctor: Doctor;
  appointments: Appointment[];
};

const isSameDay = (date1: Date, date2: Date) => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const getMonday = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + difference);
  return result;
};

const formatTime = (date: string) =>
  new Date(date).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const getStatus = (status: Appointment['status']) => {
  switch (status) {
    case 'done':
      return { label: 'Terminé', color: '#15803D', background: '#DCFCE7' };
    case 'pending':
      return { label: 'En attente', color: '#B45309', background: '#FEF3C7' };
    case 'confirmed':
      return { label: 'Confirmé', color: '#1D4ED8', background: '#DBEAFE' };
    case 'cancelled':
      return { label: 'Annulé', color: '#B91C1C', background: '#FEE2E2' };
  }
};

export default function DoctorDashboardScreen() {
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      setError('');

      const response = await DoctorsApi.dashboard();

      setData(response.data);
    } catch (e: any) {
      console.error('Erreur dashboard médecin :', e?.response?.data || e);

      setError(
        e?.response?.data?.error ||
        'Impossible de charger le tableau de bord.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>
          Chargement de votre tableau de bord...
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Impossible de charger les données</Text>
        <Text style={styles.errorText}>
          {error || 'Aucune donnée disponible.'}
        </Text>
        <Text style={styles.retry} onPress={loadDashboard}>
          Réessayer
        </Text>
      </View>
    );
  }

  const { doctor, appointments } = data;
  const today = new Date();

  const todayAppointments = appointments.filter((appointment) => {
    return (
      isSameDay(new Date(appointment.starts_at), today) &&
      appointment.status !== 'cancelled'
    );
  });

  const completedToday = todayAppointments.filter(
    (appointment) => appointment.status === 'done'
  ).length;

  const remainingToday = todayAppointments.filter(
    (appointment) => appointment.status !== 'done'
  ).length;

  const waitingToday = todayAppointments.filter(
    (appointment) => appointment.status === 'pending'
  ).length;

  const weekStart = getMonday(today);
  const nextMonday = new Date(weekStart);
  nextMonday.setDate(nextMonday.getDate() + 7);

  // Inclure tous les rendez-vous de la semaine, même ceux à venir.
  const weekAppointments = appointments.filter((appointment) => {
    const date = new Date(appointment.starts_at);

    return (
      date >= weekStart &&
      date < nextMonday &&
      appointment.status !== 'cancelled'
    );
  });

  const weeklyFees = weekAppointments.reduce((total, appointment) => {
    if (appointment.status === 'done') {
      return total + Number(doctor.fee || 0);
    }
    return total;
  }, 0);

  const progress =
    todayAppointments.length > 0
      ? Math.round((completedToday / todayAppointments.length) * 100)
      : 0;

  const visibleAppointments = [...todayAppointments].sort(
    (a, b) =>
      new Date(a.starts_at).getTime() -
      new Date(b.starts_at).getTime()
  );

  const dateLabel = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour</Text>
          <Text style={styles.doctorName}>
            {doctor.first_name} {doctor.last_name}
          </Text>
          <Text style={styles.specialty}>
            {doctor.specialty}
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {doctor.first_name?.charAt(0)}
            {doctor.last_name?.charAt(0)}
          </Text>
        </View>
      </View>

      {/* Statistiques du jour */}
      <Text style={styles.sectionTitle}>Vue d'ensemble</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {todayAppointments.length}
          </Text>
          <Text style={styles.statLabel}>Consultations aujourd'hui</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#15803D' }]}>
            {completedToday}
          </Text>
          <Text style={styles.statLabel}>Terminées</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#2563EB' }]}>
            {remainingToday}
          </Text>
          <Text style={styles.statLabel}>Restantes</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#B45309' }]}>
            {waitingToday}
          </Text>
          <Text style={styles.statLabel}>En attente</Text>
        </View>
      </View>

      {/* Statistiques hebdomadaires */}
      <Text style={styles.sectionTitle}>Cette semaine</Text>

      <View style={styles.weekCard}>
        <View>
          <Text style={styles.weekNumber}>
            {weekAppointments.length}
          </Text>
          <Text style={styles.weekLabel}>Rendez-vous</Text>
        </View>

        <View style={styles.weekDivider} />

        <View>
          <Text style={styles.weekNumber}>
            {weeklyFees.toLocaleString('fr-FR')} $
          </Text>
          <Text style={styles.weekLabel}>Honoraires estimés</Text>
        </View>
      </View>

      {/* Progression */}
      <Text style={styles.sectionTitle}>Progression de la journée</Text>

      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Consultations terminées</Text>
          <Text style={styles.progressPercent}>{progress}%</Text>
        </View>

        <View style={styles.progressBackground}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
        </View>

        <Text style={styles.progressDescription}>
          {completedToday} consultation(s) terminée(s) sur{' '}
          {todayAppointments.length}
        </Text>
      </View>

      {/* Prochains rendez-vous : inclut les rendez-vous futurs */}
      <Text style={styles.sectionTitle}>Prochains rendez-vous</Text>

      {appointments
        .filter((appointment) => {
          return (
            new Date(appointment.starts_at) > today &&
            appointment.status !== 'cancelled'
          );
        })
        .sort(
          (a, b) =>
            new Date(a.starts_at).getTime() -
            new Date(b.starts_at).getTime()
        )
        .slice(0, 5)
        .map((appointment) => {
          const status = getStatus(appointment.status);

          return (
            <View key={`upcoming-${appointment.id}`} style={styles.appointmentCard}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>
                  {new Date(appointment.starts_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </Text>
                <Text style={styles.endTime}>
                  {formatTime(appointment.starts_at)}
                </Text>
              </View>

              <View style={styles.appointmentInfo}>
                <Text style={styles.patientName}>
                  {appointment.patient_first_name}{' '}
                  {appointment.patient_last_name}
                </Text>
                <Text style={styles.reason}>
                  {appointment.reason || 'Consultation médicale'}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: status.background },
                  ]}
                >
                  <Text style={{ color: status.color, fontSize: 11 }}>
                    {status.label}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

      {/* Rendez-vous du jour */}
      <View style={styles.appointmentHeader}>
        <Text style={styles.sectionTitle}>Consultations du jour</Text>
        <Text style={styles.appointmentCount}>
          {visibleAppointments.length}
        </Text>
      </View>

      {visibleAppointments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Aucun rendez-vous aujourd'hui</Text>
          <Text style={styles.emptyDescription}>
            Vos consultations apparaîtront ici.
          </Text>
        </View>
      ) : (
        visibleAppointments.map((appointment) => {
          const status = getStatus(appointment.status);

          return (
            <View key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>
                  {formatTime(appointment.starts_at)}
                </Text>
                <Text style={styles.endTime}>
                  {formatTime(appointment.ends_at)}
                </Text>
              </View>

              <View style={styles.appointmentInfo}>
                <Text style={styles.patientName}>
                  {appointment.patient_first_name}{' '}
                  {appointment.patient_last_name}
                </Text>

                <Text style={styles.reason}>
                  {appointment.reason || 'Consultation médicale'}
                </Text>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: status.background },
                  ]}
                >
                  <Text style={{ color: status.color, fontSize: 11 }}>
                    {status.label}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}

      {/* Informations complémentaires */}
      <Text style={styles.sectionTitle}>Mon profil professionnel</Text>

      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>Adresse e-mail</Text>
        <Text style={styles.profileValue}>{doctor.email}</Text>

        <View style={styles.profileDivider} />

        <Text style={styles.profileLabel}>Spécialité</Text>
        <Text style={styles.profileValue}>{doctor.specialty}</Text>

        <View style={styles.profileDivider} />

        <Text style={styles.profileLabel}>Honoraires par consultation</Text>
        <Text style={styles.profileValue}>
          {Number(doctor.fee).toLocaleString('fr-FR')} $
        </Text>
      </View>

      <Text style={styles.footer}>
        ClinicRDV · Espace médecin
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  content: {
    padding: 18,
    paddingBottom: 35,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
    backgroundColor: '#F5F7FB',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  errorText: {
    color: '#64748B',
    marginTop: 10,
    textAlign: 'center',
  },
  retry: {
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 20,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 14,
    color: '#64748B',
  },
  doctorName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#172554',
    marginTop: 3,
  },
  specialty: {
    color: '#2563EB',
    fontWeight: '600',
    marginTop: 5,
  },
  date: {
    color: '#94A3B8',
    marginTop: 7,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#1D4ED8',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#172554',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 13,
    marginTop: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 15,
    marginBottom: 12,
    minHeight: 105,
    justifyContent: 'center',
  },
  statNumber: {
    color: '#172554',
    fontSize: 27,
    fontWeight: '700',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },
  weekCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 23,
  },
  weekNumber: {
    fontSize: 22,
    color: '#172554',
    fontWeight: '700',
  },
  weekLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 5,
  },
  weekDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 18,
    marginBottom: 23,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressLabel: {
    color: '#475569',
    fontSize: 13,
  },
  progressPercent: {
    color: '#15803D',
    fontWeight: '700',
  },
  progressBackground: {
    height: 9,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 9,
    backgroundColor: '#16A34A',
    borderRadius: 10,
  },
  progressDescription: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 10,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appointmentCount: {
    color: '#2563EB',
    fontWeight: '700',
    marginBottom: 13,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 22,
  },
  emptyTitle: {
    fontWeight: '700',
    color: '#334155',
  },
  emptyDescription: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 7,
  },
  appointmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeColumn: {
    width: 75,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    marginRight: 14,
  },
  timeText: {
    color: '#172554',
    fontWeight: '700',
    fontSize: 15,
  },
  endTime: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 5,
  },
  appointmentInfo: {
    flex: 1,
  },
  patientName: {
    color: '#1E293B',
    fontWeight: '700',
    fontSize: 14,
  },
  reason: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 18,
  },
  profileLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  profileValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginTop: 5,
  },
  profileDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 13,
  },
  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 25,
  },
});
