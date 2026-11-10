import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AllergyEntry,
  ConditionEntry,
  ImmunizationEntry,
  MedicationEntry,
  PatientRecord,
  RecordKind,
} from '../../api/services';
import { Button, Card, Chip, Icon, Input, SectionTitle } from '../ui';
import { color, radius, space, type } from '../../theme';

type AnyEntry = AllergyEntry | ConditionEntry | MedicationEntry | ImmunizationEntry;

const SEVERITY_LABEL: Record<AllergyEntry['severity'], string> = {
  severe: 'Sévère',
  moderate: 'Modérée',
  mild: 'Légère',
  unknown: 'Gravité inconnue',
};

export const KIND_LABEL: Record<RecordKind, string> = {
  allergies: 'Allergies',
  conditions: 'Antécédents',
  medications: 'Traitements',
  immunizations: 'Vaccinations',
};

const formatDay = (value: string | null) => {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const describe = (kind: RecordKind, e: AnyEntry): { title: string; details: (string | null)[]; ended: boolean } => {
  switch (kind) {
    case 'allergies': {
      const a = e as AllergyEntry;
      return {
        title: a.substance,
        details: [SEVERITY_LABEL[a.severity], a.reaction, a.status === 'resolved' ? 'Résolue' : null],
        ended: a.status === 'resolved',
      };
    }
    case 'conditions': {
      const c = e as ConditionEntry;
      return {
        title: c.label,
        details: [c.icd10_code, c.onset_date ? `Depuis le ${formatDay(c.onset_date)}` : null, c.status === 'resolved' ? 'Résolu' : null],
        ended: c.status === 'resolved',
      };
    }
    case 'medications': {
      const m = e as MedicationEntry;
      return {
        title: m.name,
        details: [m.dosage, m.frequency, m.start_date ? `Début ${formatDay(m.start_date)}` : null, m.status === 'stopped' ? `Arrêté${m.end_date ? ` le ${formatDay(m.end_date)}` : ''}` : null],
        ended: m.status === 'stopped',
      };
    }
    default: {
      const i = e as ImmunizationEntry;
      return {
        title: i.vaccine,
        details: [i.dose_label, formatDay(i.administered_on), i.lot_number ? `Lot ${i.lot_number}` : null],
        ended: false,
      };
    }
  }
};

export function RecordSections({
  record,
  renderActions,
}: {
  record: PatientRecord;
  renderActions?: (kind: RecordKind, entry: AnyEntry) => React.ReactNode;
}) {
  const kinds: RecordKind[] = ['allergies', 'conditions', 'medications', 'immunizations'];

  return (
    <>
      {kinds.map((kind) => {
        const entries = record[kind] as AnyEntry[];
        return (
          <View key={kind} style={s.block}>
            <SectionTitle title={`${KIND_LABEL[kind]} (${entries.filter((e) => !e.entered_in_error).length})`} />
            {entries.length === 0 ? (
              <Text style={s.muted}>Aucune information enregistrée.</Text>
            ) : (
              entries.map((e) => {
                const d = describe(kind, e);
                const severe = kind === 'allergies' && (e as AllergyEntry).severity === 'severe' && !d.ended;
                return (
                  <Card key={e.id} style={[s.entry, severe && s.severe, (d.ended || e.entered_in_error) && s.ended]}>
                    <View style={s.titleRow}>
                      {severe ? <Icon name="warning" size="sm" color={color.dangerInk} /> : null}
                      <Text style={[type.bodyMedium, s.flex, e.entered_in_error && s.strike]}>{d.title}</Text>
                      {e.confidential ? <Text style={s.tag}>Confidentiel</Text> : null}
                      {e.source === 'patient' ? <Text style={s.tag}>Déclaré par le patient</Text> : null}
                    </View>
                    {d.details.filter(Boolean).length ? (
                      <Text style={s.detail}>{d.details.filter(Boolean).join(' · ')}</Text>
                    ) : null}
                    {e.notes ? <Text style={s.detail}>{e.notes}</Text> : null}
                    {e.entered_in_error ? (
                      <Text style={s.error}>Saisie erronée : {e.error_reason}</Text>
                    ) : null}
                    <Text style={s.muted}>
                      {[e.recorded_by_name, e.facility_name, formatDay(e.recorded_at)].filter(Boolean).join(' · ')}
                    </Text>
                    {renderActions && !e.entered_in_error ? renderActions(kind, e) : null}
                  </Card>
                );
              })
            )}
          </View>
        );
      })}
    </>
  );
}

type FieldDef = { key: string; label: string; required?: boolean; placeholder?: string; date?: boolean };

const FORM_FIELDS: Record<RecordKind, FieldDef[]> = {
  allergies: [
    { key: 'substance', label: 'Substance *', required: true, placeholder: 'Pénicilline, arachide...' },
    { key: 'reaction', label: 'Réaction', placeholder: 'Urticaire, œdème...' },
  ],
  conditions: [
    { key: 'label', label: 'Antécédent *', required: true, placeholder: 'Hypertension, drépanocytose...' },
    { key: 'icd10Code', label: 'Code CIM-10', placeholder: 'I10' },
    { key: 'onsetDate', label: 'Depuis le', placeholder: 'JJ/MM/AAAA', date: true },
  ],
  medications: [
    { key: 'name', label: 'Médicament *', required: true },
    { key: 'dosage', label: 'Dosage', placeholder: '500 mg' },
    { key: 'frequency', label: 'Fréquence', placeholder: '3 fois par jour' },
    { key: 'startDate', label: 'Début', placeholder: 'JJ/MM/AAAA', date: true },
  ],
  immunizations: [
    { key: 'vaccine', label: 'Vaccin *', required: true },
    { key: 'doseLabel', label: 'Dose', placeholder: '1re dose, rappel...' },
    { key: 'administeredOn', label: 'Date *', required: true, placeholder: 'JJ/MM/AAAA', date: true },
    { key: 'lotNumber', label: 'N° de lot' },
  ],
};

const toIsoDate = (value: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
};

export function RecordEntryForm({
  kind,
  clinician,
  facilities = [],
  saving,
  onCancel,
  onSubmit,
}: {
  kind: RecordKind;
  clinician: boolean;
  facilities?: { id: number; name: string }[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [severity, setSeverity] = useState<AllergyEntry['severity']>('unknown');
  const [confidential, setConfidential] = useState(false);
  const [facilityId, setFacilityId] = useState<number | undefined>(facilities.length === 1 ? facilities[0].id : undefined);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const data: Record<string, unknown> = {};
    for (const f of FORM_FIELDS[kind]) {
      const raw = (values[f.key] ?? '').trim();
      if (!raw) {
        if (f.required) return setError(`${f.label.replace(' *', '')} est obligatoire.`);
        continue;
      }
      if (f.date) {
        const iso = toIsoDate(raw);
        if (!iso) return setError(`${f.label.replace(' *', '')} : format JJ/MM/AAAA attendu.`);
        data[f.key] = iso;
      } else {
        data[f.key] = raw;
      }
    }
    if (kind === 'allergies') data.severity = severity;
    if (clinician) {
      if (facilities.length > 1 && !facilityId) return setError('Choisissez l’établissement.');
      if (facilityId) data.facilityId = facilityId;
      if (confidential) data.confidential = true;
    }
    setError(null);
    onSubmit(data);
  };

  return (
    <Card style={s.form}>
      <Text style={type.h3}>Ajouter : {KIND_LABEL[kind].toLowerCase()}</Text>
      {FORM_FIELDS[kind].map((f) => (
        <Input
          key={f.key}
          label={f.label}
          value={values[f.key] ?? ''}
          placeholder={f.placeholder}
          keyboardType={f.date ? 'numbers-and-punctuation' : 'default'}
          maxLength={f.date ? 10 : 200}
          autoCapitalize={f.key === 'icd10Code' ? 'characters' : 'sentences'}
          onChangeText={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))}
        />
      ))}
      {kind === 'allergies' ? (
        <View style={s.chips}>
          {(Object.keys(SEVERITY_LABEL) as AllergyEntry['severity'][]).map((k) => (
            <Chip key={k} label={SEVERITY_LABEL[k]} selected={severity === k} onPress={() => setSeverity(k)} />
          ))}
        </View>
      ) : null}
      {clinician && facilities.length > 1 ? (
        <View style={s.chips}>
          {facilities.map((f) => (
            <Chip key={f.id} icon="business-outline" label={f.name} selected={facilityId === f.id} onPress={() => setFacilityId(f.id)} />
          ))}
        </View>
      ) : null}
      {clinician ? (
        <Chip
          icon="lock-closed-outline"
          label="Confidentiel (masqué aux parents et tuteurs)"
          selected={confidential}
          onPress={() => setConfidential(!confidential)}
        />
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={s.actions}>
        <Button title="Annuler" variant="secondary" onPress={onCancel} disabled={saving} style={s.flex} />
        <Button title="Enregistrer" icon="save-outline" onPress={submit} loading={saving} style={s.flex} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  block: { gap: space.xs },
  entry: { gap: 4 },
  severe: { borderLeftWidth: 4, borderLeftColor: color.dangerInk },
  ended: { opacity: 0.65 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexWrap: 'wrap' },
  strike: { textDecorationLine: 'line-through' },
  tag: {
    ...type.caption,
    color: color.primary,
    backgroundColor: color.primarySubtle,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  detail: { ...type.body, color: color.textSecondary },
  muted: { ...type.caption, color: color.textMuted },
  error: { ...type.caption, color: color.dangerInk },
  form: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
});
