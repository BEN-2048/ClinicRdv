import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button, Input, Notice } from '../../components/ui';
import { color, fonts, space, type } from '../../theme';
import { AuthLayout, auth } from './shared';

export default function VerifyEmailScreen({ route, navigation }: any) {
  const email: string = route.params?.email ?? '';
  const { verifyEmail } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const verify = async () => {
    setError('');
    setMessage('');

    if (!/^\d{6}$/.test(code)) {
      setError('Saisissez un code de 6 chiffres.');
      return;
    }

    setBusy(true);
    try {
      await verifyEmail(email, code);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await AuthApi.resendOtp(email);
      setCode('');
      setMessage('Un nouveau code a été envoyé.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Vérification de votre e-mail" subtitle={`Saisissez le code à 6 chiffres envoyé à ${email}.`}>
      <View style={auth.form}>
        <Text style={auth.cardTitle}>Code de vérification</Text>

        {error ? <Notice tone="danger" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}

        <Input
          icon="key"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          editable={!busy}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          style={s.code}
        />

        <Button title="Vérifier mon adresse" icon="circle-check" loading={busy} disabled={busy} onPress={verify} />

        <Button title="Renvoyer le code" icon="arrows-rotate" variant="ghost" disabled={busy} onPress={resend} />

        <View style={auth.linkRow}>
          <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Login')}>
            <Text style={s.link}>Retour à la connexion</Text>
          </Pressable>
        </View>
      </View>
    </AuthLayout>
  );
}

const s = StyleSheet.create({
  code: { ...type.h2, fontFamily: fonts.semibold, letterSpacing: 8, textAlign: 'center' },
  link: { ...type.bodyMedium, color: color.primary, paddingVertical: space.xxs },
});
