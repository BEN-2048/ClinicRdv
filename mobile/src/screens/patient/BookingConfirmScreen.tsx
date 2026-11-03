import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { Header, Button, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

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

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const statusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return 'En attente de confirmation';
    case 'confirmed':
      return 'Confirmé';
    case 'cancelled':
      return 'Annulé';
    case 'done':
      return 'Terminé';
    default:
      return status;
  }
};

export default function BookingConfirmScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const appointment = route.params?.appointment as Appointment | undefined;
  const doctor = route.params?.doctor as DoctorInfo | undefined;

  if (
    !appointment ||
    !doctor ||
    !appointment.id ||
    !appointment.starts_at ||
    !appointment.ends_at
  ) {
    return (
      <View style={ui.page}>
        <Header title="Confirmation" />
        <View style={ui.content}>
          <Text style={styles.error}>
            Les informations du rendez-vous sont indisponibles.
          </Text>
          <Button
            title="Retour à l'accueil"
            onPress={() => navigation.navigate('Main')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={ui.page}>
      <Header
        title="Rendez-vous enregistré"
        subtitle="Votre demande a été reçue"
      />

      <ScrollView contentContainerStyle={ui.content}>
        <View style={styles.successCard}>
          <Text style={styles.successSymbol}>✓</Text>
          <Text style={styles.successTitle}>
            Réservation enregistrée
          </Text>
          <Text style={styles.successDescription}>
            Votre rendez-vous a été créé avec succès.
          </Text>
          <Text style={styles.status}>
            {statusLabel(appointment.status)}
          </Text>
        </View>

        <View style={ui.card}>
          <Text style={ui.h2}>Détails du rendez-vous</Text>

          <Text style={styles.label}>Numéro de réservation</Text>
          <Text style={styles.value}>#{appointment.id}</Text>

          <Text style={styles.label}>Médecin</Text>
          <Text style={styles.value}>Dr. {doctor.name}</Text>

          <Text style={styles.label}>Spécialité</Text>
          <Text style={styles.value}>{doctor.specialty}</Text>

          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>
            {formatDate(appointment.starts_at)}
          </Text>

          <Text style={styles.label}>Heure de début</Text>
          <Text style={styles.value}>
            {formatTime(appointment.starts_at)}
          </Text>

          <Text style={styles.label}>Heure de fin</Text>
          <Text style={styles.value}>
            {formatTime(appointment.ends_at)}
          </Text>

          <Text style={styles.label}>Tarif de consultation</Text>
          <Text style={styles.value}>{doctor.fee} USD</Text>

          {appointment.reason ? (
            <>
              <Text style={styles.label}>Motif</Text>
              <Text style={styles.value}>{appointment.reason}</Text>
            </>
          ) : null}
        </View>

        <View style={ui.card}>
          <Text style={ui.label}>Information importante</Text>
          <Text style={styles.note}>
            Conservez votre numéro de réservation.
            Le statut affiché correspond à celui enregistré par la clinique.
          </Text>
        </View>

        <Button
          title="Voir mes rendez-vous"
          onPress={() =>
            navigation.navigate('Main', {
              screen: 'Mes RDV',
            })
          }
        />

        <View style={styles.secondaryButton}>
          <Button
            title="Retour à l'accueil"
            secondary
            onPress={() =>
              navigation.navigate('Main', {
                screen: 'Accueil',
              })
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  successCard: {
    backgroundColor: '#EAF8EF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 18,
  },
  successSymbol: {
    fontSize: 44,
    color: '#12834C',
    fontWeight: '800',
  },
  successTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  successDescription: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  status: {
    color: '#12834C',
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 15,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 5,
  },
  note: {
    color: colors.muted,
    lineHeight: 21,
    marginTop: 10,
  },
  secondaryButton: {
    marginTop: 12,
  },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 20,
  },
});

