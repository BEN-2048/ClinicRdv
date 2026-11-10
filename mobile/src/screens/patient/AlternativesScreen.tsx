import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import {
  AlternativeOption,
  AlternativesResult,
  AppointmentsApi,
  CANCEL_REASON_LABEL,
  CancelReason,
  DoctorsApi,
} from '../../api/services';
import { Card, Chip, EmptyState, ErrorState, Loader, Notice, Screen, SectionTitle } from '../../components/ui';
import { color, space, type } from '../../theme';

const GROUPS: { kind: AlternativeOption['kind']; title: string }[] = [
  { kind: 'same_doctor', title: 'Avec le même médecin' },
  { kind: 'same_facility', title: 'Dans le même établissement' },
  { kind: 'other_facility', title: 'Dans un autre établissement' },
];

const formatSlot = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export default function AlternativesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const appointmentId: number | undefined = route.params?.appointmentId;
  const doctorId: number | undefined = route.params?.doctorId;
  const facilityId: number | undefined = route.params?.facilityId;

  const [data, setData] = useState<AlternativesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = appointmentId
        ? await AppointmentsApi.alternatives(appointmentId)
        : await DoctorsApi.alternatives(Number(doctorId), facilityId);
      setData(res.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [appointmentId, doctorId, facilityId]);

  useEffect(() => {
    load();
  }, [load]);

  const afterRedirect = (sharing: { facilityName: string; sameFacility: boolean; consentScope: string | null }) => {
    const shared = sharing.sameFacility || !!sharing.consentScope;
    Alert.alert(
      'Nouveau rendez-vous confirmé',
      shared
        ? 'Votre ancien rendez-vous est annulé.'
        : `Votre ancien rendez-vous est annulé. Votre dossier médical n’est pas transmis automatiquement à ${sharing.facilityName} : vous pouvez l’autoriser depuis « Partage et historique des accès ».`,
      shared
        ? [{ text: 'OK', onPress: () => navigation.goBack() }]
        : [
            { text: 'Plus tard', style: 'cancel', onPress: () => navigation.goBack() },
            { text: 'Partager mon dossier', onPress: () => navigation.navigate('Sharing') },
          ]
    );
  };

  const choose = (option: AlternativeOption, startsAt: string) => {
    const when = formatSlot(startsAt, option.timezone);
    if (!appointmentId) {
      navigation.navigate('SlotPicker', { doctorId: option.doctorId, facilityId: option.facilityId });
      return;
    }
    Alert.alert(
      'Confirmer le changement',
      `Réserver avec ${option.doctorName} le ${when} (${option.facilityName}) ?${
        data?.origin.status === 'cancelled' ? '' : ' Votre rendez-vous actuel sera annulé.'
      }`,
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await AppointmentsApi.redirect(appointmentId, {
                doctorId: option.doctorId,
                startsAt,
                facilityId: option.facilityId,
              });
              afterRedirect(res.data.recordSharing);
            } catch (e) {
              Alert.alert('Réservation impossible', errorMessage(e));
              load();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (error) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!data) return <Loader fullscreen label="Recherche des solutions..." />;

  const origin = data.origin;
  const reason = origin.cancelReason ? CANCEL_REASON_LABEL[origin.cancelReason as CancelReason] : null;

  return (
    <Screen>
      <Card style={s.card}>
        <Text style={type.h2}>{origin.doctorName}</Text>
        <Text style={s.muted}>{[origin.specialty, origin.facilityName].filter(Boolean).join(' · ')}</Text>
        {origin.startsAt ? (
          <Text style={type.body}>
            Rendez-vous du {formatSlot(origin.startsAt, origin.timezone)}
            {origin.status === 'cancelled' ? ' (annulé)' : ''}
          </Text>
        ) : null}
        {reason && origin.status === 'cancelled' ? <Text style={s.danger}>{reason}</Text> : null}
      </Card>

      <Notice
        tone="info"
        message={`Seuls des médecins et des créneaux réellement disponibles dans les ${data.horizonDays} prochains jours sont proposés. Rien n’est modifié avant votre confirmation, et votre dossier médical n’est jamais transmis automatiquement.`}
      />

      {data.options.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-clear-outline"
            title="Aucune solution disponible"
            message="Aucun médecin de cette spécialité n’a de créneau libre dans les prochains jours. Activez une alerte désistement ou contactez l’établissement."
          />
        </Card>
      ) : null}

      {GROUPS.map(({ kind, title }) => {
        const options = data.options.filter((o) => o.kind === kind);
        if (!options.length) return null;
        return (
          <View key={kind} style={s.group}>
            <SectionTitle title={title} />
            {options.map((o) => (
              <Card key={`${o.doctorId}-${o.facilityId}`} style={s.card}>
                <Text style={type.h2}>{o.doctorName}</Text>
                <Text style={s.muted}>
                  {[o.specialty, o.facilityName, o.distanceKm !== null ? `${o.distanceKm} km` : o.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.reason}>{o.reason}</Text>
                <View style={s.chips}>
                  {o.slots.map((slot) => (
                    <Chip
                      key={slot.startsAt}
                      icon="time-outline"
                      label={formatSlot(slot.startsAt, o.timezone)}
                      onPress={busy ? undefined : () => choose(o, slot.startsAt)}
                    />
                  ))}
                </View>
              </Card>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: space.xs },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { ...type.caption, color: color.textMuted },
  reason: { ...type.label, color: color.primary },
  danger: { ...type.bodyMedium, color: color.dangerInk },
});
