import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MedicalRecordApi, UsersApi } from '../../api/services';
import {
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Loader,
  Screen,
  SegmentedTabs,
} from '../../components/ui';
import { CLINIC_TIME_ZONE } from '../../components/PatientFigmaUI';
import { color, radius, space, type } from '../../theme';

type Consultation = {
  appointment_id: number;
  starts_at: string;
  status: string;
  reason: string | null;
  doctor_first_name: string;
  doctor_last_name: string;
  specialty: string;
  note_id: number | null;
  notes: string | null;
  prescription: string | null;
  note_created_at: string | null;
};

type Tab = 'consultations' | 'documents' | 'traitements';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));

export default function MedicalRecordScreen() {
  const [tab, setTab] = useState<Tab>('consultations');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [patientName, setPatientName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [records, profile] = await Promise.all([MedicalRecordApi.mine(), UsersApi.getMe()]);
      if (!Array.isArray(records.data)) {
        throw new Error('Format du dossier médical invalide.');
      }
      setConsultations(records.data as Consultation[]);
      const user = profile.data?.user ?? profile.data;
      setPatientName([user?.first_name, user?.last_name].filter(Boolean).join(' '));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Impossible de charger le dossier médical.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const prescriptions = consultations.filter((item) => item.prescription?.trim());

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <View style={s.profile}>
        <View style={s.profileIcon}>
          <Icon name="folder-open-outline" size="lg" color={color.onPrimary} />
        </View>
        <View style={s.flex}>
          <Text style={s.profileLabel}>DOSSIER PATIENT</Text>
          <Text style={s.profileName} numberOfLines={1}>
            {patientName || 'Mon dossier médical'}
          </Text>
          <Text style={s.profileDescription}>Informations médicales associées à votre compte</Text>
        </View>
      </View>

      <View style={s.stats}>
        <Card style={s.stat}>
          <Icon name="pulse-outline" size="md" color={color.primary} />
          <Text style={s.statValue}>{consultations.length}</Text>
          <Text style={s.statLabel}>Consultations</Text>
        </Card>
        <Card style={s.stat}>
          <Icon name="medical-outline" size="md" color={color.success} />
          <Text style={s.statValue}>{prescriptions.length}</Text>
          <Text style={s.statLabel}>Prescriptions</Text>
        </Card>
      </View>

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'consultations', label: 'Consultations' },
          { key: 'documents', label: 'Documents' },
          { key: 'traitements', label: 'Traitements' },
        ]}
      />

      {loading ? (
        <Loader label="Chargement du dossier..." />
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={() => load()} />
        </Card>
      ) : tab === 'consultations' ? (
        consultations.length === 0 ? (
          <Card>
            <EmptyState
              icon="pulse-outline"
              title="Aucune consultation"
              message="Votre historique apparaîtra ici après une consultation enregistrée."
            />
          </Card>
        ) : (
          consultations.map((item) => (
            <Card key={item.appointment_id} style={s.consultation}>
              <View style={s.dateRow}>
                <Icon name="calendar-outline" size="sm" color={color.primary} />
                <Text style={s.date}>{formatDate(item.starts_at)}</Text>
              </View>
              <View>
                <Text style={type.h3}>
                  Dr. {item.doctor_first_name} {item.doctor_last_name}
                </Text>
                <Text style={s.muted}>{item.specialty}</Text>
              </View>

              {item.reason ? <Text style={s.detail}>Motif : {item.reason}</Text> : null}

              {item.notes ? (
                <View style={s.note}>
                  <Text style={s.noteTitle}>Observations médicales</Text>
                  <Text style={s.detail}>{item.notes}</Text>
                </View>
              ) : (
                <Text style={s.muted}>Aucune observation médicale enregistrée.</Text>
              )}

              {item.prescription ? (
                <View style={[s.note, s.prescriptionNote]}>
                  <Text style={s.noteTitle}>Prescription</Text>
                  <Text style={s.detail}>{item.prescription}</Text>
                </View>
              ) : null}
            </Card>
          ))
        )
      ) : tab === 'documents' ? (
        <Card>
          <EmptyState
            icon="document-attach-outline"
            title="Documents médicaux"
            message="Aucun document téléchargeable n'est actuellement disponible."
          />
        </Card>
      ) : prescriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon="medical-outline"
            title="Aucune prescription"
            message="Aucune prescription enregistrée dans votre dossier."
          />
        </Card>
      ) : (
        prescriptions.map((item) => (
          <Card key={item.appointment_id} style={s.consultation}>
            <View style={s.dateRow}>
              <Icon name="calendar-outline" size="sm" color={color.primary} />
              <Text style={s.date}>{formatDate(item.starts_at)}</Text>
            </View>
            <Text style={type.h3}>
              Dr. {item.doctor_first_name} {item.doctor_last_name}
            </Text>
            <View style={[s.note, s.prescriptionNote]}>
              <Text style={s.detail}>{item.prescription}</Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.primary,
    borderRadius: radius.lg,
    padding: space.md,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileLabel: { ...type.caption, color: color.primarySoft, letterSpacing: 1 },
  profileName: { ...type.h2, color: color.onPrimary, marginTop: 2 },
  profileDescription: { ...type.caption, color: color.primarySoft, marginTop: 2 },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, alignItems: 'center', gap: space.xxs },
  statValue: { ...type.h1, color: color.primary },
  statLabel: { ...type.caption, color: color.textMuted },
  consultation: { gap: space.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  date: { ...type.label, color: color.primary },
  muted: { ...type.body, color: color.textMuted },
  detail: { ...type.body },
  note: {
    backgroundColor: color.primarySubtle,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xxs,
  },
  prescriptionNote: { backgroundColor: color.successSoft + '40' },
  noteTitle: { ...type.label, color: color.text },
});
