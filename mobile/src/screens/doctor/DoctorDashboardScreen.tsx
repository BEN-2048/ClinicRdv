import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DoctorsApi } from '../../api/services';
import {
  AppHeader,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  InfoRow,
  Loader,
  Screen,
  SectionTitle,
  StatCard,
} from '../../components/ui';
import { color, radius, space, type } from '../../theme';
import { AppointmentRow, DoctorAppointment, formatTime, sameDay } from './shared';

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
  appointments: DoctorAppointment[];
};

const getMonday = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  return result;
};

const byStart = (a: DoctorAppointment, b: DoctorAppointment) =>
  new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();

export default function DoctorDashboardScreen() {
  const navigation = useNavigation<any>();

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
      setError(e?.response?.data?.error || 'Impossible de charger le tableau de bord.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const openAppointment = (appointmentId: number) =>
    navigation.navigate('AppointmentDetail', { appointmentId });

  if (loading) {
    return <Loader fullscreen label="Chargement de votre tableau de bord..." />;
  }

  if (error || !data) {
    return (
      <Screen safeTop>
        <ErrorState message={error || 'Aucune donnée disponible.'} onRetry={loadDashboard} />
      </Screen>
    );
  }

  const { doctor, appointments } = data;
  const today = new Date();
  const fullName = `${doctor.first_name} ${doctor.last_name}`.trim();

  const todayAppointments = appointments
    .filter((a) => sameDay(new Date(a.starts_at), today) && a.status !== 'cancelled')
    .sort(byStart);
  const completedToday = todayAppointments.filter((a) => a.status === 'done').length;
  const remainingToday = todayAppointments.length - completedToday;
  const waitingToday = todayAppointments.filter((a) => a.status === 'pending').length;

  const weekStart = getMonday(today);
  const nextMonday = new Date(weekStart);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const weekAppointments = appointments.filter((a) => {
    const date = new Date(a.starts_at);
    return date >= weekStart && date < nextMonday && a.status !== 'cancelled';
  });
  const weeklyFees = weekAppointments.filter((a) => a.status === 'done').length * Number(doctor.fee || 0);

  const progress = todayAppointments.length > 0 ? Math.round((completedToday / todayAppointments.length) * 100) : 0;

  const upcoming = appointments
    .filter((a) => new Date(a.starts_at) > today && a.status !== 'cancelled' && !sameDay(new Date(a.starts_at), today))
    .sort(byStart)
    .slice(0, 5);

  const dateLabel = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        loadDashboard();
      }}
      header={
        <AppHeader
          title={`Bonjour Dr. ${doctor.last_name}`}
          subtitle={`${doctor.specialty} · ${dateLabel}`}
          right={<Avatar name={fullName} size={40} />}
        />
      }
    >
      <SectionTitle title="Vue d'ensemble" />
      <View style={s.grid}>
        <StatCard style={s.tile} icon="people-outline" label="Consultations aujourd'hui" value={todayAppointments.length} />
        <StatCard style={s.tile} icon="checkmark-done-outline" tone="success" label="Terminées" value={completedToday} />
        <StatCard style={s.tile} icon="time-outline" tone="neutral" label="Restantes" value={remainingToday} />
        <StatCard style={s.tile} icon="hourglass-outline" tone="warning" label="En attente" value={waitingToday} />
      </View>

      <Card style={s.progress}>
        <View style={s.progressHead}>
          <Text style={type.bodyMedium}>Progression de la journée</Text>
          <Text style={s.progressPercent}>{progress}%</Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${progress}%` }]} />
        </View>
        <Text style={s.muted}>
          {completedToday} consultation{completedToday > 1 ? 's' : ''} terminée{completedToday > 1 ? 's' : ''} sur{' '}
          {todayAppointments.length}
        </Text>
      </Card>

      <SectionTitle title="Consultations du jour" />
      {todayAppointments.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-clear-outline"
            title="Aucun rendez-vous aujourd'hui"
            message="Vos consultations apparaîtront ici."
          />
        </Card>
      ) : (
        todayAppointments.map((a) => (
          <AppointmentRow
            key={a.id}
            appointment={a}
            topLabel={formatTime(a.starts_at)}
            bottomLabel={formatTime(a.ends_at)}
            onPress={() => openAppointment(a.id)}
          />
        ))
      )}

      {upcoming.length > 0 ? (
        <>
          <SectionTitle title="Prochains rendez-vous" />
          {upcoming.map((a) => (
            <AppointmentRow
              key={`upcoming-${a.id}`}
              appointment={a}
              topLabel={new Date(a.starts_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              bottomLabel={formatTime(a.starts_at)}
              onPress={() => openAppointment(a.id)}
            />
          ))}
        </>
      ) : null}

      <SectionTitle title="Cette semaine" />
      <View style={s.grid}>
        <StatCard style={s.tile} icon="calendar-outline" label="Rendez-vous" value={weekAppointments.length} />
        <StatCard
          style={s.tile}
          icon="cash-outline"
          tone="success"
          label="Honoraires estimés"
          value={`${weeklyFees.toLocaleString('fr-FR')} $`}
        />
      </View>

      <SectionTitle title="Mon profil professionnel" />
      <Card style={s.profile}>
        <InfoRow icon="mail-outline" label="Adresse e-mail" value={doctor.email} />
        <InfoRow icon="medkit-outline" label="Spécialité" value={doctor.specialty} />
        <InfoRow
          icon="cash-outline"
          label="Honoraires par consultation"
          value={`${Number(doctor.fee).toLocaleString('fr-FR')} $`}
          strong
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexBasis: '47%', flexGrow: 1 },
  progress: { gap: space.xs },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressPercent: { ...type.h3, fontFamily: type.h2.fontFamily, color: color.success },
  track: { height: 8, borderRadius: radius.full, backgroundColor: color.primarySubtle, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.success, borderRadius: radius.full },
  muted: { ...type.caption, color: color.textMuted },
  profile: { gap: space.md },
});
