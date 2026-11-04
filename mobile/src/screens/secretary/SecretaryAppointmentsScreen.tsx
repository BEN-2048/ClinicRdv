import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { AppointmentStatus, StaffApi, StaffAppointment } from '../../api/services';
import { Button, Chip, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import {
  ErrorCard, Loading, STATUS_LABELS, StatusBadge, clinicToday, errorText, formatDateTime, formatLongDate, formatTime, shared, shiftDate,
} from './shared';

const STATUSES: AppointmentStatus[] = ['confirmed', 'pending', 'cancelled', 'done'];

export default function SecretaryAppointmentsScreen() {
  const navigation = useNavigation<any>();
  const [date, setDate] = useState<string | null>(clinicToday());
  const [status, setStatus] = useState<AppointmentStatus | null>(null);
  const [items, setItems] = useState<StaffAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
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
  }, [date, status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = (a: StaffAppointment) =>
    Alert.alert('Annuler le rendez-vous', `Annuler le RDV de ${a.patient_name} avec Dr. ${a.doctor_name} ?`, [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler le RDV',
        style: 'destructive',
        onPress: async () => {
          try {
            await StaffApi.cancel(a.id);
            load();
          } catch (err) {
            Alert.alert('Erreur', errorText(err, "L'annulation a échoué."));
          }
        },
      },
    ]);

  const active = (a: StaffAppointment) => a.status === 'pending' || a.status === 'confirmed';

  return (
    <View style={ui.page}>
      <Header title="Rendez-vous du cabinet" subtitle="Tous les médecins" right="📅" />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}
      >
        <Button title="+ Nouveau rendez-vous" onPress={() => navigation.navigate('SecretaryBook')} />

        <View style={[shared.row, ui.section]}>
          <Button title="◀" secondary disabled={!date} onPress={() => date && setDate(shiftDate(date, -1))} />
          <Text style={[ui.label, { flex: 1, textAlign: 'center', textTransform: 'capitalize' }]}>
            {date ? formatLongDate(date) : 'Toutes les dates'}
          </Text>
          <Button title="▶" secondary disabled={!date} onPress={() => date && setDate(shiftDate(date, 1))} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip title="Aujourd'hui" active={date === clinicToday()} onPress={() => setDate(clinicToday())} />
          <Chip title="Toutes les dates" active={date === null} onPress={() => setDate(null)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          <Chip title="Tous statuts" active={status === null} onPress={() => setStatus(null)} />
          {STATUSES.map((st) => (
            <Chip key={st} title={STATUS_LABELS[st]} active={status === st} onPress={() => setStatus(st)} />
          ))}
        </View>

        {loading && <Loading label="Chargement des rendez-vous..." />}
        {error && <ErrorCard message={error} onRetry={() => load()} />}
        {!loading && !error && items.length === 0 && (
          <View style={ui.card}><Text style={shared.empty}>Aucun rendez-vous pour ces critères.</Text></View>
        )}

        {!loading && !error && items.map((a) => (
          <View key={a.id} style={ui.card}>
            <View style={shared.row}>
              <Text style={shared.title}>{a.patient_name}</Text>
              <StatusBadge status={a.status} />
            </View>
            {a.patient_phone ? <Text style={ui.muted}>{a.patient_phone}</Text> : null}
            <Text style={shared.detail}>Dr. {a.doctor_name} · {a.specialty}</Text>
            <Text style={shared.detail}>
              {date ? formatTime(a.starts_at) : formatDateTime(a.starts_at)} - {formatTime(a.ends_at)}
            </Text>
            {a.reason ? <Text style={shared.detail}>Motif : {a.reason}</Text> : null}
            {active(a) && (
              <View style={shared.actions}>
                <View style={shared.action}>
                  <Button title="Reporter" secondary onPress={() => navigation.navigate('SecretaryBook', { appointment: a })} />
                </View>
                <View style={shared.action}>
                  <Button title="Annuler" onPress={() => cancel(a)} />
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
