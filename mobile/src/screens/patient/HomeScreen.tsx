import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Header, Button, Avatar, ui } from '../../components/ClinicUI';
import { DoctorsApi, AppointmentsApi } from '../../api/services';
import { colors } from '../../theme/colors';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  name: string;
  initials: string;
};

type Appointment = {
  id: number;
  doctor_id: number;
  doctor_name: string;
  specialty: string;
  starts_at: string;
  status: string;
};

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctorsError, setDoctorsError] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadHome() {
        setLoading(true);

        const [doctorsResult, appointmentsResult] = await Promise.allSettled([
          DoctorsApi.list(),
          AppointmentsApi.mine('upcoming'),
        ]);

        if (!active) return;

        if (doctorsResult.status === 'fulfilled') {
          const data = doctorsResult.value.data;
          const items = Array.isArray(data) ? data : [];

          setDoctors(items.slice(0, 2).map((d: any) => ({
            ...d,
            name: `${d.first_name} ${d.last_name}`.trim(),
            initials: `${d.first_name?.[0] || ''}${d.last_name?.[0] || ''}`.toUpperCase(),
          })));
          setDoctorsError(false);
        } else {
          setDoctors([]);
          setDoctorsError(true);
        }

        if (appointmentsResult.status === 'fulfilled') {
          const data = appointmentsResult.value.data;
          const items: Appointment[] = Array.isArray(data) ? data : [];

          const next = items
            .filter(a => ['pending', 'confirmed'].includes(a.status))
            .sort((a, b) =>
              new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
            )[0] || null;

          setAppointment(next);
          setAppointmentsError(false);
        } else {
          setAppointment(null);
          setAppointmentsError(true);
        }

        setLoading(false);
      }

      loadHome();

      return () => {
        active = false;
      };
    }, [])
  );

  const openDoctors = () => navigation.navigate('Médecins');

  return (
    <View style={ui.page}>
      <Header title="ClinicRDV" subtitle="Accueil" />

      <ScrollView contentContainerStyle={ui.content}>
        <Text style={s.greet}>
          Bonjour {user?.first_name || 'Patient'}
        </Text>

        <Text style={ui.muted}>
          Prenez soin de votre santé aujourd'hui.
        </Text>

        <View style={{ marginTop: 16 }}>
          <Button
            title="Prendre un nouveau rendez-vous"
            onPress={openDoctors}
          />
        </View>

        <View style={s.heading}>
          <Text style={ui.h2}>Prochain rendez-vous</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Mes RDV')}>
            <Text style={s.link}>Voir mes RDV</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : appointmentsError ? (
          <View style={ui.card}>
            <Text style={ui.muted}>
              Impossible de charger vos rendez-vous.
            </Text>
          </View>
        ) : appointment ? (
          <View style={ui.card}>
            <Text style={ui.label}>{appointment.doctor_name}</Text>
            <Text style={ui.muted}>{appointment.specialty}</Text>

            <View style={s.info}>
              <Text style={s.infoText}>
                {new Date(appointment.starts_at).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>

              <Text style={s.infoText}>
                {new Date(appointment.starts_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>

            <Text style={ui.muted}>
              Statut : {appointment.status === 'confirmed' ? 'Confirmé' : 'En attente'}
            </Text>
          </View>
        ) : (
          <View style={ui.card}>
            <Text style={ui.muted}>
              Vous n'avez aucun rendez-vous à venir.
            </Text>
          </View>
        )}

        <View style={s.heading}>
          <Text style={ui.h2}>Spécialités médicales</Text>
          <TouchableOpacity onPress={openDoctors}>
            <Text style={s.link}>Toutes</Text>
          </TouchableOpacity>
        </View>

        <View style={s.specialties}>
          {[
            ['✚', 'Généraliste'],
            ['♡', 'Pédiatre'],
            ['♧', 'Dentiste'],
            ['♥', 'Cardiologie'],
          ].map(([symbol, label]) => (
            <TouchableOpacity
              key={label}
              style={s.specialty}
              onPress={openDoctors}
            >
              <Text style={s.specialIcon}>{symbol}</Text>
              <Text style={s.specialText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[ui.h2, ui.section]}>Médecins recommandés</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : doctorsError ? (
          <Text style={ui.muted}>Impossible de charger les médecins.</Text>
        ) : doctors.length === 0 ? (
          <Text style={ui.muted}>Aucun médecin disponible.</Text>
        ) : (
          doctors.map(doctor => (
            <View style={ui.card} key={doctor.id}>
              <View style={ui.line}>
                <Avatar
                  initials={doctor.initials}
                  tint={colors.primary}
                />

                <View style={{ flex: 1 }}>
                  <Text style={ui.label}>{doctor.name}</Text>
                  <Text style={ui.muted}>{doctor.specialty}</Text>
                </View>

                <TouchableOpacity onPress={openDoctors}>
                  <Text style={s.link}>Voir →</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  greet: {
    fontSize: 23,
    fontWeight: '900',
    color: colors.text,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 8,
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  info: {
    backgroundColor: '#F0F5FF',
    padding: 12,
    borderRadius: 10,
    marginVertical: 12,
  },
  infoText: {
    color: '#334B70',
    fontSize: 12,
    marginVertical: 3,
  },
  specialties: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specialty: {
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
    width: '23%',
    borderWidth: 1,
    borderColor: '#EEF1F7',
  },
  specialIcon: {
    fontSize: 24,
    color: colors.primary,
  },
  specialText: {
    fontSize: 10,
    color: colors.text,
    marginTop: 7,
    fontWeight: '700',
  },
});
