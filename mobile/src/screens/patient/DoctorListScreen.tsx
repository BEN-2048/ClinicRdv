import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
} from 'react-native';
import { colors } from '../../theme/colors';

const doctors = [
  { id: 1, name: 'Dr. Kabila', specialty: 'Généraliste', initials: 'DK', fee: 20, experience: 8, available: true },
  { id: 2, name: 'Dr. Mutombo', specialty: 'Pédiatre', initials: 'DM', fee: 20, experience: 6, available: true },
  { id: 3, name: 'Dr. Ilunga', specialty: 'Cardiologue', initials: 'DI', fee: 20, experience: 12, available: false },
];

const specialties = ['Tous', 'Généraliste', 'Pédiatre', 'Cardiologue'];

export default function DoctorListScreen() {
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('Tous');
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);

  const filteredDoctors = useMemo(() => doctors.filter((doctor) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      doctor.name.toLowerCase().includes(query) ||
      doctor.specialty.toLowerCase().includes(query);
    return matchesSearch &&
      (specialty === 'Tous' || doctor.specialty === specialty);
  }), [search, specialty]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CLINICRDV</Text>
          <Text style={styles.title}>Trouver un médecin</Text>
          <Text style={styles.subtitle}>
            Consultez notre annuaire et trouvez le spécialiste adapté à vos besoins.
          </Text>
        </View>

        <View style={styles.content}>
          <TextInput
            style={styles.search}
            placeholder="Rechercher un médecin ou une spécialité"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
            {specialties.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setSpecialty(item)}
                style={[styles.chip, specialty === item && styles.chipActive]}
              >
                <Text style={[styles.chipText, specialty === item && styles.chipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.count}>
            {filteredDoctors.length} médecin(s) trouvé(s)
          </Text>

          {filteredDoctors.map((doctor) => (
            <View key={doctor.id} style={styles.card}>
              <View style={styles.doctorRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{doctor.initials}</Text>
                </View>
                <View style={styles.doctorInfo}>
                  <Text style={styles.doctorName}>{doctor.name}</Text>
                  <Text style={styles.specialty}>{doctor.specialty}</Text>
                  <Text style={styles.experience}>
                    {doctor.experience} ans d'expérience
                  </Text>
                </View>
              </View>

              <View style={styles.detailsRow}>
                <Text style={styles.fee}>{doctor.fee} USD / consultation</Text>
                <Text style={[
                  styles.availability,
                  !doctor.available && styles.unavailable,
                ]}>
                  {doctor.available ? '● Disponible' : '● Indisponible'}
                </Text>
              </View>

              {selectedDoctor === doctor.id && (
                <View style={styles.profile}>
                  <Text style={styles.profileTitle}>Informations du médecin</Text>
                  <Text style={styles.profileText}>Spécialité : {doctor.specialty}</Text>
                  <Text style={styles.profileText}>Consultation : 30 minutes</Text>
                  <Text style={styles.profileText}>Lundi au vendredi</Text>
                  <Text style={styles.profileText}>08h–12h et 14h–17h</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.button}
                onPress={() => setSelectedDoctor(
                  selectedDoctor === doctor.id ? null : doctor.id
                )}
              >
                <Text style={styles.buttonText}>
                  {selectedDoctor === doctor.id ? 'Fermer la fiche' : 'Voir le profil'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          {filteredDoctors.length === 0 && (
            <Text style={styles.empty}>Aucun médecin trouvé.</Text>
          )}

          <Text style={styles.footer}>
            Données fictives utilisées pour la démonstration.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 32,
  },
  eyebrow: { color: '#BFDBFE', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 29, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#DBEAFE', fontSize: 14, lineHeight: 21, marginTop: 10 },
  content: { padding: 18 },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: colors.text,
    fontSize: 14,
  },
  filters: { marginTop: 18, marginBottom: 20 },
  chip: {
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 25,
    backgroundColor: '#E2E8F0',
    marginRight: 9,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  count: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  doctorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 62, height: 62, borderRadius: 18,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 21, fontWeight: '800', color: colors.primary },
  doctorInfo: { flex: 1 },
  doctorName: { fontSize: 18, fontWeight: '800', color: colors.text },
  specialty: { color: colors.primary, fontWeight: '600', marginTop: 4 },
  experience: { color: colors.muted, marginTop: 5, fontSize: 12 },
  detailsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 19, marginBottom: 17,
    flexWrap: 'wrap', gap: 8,
  },
  fee: { color: colors.text, fontSize: 13, fontWeight: '600' },
  availability: { color: colors.success, fontSize: 12, fontWeight: '700' },
  unavailable: { color: colors.error },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 11, padding: 14, alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  profile: {
    backgroundColor: colors.bg, borderRadius: 12,
    padding: 15, marginBottom: 15,
  },
  profileTitle: { fontWeight: '800', color: colors.text, marginBottom: 8 },
  profileText: { color: colors.muted, marginTop: 5, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 35 },
  footer: {
    textAlign: 'center', color: colors.muted,
    fontSize: 11, marginTop: 14, marginBottom: 30,
  },
});
