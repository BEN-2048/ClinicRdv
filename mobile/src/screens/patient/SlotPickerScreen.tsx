import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useNavigation, useRoute } from '@react-navigation/native';

import { DoctorsApi, AppointmentsApi } from '../../api/services';
import { Header, Button, Avatar, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
  languages: string | null;
  active: boolean;
};

type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatLocalTime = (iso: string) => {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
};

const formatLongDate = (date: string) => {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export default function SlotPickerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const doctorId = Number(route.params?.doctorId);

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDoctor = async () => {
      try {
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
          throw new Error('Identifiant du médecin invalide.');
        }

        const response = await DoctorsApi.get(doctorId);

        if (active) {
          setDoctor(response.data as Doctor);
        }
      } catch (err: any) {
        if (active) {
          setError(
            err?.response?.data?.error ||
            err?.message ||
            'Impossible de récupérer le médecin.'
          );
        }
      } finally {
        if (active) setLoadingDoctor(false);
      }
    };

    loadDoctor();

    return () => {
      active = false;
    };
  }, [doctorId]);

  const loadSlots = useCallback(async (date: string) => {
    setLoadingSlots(true);
    setSlotError(null);
    setSelectedSlot(null);
    setSlots([]);

    try {
      const response = await DoctorsApi.slots(doctorId, date);
      setSlots(response.data as Slot[]);
    } catch (err: any) {
      setSlotError(
        err?.response?.data?.error ||
        'Impossible de récupérer les disponibilités.'
      );
    } finally {
      setLoadingSlots(false);
    }
  }, [doctorId]);

  useEffect(() => {
    if (doctor?.id) {
      loadSlots(selectedDate);
    }
  }, [doctor, selectedDate, loadSlots]);

  const chooseDate = (day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedSlot(null);
  };

  const bookAppointment = async () => {
    if (!selectedSlot || !doctor) return;

    setBooking(true);

    try {
      const response = await AppointmentsApi.book(
        doctor.id,
        selectedSlot.startsAt,
        reason.trim() || undefined
      );

      navigation.replace('BookingConfirm', {
        appointment: response.data,
        doctor: {
          id: doctor.id,
          name: `${doctor.first_name} ${doctor.last_name}`,
          specialty: doctor.specialty,
          fee: doctor.fee,
          consultation_minutes: doctor.consultation_minutes,
        },
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        'La réservation a échoué. Veuillez réessayer.';

      Alert.alert('Réservation impossible', message);

      // Recharger les disponibilités après un conflit.
      await loadSlots(selectedDate);
    } finally {
      setBooking(false);
    }
  };

  if (loadingDoctor) {
    return (
      <View style={[ui.page, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={ui.muted}>Chargement du médecin...</Text>
      </View>
    );
  }

  if (error || !doctor) {
    return (
      <View style={ui.page}>
        <Header title="Réservation" />
        <View style={ui.content}>
          <Text style={styles.error}>
            {error || 'Médecin introuvable.'}
          </Text>
          <Button title="Retour" secondary onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const initials =
    `${doctor.first_name.charAt(0)}${doctor.last_name.charAt(0)}`.toUpperCase();

  const markedDates = {
    [selectedDate]: {
      selected: true,
      selectedColor: colors.primary,
    },
  };

  const availableSlots = slots.filter((slot) => slot.available);
  const unavailableSlots = slots.filter((slot) => !slot.available);

  return (
    <View style={ui.page}>
      <Header title="Réserver une consultation" subtitle="Choisissez votre date et votre heure" />

      <ScrollView contentContainerStyle={ui.content}>
        <View style={[ui.card, ui.line]}>
          <Avatar initials={initials} tint="#E5E9FF" size={58} />
          <View style={{ flex: 1 }}>
            <Text style={ui.label}>
              Dr. {doctor.first_name} {doctor.last_name}
            </Text>
            <Text style={styles.specialty}>{doctor.specialty}</Text>
            <Text style={ui.muted}>
              {doctor.consultation_minutes} minutes · {doctor.fee} USD
            </Text>
          </View>
        </View>

        <Text style={ui.h2}>1. Choisissez une date</Text>

        <View style={ui.card}>
          <Calendar
            minDate={formatDate(new Date())}
            maxDate={formatDate(new Date(Date.now() + 13 * 86400000))}
            current={selectedDate}
            onDayPress={chooseDate}
            markedDates={markedDates}
            enableSwipeMonths={false}
            theme={{
              todayTextColor: colors.primary,
              arrowColor: colors.primary,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: '#FFFFFF',
              textDayFontWeight: '600',
              textMonthFontWeight: '800',
            }}
          />
        </View>

        <Text style={ui.h2}>2. Choisissez un créneau</Text>
        <Text style={styles.dateLabel}>{formatLongDate(selectedDate)}</Text>

        {loadingSlots && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={ui.muted}>Recherche des disponibilités...</Text>
          </View>
        )}

        {slotError && <Text style={styles.error}>{slotError}</Text>}

        {!loadingSlots && !slotError && slots.length === 0 && (
          <View style={ui.card}>
            <Text style={styles.empty}>
              Aucun créneau de consultation pour cette date.
            </Text>
          </View>
        )}

        {!loadingSlots && availableSlots.length > 0 && (
          <View style={styles.slotGrid}>
            {availableSlots.map((slot) => {
              const selected = selectedSlot?.startsAt === slot.startsAt;

              return (
                <TouchableOpacity
                  key={slot.startsAt}
                  onPress={() => setSelectedSlot(slot)}
                  style={[styles.slot, selected && styles.slotSelected]}
                >
                  <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                    {formatLocalTime(slot.startsAt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!loadingSlots && unavailableSlots.length > 0 && (
          <Text style={ui.muted}>
            {unavailableSlots.length} créneau(x) indisponible(s).
          </Text>
        )}

        <Text style={ui.h2}>3. Motif de consultation</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Décrivez brièvement le motif (facultatif)"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          style={styles.reason}
          textAlignVertical="top"
        />

        <View style={ui.card}>
          <Text style={ui.label}>Récapitulatif</Text>
          <Text style={styles.summary}>
            Médecin : Dr. {doctor.first_name} {doctor.last_name}
          </Text>
          <Text style={styles.summary}>
            Date : {formatLongDate(selectedDate)}
          </Text>
          <Text style={styles.summary}>
            Heure : {selectedSlot ? formatLocalTime(selectedSlot.startsAt) : 'Non sélectionnée'}
          </Text>
          <Text style={styles.summary}>Tarif : {doctor.fee} USD</Text>
        </View>

        <Button
          title={booking ? 'Réservation en cours...' : 'Confirmer le rendez-vous'}
          disabled={!selectedSlot || loadingSlots || booking || !doctor.active}
          onPress={bookAppointment}
        />

        {!doctor.active && (
          <Text style={styles.error}>Ce médecin n'est pas disponible.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  specialty: {
    color: colors.primary,
    fontWeight: '700',
    marginTop: 4,
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  loading: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 25,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  slot: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCE4F0',
    paddingVertical: 15,
    alignItems: 'center',
  },
  slotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotText: {
    color: colors.text,
    fontWeight: '700',
  },
  slotTextSelected: {
    color: '#FFFFFF',
  },
  reason: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE4F0',
    padding: 14,
    minHeight: 90,
    marginBottom: 18,
    color: colors.text,
  },
  summary: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    padding: 15,
  },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginVertical: 15,
  },
});