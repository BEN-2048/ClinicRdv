import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { errorMessage } from '../../api/client';
import {
  PatientProfile,
  PatientsApi,
  RecommendationResult,
  RecommendationsApi,
  TriageCatalog,
  TriageResult,
  TriageSuggestion,
} from '../../api/services';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  Loader,
  Notice,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { color, space, type } from '../../theme';

type Step = 'symptoms' | 'specialty' | 'doctors';

const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'sw', label: 'Swahili' },
  { code: 'ln', label: 'Lingala' },
  { code: 'lu', label: 'Tshiluba' },
];

const CONFIDENCE_LABEL: Record<TriageSuggestion['confidence'], string> = {
  forte: 'Correspond bien',
  moyenne: 'Possible',
  faible: 'Moins probable',
};

const ageFrom = (birthDate: string | null) => {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  if (!Number.isFinite(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return Math.max(0, age);
};

const formatSlot = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export default function FindDoctorScreen() {
  const navigation = useNavigation<any>();

  const [catalog, setCatalog] = useState<TriageCatalog | null>(null);
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('symptoms');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [specialty, setSpecialty] = useState<TriageSuggestion | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const loadCatalog = useCallback(async () => {
    setError(null);
    try {
      const [c, p] = await Promise.all([RecommendationsApi.symptoms(), PatientsApi.mine().catch(() => ({ data: [] }))]);
      setCatalog(c.data);
      const usable = p.data.filter((x) => x.link_status === 'self' || x.link_status === 'verified' || x.link_status === 'pending');
      setProfiles(usable);
      setProfileId(usable.find((x) => x.relationship === 'self')?.id ?? usable[0]?.id ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const profile = useMemo(() => profiles.find((p) => p.id === profileId) ?? null, [profiles, profileId]);
  const flagCodes = useMemo(() => new Set(catalog?.redFlags.map((f) => f.code) ?? []), [catalog]);
  const hasFlag = selected.some((c) => flagCodes.has(c));

  const toggle = (code: string, value: boolean) =>
    setSelected((prev) => (value ? [...prev, code] : prev.filter((c) => c !== code)));

  const orient = async () => {
    setBusy(true);
    try {
      const age = ageFrom(profile?.birth_date ?? null);
      const res = await RecommendationsApi.orient({ symptoms: selected, ...(age !== undefined ? { age } : {}) });
      setTriage(res.data);
      setSpecialty(res.data.suggestions[0] ?? null);
      setStep('specialty');
    } catch (e) {
      Alert.alert('Orientation impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const search = useCallback(
    async (target: TriageSuggestion, pos = position, lang = language) => {
      setBusy(true);
      setResult(null);
      try {
        const res = await RecommendationsApi.doctors({
          specialtyId: target.specialtyId,
          ...(profileId ? { profileId } : {}),
          ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
          ...(lang ? { language: lang } : {}),
        });
        setResult(res.data);
        setStep('doctors');
      } catch (e) {
        Alert.alert('Recherche impossible', errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [position, language, profileId]
  );

  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Position non autorisée', 'Le classement se fera sans la distance. Vous pouvez autoriser la position dans les réglages.');
        return;
      }
      const last = await Location.getLastKnownPositionAsync();
      const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      setPosition(pos);
      if (specialty && step === 'doctors') await search(specialty, pos);
    } catch {
      Alert.alert('Position indisponible', 'Impossible de déterminer votre position pour le moment.');
    } finally {
      setLocating(false);
    }
  };

  const chooseLanguage = (code: string) => {
    const next = language === code ? null : code;
    setLanguage(next);
    if (specialty && step === 'doctors') search(specialty, position, next);
  };

  const restart = () => {
    setStep('symptoms');
    setSelected([]);
    setTriage(null);
    setSpecialty(null);
    setResult(null);
  };

  if (error) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={loadCatalog} />
      </Screen>
    );
  }
  if (!catalog) return <Loader fullscreen label="Chargement..." />;

  if (step === 'specialty' && triage?.urgent) {
    return (
      <Screen key="urgent">
        <Notice tone="danger" title="Ne prenez pas de rendez-vous" message={triage.message} />
        <Card style={s.card}>
          <Text style={type.bodyMedium}>Signes signalés :</Text>
          {triage.redFlags.map((f) => (
            <Text key={f.code} style={type.body}>• {f.label}</Text>
          ))}
        </Card>
        <Button title="Ouvrir l’écran Urgence" icon="kit-medical" variant="danger" onPress={() => navigation.navigate('Emergency')} />
        <Button title="Recommencer" variant="ghost" onPress={restart} />
        <Text style={s.disclaimer}>{triage.disclaimer}</Text>
      </Screen>
    );
  }

  if (step === 'specialty' && triage) {
    return (
      <Screen key="specialty">
        <SectionTitle title="Spécialité conseillée" />
        {triage.suggestions.length === 0 ? (
          <Card>
            <EmptyState
              icon="kit-medical"
              title="Aucune spécialité disponible"
              message="Aucun médecin adapté n’est enregistré pour le moment. Consultez la liste des médecins."
            />
          </Card>
        ) : null}
        {triage.suggestions.map((sug) => (
          <Card
            key={sug.specialtyId}
            style={[s.card, specialty?.specialtyId === sug.specialtyId && s.cardSelected]}
            onPress={() => setSpecialty(sug)}
            accessibilityLabel={`Choisir ${sug.name}`}
          >
            <View style={s.row}>
              <Text style={[type.h2, s.flex]}>{sug.name}</Text>
              <Text style={s.badge}>{CONFIDENCE_LABEL[sug.confidence]}</Text>
            </View>
            <Text style={s.muted}>Parce que : {sug.reasons.join(', ')}</Text>
          </Card>
        ))}
        {specialty ? (
          <Button title="Voir les médecins" icon="magnifying-glass" loading={busy} onPress={() => search(specialty)} />
        ) : null}
        <Button title="Modifier les symptômes" variant="ghost" onPress={() => setStep('symptoms')} />
        <Text style={s.disclaimer}>{triage.disclaimer}</Text>
      </Screen>
    );
  }

  if (step === 'doctors' && specialty) {
    return (
      <Screen key="doctors">
        <Text style={type.h2}>{specialty.name}</Text>
        <View style={s.chips}>
          <Chip
            icon="location-dot"
            label={position ? 'Position utilisée' : locating ? 'Localisation...' : 'Utiliser ma position'}
            selected={!!position}
            onPress={locating || position ? undefined : locate}
          />
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={language === l.code} onPress={busy ? undefined : () => chooseLanguage(l.code)} />
          ))}
        </View>
        <Notice
          tone="info"
          message={`Classement sur 100 : délai du premier créneau (${result?.weights.delay ?? 40}), distance (${result?.weights.distance ?? 30}), langue (${result?.weights.language ?? 15}) et médecin qui vous a déjà suivi (${result?.weights.history ?? 15}).`}
        />

        {busy || !result ? <Loader label="Recherche des médecins..." /> : null}

        {result && !busy && result.doctors.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar-days"
              title="Aucun créneau libre"
              message="Aucun médecin de cette spécialité n’a de créneau dans les 14 prochains jours. Vous pouvez activer une alerte désistement depuis la fiche d’un médecin."
            />
          </Card>
        ) : null}

        {result && !busy
          ? result.doctors.map((d) => (
              <Card key={`${d.doctorId}-${d.facilityId}`} style={s.card}>
                <View style={s.row}>
                  <Text style={s.rank}>{d.rank}</Text>
                  <View style={s.flex}>
                    <Text style={type.h2}>{d.doctorName}</Text>
                    <Text style={s.muted}>
                      {[d.facilityName, d.distanceKm !== null ? `${d.distanceKm} km` : d.city].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={s.score}>{d.score}/100</Text>
                </View>
                {d.reasons.map((r) => (
                  <Text key={r} style={s.reason}>✓ {r}</Text>
                ))}
                <View style={s.chips}>
                  <Chip
                    icon="clock"
                    label={formatSlot(d.nextSlot.startsAt, d.timezone)}
                    onPress={() => navigation.navigate('SlotPicker', { doctorId: d.doctorId, facilityId: d.facilityId })}
                  />
                  <Chip
                    icon="user"
                    label="Voir la fiche"
                    onPress={() => navigation.navigate('DoctorProfile', { doctorId: d.doctorId })}
                  />
                </View>
              </Card>
            ))
          : null}

        <Button title="Changer de spécialité" variant="ghost" onPress={() => setStep('specialty')} />
        <Button title="Recommencer" variant="ghost" onPress={restart} />
      </Screen>
    );
  }

  return (
    <Screen key="symptoms">
      <Notice tone="warning" message={catalog.disclaimer} />

      {profiles.length > 1 ? (
        <>
          <SectionTitle title="Pour qui ?" />
          <View style={s.chips}>
            {profiles.map((p) => (
              <Chip
                key={p.id}
                label={p.relationship === 'self' ? 'Moi' : p.first_name}
                selected={p.id === profileId}
                onPress={() => setProfileId(p.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle title="Signes d’alerte" />
      <Card style={[s.card, s.alertCard]}>
        {catalog.redFlags.map((f) => (
          <Checkbox key={f.code} label={f.label} checked={selected.includes(f.code)} onChange={(v) => toggle(f.code, v)} />
        ))}
      </Card>

      <SectionTitle title="Autres symptômes" />
      <Card style={s.card}>
        {catalog.symptoms.map((sy) => (
          <Checkbox key={sy.code} label={sy.label} checked={selected.includes(sy.code)} onChange={(v) => toggle(sy.code, v)} />
        ))}
      </Card>

      {hasFlag ? (
        <Notice tone="danger" message="Vous avez coché un signe d’alerte : appelez les secours sans attendre." />
      ) : null}
      <Button
        title={hasFlag ? 'Voir que faire maintenant' : 'Trouver la bonne spécialité'}
        variant={hasFlag ? 'danger' : 'primary'}
        icon="arrow-right"
        disabled={!selected.length}
        loading={busy}
        onPress={orient}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: space.xs },
  cardSelected: { borderWidth: 2, borderColor: color.primary },
  alertCard: { backgroundColor: color.dangerSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { ...type.caption, color: color.textMuted },
  badge: { ...type.label, color: color.primary },
  rank: { ...type.h2, color: color.primary, minWidth: 24 },
  score: { ...type.bodyMedium, color: color.primary },
  reason: { ...type.caption, color: color.successInk },
  disclaimer: { ...type.caption, color: color.textMuted, textAlign: 'center' },
});
