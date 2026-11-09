import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppointmentsApi, DoctorsApi } from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoRow,
  Input,
  Loader,
  Screen,
  SectionTitle,
  SlotGrid,
  calendarTheme,
} from '../../components/ui';
import { CLINIC_TIME_ZONE } from '../../components/PatientFigmaUI';
import { color, space, type } from '../../theme';

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

const formatLocalTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const formatLongDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export default function SlotPickerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const doctorId = Number(route.params?.doctorId);
  const rescheduleId = route.params?.rescheduleId ? Number(route.params.rescheduleId) : null;

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
    navigation.setOptions({ title: rescheduleId ? 'Reporter le rendez-vous' : 'Choisir un créneau' });
  }, [navigation, rescheduleId]);

  useEffect(() => {
    let active = true;

    const loadDoctor = async () => {
      try {
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
          throw new Error('Identifiant du médecin invalide.');
        }
        const response = await DoctorsApi.get(doctorId);
        if (active) setDoctor(response.data as Doctor);
      } catch (err: any) {
        if (active) {
          setError(err?.response?.data?.error || err?.message || 'Impossible de récupérer le médecin.');
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

  const loadSlots = useCallback(
    async (date: string) => {
      setLoadingSlots(true);
      setSlotError(null);
      setSelectedSlot(null);
      setSlots([]);
      try {
        const response = await DoctorsApi.slots(doctorId, date);
        setSlots(response.data as Slot[]);
      } catch (err: any) {
        setSlotError(err?.response?.data?.error || 'Impossible de récupérer les disponibilités.');
      } finally {
        setLoadingSlots(false);
      }
    },
    [doctorId]
  );

  useEffect(() => {
    if (doctor?.id) loadSlots(selectedDate);
  }, [doctor, selectedDate, loadSlots]);

  const chooseDate = (day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedSlot(null);
  };

  const bookAppointment = async () => {
    if (!selectedSlot || !doctor) return;

    if (!rescheduleId) {
      navigation.navigate('BookingReview', { doctor, slot: selectedSlot, reason: reason.trim() });
      return;
    }

    setBooking(true);
    try {
      await AppointmentsApi.reschedule(rescheduleId, selectedSlot.startsAt);
      Alert.alert(
        'Rendez-vous reporté',
        `Nouveau créneau : ${formatLongDate(selectedDate)} à ${formatLocalTime(selectedSlot.startsAt)}.`
      );
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Report impossible', err?.response?.data?.error || 'Le report a échoué. Veuillez réessayer.');
      await loadSlots(selectedDate);
    } finally {
      setBooking(false);
    }
  };

  if (loadingDoctor) {
    return <Loader fullscreen label="Chargement du médecin..." />;
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
  const availableSlots = slots.filter((slot) => slot.available);
  const unavailableCount = slots.length - availableSlots.length;

  return (
    <Screen
      footer={
        <Button
          title={rescheduleId ? 'Confirmer le nouveau créneau' : 'Continuer vers la confirmation'}
          iconRight={rescheduleId ? undefined : 'arrow-forward'}
          icon={rescheduleId ? 'checkmark' : undefined}
          loading={booking}
          disabled={!selectedSlot || loadingSlots || !doctor.active}
          onPress={bookAppointment}
        />
      }
    >
      <Card style={s.doctor}>
        <Avatar name={fullName} size={56} />
        <View style={s.flex}>
          <Text style={type.h3} numberOfLines={1}>
            Dr. {fullName}
          </Text>
          <Text style={s.specialty}>{doctor.specialty}</Text>
          <Text style={s.muted}>
            {doctor.consultation_minutes} min · {doctor.fee} USD
          </Text>
        </View>
      </Card>

      {!doctor.active ? <ErrorState message="Ce médecin n'est pas disponible." /> : null}

      <SectionTitle title="1. Choisissez une date" />
      <Card padded={false} style={s.calendar}>
        <Calendar
          minDate={formatDate(new Date())}
          maxDate={formatDate(new Date(Date.now() + 13 * 86400000))}
          current={selectedDate}
          onDayPress={chooseDate}
          markedDates={{ [selectedDate]: { selected: true, selectedColor: color.primary } }}
          enableSwipeMonths={false}
          theme={calendarTheme}
        />
      </Card>

      <SectionTitle title="2. Choisissez un créneau" />
      <Text style={s.dateLabel}>{formatLongDate(selectedDate)}</Text>

      {loadingSlots ? <Loader label="Recherche des disponibilités..." /> : null}
      {slotError ? <ErrorState message={slotError} onRetry={() => loadSlots(selectedDate)} /> : null}

      {!loadingSlots && !slotError && availableSlots.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-clear-outline"
            title="Aucun créneau disponible"
            message="Essayez une autre date ou activez une alerte désistement."
          />
        </Card>
      ) : null}

      {!loadingSlots && availableSlots.length > 0 ? (
        <SlotGrid
          items={availableSlots.map((slot) => ({ key: slot.startsAt, label: formatLocalTime(slot.startsAt) }))}
          selectedKey={selectedSlot?.startsAt}
          onSelect={(key) => setSelectedSlot(availableSlots.find((slot) => slot.startsAt === key) ?? null)}
        />
      ) : null}

      {!loadingSlots && unavailableCount > 0 ? (
        <Text style={s.muted}>
          {unavailableCount} créneau{unavailableCount > 1 ? 'x' : ''} déjà réservé{unavailableCount > 1 ? 's' : ''}.
        </Text>
      ) : null}

      {!rescheduleId ? (
        <>
          <SectionTitle title="3. Motif de consultation" />
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="Décrivez brièvement le motif (facultatif)"
            multiline
            maxLength={500}
          />
        </>
      ) : null}

      <Card style={s.summary}>
        <Text style={type.h2}>Récapitulatif</Text>
        <InfoRow icon="person-outline" label="Médecin" value={`Dr. ${fullName}`} strong />
        <InfoRow icon="calendar-outline" label="Date" value={formatLongDate(selectedDate)} />
        <InfoRow
          icon="time-outline"
          label="Heure"
          value={selectedSlot ? formatLocalTime(selectedSlot.startsAt) : 'Non sélectionnée'}
          strong={!!selectedSlot}
        />
        <InfoRow icon="cash-outline" label="Tarif" value={`${doctor.fee} USD`} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  doctor: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  specialty: { ...type.bodyMedium, color: color.primary, marginTop: 2 },
  muted: { ...type.caption, color: color.textMuted, marginTop: 2 },
  calendar: { overflow: 'hidden', paddingVertical: space.xs },
  dateLabel: { ...type.body, color: color.textSecondary, textTransform: 'capitalize', marginTop: -space.xs },
  summary: { gap: space.md },
});
