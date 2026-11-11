import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StaffApi, StaffDoctor } from '../../api/services';
import { AppHeader, Avatar, Button, Card, EmptyState, Icon, Screen } from '../../components/ui';
import { color, radius, space, type } from '../../theme';
import { ErrorCard, Loading, errorText, shared } from './shared';
import { doctorName } from '../../utils/doctorName';

export default function SecretaryDoctorsScreen() {
  const navigation = useNavigation<any>();
  const [doctors, setDoctors] = useState<StaffDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await StaffApi.doctors();
      setDoctors(res.data);
    } catch (err) {
      setError(errorText(err, 'Impossible de charger les médecins.'));
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

  const toggleActive = (d: StaffDoctor) =>
    Alert.alert(
      d.active ? 'Désactiver le médecin' : 'Réactiver le médecin',
      d.active
        ? `${doctorName(d.last_name)} ne sera plus proposé aux patients. Les RDV existants sont conservés.`
        : `${doctorName(d.last_name)} sera de nouveau proposé aux patients.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              await StaffApi.updateDoctor(d.id, { active: !d.active });
              load();
            } catch (err) {
              Alert.alert('Erreur', errorText(err, 'La modification a échoué.'));
            }
          },
        },
      ]
    );

  const activeCount = doctors.filter((d) => d.active).length;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => load(true)}
      header={
        <AppHeader title="Médecins" subtitle={`${activeCount} actif${activeCount > 1 ? 's' : ''}`} />
      }
    >
      <Button title="Ajouter un médecin" icon="person-add-outline" onPress={() => navigation.navigate('SecretaryDoctorForm')} />

      {loading ? <Loading label="Chargement des médecins..." /> : null}
      {error ? <ErrorCard message={error} onRetry={() => load()} /> : null}
      {!loading && !error && doctors.length === 0 ? (
        <Card>
          <EmptyState icon="medkit-outline" title="Aucun médecin enregistré" />
        </Card>
      ) : null}

      {!loading && !error
        ? doctors.map((d) => {
            const fullName = `${d.first_name} ${d.last_name}`.trim();
            return (
              <Card key={d.id} style={[shared.card, !d.active && s.inactive]}>
                <View style={s.head}>
                  <Avatar name={fullName} size={48} dotColor={d.active ? color.success : color.textMuted} />
                  <View style={shared.flex}>
                    <Text style={type.h3} numberOfLines={1}>
                      {doctorName(fullName)}
                    </Text>
                    <Text style={s.specialty}>{d.specialty}</Text>
                    <View style={s.meta}>
                      <Icon name="time-outline" size={14} color={color.textMuted} />
                      <Text style={shared.muted}>{d.consultation_minutes} min</Text>
                      <Icon name="cash-outline" size={14} color={color.textMuted} />
                      <Text style={shared.muted}>{d.fee} USD</Text>
                    </View>
                  </View>
                  <View style={[s.state, { backgroundColor: d.active ? color.successSoft : color.dangerSoft }]}>
                    <Text style={[s.stateText, { color: d.active ? color.successInk : color.dangerInk }]}>
                      {d.active ? 'Actif' : 'Inactif'}
                    </Text>
                  </View>
                </View>
                <View style={shared.actions}>
                  <Button
                    title="Horaires"
                    icon="time-outline"
                    size="sm"
                    variant="secondary"
                    style={shared.action}
                    onPress={() =>
                      navigation.navigate('SecretaryDoctorSchedule', { doctorId: d.id, name: doctorName(d.last_name) })
                    }
                  />
                  <Button
                    title="Modifier"
                    icon="create-outline"
                    size="sm"
                    variant="secondary"
                    style={shared.action}
                    onPress={() => navigation.navigate('SecretaryDoctorForm', { doctorId: d.id })}
                  />
                  <Button
                    title={d.active ? 'Désactiver' : 'Activer'}
                    icon={d.active ? 'pause-circle-outline' : 'play-circle-outline'}
                    size="sm"
                    variant={d.active ? 'danger' : 'primary'}
                    style={shared.action}
                    onPress={() => toggleActive(d)}
                  />
                </View>
              </Card>
            );
          })
        : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  inactive: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  specialty: { ...type.bodyMedium, color: color.primary, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: 2 },
  state: { borderRadius: radius.full, paddingHorizontal: space.xs, paddingVertical: 2 },
  stateText: { ...type.label },
});
