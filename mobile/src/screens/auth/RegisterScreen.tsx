import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button, Checkbox, Input, Notice } from '../../components/ui';
import { normalizeDrcPhone } from '../../utils/phone';
import { AuthLayout, PasswordInput, auth } from './shared';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Veuillez renseigner votre prénom et votre nom.');
      return;
    }
    if (!normalizeDrcPhone(phone)) {
      setError('Veuillez saisir un numéro congolais valide (ex. 081 234 5678 ou +243 81 234 5678).');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('L’adresse e-mail saisie n’est pas valide. Vous pouvez aussi laisser ce champ vide.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!accepted) {
      setError("Veuillez accepter les conditions d'utilisation.");
      return;
    }

    setBusy(true);
    try {
      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() ? email.trim().toLowerCase() : undefined,
        password,
      });
      navigation.navigate('VerifyPhone', { phone: result.phone });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez ClinicRDV et prenez soin de votre santé.">
      <View style={auth.form}>
        <Text style={auth.cardTitle}>Inscription</Text>
        <Text style={auth.cardSubtitle}>Espace patient</Text>

        {error ? <Notice tone="danger" message={error} /> : null}

        <Input label="Prénom *" icon="person-outline" value={firstName} onChangeText={setFirstName} placeholder="Votre prénom" editable={!busy} />
        <Input label="Nom *" icon="person-outline" value={lastName} onChangeText={setLastName} placeholder="Votre nom" editable={!busy} />
        <Input
          label="Téléphone *"
          icon="call-outline"
          value={phone}
          onChangeText={setPhone}
          placeholder="081 234 5678"
          keyboardType="phone-pad"
          editable={!busy}
        />
        <Input
          label="Adresse e-mail (facultatif)"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="exemple@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <PasswordInput
          label="Mot de passe *"
          value={password}
          onChangeText={setPassword}
          placeholder="8 caractères minimum"
          editable={!busy}
        />
        <PasswordInput
          label="Confirmer le mot de passe *"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirmez votre mot de passe"
          editable={!busy}
        />

        <Checkbox
          checked={accepted}
          onChange={setAccepted}
          disabled={busy}
          label="J'accepte les conditions d'utilisation et la politique de confidentialité."
        />

        <Button title="Créer mon compte" icon="person-add-outline" loading={busy} onPress={submit} />

        <View style={auth.linkRow}>
          <Text style={auth.muted}>Déjà un compte ?</Text>
          <Button
            title="Se connecter"
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => navigation.navigate('Login')}
          />
        </View>
      </View>
    </AuthLayout>
  );
}
