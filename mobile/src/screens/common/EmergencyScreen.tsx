import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { EmergencyApi, EmergencyDirectory, EmergencyFacility } from '../../api/services';
import { Button, Card, EmptyState, Icon, Loader, Notice, Screen, SectionTitle } from '../../components/ui';
import { getCachedEmergencyDirectory, saveEmergencyDirectory } from '../../services/emergencyDirectory';
import { color, radius, space, type } from '../../theme';

const call = (number: string) => {
  const cleaned = number.replace(/[^0-9+]/g, '');
  Linking.openURL(`tel:${cleaned}`).catch(() => Alert.alert('Appel impossible', `Composez le ${number} depuis votre téléphone.`));
};

const directions = (f: EmergencyFacility) => {
  const destination =
    f.latitude !== null && f.longitude !== null
      ? `${f.latitude},${f.longitude}`
      : encodeURIComponent([f.name, f.address, f.city].filter(Boolean).join(', '));
  const native =
    f.latitude !== null && f.longitude !== null
      ? Platform.select({ ios: `maps://?daddr=${destination}`, default: `geo:${destination}?q=${destination}` })
      : null;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  (native ? Linking.openURL(native) : Promise.reject()).catch(() =>
    Linking.openURL(web).catch(() => Alert.alert('Itinéraire indisponible', 'Aucune application de cartes n’a pu être ouverte.'))
  );
};

const savedLabel = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function EmergencyScreen() {
  const [directory, setDirectory] = useState<EmergencyDirectory | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [located, setLocated] = useState(false);

  const fetchDirectory = useCallback(async (position?: { lat: number; lng: number }) => {
    try {
      const { data } = await EmergencyApi.directory(position);
      setDirectory(data);
      setOffline(false);
      setSavedAt(null);
      saveEmergencyDirectory(data).catch(() => {});
    } catch {
      const cached = await getCachedEmergencyDirectory().catch(() => null);
      if (cached) {
        setDirectory(cached.directory);
        setSavedAt(cached.savedAt);
      }
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getCachedEmergencyDirectory()
      .then((cached) => {
        if (cached) {
          setDirectory(cached.directory);
          setSavedAt(cached.savedAt);
        }
      })
      .catch(() => {})
      .finally(() => fetchDirectory());
  }, [fetchDirectory]);

  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Position non autorisée', 'Les établissements restent classés par ville. Vous pouvez autoriser la position dans les réglages.');
        return;
      }
      const last = await Location.getLastKnownPositionAsync();
      const position = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setLocated(true);
      await fetchDirectory({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      Alert.alert('Position indisponible', 'Impossible de déterminer votre position pour le moment.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <Screen>
      <View style={s.alarm}>
        <Icon name="warning" size={22} color={color.onPrimary} />
        <Text style={s.alarmText}>
          {directory?.disclaimer ??
            'En cas de danger immédiat, appelez les secours ou rendez-vous au service d’urgence le plus proche. ClinicRDV ne remplace pas les services d’urgence.'}
        </Text>
      </View>

      {offline ? (
        <Notice
          tone="warning"
          message={
            savedAt
              ? `Pas de connexion Internet : informations enregistrées le ${savedLabel(savedAt)}. Les appels téléphoniques restent possibles.`
              : 'Pas de connexion Internet et aucune information enregistrée sur ce téléphone. Les appels téléphoniques restent possibles.'
          }
        />
      ) : null}

      {loading && !directory ? <Loader label="Chargement des contacts d’urgence..." /> : null}

      <SectionTitle title="Numéros d’urgence" />
      {directory?.numbers.length ? (
        <Card style={s.list}>
          {directory.numbers.map((n) => (
            <Pressable key={n.id} accessibilityRole="button" onPress={() => call(n.number)} style={s.numberRow}>
              <View style={s.numberBadge}>
                <Icon name="call" size={20} color={color.onPrimary} />
              </View>
              <View style={s.flex}>
                <Text style={type.h2}>{n.number}</Text>
                <Text style={type.bodyMedium}>{n.label}{n.province ? ` · ${n.province}` : ''}</Text>
                <Text style={s.muted}>Source : {n.source} · vérifié le {n.verified_at}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Card>
          <Text style={s.muted}>
            Aucun numéro national n’a encore été vérifié par l’administration de ClinicRDV. Contactez directement un établissement ci-dessous.
          </Text>
        </Card>
      )}

      <SectionTitle title="Services d’urgence" />
      <Button
        title={located ? 'Actualiser avec ma position' : 'Trouver les plus proches de moi'}
        icon="locate-outline"
        variant="secondary"
        loading={locating}
        onPress={locate}
      />

      {directory && directory.facilities.length === 0 ? (
        <Card>
          <EmptyState icon="medkit-outline" title="Aucun service d’urgence enregistré" message="Aucun établissement n’a déclaré de service d’urgence disponible." />
        </Card>
      ) : null}

      {directory?.facilities.map((f) => (
        <Card key={f.id} style={s.card}>
          <Text style={type.h2}>{f.name}</Text>
          <Text style={s.muted}>
            {[f.distance_km !== null ? `${f.distance_km} km` : null, f.address, f.city, f.available_24h ? 'Urgences 24h/24' : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={s.actions}>
            {f.emergency_phone ? (
              <Button title="Urgences" icon="call" variant="danger" size="sm" fullWidth={false} onPress={() => call(f.emergency_phone!)} />
            ) : null}
            {f.phone ? (
              <Button title="Accueil" icon="call-outline" variant="secondary" size="sm" fullWidth={false} onPress={() => call(f.phone!)} />
            ) : null}
            <Button title="Itinéraire" icon="navigate-outline" variant="secondary" size="sm" fullWidth={false} onPress={() => directions(f)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  alarm: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.dangerInk,
  },
  alarmText: { ...type.bodyMedium, color: color.onPrimary, flex: 1 },
  list: { paddingVertical: space.xxs },
  numberRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingVertical: space.sm },
  numberBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: color.dangerInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { ...type.caption, color: color.textMuted },
});
