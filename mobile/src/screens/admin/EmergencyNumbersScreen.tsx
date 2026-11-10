import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../api/client';
import { EmergencyNumber, StaffApi } from '../../api/services';
import { Button, Card, Chip, EmptyState, Input, Loader, Notice, Screen, SectionTitle } from '../../components/ui';
import { color, space, type } from '../../theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function EmergencyNumbersScreen() {
  const [numbers, setNumbers] = useState<EmergencyNumber[] | null>(null);
  const [label, setLabel] = useState('');
  const [number, setNumber] = useState('');
  const [province, setProvince] = useState('');
  const [source, setSource] = useState('');
  const [verifiedAt, setVerifiedAt] = useState(today());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setNumbers((await StaffApi.emergencyNumbers()).data);
    } catch (e) {
      setNumbers([]);
      Alert.alert('Chargement impossible', errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!label.trim() || !number.trim() || source.trim().length < 3) {
      Alert.alert('Informations manquantes', 'Le nom du service, le numéro et la source officielle sont obligatoires.');
      return;
    }
    setBusy(true);
    try {
      await StaffApi.createEmergencyNumber({
        label: label.trim(),
        number: number.trim(),
        province: province.trim() || null,
        source: source.trim(),
        verifiedAt,
      });
      setLabel('');
      setNumber('');
      setProvince('');
      setSource('');
      setVerifiedAt(today());
      await load();
    } catch (e) {
      Alert.alert('Enregistrement impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (n: EmergencyNumber) => {
    try {
      await StaffApi.updateEmergencyNumber(n.id, { active: !n.active });
      await load();
    } catch (e) {
      Alert.alert('Modification impossible', errorMessage(e));
    }
  };

  const reverify = (n: EmergencyNumber) =>
    Alert.alert('Confirmer la vérification', `Avez-vous vérifié aujourd’hui que le ${n.number} est toujours en service, auprès de : ${n.source} ?`, [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Oui, vérifié',
        onPress: async () => {
          try {
            await StaffApi.updateEmergencyNumber(n.id, { verifiedAt: today() });
            await load();
          } catch (e) {
            Alert.alert('Modification impossible', errorMessage(e));
          }
        },
      },
    ]);

  const remove = (n: EmergencyNumber) =>
    Alert.alert('Supprimer ce numéro', `${n.label} (${n.number}) ne sera plus affiché.`, [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await StaffApi.deleteEmergencyNumber(n.id);
            await load();
          } catch (e) {
            Alert.alert('Suppression impossible', errorMessage(e));
          }
        },
      },
    ]);

  if (!numbers) return <Loader fullscreen label="Chargement..." />;

  return (
    <Screen>
      <Notice
        tone="warning"
        message="N’ajoutez qu’un numéro vérifié auprès d’une source officielle (autorité sanitaire, protection civile, arrêté publié). Il sera visible par tous, même sans compte."
      />

      <SectionTitle title="Numéros publiés" />
      {numbers.length === 0 ? (
        <Card>
          <EmptyState icon="call-outline" title="Aucun numéro" message="L’écran Urgence affiche seulement les établissements tant qu’aucun numéro n’est vérifié." />
        </Card>
      ) : (
        numbers.map((n) => (
          <Card key={n.id} style={s.card}>
            <Text style={type.h2}>{n.number} · {n.label}</Text>
            <Text style={s.muted}>
              {[n.province, `Source : ${n.source}`, `vérifié le ${n.verified_at}`].filter(Boolean).join(' · ')}
            </Text>
            <View style={s.row}>
              <Chip label={n.active ? 'Affiché' : 'Masqué'} selected={n.active} onPress={() => toggle(n)} />
              <Chip icon="checkmark-done-outline" label="Revérifié aujourd’hui" onPress={() => reverify(n)} />
              <Chip icon="trash-outline" label="Supprimer" onPress={() => remove(n)} />
            </View>
          </Card>
        ))
      )}

      <SectionTitle title="Ajouter un numéro vérifié" />
      <Card style={s.card}>
        <Input label="Service" value={label} onChangeText={setLabel} placeholder="Ex. : Protection civile" maxLength={120} />
        <Input label="Numéro" value={number} onChangeText={setNumber} keyboardType="phone-pad" maxLength={20} />
        <Input label="Province (facultatif)" value={province} onChangeText={setProvince} placeholder="Vide = national" maxLength={80} />
        <Input label="Source officielle" value={source} onChangeText={setSource} placeholder="Document, site ou autorité consultée" maxLength={255} />
        <Input label="Vérifié le" value={verifiedAt} onChangeText={setVerifiedAt} placeholder="AAAA-MM-JJ" maxLength={10} />
        <Button title="Publier le numéro" icon="add" loading={busy} onPress={add} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { ...type.caption, color: color.textMuted },
});
