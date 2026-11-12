import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { errorMessage } from '../../api/client';
import { Prescription, PrescriptionItem, PrescriptionsApi } from '../../api/services';
import { Button, Card, Chip, Icon, Input, SectionTitle, StatusBadge } from '../ui';
import { color, space, type } from '../../theme';
import { doctorName } from '../../utils/doctorName';

const STATUS: Record<Prescription['status'], { status: string; label: string }> = {
  draft: { status: 'pending', label: 'Brouillon' },
  issued: { status: 'confirmed', label: 'Émise' },
  cancelled: { status: 'cancelled', label: 'Annulée' },
};

const formatDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const itemLine = (i: PrescriptionItem) =>
  [i.dosage, i.route, i.frequency, i.duration ? `pendant ${i.duration}` : null, i.quantity ? `Qté ${i.quantity}` : null]
    .filter(Boolean)
    .join(' · ');

export function PrescriptionCard({ prescription, footer }: { prescription: Prescription; footer?: React.ReactNode }) {
  const st = STATUS[prescription.status];
  return (
    <Card style={s.card}>
      <View style={s.row}>
        <Icon name="file-lines" size="md" color={color.primary} />
        <Text style={[type.bodyMedium, s.flex]}>
          Ordonnance{prescription.issued_at ? ` du ${formatDay(prescription.issued_at)}` : ''}
        </Text>
        <StatusBadge status={st.status} label={st.label} />
      </View>
      {prescription.items.map((i, idx) => (
        <View key={i.id ?? idx} style={s.item}>
          <Text style={type.bodyMedium}>{idx + 1}. {i.medicationName}</Text>
          {itemLine(i) ? <Text style={s.detail}>{itemLine(i)}</Text> : null}
          {i.instructions ? <Text style={s.detail}>{i.instructions}</Text> : null}
        </View>
      ))}
      {prescription.notes ? <Text style={s.detail}>{prescription.notes}</Text> : null}
      {prescription.cancel_reason ? <Text style={s.error}>Annulée : {prescription.cancel_reason}</Text> : null}
      <Text style={s.muted}>
        {[prescription.prescriber_name ? doctorName(prescription.prescriber_name) : null, prescription.facility_name, prescription.confidential ? 'Confidentielle' : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {footer}
    </Card>
  );
}

const emptyItem = (): PrescriptionItem => ({ medicationName: '' });

function PrescriptionEditor({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial?: Prescription;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: { items: PrescriptionItem[]; notes: string | null; confidential: boolean }) => void;
}) {
  const [items, setItems] = useState<PrescriptionItem[]>(
    initial?.items.length ? initial.items.map(({ id, position, ...rest }) => rest) : [emptyItem()]
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [confidential, setConfidential] = useState(initial?.confidential ?? false);

  const setField = (index: number, key: keyof PrescriptionItem, value: string) =>
    setItems((cur) => cur.map((it, i) => (i === index ? { ...it, [key]: value } : it)));

  const submit = () => {
    const cleaned = items
      .map((it) => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v])) as PrescriptionItem)
      .filter((it) => it.medicationName);
    if (!cleaned.length) {
      Alert.alert('Ordonnance vide', 'Ajoutez au moins un médicament.');
      return;
    }
    onSave({ items: cleaned, notes: notes.trim() || null, confidential });
  };

  return (
    <Card style={s.card}>
      <Text style={type.h3}>{initial ? 'Modifier le brouillon' : 'Nouvelle ordonnance'}</Text>
      {items.map((it, index) => (
        <View key={index} style={s.editorItem}>
          <View style={s.row}>
            <Text style={[type.label, s.flex]}>Médicament {index + 1}</Text>
            {items.length > 1 ? (
              <Button title="Retirer" size="sm" variant="ghost" fullWidth={false} onPress={() => setItems((cur) => cur.filter((_, i) => i !== index))} />
            ) : null}
          </View>
          <Input label="Nom *" value={it.medicationName} onChangeText={(v) => setField(index, 'medicationName', v)} placeholder="Amoxicilline" />
          <View style={s.pair}>
            <Input label="Dosage" value={it.dosage ?? ''} onChangeText={(v) => setField(index, 'dosage', v)} placeholder="500 mg" containerStyle={s.flex} />
            <Input label="Voie" value={it.route ?? ''} onChangeText={(v) => setField(index, 'route', v)} placeholder="orale" containerStyle={s.flex} />
          </View>
          <View style={s.pair}>
            <Input label="Fréquence" value={it.frequency ?? ''} onChangeText={(v) => setField(index, 'frequency', v)} placeholder="3 fois par jour" containerStyle={s.flex} />
            <Input label="Durée" value={it.duration ?? ''} onChangeText={(v) => setField(index, 'duration', v)} placeholder="7 jours" containerStyle={s.flex} />
          </View>
          <Input label="Consignes" value={it.instructions ?? ''} onChangeText={(v) => setField(index, 'instructions', v)} placeholder="Après les repas" />
        </View>
      ))}
      <Button title="Ajouter un médicament" icon="plus" variant="secondary" onPress={() => setItems((cur) => [...cur, emptyItem()])} />
      <Input label="Remarques" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      <Chip icon="lock" label="Confidentielle (masquée aux parents et tuteurs)" selected={confidential} onPress={() => setConfidential(!confidential)} />
      <View style={s.pair}>
        <Button title="Annuler" variant="secondary" onPress={onCancel} disabled={saving} style={s.flex} />
        <Button title="Enregistrer le brouillon" icon="floppy-disk" onPress={submit} loading={saving} style={s.flex} />
      </View>
    </Card>
  );
}

