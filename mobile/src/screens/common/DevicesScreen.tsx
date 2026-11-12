import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../api/client';
import { AuthApi, DeviceSession } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, EmptyState, Icon, Loader, Notice, Screen, StatusBadge } from '../../components/ui';
import { color, space, type } from '../../theme';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function DevicesScreen() {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions((await AuthApi.sessions()).data);
    } catch (e) {
      setSessions([]);
      Alert.alert('Chargement impossible', errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = (s: DeviceSession) =>
    Alert.alert('Déconnecter cet appareil', 'Cet appareil devra se reconnecter avec votre mot de passe.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnecter',
        style: 'destructive',
        onPress: async () => {
          try {
            await AuthApi.revokeSession(s.id);
            await load();
          } catch (e) {
            Alert.alert('Action impossible', errorMessage(e));
          }
        },
      },
    ]);

  const logoutEverywhere = () =>
    Alert.alert(
      'Déconnecter tous les appareils',
      'Tous vos appareils, y compris celui-ci, seront déconnectés. À utiliser si vous pensez qu’un appareil a été perdu ou volé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout déconnecter',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await AuthApi.logoutAll();
              await logout();
            } catch (e) {
              Alert.alert('Action impossible', errorMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );

  if (sessions === null) return <Loader fullscreen label="Chargement des appareils..." />;

  return (
    <Screen refreshing={false} onRefresh={load}>
      <Notice
        icon="shield-halved"
        message="Chaque connexion reste active 30 jours sans utilisation, et 90 jours au maximum. Déconnectez un appareil que vous ne reconnaissez pas."
      />

      {sessions.length === 0 ? (
        <EmptyState icon="mobile-screen" title="Aucun appareil connecté" />
      ) : (
        sessions.map((s) => (
          <Card key={s.id} style={s.current ? [styles.card, styles.current] : styles.card}>
            <View style={styles.row}>
              <Icon name="mobile-screen" size="md" color={color.primary} />
              <View style={styles.flex}>
                <Text style={type.bodyMedium}>{s.device_label || 'Appareil inconnu'}</Text>
                <Text style={styles.muted}>Connecté le {formatDate(s.created_at)}</Text>
                <Text style={styles.muted}>Dernière activité : {formatDate(s.last_used_at)}</Text>
              </View>
              {s.current ? <StatusBadge status="confirmed" label="Cet appareil" /> : null}
            </View>
            {!s.current ? (
              <Button title="Déconnecter" size="sm" variant="secondary" fullWidth={false} onPress={() => revoke(s)} />
            ) : null}
          </Card>
        ))
      )}

      <Button title="Déconnecter tous les appareils" icon="right-from-bracket" variant="danger" loading={busy} onPress={logoutEverywhere} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: space.xs },
  current: { borderLeftWidth: 4, borderLeftColor: color.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  muted: { ...type.caption, color: color.textMuted },
});
