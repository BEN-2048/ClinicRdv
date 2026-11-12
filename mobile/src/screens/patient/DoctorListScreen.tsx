import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DoctorsApi } from '../../api/services';
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Loader,
  Screen,
} from '../../components/ui';
import { doctorDisplayName } from '../../components/PatientFigmaUI';
import { color, space, type } from '../../theme';

type ApiDoctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
  languages: string[] | null;
};

type Doctor = ApiDoctor & { name: string };

export default function DoctorListScreen() {
  const navigation = useNavigation<any>();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('Tous');

  const specialties = useMemo(
    () => ['Tous', ...Array.from(new Set(doctors.map((doctor) => doctor.specialty)))],
    [doctors]
  );

  const loadDoctors = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await DoctorsApi.list();
      const result: Doctor[] = (response.data as ApiDoctor[]).map((doctor) => ({
        ...doctor,
        name: `${doctor.first_name} ${doctor.last_name}`.trim(),
      }));
      if (isActive()) setDoctors(result);
    } catch (e) {
      console.error('Erreur de chargement des médecins :', e);
      if (isActive()) setError('Impossible de charger les médecins. Vérifiez votre connexion.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadDoctors(() => active);
    return () => {
      active = false;
    };
  }, [loadDoctors]);

  const filteredDoctors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return doctors.filter((doctor) => {
      const matchesSearch =
        doctor.name.toLowerCase().includes(query) || doctor.specialty.toLowerCase().includes(query);
      return matchesSearch && (specialty === 'Tous' || doctor.specialty === specialty);
    });
  }, [doctors, search, specialty]);

  return (
    <Screen
      refreshing={loading && doctors.length > 0}
      onRefresh={() => loadDoctors()}
      header={
        <AppHeader
          title="Trouver un médecin"
          subtitle="Trouvez le spécialiste adapté à vos besoins"
        />
      }
    >
      <Input
        icon="magnifying-glass"
        placeholder="Rechercher un médecin ou une spécialité"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        returnKeyType="search"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filters}
        style={s.filtersWrap}
      >
        {specialties.map((item) => (
          <Chip key={item} label={item} selected={specialty === item} onPress={() => setSpecialty(item)} />
        ))}
      </ScrollView>

      {!loading && !error ? (
        <Text style={s.count}>
          {filteredDoctors.length} médecin{filteredDoctors.length > 1 ? 's' : ''} trouvé
          {filteredDoctors.length > 1 ? 's' : ''}
        </Text>
      ) : null}

      {loading && doctors.length === 0 ? <Loader label="Chargement des médecins..." /> : null}
      {error ? <ErrorState message={error} onRetry={() => loadDoctors()} /> : null}

      {filteredDoctors.map((doctor) => (
        <Card key={doctor.id} style={s.card}>
          <View style={s.doctorRow}>
            <Avatar name={doctor.name} size={56} />
            <View style={s.flex}>
              <Text style={type.h3} numberOfLines={1}>
                {doctorDisplayName(doctor.name)}
              </Text>
              <Text style={s.specialty} numberOfLines={1}>
                {doctor.specialty}
              </Text>
            </View>
          </View>

          <View style={s.meta}>
            <View style={s.metaItem}>
              <Icon name="clock" size="sm" color={color.textMuted} />
              <Text style={s.metaText}>{doctor.consultation_minutes} min</Text>
            </View>
            <View style={s.metaItem}>
              <Icon name="money-bill-1" size="sm" color={color.textMuted} />
              <Text style={s.metaText}>{doctor.fee} USD</Text>
            </View>
          </View>

          <Button
            title="Voir le profil"
            iconRight="arrow-right"
            size="sm"
            variant="secondary"
            onPress={() => navigation.navigate('DoctorProfile', { doctorId: doctor.id })}
          />
        </Card>
      ))}

      {!loading && !error && filteredDoctors.length === 0 ? (
        <EmptyState
          icon="magnifying-glass"
          title="Aucun médecin trouvé"
          message="Essayez une autre recherche ou spécialité."
        />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  filtersWrap: { marginHorizontal: -space.md },
  filters: { gap: space.xs, paddingHorizontal: space.md },
  count: { ...type.label },
  card: { gap: space.sm },
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  specialty: { ...type.bodyMedium, color: color.primary, marginTop: 2 },
  meta: { flexDirection: 'row', gap: space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  metaText: { ...type.body, color: color.textSecondary },
});
