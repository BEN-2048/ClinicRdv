import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import { FACILITY_TYPE_LABEL, FacilitiesApi, FacilityDetail } from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  InfoRow,
  ListItem,
  Loader,
  Notice,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { color, space, type } from '../../theme';
import { callNumber } from './FacilityListScreen';
import { doctorName } from '../../utils/doctorName';

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const TIME_ZONE_LABEL = {
  'Africa/Kinshasa': 'Heure de Kinshasa (UTC+1)',
  'Africa/Lubumbashi': 'Heure de Lubumbashi (UTC+2)',
} as const;

export default function FacilityDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const facilityId = Number(route.params?.facilityId);

  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    FacilitiesApi.get(facilityId)
      .then(({ data }) => active && setFacility(data))
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [facilityId]);

  useEffect(() => {
    if (facility) navigation.setOptions({ title: facility.name });
  }, [facility, navigation]);

  if (loading) return <Loader fullscreen label="Chargement de l'établissement..." />;

  if (error || !facility) {
    return (
      <Screen>
        <ErrorState message={error || 'Établissement introuvable.'} />
        <Button title="Retour" variant="secondary" icon="arrow-back" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const hasCoordinates = facility.latitude && facility.longitude;
  const openMap = () =>
    Linking.openURL(
      hasCoordinates
        ? `https://maps.google.com/?q=${facility.latitude},${facility.longitude}`
        : `https://maps.google.com/?q=${encodeURIComponent([facility.name, facility.address, facility.city].filter(Boolean).join(', '))}`
    );

  return (
    <Screen>
      <Card style={s.section}>
        <Text style={type.h2}>{facility.name}</Text>
        <Text style={s.muted}>
          {[FACILITY_TYPE_LABEL[facility.type], facility.code].join(' · ')}
        </Text>
        {facility.description ? <Text style={s.detail}>{facility.description}</Text> : null}
        <InfoRow
          icon="location-outline"
          label="Adresse"
          value={[facility.address, facility.city, facility.province].filter(Boolean).join(', ') || 'Non renseignée'}
        />
        <InfoRow icon="time-outline" label="Fuseau horaire" value={TIME_ZONE_LABEL[facility.timezone]} />
        {facility.email ? <InfoRow icon="mail-outline" label="E-mail" value={facility.email} /> : null}
        <View style={s.actions}>
          {facility.phone ? (
            <Button
              title="Appeler"
              icon="call-outline"
              onPress={() => callNumber(facility.phone as string)}
              style={s.flex}
            />
          ) : null}
          <Button title="Itinéraire" icon="navigate-outline" variant="secondary" onPress={openMap} style={s.flex} />
        </View>
      </Card>

      {facility.emergency_phone ? (
        <Notice tone="danger" icon="alert-circle-outline" title="Urgences" message={`Ligne d'urgence : ${facility.emergency_phone}`}>
          <Button
            title="Appeler les urgences"
            variant="danger"
            icon="call"
            size="sm"
            fullWidth={false}
            onPress={() => callNumber(facility.emergency_phone as string)}
          />
        </Notice>
      ) : null}

      {facility.services.length ? (
        <>
          <SectionTitle title="Services" />
          <View style={s.chips}>
            {facility.services.map((sv) => (
              <Chip
                key={sv.code}
                label={
                  sv.unavailable_until
                    ? `${sv.name} · indisponible jusqu’au ${new Date(sv.unavailable_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                    : sv.available_24h
                      ? `${sv.name} · 24h/24`
                      : sv.name
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {facility.opening_hours.length ? (
        <>
          <SectionTitle title="Horaires d'ouverture" />
          <Card style={s.section}>
            {facility.opening_hours.map((h, i) => (
              <View key={`${h.weekday}-${i}`} style={s.hourRow}>
                <Text style={type.bodyMedium}>{WEEKDAYS[h.weekday]}</Text>
                <Text style={s.detail}>{h.opensAt} – {h.closesAt}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title={`Médecins (${facility.doctors.length})`} />
      {facility.doctors.length === 0 ? (
        <EmptyState icon="medkit-outline" title="Aucun médecin disponible pour le moment" />
      ) : (
        <Card style={s.list}>
          {facility.doctors.map((d, i) => {
            const name = `${d.first_name} ${d.last_name}`;
            return (
              <ListItem
                key={d.id}
                title={doctorName(name)}
                subtitle={`${d.specialty} · ${d.fee} USD`}
                left={<Avatar name={name} size={40} />}
                onPress={() => navigation.navigate('DoctorProfile', { doctorId: d.id, facilityId: facility.id })}
                style={i > 0 ? s.divider : undefined}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: space.sm },
  muted: { ...type.caption, color: color.textMuted },
  detail: { ...type.body, color: color.textSecondary },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between' },
  list: { paddingVertical: 0 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
