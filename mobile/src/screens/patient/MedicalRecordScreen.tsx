import React, { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MedicalRecordApi, PatientProfile, PatientRecord, PatientsApi, RecordApi } from '../../api/services';
import { errorMessage } from '../../api/client';
import { RecordEntryForm, RecordSections } from '../../components/record/RecordSections';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  Loader,
  Notice,
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

type Tab = 'synthese' | 'consultations' | 'documents' | 'traitements';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));

export default function MedicalRecordScreen() {
  const [tab, setTab] = useState<Tab>('synthese');
  const [summary, setSummary] = useState<PatientRecord | null>(null);
  const [declaring, setDeclaring] = useState(false);
  const [savingDeclaration, setSavingDeclaration] = useState(false);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false, wantedId: number | null = null) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data: all } = await PatientsApi.mine();
      const visible = all.filter((p) => ['self', 'pending', 'verified'].includes(p.link_status));
      setProfiles(visible);

      const target =
        visible.find((p) => p.id === wantedId) ??
        visible.find((p) => p.link_status === 'self') ??
        visible[0];
      setSelectedId(target?.id ?? null);
      selectedRef.current = target?.id ?? null;

      if (!target || target.link_status === 'pending') {
        setConsultations([]);
        setSummary(null);
        return;
      }

      const [{ data }, record] = await Promise.all([
        MedicalRecordApi.forPatient(target.id),
        RecordApi.get(target.id),
      ]);
      setSummary(record.data);
      if (!Array.isArray(data?.consultations)) {
        throw new Error('Format du dossier médical invalide.');
      }
      setConsultations(data.consultations as Consultation[]);
    } catch (err: any) {
      setConsultations([]);
      setSummary(null);
      setError(err?.response?.data?.error || err?.message || 'Impossible de charger le dossier médical.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(false, selectedRef.current);
    }, [load])
  );

  const selected = profiles.find((p) => p.id === selectedId);
  const patientName = selected ? `${selected.first_name} ${selected.last_name}` : '';
  const isSelf = selected?.link_status === 'self';

  const prescriptions = consultations.filter((item) => item.prescription?.trim());

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true, selectedId)}>
      {profiles.length > 1 ? (
        <View style={s.chips}>
          {profiles.map((p) => (
            <Chip
              key={p.id}
              label={p.link_status === 'self' ? 'Moi' : p.first_name}
              icon={p.link_status === 'pending' ? 'time-outline' : undefined}
              selected={p.id === selectedId}
              onPress={() => load(false, p.id)}
            />
          ))}
        </View>
      ) : null}

      {selected?.link_status === 'pending' ? (
        <Notice
          tone="warning"
          icon="lock-closed-outline"
          title="Dossier non accessible pour le moment"
          message="Présentez l’acte de naissance ou le jugement de tutelle à la clinique. Le dossier sera visible dès que le lien sera vérifié."
        />
      ) : null}

      <View style={s.profile}>
        <View style={s.profileIcon}>
          <Icon name="folder-open-outline" size="lg" color={color.onPrimary} />
        </View>
        <View style={s.flex}>
          <Text style={s.profileLabel}>DOSSIER PATIENT</Text>
          <Text style={s.profileName} numberOfLines={1}>
            {patientName || 'Mon dossier médical'}
          </Text>
          <Text style={s.profileDescription}>
            {[selected?.patient_number, isSelf ? 'Votre dossier' : 'Dossier d’un proche'].filter(Boolean).join(' · ')}
          </Text>
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
          { key: 'synthese', label: 'Synthèse' },
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
      ) : tab === 'synthese' ? (
        summary ? (
          <>
            {summary.access.canDeclare ? (
              declaring ? (
                <RecordEntryForm
                  kind="allergies"
                  clinician={false}
                  saving={savingDeclaration}
                  onCancel={() => setDeclaring(false)}
                  onSubmit={async (data) => {
                    setSavingDeclaration(true);
                    try {
                      await RecordApi.add(summary.patient.id, 'allergies', data);
                      setDeclaring(false);
                      await load(true, selectedRef.current);
                    } catch (e) {
                      Alert.alert('Déclaration impossible', errorMessage(e));
                    } finally {
                      setSavingDeclaration(false);
                    }
                  }}
                />
              ) : (
                <Button title="Déclarer une allergie" icon="add" variant="secondary" onPress={() => setDeclaring(true)} />
              )
            ) : null}
            <RecordSections record={summary} />
            <Text style={s.footnote}>
              Les informations « Déclaré par le patient » seront vérifiées par votre médecin lors d’une prochaine consultation.
            </Text>
          </>
        ) : (
          <Card>
            <EmptyState icon="document-text-outline" title="Synthèse indisponible" />
          </Card>
        )
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
  footnote: { ...type.caption, color: color.textMuted, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
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
