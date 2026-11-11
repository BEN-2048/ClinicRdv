import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import {
  ConsultationHistoryEntry,
  ConsultationsApi,
  PatientRecord,
  Prescription,
  PrescriptionsApi,
  RecordApi,
  RecordKind,
} from '../../api/services';
import { Button, Card, Chip, EmptyState, ErrorState, Input, Loader, Notice, Screen, SegmentedTabs } from '../../components/ui';
import { PrescriptionCard } from '../../components/record/PrescriptionViews';
import { DocumentsPanel } from '../../components/record/DocumentsPanel';
import { KIND_LABEL, RecordEntryForm, RecordSections } from '../../components/record/RecordSections';
import { color, space, type } from '../../theme';
import { doctorName } from '../../utils/doctorName';

type Tab = 'synthese' | 'consultations' | 'ordonnances' | 'documents';

const VITAL_LABELS: [keyof ConsultationHistoryEntry, string, string][] = [
  ['blood_pressure', 'TA', ''],
  ['heart_rate', 'FC', ' bpm'],
  ['temperature', 'T°', ' °C'],
  ['oxygen_saturation', 'SpO2', ' %'],
  ['weight', 'Poids', ' kg'],
];

const ADDABLE: RecordKind[] = ['allergies', 'conditions', 'medications', 'immunizations'];
const today = () => new Date().toISOString().slice(0, 10);

