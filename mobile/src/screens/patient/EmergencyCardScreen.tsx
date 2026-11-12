import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { errorMessage } from '../../api/client';
import { PatientProfile, PatientsApi, RecordApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import {
  EmergencyCard,
  enabledCardIds,
  loadEmergencyCards,
  removeEmergencyCard,
  saveEmergencyCard,
  unlockEmergencyCards,
} from '../../services/emergencyCard';
import { Button, Card, EmptyState, Icon, Notice, Screen, SectionTitle } from '../../components/ui';
import { color, space, type } from '../../theme';

const SEVERITY: Record<string, string> = { severe: 'SÉVÈRE', moderate: 'modérée', mild: 'légère', unknown: '' };
const formatDay = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

function CardView({ card }: { card: EmergencyCard }) {
  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Icon name="kit-medical" size="lg" color={color.dangerInk} />
        <View style={s.flex}>
          <Text style={type.h2}>{card.name}</Text>
          <Text style={s.muted}>{[card.patientNumber, card.birthDate ? `Né(e) le ${formatDay(card.birthDate)}` : null].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <Text style={s.section}>Allergies</Text>
      {card.allergies.length ? card.allergies.map((a, i) => (
        <Text key={i} style={[s.line, a.severity === 'severe' && s.severe]}>
          • {a.substance}{SEVERITY[a.severity] ? ` (${SEVERITY[a.severity]})` : ''}{a.reaction ? ` — ${a.reaction}` : ''}
        </Text>
      )) : <Text style={s.line}>Aucune allergie connue enregistrée</Text>}

      <Text style={s.section}>Antécédents</Text>
      {card.conditions.length ? card.conditions.map((c, i) => (
        <Text key={i} style={s.line}>• {c.label}{c.code ? ` (${c.code})` : ''}</Text>
      )) : <Text style={s.line}>Aucun</Text>}

      <Text style={s.section}>Traitements en cours</Text>
      {card.medications.length ? card.medications.map((m, i) => (
        <Text key={i} style={s.line}>• {[m.name, m.dosage, m.frequency].filter(Boolean).join(' · ')}</Text>
      )) : <Text style={s.line}>Aucun</Text>}

      <Text style={s.section}>Vaccinations</Text>
      {card.immunizations.length ? card.immunizations.map((v, i) => (
        <Text key={i} style={s.line}>• {v.vaccine} — {formatDay(v.date)}</Text>
      )) : <Text style={s.line}>Aucune</Text>}

      <Text style={s.updated}>Mise à jour le {new Date(card.updatedAt).toLocaleString('fr-FR')}</Text>
    </Card>
  );
}

export default function EmergencyCardScreen() {
  const { user, authStatus } = useAuth();
  const userId = user?.id != null ? String(user.id) : null;
  const online = authStatus === 'authenticated';

  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [enabled, setEnabled] = useState<number[]>([]);
  const [cards, setCards] = useState<EmergencyCard[] | null>(null);
  const [unprotected, setUnprotected] = useState(false);
  const [busy, setBusy] = useState<number | 'all' | null>(null);

  const loadState = useCallback(async () => {
    if (!userId) return;
    setEnabled(await enabledCardIds(userId));
    if (online) {
      try {
        const { data } = await PatientsApi.mine();
        setProfiles(data.filter((p) => ['self', 'verified'].includes(p.link_status)));
      } catch {
        setProfiles([]);
      }
    }
  }, [userId, online]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const toggle = async (profile: PatientProfile, value: boolean) => {
    if (!userId) return;
    setBusy(profile.id);
    try {
      if (value) {
        const { data } = await RecordApi.get(profile.id);
        await saveEmergencyCard(userId, data);
      } else {
        await removeEmergencyCard(userId, profile.id);
      }
      setCards(null);
      await loadState();
    } catch (e) {
      Alert.alert('Action impossible', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const refreshAll = async () => {
    if (!userId) return;
    setBusy('all');
    try {
      for (const id of enabled) {
        const { data } = await RecordApi.get(id);
        await saveEmergencyCard(userId, data);
      }
      setCards(null);
      Alert.alert('Fiches mises à jour', 'Vos fiches d’urgence sont à jour sur ce téléphone.');
    } catch (e) {
      Alert.alert('Mise à jour impossible', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const show = async () => {
    if (!userId) return;
    try {
      const unlock = await unlockEmergencyCards();
      if (!unlock.ok) return;
      setUnprotected(!unlock.protectedByDevice);
      setCards(await loadEmergencyCards(userId));
    } catch (e) {
      Alert.alert('Ouverture impossible', errorMessage(e));
    }
  };

  return (
    <Screen>
      <Notice
        tone="danger"
        icon="phone"
        title="En cas d’urgence vitale, appelez d’abord les secours."
        message="Cette fiche résume vos informations essentielles pour les soignants. Elle ne remplace pas un avis médical."
      />

      {online ? (
        <>
          <SectionTitle title="Disponible sans connexion" />
          <Card style={s.list}>
            {profiles.length === 0 ? (
              <Text style={s.muted}>Aucun profil disponible.</Text>
            ) : (
              profiles.map((p) => (
                <View key={p.id} style={s.toggle}>
                  <Text style={[type.bodyMedium, s.flex]}>
                    {p.link_status === 'self' ? 'Ma fiche' : `${p.first_name} ${p.last_name}`}
                  </Text>
                  <Switch
                    value={enabled.includes(p.id)}
                    disabled={busy !== null}
                    onValueChange={(v) => toggle(p, v)}
                  />
                </View>
              ))
            )}
          </Card>
          <Text style={s.muted}>
            Seule la synthèse est enregistrée sur ce téléphone, chiffrée par le système : allergies, antécédents et traitements en cours, vaccinations. Les informations confidentielles et les documents n’y figurent jamais. Tout est effacé à la déconnexion.
          </Text>
          {enabled.length ? (
            <Button title="Mettre à jour mes fiches" icon="arrows-rotate" variant="secondary" loading={busy === 'all'} onPress={refreshAll} />
          ) : null}
        </>
      ) : (
        <Notice icon="cloud" message="Vous êtes hors ligne : la fiche affichée est la dernière version enregistrée sur ce téléphone." />
      )}

      {cards === null ? (
        enabled.length ? (
          <Button title="Afficher la fiche d’urgence" icon="lock-open" variant="danger" onPress={show} />
        ) : (
          <EmptyState icon="kit-medical" title="Aucune fiche enregistrée" message={online ? 'Activez une fiche ci-dessus.' : 'Connectez-vous à Internet pour activer une fiche.'} />
        )
      ) : (
        <>
          {unprotected ? (
            <Notice tone="warning" icon="triangle-exclamation" message="Votre téléphone n’a pas de code de verrouillage : n’importe qui peut afficher cette fiche. Activez un code dans les réglages." />
          ) : null}
          {cards.map((c) => <CardView key={c.patientId} card={c} />)}
          <Button title="Masquer" variant="secondary" onPress={() => setCards(null)} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: space.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { gap: 4, borderTopWidth: 4, borderTopColor: color.dangerInk },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  section: { ...type.label, color: color.dangerInk, marginTop: space.sm },
  line: { ...type.body, color: color.text },
  severe: { color: color.dangerInk, fontWeight: '700' },
  muted: { ...type.caption, color: color.textMuted },
  updated: { ...type.caption, color: color.textMuted, marginTop: space.sm },
});
