import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { errorMessage } from '../../api/client';
import {
  DOCUMENT_CATEGORY_LABEL,
  DocumentCategory,
  DocumentsApi,
  MedicalDocument,
} from '../../api/services';
import { Button, Card, Chip, EmptyState, Icon, Input, Loader, StatusBadge } from '../ui';
import { color, space, type } from '../../theme';
import { doctorName } from '../../utils/doctorName';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABEL) as DocumentCategory[];

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;

const formatDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

type Picked = { uri: string; name: string; mimeType: string; size: number };

export function DocumentsPanel({
  patientId,
  clinician,
  canUpload,
  facilities = [],
}: {
  patientId: number;
  clinician: boolean;
  canUpload: boolean;
  facilities?: { id: number; name: string }[];
}) {
  const [docs, setDocs] = useState<MedicalDocument[] | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('lab_result');
  const [title, setTitle] = useState('');
  const [facilityId, setFacilityId] = useState<number | undefined>(facilities.length === 1 ? facilities[0].id : undefined);
  const [confidential, setConfidential] = useState(false);
  const [releaseNow, setReleaseNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorFor, setErrorFor] = useState<number | null>(null);
  const [errorReason, setErrorReason] = useState('');

  const load = useCallback(async () => {
    try {
      setDocs((await DocumentsApi.list(patientId)).data);
    } catch (e) {
      setDocs([]);
      Alert.alert('Documents indisponibles', errorMessage(e));
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? '';
    if (!ACCEPTED.includes(mimeType)) {
      Alert.alert('Format non accepté', 'Seuls les fichiers PDF, JPEG et PNG sont acceptés.');
      return;
    }
    if ((asset.size ?? 0) > MAX_BYTES) {
      Alert.alert('Fichier trop volumineux', 'La taille maximale est de 10 Mo.');
      return;
    }
    setPicked({ uri: asset.uri, name: asset.name, mimeType, size: asset.size ?? 0 });
    if (!title) setTitle(asset.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 150));
  };

  const send = async () => {
    if (!picked || !title.trim()) return;
    if (clinician && facilities.length > 1 && !facilityId) {
      Alert.alert('Établissement', 'Choisissez l’établissement.');
      return;
    }
    setBusy(true);
    try {
      await DocumentsApi.upload(patientId, {
        file: picked,
        category,
        title: title.trim(),
        facilityId: clinician ? facilityId : undefined,
        confidential: clinician ? confidential : undefined,
        releaseNow: clinician ? releaseNow : undefined,
      });
      setPicked(null);
      setTitle('');
      setConfidential(false);
      setReleaseNow(true);
      await load();
    } catch (e) {
      Alert.alert('Envoi impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = async (doc: MedicalDocument) => {
    try {
      const url = await DocumentsApi.downloadUrl(doc.id);
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Ouverture impossible', errorMessage(e));
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      Alert.alert('Action impossible', errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (docs === null) return <Loader label="Chargement des documents..." />;

  return (
    <View style={s.block}>
      {canUpload ? (
        picked ? (
          <Card style={s.form}>
            <Text style={type.h3}>Nouveau document</Text>
            <Text style={s.muted}>{picked.name} · {formatSize(picked.size)}</Text>
            <Input label="Titre *" value={title} onChangeText={setTitle} maxLength={150} />
            <View style={s.chips}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={DOCUMENT_CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
            {clinician && facilities.length > 1 ? (
              <View style={s.chips}>
                {facilities.map((f) => (
                  <Chip key={f.id} icon="building" label={f.name} selected={facilityId === f.id} onPress={() => setFacilityId(f.id)} />
                ))}
              </View>
            ) : null}
            {clinician ? (
              <>
                <Chip
                  icon="eye-slash"
                  label="Ne pas publier tout de suite au patient"
                  selected={!releaseNow}
                  onPress={() => setReleaseNow(!releaseNow)}
                />
                <Chip
                  icon="lock"
                  label="Confidentiel (masqué aux parents et tuteurs)"
                  selected={confidential}
                  onPress={() => setConfidential(!confidential)}
                />
              </>
            ) : null}
            <View style={s.pair}>
              <Button title="Annuler" variant="secondary" onPress={() => setPicked(null)} disabled={busy} style={s.flex} />
              <Button title="Envoyer" icon="cloud-arrow-up" onPress={send} loading={busy} disabled={!title.trim()} style={s.flex} />
            </View>
          </Card>
        ) : (
          <Button title="Ajouter un document (PDF, photo)" icon="paperclip" variant="secondary" onPress={pick} />
        )
      ) : null}

      {docs.length === 0 ? (
        <EmptyState icon="file-arrow-up" title="Aucun document" message="Les ordonnances, résultats et comptes rendus apparaîtront ici." />
      ) : (
        docs.map((d) => (
          <Card key={d.id} style={[s.card, d.entered_in_error && s.faded]}>
            <View style={s.row}>
              <Icon name={d.mime_type === 'application/pdf' ? 'file-lines' : 'image'} size="md" color={color.primary} />
              <View style={s.flex}>
                <Text style={[type.bodyMedium, d.entered_in_error && s.strike]} numberOfLines={2}>{d.title}</Text>
                <Text style={s.muted}>
                  {[DOCUMENT_CATEGORY_LABEL[d.category], formatDay(d.document_date ?? d.uploaded_at), formatSize(d.size_bytes)].join(' · ')}
                </Text>
                <Text style={s.muted}>
                  {[d.source === 'patient' ? 'Déposé par le patient' : d.uploaded_by_name ? doctorName(d.uploaded_by_name) : null, d.facility_name, d.confidential ? 'Confidentiel' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {clinician && !d.released_at && !d.entered_in_error ? <StatusBadge status="pending" label="Non publié" /> : null}
            </View>
            {d.entered_in_error ? <Text style={s.error}>Erroné : {d.error_reason}</Text> : null}

            {!d.entered_in_error ? (
              errorFor === d.id ? (
                <View style={s.form}>
                  <Input label="Motif *" value={errorReason} onChangeText={setErrorReason} maxLength={255} />
                  <View style={s.pair}>
                    <Button title="Retour" size="sm" variant="secondary" onPress={() => setErrorFor(null)} style={s.flex} />
                    <Button
                      title="Marquer erroné"
                      size="sm"
                      variant="danger"
                      disabled={errorReason.trim().length < 3}
                      loading={busy}
                      style={s.flex}
                      onPress={async () => {
                        if (await run(() => DocumentsApi.markEnteredInError(d.id, errorReason.trim()))) {
                          setErrorFor(null);
                          setErrorReason('');
                        }
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View style={s.actions}>
                  <Button title="Ouvrir" size="sm" icon="arrow-up-right-from-square" fullWidth={false} onPress={() => open(d)} />
                  {clinician && !d.released_at ? (
                    <Button title="Publier au patient" size="sm" variant="secondary" fullWidth={false} onPress={() => run(() => DocumentsApi.release(d.id))} />
                  ) : null}
                  {canUpload && (clinician || d.source === 'patient') ? (
                    <Button title="Erroné" size="sm" variant="ghost" fullWidth={false} onPress={() => { setErrorReason(''); setErrorFor(d.id); }} />
                  ) : null}
                </View>
              )
            ) : null}
          </Card>
        ))
      )}
      <Text style={s.footnote}>Chaque ouverture crée un lien valable 5 minutes et elle est journalisée.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  block: { gap: space.sm },
  form: { gap: space.sm },
  card: { gap: space.xs },
  faded: { opacity: 0.6 },
  strike: { textDecorationLine: 'line-through' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pair: { flexDirection: 'row', gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { ...type.caption, color: color.textMuted },
  error: { ...type.caption, color: color.dangerInk },
  footnote: { ...type.caption, color: color.textMuted, textAlign: 'center' },
});
