import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { AppointmentsApi, DoctorsApi, NotificationsApi } from '../../api/services';
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconName,
  ListItem,
  Loader,
  Screen,
  SectionTitle,
  StatusBadge,
} from '../../components/ui';
import { CLINIC_TIME_ZONE, doctorDisplayName } from '../../components/PatientFigmaUI';
import { color, radius, shadow, space, type } from '../../theme';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  name: string;
};

type Appointment = {
  id: number;
  doctor_id: number;
  doctor_name: string;
  specialty: string;
  starts_at: string;
  status: string;
};

const SPECIALTIES: { label: string; icon: IconName }[] = [
  { label: 'Généraliste', icon: 'medkit-outline' },
  { label: 'Pédiatre', icon: 'happy-outline' },
  { label: 'Dentiste', icon: 'sparkles-outline' },
  { label: 'Cardiologie', icon: 'heart-outline' },
];

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [doctorsError, setDoctorsError] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadHome() {
        setLoading(true);

        const [doctorsResult, appointmentsResult, notificationsResult] = await Promise.allSettled([
          DoctorsApi.list(),
          AppointmentsApi.mine('upcoming'),
          NotificationsApi.list('all'),
        ]);

        if (!active) return;

        if (doctorsResult.status === 'fulfilled') {
          const data = doctorsResult.value.data;
          const items = Array.isArray(data) ? data : [];
          setDoctors(
            items.slice(0, 3).map((d: any) => ({
              ...d,
              name: `${d.first_name} ${d.last_name}`.trim(),
            }))
          );
          setDoctorsError(false);
        } else {
          setDoctors([]);
          setDoctorsError(true);
        }

        if (appointmentsResult.status === 'fulfilled') {
          const data = appointmentsResult.value.data;
          const items: Appointment[] = Array.isArray(data) ? data : [];
          const next =
            items
              .filter((a) => ['pending', 'confirmed'].includes(a.status))
              .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] || null;
          setAppointment(next);
          setAppointmentsError(false);
        } else {
          setAppointment(null);
          setAppointmentsError(true);
        }

        setUnreadCount(
          notificationsResult.status === 'fulfilled' ? notificationsResult.value.data.unreadCount || 0 : 0
        );

        setLoading(false);
      }

      loadHome();

      return () => {
        active = false;
      };
    }, [reloadKey])
  );

  const reload = () => setReloadKey((k) => k + 1);
  const openDoctors = () => navigation.navigate('Médecins');

  return (
    <Screen
      refreshing={loading}
      onRefresh={reload}
      header={
        <AppHeader
          title={`Bonjour ${user?.first_name || 'Patient'}`}
          subtitle="Prenez soin de votre santé aujourd'hui"
          actions={[
            {
              icon: 'notifications-outline',
              onPress: () => navigation.navigate('Notifications'),
              accessibilityLabel: 'Ouvrir les notifications',
              badge: unreadCount > 0,
            },
          ]}
        />
      }
    >
      <Button title="Prendre un nouveau rendez-vous" icon="add" onPress={openDoctors} />

      <SectionTitle
        title="Prochain rendez-vous"
        actionLabel="Voir mes RDV"
        onAction={() => navigation.navigate('Mes RDV')}
      />

      {loading && !appointment ? (
        <Card>
          <Loader />
        </Card>
      ) : appointmentsError ? (
        <Card>
          <ErrorState message="Impossible de charger vos rendez-vous." onRetry={reload} />
        </Card>
      ) : appointment ? (
        <Card onPress={() => navigation.navigate('Mes RDV')} accessibilityLabel="Voir le rendez-vous">
          <View style={s.apptHead}>
            <Avatar name={appointment.doctor_name} size={48} />
            <View style={s.flex}>
              <Text style={type.h3} numberOfLines={1}>
                {doctorDisplayName(appointment.doctor_name)}
              </Text>
              <Text style={s.muted} numberOfLines={1}>
                {appointment.specialty}
              </Text>
            </View>
            <StatusBadge status={appointment.status} />
          </View>
          <View style={s.apptInfo}>
            <View style={s.infoItem}>
              <Icon name="calendar-outline" size="sm" color={color.primary} />
              <Text style={s.infoText}>{formatDate(appointment.starts_at)}</Text>
            </View>
            <View style={s.infoItem}>
              <Icon name="time-outline" size="sm" color={color.primary} />
              <Text style={s.infoText}>{formatTime(appointment.starts_at)}</Text>
            </View>
          </View>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="Aucun rendez-vous à venir"
            message="Réservez une consultation en quelques secondes."
          />
        </Card>
      )}

      <SectionTitle title="Spécialités médicales" actionLabel="Toutes" onAction={openDoctors} />

      <View style={s.specialties}>
        {SPECIALTIES.map((sp) => (
          <Pressable
            key={sp.label}
            accessibilityRole="button"
            onPress={openDoctors}
            style={({ pressed }) => [s.specialty, pressed && s.pressed]}
          >
            <View style={s.specialtyIcon}>
              <Icon name={sp.icon} size="lg" color={color.primary} />
            </View>
            <Text style={s.specialtyText} numberOfLines={1}>
              {sp.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Médecins recommandés" />

      {loading && doctors.length === 0 ? (
        <Card>
          <Loader />
        </Card>
      ) : doctorsError ? (
        <Card>
          <ErrorState message="Impossible de charger les médecins." onRetry={reload} />
        </Card>
      ) : doctors.length === 0 ? (
        <Card>
          <EmptyState icon="medkit-outline" title="Aucun médecin disponible" />
        </Card>
      ) : (
        <Card style={s.listCard}>
          {doctors.map((doctor, i) => (
            <ListItem
              key={doctor.id}
              title={doctorDisplayName(doctor.name)}
              subtitle={doctor.specialty}
              left={<Avatar name={doctor.name} size={44} />}
              onPress={() => navigation.navigate('DoctorProfile', { doctorId: doctor.id })}
              style={i > 0 ? s.divider : undefined}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  muted: { ...type.caption, color: color.textMuted, marginTop: 2 },
  apptHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  apptInfo: {
    marginTop: space.sm,
    backgroundColor: color.primarySubtle,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  infoText: { ...type.bodyMedium, color: color.text, textTransform: 'capitalize' },
  specialties: { flexDirection: 'row', gap: space.xs },
  specialty: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  specialtyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialtyText: { ...type.caption, color: color.text },
  pressed: { opacity: 0.85 },
  listCard: { paddingVertical: space.xxs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
