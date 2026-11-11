import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppointmentStatus, StaffApi, StaffAppointment } from '../../api/services';
import {
  AppHeader,
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  InfoRow,
  Screen,
} from '../../components/ui';
import { color, space, type } from '../../theme';
import {
  ErrorCard,
  Loading,
  STATUS_LABELS,
  StatusBadge,
  Wrap,
  clinicToday,
  errorText,
  formatDateTime,
  formatLongDate,
  formatTime,
  shared,
  shiftDate,
} from './shared';
import { doctorName } from '../../utils/doctorName';

const STATUSES: AppointmentStatus[] = ['confirmed', 'pending', 'cancelled', 'done'];

export default function SecretaryAppointmentsScreen() {
  const navigation = useNavigation<any>();
  const [date, setDate] = useState<string | null>(clinicToday());
  const [status, setStatus] = useState<AppointmentStatus | null>(null);
  const [items, setItems] = useState<StaffAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await StaffApi.appointments({ date: date ?? undefined, status: status ?? undefined });
        setItems(res.data);
      } catch (err) {
        setError(errorText(err, 'Impossible de charger les rendez-vous.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date, status]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cancel = (a: StaffAppointment) =>
    Alert.alert(
      'Annuler le rendez-vous',
      `Annuler le RDV de ${a.patient_name} avec ${doctorName(a.doctor_name)} ? Le patient sera prévenu avec le motif choisi.`,
      [
        { text: 'Non', style: 'cancel' },
        ...(['doctor_unavailable', 'other'] as const).map((reason) => ({
          text: reason === 'doctor_unavailable' ? 'Médecin indisponible' : 'Autre motif',
          style: 'destructive' as const,
          onPress: async () => {
            try {
              await StaffApi.cancel(a.id, { reason });
              load();
            } catch (err) {
              Alert.alert('Erreur', errorText(err, "L'annulation a échoué."));
            }
          },
        })),
      ]
    );

  const active = (a: StaffAppointment) => a.status === 'pending' || a.status === 'confirmed';
  const today = clinicToday();

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => load(true)}
      header={
        <AppHeader title="Rendez-vous du cabinet" subtitle="Tous les médecins" />
      }
    >
      <Button title="Nouveau rendez-vous" icon="add" onPress={() => navigation.navigate('SecretaryBook')} />

      <Card padded={false} style={s.dateNav}>
        <IconButton
          icon="chevron-back"
          variant="plain"
          accessibilityLabel="Jour précédent"
          disabled={!date}
          onPress={() => date && setDate(shiftDate(date, -1))}
        />
        <Pressable accessibilityRole="button" onPress={() => setDate(today)} style={shared.flex}>
          <Text style={s.dateTitle}>{date ? formatLongDate(date) : 'Toutes les dates'}</Text>
        </Pressable>
        <IconButton
          icon="chevron-forward"
          variant="plain"
          accessibilityLabel="Jour suivant"
          disabled={!date}
          onPress={() => date && setDate(shiftDate(date, 1))}
        />
      </Card>

      <Wrap>
        <Chip label="Aujourd'hui" icon="today-outline" selected={date === today} onPress={() => setDate(today)} />
        <Chip label="Toutes les dates" selected={date === null} onPress={() => setDate(null)} />
      </Wrap>
      <Wrap>
        <Chip label="Tous statuts" selected={status === null} onPress={() => setStatus(null)} />
        {STATUSES.map((st) => (
          <Chip key={st} label={STATUS_LABELS[st]} selected={status === st} onPress={() => setStatus(st)} />
        ))}
      </Wrap>

      {loading ? <Loading label="Chargement des rendez-vous..." /> : null}
      {error ? <ErrorCard message={error} onRetry={() => load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <Card>
          <EmptyState icon="calendar-clear-outline" title="Aucun rendez-vous" message="Aucun rendez-vous pour ces critères." />
        </Card>
      ) : null}

      {!loading && !error
        ? items.map((a) => (
            <Card key={a.id} style={shared.card}>
              <View style={shared.row}>
                <View style={shared.flex}>
                  <Text style={shared.title} numberOfLines={1}>
                    {a.patient_name}
                  </Text>
                  {a.patient_phone ? <Text style={shared.muted}>{a.patient_phone}</Text> : null}
                </View>
                <StatusBadge status={a.status} />
              </View>
              <InfoRow icon="person-outline" label="Médecin" value={`${doctorName(a.doctor_name)} · ${a.specialty}`} />
              <InfoRow
                icon="time-outline"
                label="Horaire"
                value={`${date ? formatTime(a.starts_at) : formatDateTime(a.starts_at)} – ${formatTime(a.ends_at)}`}
                strong
              />
              {a.reason ? <InfoRow icon="document-text-outline" label="Motif" value={a.reason} /> : null}
              {active(a) ? (
                <View style={shared.actions}>
                  <Button
                    title="Reporter"
                    icon="repeat"
                    size="sm"
                    variant="secondary"
                    style={shared.action}
                    onPress={() => navigation.navigate('SecretaryBook', { appointment: a })}
                  />
                  <Button
                    title="Annuler"
                    icon="close-circle-outline"
                    size="sm"
                    variant="danger"
                    style={shared.action}
                    onPress={() => cancel(a)}
                  />
                </View>
              ) : null}
            </Card>
          ))
        : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  dateNav: { flexDirection: 'row', alignItems: 'center', padding: space.xxs },
  dateTitle: { ...type.bodyMedium, textAlign: 'center', textTransform: 'capitalize', color: color.text },
});
