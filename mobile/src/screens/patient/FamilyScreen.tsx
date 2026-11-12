import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import {
  PatientProfile,
  PatientRelationship,
  PatientsApi,
} from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Loader,
  Notice,
  Screen,
  SectionTitle,
  StatusBadge,
} from '../../components/ui';
import { color, space, type } from '../../theme';

export const LINK_STATUS_BADGE: Record<PatientProfile['link_status'], { status: string; label: string }> = {
  self: { status: 'confirmed', label: 'Titulaire' },
  pending: { status: 'pending', label: 'Vérification en attente' },
  verified: { status: 'confirmed', label: 'Lien vérifié' },
  rejected: { status: 'cancelled', label: 'Lien refusé' },
  revoked: { status: 'cancelled', label: 'Lien révoqué' },
};

const RELATIONSHIP_LABEL: Record<PatientProfile['relationship'], string> = {
  self: 'Moi',
  parent: 'Enfant',
  legal_guardian: 'Sous ma tutelle',
};

const parseFrenchDate = (value: string): string | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  if (date > new Date()) return null;
  return iso;
};

export const formatBirthDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export default function FamilyScreen() {
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<'female' | 'male' | undefined>();
  const [relationship, setRelationship] = useState<PatientRelationship>('parent');
  const [birthDateError, setBirthDateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await PatientsApi.mine();
      setProfiles(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setBirthDate('');
    setSex(undefined);
    setRelationship('parent');
    setBirthDateError(null);
    setAdding(false);
  };

  const submit = async () => {
    const iso = parseFrenchDate(birthDate);
    if (!iso) {
      setBirthDateError('Date invalide. Format attendu : JJ/MM/AAAA');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Informations manquantes', 'Le prénom et le nom sont obligatoires.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await PatientsApi.addDependent({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: iso,
        sex,
        relationship,
      });
      resetForm();
      Alert.alert(
        'Profil ajouté',
        `${data.first_name} ${data.last_name} a reçu le numéro ${data.patient_number}. ` +
          'Présentez un justificatif (acte de naissance ou jugement de tutelle) à la clinique pour faire vérifier le lien.'
      );
      await load();
    } catch (e) {
      Alert.alert('Ajout impossible', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader fullscreen label="Chargement de votre famille..." />;

  return (
    <Screen refreshing={false} onRefresh={load}>
      <Notice
        icon="users"
        title="Gérez les profils de vos proches"
        message="Vous pouvez prendre rendez-vous pour un enfant dès son ajout. Son dossier médical ne vous sera accessible qu'après vérification du lien par la clinique."
      />

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <SectionTitle title="Profils" />
      {profiles.length === 0 ? (
        <EmptyState icon="users" title="Aucun profil" />
      ) : (
        profiles.map((p) => {
          const badge = LINK_STATUS_BADGE[p.link_status];
          const name = `${p.first_name} ${p.last_name}`;
          return (
            <Card key={p.id} style={s.profile}>
              <Avatar name={name} size={44} />
              <View style={s.flex}>
                <Text style={type.bodyMedium}>{name}</Text>
                <Text style={s.muted}>
                  {[RELATIONSHIP_LABEL[p.relationship], p.patient_number, formatBirthDate(p.birth_date)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <StatusBadge status={badge.status} label={badge.label} />
              </View>
            </Card>
          );
        })
      )}

      {adding ? (
        <Card style={s.form}>
          <Text style={type.h3}>Ajouter un proche</Text>
          <View style={s.chips}>
            <Chip label="Mon enfant" selected={relationship === 'parent'} onPress={() => setRelationship('parent')} />
            <Chip
              label="Personne sous ma tutelle"
              selected={relationship === 'legal_guardian'}
              onPress={() => setRelationship('legal_guardian')}
            />
          </View>
          <Input label="Prénom *" value={firstName} onChangeText={setFirstName} maxLength={80} />
          <Input label="Nom *" value={lastName} onChangeText={setLastName} maxLength={80} />
          <Input
            label="Date de naissance *"
            value={birthDate}
            onChangeText={(v) => {
              setBirthDate(v);
              if (birthDateError) setBirthDateError(null);
            }}
            placeholder="JJ/MM/AAAA"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={birthDateError}
          />
          <View style={s.chips}>
            <Chip label="Fille" selected={sex === 'female'} onPress={() => setSex(sex === 'female' ? undefined : 'female')} />
            <Chip label="Garçon" selected={sex === 'male'} onPress={() => setSex(sex === 'male' ? undefined : 'male')} />
          </View>
          <View style={s.actions}>
            <Button title="Annuler" variant="secondary" disabled={saving} onPress={resetForm} style={s.flex} />
            <Button title="Ajouter" icon="user-plus" loading={saving} onPress={submit} style={s.flex} />
          </View>
        </Card>
      ) : (
        <Button title="Ajouter un enfant ou un proche" icon="user-plus" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  muted: { ...type.caption, color: color.textMuted, marginVertical: 2 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  form: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
});
