import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { StaffApi } from '../../api/services';
import { Chip, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import { ErrorCard, Loading, StatTile, clinicToday, errorText, shared, shiftDate } from './shared';

type Stats = {
  total: number;
  byStatus: Record<string, number>;
  cancellationRate: number;
  newPatients: number;
  byDoctor: { doctor_id: number; doctor_name: string; total: number; cancelled: number }[];
};

const PERIODS = [
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
  { label: '90 jours', days: 90 },
];

export default function SecretaryStatsScreen() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
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
  }, [days]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const max = Math.max(1, ...(stats?.byDoctor.map((d) => d.total) ?? [0]));

  return (
    <View style={ui.page}>
      <Header title="Statistiques" subtitle="Activité du cabinet" right="📊" />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {PERIODS.map((p) => (
            <Chip key={p.days} title={p.label} active={days === p.days} onPress={() => setDays(p.days)} />
          ))}
        </View>

        {loading && <Loading label="Calcul des statistiques..." />}
        {error && <ErrorCard message={error} onRetry={() => load()} />}

        {!loading && !error && stats && (
          <>
            <View style={shared.grid}>
              <StatTile label="Rendez-vous" value={stats.total} />
              <StatTile label="Terminés" value={stats.byStatus.done ?? 0} color={colors.secondary} />
              <StatTile label="Taux d'annulation" value={`${stats.cancellationRate} %`} color={colors.error} />
              <StatTile label="Nouveaux patients" value={stats.newPatients} color={colors.success} />
            </View>

            <Text style={[ui.h2, ui.section]}>Par médecin</Text>
            {stats.byDoctor.map((d) => (
              <View key={d.doctor_id} style={ui.card}>
                <View style={shared.row}>
                  <Text style={ui.label}>Dr. {d.doctor_name}</Text>
                  <Text style={ui.muted}>{d.total} RDV · {d.cancelled} annulé(s)</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.bar, { width: `${(d.total / max) * 100}%` }]} />
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: '#EDF2FB', marginTop: 10, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
