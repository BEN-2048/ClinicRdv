
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { DoctorsApi } from '../../api/services';
import { Avatar } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
};

type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
};

type DayAvailability = {
  date: string;
  slots: Slot[];
};

const clinicDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lubumbashi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (date: string, amount: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
};

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const formatDay = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export default function BookingConflictScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const doctor = route.params?.doctor as Doctor | undefined;
  const originalSlot = route.params?.slot as Slot | undefined;
  const reason = route.params?.reason || '';

  const [days, setDays] = useState<DayAvailability[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlternatives = useCallback(async () => {
    if (!doctor?.id || !originalSlot?.startsAt) {
      setError('Les informations du rendez-vous sont indisponibles.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setDays([]);
    setSelectedSlot(null);

    try {
      const startDate = clinicDate(new Date(originalSlot.startsAt));

      const dates = Array.from({ length: 7 }, (_, index) =>
        addDays(startDate, index),
      );

      const results = await Promise.all(
        dates.map(async (date) => {
          try {
            const response = await DoctorsApi.slots(doctor.id, date);

            const available = (response.data as Slot[])
              .filter(
                (slot) =>
                  slot.available &&
                  slot.startsAt !== originalSlot.startsAt,
              )
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

            return { date, slots: available };
          } catch {
            return { date, slots: [] };
          }
        }),
      );

      const withAvailability = results.filter(
        (day) => day.slots.length > 0,
      );

      setDays(withAvailability);

      if (withAvailability.length === 0) {
        setError(
          'Aucun créneau alternatif disponible pour ce médecin sur les sept prochains jours.',
        );
      }
    } catch {
      setError('Impossible de récupérer les disponibilités.');
    } finally {
      setLoading(false);
    }
  }, [doctor?.id, originalSlot?.startsAt]);

  useEffect(() => {
    loadAlternatives();
  }, [loadAlternatives]);

  if (!doctor || !originalSlot) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          Les informations du rendez-vous sont indisponibles.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials =
    `${doctor.first_name.charAt(0)}${doctor.last_name.charAt(0)}`.toUpperCase();

  const originalDate = clinicDate(new Date(originalSlot.startsAt));

  const selectAlternative = () => {
    if (!selectedSlot) return;

    navigation.replace('BookingReview', {
      doctor,
      slot: selectedSlot,
      reason,
    });
  };

  const goToDoctors = () => {
    navigation.navigate('Main', {
      screen: 'Médecins',
    });
  };

  return (
    <View style={styles.page}>
      {/* En-tête */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Fiche Médecin</Text>

        <Avatar initials={initials} tint="#E5EFFF" size={34} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Progression */}
        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>

        {/* Alerte de conflit */}
        <View style={styles.alertCard}>
          <View style={styles.alertIcon}>
            <Text style={styles.alertIconText}>↻</Text>
          </View>

          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>
              Ce créneau vient d'être réservé
            </Text>

            <Text style={styles.alertDescription}>
              Un autre patient a réservé le créneau de{' '}
              {capitalize(formatDay(originalDate))} à{' '}
              {formatTime(originalSlot.startsAt)} pendant votre sélection.
            </Text>
          </View>
        </View>

        {/* Médecin */}
        <View style={styles.doctorCard}>
          <Avatar initials={initials} tint="#E1EBF6" size={49} />

          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName}>
              Dr. {doctor.first_name} {doctor.last_name} ✓
            </Text>

            <Text style={styles.specialty}>{doctor.specialty}</Text>

            <Text style={styles.address}>
              ◉ Cabinet médical
            </Text>
          </View>

          <View style={styles.infoCircle}>
            <Text style={styles.infoText}>i</Text>
          </View>
        </View>

        {/* Disponibilités */}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>
            Créneaux alternatifs
          </Text>

          <View style={styles.availabilityBadge}>
            <Text style={styles.availabilityText}>
              Disponibilités proches
            </Text>
          </View>
        </View>

        {/* Suggestion */}
        {!loading && days.length > 0 && (
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Text style={styles.suggestionTitle}>
                ✧ OPTION SUGGÉRÉE
              </Text>

              <Text style={styles.sameDoctor}>
                Même praticien
              </Text>
            </View>

            <Text style={styles.suggestionDescription}>
              Retrouvez les prochaines disponibilités du même médecin.
              Choisissez un créneau ci-dessous pour poursuivre votre
              réservation.
            </Text>
          </View>
        )}

        {/* Chargement */}
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>
              Recherche des disponibilités...
            </Text>
          </View>
        )}

        {/* Erreur */}
        {!loading && error && (
          <View style={styles.emptyCard}>
            <Text style={styles.error}>{error}</Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadAlternatives}
            >
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Créneaux regroupés par jour */}
        {!loading &&
          days.map((day, index) => (
            <View key={day.date} style={styles.daySection}>
              <View style={styles.dayHeading}>
                <Text style={styles.calendarSymbol}>▦</Text>
                <Text style={styles.dayTitle}>
                  {index === 0
                    ? "Aujourd'hui"
                    : index === 1
                      ? 'Demain'
                      : capitalize(formatDay(day.date))}
                  {index < 2 ? ` — ${formatDay(day.date)}` : ''}
                </Text>
              </View>

              <View style={styles.slotsGrid}>
                {day.slots.map((slot, slotIndex) => {
                  const selected =
                    selectedSlot?.startsAt === slot.startsAt;

                  return (
                    <TouchableOpacity
                      key={slot.startsAt}
                      onPress={() => setSelectedSlot(slot)}
                      style={[
                        styles.slotCard,
                        selected && styles.slotSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotTime,
                          selected && styles.slotTimeSelected,
                        ]}
                      >
                        {formatTime(slot.startsAt)}
                      </Text>

                      <Text
                        style={[
                          styles.slotPeriod,
                          selected && styles.slotTimeSelected,
                        ]}
                      >
                        {slotIndex === 0
                          ? 'Suggéré'
                          : formatTime(slot.startsAt) < '12:00'
                            ? 'Matin'
                            : 'Après-midi'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

        {/* Autres médecins */}
        <Text style={styles.otherSolutions}>
          AUTRES SOLUTIONS IMMÉDIATES
        </Text>

        <View style={styles.otherDoctorCard}>
          <View style={styles.otherDoctorHeader}>
            <View style={styles.otherDoctorAvatar}>
              <Text style={styles.otherDoctorAvatarText}>+</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.otherDoctorTitle}>
                Consulter un autre médecin
              </Text>

              <Text style={styles.otherDoctorSubtitle}>
                Explorer les autres disponibilités
              </Text>
            </View>

            <Text style={styles.todayBadge}>Aujourd'hui</Text>
          </View>

          <Text style={styles.otherDoctorDescription}>
            Consultez l'annuaire pour trouver un autre praticien
            disponible pour votre consultation.
          </Text>

          <TouchableOpacity
            style={styles.otherDoctorButton}
            onPress={goToDoctors}
          >
            <Text style={styles.otherDoctorButtonText}>
              Rechercher un autre médecin →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Planning */}
        <TouchableOpacity
          style={styles.planningCard}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.planningIcon}>▦</Text>

          <View style={{ flex: 1 }}>
            <Text style={styles.planningTitle}>
              Planning complet
            </Text>
            <Text style={styles.planningSubtitle}>
              Dr. {doctor.first_name} {doctor.last_name}
            </Text>
          </View>

          <Text style={styles.planningAction}>
            Ouvrir l'agenda
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bouton fixe */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={[
            styles.bottomButton,
            !selectedSlot && styles.bottomButtonDisabled,
          ]}
          disabled={!selectedSlot}
          onPress={selectAlternative}
        >
          <Text style={styles.bottomButtonText}>
            {selectedSlot
              ? `Sélectionner ce créneau (${formatTime(selectedSlot.startsAt)} →`
              : 'Sélectionner un créneau'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToDoctors}
          style={styles.searchButton}
        >
          <Text style={styles.searchText}>
            ⌕  Retourner à la recherche
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F5F7FD',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
    backgroundColor: '#F5F7FD',
  },
  header: {
    height: 58,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
  },
  backButton: {
    width: 35,
  },
  backArrow: {
    fontSize: 34,
    color: '#172D4D',
  },
  headerTitle: {
    color: '#152A47',
    fontSize: 15,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 10,
    paddingBottom: 15,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#DCE6FA',
    borderRadius: 8,
    marginBottom: 12,
  },
  progressFill: {
    height: 4,
    width: '100%',
    backgroundColor: '#1559E9',
    borderRadius: 8,
  },
  alertCard: {
    backgroundColor: '#FFDBD8',
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  alertIcon: {
    backgroundColor: '#FFC6C2',
    width: 29,
    height: 29,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertIconText: {
    color: '#D82E35',
    fontSize: 19,
    fontWeight: '800',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    color: '#B62329',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 5,
  },
  alertDescription: {
    color: '#A63B3B',
    fontSize: 10,
    lineHeight: 16,
  },
  doctorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1C304D',
  },
  specialty: {
    fontSize: 10,
    color: '#16846C',
    fontWeight: '700',
    marginTop: 3,
  },
  address: {
    fontSize: 9,
    color: '#52617A',
    marginTop: 4,
  },
  infoCircle: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#D8DFEC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 13,
    color: '#63728A',
    fontWeight: '700',
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1D304C',
  },
  availabilityBadge: {
    backgroundColor: '#C9F4EA',
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  availabilityText: {
    fontSize: 9,
    color: '#147D70',
    fontWeight: '800',
  },
  suggestionCard: {
    backgroundColor: '#DCE8FF',
    borderRadius: 10,
    padding: 11,
    marginBottom: 13,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionTitle: {
    color: '#1356D9',
    fontSize: 10,
    fontWeight: '900',
  },
  sameDoctor: {
    color: '#1755C7',
    fontSize: 9,
    backgroundColor: '#C8D9FF',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
  },
  suggestionDescription: {
    fontSize: 10,
    color: '#53627A',
    lineHeight: 16,
  },
  loading: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  muted: {
    fontSize: 11,
    color: '#69768B',
  },
  daySection: {
    marginBottom: 15,
  },
  dayHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 9,
  },
  calendarSymbol: {
    color: '#155CE6',
    fontSize: 16,
  },
  dayTitle: {
    fontSize: 11,
    color: '#263A56',
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  slotCard: {
    width: '23.5%',
    minHeight: 49,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E7EBF3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  slotSelected: {
    backgroundColor: '#0756D9',
    borderColor: '#0756D9',
  },
  slotTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#233752',
  },
  slotPeriod: {
    fontSize: 8,
    color: '#64718A',
    marginTop: 3,
  },
  slotTimeSelected: {
    color: '#FFFFFF',
  },
  otherSolutions: {
    fontSize: 9,
    fontWeight: '900',
    color: '#66738A',
    letterSpacing: 0.5,
    marginVertical: 8,
  },
  otherDoctorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 11,
    marginBottom: 10,
  },
  otherDoctorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  otherDoctorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 22,
    backgroundColor: '#DCE9F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherDoctorAvatarText: {
    fontSize: 24,
    color: '#2861D9',
  },
  otherDoctorTitle: {
    color: '#253956',
    fontSize: 11,
    fontWeight: '800',
  },
  otherDoctorSubtitle: {
    color: '#16846C',
    fontSize: 9,
    marginTop: 3,
  },
  todayBadge: {
    color: '#11796C',
    backgroundColor: '#C8F3E9',
    fontSize: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
  },
  otherDoctorDescription: {
    color: '#5B6980',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 10,
  },
  otherDoctorButton: {
    backgroundColor: '#EDF2FF',
    borderRadius: 8,
    padding: 10,
    marginTop: 9,
    alignItems: 'center',
  },
  otherDoctorButtonText: {
    color: '#1459DB',
    fontSize: 10,
    fontWeight: '800',
  },
  planningCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planningIcon: {
    fontSize: 21,
    color: '#1762E7',
  },
  planningTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#263956',
  },
  planningSubtitle: {
    fontSize: 9,
    color: '#66738A',
    marginTop: 3,
  },
  planningAction: {
    fontSize: 9,
    color: '#334A69',
    backgroundColor: '#EDF2FF',
    padding: 8,
    borderRadius: 7,
  },
  bottomContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 7,
    borderTopWidth: 1,
    borderTopColor: '#E6EAF2',
  },
  bottomButton: {
    height: 47,
    borderRadius: 9,
    backgroundColor: '#0756D9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomButtonDisabled: {
    backgroundColor: '#91A9D3',
  },
  bottomButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  searchButton: {
    alignItems: 'center',
    paddingTop: 9,
  },
  searchText: {
    color: '#3D4D65',
    fontSize: 10,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  error: {
    color: colors.error,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: '#E8F0FF',
    padding: 10,
    borderRadius: 8,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 11,
  },
  link: {
    color: colors.primary,
    marginTop: 15,
    fontWeight: '700',
  },
});
