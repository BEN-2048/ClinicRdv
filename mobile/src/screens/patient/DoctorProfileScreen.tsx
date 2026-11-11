import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { DoctorFacility, DoctorsApi } from '../../api/services';
import { Avatar, Button, Card, Chip, ErrorState, InfoRow, Loader, Screen } from '../../components/ui';
import { color, space, type } from '../../theme';

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
  facilities: DoctorFacility[];
};

export default function DoctorProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const doctorId = Number(route.params?.doctorId);
  const requestedFacilityId = route.params?.facilityId ? Number(route.params.facilityId) : null;

  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const loadDoctor = async () => {
      try {
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
          throw new Error('Identifiant du médecin invalide.');
        }
        const response = await DoctorsApi.get(doctorId);
        const data = response.data as DoctorProfile;
        if (active) {
          setDoctor(data);
          const list = data.facilities ?? [];
          const preset = list.find((f) => f.id === requestedFacilityId) ?? (list.length === 1 ? list[0] : null);
          setFacilityId(preset?.id ?? null);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.response?.data?.error || err?.message || 'Impossible de charger le profil du médecin.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDoctor();

    return () => {
      active = false;
    };
  }, [doctorId, requestedFacilityId]);

  if (loading) {
    return <Loader fullscreen label="Chargement du profil..." />;
  }

  if (error || !doctor) {
    return (
      <Screen>
        <ErrorState message={error || 'Médecin introuvable.'} />
        <Button title="Retour" variant="secondary" icon="arrow-back" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const fullName = `${doctor.first_name} ${doctor.last_name}`.trim();
  const facilities = doctor.facilities ?? [];
  const facility = facilities.find((f) => f.id === facilityId) ?? null;
  const canBook = doctor.active && (!!facility || facilities.length === 0);

  return (
    <Screen
      footer={
        <View style={s.footer}>
          <Button
            title="Choisir un créneau"
            icon="calendar-outline"
            disabled={!canBook}
            onPress={() => navigation.navigate('SlotPicker', { doctorId: doctor.id, facilityId: facility?.id })}
          />
          <Button
            title="M'alerter d'un désistement"
            icon="notifications-outline"
            variant="secondary"
            disabled={!doctor.active}
            onPress={() => navigation.navigate('WaitingList', { doctorId: doctor.id })}
          />
        </View>
      }
    >
      <Card style={s.identity}>
        <Avatar name={fullName} size={80} dotColor={doctor.active ? color.success : color.textMuted} />
        <Text style={s.name}>Dr. {fullName}</Text>
        <Text style={s.specialty}>{doctor.specialty}</Text>
        {!doctor.active ? (
          <Text style={s.unavailable}>Ce médecin n’est actuellement pas disponible.</Text>
        ) : null}
      </Card>

      {facilities.length > 0 ? (
        <Card style={s.section}>
          <Text style={type.h2}>Lieu de consultation</Text>
          {facilities.length > 1 ? (
            <Text style={s.hint}>Ce médecin consulte dans plusieurs établissements. Choisissez-en un.</Text>
          ) : null}
          <View style={s.chips}>
            {facilities.map((f) => (
              <Chip
                key={f.id}
                icon="business-outline"
                label={f.city ? `${f.name} · ${f.city}` : f.name}
                selected={f.id === facilityId}
                onPress={facilities.length > 1 ? () => setFacilityId(f.id) : undefined}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={s.section}>
        <Text style={type.h2}>Informations professionnelles</Text>
        <InfoRow icon="document-text-outline" label="Biographie" value={doctor.bio || 'Aucune biographie renseignée.'} />
        <InfoRow icon="cash-outline" label="Tarif de consultation" value={`${facility?.fee ?? doctor.fee ?? 0} USD`} strong />
        <InfoRow icon="time-outline" label="Durée de consultation" value={`${doctor.consultation_minutes} minutes`} strong />
        <InfoRow icon="language-outline" label="Langues parlées" value={doctor.languages || 'Non renseignées'} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  identity: { alignItems: 'center', paddingVertical: space.lg, gap: space.xxs },
  name: { ...type.h1, fontSize: 20, lineHeight: 28, marginTop: space.sm, textAlign: 'center' },
  specialty: { ...type.bodyMedium, color: color.primary },
  unavailable: { ...type.caption, color: color.danger, marginTop: space.xs, textAlign: 'center' },
  section: { gap: space.md },
  footer: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  hint: { ...type.caption, color: color.textMuted },
});
