import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { AuthApi } from '../../api/services';
import { errorMessage } from '../../api/client';
import { Button, Input, Notice } from '../../components/ui';
import { normalizeDrcPhone } from '../../utils/phone';
import { AuthLayout, auth } from './shared';

export default function ForgotPasswordScreen({ route, navigation }: any) {
  const [identifier, setIdentifier] = useState<string>(route.params?.identifier ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = identifier.trim();
    if (!value || (!value.includes('@') && !normalizeDrcPhone(value))) {
      setError('Saisissez votre numéro de téléphone (ex. 081 234 5678) ou votre adresse e-mail.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await AuthApi.forgotPassword(value);
      navigation.navigate('ResetPassword', { identifier: value, message: data.message });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Recevez un code pour choisir un nouveau mot de passe."
    >
      <View style={auth.form}>
        <Text style={auth.cardTitle}>Retrouver mon compte</Text>
        {error ? <Notice tone="danger" message={error} /> : null}

        <Input
          label="Téléphone ou adresse e-mail"
          icon="circle-user"
          placeholder="081 234 5678 ou exemple@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            setError('');
          }}
          editable={!busy}
          returnKeyType="send"
          onSubmitEditing={submit}
        />

        <Notice
          tone="info"
          message="Le code est envoyé par SMS à votre numéro vérifié, ou par e-mail si vous saisissez une adresse confirmée."
        />

        <Button title="Recevoir un code" icon="paper-plane" loading={busy} onPress={submit} />

        <View style={auth.linkRow}>
          <Button
            title="Retour à la connexion"
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
