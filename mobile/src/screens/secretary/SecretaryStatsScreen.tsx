import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StaffApi } from '../../api/services';
import { AppHeader, Card, EmptyState, Screen, SectionTitle, SegmentedTabs, StatCard } from '../../components/ui';
import { color, radius, space, type } from '../../theme';
import { ErrorCard, Loading, clinicToday, errorText, shared, shiftDate } from './shared';
import { doctorName } from '../../utils/doctorName';

type Stats = {
  total: number;
  byStatus: Record<string, number>;
  cancellationRate: number;
  newPatients: number;
  byDoctor: { doctor_id: number; doctor_name: string; total: number; cancelled: number }[];
};

type Period = '7' | '30' | '90';

export default function SecretaryStatsScreen() {
  const [period, setPeriod] = useState<Period>('30');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = Number(period);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const to = clinicToday();
        const res = await StaffApi.stats({ from: shiftDate(to, 1 - days), to });
        setStats(res.data as Stats);
      } catch (err) {
        setError(errorText(err, 'Impossible de charger les statistiques.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const max = Math.max(1, ...(stats?.byDoctor.map((d) => d.total) ?? [0]));

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => load(true)}
      header={<AppHeader title="Statistiques" subtitle="Activité du cabinet" />}
    >
      <SegmentedTabs<Period>
        value={period}
        onChange={setPeriod}
        tabs={[
          { key: '7', label: '7 jours' },
          { key: '30', label: '30 jours' },
          { key: '90', label: '90 jours' },
        ]}
      />

      {loading ? <Loading label="Calcul des statistiques..." /> : null}
      {error ? <ErrorCard message={error} onRetry={() => load()} /> : null}

      {!loading && !error && stats ? (
        <>
          <View style={shared.grid}>
            <StatCard style={shared.tile} icon="calendar-outline" label="Rendez-vous" value={stats.total} />
            <StatCard
              style={shared.tile}
              icon="checkmark-done-outline"
              tone="success"
              label="Terminés"
              value={stats.byStatus.done ?? 0}
            />
            <StatCard
              style={shared.tile}
              icon="trending-down-outline"
              tone="danger"
              label="Taux d'annulation"
              value={`${stats.cancellationRate} %`}
            />
            <StatCard
              style={shared.tile}
              icon="person-add-outline"
              tone="neutral"
              label="Nouveaux patients"
              value={stats.newPatients}
            />
          </View>

          <SectionTitle title="Par médecin" />
          {stats.byDoctor.length === 0 ? (
            <Card>
              <EmptyState icon="bar-chart-outline" title="Aucune activité sur la période" />
            </Card>
          ) : (
            <Card style={s.list}>
              {stats.byDoctor.map((d, i) => (
                <View key={d.doctor_id} style={[s.item, i > 0 && s.divider]}>
                  <View style={shared.row}>
                    <Text style={[type.bodyMedium, shared.flex]} numberOfLines={1}>
                      {doctorName(d.doctor_name)}
                    </Text>
                    <Text style={shared.muted}>
                      {d.total} RDV · {d.cancelled} annulé{d.cancelled > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={s.track}>
                    <View style={[s.bar, { width: `${(d.total / max) * 100}%` }]} />
                  </View>
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { paddingVertical: space.xs },
  item: { gap: space.xs, paddingVertical: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  track: { height: 8, borderRadius: radius.full, backgroundColor: color.primarySubtle, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.full, backgroundColor: color.primary },
});
