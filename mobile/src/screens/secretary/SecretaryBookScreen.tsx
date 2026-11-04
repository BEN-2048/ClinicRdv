import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useNavigation, useRoute } from '@react-navigation/native';

import { DoctorsApi, StaffApi, StaffAppointment, StaffDoctor } from '../../api/services';
import { Button, Chip, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import { Loading, clinicToday, errorText, formatDateTime, formatLongDate, formatTime, shared } from './shared';

type Patient = { id: number; email: string; first_name: string; last_name: string; phone: string | null };
type Slot = { startsAt: string; endsAt: string; available: boolean };

export default function SecretaryBookScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const existing: StaffAppointment | undefined = route.params?.appointment;
  const isReschedule = !!existing;

  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<StaffDoctor[]>([]);
  const [doctorId, setDoctorId] = useState<number | null>(existing?.doctor_id ?? null);
  const [date, setDate] = useState(clinicToday());
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
      setSlots((res.data as Slot[]).filter((s) => s.available));
    } catch (err) {
      setError(errorText(err, 'Impossible de récupérer les disponibilités.'));
    } finally {
      setLoadingSlots(false);
    }
  }, [doctorId, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

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

  const canSubmit = !!slot && !!doctorId && (isReschedule || !!patient) && !saving;

  return (
    <View style={ui.page}>
      <Header
        title={isReschedule ? 'Reporter' : 'Nouveau rendez-vous'}
        subtitle={isReschedule ? `${existing!.patient_name} · Dr. ${existing!.doctor_name}` : 'Au nom d’un patient'}
      />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        {error && <Text style={shared.error}>{error}</Text>}

        {isReschedule ? (
          <View style={ui.card}>
            <Text style={ui.label}>Rendez-vous actuel</Text>
            <Text style={shared.detail}>{formatDateTime(existing!.starts_at)}</Text>
          </View>
        ) : (
          <>
            <Text style={ui.h2}>1. Patient</Text>
            {patient ? (
              <View style={[ui.card, shared.row]}>
                <View style={{ flex: 1 }}>
                  <Text style={ui.label}>{patient.first_name} {patient.last_name}</Text>
                  <Text style={ui.muted}>{patient.phone || patient.email}</Text>
                </View>
                <Button title="Changer" secondary onPress={() => setPatient(null)} />
              </View>
            ) : (
              <>
                <TextInput
                  style={ui.field}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Nom, e-mail ou téléphone"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                />
                {patients.slice(0, 8).map((p) => (
                  <TouchableOpacity key={p.id} style={ui.card} onPress={() => setPatient(p)}>
                    <Text style={ui.label}>{p.first_name} {p.last_name}</Text>
                    <Text style={ui.muted}>{p.phone || p.email}</Text>
                  </TouchableOpacity>
                ))}
                {patients.length === 0 && <Text style={shared.empty}>Aucun patient trouvé.</Text>}
              </>
            )}

            <Text style={[ui.h2, ui.section]}>2. Médecin</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {doctors.map((d) => (
                <Chip
                  key={d.id}
                  title={`Dr. ${d.last_name} · ${d.specialty}`}
                  active={doctorId === d.id}
                  onPress={() => setDoctorId(d.id)}
                />
              ))}
            </View>
          </>
        )}

        {doctorId && (
          <>
            <Text style={[ui.h2, ui.section]}>{isReschedule ? 'Nouvelle date' : '3. Date et créneau'}</Text>
            <View style={ui.card}>
              <Calendar
                minDate={clinicToday()}
                current={date}
                onDayPress={(d: DateData) => setDate(d.dateString)}
                markedDates={{ [date]: { selected: true, selectedColor: colors.primary } }}
                theme={{ todayTextColor: colors.primary, arrowColor: colors.primary }}
              />
            </View>
            <Text style={[ui.muted, { textTransform: 'capitalize', marginBottom: 10 }]}>{formatLongDate(date)}</Text>
            {loadingSlots && <Loading label="Recherche des disponibilités..." />}
            {!loadingSlots && slots.length === 0 && (
              <View style={ui.card}><Text style={shared.empty}>Aucun créneau disponible ce jour.</Text></View>
            )}
            <View style={styles.grid}>
              {slots.map((sl) => {
                const selected = slot?.startsAt === sl.startsAt;
                return (
                  <TouchableOpacity
                    key={sl.startsAt}
                    onPress={() => setSlot(sl)}
                    style={[styles.slot, selected && styles.slotSelected]}
                  >
                    <Text style={[styles.slotText, selected && { color: '#fff' }]}>{formatTime(sl.startsAt)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {!isReschedule && (
          <TextInput
            style={[ui.field, { minHeight: 70 }]}
            value={reason}
            onChangeText={setReason}
            placeholder="Motif (facultatif)"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        )}

        <Button
          title={saving ? 'Enregistrement...' : isReschedule ? 'Confirmer le report' : 'Créer le rendez-vous'}
          disabled={!canSubmit}
          onPress={submit}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  slot: {
    width: '30%', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#DCE4F0',
    paddingVertical: 14, alignItems: 'center',
  },
  slotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { color: colors.text, fontWeight: '700' },
});