export function AppointmentPrescriptions({ appointmentId, editable }: { appointmentId: number; editable: boolean }) {
  const [list, setList] = useState<Prescription[]>([]);
  const [editing, setEditing] = useState<Prescription | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [addToMedications, setAddToMedications] = useState(true);
  const [cancelFor, setCancelFor] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    try {
      setList((await PrescriptionsApi.forAppointment(appointmentId)).data);
    } catch {
      setList([]);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      Alert.alert('Action impossible', errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const issue = (rx: Prescription) =>
    Alert.alert(
      'Émettre l’ordonnance',
      'Une fois émise, l’ordonnance ne pourra plus être modifiée, seulement annulée. Elle sera visible par le patient.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Émettre', onPress: () => run(() => PrescriptionsApi.issue(rx.id, addToMedications)) },
      ]
    );

  return (
    <View style={s.block}>
      <SectionTitle title={`Ordonnances (${list.length})`} />

      {editing ? (
        <PrescriptionEditor
          initial={editing === 'new' ? undefined : editing}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={async (data) => {
            const ok = await run(() =>
              editing === 'new' ? PrescriptionsApi.create(appointmentId, data) : PrescriptionsApi.update(editing.id, data)
            );
            if (ok) setEditing(null);
          }}
        />
      ) : editable ? (
        <Button title="Nouvelle ordonnance" icon="plus" variant="secondary" onPress={() => setEditing('new')} />
      ) : null}

      {list.map((rx) => (
        <PrescriptionCard
          key={rx.id}
          prescription={rx}
          footer={
            cancelFor === rx.id ? (
              <View style={s.inline}>
                <Input label="Motif de l’annulation *" value={cancelReason} onChangeText={setCancelReason} maxLength={255} />
                <View style={s.pair}>
                  <Button title="Retour" size="sm" variant="secondary" onPress={() => setCancelFor(null)} style={s.flex} />
                  <Button
                    title="Annuler l’ordonnance"
                    size="sm"
                    variant="danger"
                    disabled={cancelReason.trim().length < 3}
                    loading={saving}
                    style={s.flex}
                    onPress={async () => {
                      if (await run(() => PrescriptionsApi.cancel(rx.id, cancelReason.trim()))) {
                        setCancelFor(null);
                        setCancelReason('');
                      }
                    }}
                  />
                </View>
              </View>
            ) : rx.status === 'draft' ? (
              <View style={s.inline}>
                <View style={s.row}>
                  <Text style={[s.detail, s.flex]}>Ajouter au traitement en cours du patient</Text>
                  <Switch value={addToMedications} onValueChange={setAddToMedications} />
                </View>
                <View style={s.pair}>
                  <Button title="Modifier" size="sm" variant="secondary" onPress={() => setEditing(rx)} style={s.flex} />
                  <Button title="Émettre" size="sm" icon="circle-check" onPress={() => issue(rx)} loading={saving} style={s.flex} />
                </View>
              </View>
            ) : rx.status === 'issued' ? (
              <Button title="Annuler l’ordonnance" size="sm" variant="ghost" fullWidth={false} onPress={() => setCancelFor(rx.id)} />
            ) : null
          }
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  block: { gap: space.sm },
  card: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  item: { paddingLeft: space.sm, gap: 2 },
  editorItem: { gap: space.xs, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  pair: { flexDirection: 'row', gap: space.sm },
  inline: { gap: space.xs, marginTop: space.xs },
  detail: { ...type.body, color: color.textSecondary },
  muted: { ...type.caption, color: color.textMuted },
  error: { ...type.caption, color: color.dangerInk },
});
