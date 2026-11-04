import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { StaffApi, StaffDoctor } from '../../api/services';
import { Avatar, Button, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import { ErrorCard, Loading, errorText, shared } from './shared';

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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActive = (d: StaffDoctor) =>
    Alert.alert(
      d.active ? 'Désactiver le médecin' : 'Réactiver le médecin',
      d.active
        ? `Dr. ${d.last_name} ne sera plus proposé aux patients. Les RDV existants sont conservés.`
        : `Dr. ${d.last_name} sera de nouveau proposé aux patients.`,
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
      ],
    );

  return (
    <View style={ui.page}>
      <Header title="Médecins" subtitle={`${doctors.filter((d) => d.active).length} actif(s)`} right="🩺" />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}
      >
        <Button title="+ Ajouter un médecin" onPress={() => navigation.navigate('SecretaryDoctorForm')} />
        <View style={{ height: 14 }} />

        {loading && <Loading label="Chargement des médecins..." />}
        {error && <ErrorCard message={error} onRetry={() => load()} />}
        {!loading && !error && doctors.length === 0 && (
          <View style={ui.card}><Text style={shared.empty}>Aucun médecin enregistré.</Text></View>
        )}

        {!loading && !error && doctors.map((d) => (
          <View key={d.id} style={[ui.card, !d.active && { opacity: 0.6 }]}>
            <View style={ui.line}>
              <Avatar initials={`${d.first_name.charAt(0)}${d.last_name.charAt(0)}`.toUpperCase()} tint="#E5E9FF" />
              <View style={{ flex: 1 }}>
                <Text style={ui.label}>Dr. {d.first_name} {d.last_name}</Text>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{d.specialty}</Text>
                <Text style={ui.muted}>{d.consultation_minutes} min · {d.fee} USD</Text>
              </View>
              <Text style={[ui.badge, !d.active && { color: colors.error, backgroundColor: '#FDECEC' }]}>
                {d.active ? 'Actif' : 'Inactif'}
              </Text>
            </View>
            <View style={shared.actions}>
              <View style={shared.action}>
                <Button
                  title="Horaires"
                  secondary
                  onPress={() => navigation.navigate('SecretaryDoctorSchedule', {
                    doctorId: d.id, name: `Dr. ${d.last_name}`,
                  })}
                />
              </View>
              <View style={shared.action}>
                <Button title="Modifier" secondary onPress={() => navigation.navigate('SecretaryDoctorForm', { doctorId: d.id })} />
              </View>
              <View style={shared.action}>
                <Button title={d.active ? 'Désactiver' : 'Activer'} onPress={() => toggleActive(d)} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
