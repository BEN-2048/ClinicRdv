import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StaffApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  EmptyState,
  InfoRow,
  Notice,
  Screen,
  SectionTitle,
  StatCard,
} from '../../components/ui';
import { ErrorCard, Loading, StatusBadge, errorText, formatDateTime, shared } from './shared';
import { doctorName } from '../../utils/doctorName';

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const fullName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => load(true)}
      header={
        <AppHeader
          title={`Bonjour ${user?.first_name ?? ''}`.trim()}
          subtitle="Espace secrétariat"
          right={<Avatar name={fullName} size={40} />}
        />
      }
    >
      {loading ? <Loading label="Chargement du tableau de bord..." /> : null}
      {error ? <ErrorCard message={error} onRetry={() => load()} /> : null}

      {!loading && !error && data ? (
        <>
          <SectionTitle title="Aujourd'hui" />
          <View style={shared.grid}>
            <StatCard style={shared.tile} icon="calendar" label="Rendez-vous" value={data.today.total} />
            <StatCard
              style={shared.tile}
              icon="circle-check"
              tone="success"
              label="Confirmés"
              value={data.today.confirmed}
            />
            <StatCard
              style={shared.tile}
              icon="circle-xmark"
              tone="danger"
              label="Annulés"
              value={data.today.cancelled}
            />
            <StatCard
              style={shared.tile}
              icon="kit-medical"
              tone="neutral"
              label="Médecins actifs"
              value={data.activeDoctors}
            />
          </View>

          {data.doctorsOnLeaveToday > 0 ? (
            <Notice
              tone="warning"
              icon="plane"
              message={`${data.doctorsOnLeaveToday} médecin(s) en congé aujourd'hui.`}
            />
          ) : null}

          <Button title="Nouveau rendez-vous" icon="plus" onPress={() => navigation.navigate('SecretaryBook')} />

          <SectionTitle
            title="Prochains rendez-vous"
            actionLabel="Tout voir"
            onAction={() => navigation.navigate('Rendez-vous')}
          />
          {data.upcoming.length === 0 ? (
            <Card>
              <EmptyState icon="calendar-days" title="Aucun rendez-vous à venir" />
            </Card>
          ) : (
            data.upcoming.map((a) => (
              <Card key={a.id} style={shared.card}>
                <View style={shared.row}>
                  <Text style={shared.title} numberOfLines={1}>
                    {a.patient_name}
                  </Text>
                  <StatusBadge status={a.status} />
                </View>
                <InfoRow icon="user" label="Médecin" value={doctorName(a.doctor_name)} />
                <InfoRow icon="clock" label="Horaire" value={formatDateTime(a.starts_at)} strong />
              </Card>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}
