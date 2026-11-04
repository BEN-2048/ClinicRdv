import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { StaffApi, WorkingHour } from '../../api/services';
import { Button, Chip, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import { ErrorCard, Loading, WEEKDAYS, errorText, formatLongDate, shared } from './shared';

type Leave = { id: number; startDate: string; endDate: string; reason: string | null };

const DURATIONS = [15, 30, 45, 60];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function SecretaryDoctorScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const doctorId = Number(route.params?.doctorId);
  const name: string = route.params?.name ?? 'Médecin';

  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [minutes, setMinutes] = useState(30);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wh, lv] = await Promise.all([StaffApi.workingHours(doctorId), StaffApi.leaves(doctorId)]);
      setHours(wh.data.hours as WorkingHour[]);
      setMinutes(wh.data.consultationMinutes);
      setLeaves(lv.data as Leave[]);
    } catch (err) {
      setError(errorText(err, 'Impossible de charger les horaires.'));
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    navigation.setOptions({ title: `Horaires · ${name}` });
    load();
  }, [navigation, name, load]);

  const updateHour = (index: number, key: 'startTime' | 'endTime', value: string) =>
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, [key]: value } : h)));

  const addRange = (weekday: number) =>
    setHours((prev) => [...prev, { weekday, startTime: '08:00', endTime: '12:00' }]);

  const removeRange = (index: number) => setHours((prev) => prev.filter((_, i) => i !== index));

  const saveHours = async () => {
    const invalid = hours.find((h) => !TIME_RE.test(h.startTime) || !TIME_RE.test(h.endTime) || h.endTime <= h.startTime);
    if (invalid) {
      Alert.alert('Horaire invalide', `${WEEKDAYS[invalid.weekday]} : format HH:MM et fin après le début.`);
      return;
    }
    setSaving(true);
    try {
      const res = await StaffApi.setWorkingHours(doctorId, hours, minutes);
      setHours(res.data.hours as WorkingHour[]);
      Alert.alert('Horaires enregistrés', 'Les créneaux proposés aux patients sont mis à jour.');
    } catch (err) {
      Alert.alert('Erreur', errorText(err, "L'enregistrement a échoué."));
    } finally {
      setSaving(false);
    }
  };

  const addLeave = async () => {
    if (!DATE_RE.test(leaveStart) || !DATE_RE.test(leaveEnd) || leaveEnd < leaveStart) {
      Alert.alert('Dates invalides', 'Format AAAA-MM-JJ, la fin doit suivre le début.');
      return;
    }
    try {
      await StaffApi.addLeave(doctorId, leaveStart, leaveEnd, leaveReason.trim());
      setLeaveStart('');
      setLeaveEnd('');
      setLeaveReason('');
      const lv = await StaffApi.leaves(doctorId);
      setLeaves(lv.data as Leave[]);
    } catch (err) {
      Alert.alert('Erreur', errorText(err, "L'ajout du congé a échoué."));
    }
  };

  const deleteLeave = (leave: Leave) =>
    Alert.alert('Supprimer le congé', `Du ${leave.startDate} au ${leave.endDate} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await StaffApi.deleteLeave(doctorId, leave.id);
            setLeaves((prev) => prev.filter((l) => l.id !== leave.id));
          } catch (err) {
            Alert.alert('Erreur', errorText(err, 'La suppression a échoué.'));
          }
        },
      },
    ]);

  if (loading) return <View style={ui.page}><Loading label="Chargement des horaires..." /></View>;

  return (
    <View style={ui.page}>
      <Header title={name} subtitle="Horaires et congés" />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        {error && <ErrorCard message={error} onRetry={load} />}

        <Text style={ui.h2}>Durée de consultation</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {DURATIONS.map((m) => (
            <Chip key={m} title={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </View>

        <Text style={[ui.h2, ui.section]}>Horaires hebdomadaires</Text>
        {DAY_ORDER.map((weekday) => {
          const ranges = hours.map((h, index) => ({ h, index })).filter(({ h }) => h.weekday === weekday);
          return (
            <View key={weekday} style={ui.card}>
              <View style={shared.row}>
                <Text style={ui.label}>{WEEKDAYS[weekday]}</Text>
                <TouchableOpacity onPress={() => addRange(weekday)}>
                  <Text style={styles.link}>+ Plage</Text>
                </TouchableOpacity>
              </View>
              {ranges.length === 0 && <Text style={[ui.muted, { marginTop: 6 }]}>Fermé</Text>}
              {ranges.map(({ h, index }) => (
                <View key={index} style={[ui.line, { marginTop: 8 }]}>
                  <TextInput
                    style={styles.time}
                    value={h.startTime}
                    onChangeText={(v) => updateHour(index, 'startTime', v)}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Text style={ui.muted}>à</Text>
                  <TextInput
                    style={styles.time}
                    value={h.endTime}
                    onChangeText={(v) => updateHour(index, 'endTime', v)}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                  <TouchableOpacity onPress={() => removeRange(index)}>
                    <Text style={styles.remove}>Retirer</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })}
        <Button title={saving ? 'Enregistrement...' : 'Enregistrer les horaires'} disabled={saving} onPress={saveHours} />

        <Text style={[ui.h2, ui.section]}>Congés</Text>
        {leaves.length === 0 && <View style={ui.card}><Text style={shared.empty}>Aucun congé enregistré.</Text></View>}
        {leaves.map((l) => (
          <View key={l.id} style={[ui.card, shared.row]}>
            <View style={{ flex: 1 }}>
              <Text style={[ui.label, { textTransform: 'capitalize' }]}>
                {l.startDate === l.endDate ? formatLongDate(l.startDate) : `${l.startDate} → ${l.endDate}`}
              </Text>
              {l.reason ? <Text style={ui.muted}>{l.reason}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => deleteLeave(l)}>
              <Text style={styles.remove}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={ui.card}>
          <Text style={[ui.label, { marginBottom: 8 }]}>Ajouter un congé</Text>
          <TextInput style={ui.field} value={leaveStart} onChangeText={setLeaveStart} placeholder="Début AAAA-MM-JJ" placeholderTextColor={colors.muted} maxLength={10} />
          <TextInput style={ui.field} value={leaveEnd} onChangeText={setLeaveEnd} placeholder="Fin AAAA-MM-JJ" placeholderTextColor={colors.muted} maxLength={10} />
          <TextInput style={ui.field} value={leaveReason} onChangeText={setLeaveReason} placeholder="Motif (facultatif)" placeholderTextColor={colors.muted} maxLength={255} />
          <Button title="Ajouter le congé" secondary onPress={addLeave} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  time: {
    backgroundColor: '#F1F5FD', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    color: colors.text, width: 80, textAlign: 'center', fontWeight: '700',
  },
  link: { color: colors.primary, fontWeight: '800' },
  remove: { color: colors.error, fontWeight: '700', marginLeft: 'auto' },
});
