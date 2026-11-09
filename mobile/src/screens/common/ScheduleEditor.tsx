import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { WorkingHour } from '../../api/services';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Input,
  ListItem,
  Loader,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { color, fonts, radius, space, type } from '../../theme';
import { ErrorCard, WEEKDAYS, Wrap, errorText, formatLongDate, shared } from '../secretary/shared';

const DURATIONS = [15, 30, 45, 60];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Leave = { id: number; startDate: string; endDate: string; reason: string | null };

export type ScheduleApi = {
  workingHours: () => Promise<{ data: any }>;
  setWorkingHours: (hours: WorkingHour[], consultationMinutes: number) => Promise<{ data: any }>;
  leaves: () => Promise<{ data: any }>;
  addLeave: (startDate: string, endDate: string, reason?: string) => Promise<unknown>;
  deleteLeave: (leaveId: number) => Promise<unknown>;
};

export default function ScheduleEditor({ api, header }: { api: ScheduleApi; header?: React.ReactNode }) {

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
      const [wh, lv] = await Promise.all([api.workingHours(), api.leaves()]);
      setHours(wh.data.hours as WorkingHour[]);
      setMinutes(wh.data.consultationMinutes);
      setLeaves(lv.data as Leave[]);
    } catch (err) {
      setError(errorText(err, 'Impossible de charger les horaires.'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const updateHour = (index: number, key: 'startTime' | 'endTime', value: string) =>
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, [key]: value } : h)));

  const addRange = (weekday: number) =>
    setHours((prev) => [...prev, { weekday, startTime: '08:00', endTime: '12:00' }]);

  const removeRange = (index: number) => setHours((prev) => prev.filter((_, i) => i !== index));

  const saveHours = async () => {
    const invalid = hours.find(
      (h) => !TIME_RE.test(h.startTime) || !TIME_RE.test(h.endTime) || h.endTime <= h.startTime
    );
    if (invalid) {
      Alert.alert('Horaire invalide', `${WEEKDAYS[invalid.weekday]} : format HH:MM et fin après le début.`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.setWorkingHours(hours, minutes);
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
      await api.addLeave(leaveStart, leaveEnd, leaveReason.trim());
      setLeaveStart('');
      setLeaveEnd('');
      setLeaveReason('');
      const lv = await api.leaves();
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
            await api.deleteLeave(leave.id);
            setLeaves((prev) => prev.filter((l) => l.id !== leave.id));
          } catch (err) {
            Alert.alert('Erreur', errorText(err, 'La suppression a échoué.'));
          }
        },
      },
    ]);

  if (loading) return <Loader fullscreen label="Chargement des horaires..." />;

  return (
    <Screen header={header}>
      {error ? <ErrorCard message={error} onRetry={load} /> : null}

      <SectionTitle title="Durée de consultation" />
      <Wrap>
        {DURATIONS.map((m) => (
          <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
        ))}
      </Wrap>

      <SectionTitle title="Horaires hebdomadaires" />
      <Card style={s.week}>
        {DAY_ORDER.map((weekday, dayIndex) => {
          const ranges = hours.map((h, index) => ({ h, index })).filter(({ h }) => h.weekday === weekday);
          return (
            <View key={weekday} style={[s.day, dayIndex > 0 && s.divider]}>
              <View style={shared.row}>
                <Text style={type.bodyMedium}>{WEEKDAYS[weekday]}</Text>
                <Button
                  title="Plage"
                  icon="add"
                  size="sm"
                  variant="ghost"
                  fullWidth={false}
                  onPress={() => addRange(weekday)}
                />
              </View>
              {ranges.length === 0 ? <Text style={shared.muted}>Fermé</Text> : null}
              {ranges.map(({ h, index }) => (
                <View key={index} style={s.range}>
                  <TextInput
                    style={s.time}
                    value={h.startTime}
                    onChangeText={(v) => updateHour(index, 'startTime', v)}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Text style={shared.muted}>à</Text>
                  <TextInput
                    style={s.time}
                    value={h.endTime}
                    onChangeText={(v) => updateHour(index, 'endTime', v)}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                  <View style={shared.flex} />
                  <IconButton
                    icon="trash-outline"
                    variant="plain"
                    iconColor={color.dangerInk}
                    accessibilityLabel="Retirer la plage"
                    onPress={() => removeRange(index)}
                  />
                </View>
              ))}
            </View>
          );
        })}
      </Card>
      <Button title="Enregistrer les horaires" icon="save-outline" loading={saving} onPress={saveHours} />

      <SectionTitle title="Congés" />
      {leaves.length === 0 ? (
        <Card>
          <EmptyState icon="airplane-outline" title="Aucun congé enregistré" />
        </Card>
      ) : (
        <Card style={s.list}>
          {leaves.map((l, i) => (
            <ListItem
              key={l.id}
              icon="airplane-outline"
              title={l.startDate === l.endDate ? formatLongDate(l.startDate) : `${l.startDate} → ${l.endDate}`}
              subtitle={l.reason}
              chevron={false}
              style={i > 0 ? s.divider : undefined}
              right={
                <IconButton
                  icon="trash-outline"
                  variant="plain"
                  iconColor={color.dangerInk}
                  accessibilityLabel="Supprimer le congé"
                  onPress={() => deleteLeave(l)}
                />
              }
            />
          ))}
        </Card>
      )}

      <Card style={shared.card}>
        <Text style={type.h2}>Ajouter un congé</Text>
        <View style={shared.actions}>
          <View style={shared.action}>
            <Input label="Début" value={leaveStart} onChangeText={setLeaveStart} placeholder="AAAA-MM-JJ" maxLength={10} />
          </View>
          <View style={shared.action}>
            <Input label="Fin" value={leaveEnd} onChangeText={setLeaveEnd} placeholder="AAAA-MM-JJ" maxLength={10} />
          </View>
        </View>
        <Input label="Motif (facultatif)" value={leaveReason} onChangeText={setLeaveReason} maxLength={255} />
        <Button title="Ajouter le congé" icon="add" variant="secondary" onPress={addLeave} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  week: { paddingVertical: space.xxs },
  day: { gap: space.xs, paddingVertical: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  range: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  time: {
    ...type.bodyMedium,
    fontFamily: fonts.semibold,
    width: 80,
    height: 44,
    textAlign: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  list: { paddingVertical: space.xxs },
});
