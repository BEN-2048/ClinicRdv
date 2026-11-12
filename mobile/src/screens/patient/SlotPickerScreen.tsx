import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppointmentsApi, DoctorFacility, DoctorsApi } from '../../api/services';
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
import { doctorName } from '../../utils/doctorName';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
  languages: string | null;
  active: boolean;
  facilities?: DoctorFacility[];
};

type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  facilityId?: number;
  timezone?: string;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatLocalTime = (iso: string, timeZone: string = CLINIC_TIME_ZONE) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
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
  const facilityId = route.params?.facilityId ? Number(route.params.facilityId) : undefined;

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

  const facility =
    doctor?.facilities?.find((f) => f.id === facilityId) ??
    (doctor?.facilities?.length === 1 ? doctor.facilities[0] : undefined);
  const timeZone = selectedSlot?.timezone ?? slots[0]?.timezone ?? facility?.timezone ?? CLINIC_TIME_ZONE;

  const loadSlots = useCallback(
    async (date: string) => {
      setLoadingSlots(true);
      setSlotError(null);
      setSelectedSlot(null);
      setSlots([]);
      try {
        const response = await DoctorsApi.slots(doctorId, date, facilityId);
        setSlots(response.data as Slot[]);
      } catch (err: any) {
        setSlotError(err?.response?.data?.error || 'Impossible de récupérer les disponibilités.');
      } finally {
        setLoadingSlots(false);
      }
    },
    [doctorId, facilityId]
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
      const slotFacility =
        doctor.facilities?.find((f) => f.id === selectedSlot.facilityId) ?? facility;
      navigation.navigate('BookingReview', {
        doctor,
        slot: selectedSlot,
        reason: reason.trim(),
        facility: slotFacility,
      });
      return;
    }

    setBooking(true);
    try {
      await AppointmentsApi.reschedule(rescheduleId, selectedSlot.startsAt);
      Alert.alert(
        'Rendez-vous reporté',
        `Nouveau créneau : ${formatLongDate(selectedDate)} à ${formatLocalTime(selectedSlot.startsAt, timeZone)}.`
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
        <Button title="Retour" variant="secondary" icon="arrow-left" onPress={() => navigation.goBack()} />
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
          iconRight={rescheduleId ? undefined : 'arrow-right'}
          icon={rescheduleId ? 'check' : undefined}
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
            {doctorName(fullName)}
          </Text>
          <Text style={s.specialty}>{doctor.specialty}</Text>
          <Text style={s.muted}>
            {doctor.consultation_minutes} min · {facility?.fee ?? doctor.fee} USD
          </Text>
          {facility ? <Text style={s.muted}>{[facility.name, facility.city].filter(Boolean).join(' · ')}</Text> : null}
        </View>
      </Card>

      {!doctor.active ? <ErrorState message="Ce médecin n'est pas disponible." /> : null}

      <SectionTitle title="1. Choisissez une date" />
      <Card padded={false} style={s.calendar}>
        <Calendar
          firstDay={1}
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
            icon="calendar-days"
            title="Aucun créneau disponible"
            message="Essayez une autre date ou activez une alerte désistement."
          />
          <Button
            title="Voir d’autres médecins disponibles"
            icon="right-left"
            variant="secondary"
            onPress={() =>
              navigation.navigate(
                'Alternatives',
                rescheduleId ? { appointmentId: rescheduleId } : { doctorId, facilityId }
              )
            }
          />
        </Card>
      ) : null}

      {!loadingSlots && availableSlots.length > 0 ? (
        <SlotGrid
          items={availableSlots.map((slot) => ({ key: slot.startsAt, label: formatLocalTime(slot.startsAt, timeZone) }))}
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
        <InfoRow icon="user" label="Médecin" value={doctorName(fullName)} strong />
        <InfoRow icon="calendar" label="Date" value={formatLongDate(selectedDate)} />
        <InfoRow
          icon="clock"
          label="Heure"
          value={selectedSlot ? formatLocalTime(selectedSlot.startsAt, timeZone) : 'Non sélectionnée'}
          strong={!!selectedSlot}
        />
        <InfoRow icon="money-bill-1" label="Tarif" value={`${doctor.fee} USD`} />
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
