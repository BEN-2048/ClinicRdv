import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import { PatientRecord, RecordApi, RecordKind } from '../../api/services';
import { Button, Card, Chip, ErrorState, Input, Loader, Notice, Screen } from '../../components/ui';
import { KIND_LABEL, RecordEntryForm, RecordSections } from '../../components/record/RecordSections';
import { color, space, type } from '../../theme';

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

      <Notice
        icon="shield-checkmark-outline"
        message={`Vous voyez les informations enregistrées dans vos établissements de soins (${record.access.facilities.map((f) => f.name).join(', ')}) et celles déclarées par le patient. Chaque consultation de ce dossier est journalisée.`}
      />

      {adding ? (
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

      <RecordSections
        record={record}
        renderActions={(kind, entry) => {
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
      />
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
});
