import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button, Checkbox, Input, Notice, SegmentedTabs } from '../../components/ui';
import { AuthLayout, PasswordInput, auth } from './shared';

type LoginRole = 'patient' | 'doctor' | 'secretary';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();

  const [role, setRole] = useState<LoginRole>('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Veuillez saisir une adresse e-mail valide.');
      return;
    }
    if (!password) {
      setError('Veuillez saisir votre mot de passe.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Bienvenue sur ClinicRDV" subtitle="Votre santé, notre priorité. Connectez-vous à votre espace.">
      <View style={auth.form}>
        <Text style={auth.cardTitle}>Connexion</Text>
        <Text style={auth.cardSubtitle}>Sélectionnez votre espace</Text>

        <SegmentedTabs<LoginRole>
          value={role}
          onChange={(r) => {
            setRole(r);
            setError('');
          }}
          tabs={[
            { key: 'patient', label: 'Patient' },
            { key: 'doctor', label: 'Médecin' },
            { key: 'secretary', label: 'Secrétaire' },
          ]}
        />

        {error ? <Notice tone="danger" message={error} /> : null}

        <Input
          label="Adresse e-mail"
          icon="mail-outline"
          placeholder="exemple@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError('');
          }}
          editable={!busy}
        />

        <PasswordInput
          label="Mot de passe"
          placeholder="Entrez votre mot de passe"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError('');
          }}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <Checkbox checked={rememberMe} onChange={setRememberMe} label="Se souvenir de moi" />

        <Button title="Se connecter" icon="log-in-outline" loading={busy} onPress={submit} />

        <View style={auth.linkRow}>
          <Text style={auth.muted}>Vous n'avez pas de compte ?</Text>
          <Button
            title="Créer un compte"
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => navigation.navigate('Register')}
          />
        </View>
      </View>
    </AuthLayout>
  );
}
