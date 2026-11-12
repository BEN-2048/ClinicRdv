import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import {
  FACILITY_TYPE_LABEL,
  FacilitiesApi,
  FacilitySummary,
} from '../../api/services';
import {
  AppHeader,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Loader,
  Screen,
} from '../../components/ui';
import { color, space, type } from '../../theme';

const QUICK_SERVICES = ['emergency', 'maternity', 'pediatrics', 'laboratory', 'imaging'];

export const callNumber = (phone: string) =>
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);

export default function FacilityListScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [service, setService] = useState<string | undefined>();
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [facilities, setFacilities] = useState<FacilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    FacilitiesApi.meta()
      .then(({ data }) => setServiceNames(Object.fromEntries(data.services.map((s) => [s.code, s.name]))))
      .catch(() => setServiceNames({}));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await FacilitiesApi.search({ q: query.trim() || undefined, service });
      setFacilities(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [query, service]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Screen
      header={<AppHeader title="Établissements" subtitle="Hôpitaux, cliniques et centres de santé" />}
      refreshing={false}
      onRefresh={load}
    >
      <Input
        icon="magnifying-glass"
        value={query}
        onChangeText={setQuery}
        placeholder="Nom, ville ou adresse"
        autoCapitalize="none"
      />

      <View style={s.chips}>
        {QUICK_SERVICES.filter((code) => serviceNames[code]).map((code) => (
          <Chip
            key={code}
            label={serviceNames[code]}
            selected={service === code}
            onPress={() => setService(service === code ? undefined : code)}
          />
        ))}
      </View>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {loading ? (
        <Loader label="Recherche des établissements..." />
      ) : facilities.length === 0 ? (
        <EmptyState
          icon="building"
          title="Aucun établissement trouvé"
          message="Modifiez votre recherche ou retirez un filtre."
        />
      ) : (
        facilities.map((f) => (
          <Card
            key={f.id}
            style={s.card}
            onPress={() => navigation.navigate('FacilityDetail', { facilityId: f.id })}
            accessibilityLabel={`Ouvrir ${f.name}`}
          >
            <View style={s.head}>
              <View style={s.iconBox}>
                <Icon name="building" solid size="md" color={color.primary} />
              </View>
              <View style={s.flex}>
                <Text style={type.h3} numberOfLines={2}>{f.name}</Text>
                <Text style={s.muted}>
                  {[FACILITY_TYPE_LABEL[f.type], f.city, f.distance_km ? `${f.distance_km} km` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>

            {f.specialties.length ? (
              <Text style={s.detail} numberOfLines={2}>{f.specialties.join(', ')}</Text>
            ) : null}

            <View style={s.footer}>
              <Text style={s.muted}>
                {f.doctors_count} médecin{f.doctors_count > 1 ? 's' : ''}
                {f.services.includes('emergency') ? ' · Urgences' : ''}
              </Text>
              {f.phone ? (
                <Button
                  title="Appeler"
                  icon="phone"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => callNumber(f.phone as string)}
                />
              ) : null}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  card: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: color.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { ...type.caption, color: color.textMuted },
  detail: { ...type.body, color: color.textSecondary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
