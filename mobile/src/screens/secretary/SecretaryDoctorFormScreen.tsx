import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { DoctorInput, StaffApi } from '../../api/services';
import { Button, Card, Chip, InfoRow, Input, Loader, Notice, Screen } from '../../components/ui';
import { type } from '../../theme';
import { FieldGroupLabel, Wrap, errorText, shared } from './shared';

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
  const [professionalPhone, setProfessionalPhone] = useState('');
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
          setProfessionalPhone(d.professional_phone ?? '');
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
      professionalPhone: professionalPhone.trim() || (isEdit ? null : undefined),
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

  if (loading) return <Loader fullscreen label="Chargement..." />;

  return (
    <KeyboardAvoidingView style={shared.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Enregistrer" icon="save-outline" loading={saving} onPress={submit} />}>
        {error ? <Notice tone="danger" message={error} /> : null}

        <Card style={shared.card}>
          <Text style={type.h2}>Compte</Text>
          {isEdit ? (
            <InfoRow icon="mail-outline" label="E-mail de connexion" value={email} />
          ) : (
            <>
              <Input
                label="E-mail"
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Input
                label="Mot de passe initial"
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="8 caractères minimum"
              />
            </>
          )}
        </Card>

        <Card style={shared.card}>
          <Text style={type.h2}>Identité</Text>
          <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
          <Input label="Nom" value={lastName} onChangeText={setLastName} />
          <Input label="Téléphone personnel (jamais montré aux patients)" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Input
            label="Téléphone professionnel (visible par les patients, même hors ligne)"
            icon="business-outline"
            value={professionalPhone}
            onChangeText={setProfessionalPhone}
            keyboardType="phone-pad"
            placeholder="+243 ..."
          />
        </Card>

        <Card style={shared.card}>
          <Text style={type.h2}>Exercice</Text>
          <FieldGroupLabel>Spécialité</FieldGroupLabel>
          <Wrap>
            {specialties.map((sp) => (
              <Chip key={sp.id} label={sp.name} selected={specialtyId === sp.id} onPress={() => setSpecialtyId(sp.id)} />
            ))}
          </Wrap>
          <FieldGroupLabel>Durée de consultation</FieldGroupLabel>
          <Wrap>
            {DURATIONS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
            ))}
          </Wrap>
          <View style={shared.actions}>
            <View style={shared.action}>
              <Input label="Tarif (USD)" icon="cash-outline" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
            </View>
            <View style={shared.action}>
              <Input label="Langues" icon="language-outline" value={languages} onChangeText={setLanguages} placeholder="fr, sw, en" />
            </View>
          </View>
          <Input label="Présentation" value={bio} onChangeText={setBio} multiline />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
