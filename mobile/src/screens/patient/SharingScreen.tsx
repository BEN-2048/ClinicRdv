import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import {
  AccessHistoryEntry,
  FacilitiesApi,
  FacilitySummary,
  PatientProfile,
  PatientsApi,
  RecordConsent,
  SharingApi,
} from '../../api/services';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  ListItem,
  Loader,
  Notice,
  Screen,
  SectionTitle,
  SegmentedTabs,
  StatusBadge,
} from '../../components/ui';
import { color, space, type } from '../../theme';

type Tab = 'partages' | 'historique';
type Duration = 30 | 90 | 180 | 365 | null;

const DURATIONS: { value: Duration; label: string }[] = [
  { value: 30, label: '1 mois' },
  { value: 90, label: '3 mois' },
  { value: 365, label: '1 an' },
  { value: null, label: 'Jusqu’à révocation' },
];

const ACTION_LABEL: Record<string, string> = {
  view_summary: 'a consulté la synthèse',
  view_record: 'a consulté le dossier',
  create: 'a ajouté une information',
  update: 'a modifié une information',
  entered_in_error: 'a signalé une erreur',
  issue: 'a émis une ordonnance',
  cancel: 'a annulé une ordonnance',
  download_link: 'a ouvert un document',
  release: 'a publié un document',
  consent_grant: 'a accordé un partage',
  consent_revoke: 'a révoqué un partage',
  emergency_lookup: 'a recherché le dossier en urgence',
  emergency_access: 'a ouvert le dossier en urgence',
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function SharingScreen() {
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('partages');
  const [consents, setConsents] = useState<RecordConsent[] | null>(null);
  const [history, setHistory] = useState<AccessHistoryEntry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FacilitySummary[]>([]);
  const [facility, setFacility] = useState<FacilitySummary | null>(null);
  const [scope, setScope] = useState<'summary' | 'full'>('summary');
  const [duration, setDuration] = useState<Duration>(90);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      PatientsApi.mine()
        .then(({ data }) => {
          const manageable = data.filter((p) => ['self', 'verified'].includes(p.link_status));
          setProfiles(manageable);
          setPatientId((cur) => cur ?? manageable.find((p) => p.link_status === 'self')?.id ?? manageable[0]?.id ?? null);
        })
        .catch((e) => Alert.alert('Profils indisponibles', errorMessage(e)));
    }, [])
  );

  const load = useCallback(async () => {
    if (!patientId) return;
    setConsents(null);
    setHistory(null);
    try {
      const [c, h] = await Promise.all([SharingApi.consents(patientId), SharingApi.accessHistory(patientId)]);
      setConsents(c.data);
      setHistory(h.data);
    } catch (e) {
      setConsents([]);
      setHistory([]);
      Alert.alert('Chargement impossible', errorMessage(e));
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!adding) return;
    const timer = setTimeout(() => {
      FacilitiesApi.search({ q: query.trim() || undefined }).then(({ data }) => setResults(data)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, adding]);

  const grant = async () => {
    if (!patientId || !facility) return;
    setBusy(true);
    try {
      await SharingApi.grant(patientId, { facilityId: facility.id, scope, durationDays: duration });
      setAdding(false);
      setFacility(null);
      setQuery('');
      await load();
    } catch (e) {
      Alert.alert('Partage impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = (c: RecordConsent) =>
    Alert.alert('Révoquer le partage', `${c.facility_name} n’aura plus accès aux informations des autres établissements.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Révoquer',
        style: 'destructive',
        onPress: async () => {
          try {
            await SharingApi.revoke(c.id);
            await load();
          } catch (e) {
            Alert.alert('Révocation impossible', errorMessage(e));
          }
        },
      },
    ]);

  const active = (consents ?? []).filter((c) => c.active);
  const past = (consents ?? []).filter((c) => !c.active);
  const emergencies = (history ?? []).filter((h) => h.action === 'emergency_access');

  return (
    <Screen refreshing={false} onRefresh={load}>
      {profiles.length > 1 ? (
        <View style={s.chips}>
          {profiles.map((p) => (
            <Chip
              key={p.id}
              label={p.link_status === 'self' ? 'Moi' : p.first_name}
              selected={p.id === patientId}
              onPress={() => setPatientId(p.id)}
            />
          ))}
        </View>
      ) : null}

      {emergencies.length ? (
        <Notice
          tone="danger"
          icon="alert-circle-outline"
          title={`${emergencies.length} accès d’urgence à ce dossier`}
          message={`Dernier : ${emergencies[0].actor ?? 'un médecin'}, le ${formatDateTime(emergencies[0].created_at)}.`}
        />
      ) : null}

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'partages', label: 'Partages' },
          { key: 'historique', label: 'Qui a consulté ?' },
        ]}
      />

      {tab === 'partages' ? (
        consents === null ? (
          <Loader label="Chargement..." />
        ) : (
          <>
            <Notice
              icon="shield-checkmark-outline"
              message="Par défaut, chaque établissement ne voit que ce qu’il a lui-même enregistré. Un partage permet à un établissement de voir aussi ce qui a été enregistré ailleurs."
            />

            {adding ? (
              <Card style={s.form}>
                <Text style={type.h3}>Nouveau partage</Text>
                {facility ? (
                  <Chip icon="business-outline" label={`${facility.name}${facility.city ? ` · ${facility.city}` : ''}`} selected onPress={() => setFacility(null)} />
                ) : (
                  <>
                    <Input icon="search" value={query} onChangeText={setQuery} placeholder="Rechercher un établissement" />
                    {results.slice(0, 6).map((f) => (
                      <ListItem key={f.id} title={f.name} subtitle={f.city ?? undefined} icon="business-outline" onPress={() => setFacility(f)} />
                    ))}
                  </>
                )}
                <Text style={s.label}>Ce que l’établissement pourra voir</Text>
                <View style={s.chips}>
                  <Chip label="Synthèse (allergies, antécédents, traitements, vaccins)" selected={scope === 'summary'} onPress={() => setScope('summary')} />
                  <Chip label="Dossier complet (avec documents, ordonnances et informations confidentielles)" selected={scope === 'full'} onPress={() => setScope('full')} />
                </View>
                <Text style={s.label}>Durée</Text>
                <View style={s.chips}>
                  {DURATIONS.map((d) => (
                    <Chip key={String(d.value)} label={d.label} selected={duration === d.value} onPress={() => setDuration(d.value)} />
                  ))}
                </View>
                <View style={s.pair}>
                  <Button title="Annuler" variant="secondary" onPress={() => setAdding(false)} disabled={busy} style={s.flex} />
                  <Button title="Autoriser" icon="checkmark-circle-outline" onPress={grant} loading={busy} disabled={!facility} style={s.flex} />
                </View>
              </Card>
            ) : (
              <Button title="Partager avec un établissement" icon="share-social-outline" variant="secondary" onPress={() => setAdding(true)} />
            )}

            <SectionTitle title={`Partages actifs (${active.length})`} />
            {active.length === 0 ? (
              <EmptyState icon="lock-closed-outline" title="Aucun partage actif" />
            ) : (
              active.map((c) => (
                <Card key={c.id} style={s.card}>
                  <Text style={type.bodyMedium}>{c.facility_name}</Text>
                  <Text style={s.muted}>
                    {c.scope === 'full' ? 'Dossier complet' : 'Synthèse'} · {c.expires_at ? `jusqu’au ${new Date(c.expires_at).toLocaleDateString('fr-FR')}` : 'jusqu’à révocation'}
                  </Text>
                  <Button title="Révoquer" size="sm" variant="danger" fullWidth={false} onPress={() => revoke(c)} />
                </Card>
              ))
            )}

            {past.length ? <SectionTitle title="Partages terminés" /> : null}
            {past.map((c) => (
              <Card key={c.id} style={[s.card, s.faded]}>
                <Text style={type.bodyMedium}>{c.facility_name}</Text>
                <Text style={s.muted}>
                  {c.revoked_at ? `Révoqué le ${new Date(c.revoked_at).toLocaleDateString('fr-FR')}` : 'Expiré'}
                </Text>
              </Card>
            ))}
          </>
        )
      ) : history === null ? (
        <Loader label="Chargement..." />
      ) : history.length === 0 ? (
        <EmptyState icon="time-outline" title="Aucun accès enregistré" />
      ) : (
        history.map((h) => (
          <Card key={h.id} style={[s.card, h.action === 'emergency_access' && s.emergency]}>
            <View style={s.row}>
              <Text style={[type.bodyMedium, s.flex]}>
                {h.actor ?? 'Compte supprimé'} {ACTION_LABEL[h.action] ?? h.action}
              </Text>
              {!h.granted ? <StatusBadge status="cancelled" label="Refusé" /> : null}
            </View>
            <Text style={s.muted}>{formatDateTime(h.created_at)}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  form: { gap: space.sm },
  card: { gap: space.xxs },
  faded: { opacity: 0.6 },
  emergency: { borderLeftWidth: 4, borderLeftColor: color.dangerInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pair: { flexDirection: 'row', gap: space.sm },
  label: { ...type.label, color: color.textSecondary },
  muted: { ...type.caption, color: color.textMuted },
});
