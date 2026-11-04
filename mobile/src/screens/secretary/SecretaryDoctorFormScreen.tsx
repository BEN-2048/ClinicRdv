import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { DoctorInput, StaffApi } from '../../api/services';
import { Button, Chip, Header, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';
import { Loading, errorText, shared } from './shared';

type Specialty = { id: number; name: string };
const DURATIONS = [15, 30, 45, 60];

export default function SecretaryDoctorFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const doctorId: number | undefined = route.params?.doctorId;
  const isEdit = !!doctorId;

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialtyId, setSpecialtyId] = useState<number | null>(null);
  const [fee, setFee] = useState('20');
  const [minutes, setMinutes] = useState(30);
  const [languages, setLanguages] = useState('fr');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Modifier le médecin' : 'Nouveau médecin' });
    const load = async () => {
      try {
        const [specs, doc] = await Promise.all([
          StaffApi.specialties(),
          doctorId ? StaffApi.doctor(doctorId) : Promise.resolve(null),
        ]);
        setSpecialties(specs.data as Specialty[]);
        if (doc) {
          const d = doc.data;
          setEmail(d.email);
          setFirstName(d.first_name);
          setLastName(d.last_name);
          setPhone(d.phone ?? '');
          setSpecialtyId(d.specialty_id);
          setFee(String(d.fee));
          setMinutes(d.consultation_minutes);
          setLanguages(d.languages ?? '');
          setBio(d.bio ?? '');
        }
      } catch (err) {
        setError(errorText(err, 'Impossible de charger les données.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigation, doctorId, isEdit]);

  const submit = async () => {
    const feeValue = Number(fee.replace(',', '.'));
    if (!firstName.trim() || !lastName.trim() || !specialtyId) {
      Alert.alert('Champs manquants', 'Nom, prénom et spécialité sont obligatoires.');
      return;
    }
    if (!Number.isFinite(feeValue) || feeValue < 0) {
      Alert.alert('Tarif invalide', 'Saisissez un montant positif.');
      return;
    }
    if (!isEdit && (!email.trim() || password.length < 8)) {
      Alert.alert('Compte', "L'e-mail est obligatoire et le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    const data: DoctorInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      specialtyId,
      fee: feeValue,
      consultationMinutes: minutes,
      languages: languages.trim() || 'fr',
      bio: bio.trim() || (isEdit ? null : undefined),
      phone: phone.trim() || (isEdit ? null : undefined),
    };

    setSaving(true);
    try {
      if (doctorId) await StaffApi.updateDoctor(doctorId, data);
      else await StaffApi.createDoctor({ ...data, email: email.trim(), password });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Enregistrement impossible', errorText(err, "L'enregistrement a échoué."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={ui.page}><Loading label="Chargement..." /></View>;

  const field = (label: string, value: string, onChange: (v: string) => void, extra: object = {}) => (
    <>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={[ui.field, { marginTop: 6 }]}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.muted}
        {...extra}
      />
    </>
  );

  return (
    <View style={ui.page}>
      <Header title={isEdit ? `Dr. ${lastName}` : 'Nouveau médecin'} subtitle="Fiche médecin" />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        {error && <Text style={shared.error}>{error}</Text>}

        <Text style={ui.h2}>Compte</Text>
        {isEdit ? (
          <View style={ui.card}><Text style={ui.muted}>E-mail de connexion : {email}</Text></View>
        ) : (
          <>
            {field('E-mail', email, setEmail, { autoCapitalize: 'none', keyboardType: 'email-address' })}
            {field('Mot de passe initial', password, setPassword, { secureTextEntry: true, placeholder: '8 caractères minimum' })}
          </>
        )}

        <Text style={[ui.h2, ui.section]}>Identité</Text>
        {field('Prénom', firstName, setFirstName)}
        {field('Nom', lastName, setLastName)}
        {field('Téléphone', phone, setPhone, { keyboardType: 'phone-pad' })}

        <Text style={[ui.h2, ui.section]}>Exercice</Text>
        <Text style={ui.label}>Spécialité</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 8 }}>
          {specialties.map((sp) => (
            <Chip key={sp.id} title={sp.name} active={specialtyId === sp.id} onPress={() => setSpecialtyId(sp.id)} />
          ))}
        </View>
        <Text style={ui.label}>Durée de consultation</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 8 }}>
          {DURATIONS.map((m) => (
            <Chip key={m} title={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </View>
        {field('Tarif (USD)', fee, setFee, { keyboardType: 'decimal-pad' })}
        {field('Langues', languages, setLanguages, { placeholder: 'fr, sw, en' })}
        {field('Présentation', bio, setBio, { multiline: true, textAlignVertical: 'top', style: [ui.field, { marginTop: 6, minHeight: 80 }] })}

        <Button title={saving ? 'Enregistrement...' : 'Enregistrer'} disabled={saving} onPress={submit} />
      </ScrollView>
    </View>
  );
}
