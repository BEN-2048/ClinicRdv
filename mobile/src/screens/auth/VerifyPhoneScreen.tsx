import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button, Input, Notice } from '../../components/ui';
import { color, fonts, space, type } from '../../theme';
import { formatDrcPhone } from '../../utils/phone';
import { AuthLayout, auth } from './shared';

export default function VerifyPhoneScreen({ route, navigation }: any) {
  const phone: string = route.params?.phone ?? '';
  const { verifyPhone } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [wait, setWait] = useState(60);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = async () => {
    setError('');
    setMessage('');
    if (!/^\d{6}$/.test(code)) {
      setError('Saisissez le code de 6 chiffres reçu par SMS.');
      return;
    }
    setBusy(true);
    try {
      await verifyPhone(phone, code);
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
      await AuthApi.resendPhoneOtp(phone);
      setCode('');
      setWait(60);
      setMessage('Un nouveau code vient d’être envoyé par SMS.');
    } catch (e: any) {
      if (e?.response?.data?.waitSeconds) setWait(e.response.data.waitSeconds);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Vérification de votre numéro" subtitle={`Saisissez le code à 6 chiffres envoyé par SMS au ${formatDrcPhone(phone)}.`}>
      <View style={auth.form}>
        <Text style={auth.cardTitle}>Code reçu par SMS</Text>

        {error ? <Notice tone="danger" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}

        <Input
          icon="key-outline"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          editable={!busy}
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          style={s.code}
        />

        <Button title="Vérifier mon numéro" icon="checkmark-circle-outline" loading={busy} disabled={busy} onPress={verify} />

        <Button
          title={wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
          icon="refresh"
          variant="ghost"
          disabled={busy || wait > 0}
          onPress={resend}
        />

        <Text style={s.help}>
          Le SMS peut mettre quelques minutes à arriver. Vérifiez que le numéro est correct et que votre téléphone capte le réseau.
        </Text>

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
  help: { ...type.caption, color: color.textMuted, textAlign: 'center' },
});
