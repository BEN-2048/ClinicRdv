import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Button, Card, ErrorState, Icon, InfoRow, Screen, StatusBadge } from '../../components/ui';
import { CLINIC_TIME_ZONE } from '../../components/PatientFigmaUI';
import { color, radius, space, type } from '../../theme';

type Appointment = {
  id: number;
  doctor_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  reason?: string | null;
};

type DoctorInfo = {
  id: number;
  name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
};

const formatDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));

const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de confirmation',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  done: 'Terminé',
};

export default function BookingConfirmScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const appointment = route.params?.appointment as Appointment | undefined;
  const doctor = route.params?.doctor as DoctorInfo | undefined;
  const patientName = route.params?.patientName as string | undefined;
  const facility = route.params?.facility as { name: string; city: string | null } | undefined;
  const timeZone = (route.params?.timeZone as string | undefined) ?? CLINIC_TIME_ZONE;

  if (!appointment || !doctor || !appointment.id || !appointment.starts_at || !appointment.ends_at) {
    return (
      <Screen>
        <ErrorState message="Les informations du rendez-vous sont indisponibles." />
        <Button title="Retour à l'accueil" icon="home-outline" onPress={() => navigation.navigate('Main')} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={s.footer}>
          <Button
            title="Voir mes rendez-vous"
            icon="calendar-outline"
            onPress={() => navigation.navigate('Main', { screen: 'Mes RDV' })}
          />
          <Button
            title="Retour à l'accueil"
            variant="secondary"
            icon="home-outline"
            onPress={() => navigation.navigate('Main', { screen: 'Accueil' })}
          />
        </View>
      }
    >
      <Card style={s.success}>
        <View style={s.successIcon}>
          <Icon name="checkmark" size={32} color={color.onPrimary} />
        </View>
        <Text style={s.successTitle}>Réservation enregistrée</Text>
        <Text style={s.successText}>Votre rendez-vous a été créé avec succès.</Text>
        <StatusBadge status={appointment.status} label={STATUS_LABELS[appointment.status] ?? appointment.status} />
      </Card>

      <Card style={s.section}>
        <Text style={type.h2}>Détails du rendez-vous</Text>
        <InfoRow icon="receipt-outline" label="Numéro de réservation" value={`#${appointment.id}`} strong />
        {patientName ? <InfoRow icon="people-outline" label="Patient" value={patientName} strong /> : null}
        <InfoRow icon="person-outline" label="Médecin" value={`Dr. ${doctor.name}`} strong />
        <InfoRow icon="medkit-outline" label="Spécialité" value={doctor.specialty} />
        {facility ? (
          <InfoRow icon="business-outline" label="Établissement" value={[facility.name, facility.city].filter(Boolean).join(' · ')} strong />
        ) : null}
        <InfoRow icon="calendar-outline" label="Date" value={formatDate(appointment.starts_at, timeZone)} strong />
        <InfoRow
          icon="time-outline"
          label="Horaire"
          value={`${formatTime(appointment.starts_at, timeZone)} – ${formatTime(appointment.ends_at, timeZone)}`}
          strong
        />
        <InfoRow icon="cash-outline" label="Tarif de consultation" value={`${doctor.fee} USD`} />
        {appointment.reason ? (
          <InfoRow icon="document-text-outline" label="Motif" value={appointment.reason} />
        ) : null}
      </Card>

      <View style={s.note}>
        <Icon name="information-circle" size="md" color={color.successInk} />
        <Text style={s.noteText}>
          Conservez votre numéro de réservation. Le statut affiché correspond à celui enregistré par la clinique.
        </Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  success: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: color.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  successTitle: { ...type.h2, textAlign: 'center' },
  successText: { ...type.body, color: color.textSecondary, textAlign: 'center', marginBottom: space.xs },
  section: { gap: space.md },
  note: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.successSoft + '55',
  },
  noteText: { ...type.body, color: color.successInk, flex: 1 },
  footer: { gap: space.xs },
});
