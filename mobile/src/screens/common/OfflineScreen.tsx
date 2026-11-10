import React, { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  CachedAppointment,
  CachedFacility,
  getCachedAppointments,
  getCachedFacilities,
} from '../../database/offlineRepository';
import { callNumber, sendSms } from '../../utils/contact';

const DEFAULT_TIME_ZONE = 'Africa/Lubumbashi';

const formatLocal = (iso: string, timeZone: string | null | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: timeZone || DEFAULT_TIME_ZONE, ...options }).format(new Date(iso));

function ContactButtons({ phone, emergency }: { phone?: string | null; emergency?: string | null }) {
  if (!phone && !emergency) return null;
  return (
    <View style={styles.contactRow}>
      {phone ? (
        <Pressable accessibilityRole="button" style={styles.contactButton} onPress={() => callNumber(phone)}>
          <Text style={styles.contactButtonText}>Appeler</Text>
        </Pressable>
      ) : null}
      {phone ? (
        <Pressable accessibilityRole="button" style={styles.contactButton} onPress={() => sendSms(phone)}>
          <Text style={styles.contactButtonText}>SMS</Text>
        </Pressable>
      ) : null}
      {emergency ? (
        <Pressable accessibilityRole="button" style={[styles.contactButton, styles.contactEmergency]} onPress={() => callNumber(emergency)}>
          <Text style={[styles.contactButtonText, styles.contactEmergencyText]}>Urgences</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';

export default function OfflineScreen() {
  const { user, retryConnection } = useAuth();
  const navigation = useNavigation<any>();
  const [retrying, setRetrying] = useState(false);
  const [appointments, setAppointments] = useState<CachedAppointment[]>([]);
  const [appointmentsOwnerId, setAppointmentsOwnerId] = useState<string | null>(null);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<CachedFacility[]>([]);
  const [network, setNetwork] = useState<'none' | 'no-internet' | 'unknown'>('unknown');

  useEffect(() => {
    NetInfo.fetch()
      .then((state) => setNetwork(state.isConnected === false ? 'none' : 'no-internet'))
      .catch(() => setNetwork('unknown'));
  }, []);

  const userId =
    user?.role === 'patient' && user.id != null
      ? String(user.id)
      : null;

  useEffect(() => {
    let active = true;

    setAppointments([]);
    setAppointmentsOwnerId(null);
    setAppointmentsError(null);

    if (!userId) {
      setAppointmentsLoading(false);
      return () => {
        active = false;
      };
    }

    setAppointmentsLoading(true);

    void getCachedFacilities(userId)
      .then((cached) => {
        if (active) setFacilities(cached.filter((f) => f.phone || f.emergency_phone));
      })
      .catch(() => {
        if (active) setFacilities([]);
      });

    void getCachedAppointments(userId)
      .then((cached) => {
        if (!active) return;
        setAppointments(cached);
        setAppointmentsOwnerId(userId);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Lecture des rendez-vous hors ligne impossible :', error);
        setAppointmentsError('Impossible de charger les rendez-vous enregistrés.');
      })
      .finally(() => {
        if (active) setAppointmentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const visibleAppointments =
    userId && appointmentsOwnerId === userId
      ? appointments
      : [];

  const handleRetry = async () => {
    if (retrying) return;

    setRetrying(true);

    try {
      await retryConnection();
    } catch (error) {
      console.error('Erreur de reconnexion :', error);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Connexion indisponible</Text>

      <Text style={styles.message}>
        Votre session est conservée sur cet appareil,
        mais elle ne peut pas être vérifiée actuellement.
      </Text>

      <Text style={styles.notice}>
        {network === 'none'
          ? 'Aucun réseau Wi-Fi ni données mobiles détecté. '
          : network === 'no-internet'
            ? 'Vous êtes connecté à un réseau, mais Internet est inaccessible. '
            : 'Internet est inaccessible pour le moment. '}
        Aucune réservation ni modification ne peut être enregistrée sans Internet.
        Vous pouvez consulter vos rendez-vous précédemment enregistrés.
      </Text>

      <Text style={styles.callInfo}>
        Les appels et les SMS passent par le réseau téléphonique classique : ils peuvent fonctionner même sans Internet, si votre téléphone capte le réseau.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Emergency')}
        style={styles.emergencyButton}
      >
        <Text style={styles.emergencyButtonText}>Urgence : numéros et hôpitaux enregistrés</Text>
      </Pressable>

      {userId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('EmergencyCard')}
          style={styles.emergencyButton}
        >
          <Text style={styles.emergencyButtonText}>Afficher ma fiche d’urgence</Text>
        </Pressable>
      ) : null}

      {userId ? (
        <View style={styles.appointmentSection}>
          <Text style={styles.sectionTitle}>Mes rendez-vous enregistrés</Text>

          {appointmentsLoading ? (
            <ActivityIndicator size="large" color="#172554" />
          ) : null}

          {appointmentsError ? (
            <Text style={styles.emptyText}>{appointmentsError}</Text>
          ) : null}

          {!appointmentsLoading && !appointmentsError &&
            visibleAppointments.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucun rendez-vous enregistré sur cet appareil.
              </Text>
            ) : null}

          {!appointmentsLoading && !appointmentsError
            ? visibleAppointments.map((appointment) => (
                <View key={appointment.id} style={styles.appointmentCard}>
                  <Text style={styles.appointmentDoctor}>
                    {appointment.doctor_name || 'Médecin'}
                  </Text>

                  {appointment.specialty ? (
                    <Text style={styles.appointmentMeta}>
                      {appointment.specialty}
                    </Text>
                  ) : null}

                  {appointment.facility_name ? (
                    <Text style={styles.appointmentMeta}>{appointment.facility_name}</Text>
                  ) : null}

                  <Text style={styles.appointmentMeta}>
                    Date : {formatLocal(appointment.starts_at, appointment.facility_timezone, {
                      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                    })}
                  </Text>

                  <Text style={styles.appointmentMeta}>
                    Fin : {formatLocal(appointment.ends_at, appointment.facility_timezone, {
                      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                    })}
                  </Text>

                  <Text style={styles.appointmentStatus}>
                    Statut : {{
                      confirmed: 'Confirmé',
                      pending: 'En attente',
                      done: 'Terminé',
                      cancelled: 'Annulé',
                    }[appointment.status]}
                  </Text>

                  {appointment.doctor_phone ? (
                    <>
                      <Text style={styles.contactLabel}>Cabinet du médecin</Text>
                      <ContactButtons phone={appointment.doctor_phone} />
                    </>
                  ) : null}
                  {appointment.facility_phone || appointment.facility_emergency_phone ? (
                    <>
                      <Text style={styles.contactLabel}>Établissement</Text>
                      <ContactButtons phone={appointment.facility_phone} emergency={appointment.facility_emergency_phone} />
                    </>
                  ) : null}
                </View>
              ))
            : null}
        </View>
      ) : null}

      {userId && facilities.length ? (
        <View style={styles.appointmentSection}>
          <Text style={styles.sectionTitle}>Contacts des établissements</Text>
          {facilities.map((facility) => (
            <View key={facility.id} style={styles.appointmentCard}>
              <Text style={styles.appointmentDoctor}>{facility.name}</Text>
              {facility.city || facility.address ? (
                <Text style={styles.appointmentMeta}>{[facility.address, facility.city].filter(Boolean).join(', ')}</Text>
              ) : null}
              <ContactButtons phone={facility.phone} emergency={facility.emergency_phone} />
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        style={[styles.button, retrying && styles.buttonDisabled]}
        onPress={handleRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Réessayer la connexion"
      >
        {retrying ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Réessayer</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  callInfo: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F766E',
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  contactLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 10,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  contactButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#E0E7FF',
  },
  contactButtonText: {
    color: '#172554',
    fontWeight: '700',
  },
  contactEmergency: {
    backgroundColor: '#FEE2E2',
  },
  contactEmergencyText: {
    color: '#B91C1C',
  },
  emergencyButton: {
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
  },
  emergencyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
  },
  appointmentSection: {
    marginTop: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#172554',
    marginBottom: 16,
  },
  appointmentCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  appointmentDoctor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172554',
    marginBottom: 5,
  },
  appointmentMeta: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
  },
  appointmentStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D4ED8',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#172554',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
    marginBottom: 16,
  },
  notice: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#172554',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
