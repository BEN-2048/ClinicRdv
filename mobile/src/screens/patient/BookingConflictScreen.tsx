import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { DoctorFacility, DoctorsApi } from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  Icon,
  ListItem,
  Loader,
  Notice,
  Screen,
  SectionTitle,
  SlotGrid,
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
};

type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  facilityId?: number;
  timezone?: string;
};

type DayAvailability = {
  date: string;
  slots: Slot[];
};

const clinicDate = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (date: string, amount: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
};

const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
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

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const dayTitle = (date: string, timeZone: string) => {
  const today = clinicDate(new Date(), timeZone);
  if (date === today) return `Aujourd'hui — ${formatDay(date)}`;
  if (date === addDays(today, 1)) return `Demain — ${formatDay(date)}`;
  return capitalize(formatDay(date));
};

export default function BookingConflictScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const doctor = route.params?.doctor as Doctor | undefined;
  const originalSlot = route.params?.slot as Slot | undefined;
  const reason = route.params?.reason || '';
  const profileId = route.params?.profileId as number | undefined;
  const facility = route.params?.facility as DoctorFacility | undefined;
  const facilityId = originalSlot?.facilityId ?? facility?.id;
  const timeZone = originalSlot?.timezone ?? facility?.timezone ?? CLINIC_TIME_ZONE;

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
      const startDate = clinicDate(new Date(originalSlot.startsAt), timeZone);
      const dates = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));

      const results = await Promise.all(
        dates.map(async (date) => {
          try {
            const response = await DoctorsApi.slots(doctor.id, date, facilityId);
            const available = (response.data as Slot[])
              .filter((slot) => slot.available && slot.startsAt !== originalSlot.startsAt)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            return { date, slots: available };
          } catch {
            return { date, slots: [] };
          }
        })
      );

      const withAvailability = results.filter((day) => day.slots.length > 0);
      setDays(withAvailability);

      if (withAvailability.length === 0) {
        setError('Aucun créneau alternatif disponible pour ce médecin sur les sept prochains jours.');
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
      <Screen>
        <ErrorState message="Les informations du rendez-vous sont indisponibles." />
        <Button title="Retour" variant="secondary" icon="arrow-back" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const fullName = `${doctor.first_name} ${doctor.last_name}`.trim();
  const originalDate = clinicDate(new Date(originalSlot.startsAt), timeZone);

  const selectAlternative = () => {
    if (!selectedSlot) return;
    navigation.replace('BookingReview', { doctor, slot: selectedSlot, reason, profileId, facility });
  };

  const goToDoctors = () => navigation.navigate('Main', { screen: 'Médecins' });

  return (
    <Screen
      footer={
        <View style={s.footer}>
          <Button
            title={selectedSlot ? `Sélectionner ${formatTime(selectedSlot.startsAt, timeZone)}` : 'Sélectionner un créneau'}
            iconRight="arrow-forward"
            disabled={!selectedSlot}
            onPress={selectAlternative}
          />
          <Button title="Retourner à la recherche" icon="search" variant="ghost" onPress={goToDoctors} />
        </View>
      }
    >
      <Notice
        tone="warning"
        icon="sync-outline"
        title="Ce créneau vient d'être réservé"
        message={`Un autre patient a réservé le créneau du ${formatDay(originalDate)} à ${formatTime(
          originalSlot.startsAt,
          timeZone
        )} pendant votre sélection.`}
      />

      <Card style={s.doctor}>
        <Avatar name={fullName} size={48} />
        <View style={s.flex}>
          <View style={s.nameRow}>
            <Text style={[type.h3, s.shrink]} numberOfLines={1}>
              {doctorName(fullName)}
            </Text>
            <Icon name="checkmark-circle" size="sm" color={color.primaryBright} />
          </View>
          <Text style={s.specialty}>{doctor.specialty}</Text>
          <View style={s.addressRow}>
            <Icon name="location-outline" size={14} color={color.textMuted} />
            <Text style={s.muted}>Cabinet médical</Text>
          </View>
        </View>
      </Card>

      <SectionTitle title="Créneaux alternatifs" />

      {!loading && days.length > 0 ? (
        <Notice
          icon="sparkles-outline"
          title="Option suggérée · même praticien"
          message="Choisissez l'un des prochains créneaux disponibles ci-dessous pour poursuivre votre réservation."
        />
      ) : null}

      {loading ? <Loader label="Recherche des disponibilités..." /> : null}

      {!loading && error ? (
        <Card>
          <ErrorState message={error} onRetry={loadAlternatives} />
        </Card>
      ) : null}

      {!loading
        ? days.map((day) => (
            <View key={day.date} style={s.day}>
              <View style={s.dayHead}>
                <Icon name="calendar-outline" size="sm" color={color.primary} />
                <Text style={s.dayTitle}>{dayTitle(day.date, timeZone)}</Text>
              </View>
              <SlotGrid
                items={day.slots.map((slot, slotIndex) => {
                  const time = formatTime(slot.startsAt, timeZone);
                  return {
                    key: slot.startsAt,
                    label: time,
                    sublabel: slotIndex === 0 ? 'Suggéré' : time < '12:00' ? 'Matin' : 'Après-midi',
                  };
                })}
                selectedKey={selectedSlot?.startsAt}
                onSelect={(key) => setSelectedSlot(day.slots.find((slot) => slot.startsAt === key) ?? null)}
              />
            </View>
          ))
        : null}

      <SectionTitle title="Autres solutions" />

      <Card style={s.list}>
        <ListItem
          icon="people-outline"
          title="Consulter un autre médecin"
          subtitle="Trouvez un autre praticien disponible dans l'annuaire"
          onPress={goToDoctors}
        />
        <ListItem
          icon="calendar-outline"
          title="Planning complet"
          subtitle={`Ouvrir l'agenda du ${doctorName(fullName)}`}
          onPress={() => navigation.goBack()}
          style={s.divider}
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  doctor: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  specialty: { ...type.bodyMedium, color: color.success, marginTop: 2 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: 2 },
  muted: { ...type.caption, color: color.textMuted },
  day: { gap: space.xs },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  dayTitle: { ...type.label, color: color.text },
  list: { paddingVertical: space.xxs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  footer: { gap: space.xxs },
});
