import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useNavigation, useRoute } from '@react-navigation/native';
import { DoctorsApi, StaffApi, StaffAppointment, StaffDoctor } from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  InfoRow,
  Input,
  ListItem,
  Notice,
  Screen,
  SectionTitle,
  SlotGrid,
  calendarTheme,
} from '../../components/ui';
import { color, space, type } from '../../theme';
import { Loading, clinicDate, clinicToday, errorText, formatDateTime, formatLongDate, formatTime, shared } from './shared';

type Patient = { id: number; email: string; first_name: string; last_name: string; phone: string | null };
type Slot = { startsAt: string; endsAt: string; available: boolean };

export default function SecretaryBookScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const existing: StaffAppointment | undefined = route.params?.appointment;
  const isReschedule = !!existing;
  const prefill: { doctorId: number; startsAt: string } | undefined = existing ? undefined : route.params?.prefill;

  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<StaffDoctor[]>([]);
  const [doctorId, setDoctorId] = useState<number | null>(existing?.doctor_id ?? prefill?.doctorId ?? null);
  const [date, setDate] = useState(prefill ? clinicDate(prefill.startsAt) : clinicToday());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: isReschedule ? 'Reporter le rendez-vous' : 'Nouveau rendez-vous' });
    if (!isReschedule)
      StaffApi.doctors()
        .then((res) => setDoctors(res.data.filter((d) => d.active)))
        .catch((err) => setError(errorText(err, 'Impossible de charger les médecins.')));
  }, [navigation, isReschedule]);

  useEffect(() => {
    if (isReschedule || patient) return;
    const t = setTimeout(() => {
      StaffApi.patients(query.trim())
        .then((res) => setPatients(res.data as Patient[]))
        .catch(() => setPatients([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, patient, isReschedule]);

  const loadSlots = useCallback(async () => {
    if (!doctorId) return;
    setLoadingSlots(true);
    setSlot(null);
    setSlots([]);
    try {
      const res = await DoctorsApi.slots(doctorId, date);
      const available = (res.data as Slot[]).filter((sl) => sl.available);
      setSlots(available);
      if (prefill) {
        const target = new Date(prefill.startsAt).getTime();
        const match = available.find((sl) => new Date(sl.startsAt).getTime() === target);
        if (match) setSlot(match);
      }
    } catch (err) {
      setError(errorText(err, 'Impossible de récupérer les disponibilités.'));
    } finally {
      setLoadingSlots(false);
    }
  }, [doctorId, date, prefill?.startsAt]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const submit = async () => {
    if (!slot || !doctorId) return;
    setSaving(true);
    try {
      if (existing) {
        await StaffApi.reschedule(existing.id, slot.startsAt);
        Alert.alert('Rendez-vous reporté', `Nouveau créneau : ${formatDateTime(slot.startsAt)}`);
      } else if (patient) {
        await StaffApi.book(patient.id, doctorId, slot.startsAt, reason.trim());
        Alert.alert('Rendez-vous créé', `${patient.first_name} ${patient.last_name} · ${formatDateTime(slot.startsAt)}`);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Opération impossible', errorText(err, "L'enregistrement a échoué."));
      loadSlots();
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!slot && !!doctorId && (isReschedule || !!patient);

  return (
    <Screen
      footer={
        <Button
          title={isReschedule ? 'Confirmer le report' : 'Créer le rendez-vous'}
          icon="checkmark"
          loading={saving}
          disabled={!canSubmit}
          onPress={submit}
        />
      }
    >
      {error ? <Notice tone="danger" message={error} /> : null}

      {isReschedule ? (
        <Card style={shared.card}>
          <Text style={type.h2}>Rendez-vous actuel</Text>
          <InfoRow icon="person-outline" label="Patient" value={existing!.patient_name} strong />
          <InfoRow icon="medkit-outline" label="Médecin" value={`Dr. ${existing!.doctor_name}`} />
          <InfoRow icon="time-outline" label="Créneau actuel" value={formatDateTime(existing!.starts_at)} />
        </Card>
      ) : (
        <>
          <SectionTitle title="1. Patient" />
          {patient ? (
            <Card style={s.selected}>
              <Avatar name={`${patient.first_name} ${patient.last_name}`} size={44} />
              <View style={shared.flex}>
                <Text style={type.bodyMedium}>
                  {patient.first_name} {patient.last_name}
                </Text>
                <Text style={shared.muted}>{patient.phone || patient.email}</Text>
              </View>
              <Button title="Changer" size="sm" variant="secondary" fullWidth={false} onPress={() => setPatient(null)} />
            </Card>
          ) : (
            <>
              <Input
                icon="search"
                value={query}
                onChangeText={setQuery}
                placeholder="Nom, e-mail ou téléphone"
                autoCapitalize="none"
              />
              {patients.length === 0 ? (
                <EmptyState icon="person-outline" title="Aucun patient trouvé" />
              ) : (
                <Card style={s.list}>
                  {patients.slice(0, 8).map((p, i) => (
                    <ListItem
                      key={p.id}
                      title={`${p.first_name} ${p.last_name}`}
                      subtitle={p.phone || p.email}
                      left={<Avatar name={`${p.first_name} ${p.last_name}`} size={40} />}
                      onPress={() => setPatient(p)}
                      style={i > 0 ? s.divider : undefined}
                    />
                  ))}
                </Card>
              )}
            </>
          )}

          <SectionTitle title="2. Médecin" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipsWrap}
            contentContainerStyle={s.chips}
          >
            {doctors.map((d) => (
              <Chip
                key={d.id}
                label={`Dr. ${d.last_name} · ${d.specialty}`}
                selected={doctorId === d.id}
                onPress={() => setDoctorId(d.id)}
              />
            ))}
          </ScrollView>
        </>
      )}

      {doctorId ? (
        <>
          <SectionTitle title={isReschedule ? 'Nouvelle date' : '3. Date et créneau'} />
          <Card padded={false} style={s.calendar}>
            <Calendar
              minDate={clinicToday()}
              current={date}
              onDayPress={(d: DateData) => setDate(d.dateString)}
              markedDates={{ [date]: { selected: true, selectedColor: color.primary } }}
              theme={calendarTheme}
            />
          </Card>
          <Text style={s.dateLabel}>{formatLongDate(date)}</Text>
          {loadingSlots ? <Loading label="Recherche des disponibilités..." /> : null}
          {!loadingSlots && slots.length === 0 ? (
            <Card>
              <EmptyState icon="calendar-clear-outline" title="Aucun créneau disponible ce jour" />
            </Card>
          ) : null}
          <SlotGrid
            items={slots.map((sl) => ({ key: sl.startsAt, label: formatTime(sl.startsAt) }))}
            selectedKey={slot?.startsAt}
            onSelect={(key) => setSlot(slots.find((sl) => sl.startsAt === key) ?? null)}
          />
        </>
      ) : null}

      {!isReschedule ? (
        <Input
          label="Motif (facultatif)"
          value={reason}
          onChangeText={setReason}
          placeholder="Motif de la consultation"
          multiline
          maxLength={500}
        />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  selected: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  list: { paddingVertical: space.xxs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  chipsWrap: { marginHorizontal: -space.md },
  chips: { gap: space.xs, paddingHorizontal: space.md },
  calendar: { overflow: 'hidden', paddingVertical: space.xs },
  dateLabel: { ...type.body, color: color.textSecondary, textTransform: 'capitalize', marginTop: -space.xs },
});
