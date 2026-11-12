import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button, Checkbox, Input, Notice, SegmentedTabs } from '../../components/ui';
import { normalizeDrcPhone } from '../../utils/phone';
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
    const identifier = email.trim();
    if (!identifier || (!identifier.includes('@') && !normalizeDrcPhone(identifier))) {
      setError('Saisissez votre numéro de téléphone (ex. 081 234 5678) ou votre adresse e-mail.');
      return;
    }
    if (!password) {
      setError('Veuillez saisir votre mot de passe.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await login(identifier, password);
    } catch (e) {
      const response = (e as { response?: { status?: number; data?: { code?: string; phone?: string } } })?.response;
      if (role === 'patient' && response?.status === 403 && response.data?.code === 'PHONE_NOT_VERIFIED') {
        navigation.navigate('VerifyPhone', { phone: response.data.phone });
      } else if (role === 'patient' && response?.status === 403 && response.data?.code === 'EMAIL_NOT_VERIFIED') {
        navigation.navigate('VerifyEmail', { email: identifier.toLowerCase() });
      } else {
        setError(errorMessage(e));
      }
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
          label="Téléphone ou adresse e-mail"
          icon="circle-user"
          placeholder="081 234 5678 ou exemple@email.com"
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

        <View style={auth.linkRow}>
          <Checkbox checked={rememberMe} onChange={setRememberMe} label="Se souvenir de moi" />
          <View style={{ flex: 1 }} />
          <Button
            title="Mot de passe oublié ?"
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => navigation.navigate('ForgotPassword', { identifier: email.trim() })}
          />
        </View>

        <Button title="Se connecter" icon="right-to-bracket" loading={busy} onPress={submit} />

        <Button
          title="Urgence : appeler ou trouver un hôpital"
          icon="kit-medical"
          variant="danger"
          onPress={() => navigation.navigate('Emergency')}
        />

        <View style={auth.linkRow}>
          <Text style={auth.muted}>Vous n’avez pas de compte ?</Text>
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