export default function PatientRecordScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const patientId = Number(route.params?.patientId);

  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<RecordKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorFor, setErrorFor] = useState<{ kind: RecordKind; id: number } | null>(null);
  const [errorReason, setErrorReason] = useState('');
  const [tab, setTab] = useState<Tab>('synthese');
  const [history, setHistory] = useState<ConsultationHistoryEntry[] | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[] | null>(null);

  useEffect(() => {
    if (tab === 'consultations' && history === null) {
      ConsultationsApi.history(patientId).then(({ data }) => setHistory(data)).catch((e) => Alert.alert('Historique indisponible', errorMessage(e)));
    }
    if (tab === 'ordonnances' && prescriptions === null) {
      PrescriptionsApi.forPatient(patientId).then(({ data }) => setPrescriptions(data)).catch((e) => Alert.alert('Ordonnances indisponibles', errorMessage(e)));
    }
  }, [tab, history, prescriptions, patientId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await RecordApi.get(patientId, true);
      setRecord(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (record) {
      navigation.setOptions({ title: `${record.patient.first_name} ${record.patient.last_name}` });
    }
  }, [record, navigation]);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      Alert.alert('Action impossible', errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader fullscreen label="Chargement du dossier..." />;
  if (error || !record) return <Screen><ErrorState message={error || 'Dossier indisponible.'} onRetry={load} /></Screen>;

  const p = record.patient;

  return (
    <Screen refreshing={false} onRefresh={load}>
      <Card style={s.header}>
        <Text style={type.h2}>{p.first_name} {p.last_name}</Text>
        <Text style={s.muted}>
          {[p.patient_number, p.birth_date ? `Né(e) le ${p.birth_date.slice(0, 10).split('-').reverse().join('/')}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Card>

      {record.access.basis === 'emergency_access' ? (
        <Notice
          tone="danger"
          icon="alert-circle-outline"
          title="Accès d’urgence"
          message="Synthèse non confidentielle en lecture seule, valable 24 heures. Cet accès a été notifié au patient."
        />
      ) : (
        <Notice
          icon="shield-checkmark-outline"
          message={record.access.sharing?.consent
            ? `Le patient a autorisé le partage ${record.access.sharing.fullAll ? 'de son dossier complet' : 'de sa synthèse'} avec votre établissement : vous voyez aussi les informations enregistrées ailleurs. Chaque consultation est journalisée.`
            : `Vous voyez les informations enregistrées dans vos établissements de soins (${record.access.facilities.map((f) => f.name).join(', ')}) et celles déclarées par le patient. Chaque consultation de ce dossier est journalisée.`}
        />
      )}

      {record.access.basis === 'emergency_access' ? null : (
        <SegmentedTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'synthese', label: 'Synthèse' },
            { key: 'consultations', label: 'Consultations' },
            { key: 'ordonnances', label: 'Ordonnances' },
            { key: 'documents', label: 'Documents' },
          ]}
        />
      )}

      {tab === 'consultations' ? (
        history === null ? (
          <Loader label="Chargement de l’historique..." />
        ) : history.length === 0 ? (
          <EmptyState icon="pulse-outline" title="Aucune consultation terminée" />
        ) : (
          history.map((c) => (
            <Card key={c.appointment_id} style={s.consult}>
              <Text style={type.bodyMedium}>
                {new Date(c.starts_at).toLocaleDateString('fr-FR', { timeZone: c.facility_timezone, day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
              <Text style={s.muted}>{doctorName(c.doctor_name)} · {c.specialty} · {c.facility_name}</Text>
              {c.chief_complaint ? <Text style={s.line}><Text style={s.key}>Motif : </Text>{c.chief_complaint}</Text> : null}
              {VITAL_LABELS.some(([k]) => c[k]) ? (
                <Text style={s.line}>
                  {VITAL_LABELS.filter(([k]) => c[k]).map(([k, label, unit]) => `${label} ${c[k]}${unit}`).join(' · ')}
                </Text>
              ) : null}
              {c.clinical_examination ? <Text style={s.line}><Text style={s.key}>Examen : </Text>{c.clinical_examination}</Text> : null}
              {c.diagnosis ? <Text style={s.line}><Text style={s.key}>Diagnostic : </Text>{c.diagnosis}</Text> : null}
              {c.prescription ? <Text style={s.line}><Text style={s.key}>Prescription : </Text>{c.prescription}</Text> : null}
              {c.notes ? <Text style={s.line}><Text style={s.key}>Notes : </Text>{c.notes}</Text> : null}
              {c.addenda.map((a) => (
                <Text key={a.id} style={s.addendum}>Complément{a.author ? ` (${doctorName(a.author)})` : ''} : {a.content}</Text>
              ))}
            </Card>
          ))
        )
      ) : tab === 'ordonnances' ? (
        prescriptions === null ? (
          <Loader label="Chargement des ordonnances..." />
        ) : prescriptions.length === 0 ? (
          <EmptyState icon="document-text-outline" title="Aucune ordonnance" />
        ) : (
          prescriptions.map((rx) => <PrescriptionCard key={rx.id} prescription={rx} />)
        )
      ) : tab === 'documents' ? (
        <DocumentsPanel
          patientId={patientId}
          clinician
          canUpload={record.access.canWriteClinical}
          facilities={record.access.facilities}
        />
      ) : null}

      {tab !== 'synthese' || !record.access.canWriteClinical ? null : adding ? (
        <RecordEntryForm
          kind={adding}
          clinician
          facilities={record.access.facilities}
          saving={saving}
          onCancel={() => setAdding(null)}
          onSubmit={async (data) => {
            if (await run(() => RecordApi.add(patientId, adding, data))) setAdding(null);
          }}
        />
      ) : (
        <View style={s.chips}>
          {ADDABLE.map((k) => (
            <Chip key={k} icon="add" label={KIND_LABEL[k]} onPress={() => setAdding(k)} />
          ))}
        </View>
      )}

      {tab === 'synthese' ? <RecordSections
        record={record}
        renderActions={!record.access.canWriteClinical ? undefined : (kind, entry) => {
          const e = entry as any;
          const isOpen = errorFor?.kind === kind && errorFor.id === entry.id;
          if (isOpen) {
            return (
              <View style={s.inline}>
                <Input label="Motif de la correction *" value={errorReason} onChangeText={setErrorReason} maxLength={255} />
                <View style={s.actions}>
                  <Button title="Annuler" size="sm" variant="secondary" onPress={() => setErrorFor(null)} style={s.flex} />
                  <Button
                    title="Marquer erronée"
                    size="sm"
                    variant="danger"
                    disabled={errorReason.trim().length < 3}
                    loading={saving}
                    onPress={async () => {
                      if (await run(() => RecordApi.markEnteredInError(patientId, kind, entry.id, errorReason.trim()))) {
                        setErrorFor(null);
                        setErrorReason('');
                      }
                    }}
                    style={s.flex}
                  />
                </View>
              </View>
            );
          }
          return (
            <View style={s.actions}>
              {(kind === 'allergies' || kind === 'conditions') && e.status === 'active' ? (
                <Button
                  title="Résolu"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => run(() => RecordApi.update(patientId, kind, entry.id, { status: 'resolved' }))}
                />
              ) : null}
              {kind === 'medications' && e.status === 'active' ? (
                <Button
                  title="Arrêter"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => run(() => RecordApi.update(patientId, kind, entry.id, { status: 'stopped', endDate: today() }))}
                />
              ) : null}
              <Button
                title="Saisie erronée"
                size="sm"
                variant="ghost"
                fullWidth={false}
                onPress={() => {
                  setErrorReason('');
                  setErrorFor({ kind, id: entry.id });
                }}
              />
            </View>
          );
        }}
      /> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { gap: 2 },
  muted: { ...type.caption, color: color.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xxs },
  inline: { gap: space.xs, marginTop: space.xs },
  consult: { gap: 4 },
  line: { ...type.body, color: color.textSecondary },
  key: { ...type.bodyMedium, color: color.text },
  addendum: { ...type.caption, color: color.primary, marginTop: 2 },
});
