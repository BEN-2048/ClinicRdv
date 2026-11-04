import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { StaffApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { Button, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import { ErrorCard, Loading, StatTile, StatusBadge, errorText, formatDateTime, shared } from './shared';

type Dashboard = {
  today: { total: number; confirmed: number; pending: number; cancelled: number; done: number };
  activeDoctors: number;
  doctorsOnLeaveToday: number;
  upcoming: { id: number; starts_at: string; status: string; doctor_name: string; patient_name: string }[];
};

export default function SecretaryDashboardScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await StaffApi.dashboard();
      setData(res.data as Dashboard);
    } catch (err) {
      setError(errorText(err, 'Impossible de charger le tableau de bord.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={ui.page}>
      <Header title={`Bonjour ${user?.first_name ?? ''}`.trim()} subtitle="Espace secrétariat" right="🗂" />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}
      >
        {loading && <Loading label="Chargement du tableau de bord..." />}
        {error && <ErrorCard message={error} onRetry={() => load()} />}

        {!loading && !error && data && (
          <>
            <Text style={ui.h2}>Aujourd'hui</Text>
            <View style={shared.grid}>
              <StatTile label="Rendez-vous" value={data.today.total} />
              <StatTile label="Confirmés" value={data.today.confirmed} color={colors.success} />
              <StatTile label="Annulés" value={data.today.cancelled} color={colors.error} />
              <StatTile label="Médecins actifs" value={data.activeDoctors} color={colors.secondary} />
            </View>
            {data.doctorsOnLeaveToday > 0 && (
              <Text style={[ui.muted, { marginBottom: 10 }]}>
                {data.doctorsOnLeaveToday} médecin(s) en congé aujourd'hui.
              </Text>
            )}

            <Button title="+ Nouveau rendez-vous" onPress={() => navigation.navigate('SecretaryBook')} />

            <Text style={[ui.h2, ui.section]}>Prochains rendez-vous</Text>
            {data.upcoming.length === 0 && (
              <View style={ui.card}><Text style={shared.empty}>Aucun rendez-vous à venir.</Text></View>
            )}
            {data.upcoming.map((a) => (
              <View key={a.id} style={ui.card}>
                <View style={shared.row}>
                  <Text style={shared.title}>{a.patient_name}</Text>
                  <StatusBadge status={a.status} />
                </View>
                <Text style={shared.detail}>Dr. {a.doctor_name}</Text>
                <Text style={ui.muted}>{formatDateTime(a.starts_at)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
