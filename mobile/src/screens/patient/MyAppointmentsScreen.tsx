import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AppointmentsApi, DoctorsApi } from '../../api/services';
import { Header, Button, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
};

const localDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lubumbashi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
};

const dateChoices = () =>
  Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + index);
    return localDateKey(date);
  });

type Appointment = {
  id: number;
  doctor_id: number;
  doctor_name?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  reason?: string | null;
  first_name?: string;
  last_name?: string;
  specialty?: string;
  doctor_first_name?: string;
  doctor_last_name?: string;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const statusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'confirmed':
      return 'Confirmé';
    case 'cancelled':
      return 'Annulé';
    case 'done':
      return 'Terminé';
    default:
      return status;
  }
};

export default function MyAppointmentsScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [tab, setTab] = useState<'reschedule' | 'cancel'>('reschedule');
  const [chosenDate, setChosenDate] = useState(localDateKey(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAppointments = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const response = await AppointmentsApi.mine();

      if (!Array.isArray(response.data)) {
        throw new Error('Format de réponse inattendu.');
      }

      setAppointments(response.data as Appointment[]);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Impossible de charger les rendez-vous.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
    }, [loadAppointments])
  );

  const openManage = (appointment: Appointment) => {
    setSelected(appointment);
    setTab('reschedule');
    setChosenDate(localDateKey(new Date()));
    setSlots([]);
    setSelectedSlot(null);
    setSlotsError(null);
  };

  const loadSlots = useCallback(async (doctorId: number, date: string) => {
    setSlotsLoading(true);
    setSlotsError(null);
    setSelectedSlot(null);
    try {
      const response = await DoctorsApi.slots(doctorId, date);
      if (!Array.isArray(response.data)) {
        throw new Error('Format des cr\u00e9neaux invalide.');
      }
      setSlots(response.data as Slot[]);
    } catch (err: any) {
      setSlots([]);
      setSlotsError(err?.response?.data?.error || err?.message || 'Chargement impossible.');
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const chooseDate = async (date: string) => {
    if (!selected || saving) return;
    setChosenDate(date);
    await loadSlots(selected.doctor_id, date);
  };

  const submitReschedule = async () => {
    if (!selected || !selectedSlot || saving) return;
    setSaving(true);
    try {
      await AppointmentsApi.reschedule(selected.id, selectedSlot);
      setSelected(null);
      await loadAppointments(true);
      Alert.alert('Succ\u00e8s', 'Votre rendez-vous a \u00e9t\u00e9 report\u00e9.');
    } catch (err: any) {
      Alert.alert('Report impossible', err?.response?.data?.error || err?.message || 'Veuillez r\u00e9essayer.');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = () => {
    if (!selected || saving) return;
    const id = selected.id;
    Alert.alert(
      'Annuler d\u00e9finitivement ?',
      'Cette action annulera votre rendez-vous.',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Confirmer l\u2019annulation',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await AppointmentsApi.cancel(id);
              setSelected(null);
              await loadAppointments(true);
              Alert.alert('Rendez-vous annul\u00e9', 'Votre annulation a \u00e9t\u00e9 enregistr\u00e9e.');
            } catch (err: any) {
              Alert.alert('Annulation impossible', err?.response?.data?.error || err?.message || 'Veuillez r\u00e9essayer.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const sortedAppointments = [...appointments].sort(
    (a, b) =>
      new Date(b.starts_at).getTime() -
      new Date(a.starts_at).getTime()
  );

  return (
    <View style={ui.page}>
      <Header
        title="Mes rendez-vous"
        subtitle="Consultez vos réservations"
      />

      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAppointments(true)}
            colors={[colors.primary]}
          />
        }
      >
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={ui.muted}>Chargement des rendez-vous...</Text>
          </View>
        )}

        {error && (
          <View style={ui.card}>
            <Text style={styles.error}>{error}</Text>
            <Button
              title="Réessayer"
              onPress={() => loadAppointments()}
            />
          </View>
        )}

        {!loading && !error && sortedAppointments.length === 0 && (
          <View style={ui.card}>
            <Text style={styles.emptyTitle}>
              Aucun rendez-vous
            </Text>
            <Text style={styles.emptyDescription}>
              Vos prochaines réservations apparaîtront ici.
            </Text>
          </View>
        )}

        {!loading && !error && sortedAppointments.map((appointment) => {
          const doctorName = appointment.doctor_name || [
            appointment.doctor_first_name ?? appointment.first_name,
            appointment.doctor_last_name ?? appointment.last_name,
          ].filter(Boolean).join(' ');

          return (
            <View key={appointment.id} style={ui.card}>
              <View style={styles.topRow}>
                <Text style={styles.appointmentNumber}>
                  Rendez-vous #{appointment.id}
                </Text>

                <Text style={styles.status}>
                  {statusLabel(appointment.status)}
                </Text>
              </View>

              {doctorName ? (
                <Text style={styles.doctorName}>
                  Dr. {doctorName}
                </Text>
              ) : (
                <Text style={ui.muted}>
                  Médecin #{appointment.doctor_id}
                </Text>
              )}

              {appointment.specialty ? (
                <Text style={ui.muted}>
                  {appointment.specialty}
                </Text>
              ) : null}

              <Text style={styles.detail}>
                Date : {formatDate(appointment.starts_at)}
              </Text>

              <Text style={styles.detail}>
                Heure : {formatTime(appointment.starts_at)}
                {' - '}
                {formatTime(appointment.ends_at)}
              </Text>

              {appointment.reason ? (
                <Text style={styles.detail}>
                  Motif : {appointment.reason}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 35,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  appointmentNumber: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  status: {
    color: '#12834C',
    backgroundColor: '#E5F8ED',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  doctorName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 5,
  },
  detail: {
    color: colors.text,
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
  },
  manageButton: { marginTop: 18 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    gap: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
  },
  close: { fontSize: 30, color: colors.muted },
  currentAppointment: { color: colors.muted, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F1F4F8',
    alignItems: 'center',
  },
  activeTab: { backgroundColor: '#DCECFB' },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  dateChip: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F1F4F8',
    marginRight: 8,
  },
  selectedChip: { backgroundColor: '#BBDDF9', borderColor: colors.primary, borderWidth: 1 },
  chipText: { color: colors.text, fontWeight: '700' },
  slotList: { maxHeight: 180 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  slotChip: { padding: 12, borderRadius: 10, backgroundColor: '#F1F4F8' },
  cancelSection: { gap: 16, paddingVertical: 16 },
  cancelWarning: { color: colors.error, lineHeight: 22 },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 15,
  },
});
