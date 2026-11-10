import React, { useEffect, useState } from 'react';
import {
  CachedAppointment,
  getCachedAppointments,
} from '../../database/offlineRepository';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function OfflineScreen() {
  const { user, retryConnection } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [appointments, setAppointments] = useState<CachedAppointment[]>([]);
  const [appointmentsOwnerId, setAppointmentsOwnerId] = useState<string | null>(null);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);

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
        Les fonctions nécessitant Internet restent indisponibles.
        Vous pouvez consulter vos rendez-vous précédemment enregistrés.
      </Text>

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

                  <Text style={styles.appointmentMeta}>
                    Date : {new Date(appointment.starts_at).toLocaleString('fr-FR')}
                  </Text>

                  <Text style={styles.appointmentMeta}>
                    Fin : {new Date(appointment.ends_at).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
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
                </View>
              ))
            : null}
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
