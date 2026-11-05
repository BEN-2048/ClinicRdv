import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { DoctorsApi } from '../../api/services';
import { Header, Button, Avatar, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

type DoctorProfile = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  bio: string | null;
  fee: string | number;
  consultation_minutes: number;
  languages: string | null;
  active: boolean;
};

export default function DoctorProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const doctorId = Number(route.params?.doctorId);

  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDoctor = async () => {
      try {
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
          throw new Error('Identifiant du médecin invalide.');
        }

        const response = await DoctorsApi.get(doctorId);

        if (active) {
          setDoctor(response.data as DoctorProfile);
        }
      } catch (err: any) {
        if (active) {
          setError(
            err?.response?.data?.error ||
            err?.message ||
            'Impossible de charger le profil du médecin.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDoctor();

    return () => {
      active = false;
    };
  }, [doctorId]);

  if (loading) {
    return (
      <View style={[ui.page, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={ui.muted}>Chargement du profil...</Text>
      </View>
    );
  }

  if (error || !doctor) {
    return (
      <View style={ui.page}>
        <Header title="Profil du médecin" />
        <View style={ui.content}>
          <Text style={styles.error}>
            {error || 'Médecin introuvable.'}
          </Text>
          <Button
            title="Retour"
            secondary
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    );
  }

  const initials =
    `${doctor.first_name?.charAt(0) || ''}${doctor.last_name?.charAt(0) || ''}`.toUpperCase();

  return (
    <View style={ui.page}>
      <Header title="Profil du médecin" subtitle="Informations professionnelles" />

      <ScrollView contentContainerStyle={ui.content}>
        <View style={[ui.card, styles.identity]}>
          <Avatar initials={initials} tint="#E5E9FF" size={76} />
          <Text style={styles.name}>
            Dr. {doctor.first_name} {doctor.last_name}
          </Text>
          <Text style={styles.specialty}>{doctor.specialty}</Text>
        </View>

        <View style={ui.card}>
          <Text style={ui.h2}>Informations professionnelles</Text>

          <Text style={styles.label}>Biographie</Text>
          <Text style={styles.value}>
            {doctor.bio || 'Aucune biographie renseignée.'}
          </Text>

          <Text style={styles.label}>Tarif de consultation</Text>
          <Text style={styles.value}>{doctor.fee ?? 0} USD</Text>

          <Text style={styles.label}>Durée de consultation</Text>
          <Text style={styles.value}>
            {doctor.consultation_minutes} minutes
          </Text>

          <Text style={styles.label}>Langues parlées</Text>
          <Text style={styles.value}>
            {doctor.languages || 'Non renseignées'}
          </Text>
        </View>

        <Button
          title="Choisir un créneau →"
          disabled={!doctor.active}
          onPress={() =>
            navigation.navigate('SlotPicker', { doctorId: doctor.id })
          }
        />

        <Button
          title="M'alerter d'un désistement"
          secondary
          disabled={!doctor.active}
          onPress={() =>
            navigation.navigate('WaitingList', { doctorId: doctor.id })
          }
        />

        {!doctor.active && (
          <Text style={styles.error}>
            Ce médecin n'est actuellement pas disponible.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  identity: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  name: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.text,
    marginTop: 15,
    textAlign: 'center',
  },
  specialty: {
    color: colors.primary,
    fontWeight: '700',
    marginTop: 7,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 17,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    marginTop: 5,
  },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginVertical: 20,
  },
});