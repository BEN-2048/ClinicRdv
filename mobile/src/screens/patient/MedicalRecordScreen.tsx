import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { MedicalRecordApi, UsersApi } from '../../api/services';
import { Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

type Consultation = {
  appointment_id: number;
  starts_at: string;
  status: string;
  reason: string | null;
  doctor_first_name: string;
  doctor_last_name: string;
  specialty: string;
  note_id: number | null;
  notes: string | null;
  prescription: string | null;
  note_created_at: string | null;
};

type Tab = 'consultations' | 'documents' | 'traitements';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));

export default function MedicalRecordScreen() {
  const [tab, setTab] = useState<Tab>('consultations');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [patientName, setPatientName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const [records, profile] = await Promise.all([
        MedicalRecordApi.mine(),
        UsersApi.getMe(),
      ]);

      if (!Array.isArray(records.data)) {
        throw new Error('Format du dossier m?dical invalide.');
      }

      setConsultations(records.data as Consultation[]);

      const user = profile.data;
      setPatientName(
        [user?.first_name, user?.last_name].filter(Boolean).join(' ')
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Impossible de charger le dossier m?dical.'
      );
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

  const prescriptions = consultations.filter(
    (item) => item.prescription?.trim()
  );

  return (
    <View style={ui.page}>
      <Header
        title="Mon dossier m?dical"
        subtitle="Retrouvez votre historique de sant?"
      />

      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.profile}>
          <Text style={styles.profileLabel}>DOSSIER PATIENT</Text>
          <Text style={styles.profileName}>
            {patientName || 'Mon dossier m?dical'}
          </Text>
          <Text style={styles.profileDescription}>
            Informations m?dicales associ?es ? votre compte
          </Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{consultations.length}</Text>
            <Text style={styles.statLabel}>Consultations</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{prescriptions.length}</Text>
            <Text style={styles.statLabel}>Prescriptions</Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {([
            ['consultations', 'Consultations'],
            ['documents', 'Documents'],
            ['traitements', 'Traitements'],
          ] as const).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.tab, tab === key && styles.activeTab]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[
                styles.tabLabel,
                tab === key && styles.activeTabLabel,
              ]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => load()}>
              <Text style={styles.retry}>R?essayer</Text>
            </Pressable>
          </View>
        ) : tab === 'consultations' ? (
          consultations.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyTitle}>Aucune consultation</Text>
              <Text style={styles.muted}>
                Votre historique appara?tra ici apr?s une consultation enregistr?e.
              </Text>
            </View>
          ) : (
            consultations.map((item) => (
              <View key={item.appointment_id} style={styles.card}>
                <Text style={styles.date}>{formatDate(item.starts_at)}</Text>
                <Text style={styles.doctor}>
                  Dr. {item.doctor_first_name} {item.doctor_last_name}
                </Text>
                <Text style={styles.specialty}>{item.specialty}</Text>

                {item.reason ? (
                  <Text style={styles.detail}>Motif : {item.reason}</Text>
                ) : null}

                {item.notes ? (
                  <View style={styles.note}>
                    <Text style={styles.noteTitle}>Observations m?dicales</Text>
                    <Text style={styles.detail}>{item.notes}</Text>
                  </View>
                ) : (
                  <Text style={styles.muted}>
                    Aucune observation m?dicale enregistr?e.
                  </Text>
                )}

                {item.prescription ? (
                  <View style={styles.note}>
                    <Text style={styles.noteTitle}>Prescription</Text>
                    <Text style={styles.detail}>{item.prescription}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )
        ) : tab === 'documents' ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Documents m?dicaux</Text>
            <Text style={styles.muted}>
              Aucun document t?l?chargeable n'est actuellement disponible.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Prescriptions enregistr?es</Text>
            {prescriptions.length === 0 ? (
              <Text style={styles.muted}>
                Aucune prescription enregistr?e dans votre dossier.
              </Text>
            ) : (
              prescriptions.map((item) => (
                <View key={item.appointment_id} style={styles.prescription}>
                  <Text style={styles.date}>{formatDate(item.starts_at)}</Text>
                  <Text style={styles.doctor}>
                    Dr. {item.doctor_first_name} {item.doctor_last_name}
                  </Text>
                  <Text style={styles.detail}>{item.prescription}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 22,
    gap: 8,
  },
  profileLabel: {
    color: '#D9EBFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },
  profileDescription: {
    color: '#E3F0FF',
    fontSize: 12,
    lineHeight: 19,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
  },
  statValue: {
    color: colors.primary,
    fontSize: 25,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 5,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F4F8',
    borderRadius: 12,
    padding: 4,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 9,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  activeTabLabel: {
    color: colors.primary,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E7ECF3',
  },
  date: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  doctor: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  specialty: {
    color: colors.muted,
    fontSize: 12,
  },
  note: {
    backgroundColor: '#F7F9FC',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  noteTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  detail: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 21,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  prescription: {
    borderTopWidth: 1,
    borderTopColor: '#E7ECF3',
    paddingTop: 12,
    gap: 8,
  },
  error: {
    color: colors.error,
    fontSize: 13,
  },
  retry: {
    color: colors.primary,
    fontWeight: '800',
    marginTop: 8,
  },
});
