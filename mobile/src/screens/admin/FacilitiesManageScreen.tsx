import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import { FACILITY_TYPE_LABEL, ManagedFacilitySummary, StaffApi, StaffScope } from '../../api/services';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Loader,
  Screen,
  StatusBadge,
} from '../../components/ui';
import { color, space, type } from '../../theme';

export const FACILITY_STATUS_BADGE = {
  active: { status: 'confirmed', label: 'Actif' },
  pending: { status: 'pending', label: 'En attente de validation' },
  suspended: { status: 'cancelled', label: 'Suspendu' },
} as const;

export default function FacilitiesManageScreen() {
  const navigation = useNavigation<any>();
  const [scope, setScope] = useState<StaffScope | null>(null);
  const [facilities, setFacilities] = useState<ManagedFacilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, f] = await Promise.all([StaffApi.scope(), StaffApi.facilities()]);
      setScope(s.data);
      setFacilities(f.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <Loader fullscreen label="Chargement des établissements..." />;

  return (
    <Screen
      refreshing={false}
      onRefresh={load}
      footer={
        scope?.platformAdmin ? (
          <Button title="Nouvel établissement" icon="add" onPress={() => navigation.navigate('FacilityEdit')} />
        ) : undefined
      }
    >
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <Text style={s.intro}>
        {scope?.platformAdmin
          ? 'Administration de la plateforme : tous les établissements.'
          : 'Établissements auxquels votre compte est rattaché.'}
      </Text>

      {facilities.length === 0 ? (
        <EmptyState icon="business-outline" title="Aucun établissement" />
      ) : (
        facilities.map((f) => {
          const badge = FACILITY_STATUS_BADGE[f.status];
          return (
            <Card
              key={f.id}
              style={s.card}
              onPress={() => navigation.navigate('FacilityEdit', { facilityId: f.id })}
              accessibilityLabel={`Gérer ${f.name}`}
            >
              <View style={s.row}>
                <Icon name="business" size="md" color={color.primary} />
                <View style={s.flex}>
                  <Text style={type.h3} numberOfLines={1}>{f.name}</Text>
                  <Text style={s.muted}>
                    {[f.code, FACILITY_TYPE_LABEL[f.type], f.city].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              <StatusBadge status={badge.status} label={badge.label} />
              <Text style={s.muted}>
                {f.doctors_count} médecin(s) · {f.members_count} membre(s) du personnel
                {f.can_manage ? '' : ' · consultation seule'}
              </Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  intro: { ...type.caption, color: color.textMuted },
  card: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  muted: { ...type.caption, color: color.textMuted },
});
