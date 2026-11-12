import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import { EmergencyApi, EmergencyLookup } from '../../api/services';
import { Button, Card, Chip, Input, Notice, Screen } from '../../components/ui';
import { color, space, type } from '../../theme';

export default function EmergencyAccessScreen() {
  const navigation = useNavigation<any>();
  const [number, setNumber] = useState('');
  const [found, setFound] = useState<EmergencyLookup | null>(null);
  const [facilityId, setFacilityId] = useState<number | undefined>();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    setBusy(true);
    try {
      const { data } = await EmergencyApi.lookup(number.trim().toUpperCase());
      setFound(data);
      setFacilityId(data.facilities.length === 1 ? data.facilities[0].id : undefined);
    } catch (e) {
      setFound(null);
      Alert.alert('Recherche impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    if (!found) return;
    Alert.alert(
      'Ouvrir le dossier en urgence',
      'Cet accès sera enregistré à votre nom, notifié au patient et à ses responsables, et pourra être contrôlé. Confirmez-vous qu’il s’agit d’une situation d’urgence ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await EmergencyApi.start(found.patient.id, reason.trim(), facilityId);
              navigation.replace('PatientRecord', { patientId: found.patient.id });
            } catch (e) {
              Alert.alert('Accès refusé', errorMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const birth = found?.patient.birth_date ? found.patient.birth_date.slice(0, 10).split('-').reverse().join('/') : null;

  return (
    <Screen>
      <Notice
        tone="danger"
        icon="circle-exclamation"
        title="Réservé aux situations d’urgence"
        message="Pour un patient qui ne peut pas donner son consentement. L’accès dure 24 heures et se limite à la synthèse : allergies, antécédents, traitements et vaccins non confidentiels."
      />

      <Card style={s.section}>
        <Input
          label="Numéro patient"
          value={number}
          onChangeText={(v) => {
            setNumber(v);
            setFound(null);
          }}
          placeholder="CLRDV-P-000123"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="Rechercher" icon="magnifying-glass" variant="secondary" loading={busy && !found} disabled={number.trim().length < 14} onPress={lookup} />
      </Card>

      {found ? (
        <Card style={s.section}>
          <Text style={s.label}>Vérifiez l’identité avant d’ouvrir le dossier</Text>
          <Text style={type.h2}>{found.patient.first_name} {found.patient.last_name}</Text>
          <Text style={s.muted}>{[found.patient.patient_number, birth ? `Né(e) le ${birth}` : null].filter(Boolean).join(' · ')}</Text>

          {found.facilities.length > 1 ? (
            <View style={s.chips}>
              {found.facilities.map((f) => (
                <Chip key={f.id} icon="building" label={f.name} selected={facilityId === f.id} onPress={() => setFacilityId(f.id)} />
              ))}
            </View>
          ) : null}

          <Input
            label="Motif de l’urgence *"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={1000}
            placeholder="Patient inconscient amené aux urgences, allergies inconnues..."
          />
          <Text style={s.muted}>{reason.trim().length}/15 caractères minimum</Text>
          <Button
            title="Ouvrir la synthèse en urgence"
            icon="kit-medical"
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 15 || (found.facilities.length > 1 && !facilityId)}
            onPress={open}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  section: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  label: { ...type.label, color: color.dangerInk },
  muted: { ...type.caption, color: color.textMuted },
});
